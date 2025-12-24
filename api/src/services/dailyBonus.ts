// api/src/services/dailyBonus.ts
import type { Pool, PoolClient } from "pg";

type WeekDayReward =
  | { type: "rubis"; amount: number; origin: string; weight_bp: number }
  | { type: "token"; token: "wheel_ticket"; amount: number };

type Granted =
  | { type: "rubis"; amount: number; origin: string; weight_bp: number; tx_id?: number }
  | { type: "token"; token: "wheel_ticket" | "prestige_token"; amount: number }
  | { type: "entitlement"; kind: "skin" | "title"; code: string; fallback?: boolean };

const DAILY_WEIGHT_BP = 3000;

function rewardByIsoDow(isodow: number): WeekDayReward {
  // ISO: 1=Lun ... 7=Dim
  switch (isodow) {
    case 1: return { type: "rubis", amount: 3, origin: "daily_bonus_mon", weight_bp: DAILY_WEIGHT_BP };
    case 2: return { type: "rubis", amount: 3, origin: "daily_bonus_tue", weight_bp: DAILY_WEIGHT_BP };
    case 3: return { type: "token", token: "wheel_ticket", amount: 1 };
    case 4: return { type: "rubis", amount: 5, origin: "daily_bonus_thu", weight_bp: DAILY_WEIGHT_BP };
    case 5: return { type: "rubis", amount: 5, origin: "daily_bonus_fri", weight_bp: DAILY_WEIGHT_BP };
    case 6: return { type: "token", token: "wheel_ticket", amount: 1 };
    case 7: return { type: "rubis", amount: 10, origin: "daily_bonus_sun", weight_bp: DAILY_WEIGHT_BP };
    default: return { type: "rubis", amount: 3, origin: "daily_bonus", weight_bp: DAILY_WEIGHT_BP };
  }
}

async function getParisNow(client: PoolClient) {
  const r = await client.query(`
    SELECT
      (NOW() AT TIME ZONE 'Europe/Paris')::date AS day,
      date_trunc('month', (NOW() AT TIME ZONE 'Europe/Paris'))::date AS month_start,
      EXTRACT(ISODOW FROM (NOW() AT TIME ZONE 'Europe/Paris'))::int AS isodow,
      ((NOW() AT TIME ZONE 'Europe/Paris')::date - (EXTRACT(ISODOW FROM (NOW() AT TIME ZONE 'Europe/Paris'))::int - 1))::date AS week_start
  `);
  return {
    day: String(r.rows[0].day),
    monthStart: String(r.rows[0].month_start),
    isodow: Number(r.rows[0].isodow),
    weekStart: String(r.rows[0].week_start),
  };
}

async function mintRubis(client: PoolClient, userId: number, amount: number, origin: string, weight_bp: number) {
  const tx = await client.query(
    `
    INSERT INTO rubis_tx (kind, purpose, status, from_user_id, to_user_id, amount, support_value, streamer_amount, platform_amount, burn_amount, meta)
    VALUES ('mint', $1, 'succeeded', NULL, $2, $3, 0, 0, 0, 0, jsonb_build_object('origin',$1,'weight_bp',$4))
    RETURNING id;
    `,
    [origin, userId, amount, weight_bp]
  );
  const txId = Number(tx.rows?.[0]?.id);

  await client.query(
    `
    INSERT INTO rubis_lots (user_id, origin, weight_bp, amount_total, amount_remaining, meta)
    VALUES ($1, $2, $3, $4, $4, jsonb_build_object('source','daily_bonus'));
    `,
    [userId, origin, weight_bp, amount]
  );

  await client.query(
    `INSERT INTO rubis_tx_entries (tx_id, entity, user_id, delta) VALUES ($1, 'user', $2, $3);`,
    [txId, userId, amount]
  );

  await client.query(`UPDATE users SET rubis = rubis + $2 WHERE id = $1;`, [userId, amount]);
  return txId;
}

async function addToken(client: PoolClient, userId: number, token: string, amount: number) {
  await client.query(
    `
    INSERT INTO user_tokens (user_id, token, amount)
    VALUES ($1, $2, $3)
    ON CONFLICT (user_id, token)
    DO UPDATE SET amount = user_tokens.amount + EXCLUDED.amount,
                  updated_at = NOW();
    `,
    [userId, token, amount]
  );
}

async function grantEntitlement(client: PoolClient, userId: number, kind: "skin" | "title", code: string) {
  const r = await client.query(
    `
    INSERT INTO user_entitlements (user_id, kind, code)
    VALUES ($1, $2, $3)
    ON CONFLICT DO NOTHING
    RETURNING user_id;
    `,
    [userId, kind, code]
  );
  return (r.rows?.length ?? 0) > 0;
}

async function countClaimsThisMonth(client: PoolClient, userId: number, monthStart: string) {
  const r = await client.query(
    `
    SELECT COUNT(*)::int AS n
    FROM daily_bonus_claims
    WHERE user_id = $1
      AND day >= $2::date
      AND day < ($2::date + INTERVAL '1 month');
    `,
    [userId, monthStart]
  );
  return Number(r.rows?.[0]?.n ?? 0);
}

async function milestoneClaimed(client: PoolClient, userId: number, monthStart: string, milestone: number) {
  const r = await client.query<{ exists: boolean }>(
    `
    SELECT EXISTS(
      SELECT 1 FROM monthly_bonus_rewards
      WHERE user_id=$1 AND month_start=$2::date AND milestone=$3
    ) AS exists;
    `,
    [userId, monthStart, milestone]
  );
  return Boolean(r.rows?.[0]?.exists);
}

async function markMilestoneGranted(
  client: PoolClient,
  userId: number,
  monthStart: string,
  milestone: number,
  granted: Granted[]
) {
  await client.query(
    `
    INSERT INTO monthly_bonus_rewards (user_id, month_start, milestone, granted)
    VALUES ($1, $2::date, $3, $4::jsonb)
    ON CONFLICT DO NOTHING;
    `,
    [userId, monthStart, milestone, JSON.stringify(granted)]
  );
}

async function claimedToday(client: PoolClient, userId: number, day: string) {
  const r = await client.query<{ exists: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM daily_bonus_claims WHERE user_id=$1 AND day=$2::date) AS exists;`,
    [userId, day]
  );
  return Boolean(r.rows?.[0]?.exists);
}

async function getWeekClaims(client: PoolClient, userId: number, weekStart: string) {
  const r = await client.query<{ day: string }>(
    `
    SELECT day::text AS day
    FROM daily_bonus_claims
    WHERE user_id=$1
      AND day >= $2::date
      AND day < ($2::date + INTERVAL '7 day')
    ORDER BY day ASC;
    `,
    [userId, weekStart]
  );
  const set = new Set<string>();
  for (const row of r.rows || []) set.add(String(row.day));
  return set;
}

async function getTokens(client: PoolClient, userId: number) {
  const r = await client.query<{ token: string; amount: number }>(
    `SELECT token, amount FROM user_tokens WHERE user_id=$1;`,
    [userId]
  );
  const out: Record<string, number> = {};
  for (const row of r.rows || []) out[row.token] = Number(row.amount ?? 0);
  return out;
}

export async function getDailyBonusState(pool: Pool, userId: number) {
  const client = await pool.connect();
  try {
    const { day, monthStart, isodow, weekStart } = await getParisNow(client);

    const weekClaims = await getWeekClaims(client, userId, weekStart);
    const monthClaimedDays = await countClaimsThisMonth(client, userId, monthStart);
    const todayClaimed = await claimedToday(client, userId, day);

    const milestones = [5, 10, 20, 30] as const;
    const milestoneState = [];
    for (const m of milestones) {
      const claimed = await milestoneClaimed(client, userId, monthStart, m);
      const status = claimed ? "claimed" : monthClaimedDays >= m ? "claimable" : "locked";
      milestoneState.push({ milestone: m, status });
    }

    const labels = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
    const week = [];
    for (let d = 1; d <= 7; d++) {
      // date du jour d dans la semaine
      const rr = await client.query<{ date: string }>(
        `SELECT ($1::date + ($2::int - 1) * INTERVAL '1 day')::date::text AS date;`,
        [weekStart, d]
      );
      const date = String(rr.rows?.[0]?.date);

      let status:
        | "future"
        | "missed"
        | "claimed"
        | "today_claimable"
        | "today_claimed" = "future";

      const isToday = date === day;
      const isPast = date < day;

      if (isToday) status = todayClaimed ? "today_claimed" : "today_claimable";
      else if (isPast) status = weekClaims.has(date) ? "claimed" : "missed";
      else status = "future";

      week.push({
        isodow: d,
        label: labels[d - 1],
        date,
        reward: rewardByIsoDow(d),
        status,
      });
    }

    const tokens = await getTokens(client, userId);

    return {
      ok: true,
      day,
      isodow,
      weekStart,
      monthStart,
      monthClaimedDays,
      todayClaimed,
      week,
      milestones: milestoneState,
      tokens: {
        wheel_ticket: Number(tokens["wheel_ticket"] ?? 0),
        prestige_token: Number(tokens["prestige_token"] ?? 0),
      },
    };
  } finally {
    client.release();
  }
}

export async function claimDailyBonusToday(pool: Pool, userId: number) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { day, monthStart, isodow, weekStart } = await getParisNow(client);

    const ins = await client.query(
      `
      INSERT INTO daily_bonus_claims (user_id, day)
      VALUES ($1, $2::date)
      ON CONFLICT DO NOTHING
      RETURNING created_at;
      `,
      [userId, day]
    );

    const alreadyClaimed = (ins.rows?.length ?? 0) === 0;
    const granted: Granted[] = [];

    if (!alreadyClaimed) {
      const rw = rewardByIsoDow(isodow);
      if (rw.type === "rubis") {
        const txId = await mintRubis(client, userId, rw.amount, rw.origin, rw.weight_bp);
        granted.push({ type: "rubis", amount: rw.amount, origin: rw.origin, weight_bp: rw.weight_bp, tx_id: txId });
      } else {
        await addToken(client, userId, rw.token, rw.amount);
        granted.push({ type: "token", token: rw.token, amount: rw.amount });
      }
    }

    await client.query("COMMIT");

    // renvoie aussi state pour refresh UI
    const state = await getDailyBonusState(pool, userId);
    return { ok: true, alreadyClaimed, granted, state };
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

export async function claimDailyBonusMilestone(pool: Pool, userId: number, milestone: 5 | 10 | 20 | 30) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { monthStart } = await getParisNow(client);
    const monthClaimedDays = await countClaimsThisMonth(client, userId, monthStart);

    if (monthClaimedDays < milestone) {
      throw new Error("milestone_not_reached");
    }

    const already = await milestoneClaimed(client, userId, monthStart, milestone);
    if (already) {
      throw new Error("milestone_already_claimed");
    }

    const granted: Granted[] = [];

    if (milestone === 5) {
      const txId = await mintRubis(client, userId, 5, "monthly_bonus_5", DAILY_WEIGHT_BP);
      granted.push({ type: "rubis", amount: 5, origin: "monthly_bonus_5", weight_bp: DAILY_WEIGHT_BP, tx_id: txId });
    }

    if (milestone === 10) {
      const txId = await mintRubis(client, userId, 10, "monthly_bonus_10", DAILY_WEIGHT_BP);
      granted.push({ type: "rubis", amount: 10, origin: "monthly_bonus_10", weight_bp: DAILY_WEIGHT_BP, tx_id: txId });
      await addToken(client, userId, "wheel_ticket", 1);
      granted.push({ type: "token", token: "wheel_ticket", amount: 1 });
    }

    if (milestone === 20) {
      const code = "monthly_claim_20_skin";
      const ok = await grantEntitlement(client, userId, "skin", code);
      if (ok) {
        granted.push({ type: "entitlement", kind: "skin", code });
      } else {
        const txId = await mintRubis(client, userId, 20, "monthly_bonus_20_fallback", DAILY_WEIGHT_BP);
        granted.push({ type: "rubis", amount: 20, origin: "monthly_bonus_20_fallback", weight_bp: DAILY_WEIGHT_BP, tx_id: txId });
        granted.push({ type: "entitlement", kind: "skin", code, fallback: true });
      }
    }

    if (milestone === 30) {
      const code = "monthly_claim_30_title";
      const ok = await grantEntitlement(client, userId, "title", code);
      if (ok) {
        granted.push({ type: "entitlement", kind: "title", code });
      } else {
        await addToken(client, userId, "prestige_token", 1);
        granted.push({ type: "token", token: "prestige_token", amount: 1 });
        granted.push({ type: "entitlement", kind: "title", code, fallback: true });
      }
    }

    await markMilestoneGranted(client, userId, monthStart, milestone, granted);
    await client.query("COMMIT");

    const state = await getDailyBonusState(pool, userId);
    return { ok: true, milestone, granted, state };
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    client.release();
  }
}
