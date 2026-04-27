// api/src/db/migrations/mig086_chat_messages_drop_fk.ts
// Le bridge Rumble écrit dans chat_messages avec user_id=0 (sentinel) pour
// les messages externes. La FK chat_messages.user_id → users(id) bloque ces
// inserts (FK violation). On drop la contrainte — l'app s'occupe déjà de
// distinguer user_id=0 (system/external) du reste.
import type { Pool } from "pg";

export async function mig086_chat_messages_drop_fk(pool: Pool) {
  await pool.query(`
    ALTER TABLE chat_messages
      DROP CONSTRAINT IF EXISTS chat_messages_user_id_fkey;
  `);
}
