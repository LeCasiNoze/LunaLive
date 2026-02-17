import type { Pool } from "pg";

export async function mig021_streamer_tabs(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS streamer_about_blocks (
      id SERIAL PRIMARY KEY,
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      position INT NOT NULL,
      image_url TEXT NULL,
      link_url TEXT NULL,
      description TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_streamer_about_blocks_streamer_pos
      ON streamer_about_blocks(streamer_id, position);

    CREATE TABLE IF NOT EXISTS streamer_agenda_rules (
      id SERIAL PRIMARY KEY,
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('regular','event')),
      title TEXT NOT NULL,
      color TEXT NOT NULL,
      day_of_week INT NULL CHECK (day_of_week IS NULL OR day_of_week = -1 OR (day_of_week >= 0 AND day_of_week <= 6)),
      date_ymd TEXT NULL, -- YYYY-MM-DD
      start_time TEXT NOT NULL, -- HH:MM
      end_time TEXT NOT NULL,   -- HH:MM
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK (
        (kind = 'regular' AND day_of_week IS NOT NULL AND date_ymd IS NULL)
        OR
        (kind = 'event' AND date_ymd IS NOT NULL AND day_of_week IS NULL)
      )
    );

    CREATE INDEX IF NOT EXISTS idx_streamer_agenda_rules_streamer
      ON streamer_agenda_rules(streamer_id);

    CREATE INDEX IF NOT EXISTS idx_streamer_agenda_rules_streamer_kind
      ON streamer_agenda_rules(streamer_id, kind);

    CREATE INDEX IF NOT EXISTS idx_streamer_agenda_rules_streamer_date
      ON streamer_agenda_rules(streamer_id, date_ymd);
  `);
}
