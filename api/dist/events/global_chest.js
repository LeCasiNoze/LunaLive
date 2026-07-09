import { pool } from "../db.js";
import { earnRubisTx } from "../wallet_engine.js";
const TZ = "Europe/Paris";
// Barème simplifié (mix activité gratuite + dépôts rubis, cf
// docs/events-design.md #4). Contrairement à viewer_week, une seule source
// (watch) est plafonnée par jour : l'event dure une semaine et le but est
// juste d'empêcher le farm AFK, pas de reproduire tout le barème viewer.
// Ajustable.
export const GLOBAL_CHEST_SCORING = {
    MINUTE: 1,
    MINUTE_CAP_PER_DAY: 60,
    CLAIM: 10,
    CALL: 5,
    CHAT: 2,
    SPIN: 5,
};
const NOT_BANNED_SQL = `
  NOT EXISTS (
    SELECT 1
    FROM site_user_bans b
    WHERE b.user_id = x.user_id
      AND b.revoked_at IS NULL
      AND (b.until IS NULL OR b.until > NOW())
  )
`;
/**
 * Recompute simple (pattern wheel_week.ts) : contribution = activité gratuite
 * (watch/claims/calls/chat/spins, pas de colonnes dédiées, tout dans
 * `detail`) + dépôts rubis (event_chest_deposits, sink). Les dépôts ne sont
 * jamais "effacés" par ce recompute : ils sont re-sommés depuis leur table
 * source à chaque appel, comme l'activité. La barre communautaire = SUM des
 * points de event_scores pour cet event.
 */
export async function recomputeGlobalChest(eventId) {
    const ev = await pool.query(`
    SELECT *
    FROM events
    WHERE type='global_chest'
      AND state='live'
      AND start_at <= NOW() AND NOW() < end_at
    ORDER BY start_at DESC
    LIMIT 1
    `);
    const e = ev.rows?.[0];
    if (!e)
        return { ok: false, error: "missing" };
    if (String(e.type) !== "global_chest")
        return { ok: false, error: "wrong_type" };
    if (String(e.state) !== "live")
        return { ok: true, skipped: "not_live" };
    await pool.query(`DELETE FROM event_scores WHERE event_id=$1`, [eventId]);
    await pool.query(`
    WITH activity AS (
      SELECT user_id, SUM(pts)::int AS pts
      FROM (
        SELECT user_id, SUM(LEAST(cnt, $4::int) * $5::int)::int AS pts
        FROM (
          SELECT svm.user_id,
                 (svm.bucket_ts AT TIME ZONE '${TZ}')::date AS day,
                 COUNT(DISTINCT svm.bucket_ts)::int AS cnt
          FROM stream_viewer_minutes svm
          WHERE svm.user_id IS NOT NULL AND svm.user_id > 0
            AND svm.bucket_ts >= $2::timestamptz AND svm.bucket_ts < $3::timestamptz
          GROUP BY svm.user_id, day
        ) per_day
        GROUP BY user_id

        UNION ALL

        SELECT dbc.user_id, (COUNT(*) * $6::int)::int AS pts
        FROM daily_bonus_claims dbc
        WHERE dbc.user_id > 0
          AND dbc.created_at >= $2::timestamptz AND dbc.created_at < $3::timestamptz
        GROUP BY dbc.user_id

        UNION ALL

        SELECT ca.user_id, (COUNT(*) * $7::int)::int AS pts
        FROM calls_actions ca
        WHERE ca.user_id > 0
          AND ca.created_at >= $2::timestamptz AND ca.created_at < $3::timestamptz
        GROUP BY ca.user_id

        UNION ALL

        SELECT cm.user_id, (COUNT(*) * $8::int)::int AS pts
        FROM chat_messages cm
        WHERE cm.deleted_at IS NULL AND cm.user_id > 0
          AND cm.created_at >= $2::timestamptz AND cm.created_at < $3::timestamptz
        GROUP BY cm.user_id

        UNION ALL

        SELECT w.user_id, (COUNT(*) * $9::int)::int AS pts
        FROM daily_wheel_spins w
        WHERE w.user_id > 0
          AND w.created_at >= $2::timestamptz AND w.created_at < $3::timestamptz
        GROUP BY w.user_id
      ) src
      GROUP BY user_id
    ),
    deposits AS (
      SELECT ecd.user_id, SUM(ecd.rubis)::int AS deposited
      FROM event_chest_deposits ecd
      WHERE ecd.event_id = $1
      GROUP BY ecd.user_id
    ),
    combined AS (
      SELECT
        COALESCE(a.user_id, d.user_id) AS user_id,
        (COALESCE(a.pts, 0) + COALESCE(d.deposited, 0))::int AS points,
        jsonb_build_object('activity', COALESCE(a.pts, 0), 'deposited', COALESCE(d.deposited, 0)) AS detail
      FROM activity a
      FULL OUTER JOIN deposits d ON d.user_id = a.user_id
    )
    INSERT INTO event_scores (event_id, user_id, points, detail, updated_at)
    SELECT $1::bigint, x.user_id::int, x.points, x.detail, NOW()
    FROM combined x
    WHERE ${NOT_BANNED_SQL}
    `, [
        eventId,
        e.start_at,
        e.end_at,
        GLOBAL_CHEST_SCORING.MINUTE_CAP_PER_DAY,
        GLOBAL_CHEST_SCORING.MINUTE,
        GLOBAL_CHEST_SCORING.CLAIM,
        GLOBAL_CHEST_SCORING.CALL,
        GLOBAL_CHEST_SCORING.CHAT,
        GLOBAL_CHEST_SCORING.SPIN,
    ]);
    return { ok: true };
}
// Contribution minimale (activité + dépôts) pour pouvoir réclamer un palier ou
// toucher le badge de clôture — anti free-rider. Même seuil que
// EVENT_REWARD_CONFIGS.global_chest.collective.minContribution.
export const CHEST_MIN_CONTRIBUTION = 50;
// Paliers COLLECTIFS escaladants (seuil = total communautaire, PAS les points
// perso — c'est toute la différence avec viewer_week). Chaque contributeur
// (≥ CHEST_MIN_CONTRIBUTION) peut réclamer une fois chaque palier franchi par
// la commu. Réclamé EN DIRECT (comme la roue/viewer), pas à la clôture.
// Réutilise la table générique event_palier_claims. Calibré modeste (petite
// commu) : rubis volontairement bas + tickets de roue (engagement) — le vrai
// enjeu prestige (skin top-3) est distribué à la clôture, cf distributeCollective.
export const CHEST_PALIERS = [
    { index: 0, threshold: 1000, rubis: 30, wheelTickets: 0, label: "30 rubis" },
    { index: 1, threshold: 2500, rubis: 50, wheelTickets: 1, label: "50 rubis + 1 ticket de roue" },
    { index: 2, threshold: 5000, rubis: 70, wheelTickets: 2, label: "70 rubis + 2 tickets de roue" },
    { index: 3, threshold: 8000, rubis: 100, wheelTickets: 2, label: "100 rubis + 2 tickets de roue" },
];
export async function getChestPaliersState(eventId, userId) {
    const totalRes = await pool.query(`SELECT COALESCE(SUM(points),0)::int AS total FROM event_scores WHERE event_id=$1`, [eventId]);
    const communityTotal = Number(totalRes.rows?.[0]?.total ?? 0);
    let myContribution = 0;
    let claimed = [];
    if (userId) {
        const me = await pool.query(`SELECT COALESCE(points,0)::int AS pts FROM event_scores WHERE event_id=$1 AND user_id=$2`, [eventId, userId]);
        myContribution = Number(me.rows?.[0]?.pts ?? 0);
        const claimsRes = await pool.query(`SELECT palier_index FROM event_palier_claims WHERE event_id=$1 AND user_id=$2`, [eventId, userId]);
        claimed = (claimsRes.rows || []).map((r) => Number(r.palier_index));
    }
    return { communityTotal, myContribution, claimed };
}
// Réclame tous les paliers collectifs franchis (communityTotal ≥ threshold) que
// ce contributeur n'a pas encore récupérés. Miroir de claimViewerPaliers, mais
// le seuil est COMMUNAUTAIRE et gaté par une contribution perso minimale.
export async function claimChestPalier(eventId, userId) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const totalRes = await client.query(`SELECT COALESCE(SUM(points),0)::int AS total FROM event_scores WHERE event_id=$1`, [eventId]);
        const communityTotal = Number(totalRes.rows?.[0]?.total ?? 0);
        const mineRes = await client.query(`SELECT COALESCE(points,0)::int AS pts FROM event_scores WHERE event_id=$1 AND user_id=$2`, [eventId, userId]);
        const myContribution = Number(mineRes.rows?.[0]?.pts ?? 0);
        const newly = [];
        // Anti free-rider : il faut avoir soi-même contribué au coffre commun.
        if (myContribution >= CHEST_MIN_CONTRIBUTION) {
            const already = await client.query(`SELECT palier_index FROM event_palier_claims WHERE event_id=$1 AND user_id=$2`, [eventId, userId]);
            const claimed = new Set((already.rows || []).map((r) => Number(r.palier_index)));
            for (const p of CHEST_PALIERS) {
                if (communityTotal < p.threshold || claimed.has(p.index))
                    continue;
                const ins = await client.query(`INSERT INTO event_palier_claims (event_id, user_id, palier_index) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING 1`, [eventId, userId, p.index]);
                if ((ins.rowCount ?? 0) === 0)
                    continue; // course concurrente
                if (p.rubis > 0) {
                    await earnRubisTx(client, userId, "event_platform", p.rubis, { purpose: "event_palier", eventId, eventType: "global_chest", palier: p.index });
                }
                if (p.wheelTickets > 0) {
                    await client.query(`INSERT INTO user_event_tickets (user_id, amount) VALUES ($1, LEAST($2,50))
             ON CONFLICT (user_id) DO UPDATE SET amount = LEAST(user_event_tickets.amount + $2, 50)`, [userId, p.wheelTickets]);
                }
                newly.push({ index: p.index, label: p.label });
            }
        }
        await client.query("COMMIT");
        return newly;
    }
    catch (e) {
        try {
            await client.query("ROLLBACK");
        }
        catch { }
        throw e;
    }
    finally {
        client.release();
    }
}
