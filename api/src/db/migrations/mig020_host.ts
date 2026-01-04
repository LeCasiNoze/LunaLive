import type { Pool } from "pg";

export async function mig020_host(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS streamer_hosts (
      hoster_streamer_id INT PRIMARY KEY REFERENCES streamers(id) ON DELETE CASCADE,
      target_streamer_id INT NULL REFERENCES streamers(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_streamer_hosts_target
      ON streamer_hosts(target_streamer_id);
  `);
}
