export async function mig040_streamer_requests_fields(pool) {
    // 1) Colonnes (idempotent)
    await pool.query(`ALTER TABLE streamer_requests ADD COLUMN IF NOT EXISTS discord TEXT;`);
    await pool.query(`ALTER TABLE streamer_requests ADD COLUMN IF NOT EXISTS channel_url TEXT;`);
    await pool.query(`ALTER TABLE streamer_requests ADD COLUMN IF NOT EXISTS has_channel BOOLEAN NOT NULL DEFAULT FALSE;`);
    await pool.query(`ALTER TABLE streamer_requests ADD COLUMN IF NOT EXISTS has_dlive BOOLEAN NOT NULL DEFAULT FALSE;`);
    await pool.query(`ALTER TABLE streamer_requests ADD COLUMN IF NOT EXISTS dlive_displayname TEXT;`);
    await pool.query(`ALTER TABLE streamer_requests ADD COLUMN IF NOT EXISTS rules_accepted BOOLEAN NOT NULL DEFAULT FALSE;`);
    await pool.query(`ALTER TABLE streamer_requests ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;`);
    await pool.query(`ALTER TABLE streamer_requests ADD COLUMN IF NOT EXISTS links_text TEXT;`);
    await pool.query(`ALTER TABLE streamer_requests ADD COLUMN IF NOT EXISTS notes TEXT;`);
    // ✅ manquait chez toi mais tu indexais dessus
    await pool.query(`ALTER TABLE streamer_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;`);
    // 2) Backfill safe
    await pool.query(`
    UPDATE streamer_requests
    SET updated_at = COALESCE(updated_at, created_at, NOW())
  `);
    // 3) Index
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_streamer_requests_status
    ON streamer_requests(status)
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_streamer_requests_updated_at
    ON streamer_requests(updated_at DESC)
  `);
}
