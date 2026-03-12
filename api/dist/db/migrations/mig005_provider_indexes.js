export async function mig005_provider_indexes(pool) {
    await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS provider_accounts_provider_slug_uq
    ON provider_accounts (provider, lower(channel_slug));
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS provider_accounts_assigned_idx
    ON provider_accounts (assigned_to_streamer_id);
  `);
}
