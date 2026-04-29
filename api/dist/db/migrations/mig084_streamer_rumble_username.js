export async function mig084_streamer_rumble_username(pool) {
    await pool.query(`
    ALTER TABLE streamers
      ADD COLUMN IF NOT EXISTS rumble_username TEXT;
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_streamers_rumble_username
      ON streamers (lower(rumble_username))
      WHERE rumble_username IS NOT NULL;
  `);
}
