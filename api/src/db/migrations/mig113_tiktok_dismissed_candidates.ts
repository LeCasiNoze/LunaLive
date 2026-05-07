import type { Pool } from "pg";

export async function mig113_tiktok_dismissed_candidates(pool: Pool) {
  // Candidats explicitement écartés par l'utilisateur dans le FSB Board.
  // On les exclut du listing des candidats sans les supprimer de
  // tiktok_network_links (le signal reste, mais ne remonte plus).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tiktok_dismissed_candidates (
      handle TEXT PRIMARY KEY,
      dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reason TEXT
    );
  `);
}
