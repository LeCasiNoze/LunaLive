// api/src/db/migrations/mig015_cosmetics_equipped.ts
import type { Pool } from "pg";

export async function mig015_cosmetics_equipped(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_equipped_cosmetics (
      user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

      username_code TEXT NULL, -- skin pseudo (ex: ghost_purple, rainbow_scroll, etc.)
      badge_code    TEXT NULL, -- 1 seul badge
      title_code    TEXT NULL, -- 1 seul titre
      frame_code    TEXT NULL,
      hat_code      TEXT NULL,

      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  // Avatars (stockés en DB, 1 par user)
    await pool.query(`
    CREATE TABLE IF NOT EXISTS user_avatars (
        user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        mime TEXT NOT NULL,
        bytes BYTEA NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    `);

}
