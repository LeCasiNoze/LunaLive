export async function mig022_bot_core(pool) {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_streamer_settings (
      streamer_id INT PRIMARY KEY REFERENCES streamers(id) ON DELETE CASCADE,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      prefix TEXT NOT NULL DEFAULT '!',
      live_only BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS bot_commands (
      id BIGSERIAL PRIMARY KEY,
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      trigger TEXT NOT NULL,
      response TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      cooldown_sec INT NOT NULL DEFAULT 3,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_bot_commands_streamer
      ON bot_commands(streamer_id);

    CREATE TABLE IF NOT EXISTS bot_autoposts (
      id BIGSERIAL PRIMARY KEY,
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      every_sec INT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_bot_autoposts_streamer
      ON bot_autoposts(streamer_id);

    CREATE TABLE IF NOT EXISTS bot_events (
      id BIGSERIAL PRIMARY KEY,
      streamer_id INT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_bot_events_streamer_created
      ON bot_events(streamer_id, created_at DESC);
  `);
}
