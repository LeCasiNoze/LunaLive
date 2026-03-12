export async function mig036_reports_status_deleted(pool) {
    // Drop le check par défaut si présent (souvent nommé reports_status_check)
    await pool.query(`
    ALTER TABLE reports
    DROP CONSTRAINT IF EXISTS reports_status_check;
  `);
    // Recréé avec deleted + triaged
    await pool.query(`
    ALTER TABLE reports
    ADD CONSTRAINT reports_status_check
    CHECK (status IN ('open','triaged','closed','deleted'));
  `);
}
