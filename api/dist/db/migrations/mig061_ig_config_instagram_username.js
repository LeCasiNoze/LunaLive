export async function mig061_ig_config_instagram_username(pool) {
    await pool.query(`
    ALTER TABLE streamer_ig_config
      ADD COLUMN IF NOT EXISTS instagram_username VARCHAR(100);
  `);
}
