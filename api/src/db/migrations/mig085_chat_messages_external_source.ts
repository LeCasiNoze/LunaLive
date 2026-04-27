// api/src/db/migrations/mig085_chat_messages_external_source.ts
// Marqueur pour les messages externes (Rumble bridge) injectés dans chat_messages.
// Permet au bot service de polluer chat_messages comme source unique tout en
// distinguant les messages Luna natifs des messages bridgés.
import type { Pool } from "pg";

export async function mig085_chat_messages_external_source(pool: Pool) {
  await pool.query(`
    ALTER TABLE chat_messages
      ADD COLUMN IF NOT EXISTS external_source TEXT,
      ADD COLUMN IF NOT EXISTS external_msg_id TEXT;
  `);
  // Index pour dedup côté insert (bridge Rumble : evite doublons si reconnect SSE)
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_messages_external
      ON chat_messages (streamer_id, external_source, external_msg_id)
      WHERE external_source IS NOT NULL AND external_msg_id IS NOT NULL;
  `);
}
