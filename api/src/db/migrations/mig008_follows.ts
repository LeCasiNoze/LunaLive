// api/src/db/migrations/mig008_follows.ts
import type { Pool } from "pg";

export async function mig008_follows(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS streamer_follows (
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (streamer_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS streamer_follows_streamer_idx
      ON streamer_follows(streamer_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS streamer_follows_user_idx
      ON streamer_follows(user_id, created_at DESC);
  `);

  await pool.query(`
    ALTER TABLE streamer_follows
    ADD COLUMN IF NOT EXISTS notify_enabled BOOLEAN NOT NULL DEFAULT TRUE;
  `);
}
