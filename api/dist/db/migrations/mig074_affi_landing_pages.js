export async function mig074_affi_landing_pages(pool) {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS affi_landing_pages (
      id BIGSERIAL PRIMARY KEY,
      owner_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      slug TEXT NOT NULL UNIQUE,
      model INT NOT NULL,
      variant TEXT NULL,
      brand_name TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS affi_landing_pages_owner_idx
      ON affi_landing_pages(owner_user_id, updated_at DESC);

    CREATE INDEX IF NOT EXISTS affi_landing_pages_updated_idx
      ON affi_landing_pages(updated_at DESC);
  `);
}
