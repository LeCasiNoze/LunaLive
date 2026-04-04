// api/src/db/migrations/mig056_ig_comment_tracking.ts
// Tables pour le scheduler de commentaires Instagram :
//   - ig_comment_tracking : posts en cours de monitoring (72h après publication)
//   - ig_comment_replies  : commentaires déjà traités (anti-doublon)
//
// Idempotente (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

import type { Pool } from "pg";

export async function mig056_ig_comment_tracking(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ig_comment_tracking (
      id              SERIAL PRIMARY KEY,
      publish_job_id  INTEGER NOT NULL REFERENCES publish_jobs(id) ON DELETE CASCADE,
      clip_id         INTEGER NOT NULL,
      streamer_slug   VARCHAR(100) NOT NULL,
      media_id        TEXT NOT NULL,
      track_until     TIMESTAMP NOT NULL,
      last_checked_at TIMESTAMP,
      created_at      TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_ig_comment_tracking_active
      ON ig_comment_tracking (track_until);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ig_comment_replies (
      id           SERIAL PRIMARY KEY,
      comment_id   TEXT NOT NULL UNIQUE,
      media_id     TEXT NOT NULL,
      username     TEXT NOT NULL,
      comment_text TEXT,
      replied_at   TIMESTAMP NOT NULL DEFAULT NOW(),
      dm_sent      BOOLEAN NOT NULL DEFAULT false,
      dm_sent_at   TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_ig_comment_replies_media
      ON ig_comment_replies (media_id, replied_at DESC);
  `);
}
