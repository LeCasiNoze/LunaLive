export async function mig085_chat_messages_external_source(pool) {
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
