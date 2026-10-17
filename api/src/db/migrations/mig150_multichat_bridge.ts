import type {Pool} from 'pg';

// No existing chat, calls, Rumble or Automod schema is changed.
export async function mig150_multichat_bridge(pool:Pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS multichat_bridge_events (
    event_key TEXT PRIMARY KEY,
    streamer_id INT NOT NULL REFERENCES streamers(id),
    platform TEXT NOT NULL CHECK(platform IN ('kick','twitch')),
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'processing' CHECK(state IN ('processing','done','uncertain')),
    result JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    UNIQUE(platform,channel_id,message_id)
  );
  CREATE INDEX IF NOT EXISTS multichat_bridge_events_created_idx ON multichat_bridge_events(created_at);`);
}
