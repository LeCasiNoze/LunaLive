import type { Pool } from "pg";

export async function mig106_tiktok_network_following_enrich(pool: Pool) {
  // 1) Étend signal_type pour inclure 'following' (le seed suit ce compte)
  await pool.query(`
    ALTER TABLE tiktok_network_links
      DROP CONSTRAINT IF EXISTS tiktok_network_links_signal_check;
  `);
  await pool.query(`
    ALTER TABLE tiktok_network_links
      ADD CONSTRAINT tiktok_network_links_signal_check CHECK (
        signal_type IN (
          'comment','mention','duet',
          'affil_comment','affil_mention',
          'following'
        )
      );
  `);

  // 2) Source video URL pour traçabilité (utile pour comment/mention/affil_*).
  //    NULL pour 'following' (pas de vidéo concernée).
  await pool.query(`
    ALTER TABLE tiktok_network_links
      ADD COLUMN IF NOT EXISTS source_video_url TEXT NULL;
  `);

  // 3) Cache des profils des candidats (enrichissement à la demande).
  //    Évite de polluer tiktok_influencers tant qu'on n'a pas décidé d'importer.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tiktok_candidate_profiles (
      handle TEXT PRIMARY KEY,
      display_name TEXT NULL,
      bio TEXT NULL,
      bio_email TEXT NULL,
      avatar_url TEXT NULL,
      follower_count BIGINT NULL,
      following_count BIGINT NULL,
      heart_count BIGINT NULL,
      video_count BIGINT NULL,
      verified BOOLEAN NOT NULL DEFAULT FALSE,
      region TEXT NULL,
      raw JSONB NULL,
      last_enriched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tiktok_candidate_profiles_followers
      ON tiktok_candidate_profiles (follower_count DESC);
  `);
}
