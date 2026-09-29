import type { Pool } from "pg";

export async function mig139_rumble_call_undo(pool: Pool) {
  await pool.query(`ALTER TABLE calls_queue ADD COLUMN IF NOT EXISTS rumble_user_id TEXT NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS calls_queue_rumble_pending_idx
    ON calls_queue (streamer_id, rumble_user_id, created_at DESC)
    WHERE rumble_user_id IS NOT NULL AND bet IS NULL AND pay IS NULL AND COALESCE(is_bonus,FALSE)=FALSE`);
}
