export async function mig046_events_engine(pool) {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id BIGSERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      cycle_index INT NOT NULL DEFAULT 0,

      start_at TIMESTAMPTZ NOT NULL,
      end_at   TIMESTAMPTZ NOT NULL, -- end exclusive

      state TEXT NOT NULL DEFAULT 'scheduled', -- scheduled|live|closed|archived

      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      result JSONB NOT NULL DEFAULT '{}'::jsonb,

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS events_state_idx
      ON events(state);

    CREATE INDEX IF NOT EXISTS events_start_idx
      ON events(start_at DESC);

    CREATE INDEX IF NOT EXISTS events_type_start_idx
      ON events(type, start_at DESC);

    CREATE UNIQUE INDEX IF NOT EXISTS events_unique_week_idx
      ON events(start_at, end_at);

    CREATE TABLE IF NOT EXISTS event_type_configs (
      type TEXT PRIMARY KEY,
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}
