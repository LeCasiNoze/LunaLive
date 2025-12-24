// api/src/db/migrations/mig002_chat_tables.ts
import type { Pool } from "pg";

export async function mig002_chat_tables(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id BIGSERIAL PRIMARY KEY,
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ NULL,
      deleted_by INT NULL REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS chat_bans (
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by INT NULL REFERENCES users(id) ON DELETE SET NULL,
      reason TEXT NULL,
      PRIMARY KEY (streamer_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS chat_timeouts (
      id BIGSERIAL PRIMARY KEY,
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      created_by INT NULL REFERENCES users(id) ON DELETE SET NULL,
      reason TEXT NULL
    );

    CREATE TABLE IF NOT EXISTS streamer_mods (
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by INT NULL REFERENCES users(id) ON DELETE SET NULL,
      removed_at TIMESTAMPTZ NULL,
      removed_by INT NULL REFERENCES users(id) ON DELETE SET NULL,
      PRIMARY KEY (streamer_id, user_id)
    );
  `);
}
