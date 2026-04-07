export async function mig058_streamer_ig_offer_detail(pool) {
    await pool.query(`
    ALTER TABLE streamer_ig_config
      ADD COLUMN IF NOT EXISTS offer_detail TEXT;
  `);
}
