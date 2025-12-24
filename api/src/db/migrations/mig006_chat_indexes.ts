// api/src/db/migrations/mig006_chat_indexes.ts
import type { Pool } from "pg";

export async function mig006_chat_indexes(pool: Pool) {
  await pool.query(`
    CREATE INDEX IF NOT EXISTS chat_messages_streamer_created_idx
    ON chat_messages(streamer_id, created_at DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS chat_messages_streamer_user_created_idx
    ON chat_messages(streamer_id, user_id, created_at DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS chat_timeouts_streamer_user_expires_idx
    ON chat_timeouts(streamer_id, user_id, expires_at DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS streamer_mods_streamer_active_idx
    ON streamer_mods(streamer_id)
    WHERE removed_at IS NULL;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS streamer_mods_streamer_removed_idx
    ON streamer_mods(streamer_id, removed_at DESC)
    WHERE removed_at IS NOT NULL;
  `);
}
