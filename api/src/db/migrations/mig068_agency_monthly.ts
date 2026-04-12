import type { Pool } from "pg";

export async function mig068_agency_monthly(pool: Pool) {
  await pool.query(`
    ALTER TABLE agency_streamers
    ALTER COLUMN deal_id DROP NOT NULL;
  `);

  await pool.query(`
    ALTER TABLE agency_streamers
    ADD COLUMN IF NOT EXISTS access_user_id INT NULL REFERENCES users(id) ON DELETE SET NULL;
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS agency_streamers_access_user_uq
      ON agency_streamers (access_user_id)
      WHERE access_user_id IS NOT NULL;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS agency_streamer_assignments (
      id BIGSERIAL PRIMARY KEY,
      agency_streamer_id BIGINT NOT NULL REFERENCES agency_streamers(id) ON DELETE CASCADE,
      deal_id BIGINT NOT NULL REFERENCES agency_deals(id) ON DELETE RESTRICT,
      start_date DATE NOT NULL DEFAULT CURRENT_DATE,
      end_date DATE NULL,
      links_text TEXT NULL,
      notes TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT agency_streamer_assignments_date_check CHECK (
        end_date IS NULL OR end_date >= start_date
      )
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS agency_streamer_assignments_streamer_idx
      ON agency_streamer_assignments (agency_streamer_id, start_date DESC, id DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS agency_streamer_assignments_deal_idx
      ON agency_streamer_assignments (deal_id, start_date DESC, id DESC);
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS agency_streamer_assignments_unique_span_uq
      ON agency_streamer_assignments (agency_streamer_id, deal_id, start_date);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS agency_streamer_assignment_stats (
      assignment_id BIGINT NOT NULL REFERENCES agency_streamer_assignments(id) ON DELETE CASCADE,
      month_key DATE NOT NULL,
      signups INT NULL CHECK (signups IS NULL OR signups >= 0),
      ftd INT NULL CHECK (ftd IS NULL OR ftd >= 0),
      total_deposits NUMERIC(12, 2) NULL CHECK (total_deposits IS NULL OR total_deposits >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (assignment_id, month_key),
      CONSTRAINT agency_streamer_assignment_stats_month_check CHECK (
        date_trunc('month', month_key)::date = month_key
      )
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS agency_streamer_assignment_stats_month_idx
      ON agency_streamer_assignment_stats (month_key DESC, assignment_id);
  `);

  await pool.query(`
    INSERT INTO agency_streamer_assignments (
      agency_streamer_id,
      deal_id,
      start_date,
      created_at,
      updated_at
    )
    SELECT
      ags.id,
      ags.deal_id,
      COALESCE(ags.created_at::date, CURRENT_DATE),
      ags.created_at,
      ags.updated_at
    FROM agency_streamers ags
    WHERE ags.deal_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM agency_streamer_assignments asa
        WHERE asa.agency_streamer_id = ags.id
      );
  `);

  await pool.query(`
    INSERT INTO agency_streamer_assignment_stats (
      assignment_id,
      month_key,
      signups,
      ftd,
      total_deposits,
      created_at,
      updated_at
    )
    SELECT
      seed.assignment_id,
      seed.month_key,
      seed.signups,
      seed.ftd,
      seed.total_deposits,
      seed.created_at,
      seed.updated_at
    FROM (
      SELECT
        a.assignment_id,
        date_trunc('month', COALESCE(st.updated_at, st.created_at, NOW()))::date AS month_key,
        st.signups,
        st.ftd,
        st.total_deposits,
        COALESCE(st.created_at, NOW()) AS created_at,
        COALESCE(st.updated_at, st.created_at, NOW()) AS updated_at
      FROM agency_streamer_stats st
      JOIN LATERAL (
        SELECT asa.id AS assignment_id
        FROM agency_streamer_assignments asa
        WHERE asa.agency_streamer_id = st.agency_streamer_id
        ORDER BY asa.id ASC
        LIMIT 1
      ) a ON TRUE
    ) seed
    ON CONFLICT (assignment_id, month_key) DO NOTHING;
  `);
}
