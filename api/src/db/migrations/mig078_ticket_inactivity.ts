import type { Pool } from "pg";

export async function mig078_ticket_inactivity(pool: Pool) {
  await pool.query(`
    ALTER TABLE discord_casino_tickets
      ADD COLUMN IF NOT EXISTS reminder_count SMALLINT NOT NULL DEFAULT 0;
  `);
}
