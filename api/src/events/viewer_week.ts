import { pool } from "../db.js";

const TZ = "Europe/Paris";

// Barème + caps (facile à modifier)
export const VIEWER_WEEK = {
  TOP_N: 10,
  P: {
    MINUTE: 1,
    CLAIM: 25,
    WHEEL: 10,
    PRED_JOIN: 10,
    PRED_WIN: 25,
    CALL: 5,
    CHAT: 1, // (pas branché MVP)
  },
  CAP_PER_DAY: {
    CHAT: 30,      // (pas branché MVP)
    WHEEL: 5,
    PRED_JOIN: 3,
    PRED_WIN: 1,
    CALL: 20,
  },
};

function sqlDateParis(expr: string) {
  return `(${expr} AT TIME ZONE '${TZ}')::date`;
}

const NOT_BANNED_SQL = `
  NOT EXISTS (
    SELECT 1
    FROM site_user_bans b
    WHERE b.user_id = svm.user_id
      AND b.revoked_at IS NULL
      AND (b.until IS NULL OR b.until > NOW())
  )
`;

export async function recomputeViewerWeek(eventId: number) {
  // charge fenêtre + type
  const ev = await pool.query(
    `SELECT id, type, state, start_at, end_at
     FROM events
     WHERE id=$1
     LIMIT 1`,
    [eventId]
  );
  const e = ev.rows?.[0];
  if (!e) return { ok: false as const, error: "missing" as const };
  if (String(e.type) !== "viewer_week") return { ok: false as const, error: "wrong_type" as const };
  if (String(e.state) !== "live") return { ok: true as const, skipped: "not_live" as const };

  // weekStartDate Paris (DATE)
  const wk = await pool.query(
    `SELECT ${sqlDateParis("$1::timestamptz")} AS d0`,
    [e.start_at]
  );
  const d0 = String(wk.rows?.[0]?.d0); // YYYY-MM-DD

  // d7 = d0 + 7 days (exclusive)
  // (on filtre day >= d0 AND day < d0 + 7)
  // -----------------------------
  // Minutes points (1 point / minute active)
  // Eligible = user_id NOT NULL + welcome_rewards exists
  // -----------------------------
  // Pour limiter, on supprime puis re-insert (safe MVP).
  await pool.query(`DELETE FROM event_scores_viewer_week WHERE event_id=$1`, [eventId]);

  // Minutes
  await pool.query(
    `
    INSERT INTO event_scores_viewer_week(event_id, user_id, points, minutes_points, updated_at)
    SELECT
        $1::bigint AS event_id,
        svm.user_id::bigint AS user_id,
        COUNT(*)::int * $2::int AS points,
        COUNT(*)::int * $2::int AS minutes_points,
        NOW()
    FROM stream_viewer_minutes svm
    JOIN welcome_rewards wr ON wr.user_id = svm.user_id
    WHERE svm.user_id IS NOT NULL
        AND svm.bucket_ts >= $3::timestamptz
        AND svm.bucket_ts <  $4::timestamptz
        AND NOT EXISTS (
        SELECT 1
        FROM site_user_bans b
        WHERE b.user_id = svm.user_id
            AND b.revoked_at IS NULL
            AND (b.until IS NULL OR b.until > NOW())
        )
    GROUP BY svm.user_id
    `,
    [eventId, VIEWER_WEEK.P.MINUTE, e.start_at, e.end_at]
    );

  // Claims (daily_bonus_claims.day already Paris)
  await pool.query(
    `
    UPDATE event_scores_viewer_week s
    SET
      claim_points = x.pts,
      points = points + x.pts,
      updated_at = NOW()
    FROM (
      SELECT c.user_id::bigint AS user_id,
             (COUNT(*)::int * $2::int) AS pts
      FROM daily_bonus_claims c
      JOIN welcome_rewards wr ON wr.user_id = c.user_id
      WHERE c.day >= $3::date
        AND c.day < ($3::date + INTERVAL '7 days')
      GROUP BY c.user_id
    ) x
    WHERE s.event_id=$1 AND s.user_id=x.user_id
    `,
    [eventId, VIEWER_WEEK.P.CLAIM, d0]
  );

  // Wheel (cap 5/day) via daily_wheel_spins.day
  await pool.query(
    `
    UPDATE event_scores_viewer_week s
    SET
      wheel_points = x.pts,
      points = points + x.pts,
      updated_at = NOW()
    FROM (
      SELECT user_id::bigint AS user_id,
             SUM(LEAST(cnt, $2::int) * $3::int)::int AS pts
      FROM (
        SELECT w.user_id, w.day, COUNT(*)::int AS cnt
        FROM daily_wheel_spins w
        JOIN welcome_rewards wr ON wr.user_id = w.user_id
        WHERE w.day >= $4::date
          AND w.day < ($4::date + INTERVAL '7 days')
        GROUP BY w.user_id, w.day
      ) per_day
      GROUP BY user_id
    ) x
    WHERE s.event_id=$1 AND s.user_id=x.user_id
    `,
    [eventId, VIEWER_WEEK.CAP_PER_DAY.WHEEL, VIEWER_WEEK.P.WHEEL, d0]
  );

  // Calls (cap 20/day) via calls_actions.created_at
  await pool.query(
    `
    UPDATE event_scores_viewer_week s
    SET
      calls_points = x.pts,
      points = points + x.pts,
      updated_at = NOW()
    FROM (
      SELECT user_id::bigint AS user_id,
             SUM(LEAST(cnt, $2::int) * $3::int)::int AS pts
      FROM (
        SELECT ca.user_id,
               ${sqlDateParis("ca.created_at")} AS day,
               COUNT(*)::int AS cnt
        FROM calls_actions ca
        JOIN welcome_rewards wr ON wr.user_id = ca.user_id
        WHERE ca.created_at >= $4::timestamptz
          AND ca.created_at <  $5::timestamptz
        GROUP BY ca.user_id, day
      ) per_day
      GROUP BY user_id
    ) x
    WHERE s.event_id=$1 AND s.user_id=x.user_id
    `,
    [eventId, VIEWER_WEEK.CAP_PER_DAY.CALL, VIEWER_WEEK.P.CALL, e.start_at, e.end_at]
  );

  // Predictions join (cap 3/day) via prediction_bets.created_at
  await pool.query(
    `
    UPDATE event_scores_viewer_week s
    SET
      pred_join_points = x.pts,
      points = points + x.pts,
      updated_at = NOW()
    FROM (
      SELECT user_id::bigint AS user_id,
             SUM(LEAST(cnt, $2::int) * $3::int)::int AS pts
      FROM (
        SELECT b.user_id,
               ${sqlDateParis("b.created_at")} AS day,
               COUNT(*)::int AS cnt
        FROM prediction_bets b
        JOIN welcome_rewards wr ON wr.user_id = b.user_id
        WHERE b.created_at >= $4::timestamptz
          AND b.created_at <  $5::timestamptz
        GROUP BY b.user_id, day
      ) per_day
      GROUP BY user_id
    ) x
    WHERE s.event_id=$1 AND s.user_id=x.user_id
    `,
    [eventId, VIEWER_WEEK.CAP_PER_DAY.PRED_JOIN, VIEWER_WEEK.P.PRED_JOIN, e.start_at, e.end_at]
  );

  // Predictions win bonus (cap 1/day) : proxy via predictions.bets_close_at (close ~= resolve)
  await pool.query(
    `
    UPDATE event_scores_viewer_week s
    SET
      pred_win_points = x.pts,
      points = points + x.pts,
      updated_at = NOW()
    FROM (
      SELECT user_id::bigint AS user_id,
             SUM(LEAST(cnt, $2::int) * $3::int)::int AS pts
      FROM (
        SELECT b.user_id,
               ${sqlDateParis("p.bets_close_at")} AS day,
               COUNT(*)::int AS cnt
        FROM prediction_bets b
        JOIN predictions p ON p.id = b.prediction_id
        JOIN welcome_rewards wr ON wr.user_id = b.user_id
        WHERE p.status='resolved'
          AND p.resolved_option IS NOT NULL
          AND b.choice = p.resolved_option
          AND p.bets_close_at >= $4::timestamptz
          AND p.bets_close_at <  $5::timestamptz
        GROUP BY b.user_id, day
      ) per_day
      GROUP BY user_id
    ) x
    WHERE s.event_id=$1 AND s.user_id=x.user_id
    `,
    [eventId, VIEWER_WEEK.CAP_PER_DAY.PRED_WIN, VIEWER_WEEK.P.PRED_WIN, e.start_at, e.end_at]
  );

  return { ok: true as const };
}
