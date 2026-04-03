// api/src/db/migrations/mig055_publish_jobs.ts
// Assure l'existence des tables partagées avec lunaclip-local :
//   - edit_jobs      : jobs de rendu vidéo (output_url = URL R2 publique)
//   - clip_inbox     : état des clips par plateforme
//   - publish_jobs   : jobs de publication planifiée (instagram, youtube_shorts, ...)
//
// Ces tables peuvent déjà exister (créées par lunaclip-local sur la même DB).
// Toutes les instructions utilisent IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
// Cette migration est donc idempotente.

import type { Pool } from "pg";

export async function mig055_publish_jobs(pool: Pool) {
  // ── 1. edit_jobs (référencé par publish_jobs) ────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS edit_jobs (
      id          SERIAL PRIMARY KEY,
      clip_id     INTEGER,
      output_url  TEXT,
      status      VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // ── 2. clip_inbox ────────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clip_inbox (
      clip_id           INTEGER PRIMARY KEY,
      instagram_status  VARCHAR(25) NOT NULL DEFAULT 'none',
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Colonne updated_at utilisée par le scheduler lors du marquage 'instagram_posted'
  await pool.query(`
    ALTER TABLE clip_inbox
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
  `);

  // ── 3. publish_jobs ──────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS publish_jobs (
      id            SERIAL PRIMARY KEY,
      edit_job_id   INTEGER REFERENCES edit_jobs(id),
      clip_id       INTEGER,
      platform      VARCHAR(30)  NOT NULL,
      status        VARCHAR(20)  NOT NULL DEFAULT 'scheduled',
      title         TEXT,
      description   TEXT,
      scheduled_at  TIMESTAMP,
      platform_url  TEXT,
      error_msg     TEXT,
      finished_at   TIMESTAMP,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Colonnes ajoutées par LunaLive (absentes du schéma lunaclip-local initial)
  await pool.query(`
    ALTER TABLE publish_jobs
      ADD COLUMN IF NOT EXISTS started_at   TIMESTAMP;
  `);

  await pool.query(`
    ALTER TABLE publish_jobs
      ADD COLUMN IF NOT EXISTS platform_id  TEXT;
  `);

  // ── Index utiles pour le scheduler ──────────────────────────────────────
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_publish_jobs_scheduled
      ON publish_jobs (platform, status, scheduled_at)
      WHERE status = 'scheduled';
  `);
}
