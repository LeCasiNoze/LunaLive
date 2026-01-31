// api/src/db/migrations/mig040_streamer_requests_fields.ts
import type { Pool } from "pg";

export async function mig040_streamer_requests_fields(pool: Pool) {
  await pool.query(`
    ALTER TABLE streamer_requests
      ADD COLUMN IF NOT EXISTS discord TEXT,
      ADD COLUMN IF NOT EXISTS channel_url TEXT,
      ADD COLUMN IF NOT EXISTS has_channel BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS has_dlive BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS dlive_displayname TEXT,
      ADD COLUMN IF NOT EXISTS rules_accepted BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;
      ADD COLUMN IF NOT EXISTS links_text TEXT NULL,
      ADD COLUMN IF NOT EXISTS notes TEXT NULL;
      
    CREATE INDEX IF NOT EXISTS idx_streamer_requests_status
      ON streamer_requests(status);

    CREATE INDEX IF NOT EXISTS idx_streamer_requests_updated_at
      ON streamer_requests(updated_at DESC);
  `);
}
