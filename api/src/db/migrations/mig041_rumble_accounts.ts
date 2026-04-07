// api/src/db/migrations/mig041_rumble_accounts.ts
import type { Pool } from "pg";

export async function mig041_rumble_accounts(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rumble_accounts (
      id SERIAL PRIMARY KEY,
      username VARCHAR(255) NOT NULL,
      api_key TEXT NOT NULL,
      rtmp_url VARCHAR(255) DEFAULT 'rtmp://live.rumble.com/live',
      stream_key VARCHAR(255) NOT NULL,
      assigned_to_streamer_id INTEGER REFERENCES streamers(id) ON DELETE SET NULL,
      assigned_at TIMESTAMP,
      released_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_rumble_accounts_streamer_id 
    ON rumble_accounts(assigned_to_streamer_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_rumble_accounts_username 
    ON rumble_accounts(username)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_rumble_accounts_updated_at 
    ON rumble_accounts(updated_at)
  `);
}
