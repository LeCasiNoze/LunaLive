// api/src/wallet_engine.ts
import type { PoolClient } from "pg";
import { pool } from "./db.js";
import { sqlWeightBpExpr, weightBp } from "./economy.js";

export type SpendKind = "support" | "sink";

export type SpendOpts = {
  userId: number;
  amount: number; // rubis
  spendKind: SpendKind;
  spendType: string; // "sub" | "tip" | "cosmetic" | ...
  streamerId?: number | null;
  meta?: any;
};

export type SpendResult = {
  spent: number;
  breakdown: Record<string, number>;
  supportRubis: number; // int
  streamerEarnRubis: number; // int
  platformCutRubis: number; // int
};

function assertIntAmount(n: any) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0 || Math.floor(v) !== v) throw new Error("bad_amount");
  return v;
}

async function ensureUserExists(client: PoolClient, userId: number) {
  const u = await client.query(`SELECT id, rubis FROM users WHERE id=$1 FOR UPDATE`, [userId]);
  if (!u.rows?.[0]) throw new Error("user_not_found");
  return { rubis: Number(u.rows[0].rubis || 0) };
}

export async function earnRubisTx(
  client: PoolClient,
  userId: number,
  origin: string,
  amount: number,
  meta: any = {}
) {
  const amt = assertIntAmount(amount);

  await ensureUserExists(client, userId);

  await client.query(
    `INSERT INTO wallet_lots (user_id, origin, amount_remaining, meta)
     VALUES ($1,$2,$3,$4::jsonb)`,
    [userId, String(origin || "event_platform"), amt, JSON.stringify(meta ?? {})]
  );

  await client.query(`UPDATE users SET rubis = rubis + $2 WHERE id=$1`, [userId, amt]);

  await client.query(
    `INSERT INTO wallet_tx (user_id, kind, origin, amount, meta)
     VALUES ($1,'earn',$2,$3,$4::jsonb)`,
    [userId, String(origin || "event_platform"), amt, JSON.stringify(meta ?? {})]
  );

  return { ok: true };
}

export async function earnRubis(userId: number, origin: string, amount: number, meta: any = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await earnRubisTx(client, userId, origin, amount, meta);
    await client.query("COMMIT");
    return r;
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

export async function spendRubisTx(client: PoolClient, opts: SpendOpts): Promise<SpendResult> {
  const userId = Number(opts.userId);
  const amount = assertIntAmount(opts.amount);
  const spendKind = opts.spendKind;
  const streamerId = opts.streamerId ?? null;

  await ensureUserExists(client, userId);

  const weightExpr = sqlWeightBpExpr("wl");
  const order =
    spendKind === "support"
      ? `ORDER BY ${weightExpr} DESC, wl.created_at ASC, wl.id ASC`
      : `ORDER BY ${weightExpr} ASC, wl.created_at ASC, wl.id ASC`;

  const { rows } = await client.query(
    `SELECT wl.id, wl.origin, wl.amount_remaining
     FROM wallet_lots wl
     WHERE wl.user_id=$1 AND wl.amount_remaining > 0
     ${order}
     FOR UPDATE`,
    [userId]
  );

  let need = amount;
  const take: { id: number; origin: string; n: number }[] = [];
  const breakdown: Record<string, number> = {};

  for (const r of rows) {
    if (need <= 0) break;
    const avail = Number(r.amount_remaining || 0);
    if (avail <= 0) continue;

    const n = Math.min(avail, need);
    need -= n;

    const origin = String(r.origin || "event_platform");
    take.push({ id: Number(r.id), origin, n });

    breakdown[origin] = (breakdown[origin] ?? 0) + n;
  }

  if (need > 0) throw new Error("insufficient_rubis");

  // apply updates
  for (const t of take) {
    await client.query(`UPDATE wallet_lots SET amount_remaining = amount_remaining - $2 WHERE id=$1`, [
      t.id,
      t.n,
    ]);
  }

  await client.query(`UPDATE users SET rubis = GREATEST(rubis - $2, 0) WHERE id=$1`, [userId, amount]);

  // compute support / earnings (int, conservateur)
  let supportBp = 0;
  for (const [origin, n] of Object.entries(breakdown)) {
    supportBp += n * weightBp(origin);
  }
  const supportRubis = Math.floor(supportBp / 10000);
  const streamerEarnRubis = Math.floor((supportRubis * 90) / 100);
  const platformCutRubis = supportRubis - streamerEarnRubis;

  await client.query(
    `INSERT INTO wallet_tx (user_id, kind, spend_kind, spend_type, streamer_id, amount, breakdown,
                            support_rubis, streamer_earn_rubis, platform_cut_rubis, meta)
     VALUES ($1,'spend',$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb)`,
    [
      userId,
      spendKind,
      String(opts.spendType || "unknown"),
      streamerId,
      amount,
      JSON.stringify(breakdown),
      supportRubis,
      streamerEarnRubis,
      platformCutRubis,
      JSON.stringify(opts.meta ?? {}),
    ]
  );

  if (spendKind === "support" && streamerId) {
    await client.query(
      `INSERT INTO streamer_earnings_ledger
       (streamer_id, payer_user_id, spend_type, spent_rubis, support_rubis, streamer_earn_rubis, platform_cut_rubis, breakdown, meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)`,
      [
        streamerId,
        userId,
        String(opts.spendType || "support"),
        amount,
        supportRubis,
        streamerEarnRubis,
        platformCutRubis,
        JSON.stringify(breakdown),
        JSON.stringify(opts.meta ?? {}),
      ]
    );

    await client.query(
      `INSERT INTO streamer_wallets (streamer_id, available_rubis, lifetime_rubis)
       VALUES ($1,$2,$2)
       ON CONFLICT (streamer_id) DO UPDATE
         SET available_rubis = streamer_wallets.available_rubis + EXCLUDED.available_rubis,
             lifetime_rubis  = streamer_wallets.lifetime_rubis  + EXCLUDED.lifetime_rubis,
             updated_at = NOW()`,
      [streamerId, streamerEarnRubis]
    );
  }

  return { spent: amount, breakdown, supportRubis, streamerEarnRubis, platformCutRubis };
}

export async function spendRubis(opts: SpendOpts) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await spendRubisTx(client, opts);
    await client.query("COMMIT");
    return r;
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    client.release();
  }
}
