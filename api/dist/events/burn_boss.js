import { pool } from "../db.js";
import { EVENT_REWARD_CONFIGS } from "./rewards.js";
import { notEventExcludedStreamerSql } from "./eligibility.js";
const TZ = "Europe/Paris";
// Barème IDENTIQUE à global_chest.ts (cf docs/events-design.md #5 — le burn
// de rubis est un ACCÉLÉRATEUR de dégâts, pas la seule voie : l'activité
// gratuite doit rester la source principale pour que les joueurs sans rubis
// participent). Dupliqué plutôt que réutilisé : chaque event garde son
// barème indépendant (cf global_chest.ts vs viewer_week.ts).
export const BURN_BOSS_SCORING = {
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
 * Recompute (pattern global_chest.ts) : dégâts = activité gratuite
 * (watch/claims/calls/chat/spins, mêmes colonnes que global_chest, tout dans
 * `detail`) + burns rubis (event_boss_damage, sink) × ratio configurable
 * (EVENT_REWARD_CONFIGS.burn_boss.boss.ratio). Les burns ne sont jamais
 * "effacés" par ce recompute : ils sont re-sommés depuis leur table source à
 * chaque appel, comme l'activité. Les HP du boss = SUM des points de
 * event_scores pour cet event (cf rewards.ts distributeBoss).
 */
export async function recomputeBurnBoss(eventId) {
    const ev = await pool.query(`
    SELECT *
    FROM events
    WHERE type='burn_boss'
      AND state='live'
      AND start_at <= NOW() AND NOW() < end_at
    ORDER BY start_at DESC
    LIMIT 1
    `);
    const e = ev.rows?.[0];
    if (!e)
        return { ok: false, error: "missing" };
    if (String(e.type) !== "burn_boss")
        return { ok: false, error: "wrong_type" };
    if (String(e.state) !== "live")
        return { ok: true, skipped: "not_live" };
    const config = EVENT_REWARD_CONFIGS.burn_boss;
    const ratio = config?.mode === "boss" ? config.boss.ratio : 1;
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
            AND ${notEventExcludedStreamerSql("svm.streamer_id")}
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
    burns AS (
      SELECT ebd.user_id, SUM(ebd.rubis)::int AS burned
      FROM event_boss_damage ebd
      WHERE ebd.event_id = $1
      GROUP BY ebd.user_id
    ),
    combined AS (
      SELECT
        COALESCE(a.user_id, b.user_id) AS user_id,
        (COALESCE(a.pts, 0) + COALESCE(b.burned, 0) * $10::int)::int AS points,
        jsonb_build_object(
          'activity', COALESCE(a.pts, 0),
          'burned', COALESCE(b.burned, 0),
          'damage', COALESCE(b.burned, 0) * $10::int
        ) AS detail
      FROM activity a
      FULL OUTER JOIN burns b ON b.user_id = a.user_id
    )
    INSERT INTO event_scores (event_id, user_id, points, detail, updated_at)
    SELECT $1::bigint, x.user_id::int, x.points, x.detail, NOW()
    FROM combined x
    WHERE ${NOT_BANNED_SQL}
    `, [
        eventId,
        e.start_at,
        e.end_at,
        BURN_BOSS_SCORING.MINUTE_CAP_PER_DAY,
        BURN_BOSS_SCORING.MINUTE,
        BURN_BOSS_SCORING.CLAIM,
        BURN_BOSS_SCORING.CALL,
        BURN_BOSS_SCORING.CHAT,
        BURN_BOSS_SCORING.SPIN,
        ratio,
    ]);
    return { ok: true };
}
