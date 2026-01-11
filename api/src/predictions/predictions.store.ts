// api/src/predictions/predictions.store.ts
import type { Pool } from "pg";
import { spendRubis, earnRubis } from "../wallet_engine.js";
import type { PredictionRow } from "./predictions.types.js";

const TAX_RATE = 0.10;

export async function getActivePrediction(
  pool: Pool,
  streamerId: number
): Promise<PredictionRow | null> {
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

export async function addBet(
  pool: Pool,
  pred: PredictionRow,
  userId: number,
  choice: 1 | 2,
  stake: number
) {
  // 🔥 Débit rubis (SINK → poids bas en priorité)
  await spendRubis({
    userId,
    amount: stake,
    spendKind: "sink",
    spendType: "prediction_bet",
    streamerId: pred.streamer_id,
    meta: { predictionId: pred.id, choice },
  });

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

export async function resolvePrediction(
  pool: Pool,
  pred: PredictionRow,
  winning: 1 | 2
) {
  const r = await pool.query(
    `SELECT user_id, amount, choice FROM prediction_bets WHERE prediction_id=$1`,
    [pred.id]
  );

  const bets = r.rows;
  const potTotal = bets.reduce((a, b) => a + Number(b.amount), 0);
  if (potTotal <= 0) {
    await pool.query(
      `UPDATE predictions SET status='resolved', resolved_option=$1 WHERE id=$2`,
      [winning, pred.id]
    );
    return;
  }

  const tax = Math.floor(potTotal * TAX_RATE);
  const potNet = potTotal - tax;

  const winners = bets.filter((b) => b.choice === winning);
  const poolWin = winners.reduce((a, b) => a + Number(b.amount), 0);

  if (poolWin > 0 && potNet > 0) {
    for (const w of winners) {
      const gain = Math.floor((Number(w.amount) * potNet) / poolWin);
      if (gain > 0) {
        // 💎 Gain rubis (poids = origin prediction_win → 0.2)
        await earnRubis(
          Number(w.user_id),
          "prediction_win",
          gain,
          { predictionId: pred.id }
        );
      }
    }
  }

  // 🔒 Finalise
  await pool.query(
    `
    UPDATE predictions
    SET status='resolved', resolved_option=$1
    WHERE id=$2
    `,
    [winning, pred.id]
  );
}
