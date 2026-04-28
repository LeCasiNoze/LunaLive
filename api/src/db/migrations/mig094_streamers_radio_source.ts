// api/src/db/migrations/mig094_streamers_radio_source.ts
import type { Pool } from "pg";

/**
 * Ajoute une colonne radio_source BOOLEAN sur streamers.
 * Quand true, le streamer est éligible comme source pour la rotation auto
 * de la radio (id=32). Permet de curated la liste (vs piocher tout streamer
 * Rumble live, ce qui inclurait des chaines individuelles non destinées
 * à la radio comme lhasardcasin/lesbarjotsducasino).
 */
export async function mig094_streamers_radio_source(pool: Pool) {
  await pool.query(`
    ALTER TABLE streamers
      ADD COLUMN IF NOT EXISTS radio_source BOOLEAN NOT NULL DEFAULT FALSE;
  `);
}
