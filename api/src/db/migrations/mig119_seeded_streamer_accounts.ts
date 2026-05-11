import type { Pool } from "pg";

export async function mig119_seeded_streamer_accounts(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS seeded_streamer_accounts (
      id BIGSERIAL PRIMARY KEY,
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source_platform TEXT NOT NULL DEFAULT 'rumble',
      source_username TEXT NOT NULL,
      source_url TEXT NULL,
      access_username TEXT NOT NULL,
      access_email TEXT NOT NULL,
      access_password_plain TEXT NOT NULL,
      bot_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      notes TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS seeded_streamer_accounts_streamer_uq
      ON seeded_streamer_accounts (streamer_id);
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS seeded_streamer_accounts_user_uq
      ON seeded_streamer_accounts (user_id);
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS seeded_streamer_accounts_source_uq
      ON seeded_streamer_accounts (lower(source_platform), lower(source_username));
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS seeded_streamer_accounts_created_idx
      ON seeded_streamer_accounts (created_at DESC);
  `);
}
