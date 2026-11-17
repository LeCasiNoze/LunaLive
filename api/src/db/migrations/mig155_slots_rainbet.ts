import type { Pool } from "pg";

// Rainbet = source de vérité du catalogue des calls : seules les lignes vues
// lors d'un crawl Rainbet sont proposées aux !call et recherches. Les autres
// restent en base pour l'affichage des calls/hunts existants.
export async function mig155_slots_rainbet(pool: Pool) {
  await pool.query(`
    ALTER TABLE IF EXISTS slots_catalog
      ADD COLUMN IF NOT EXISTS rainbet_seen_at TIMESTAMPTZ NULL;
  `);
}
