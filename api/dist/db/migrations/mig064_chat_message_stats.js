export async function mig064_chat_message_stats(pool) {
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
