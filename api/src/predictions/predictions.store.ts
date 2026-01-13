// api/src/predictions/predictions.store.ts
import type { Pool } from "pg";
import { earnRubisTx } from "../wallet_engine.js";
import type { PredictionRow } from "./predictions.types.js";

const TAX_RATE = 0.10;

// ─────────────────────────────────────────────
// 🛡️ Shields (option 1) — reset tous les 14 jours
// - lvl0: 0 shield
// - lvl1: 1 shield / 14j
// - lvl2: 2 shields / 14j
// - lvl3: 3 shields / 14j
// Refund % (modifiable)
// - lvl1: 25%
// - lvl2: 50%
// - lvl3: 75%
// Refund arrondi AU DESSUS (ceil) et jamais > mise
// ─────────────────────────────────────────────

const SHIELD_PERIOD_DAYS = 14;
const SHIELD_UPGRADE_KEY = "predictions.shields" as const;

function shieldMaxByLevel(level: number) {
  const lv = Math.max(0, Math.min(3, Number(level || 0)));
  return lv; // 0->0, 1->1, 2->2, 3->3
}

function shieldRefundPct(level: number) {
  const lv = Math.max(0, Math.min(3, Number(level || 0)));
  return lv >= 1 ? 0.5 : 0; // ✅ 50% fixe dès lvl1
}

async function ensureShieldsSchema(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS prediction_shields (
      user_id        INT PRIMARY KEY,
      period_start   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      used           INT NOT NULL DEFAULT 0
    );
  `);
}

async function getShieldLevel(pool: Pool, userId: number): Promise<number> {
  try {
    const r = await pool.query(
      `
      SELECT level
      FROM user_upgrades
      WHERE user_id=$1 AND upgrade_key=$2
      LIMIT 1
      `,
      [userId, SHIELD_UPGRADE_KEY]
    );
    return Math.max(0, Number(r.rows?.[0]?.level || 0));
  } catch {
    return 0;
  }
}

async function getAndMaybeResetShieldState(client: any, userId: number) {
  // lock row
  const r = await client.query(
    `
    SELECT user_id, period_start, used
    FROM prediction_shields
    WHERE user_id=$1
    FOR UPDATE
    `,
    [userId]
  );

  if (!r.rows?.[0]) {
    await client.query(
      `INSERT INTO prediction_shields(user_id, period_start, used) VALUES ($1, NOW(), 0)`,
      [userId]
    );
    return { periodStart: new Date().toISOString(), used: 0 };
  }

  const periodStart = new Date(r.rows[0].period_start);
  const used = Number(r.rows[0].used || 0);

  const ms = Date.now() - periodStart.getTime();
  const days = ms / (24 * 3600 * 1000);

  if (days >= SHIELD_PERIOD_DAYS) {
    await client.query(
      `UPDATE prediction_shields SET period_start=NOW(), used=0 WHERE user_id=$1`,
      [userId]
    );
    return { periodStart: new Date().toISOString(), used: 0 };
  }

  return { periodStart: periodStart.toISOString(), used };
}

async function consumeShield(client: any, userId: number) {
  await client.query(`UPDATE prediction_shields SET used = used + 1 WHERE user_id=$1`, [userId]);
}

// ─────────────────────────────────────────────

export async function getActivePrediction(pool: Pool, streamerId: number): Promise<PredictionRow | null> {
  const r = await pool.query(
    `
    SELECT *
    FROM predictions
    WHERE streamer_id = $1
      AND status IN ('open','locked')
    ORDER BY id DESC
    LIMIT 1
    `,
    [streamerId]
  );
  return r.rows[0] ?? null;
}

export async function createPrediction(
  pool: Pool,
  streamerId: number,
  question: string,
  opt1: string,
  opt2: string,
  durationSec: number,
  fixedStake: number
): Promise<PredictionRow> {
  const r = await pool.query(
    `
    INSERT INTO predictions (
      streamer_id,
      question,
      option1_label,
      option2_label,
      fixed_stake,
      status,
      bets_close_at
    )
    VALUES ($1,$2,$3,$4,$5,'open', NOW() + ($6 || ' seconds')::interval)
    RETURNING *
    `,
    [streamerId, question, opt1, opt2, fixedStake, durationSec]
  );
  return r.rows[0];
}

/**
 * IMPORTANT:
 * - addBet ne DOIT PAS dépenser (sinon double spend).
 * - La dépense est faite dans predictions.routes.ts (wallet_engine).
 */
export async function addBet(pool: Pool, pred: PredictionRow, userId: number, choice: 1 | 2, stake: number) {
  await pool.query(
    `
    INSERT INTO prediction_bets (prediction_id, user_id, choice, amount)
    VALUES ($1,$2,$3,$4)
    `,
    [pred.id, userId, choice, stake]
  );

  await pool.query(
    choice === 1
      ? `UPDATE predictions SET total_pool_1 = total_pool_1 + $1 WHERE id=$2`
      : `UPDATE predictions SET total_pool_2 = total_pool_2 + $1 WHERE id=$2`,
    [stake, pred.id]
  );
}

export async function resolvePrediction(pool: Pool, pred: PredictionRow, winning: 1 | 2) {
  await ensureShieldsSchema(pool);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const r = await client.query(
      `SELECT user_id, amount, choice FROM prediction_bets WHERE prediction_id=$1`,
      [pred.id]
    );

    const bets = r.rows || [];
    const potTotal = bets.reduce((a, b) => a + Number(b.amount), 0);

    if (potTotal <= 0) {
      await client.query(
        `UPDATE predictions SET status='resolved', resolved_option=$1 WHERE id=$2`,
        [winning, pred.id]
      );
      await client.query("COMMIT");
      return;
    }

    const tax = Math.floor(potTotal * TAX_RATE);
    const potNet = potTotal - tax;

    const winners = bets.filter((b) => Number(b.choice) === winning);
    const losers = bets.filter((b) => Number(b.choice) !== winning);

    const poolWin = winners.reduce((a, b) => a + Number(b.amount), 0);

    // ✅ payouts winners (integer floor)
    if (poolWin > 0 && potNet > 0) {
      for (const w of winners) {
        const gain = Math.floor((Number(w.amount) * potNet) / poolWin);
        if (gain > 0) {
          await earnRubisTx(client, Number(w.user_id), "prediction_win", gain, {
            weight_bp: 2000,
            predictionId: pred.id,
          });
        }
      }
    }

    // ✅ shields refund losers (option 1)
    // Refund = ceil(stake * pct(level)), consume 1 shield if refund>0
    for (const l of losers) {
      const userId = Number(l.user_id);
      const stake = Number(l.amount);

      if (!(stake > 0)) continue;

      const level = await getShieldLevel(pool, userId);
      const max = shieldMaxByLevel(level);
      const pct = shieldRefundPct(level);

      if (!(max > 0) || !(pct > 0)) continue;

      // lock + maybe reset in current period
      const state = await getAndMaybeResetShieldState(client, userId);
      const used = Number(state.used || 0);
      const left = Math.max(0, max - used);

      if (left <= 0) continue;

      const refund = Math.min(stake, Math.ceil(stake * pct));
      if (refund <= 0) continue;

      await consumeShield(client, userId);

      await earnRubisTx(client, userId, "prediction_shield_refund", refund, {
        weight_bp: 2000,
        predictionId: pred.id,
        stake,
        shieldLevel: level,
        refundPct: pct,
      });
    }

    // 🔒 finalise
    await client.query(
      `
      UPDATE predictions
      SET status='resolved', resolved_option=$1
      WHERE id=$2
      `,
      [winning, pred.id]
    );

    await client.query("COMMIT");
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw e;
  } finally {
    client.release();
  }
}
