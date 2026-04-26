// api/src/db/migrations/mig083_rumble_chat.ts
// Bot Rumble (singleton) + persistance des messages chat Rumble côté Luna.
import type { Pool } from "pg";

export async function mig083_rumble_chat(pool: Pool) {
  // Session du compte Rumble qui poste/lit pour LunaLive (un seul bot global).
  // On stocke le cookie de session brut (header Cookie complet) — Rumble n'expose
  // pas de token API pour le chat, l'auth est cookie-based.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rumble_bot_session (
      id              SMALLINT PRIMARY KEY DEFAULT 1,
      username        TEXT,
      cookie          TEXT,
      user_agent      TEXT,
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT rumble_bot_session_singleton CHECK (id = 1)
    );
  `);
  await pool.query(`INSERT INTO rumble_bot_session (id) VALUES (1) ON CONFLICT DO NOTHING;`);

  // streamer_rumble_info.live_video_id_numeric : id numérique Rumble pour les endpoints chat.
  await pool.query(`
    ALTER TABLE streamer_rumble_info
      ADD COLUMN IF NOT EXISTS live_video_id_numeric TEXT;
  `);

  // Archivage des messages Rumble vus par le bridge.
  // On stocke un identifiant Rumble pour dédoublonner sur reconnexion,
  // et on garde le payload brut au cas où.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rumble_chat_messages (
      id              BIGSERIAL PRIMARY KEY,
      streamer_id     INTEGER NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      rumble_msg_id   TEXT,
      rumble_user_id  TEXT,
      username        TEXT NOT NULL,
      body            TEXT NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      raw             JSONB
    );
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_rumble_chat_msg_id
      ON rumble_chat_messages (streamer_id, rumble_msg_id)
      WHERE rumble_msg_id IS NOT NULL;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_rumble_chat_streamer_created
      ON rumble_chat_messages (streamer_id, created_at DESC);
  `);
}
