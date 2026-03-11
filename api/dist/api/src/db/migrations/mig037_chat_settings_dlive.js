export async function mig037_chat_settings_dlive(pool) {
    await pool.query(`
    ALTER TABLE streamer_chat_settings
      ADD COLUMN IF NOT EXISTS dlive_username TEXT;

    ALTER TABLE streamer_chat_settings
      ADD COLUMN IF NOT EXISTS dlive_sync_public BOOLEAN NOT NULL DEFAULT FALSE;

    ALTER TABLE streamer_chat_settings
      ADD COLUMN IF NOT EXISTS dlive_sync_popup BOOLEAN NOT NULL DEFAULT FALSE;

    CREATE INDEX IF NOT EXISTS idx_streamer_chat_settings_dlive_username
      ON streamer_chat_settings(dlive_username);
  `);
}
