import type { Pool } from "pg";

export async function mig136_seeded_rumble_chat_mirror(pool: Pool) {
  await pool.query(`
    ALTER TABLE seeded_streamer_accounts
      ADD COLUMN IF NOT EXISTS chat_mirror_initialized BOOLEAN NOT NULL DEFAULT FALSE
  `);

  await pool.query(`
    INSERT INTO streamer_chat_settings (streamer_id, dlive_sync_public, dlive_sync_popup)
    SELECT streamer_id, TRUE, TRUE
      FROM seeded_streamer_accounts
     WHERE lower(source_platform) = 'rumble'
       AND chat_mirror_initialized = FALSE
    ON CONFLICT (streamer_id) DO UPDATE
      SET dlive_sync_public = TRUE,
          dlive_sync_popup = TRUE,
          updated_at = NOW()
  `);

  await pool.query(`
    UPDATE seeded_streamer_accounts
       SET chat_mirror_initialized = TRUE,
           updated_at = NOW()
     WHERE lower(source_platform) = 'rumble'
       AND chat_mirror_initialized = FALSE
  `);
}
