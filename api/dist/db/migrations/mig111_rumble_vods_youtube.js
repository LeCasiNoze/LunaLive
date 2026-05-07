export async function mig111_rumble_vods_youtube(pool) {
    // Colonnes YouTube pour rediff auto des VODs Rumble (LeCasinoze, Fabiozsis)
    // sur la chaine @fabiozsis. Numero de stream calcule a l'upload (count+1).
    await pool.query(`
    ALTER TABLE rumble_vods
      ADD COLUMN IF NOT EXISTS yt_video_id        TEXT,
      ADD COLUMN IF NOT EXISTS yt_uploaded_at     TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS yt_upload_attempts INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS yt_upload_error    TEXT,
      ADD COLUMN IF NOT EXISTS yt_stream_number   INT;
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_rumble_vods_yt_pending
      ON rumble_vods (streamer_id, vod_resolved_at)
      WHERE yt_uploaded_at IS NULL AND vod_mp4_url IS NOT NULL;
  `);
}
