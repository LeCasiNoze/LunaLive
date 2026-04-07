-- Migration pour créer la table streamer_rumble_info
CREATE TABLE IF NOT EXISTS streamer_rumble_info (
  streamer_id INTEGER PRIMARY KEY REFERENCES streamers(id) ON DELETE CASCADE,
  is_live BOOLEAN DEFAULT FALSE,
  title TEXT,
  viewers_count INTEGER,
  hls_url TEXT,
  video_url TEXT,
  thumbnail_url TEXT,
  updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index pour optimiser les recherches
CREATE INDEX IF NOT EXISTS idx_streamer_rumble_info_streamer_id ON streamer_rumble_info(streamer_id);
CREATE INDEX IF NOT EXISTS idx_streamer_rumble_info_updated_at ON streamer_rumble_info(updated_at);
