// api/src/predictions/predictions.service.ts
import type { Pool } from "pg";
import {
  getActivePrediction,
  createPrediction,
} from "./predictions.store.js";

export async function assertStreamerLive(pool: Pool, streamerId: number) {
  const r = await pool.query(
    `SELECT is_live FROM streamers WHERE id=$1`,
    [streamerId]
  );
  if (!r.rows?.[0]?.is_live) {
    throw new Error("stream_not_live");
  }
}

export async function createPredictionSafe(
  pool: Pool,
  streamerId: number,
  question: string,
  o1: string,
  o2: string,
  duration: number,
  stake: number
) {
  await assertStreamerLive(pool, streamerId);

  const active = await getActivePrediction(pool, streamerId);
  if (active) throw new Error("already_active");

  return createPrediction(pool, streamerId, question, o1, o2, duration, stake);
}
