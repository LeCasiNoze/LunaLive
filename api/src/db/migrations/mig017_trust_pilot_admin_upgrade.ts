import type { Pool } from "pg";

export async function mig017_trust_pilot_admin_upgrade(pool: Pool) {
  // casino_listings: sections + updated_at
  await pool.query(`
    ALTER TABLE casino_listings
      ADD COLUMN IF NOT EXISTS sections JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);

  // Fix JSONB defaults
  await pool.query(`
    ALTER TABLE casino_listings
      ALTER COLUMN pros SET DEFAULT '[]'::jsonb,
      ALTER COLUMN cons SET DEFAULT '[]'::jsonb;
  `);

  // Constraints idempotentes: status + watch_level
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'casino_listings_status_chk') THEN
        ALTER TABLE casino_listings
          ADD CONSTRAINT casino_listings_status_chk
          CHECK (status IN ('published','hidden','disabled'));
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'casino_listings_watch_level_chk') THEN
        ALTER TABLE casino_listings
          ADD CONSTRAINT casino_listings_watch_level_chk
          CHECK (watch_level IN ('none','watch','avoid'));
      END IF;
    END $$;
  `);

  // casino_affiliate_links: kind + streamer_id + updated_at
  await pool.query(`
    ALTER TABLE casino_affiliate_links
      ADD COLUMN IF NOT EXISTS kind TEXT,
      ADD COLUMN IF NOT EXISTS streamer_id INT,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);

  // Backfill kind
  await pool.query(`
    UPDATE casino_affiliate_links
    SET kind = COALESCE(kind, CASE WHEN owner_user_id IS NULL THEN 'bonus' ELSE 'streamer' END)
    WHERE kind IS NULL;
  `);

  await pool.query(`
    ALTER TABLE casino_affiliate_links
      ALTER COLUMN kind SET DEFAULT 'streamer';
  `);

  await pool.query(`
    DO $$
    BEGIN
      UPDATE casino_affiliate_links SET kind='streamer' WHERE kind IS NULL;

      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'casino_affiliate_links_kind_chk') THEN
        ALTER TABLE casino_affiliate_links
          ADD CONSTRAINT casino_affiliate_links_kind_chk
          CHECK (kind IN ('bonus','streamer'));
      END IF;
    END $$;
  `);

  // FK streamer_id -> streamers(id) (best-effort)
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'casino_affiliate_links_streamer_fk') THEN
        BEGIN
          ALTER TABLE casino_affiliate_links
            ADD CONSTRAINT casino_affiliate_links_streamer_fk
            FOREIGN KEY (streamer_id) REFERENCES streamers(id) ON DELETE SET NULL;
        EXCEPTION WHEN undefined_table THEN
        EXCEPTION WHEN undefined_column THEN
        EXCEPTION WHEN datatype_mismatch THEN
        END;
      END IF;
    END $$;
  `);

  // updated_at trigger helper
  await pool.query(`
    CREATE OR REPLACE FUNCTION ll_set_updated_at()
    RETURNS trigger AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await pool.query(`
    DROP TRIGGER IF EXISTS trg_casino_listings_updated_at ON casino_listings;
    CREATE TRIGGER trg_casino_listings_updated_at
    BEFORE UPDATE ON casino_listings
    FOR EACH ROW
    EXECUTE FUNCTION ll_set_updated_at();
  `);

  await pool.query(`
    DROP TRIGGER IF EXISTS trg_casino_affiliate_links_updated_at ON casino_affiliate_links;
    CREATE TRIGGER trg_casino_affiliate_links_updated_at
    BEFORE UPDATE ON casino_affiliate_links
    FOR EACH ROW
    EXECUTE FUNCTION ll_set_updated_at();
  `);

  // Index utiles
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_casino_listings_updated_at ON casino_listings(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_casino_links_kind ON casino_affiliate_links(kind);
    CREATE INDEX IF NOT EXISTS idx_casino_links_streamer_id ON casino_affiliate_links(streamer_id);
  `);
}
