import type { Pool } from "pg";

export async function mig079_casino_offer_role(pool: Pool) {
  await pool.query(`
    ALTER TABLE discord_casino_offers
      ADD COLUMN IF NOT EXISTS discord_role_id TEXT;
  `);
}
