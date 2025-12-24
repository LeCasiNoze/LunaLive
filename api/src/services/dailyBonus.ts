// api/src/services/dailyBonus.ts
import type { Pool, PoolClient } from "pg";

type Granted =
  | { type: "rubis"; amount: number; origin: string; weight_bp: number; tx_id?: number }
  | { type: "token"; token: "wheel_ticket" | "prestige_token"; amount: number }
  | { type: "entitlement"; kind: "skin" | "title"; code: string; fallback?: boolean };

const DAILY_WEIGHT_BP = 3000; // 0.30 (léger, “plaisir”, pas trop cashout-friendly)

function dailyRewardFromIsoDow(isodow: number): Granted[] {
  // ISO: 1=Lun ... 7=Dim
  switch (isodow) {
    case 1: return [{ type: "rubis", amount: 3, origin: "daily_bonus", weight_bp: DAILY_WEIGHT_BP }];
    case 2: return [{ type: "rubis", amount: 3, origin: "daily_bonus", weight_bp: DAILY_WEIGHT_BP }];
    case 3: return [{ type: "token", token: "wheel_ticket", amount: 1 }];
    case 4: return [{ type: "rubis", amount: 5, origin: "daily_bonus", weight_bp: DAILY_WEIGHT_BP }];
    case 5: return [{ type: "rubis", amount: 5, origin: "daily_bonus", weight_bp: DAILY_WEIGHT_BP }];
    case 6: return [{ type: "token", token: "wheel_ticket", amount: 1 }];
    case 7: return [{ type: "rubis", amount: 10, origin: "daily_bonus", weight_bp: DAILY_WEIGHT_BP }];
    default: return [{ type: "rubis", amount: 3, origin: "daily_bonus", weight_bp: DAILY_WEIGHT_BP }];
  }
}

// Mint rubis minimal (compatible avec ton ledger V1)
async function mintRubis(client: PoolClient, userId: number, amount: number, origin: string, weight_bp: number) {
  // 1) tx
  const tx = await client.query(
    `
    INSERT INTO rubis_tx (kind, purpose, status, from_user_id, to_user_id, amount, support_value, streamer_amount, platform_amount, burn_amount, meta)
    VALUES ('mint', $1, 'succeeded', NULL, $2, $3, 0, 0, 0, 0, jsonb_build_object('origin',$1,'weight_bp',$4))
    RETURNING id;
    `,
    [origin, userId, amount, weight_bp]
  );
  const txId = Number(tx.rows?.[0]?.id);

  // 2) lot
  await client.query(
    `
    INSERT INTO rubis_lots (user_id, origin, weight_bp, amount_total, amount_remaining, meta)
    VALUES ($1, $2, $3, $4, $4, jsonb_build_object('source','daily_bonus'));
    `,
    [userId, origin, weight_bp, amount]
  );

  // 3) entries + users.rubis compat
  await client.query(
    `
    INSERT INTO rubis_tx_entries (tx_id, entity, user_id, delta)
    VALUES ($1, 'user', $2, $3);
    `,
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

async function getParisDayAndMonth(client: PoolClient) {
  const r = await client.query(`
    SELECT
      (NOW() AT TIME ZONE 'Europe/Paris')::date AS day,
      date_trunc('month', (NOW() AT TIME ZONE 'Europe/Paris'))::date AS month_start,
      EXTRACT(ISODOW FROM (NOW() AT TIME ZONE 'Europe/Paris'))::int AS isodow
  `);
  return {
    day: String(r.rows[0].day),
    monthStart: String(r.rows[0].month_start),
    isodow: Number(r.rows[0].isodow),
  };
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

async function milestoneAlreadyGranted(client: PoolClient, userId: number, monthStart: string, milestone: number) {
  const r = await client.query<{ exists: boolean }>(
    `
    SELECT EXISTS(
      SELECT 1
      FROM monthly_bonus_rewards
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

export async function claimDailyBonus(pool: Pool, userId: number) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { day, monthStart, isodow } = await getParisDayAndMonth(client);

    // idempotent insert daily claim
    const ins = await client.query(
      `
      INSERT INTO daily_bonus_claims (user_id, day)
      VALUES ($1, $2::date)
      ON CONFLICT DO NOTHING
      RETURNING created_at;
      `,
      [userId, day]
    );

    const alreadyClaimed = ins.rowCount === 0;

    const granted: Granted[] = [];

    // always compute month stats (useful UI)
    const claimedDaysBefore = await countClaimsThisMonth(client, userId, monthStart);

    if (!alreadyClaimed) {
      // 1) Daily reward
      const daily = dailyRewardFromIsoDow(isodow);

      for (const g of daily) {
        if (g.type === "rubis") {
          const txId = await mintRubis(client, userId, g.amount, g.origin, g.weight_bp);
          granted.push({ ...g, tx_id: txId });
        } else if (g.type === "token") {
          await addToken(client, userId, g.token, g.amount);
          granted.push(g);
        }
      }
    }

    // claims count AFTER claim if new, else same
    const claimedDays = alreadyClaimed ? claimedDaysBefore : claimedDaysBefore + 1;

    // 2) Monthly milestones (only when not already granted for this month)
    const milestones = [5, 10, 20, 30] as const;

    for (const m of milestones) {
      if (claimedDays < m) continue;
      const done = await milestoneAlreadyGranted(client, userId, monthStart, m);
      if (done) continue;

      const milestoneGranted: Granted[] = [];

      if (m === 5) {
        const txId = await mintRubis(client, userId, 5, "monthly_bonus_5", DAILY_WEIGHT_BP);
        milestoneGranted.push({ type: "rubis", amount: 5, origin: "monthly_bonus_5", weight_bp: DAILY_WEIGHT_BP, tx_id: txId });
      }

      if (m === 10) {
        const txId = await mintRubis(client, userId, 10, "monthly_bonus_10", DAILY_WEIGHT_BP);
        milestoneGranted.push({ type: "rubis", amount: 10, origin: "monthly_bonus_10", weight_bp: DAILY_WEIGHT_BP, tx_id: txId });
        await addToken(client, userId, "wheel_ticket", 1);
        milestoneGranted.push({ type: "token", token: "wheel_ticket", amount: 1 });
      }

      if (m === 20) {
        // skin unique placeholder
        const code = "monthly_claim_20_skin";
        const ok = await grantEntitlement(client, userId, "skin", code);
        if (ok) {
          milestoneGranted.push({ type: "entitlement", kind: "skin", code });
        } else {
          // fallback rubis
          const txId = await mintRubis(client, userId, 20, "monthly_bonus_20_fallback", DAILY_WEIGHT_BP);
          milestoneGranted.push({ type: "rubis", amount: 20, origin: "monthly_bonus_20_fallback", weight_bp: DAILY_WEIGHT_BP, tx_id: txId });
          milestoneGranted.push({ type: "entitlement", kind: "skin", code, fallback: true });
        }
      }

      if (m === 30) {
        // title unique placeholder, fallback prestige token
        const code = "monthly_claim_30_title";
        const ok = await grantEntitlement(client, userId, "title", code);
        if (ok) {
          milestoneGranted.push({ type: "entitlement", kind: "title", code });
        } else {
          await addToken(client, userId, "prestige_token", 1);
          milestoneGranted.push({ type: "token", token: "prestige_token", amount: 1 });
          milestoneGranted.push({ type: "entitlement", kind: "title", code, fallback: true });
        }
      }

      if (milestoneGranted.length) {
        // persist milestone as granted this month
        await markMilestoneGranted(client, userId, monthStart, m, milestoneGranted);
        // include in response if the claim happened now OR alreadyClaimed (au cas où tu veux “claim manuel”)
        granted.push(...milestoneGranted);
      }
    }

    await client.query("COMMIT");

    return {
      ok: true,
      alreadyClaimed,
      day,
      monthStart,
      claimedDays,
      granted,
    };
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    client.release();
  }
}
