// api/src/db/migrations/mig064_chat_message_stats.ts
// Table de stats de messages agrégées.
// Alimentée par cleanupOldMessages avant chaque purge,
// ce qui garantit que les counts sont conservés après suppression.
import type { Pool } from "pg";

export async function mig064_chat_message_stats(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_message_stats (
      user_id     INT NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      messages_sent    BIGINT       NOT NULL DEFAULT 0,
      first_message_at TIMESTAMPTZ,
      last_message_at  TIMESTAMPTZ,
      PRIMARY KEY (user_id, streamer_id)
    );

    CREATE INDEX IF NOT EXISTS chat_msg_stats_streamer_idx ON chat_message_stats (streamer_id);
    CREATE INDEX IF NOT EXISTS chat_msg_stats_user_idx     ON chat_message_stats (user_id);
  `);
}
