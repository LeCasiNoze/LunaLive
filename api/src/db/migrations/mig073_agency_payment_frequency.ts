import type { Pool } from "pg";

export async function mig073_agency_payment_frequency(pool: Pool) {
  await pool.query(`
    ALTER TABLE agency_streamer_assignments
      ADD COLUMN IF NOT EXISTS payment_frequency TEXT NOT NULL DEFAULT 'monthly';
  `);

  await pool.query(`
    ALTER TABLE expenses
      ADD COLUMN IF NOT EXISTS payment_tranche SMALLINT NOT NULL DEFAULT 0;
  `);

  // Drop old unique index (no tranche) and recreate with tranche
  await pool.query(`
    DROP INDEX IF EXISTS expenses_source_agency_month_uq;
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS expenses_source_agency_month_tranche_uq
      ON expenses (source_type, agency_assignment_id, agency_month_key, payment_tranche)
      WHERE source_type = 'agency_streamer_payout';
  `);
}
