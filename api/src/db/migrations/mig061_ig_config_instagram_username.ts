// api/src/db/migrations/mig061_ig_config_instagram_username.ts
import type { Pool } from "pg";

export async function mig061_ig_config_instagram_username(pool: Pool) {
  await pool.query(`
    ALTER TABLE streamer_ig_config
      ADD COLUMN IF NOT EXISTS instagram_username VARCHAR(100);
  `);
}
