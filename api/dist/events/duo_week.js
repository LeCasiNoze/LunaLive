import { pool } from "../db.js";
const TZ = "Europe/Paris";
// Fenêtre d'audience utilisée pour L'APPARIEMENT (proposeDuos) : indépendante
// de la fenêtre de l'event lui-même — le duo doit se calculer sur
// l'historique d'audience RÉCENT, pas sur la semaine qui vient de démarrer
// où il n'y a encore aucune donnée. Cf docs/events-design.md #6.
const SHARED_AUDIENCE_WINDOW_DAYS = 30;
// Barème d'activité SIMPLE pour la commu d'un duo (cf docs/events-design.md
// #6 — "actions combinées des deux commus"). Même famille que
// GLOBAL_CHEST_SCORING / BURN_BOSS_SCORING (watch cap/jour + claim + call +
// chat), sans spin : un duo n'a pas de mécanique de roue dédiée. Dupliqué
// plutôt que réutilisé, comme les autres events collectifs (cf burn_boss.ts
// : "chaque event garde son barème indépendant").
export const DUO_WEEK_SCORING = {
    MINUTE: 1,
    MINUTE_CAP_PER_DAY: 60,
    CLAIM: 10,
    CALL: 5,
    CHAT: 2,
};
/**
 * Pour chaque paire de streamers ayant eu de l'audience sur les
 * SHARED_AUDIENCE_WINDOW_DAYS derniers jours, compte les viewers COMMUNS
 * (comptes ayant regardé les deux). Self-join sur l'audience distincte
 * (streamer_id, user_id) — `b.streamer_id > a.streamer_id` évite les
 * doublons symétriques (A,B)/(B,A). Trié desc : base de l'appariement
 * glouton (proposeDuos) et du refresh (refreshDuoForStreamer).
 */
export async function computeSharedAudience(windowDays = SHARED_AUDIENCE_WINDOW_DAYS) {
    const r = await pool.query(`
    WITH audience AS (
      SELECT DISTINCT streamer_id, user_id
      FROM stream_viewer_minutes
      WHERE user_id IS NOT NULL AND user_id > 0
        AND bucket_ts >= NOW() - ($1::int * INTERVAL '1 day')
    )
    SELECT a.streamer_id AS streamer_a_id, b.streamer_id AS streamer_b_id, COUNT(*)::int AS shared_viewers
    FROM audience a
    JOIN audience b ON b.user_id = a.user_id AND b.streamer_id > a.streamer_id
    GROUP BY a.streamer_id, b.streamer_id
    ORDER BY shared_viewers DESC, a.streamer_id ASC, b.streamer_id ASC
    `, [windowDays]);
    return (r.rows || []).map((row) => ({
        streamerAId: Number(row.streamer_a_id),
        streamerBId: Number(row.streamer_b_id),
        sharedViewers: Number(row.shared_viewers || 0),
    }));
}
/**
 * Appariement GLOUTON : parcourt les paires triées par audience commune desc,
 * associe chaque streamer à un seul duo (un streamer déjà pris est ignoré
 * pour la suite). Idempotent : si des duos existent déjà pour l'event, ne
 * refait rien — appelé à chaque tick tant que l'event est live (engine.ts),
 * donc pas besoin de détecter explicitement "le 1er tick".
 * Streamers impairs / sans audience commune avec personne restent non
 * appariés — loggé, pas d'erreur (cf docs/events-design.md #6).
 */
export async function proposeDuos(eventId) {
    const existing = await pool.query(`SELECT 1 FROM event_duos WHERE event_id=$1 LIMIT 1`, [eventId]);
    if ((existing.rowCount ?? 0) > 0)
        return { ok: true, skipped: "already_proposed" };
    const pairs = await computeSharedAudience();
    const assigned = new Set();
    const duos = [];
    for (const p of pairs) {
        if (assigned.has(p.streamerAId) || assigned.has(p.streamerBId))
            continue;
        duos.push({ a: p.streamerAId, b: p.streamerBId, shared: p.sharedViewers });
        assigned.add(p.streamerAId);
        assigned.add(p.streamerBId);
    }
    for (const d of duos) {
        await pool.query(`
      INSERT INTO event_duos (event_id, streamer_a_id, streamer_b_id, status, shared_viewers)
      VALUES ($1,$2,$3,'proposed',$4)
      ON CONFLICT (event_id, streamer_a_id) DO NOTHING
      `, [eventId, d.a, d.b, d.shared]);
    }
    const activeRes = await pool.query(`
    SELECT DISTINCT streamer_id
    FROM stream_viewer_minutes
    WHERE user_id IS NOT NULL AND user_id > 0
      AND bucket_ts >= NOW() - ($1::int * INTERVAL '1 day')
    `, [SHARED_AUDIENCE_WINDOW_DAYS]);
    const active = (activeRes.rows || []).map((row) => Number(row.streamer_id));
    const unmatched = active.filter((id) => !assigned.has(id));
    if (unmatched.length) {
        console.warn("[duo_week] streamers non appariés (impairs ou sans audience commune) :", unmatched);
    }
    return { ok: true, duos: duos.length, unmatched: unmatched.length };
}
/**
 * Recompute (pattern global_chest.ts / burn_boss.ts) : pour chaque duo de
 * l'event, points = activité combinée des deux COMMUS. "Commu d'un
 * streamer" = viewers dont le streamer le PLUS REGARDÉ (le plus de minutes
 * distinctes) sur la fenêtre de l'event est ce streamer — CTE home_streamer
 * (DISTINCT ON). Un viewer qui ne regarde ni A ni B en priorité ne compte
 * pour aucun des deux, même s'il les a un peu croisés : anti-dilution, évite
 * qu'un gros viewer d'un streamer tiers gonfle artificiellement un duo qu'il
 * ne suit pas vraiment.
 */
export async function recomputeDuoWeek(eventId) {
    const ev = await pool.query(`
    SELECT *
    FROM events
    WHERE type='duo_week'
      AND state='live'
      AND start_at <= NOW() AND NOW() < end_at
    ORDER BY start_at DESC
    LIMIT 1
    `);
    const e = ev.rows?.[0];
    if (!e)
        return { ok: false, error: "missing" };
    if (String(e.type) !== "duo_week")
        return { ok: false, error: "wrong_type" };
    if (String(e.state) !== "live")
        return { ok: true, skipped: "not_live" };
    await pool.query(`DELETE FROM event_duo_scores WHERE event_id=$1`, [eventId]);
    await pool.query(`
    WITH minutes_per_user_streamer AS (
      SELECT svm.user_id, svm.streamer_id, COUNT(DISTINCT svm.bucket_ts)::int AS minutes
      FROM stream_viewer_minutes svm
      WHERE svm.user_id IS NOT NULL AND svm.user_id > 0
        AND svm.bucket_ts >= $2::timestamptz AND svm.bucket_ts < $3::timestamptz
      GROUP BY svm.user_id, svm.streamer_id
    ),
    home_streamer AS (
      SELECT DISTINCT ON (user_id) user_id, streamer_id
      FROM minutes_per_user_streamer
      ORDER BY user_id, minutes DESC, streamer_id ASC
    ),
    duo_members AS (
      SELECT ed.id AS duo_id, hs.user_id,
             CASE WHEN hs.streamer_id = ed.streamer_a_id THEN 'a' ELSE 'b' END AS side
      FROM event_duos ed
      JOIN home_streamer hs
        ON hs.streamer_id = ed.streamer_a_id OR hs.streamer_id = ed.streamer_b_id
      WHERE ed.event_id = $1
    ),
    activity AS (
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
      ) src
      GROUP BY user_id
    ),
    per_duo_side AS (
      SELECT dm.duo_id, dm.side,
             COALESCE(SUM(a.pts), 0)::int AS pts,
             COUNT(*)::int AS members
      FROM duo_members dm
      LEFT JOIN activity a ON a.user_id = dm.user_id
      GROUP BY dm.duo_id, dm.side
    ),
    per_duo AS (
      SELECT duo_id,
             COALESCE(SUM(pts) FILTER (WHERE side='a'), 0)::int AS a_pts,
             COALESCE(SUM(pts) FILTER (WHERE side='b'), 0)::int AS b_pts,
             COALESCE(SUM(members) FILTER (WHERE side='a'), 0)::int AS a_members,
             COALESCE(SUM(members) FILTER (WHERE side='b'), 0)::int AS b_members
      FROM per_duo_side
      GROUP BY duo_id
    )
    INSERT INTO event_duo_scores (event_id, duo_id, points, detail, updated_at)
    SELECT $1::bigint, pd.duo_id, (pd.a_pts + pd.b_pts)::int,
           jsonb_build_object(
             'streamerAPts', pd.a_pts,
             'streamerBPts', pd.b_pts,
             'members', jsonb_build_object('streamerA', pd.a_members, 'streamerB', pd.b_members)
           ),
           NOW()
    FROM per_duo pd
    `, [
        eventId,
        e.start_at,
        e.end_at,
        DUO_WEEK_SCORING.MINUTE_CAP_PER_DAY,
        DUO_WEEK_SCORING.MINUTE,
        DUO_WEEK_SCORING.CLAIM,
        DUO_WEEK_SCORING.CALL,
        DUO_WEEK_SCORING.CHAT,
    ]);
    return { ok: true };
}
/**
 * Classement des duos (points desc). `db` accepte pool OU client de
 * transaction — utilisé à la fois par la route publique et par distributeDuo
 * dans rewards.ts (même pattern que clip_race.ts getRankedClips).
 */
export async function getRankedDuos(db, eventId, limit = 20) {
    const r = await db.query(`
    SELECT
      ed.id AS duo_id, ed.status, ed.shared_viewers, ed.refreshed_count,
      sa.id AS a_id, sa.slug AS a_slug, sa.display_name AS a_name, sa.user_id AS a_user_id,
      sb.id AS b_id, sb.slug AS b_slug, sb.display_name AS b_name, sb.user_id AS b_user_id,
      COALESCE(eds.points, 0)::int AS points
    FROM event_duos ed
    JOIN streamers sa ON sa.id = ed.streamer_a_id
    LEFT JOIN streamers sb ON sb.id = ed.streamer_b_id
    LEFT JOIN event_duo_scores eds ON eds.event_id = ed.event_id AND eds.duo_id = ed.id
    WHERE ed.event_id = $1
    ORDER BY COALESCE(eds.points, 0) DESC, ed.id ASC
    LIMIT $2
    `, [eventId, limit]);
    return (r.rows || []).map((row, idx) => ({
        rank: idx + 1,
        duoId: Number(row.duo_id),
        streamerAId: Number(row.a_id),
        streamerASlug: String(row.a_slug || ""),
        streamerADisplayName: String(row.a_name || ""),
        streamerAUserId: row.a_user_id != null ? Number(row.a_user_id) : null,
        streamerBId: row.b_id != null ? Number(row.b_id) : null,
        streamerBSlug: row.b_slug != null ? String(row.b_slug) : null,
        streamerBDisplayName: row.b_name != null ? String(row.b_name) : null,
        streamerBUserId: row.b_user_id != null ? Number(row.b_user_id) : null,
        status: String(row.status || "proposed"),
        sharedViewers: Number(row.shared_viewers || 0),
        refreshedCount: Number(row.refreshed_count || 0),
        points: Number(row.points || 0),
    }));
}
export async function acceptDuoForStreamer(eventId, streamerId) {
    const r = await pool.query(`
    UPDATE event_duos
    SET status='accepted'
    WHERE event_id=$1 AND (streamer_a_id=$2 OR streamer_b_id=$2)
    RETURNING *
    `, [eventId, streamerId]);
    return r.rows?.[0] ?? null;
}
/**
 * "1 seul refresh autorisé si refus (→ 2ᵉ streamer le plus commun)" (cf
 * docs/events-design.md #6). Le côté du streamer demandeur (a ou b) est
 * conservé ; seul l'AUTRE côté change, vers le partenaire au 2e score
 * d'audience commune le plus haut PARMI CEUX PAS DÉJÀ PRIS dans un autre duo
 * de l'event. L'ancien partenaire redevient simplement non apparié — pas de
 * re-matching en cascade, hors scope MVP (cf docs/events-design.md — chiffres
 * et mécaniques fines à affiner event par event).
 */
export async function refreshDuoForStreamer(eventId, streamerId) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [eventId]);
        const dRes = await client.query(`SELECT * FROM event_duos WHERE event_id=$1 AND (streamer_a_id=$2 OR streamer_b_id=$2) LIMIT 1`, [eventId, streamerId]);
        const duo = dRes.rows?.[0];
        if (!duo) {
            await client.query("ROLLBACK");
            return { ok: false, error: "no_duo" };
        }
        if (Number(duo.refreshed_count) >= 1) {
            await client.query("ROLLBACK");
            return { ok: false, error: "refresh_used" };
        }
        const isA = Number(duo.streamer_a_id) === streamerId;
        const usedRes = await client.query(`SELECT streamer_a_id, streamer_b_id FROM event_duos WHERE event_id=$1 AND id <> $2`, [eventId, duo.id]);
        const used = new Set([streamerId]);
        if (duo.streamer_a_id != null)
            used.add(Number(duo.streamer_a_id));
        if (duo.streamer_b_id != null)
            used.add(Number(duo.streamer_b_id));
        for (const row of usedRes.rows || []) {
            if (row.streamer_a_id != null)
                used.add(Number(row.streamer_a_id));
            if (row.streamer_b_id != null)
                used.add(Number(row.streamer_b_id));
        }
        const pairs = await computeSharedAudience();
        const candidate = pairs
            .filter((p) => p.streamerAId === streamerId || p.streamerBId === streamerId)
            .map((p) => ({
            partnerId: p.streamerAId === streamerId ? p.streamerBId : p.streamerAId,
            shared: p.sharedViewers,
        }))
            .filter((p) => !used.has(p.partnerId))
            .sort((x, y) => y.shared - x.shared)[0];
        if (!candidate) {
            await client.query("ROLLBACK");
            return { ok: false, error: "no_candidate" };
        }
        const updateSql = isA
            ? `UPDATE event_duos SET streamer_b_id=$3, shared_viewers=$4, refreshed_count=refreshed_count+1, status='refreshed' WHERE id=$1 AND event_id=$2 RETURNING *`
            : `UPDATE event_duos SET streamer_a_id=$3, shared_viewers=$4, refreshed_count=refreshed_count+1, status='refreshed' WHERE id=$1 AND event_id=$2 RETURNING *`;
        const updated = await client.query(updateSql, [duo.id, eventId, candidate.partnerId, candidate.shared]);
        await client.query("COMMIT");
        return { ok: true, duo: updated.rows[0] };
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
