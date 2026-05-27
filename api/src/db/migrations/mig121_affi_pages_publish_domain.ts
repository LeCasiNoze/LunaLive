import type { Pool } from "pg";

// Cible de publication : "lunalive" (defaut) ou "landaurax".
// Une landing peut etre publiee sur le domaine principal lunalive.win
// OU sur le 2e domaine landaurax.com (site de publication separe).
export async function mig121_affi_pages_publish_domain(pool: Pool) {
  await pool.query(`
    ALTER TABLE affi_landing_pages
      ADD COLUMN IF NOT EXISTS publish_domain TEXT NOT NULL DEFAULT 'lunalive'
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_affi_landing_pages_publish_domain
      ON affi_landing_pages (publish_domain)
  `);
}
