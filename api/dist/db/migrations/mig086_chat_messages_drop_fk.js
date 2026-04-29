export async function mig086_chat_messages_drop_fk(pool) {
    await pool.query(`
    ALTER TABLE chat_messages
      DROP CONSTRAINT IF EXISTS chat_messages_user_id_fkey;
  `);
}
