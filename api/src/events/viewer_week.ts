import type { Pool, PoolClient } from "pg";
import { pool } from "../db.js";
import { earnRubisTx, spendRubisTx } from "../wallet_engine.js";

type Db = Pool | PoolClient;
const TZ = "Europe/Paris";

// Paliers de points viewer (récupérés manuellement, en direct). Récompenses
// SIMPLES : rubis + tickets de roue, PAS de cosmétique (réservés aux tops
// d'event). Dernier palier volontairement EXIGEANT (hyper-actif sur la semaine).
// À affiner aux tests. Réutilise la table générique event_palier_claims.
export const VIEWER_WEEK_PALIERS: Array<{ index: number; threshold: number; rubis: number; wheelTickets: number; label: string }> = [
  { index: 0, threshold: 800, rubis: 50, wheelTickets: 0, label: "50 rubis" },
  { index: 1, threshold: 2000, rubis: 80, wheelTickets: 1, label: "80 rubis + 1 ticket de roue" },
  { index: 2, threshold: 4000, rubis: 150, wheelTickets: 1, label: "150 rubis + 1 ticket de roue" },
  { index: 3, threshold: 8000, rubis: 250, wheelTickets: 2, label: "250 rubis + 2 tickets de roue" },
];

export async function getViewerPaliersState(db: Db, eventId: number, userId: number) {
  const pts = await db.query(`SELECT COALESCE(points,0) AS points FROM event_scores_viewer_week WHERE event_id=$1 AND user_id=$2`, [eventId, userId]);
  const points = Number(pts.rows?.[0]?.points ?? 0);
  const claimsRes = await db.query(`SELECT palier_index FROM event_palier_claims WHERE event_id=$1 AND user_id=$2`, [eventId, userId]);
  const claimed = (claimsRes.rows || []).map((r: any) => Number(r.palier_index));
  return { points, claimed };
}

// Récupère tous les paliers atteints non encore réclamés (points >= seuil).
export async function claimViewerPaliers(eventId: number, userId: number): Promise<Array<{ index: number; label: string }>> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ptsRes = await client.query(`SELECT COALESCE(points,0) AS points FROM event_scores_viewer_week WHERE event_id=$1 AND user_id=$2`, [eventId, userId]);
    const points = Number(ptsRes.rows?.[0]?.points ?? 0);
    const already = await client.query(`SELECT palier_index FROM event_palier_claims WHERE event_id=$1 AND user_id=$2`, [eventId, userId]);
    const claimed = new Set((already.rows || []).map((r: any) => Number(r.palier_index)));

    const newly: Array<{ index: number; label: string }> = [];
    for (const p of VIEWER_WEEK_PALIERS) {
      if (points < p.threshold || claimed.has(p.index)) continue;
      const ins = await client.query(
        `INSERT INTO event_palier_claims (event_id, user_id, palier_index) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING 1`,
        [eventId, userId, p.index]
      );
      if ((ins.rowCount ?? 0) === 0) continue; // course concurrente
      if (p.rubis > 0) {
        await earnRubisTx(client, userId, "event_platform", p.rubis, { purpose: "event_palier", eventId, eventType: "viewer_week", palier: p.index });
      }
      if (p.wheelTickets > 0) {
        await client.query(
          `INSERT INTO user_event_tickets (user_id, amount) VALUES ($1, LEAST($2,50))
           ON CONFLICT (user_id) DO UPDATE SET amount = LEAST(user_event_tickets.amount + $2, 50)`,
          [userId, p.wheelTickets]
        );
      }
      newly.push({ index: p.index, label: p.label });
    }
    await client.query("COMMIT");
    return newly;
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

export async function getViewerBoostState(db: Db, eventId: number, userId: number) {
  const r = await db.query(
    `SELECT COUNT(*)::int AS bought,
            BOOL_OR(created_at > NOW() - ($3 || ' hours')::interval) AS active
     FROM event_shop_purchases
     WHERE event_id=$1 AND user_id=$2 AND item_code=$4`,
    [eventId, userId, VIEWER_BOOST.durationHours, VIEWER_BOOST.code]
  );
  const row = r.rows?.[0] ?? {};
  const bought = Number(row.bought ?? 0);
  return {
    active: Boolean(row.active),
    bought,
    cost: VIEWER_BOOST.cost,
    capPerEvent: VIEWER_BOOST.capPerEvent,
    canBuy: bought < VIEWER_BOOST.capPerEvent,
    durationHours: VIEWER_BOOST.durationHours,
  };
}

export async function buyViewerBoost(
  eventId: number,
  userId: number
): Promise<{ ok: false; error: "cap_reached" | "not_enough_rubis" } | { ok: true; rubis: number; bought: number }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // sérialise les achats concurrents du même user (cap fiable, cf TOCTOU roue)
    await client.query(`SELECT pg_advisory_xact_lock($1, $2)`, [0x5642 /* "VB" */, userId]);

    const cnt = await client.query(
      `SELECT COUNT(*)::int AS n FROM event_shop_purchases WHERE event_id=$1 AND user_id=$2 AND item_code=$3`,
      [eventId, userId, VIEWER_BOOST.code]
    );
    const bought0 = Number(cnt.rows?.[0]?.n ?? 0);
    if (bought0 >= VIEWER_BOOST.capPerEvent) {
      await client.query("ROLLBACK");
      return { ok: false, error: "cap_reached" };
    }

    try {
      await spendRubisTx(client, { userId, amount: VIEWER_BOOST.cost, spendKind: "sink", spendType: "event_viewer_boost", meta: { eventId } });
    } catch (e: any) {
      await client.query("ROLLBACK");
      if (String(e?.message) === "insufficient_rubis") return { ok: false, error: "not_enough_rubis" };
      throw e;
    }

    await client.query(
      `INSERT INTO event_shop_purchases (event_id, user_id, item_code, day_date)
       VALUES ($1,$2,$3, (NOW() AT TIME ZONE '${TZ}')::date)`,
      [eventId, userId, VIEWER_BOOST.code]
    );

    const rubisRow = await client.query(`SELECT rubis FROM users WHERE id=$1`, [userId]);
    const rubis = Number(rubisRow.rows?.[0]?.rubis ?? 0);

    await client.query("COMMIT");
    return { ok: true, rubis, bought: bought0 + 1 };
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

/* ── Quêtes viewer (LÉGÈRES — aider à scorer). Réutilise event_quest_claims.
   Daily : clé datée vq:<key>:<YYYY-MM-DD Paris>. Weekly : clé nue vq:<key>. ── */
type ViewerQuest = { key: string; label: string; goal: number; rubis: number; wheelTickets: number };
export const VIEWER_QUESTS: { daily: ViewerQuest[]; weekly: ViewerQuest[] } = {
  daily: [
    { key: "watch_30", label: "Regarder 30 min de live", goal: 30, rubis: 20, wheelTickets: 0 },
    { key: "chat_10", label: "Envoyer 10 messages", goal: 10, rubis: 15, wheelTickets: 0 },
    { key: "call_1", label: "Faire 1 call", goal: 1, rubis: 15, wheelTickets: 0 },
  ],
  weekly: [
    { key: "active_3d", label: "3 jours actifs", goal: 3, rubis: 0, wheelTickets: 1 },
    { key: "watch_2h", label: "2h de watch cumulées", goal: 120, rubis: 30, wheelTickets: 1 },
  ],
};

function viewerQuestRewardLabel(q: ViewerQuest): string {
  const parts: string[] = [];
  if (q.rubis > 0) parts.push(`${q.rubis} rubis`);
  if (q.wheelTickets > 0) parts.push(`${q.wheelTickets} ticket${q.wheelTickets > 1 ? "s" : ""} de roue`);
  return parts.join(" + ") || "—";
}

function viewerQuestKey(period: "daily" | "weekly", key: string, today: string): string {
  return period === "daily" ? `vq:${key}:${today}` : `vq:${key}`;
}

async function todayParis(db: Db): Promise<string> {
  const r = await db.query(`SELECT (NOW() AT TIME ZONE '${TZ}')::date::text AS d`);
  return String(r.rows?.[0]?.d || "");
}

async function viewerQuestProgress(db: Db, key: string, userId: number, today: string, start: any, end: any): Promise<number> {
  const one = async (sql: string, params: any[]) => Number((await db.query(sql, params)).rows?.[0]?.n ?? 0);
  switch (key) {
    case "watch_30":
      return one(`SELECT COUNT(DISTINCT bucket_ts)::int n FROM stream_viewer_minutes WHERE user_id=$1 AND (bucket_ts AT TIME ZONE '${TZ}')::date = $2::date`, [userId, today]);
    case "chat_10":
      return one(`SELECT COUNT(*)::int n FROM chat_messages WHERE user_id=$1 AND deleted_at IS NULL AND (created_at AT TIME ZONE '${TZ}')::date = $2::date`, [userId, today]);
    case "call_1":
      return one(`SELECT COUNT(*)::int n FROM calls_actions WHERE user_id=$1 AND (created_at AT TIME ZONE '${TZ}')::date = $2::date`, [userId, today]);
    case "active_3d":
      return one(`SELECT COUNT(DISTINCT (bucket_ts AT TIME ZONE '${TZ}')::date)::int n FROM stream_viewer_minutes WHERE user_id=$1 AND bucket_ts>=$2::timestamptz AND bucket_ts<$3::timestamptz`, [userId, start, end]);
    case "watch_2h":
      return one(`SELECT COUNT(DISTINCT bucket_ts)::int n FROM stream_viewer_minutes WHERE user_id=$1 AND bucket_ts>=$2::timestamptz AND bucket_ts<$3::timestamptz`, [userId, start, end]);
    default:
      return 0;
  }
}

export async function getViewerQuestsState(db: Db, eventId: number, userId: number) {
  const evr = await db.query(`SELECT start_at, end_at FROM events WHERE id=$1`, [eventId]);
  const e = evr.rows?.[0] ?? {};
  const today = await todayParis(db);
  const build = async (period: "daily" | "weekly", list: ViewerQuest[]) => {
    const out = [];
    for (const q of list) {
      const progress = await viewerQuestProgress(db, q.key, userId, today, e.start_at, e.end_at);
      const cl = await db.query(`SELECT 1 FROM event_quest_claims WHERE event_id=$1 AND user_id=$2 AND quest_key=$3`, [eventId, userId, viewerQuestKey(period, q.key, today)]);
      out.push({ key: q.key, label: q.label, goal: q.goal, progress: Math.min(progress, q.goal), done: progress >= q.goal, claimed: (cl.rowCount ?? 0) > 0, reward: viewerQuestRewardLabel(q) });
    }
    return out;
  };
  return { daily: await build("daily", VIEWER_QUESTS.daily), weekly: await build("weekly", VIEWER_QUESTS.weekly) };
}

export async function claimViewerQuest(
  eventId: number,
  userId: number,
  key: string
): Promise<{ ok: false; error: string } | { ok: true; reward: string }> {
  let period: "daily" | "weekly" | null = null;
  let quest: ViewerQuest | null = null;
  for (const q of VIEWER_QUESTS.daily) if (q.key === key) { period = "daily"; quest = q; }
  for (const q of VIEWER_QUESTS.weekly) if (q.key === key) { period = "weekly"; quest = q; }
  if (!quest || !period) return { ok: false, error: "unknown_quest" };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const evr = await client.query(`SELECT start_at, end_at FROM events WHERE id=$1`, [eventId]);
    const e = evr.rows?.[0];
    if (!e) { await client.query("ROLLBACK"); return { ok: false, error: "no_event" }; }
    const today = await todayParis(client);
    const skey = viewerQuestKey(period, key, today);
    const already = await client.query(`SELECT 1 FROM event_quest_claims WHERE event_id=$1 AND user_id=$2 AND quest_key=$3`, [eventId, userId, skey]);
    if ((already.rowCount ?? 0) > 0) { await client.query("ROLLBACK"); return { ok: false, error: "already_claimed" }; }
    const progress = await viewerQuestProgress(client, key, userId, today, e.start_at, e.end_at);
    if (progress < quest.goal) { await client.query("ROLLBACK"); return { ok: false, error: "not_done" }; }
    const ins = await client.query(`INSERT INTO event_quest_claims (event_id,user_id,quest_key) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING 1`, [eventId, userId, skey]);
    if ((ins.rowCount ?? 0) === 0) { await client.query("ROLLBACK"); return { ok: false, error: "already_claimed" }; }
    if (quest.rubis > 0) await earnRubisTx(client, userId, "event_platform", quest.rubis, { purpose: "event_quest", eventId, eventType: "viewer_week", quest: key });
    if (quest.wheelTickets > 0) {
      await client.query(`INSERT INTO user_event_tickets (user_id, amount) VALUES ($1, LEAST($2,50)) ON CONFLICT (user_id) DO UPDATE SET amount = LEAST(user_event_tickets.amount + $2, 50)`, [userId, quest.wheelTickets]);
    }
    await client.query("COMMIT");
    return { ok: true, reward: viewerQuestRewardLabel(quest) };
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

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

// Booster de points (boutique viewer) : ×1.2 pendant 24h, payé en rubis (sink).
// Achat tracé dans event_shop_purchases (item_code='viewer_boost'). N'affecte
// QUE le classement viewer + les paliers (pas le total streamer, dé-boosté).
export const VIEWER_BOOST = {
  code: "viewer_boost",
  cost: 200,
  durationHours: 24,
  multiplierBp: 12000, // ×1.2 (+20%)
  capPerEvent: 3,
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

  // BOOSTER de points (boutique) : ×1.2 sur le TOTAL des users ayant un boost
  // actif (achat event_shop_purchases 'viewer_boost' < 24h). Appliqué en dernier
  // (le recompute reconstruit `points` from scratch chaque tick → jamais cumulé).
  // ⚠️ N'affecte QUE le classement viewer + les paliers ; le total streamer
  // dé-booste (cf rankViewerWeekStreamers) pour ne pas gonfler le streamer.
  await pool.query(
    `
    UPDATE event_scores_viewer_week s
    SET points = FLOOR(points * $2 / 10000.0)::int, updated_at = NOW()
    WHERE s.event_id = $1
      AND EXISTS (
        SELECT 1 FROM event_shop_purchases esp
        WHERE esp.event_id = $1 AND esp.user_id = s.user_id
          AND esp.item_code = 'viewer_boost'
          AND esp.created_at > NOW() - ($3 || ' hours')::interval
      )
    `,
    [eventId, VIEWER_BOOST.multiplierBp, VIEWER_BOOST.durationHours]
  );

  return { ok: true as const };
}

/* ────────────────────────────────────────────────────────────────────────
   Classement STREAMERS (mécanique "team") — les points de chaque viewer sont
   attribués au streamer qu'il a le PLUS regardé de la semaine (minutes
   distinctes), hors auto-watch (un streamer ne compte pas en se regardant).
   ──────────────────────────────────────────────────────────────────────── */

export type RankedViewerStreamer = {
  streamerId: number;
  slug: string;
  displayName: string;
  userId: number | null;
  points: number;
  viewers: number;
  rank: number;
};

export async function rankViewerWeekStreamers(eventId: number, limit = 10, db: Db = pool): Promise<RankedViewerStreamer[]> {
  const ev = await db.query(`SELECT start_at, end_at FROM events WHERE id=$1`, [eventId]);
  const e = ev.rows?.[0];
  if (!e) return [];

  const r = await db.query(
    `
    WITH vsm AS (
      -- minutes distinctes par (viewer, streamer), hors auto-watch
      SELECT svm.user_id AS viewer_id, svm.streamer_id,
             COUNT(DISTINCT svm.bucket_ts) AS mins
      FROM stream_viewer_minutes svm
      JOIN streamers st ON st.id = svm.streamer_id
      WHERE svm.user_id IS NOT NULL AND svm.user_id > 0
        AND svm.bucket_ts >= $2::timestamptz AND svm.bucket_ts < $3::timestamptz
        AND (st.user_id IS NULL OR st.user_id <> svm.user_id)
      GROUP BY svm.user_id, svm.streamer_id
    ),
    top_per_viewer AS (
      -- streamer le plus regardé par chaque viewer
      SELECT DISTINCT ON (viewer_id) viewer_id, streamer_id
      FROM vsm
      ORDER BY viewer_id, mins DESC, streamer_id
    ),
    agg AS (
      -- dé-boost : un viewer boosté (×1.2 sur son classement) ne doit PAS
      -- gonfler le total de son streamer -> on ramène ses points au brut.
      SELECT t.streamer_id,
             SUM(CASE
                   WHEN EXISTS (
                     SELECT 1 FROM event_shop_purchases esp
                     WHERE esp.event_id=$1 AND esp.user_id=s.user_id
                       AND esp.item_code='viewer_boost'
                       AND esp.created_at > NOW() - ($5 || ' hours')::interval
                   ) THEN ROUND(s.points * 10000.0 / $6)
                   ELSE s.points
                 END)::int AS points,
             COUNT(*)::int AS viewers
      FROM top_per_viewer t
      JOIN event_scores_viewer_week s ON s.user_id = t.viewer_id AND s.event_id = $1
      GROUP BY t.streamer_id
    )
    SELECT a.streamer_id, st.slug, st.display_name, st.user_id, a.points, a.viewers,
           ROW_NUMBER() OVER (ORDER BY a.points DESC, a.viewers DESC, a.streamer_id) AS rank
    FROM agg a
    JOIN streamers st ON st.id = a.streamer_id
    ORDER BY rank
    LIMIT $4
    `,
    [eventId, e.start_at, e.end_at, limit, VIEWER_BOOST.durationHours, VIEWER_BOOST.multiplierBp]
  );

  return (r.rows || []).map((x: any) => ({
    streamerId: Number(x.streamer_id),
    slug: String(x.slug ?? ""),
    displayName: String(x.display_name ?? x.slug ?? ""),
    userId: x.user_id != null ? Number(x.user_id) : null,
    points: Number(x.points ?? 0),
    viewers: Number(x.viewers ?? 0),
    rank: Number(x.rank),
  }));
}

// Streamer que CE viewer booste (son plus regardé de la semaine, hors auto-watch).
export async function getViewerBoostedStreamer(
  eventId: number,
  userId: number
): Promise<{ streamerId: number; slug: string; displayName: string } | null> {
  const ev = await pool.query(`SELECT start_at, end_at FROM events WHERE id=$1`, [eventId]);
  const e = ev.rows?.[0];
  if (!e) return null;

  const r = await pool.query(
    `
    SELECT svm.streamer_id, st.slug, st.display_name, COUNT(DISTINCT svm.bucket_ts) AS mins
    FROM stream_viewer_minutes svm
    JOIN streamers st ON st.id = svm.streamer_id
    WHERE svm.user_id = $1
      AND svm.bucket_ts >= $2::timestamptz AND svm.bucket_ts < $3::timestamptz
      AND (st.user_id IS NULL OR st.user_id <> svm.user_id)
    GROUP BY svm.streamer_id, st.slug, st.display_name
    ORDER BY mins DESC, svm.streamer_id
    LIMIT 1
    `,
    [userId, e.start_at, e.end_at]
  );
  const row = r.rows?.[0];
  if (!row) return null;
  return { streamerId: Number(row.streamer_id), slug: String(row.slug ?? ""), displayName: String(row.display_name ?? row.slug ?? "") };
}
