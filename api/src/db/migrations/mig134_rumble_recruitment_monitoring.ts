import type { Pool } from "pg";

export async function mig134_rumble_recruitment_monitoring(pool: Pool) {
  await pool.query(`
    ALTER TABLE rumble_outreach_contacts
      ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS viewers_current INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS viewers_avg INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS viewers_peak INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS viewers_samples INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS streams_observed INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS unique_chatters_current INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS unique_chatters_avg INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS unique_chatters_peak INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS chat_messages_current INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS chat_messages_avg INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS live_video_id TEXT,
      ADD COLUMN IF NOT EXISTS live_video_id_numeric TEXT,
      ADD COLUMN IF NOT EXISTS live_started_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS last_stream_started_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS last_stream_ended_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS monitoring_updated_at TIMESTAMPTZ
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rumble_outreach_streams (
      id                 BIGSERIAL PRIMARY KEY,
      contact_id         BIGINT NOT NULL REFERENCES rumble_outreach_contacts(id) ON DELETE CASCADE,
      video_id           TEXT NOT NULL,
      video_id_numeric   TEXT,
      started_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at           TIMESTAMPTZ,
      viewers_sum        BIGINT NOT NULL DEFAULT 0,
      viewers_samples    INT NOT NULL DEFAULT 0,
      viewers_avg        INT NOT NULL DEFAULT 0,
      viewers_peak       INT NOT NULL DEFAULT 0,
      unique_chatters    INT NOT NULL DEFAULT 0,
      chat_messages      INT NOT NULL DEFAULT 0,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(contact_id, video_id)
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_rumble_outreach_monitor_due
      ON rumble_outreach_contacts(is_live, monitoring_updated_at)
      WHERE status NOT IN ('do_not_contact', 'skipped')
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_rumble_outreach_streams_contact
      ON rumble_outreach_streams(contact_id, started_at DESC)
  `);
}
