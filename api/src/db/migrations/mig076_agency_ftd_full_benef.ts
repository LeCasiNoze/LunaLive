import type { Pool } from "pg";

/**
 * Ajoute ftd_full_benef sur les stats d'assignation agence.
 * ftd_full_benef = nombre de FTD que l'agence garde en "full bénef" :
 *   - l'affilié ne voit que (ftd - ftd_full_benef) FTDs
 *   - l'agence encaisse le CPA total sur ces FTDs (pas de partage avec l'affilié)
 */
export async function mig076_agency_ftd_full_benef(pool: Pool) {
  await pool.query(`
    ALTER TABLE agency_streamer_assignment_stats
    ADD COLUMN IF NOT EXISTS ftd_full_benef INT NULL DEFAULT NULL
      CHECK (ftd_full_benef IS NULL OR ftd_full_benef >= 0);
  `);
}
