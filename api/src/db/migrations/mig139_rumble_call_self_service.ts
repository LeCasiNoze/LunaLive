import type { Pool } from "pg";

export async function mig139_rumble_call_self_service(pool: Pool) {
  await pool.query(`
    ALTER TABLE calls_queue ADD COLUMN IF NOT EXISTS rumble_user_id TEXT NULL;
    CREATE TABLE IF NOT EXISTS rumble_call_links (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      streamer_id BIGINT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      rumble_user_id TEXT NOT NULL,
      rumble_username TEXT NOT NULL,
      linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (streamer_id, rumble_user_id)
    );
    CREATE TABLE IF NOT EXISTS rumble_call_link_codes (
      code_hash TEXT PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      streamer_id BIGINT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS rumble_call_link_codes_expiry_idx ON rumble_call_link_codes(expires_at);
  `);
}
