import type { Pool } from 'pg';
export async function mig141_automod_feedback(pool:Pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS automod_feedback (
 id UUID PRIMARY KEY,
 streamer_id BIGINT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 payload JSONB NOT NULL
 ); CREATE INDEX IF NOT EXISTS idx_automod_feedback_streamer ON automod_feedback(streamer_id,created_at DESC);`);
}
