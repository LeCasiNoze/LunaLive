// api/src/db/migrations/mig092_discord_notif_cooldown.ts
import type { Pool } from "pg";

export async function mig092_discord_notif_cooldown(pool: Pool) {
  await pool.query(`
    ALTER TABLE streamers
      ADD COLUMN IF NOT EXISTS discord_notif_last_sent_at TIMESTAMPTZ;
  `);
}
