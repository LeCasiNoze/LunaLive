// api/src/db/migrations/mig007_live_stats.ts
import type { Pool } from "pg";

export async function mig007_live_stats(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS live_sessions (
      id BIGSERIAL PRIMARY KEY,
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      started_at TIMESTAMPTZ NOT NULL,
      ended_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS live_sessions_open_uq
    ON live_sessions(streamer_id)
    WHERE ended_at IS NULL;

    CREATE INDEX IF NOT EXISTS live_sessions_streamer_started_idx
    ON live_sessions(streamer_id, started_at DESC);

    CREATE TABLE IF NOT EXISTS viewer_sessions (
      id BIGSERIAL PRIMARY KEY,
      live_session_id BIGINT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      viewer_key TEXT NOT NULL,
      user_id INT NULL REFERENCES users(id) ON DELETE SET NULL,
      anon_id TEXT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at TIMESTAMPTZ NULL,
      user_agent TEXT NULL,
      ip INET NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS viewer_sessions_live_viewer_uq
    ON viewer_sessions(live_session_id, viewer_key);

    CREATE INDEX IF NOT EXISTS viewer_sessions_streamer_last_idx
    ON viewer_sessions(streamer_id, last_heartbeat_at DESC);

    CREATE INDEX IF NOT EXISTS viewer_sessions_live_active_idx
    ON viewer_sessions(live_session_id)
    WHERE ended_at IS NULL;

    CREATE TABLE IF NOT EXISTS stream_viewer_samples (
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      live_session_id BIGINT NULL REFERENCES live_sessions(id) ON DELETE SET NULL,
      bucket_ts TIMESTAMPTZ NOT NULL,
      viewers INT NOT NULL,
      PRIMARY KEY (streamer_id, bucket_ts)
    );

    CREATE INDEX IF NOT EXISTS stream_viewer_samples_bucket_idx
    ON stream_viewer_samples(bucket_ts DESC);

    CREATE TABLE IF NOT EXISTS stream_viewer_minutes (
      live_session_id BIGINT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      bucket_ts TIMESTAMPTZ NOT NULL,
      viewer_key TEXT NOT NULL,
      user_id INT NULL REFERENCES users(id) ON DELETE SET NULL,
      anon_id TEXT NULL,
      PRIMARY KEY (live_session_id, bucket_ts, viewer_key)
    );

    CREATE INDEX IF NOT EXISTS stream_viewer_minutes_streamer_bucket_idx
    ON stream_viewer_minutes(streamer_id, bucket_ts DESC);

    CREATE INDEX IF NOT EXISTS stream_viewer_minutes_streamer_viewer_idx
    ON stream_viewer_minutes(streamer_id, viewer_key);

    CREATE INDEX IF NOT EXISTS stream_viewer_minutes_live_bucket_idx
    ON stream_viewer_minutes(live_session_id, bucket_ts DESC);
  `);
}
