import type { Pool } from "pg";

export async function mig043_discord_linking(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS discord_links (
      discord_user_id TEXT PRIMARY KEY,
      user_id INT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_sync_at TIMESTAMPTZ NULL
    );

    CREATE TABLE IF NOT EXISTS discord_link_codes (
      id SERIAL PRIMARY KEY,
      discord_user_id TEXT NOT NULL,
      code_hash TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_discord_link_codes_discord_user_id ON discord_link_codes(discord_user_id);
    CREATE INDEX IF NOT EXISTS idx_discord_link_codes_expires ON discord_link_codes(expires_at);
  `);
}
