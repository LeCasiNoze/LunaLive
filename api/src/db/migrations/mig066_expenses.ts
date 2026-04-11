import type { Pool } from "pg";

export async function mig066_expenses(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS expenses (
      id BIGSERIAL PRIMARY KEY,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
      date DATE NOT NULL,
      is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
      recurrence_end_date DATE NULL,
      notes TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT expenses_category_check CHECK (
        category IN ('giveaway', 'offres', 'parrainage', 'abonnement', 'personnalise')
      ),
      CONSTRAINT expenses_recurrence_end_check CHECK (
        recurrence_end_date IS NULL OR recurrence_end_date >= date
      )
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_expenses_date
      ON expenses (date DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_expenses_recurring
      ON expenses (is_recurring, recurrence_end_date, date);
  `);
}
