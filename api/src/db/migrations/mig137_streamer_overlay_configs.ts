import type { Pool } from "pg";

export async function mig137_streamer_overlay_configs(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS streamer_overlay_configs (
      user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}
