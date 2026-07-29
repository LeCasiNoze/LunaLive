import type { Pool } from "pg";

export async function mig133_rumble_outreach(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rumble_outreach_contacts (
      id                    BIGSERIAL PRIMARY KEY,
      slug                  TEXT NOT NULL UNIQUE,
      display_name          TEXT NOT NULL,
      rumble_url            TEXT NOT NULL,
      followers             INT NOT NULL DEFAULT 0,
      instagram_handle      TEXT,
      instagram_confidence  TEXT,
      telegram_handle       TEXT,
      telegram_url          TEXT,
      email                 TEXT,
      twitter_handle        TEXT,
      discord_url           TEXT,
      website_url           TEXT,
      about                 TEXT,
      source_data           JSONB NOT NULL DEFAULT '[]'::jsonb,
      investigated_at       TIMESTAMPTZ,
      status                TEXT NOT NULL DEFAULT 'new',
      preferred_channel     TEXT,
      draft_subject         TEXT,
      draft_message         TEXT,
      notes                 TEXT,
      contacted_at          TIMESTAMPTZ,
      next_follow_up_at     TIMESTAMPTZ,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rumble_outreach_activity (
      id          BIGSERIAL PRIMARY KEY,
      contact_id  BIGINT NOT NULL REFERENCES rumble_outreach_contacts(id) ON DELETE CASCADE,
      kind        TEXT NOT NULL,
      channel     TEXT,
      detail      TEXT,
      created_by  BIGINT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_rumble_outreach_status_followers
      ON rumble_outreach_contacts(status, followers DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_rumble_outreach_follow_up
      ON rumble_outreach_contacts(next_follow_up_at)
      WHERE next_follow_up_at IS NOT NULL
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_rumble_outreach_activity_contact
      ON rumble_outreach_activity(contact_id, created_at DESC)
  `);
}
