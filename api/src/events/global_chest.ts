import { pool } from "../db.js";

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
export async function recomputeGlobalChest(eventId: number) {
  const ev = await pool.query(
    `
    SELECT *
    FROM events
    WHERE type='global_chest'
      AND state='live'
      AND start_at <= NOW() AND NOW() < end_at
    ORDER BY start_at DESC
    LIMIT 1
    `
  );
  const e = ev.rows?.[0];
  if (!e) return { ok: false as const, error: "missing" as const };
  if (String(e.type) !== "global_chest") return { ok: false as const, error: "wrong_type" as const };
  if (String(e.state) !== "live") return { ok: true as const, skipped: "not_live" as const };

  await pool.query(`DELETE FROM event_scores WHERE event_id=$1`, [eventId]);

  await pool.query(
    `
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
    `,
    [
      eventId,
      e.start_at,
      e.end_at,
      GLOBAL_CHEST_SCORING.MINUTE_CAP_PER_DAY,
      GLOBAL_CHEST_SCORING.MINUTE,
      GLOBAL_CHEST_SCORING.CLAIM,
      GLOBAL_CHEST_SCORING.CALL,
      GLOBAL_CHEST_SCORING.CHAT,
      GLOBAL_CHEST_SCORING.SPIN,
    ]
  );

  return { ok: true as const };
}
