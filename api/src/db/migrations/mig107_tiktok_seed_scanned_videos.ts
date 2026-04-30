import type { Pool } from "pg";

export async function mig107_tiktok_seed_scanned_videos(pool: Pool) {
  // Vidéos déjà scrapées par seed → on évite de retraiter les mêmes au scan
  // suivant. Sert aussi de log pour comprendre la couverture.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tiktok_seed_scanned_videos (
      id BIGSERIAL PRIMARY KEY,
      seed_id BIGINT NOT NULL REFERENCES tiktok_seed_accounts(id) ON DELETE CASCADE,
      video_url TEXT NOT NULL,
      scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      signals_found INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT tiktok_seed_scanned_videos_unique UNIQUE (seed_id, video_url)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tiktok_seed_scanned_videos_seed
      ON tiktok_seed_scanned_videos (seed_id);
  `);
}
