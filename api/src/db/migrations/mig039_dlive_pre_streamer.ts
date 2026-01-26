// api/src/migrations/mig039_dlive_pre_streamer.ts
import type { Pool } from "pg";

export async function mig039_dlive_pre_streamer(pool: Pool) {
  await pool.query(`
    -- 1) Stockage DLive côté users (pré-streamer)
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS dlive_use_linked BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS dlive_link_displayname TEXT,
      ADD COLUMN IF NOT EXISTS dlive_link_username TEXT,
      ADD COLUMN IF NOT EXISTS dlive_linked_at TIMESTAMPTZ;

    -- 2) streamer_dlive_link_requests: ajout user_id
    ALTER TABLE streamer_dlive_link_requests
      ADD COLUMN IF NOT EXISTS user_id INT;

    -- 3) Backfill user_id depuis streamer_id -> streamers.user_id
    UPDATE streamer_dlive_link_requests r
    SET user_id = s.user_id
    FROM streamers s
    WHERE r.streamer_id = s.id
      AND r.user_id IS NULL;

    -- 4) streamer_id nullable (pré-streamer)
    ALTER TABLE streamer_dlive_link_requests
      ALTER COLUMN streamer_id DROP NOT NULL;

    -- 5) user_id obligatoire
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM streamer_dlive_link_requests WHERE user_id IS NULL) THEN
        RAISE EXCEPTION 'streamer_dlive_link_requests: user_id still NULL for some rows (cannot SET NOT NULL).';
      END IF;
    END $$;

    ALTER TABLE streamer_dlive_link_requests
      ALTER COLUMN user_id SET NOT NULL;

    -- 6) Unicité: 1 pending par user
    DROP INDEX IF EXISTS uniq_sdlr_pending;

    CREATE UNIQUE INDEX IF NOT EXISTS uniq_sdlr_pending_user
      ON streamer_dlive_link_requests(user_id)
      WHERE status='pending';

    CREATE INDEX IF NOT EXISTS idx_sdlr_user_status_created
      ON streamer_dlive_link_requests(user_id, status, created_at DESC);
  `);
}
