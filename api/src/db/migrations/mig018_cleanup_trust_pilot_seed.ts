// api/src/db/migrations/mig018_cleanup_trust_pilot_seed.ts
import type { Pool } from "pg";

export async function mig018_cleanup_trust_pilot_seed(pool: Pool) {
  await pool.query(`
    DELETE FROM casino_affiliate_links
    WHERE target_url = 'https://example.com/bonus';
  `);

  await pool.query(`
    DELETE FROM casino_listings
    WHERE slug IN ('brutalcasino','hypebet');
  `);
}
