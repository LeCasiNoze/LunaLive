export async function mig040_rumble_info(pool) {
    await pool.query(`
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
    )
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_streamer_rumble_info_streamer_id 
    ON streamer_rumble_info(streamer_id)
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_streamer_rumble_info_updated_at 
    ON streamer_rumble_info(updated_at)
  `);
}
