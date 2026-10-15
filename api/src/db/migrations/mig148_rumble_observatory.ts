import type { Pool } from "pg";
export async function mig148_rumble_observatory(pool: Pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS rumble_observatory_snapshot (
    singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
    captured_at timestamptz NOT NULL, payload jsonb NOT NULL,
    usage_date date, usage_out bigint NOT NULL DEFAULT 0,
    CHECK(pg_column_size(payload) <= 2097152)
  )`);
  await pool.query(
    "ALTER TABLE rumble_observatory_snapshot ADD COLUMN IF NOT EXISTS usage_date date, ADD COLUMN IF NOT EXISTS usage_out bigint NOT NULL DEFAULT 0",
  );
}
