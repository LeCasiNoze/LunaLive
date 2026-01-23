import type { Pool } from "pg";
import { earnRubisTx } from "../wallet_engine.js";
import type { PredictionRow } from "./predictions.types.js";

const TAX_RATE = 0.10;

const TZ = "Europe/Paris";

// ✅ on réutilise l’upgrade existant "bet cap"
const BET_UPGRADE_KEY = "predictions.bet_cap" as const;

// ─────────────────────────────────────────────
// 🛡️ Shields (nouvelle règle)
// - 1 shield / 14j si betLevel == 3
// - +1 shield / 14j si viewer premium (sub 'viewer' active)
// - Refund = 50% (ceil), jamais > mise
// ─────────────────────────────────────────────
const SHIELD_PERIOD_DAYS = 14;

// ✅ 50% (et pas 100%)
const SHIELD_REFUND_PCT = 0.5;

async function ensurePredictionsSchema(pool: Pool) {
  // resolved_at est requis pour compter “par jour” au moment de la résolution
  await pool.query(`ALTER TABLE predictions ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;`);
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

async function getBetLevel(pool: Pool, userId: number): Promise<number> {
  try {
    const r = await pool.query(
      `SELECT level FROM user_upgrades WHERE user_id=$1 AND upgrade_key=$2 LIMIT 1`,
      [userId, BET_UPGRADE_KEY]
    );
    return Math.max(0, Number(r.rows?.[0]?.level || 0));
  } catch {
    return 0;
  }
}

async function isPremiumViewer(client: any, userId: number): Promise<boolean> {
  try {
    const r = await client.query(
      `
      SELECT 1
      FROM user_subscriptions us
      WHERE us.user_id=$1
        AND us.plan_code='viewer'
        AND us.status IN ('active','trialing')
        AND (us.current_period_end IS NULL OR us.current_period_end > NOW())
      LIMIT 1
      `,
      [userId]
    );
    return !!r.rows?.[0];
  } catch {
    return false;
  }
}

function shieldMax(betLevel: number, premium: boolean) {
  const hasLvl3 = Number(betLevel) >= 3;
  return (hasLvl3 ? 1 : 0) + (premium ? 1 : 0);
}

async function getAndMaybeResetShieldState(client: any, userId: number) {
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
    await client.query(`INSERT INTO prediction_shields(user_id, period_start, used) VALUES ($1, NOW(), 0)`, [userId]);
    return { periodStart: new Date().toISOString(), used: 0 };
  }

  const periodStart = new Date(r.rows[0].period_start);
  const used = Number(r.rows[0].used || 0);

  const ms = Date.now() - periodStart.getTime();
  const days = ms / (24 * 3600 * 1000);

  if (days >= SHIELD_PERIOD_DAYS) {
    await client.query(`UPDATE prediction_shields SET period_start=NOW(), used=0 WHERE user_id=$1`, [userId]);
    return { periodStart: new Date().toISOString(), used: 0 };
  }

  return { periodStart: periodStart.toISOString(), used };
}

async function consumeShield(client: any, userId: number) {
  await client.query(`UPDATE prediction_shields SET used = used + 1 WHERE user_id=$1`, [userId]);
}

// ─────────────────────────────────────────────

export async function getActivePrediction(pool: Pool, streamerId: number): Promise<PredictionRow | null> {
  await ensurePredictionsSchema(pool);

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

  const pred = r.rows[0] ?? null;
  if (!pred) return null;

  // ✅ auto-lock si la fenêtre de pari est terminée
  if (pred.status === "open" && pred.bets_close_at) {
    const upd = await pool.query(
      `
      UPDATE predictions
      SET status='locked'
      WHERE id=$1
        AND status='open'
        AND bets_close_at <= NOW()
      RETURNING *
      `,
      [pred.id]
    );
    if (upd.rows?.[0]) return upd.rows[0];
  }

  return pred;
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
  await ensurePredictionsSchema(pool);

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
  await ensurePredictionsSchema(pool);
  await ensureShieldsSchema(pool);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const r = await client.query(`SELECT user_id, amount, choice FROM prediction_bets WHERE prediction_id=$1`, [
      pred.id,
    ]);

    const bets = r.rows || [];
    const potTotal = bets.reduce((a, b) => a + Number(b.amount), 0);

    if (potTotal <= 0) {
      await client.query(`UPDATE predictions SET status='resolved', resolved_option=$1, resolved_at=NOW() WHERE id=$2`, [
        winning,
        pred.id,
      ]);
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

    // ✅ shields refund losers
    for (const l of losers) {
      const userId = Number(l.user_id);
      const stake = Number(l.amount);
      if (!(stake > 0)) continue;

      const betLevel = await getBetLevel(pool, userId);
      const premium = await isPremiumViewer(client, userId);

      const max = shieldMax(betLevel, premium);
      if (max <= 0) continue;

      const state = await getAndMaybeResetShieldState(client, userId);
      const used = Number(state.used || 0);
      const left = Math.max(0, max - used);
      if (left <= 0) continue;

      const refund = Math.min(stake, Math.ceil(stake * SHIELD_REFUND_PCT));
      if (refund <= 0) continue;

      await consumeShield(client, userId);

      await earnRubisTx(client, userId, "prediction_shield_refund", refund, {
        weight_bp: 2000,
        predictionId: pred.id,
        stake,
        betLevel,
        premiumViewer: premium,
        refundPct: SHIELD_REFUND_PCT,
        shieldPeriodDays: SHIELD_PERIOD_DAYS,
        shieldMax: max,
      });
    }

    // 🔒 finalise (+ resolved_at)
    await client.query(
      `
      UPDATE predictions
      SET status='resolved', resolved_option=$1, resolved_at=NOW()
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
