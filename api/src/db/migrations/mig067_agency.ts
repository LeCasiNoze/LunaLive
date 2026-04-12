import type { Pool } from "pg";

export async function mig067_agency(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agency_casinos (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      notes TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS agency_casinos_name_uq
      ON agency_casinos ((lower(name)));
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS agency_deals (
      id BIGSERIAL PRIMARY KEY,
      casino_id BIGINT NOT NULL REFERENCES agency_casinos(id) ON DELETE RESTRICT,
      name TEXT NOT NULL,
      cpa_amount NUMERIC(12, 2) NULL CHECK (cpa_amount IS NULL OR cpa_amount >= 0),
      cpa_agency_cut NUMERIC(12, 2) NULL CHECK (cpa_agency_cut IS NULL OR cpa_agency_cut >= 0),
      ers_percent NUMERIC(7, 2) NULL CHECK (ers_percent IS NULL OR (ers_percent >= 0 AND ers_percent <= 100)),
      ers_agency_percent NUMERIC(7, 2) NULL CHECK (
        ers_agency_percent IS NULL OR (ers_agency_percent >= 0 AND ers_agency_percent <= 100)
      ),
      notes TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT agency_deals_cpa_cut_check CHECK (
        cpa_amount IS NULL OR cpa_agency_cut IS NULL OR cpa_agency_cut <= cpa_amount
      ),
      CONSTRAINT agency_deals_ers_cut_check CHECK (
        ers_percent IS NULL OR ers_agency_percent IS NULL OR ers_agency_percent <= ers_percent
      )
    );
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS agency_deals_casino_name_uq
      ON agency_deals (casino_id, lower(name));
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS agency_streamers (
      id BIGSERIAL PRIMARY KEY,
      display_name TEXT NOT NULL,
      deal_id BIGINT NOT NULL REFERENCES agency_deals(id) ON DELETE RESTRICT,
      linked_streamer_id INT NULL REFERENCES streamers(id) ON DELETE SET NULL,
      lunalive_user_id INT NULL REFERENCES users(id) ON DELETE SET NULL,
      notes TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS agency_streamers_linked_streamer_uq
      ON agency_streamers (linked_streamer_id)
      WHERE linked_streamer_id IS NOT NULL;
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS agency_streamers_user_uq
      ON agency_streamers (lunalive_user_id)
      WHERE lunalive_user_id IS NOT NULL;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS agency_streamer_stats (
      agency_streamer_id BIGINT PRIMARY KEY REFERENCES agency_streamers(id) ON DELETE CASCADE,
      signups INT NULL CHECK (signups IS NULL OR signups >= 0),
      ftd INT NULL CHECK (ftd IS NULL OR ftd >= 0),
      total_deposits NUMERIC(12, 2) NULL CHECK (total_deposits IS NULL OR total_deposits >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}
