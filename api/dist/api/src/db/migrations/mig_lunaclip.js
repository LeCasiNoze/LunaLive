export async function mig_lunaclip(pool) {
    await pool.query(`
    -- Sessions d'analyse (une par stream analysé)
    CREATE TABLE IF NOT EXISTS lunaclip_sessions (
      id           BIGSERIAL PRIMARY KEY,
      hls_url      TEXT NOT NULL,
      provider     TEXT,
      status       TEXT NOT NULL DEFAULT 'idle',
      alert_multi  FLOAT NOT NULL DEFAULT 300,
      interval_sec FLOAT NOT NULL DEFAULT 1.0,
      streamer_id  INT REFERENCES streamers(id) ON DELETE SET NULL,
      started_at   TIMESTAMPTZ,
      stopped_at   TIMESTAMPTZ,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE lunaclip_sessions
      ADD COLUMN IF NOT EXISTS streamer_id INT REFERENCES streamers(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS lunaclip_sessions_streamer_idx
      ON lunaclip_sessions(streamer_id, created_at DESC);

    -- Frames loggués (multi + valeurs au fil du temps)
    CREATE TABLE IF NOT EXISTS lunaclip_frames (
      id                BIGSERIAL PRIMARY KEY,
      session_id        BIGINT NOT NULL REFERENCES lunaclip_sessions(id) ON DELETE CASCADE,
      ts_sec            FLOAT NOT NULL,
      provider          TEXT,
      in_bonus          BOOLEAN,
      bet_value         TEXT,
      bet_numeric       FLOAT,
      win_value         TEXT,
      win_numeric       FLOAT,
      win_total_value   TEXT,
      win_total_numeric FLOAT,
      free_spins        INT,
      multiplier        FLOAT,
      multiplier_source TEXT,
      captured_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS lunaclip_frames_session_idx
      ON lunaclip_frames(session_id, captured_at DESC);

    -- EVENTs déclenchés (multi >= seuil)
    CREATE TABLE IF NOT EXISTS lunaclip_events (
      id                BIGSERIAL PRIMARY KEY,
      session_id        BIGINT NOT NULL REFERENCES lunaclip_sessions(id) ON DELETE CASCADE,
      ts_sec            FLOAT NOT NULL,
      provider          TEXT,
      in_bonus          BOOLEAN,
      multiplier        FLOAT NOT NULL,
      multiplier_source TEXT,
      bet_value         TEXT,
      win_value         TEXT,
      win_total_value   TEXT,
      screenshot_path   TEXT,
      triggered_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS lunaclip_events_session_idx
      ON lunaclip_events(session_id, triggered_at DESC);
  `);
}
