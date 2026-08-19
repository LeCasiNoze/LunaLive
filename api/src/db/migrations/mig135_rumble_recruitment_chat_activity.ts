import type { Pool } from "pg";

export async function mig135_rumble_recruitment_chat_activity(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rumble_outreach_chat_activity (
      contact_id   BIGINT NOT NULL REFERENCES rumble_outreach_contacts(id) ON DELETE CASCADE,
      video_id     TEXT NOT NULL,
      message_id   TEXT NOT NULL,
      chatter_key  TEXT NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (contact_id, video_id, message_id)
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_rumble_outreach_chat_activity_chatters
      ON rumble_outreach_chat_activity(contact_id, video_id, chatter_key)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rumble_outreach_chatters (
      contact_id   BIGINT NOT NULL REFERENCES rumble_outreach_contacts(id) ON DELETE CASCADE,
      video_id     TEXT NOT NULL,
      chatter_key  TEXT NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (contact_id, video_id, chatter_key)
    )
  `);
}
