import type { Pool } from "pg";

export async function mig114_tiktok_follow_graph(pool: Pool) {
  // /following d'un seed (extension dump). Sert à calculer follow_overlap.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tiktok_seed_follows (
      seed_id BIGINT NOT NULL REFERENCES tiktok_seed_accounts(id) ON DELETE CASCADE,
      candidate_handle TEXT NOT NULL,
      scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (seed_id, candidate_handle)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tiktok_seed_follows_handle
      ON tiktok_seed_follows (candidate_handle);
  `);

  // /following d'un candidat (extension dump). Sert à calculer la mutualité :
  // combien de NOS seeds ce candidat suit-il en retour ?
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tiktok_candidate_follows (
      candidate_handle TEXT NOT NULL,
      follows_handle TEXT NOT NULL,
      scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (candidate_handle, follows_handle)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tiktok_candidate_follows_target
      ON tiktok_candidate_follows (follows_handle);
  `);
}
