import type { Pool } from "pg";
import { getActivePrediction, createPrediction } from "./predictions.store.js";

const TZ = "Europe/Paris";

export async function assertStreamerLive(pool: Pool, streamerId: number) {
  const r = await pool.query(`SELECT is_live FROM streamers WHERE id=$1`, [streamerId]);
  if (!r.rows?.[0]?.is_live) throw new Error("stream_not_live");
}

async function getStreamerOwnerUserId(pool: Pool, streamerId: number): Promise<number | null> {
  const r = await pool.query(`SELECT user_id FROM streamers WHERE id=$1 LIMIT 1`, [streamerId]);
  const id = Number(r.rows?.[0]?.user_id || 0);
  return id > 0 ? id : null;
}

async function hasActiveStreamerSub(pool: Pool, userId: number): Promise<boolean> {
  const r = await pool.query(
    `
    SELECT 1
    FROM user_subscriptions us
    WHERE us.user_id=$1
      AND us.plan_code='streamer'
      AND us.status IN ('active','trialing')
      AND (us.current_period_end IS NULL OR us.current_period_end > NOW())
    LIMIT 1
    `,
    [userId]
  );
  return !!r.rows?.[0];
}

async function countResolvedToday(pool: Pool, streamerId: number): Promise<number> {
  // basé sur resolved_at (timezone Paris)
  const r = await pool.query(
    `
    SELECT COUNT(*)::int AS n
    FROM predictions
    WHERE streamer_id=$1
      AND status='resolved'
      AND resolved_at IS NOT NULL
      AND timezone($2, resolved_at)::date = timezone($2, NOW())::date
    `,
    [streamerId, TZ]
  );
  return Number(r.rows?.[0]?.n || 0);
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

  // ✅ limite/jour (comptée à la résolution)
  const ownerUserId = await getStreamerOwnerUserId(pool, streamerId);
  const hasSub = ownerUserId ? await hasActiveStreamerSub(pool, ownerUserId) : false;
  const limit = hasSub ? 3 : 1;

  const used = await countResolvedToday(pool, streamerId);
  if (used >= limit) throw new Error("daily_limit_reached");

  return createPrediction(pool, streamerId, question, o1, o2, duration, stake);
}
