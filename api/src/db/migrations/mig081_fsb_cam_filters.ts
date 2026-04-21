import type { Pool } from "pg";

export async function mig081_fsb_cam_filters(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fsb_cam_filters (
      slug       text PRIMARY KEY,
      filters    jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}
