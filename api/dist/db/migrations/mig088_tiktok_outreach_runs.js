export async function mig088_tiktok_outreach_runs(pool) {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS tiktok_outreach_runs (
      id BIGSERIAL PRIMARY KEY,
      criteria JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      candidates_count INT NOT NULL DEFAULT 0,
      scanned_count INT NOT NULL DEFAULT 0,
      kept_count INT NOT NULL DEFAULT 0,
      dropped_count INT NOT NULL DEFAULT 0,
      message TEXT NULL,
      log JSONB NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ NULL,
      CONSTRAINT tiktok_outreach_runs_status_check CHECK (status IN ('running','done','error','canceled'))
    );
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tiktok_outreach_runs_started
      ON tiktok_outreach_runs (started_at DESC);
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tiktok_outreach_runs_status
      ON tiktok_outreach_runs (status, started_at DESC);
  `);
}
