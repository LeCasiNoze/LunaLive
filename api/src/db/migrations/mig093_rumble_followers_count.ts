// api/src/db/migrations/mig093_rumble_followers_count.ts
import type { Pool } from "pg";

export async function mig093_rumble_followers_count(pool: Pool) {
  await pool.query(`
    ALTER TABLE streamer_rumble_info
      ADD COLUMN IF NOT EXISTS followers_count INTEGER,
      ADD COLUMN IF NOT EXISTS followers_updated_at TIMESTAMPTZ;
  `);
}
