import type { Pool } from 'pg';
export async function mig143_automod_hunt_reservations(pool:Pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS automod_hunt_reservations (
    streamer_id BIGINT NOT NULL REFERENCES streamers(id),entry_id TEXT NOT NULL,
    slot_key TEXT NOT NULL,slot_name TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','opening','opened','failed')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(streamer_id,entry_id));
    CREATE INDEX IF NOT EXISTS automod_hunt_pending_slot ON automod_hunt_reservations(streamer_id,slot_key) WHERE status<>'opened';`);
  await pool.query(`CREATE TABLE IF NOT EXISTS automod_hunt_reports(streamer_id BIGINT NOT NULL REFERENCES streamers(id),report_id TEXT NOT NULL,payload JSONB NOT NULL,sent BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(streamer_id,report_id));`);
}
