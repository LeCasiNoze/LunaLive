export async function mig031_streamer_offline_bg_blob(pool) {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS streamer_offline_bg_blobs (
      streamer_id BIGINT PRIMARY KEY
        REFERENCES streamers(id)
        ON DELETE CASCADE,
      mime TEXT NOT NULL,
      bytes BYTEA NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}
