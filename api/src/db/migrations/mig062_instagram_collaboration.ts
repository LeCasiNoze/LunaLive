// api/src/db/migrations/mig062_instagram_collaboration.ts
// Ajoute le support des collaborations Instagram avec timeout et fallback

import type { Pool } from "pg";

export async function mig062_instagram_collaboration(pool: Pool) {
  // 1. Ajouter les colonnes de suivi de collaboration dans publish_jobs
  await pool.query(`
    ALTER TABLE publish_jobs
      ADD COLUMN IF NOT EXISTS collaboration_attempted BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS collaboration_username VARCHAR(100),
      ADD COLUMN IF NOT EXISTS collaboration_started_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS collaboration_timeout_sec INTEGER DEFAULT 1200, -- 20 minutes
      ADD COLUMN IF NOT EXISTS collaboration_status VARCHAR(20) DEFAULT 'none', -- none, pending, success, failed, timeout
      ADD COLUMN IF NOT EXISTS collaboration_media_id TEXT,
      ADD COLUMN IF NOT EXISTS collaboration_error_msg TEXT
  `);

  // 2. Index pour optimiser la recherche des collaborations en timeout
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_publish_jobs_collaboration_pending 
      ON publish_jobs (collaboration_status, collaboration_started_at)
      WHERE collaboration_status = 'pending'
  `);

  // 3. Table pour suivre les tentatives de collaboration
  await pool.query(`
    CREATE TABLE IF NOT EXISTS instagram_collaborations (
      id SERIAL PRIMARY KEY,
      publish_job_id INTEGER REFERENCES publish_jobs(id),
      streamer_slug VARCHAR(100) NOT NULL,
      instagram_username VARCHAR(100),
      status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, success, failed, timeout
      media_id TEXT,
      permalink TEXT,
      error_msg TEXT,
      started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      completed_at TIMESTAMP WITH TIME ZONE,
      timeout_sec INTEGER DEFAULT 1200,
      fallback_to_mention BOOLEAN DEFAULT TRUE
    );
  `);

  // 4. Index pour la table des collaborations
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_instagram_collaborations_job_id 
      ON instagram_collaborations(publish_job_id);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_instagram_collaborations_status_started 
      ON instagram_collaborations(status, started_at);
  `);

  console.log("[migration] Instagram collaboration support added successfully");
}
