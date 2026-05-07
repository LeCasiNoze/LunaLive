import type { Pool } from "pg";

export async function mig112_instagram_agenda_board(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS instagram_agenda_board (
      id                INT  PRIMARY KEY,
      channel_id        TEXT NOT NULL,
      message_id        TEXT,
      last_refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT instagram_agenda_board_singleton CHECK (id = 1)
    );
  `);
}
