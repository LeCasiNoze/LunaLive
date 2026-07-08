import { pool } from "../db.js";

const TZ = "Europe/Paris";

// Barème + caps (facile à modifier). Les CAP_PER_DAY sont TOUJOURS des caps
// sur le NOMBRE d'unités qualifiées comptées par jour (Europe/Paris), pas un
// cap direct sur les points (même logique que roue/prédictions ci-dessous).
export const VIEWER_WEEK_SCORING = {
  TOP_N: 10,
  P: {
    MINUTE: 1,
    DAY_BONUS: 25, // +25 / jour distinct (Paris) avec >=1 activité — levier régularité
    CLAIM: 30,
    CHAT: 2,
    CALL: 8,
    WHEEL: 12,
    PRED_JOIN: 12,
    PRED_WIN: 30,
  },
  CAP_PER_DAY: {
    MINUTE: 90, // minutes distinctes/jour (anti-AFK)
    CHAT: 30, // messages/jour
    CALL: 80, // calls/jour
    WHEEL: 5,
    PRED_JOIN: 3,
    PRED_WIN: 1,
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
    `
    SELECT *
    FROM events
    WHERE type='viewer_week'
      AND state='live'
      AND start_at <= NOW() AND NOW() < end_at
    ORDER BY start_at DESC
    LIMIT 1
    `
  );
  const e = ev.rows?.[0];
  if (!e) return { ok: false as const, error: "missing" as const };
  if (String(e.type) !== "viewer_week") return { ok: false as const, error: "wrong_type" as const };
  if (String(e.state) !== "live") return { ok: true as const, skipped: "not_live" as const };

  // weekStartDate Paris (texte 'YYYY-MM-DD' — le driver pg parse un type DATE en
  // objet Date JS, donc on force to_char pour récupérer une vraie chaîne datée).
  const wk = await pool.query(
    `SELECT to_char(${sqlDateParis("$1::timestamptz")}, 'YYYY-MM-DD') AS d0`,
    [e.start_at]
  );
  const d0 = String(wk.rows?.[0]?.d0); // YYYY-MM-DD

  // d7 = d0 + 7 days (exclusive)
  // (on filtre day >= d0 AND day < d0 + 7)
  // -----------------------------
  // Pour limiter, on supprime puis re-insert (safe MVP).
  await pool.query(`DELETE FROM event_scores_viewer_week WHERE event_id=$1`, [eventId]);

  // ✅ Seed participants: toute personne qui a fait AU MOINS 1 action dans la fenêtre.
  // ⚠️ Plus de gate "welcome_rewards" ici : les points comptent pour TOUT LE MONDE.
  // L'éligibilité (follow + claim + 30min) ne filtre que le classement public et
  // les lots — cf events/eligibility.ts + events/rewards.ts.
  await pool.query(
    `
    INSERT INTO event_scores_viewer_week(event_id, user_id, points, updated_at)
    SELECT $1::bigint, x.user_id::bigint, 0, NOW()
    FROM (
      -- minutes
      SELECT svm.user_id
      FROM stream_viewer_minutes svm
      WHERE svm.user_id IS NOT NULL
        AND svm.bucket_ts >= $2::timestamptz
        AND svm.bucket_ts <  $3::timestamptz

      UNION
      -- claims (day Paris -> on borne par d0..d0+7)
      SELECT c.user_id
      FROM daily_bonus_claims c
      WHERE c.day >= $4::date
        AND c.day < ($4::date + INTERVAL '7 days')

      UNION
      -- wheel (day Paris)
      SELECT w.user_id
      FROM daily_wheel_spins w
      WHERE w.day >= $4::date
        AND w.day < ($4::date + INTERVAL '7 days')

      UNION
      -- calls (created_at)
      SELECT ca.user_id
      FROM calls_actions ca
      WHERE ca.created_at >= $2::timestamptz
        AND ca.created_at <  $3::timestamptz

      UNION
      -- preds join (created_at)
      SELECT b.user_id
      FROM prediction_bets b
      WHERE b.created_at >= $2::timestamptz
        AND b.created_at <  $3::timestamptz

      UNION
      -- preds win (bets_close_at)
      SELECT b.user_id
      FROM prediction_bets b
      JOIN predictions p ON p.id = b.prediction_id
      WHERE p.status='resolved'
        AND p.resolved_option IS NOT NULL
        AND b.choice = p.resolved_option
        AND p.bets_close_at >= $2::timestamptz
        AND p.bets_close_at <  $3::timestamptz

      UNION
      -- chat (created_at)
      SELECT cm.user_id
      FROM chat_messages cm
      WHERE cm.deleted_at IS NULL
        AND cm.created_at >= $2::timestamptz
        AND cm.created_at <  $3::timestamptz
    ) x
    WHERE x.user_id > 0  -- exclut le chat externe (Rumble bridgé, user_id<=0) : pas de vrai compte
      AND NOT EXISTS (
      SELECT 1
      FROM site_user_bans b
      WHERE b.user_id = x.user_id
        AND b.revoked_at IS NULL
        AND (b.until IS NULL OR b.until > NOW())
    )
    ON CONFLICT (event_id, user_id) DO NOTHING
    `,
    [eventId, e.start_at, e.end_at, d0]
  );

  // Minutes (cap = minutes DISTINCTES/jour, anti-farm multi-live simultané)
  await pool.query(
    `
    UPDATE event_scores_viewer_week s
    SET
      minutes_points = x.pts,
      points = points + x.pts,
      updated_at = NOW()
    FROM (
      SELECT user_id::bigint AS user_id,
             SUM(LEAST(cnt, $2::int) * $3::int)::int AS pts
      FROM (
        SELECT svm.user_id,
               ${sqlDateParis("svm.bucket_ts")} AS day,
               COUNT(DISTINCT svm.bucket_ts)::int AS cnt
        FROM stream_viewer_minutes svm
        WHERE svm.user_id IS NOT NULL
          AND svm.bucket_ts >= $4::timestamptz
          AND svm.bucket_ts <  $5::timestamptz
          AND ${NOT_BANNED_SQL}
        GROUP BY svm.user_id, day
      ) per_day
      GROUP BY user_id
    ) x
    WHERE s.event_id=$1 AND s.user_id=x.user_id
    `,
    [eventId, VIEWER_WEEK_SCORING.CAP_PER_DAY.MINUTE, VIEWER_WEEK_SCORING.P.MINUTE, e.start_at, e.end_at]
  );

  // Bonus "jour actif" : +25 par jour distinct (Paris) avec >=1 activité
  // (watch minute OU claim OU wheel OU call OU prédiction OU chat).
  await pool.query(
    `
    UPDATE event_scores_viewer_week s
    SET
      day_bonus_points = x.pts,
      points = points + x.pts,
      updated_at = NOW()
    FROM (
      SELECT user_id::bigint AS user_id,
             COUNT(*)::int * $2::int AS pts
      FROM (
        SELECT svm.user_id, ${sqlDateParis("svm.bucket_ts")} AS day
        FROM stream_viewer_minutes svm
        WHERE svm.user_id IS NOT NULL
          AND svm.bucket_ts >= $3::timestamptz
          AND svm.bucket_ts <  $4::timestamptz

        UNION
        SELECT c.user_id, c.day
        FROM daily_bonus_claims c
        WHERE c.day >= $5::date
          AND c.day < ($5::date + INTERVAL '7 days')

        UNION
        SELECT w.user_id, w.day
        FROM daily_wheel_spins w
        WHERE w.day >= $5::date
          AND w.day < ($5::date + INTERVAL '7 days')

        UNION
        SELECT ca.user_id, ${sqlDateParis("ca.created_at")} AS day
        FROM calls_actions ca
        WHERE ca.created_at >= $3::timestamptz
          AND ca.created_at <  $4::timestamptz

        UNION
        SELECT b.user_id, ${sqlDateParis("b.created_at")} AS day
        FROM prediction_bets b
        WHERE b.created_at >= $3::timestamptz
          AND b.created_at <  $4::timestamptz

        UNION
        SELECT cm.user_id, ${sqlDateParis("cm.created_at")} AS day
        FROM chat_messages cm
        WHERE cm.deleted_at IS NULL
          AND cm.created_at >= $3::timestamptz
          AND cm.created_at <  $4::timestamptz
      ) days
      GROUP BY user_id
    ) x
    WHERE s.event_id=$1 AND s.user_id=x.user_id
    `,
    [eventId, VIEWER_WEEK_SCORING.P.DAY_BONUS, e.start_at, e.end_at, d0]
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
      WHERE c.day >= $3::date
        AND c.day < ($3::date + INTERVAL '7 days')
      GROUP BY c.user_id
    ) x
    WHERE s.event_id=$1 AND s.user_id=x.user_id
    `,
    [eventId, VIEWER_WEEK_SCORING.P.CLAIM, d0]
  );

  // Chat (cap = messages/jour) via chat_messages.created_at
  await pool.query(
    `
    UPDATE event_scores_viewer_week s
    SET
      chat_points = x.pts,
      points = points + x.pts,
      updated_at = NOW()
    FROM (
      SELECT user_id::bigint AS user_id,
             SUM(LEAST(cnt, $2::int) * $3::int)::int AS pts
      FROM (
        SELECT cm.user_id,
               ${sqlDateParis("cm.created_at")} AS day,
               COUNT(*)::int AS cnt
        FROM chat_messages cm
        WHERE cm.deleted_at IS NULL
          AND cm.created_at >= $4::timestamptz
          AND cm.created_at <  $5::timestamptz
        GROUP BY cm.user_id, day
      ) per_day
      GROUP BY user_id
    ) x
    WHERE s.event_id=$1 AND s.user_id=x.user_id
    `,
    [eventId, VIEWER_WEEK_SCORING.CAP_PER_DAY.CHAT, VIEWER_WEEK_SCORING.P.CHAT, e.start_at, e.end_at]
  );

  // Wheel (cap spins/day) via daily_wheel_spins.day
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
        WHERE w.day >= $4::date
          AND w.day < ($4::date + INTERVAL '7 days')
        GROUP BY w.user_id, w.day
      ) per_day
      GROUP BY user_id
    ) x
    WHERE s.event_id=$1 AND s.user_id=x.user_id
    `,
    [eventId, VIEWER_WEEK_SCORING.CAP_PER_DAY.WHEEL, VIEWER_WEEK_SCORING.P.WHEEL, d0]
  );

  // Calls (cap calls/day) via calls_actions.created_at
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
        WHERE ca.created_at >= $4::timestamptz
          AND ca.created_at <  $5::timestamptz
        GROUP BY ca.user_id, day
      ) per_day
      GROUP BY user_id
    ) x
    WHERE s.event_id=$1 AND s.user_id=x.user_id
    `,
    [eventId, VIEWER_WEEK_SCORING.CAP_PER_DAY.CALL, VIEWER_WEEK_SCORING.P.CALL, e.start_at, e.end_at]
  );

  // Predictions join (cap/day) via prediction_bets.created_at
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
        WHERE b.created_at >= $4::timestamptz
          AND b.created_at <  $5::timestamptz
        GROUP BY b.user_id, day
      ) per_day
      GROUP BY user_id
    ) x
    WHERE s.event_id=$1 AND s.user_id=x.user_id
    `,
    [eventId, VIEWER_WEEK_SCORING.CAP_PER_DAY.PRED_JOIN, VIEWER_WEEK_SCORING.P.PRED_JOIN, e.start_at, e.end_at]
  );

  // Predictions win bonus (cap/day) : proxy via predictions.bets_close_at (close ~= resolve)
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
    [eventId, VIEWER_WEEK_SCORING.CAP_PER_DAY.PRED_WIN, VIEWER_WEEK_SCORING.P.PRED_WIN, e.start_at, e.end_at]
  );

  return { ok: true as const };
}
