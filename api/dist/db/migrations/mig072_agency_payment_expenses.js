export async function mig072_agency_payment_expenses(pool) {
    await pool.query(`
    ALTER TABLE agency_streamer_assignments
    ADD COLUMN IF NOT EXISTS payment_date DATE NULL;
  `);
    await pool.query(`
    UPDATE agency_streamer_assignments
    SET payment_date = COALESCE(payment_date, start_date, CURRENT_DATE)
    WHERE payment_date IS NULL;
  `);
    await pool.query(`
    ALTER TABLE agency_streamer_assignments
    ALTER COLUMN payment_date SET NOT NULL;
  `);
    await pool.query(`
    ALTER TABLE expenses
    ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ NULL;
  `);
    await pool.query(`
    ALTER TABLE expenses
    ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual';
  `);
    await pool.query(`
    ALTER TABLE expenses
    ADD COLUMN IF NOT EXISTS agency_assignment_id BIGINT NULL REFERENCES agency_streamer_assignments(id) ON DELETE CASCADE;
  `);
    await pool.query(`
    ALTER TABLE expenses
    ADD COLUMN IF NOT EXISTS agency_month_key DATE NULL;
  `);
    await pool.query(`
    ALTER TABLE expenses
    DROP CONSTRAINT IF EXISTS expenses_source_type_check;
  `);
    await pool.query(`
    ALTER TABLE expenses
    ADD CONSTRAINT expenses_source_type_check CHECK (
      source_type IN ('manual', 'agency_streamer_payout')
    );
  `);
    await pool.query(`
    ALTER TABLE expenses
    DROP CONSTRAINT IF EXISTS expenses_agency_month_check;
  `);
    await pool.query(`
    ALTER TABLE expenses
    ADD CONSTRAINT expenses_agency_month_check CHECK (
      agency_month_key IS NULL OR date_trunc('month', agency_month_key)::date = agency_month_key
    );
  `);
    await pool.query(`
    ALTER TABLE expenses
    DROP CONSTRAINT IF EXISTS expenses_source_consistency_check;
  `);
    await pool.query(`
    ALTER TABLE expenses
    ADD CONSTRAINT expenses_source_consistency_check CHECK (
      (source_type = 'manual' AND agency_assignment_id IS NULL AND agency_month_key IS NULL)
      OR
      (source_type = 'agency_streamer_payout' AND agency_assignment_id IS NOT NULL AND agency_month_key IS NOT NULL)
    );
  `);
    await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS expenses_source_agency_month_uq
      ON expenses (source_type, agency_assignment_id, agency_month_key);
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_expenses_paid_at
      ON expenses (paid_at DESC NULLS LAST, date DESC);
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_expenses_agency_month
      ON expenses (agency_month_key DESC, agency_assignment_id)
      WHERE source_type = 'agency_streamer_payout';
  `);
    await pool.query(`
    CREATE TABLE IF NOT EXISTS expense_occurrence_payments (
      expense_id BIGINT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
      occurrence_date DATE NOT NULL,
      paid_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (expense_id, occurrence_date)
    );
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS expense_occurrence_payments_occurrence_idx
      ON expense_occurrence_payments (occurrence_date DESC, expense_id);
  `);
}
