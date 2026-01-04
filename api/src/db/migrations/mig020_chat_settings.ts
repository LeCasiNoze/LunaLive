import type { Pool } from "pg";

export async function mig020_chat_settings(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS streamer_chat_settings (
      streamer_id INT PRIMARY KEY REFERENCES streamers(id) ON DELETE CASCADE,

      allow_links BOOLEAN NOT NULL DEFAULT TRUE,
      follow_only BOOLEAN NOT NULL DEFAULT FALSE,
      sub_only    BOOLEAN NOT NULL DEFAULT FALSE,

      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_by_user_id INT NULL REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_streamer_chat_settings_updated_at
      ON streamer_chat_settings(updated_at);
  `);
}
