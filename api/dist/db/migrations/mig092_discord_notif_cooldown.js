export async function mig092_discord_notif_cooldown(pool) {
    await pool.query(`
    ALTER TABLE streamers
      ADD COLUMN IF NOT EXISTS discord_notif_last_sent_at TIMESTAMPTZ;
  `);
}
