export async function mig109_agency_fee_reminder_runs(pool) {
    // Trace 1 ligne par jour où le rappel "frais d'agence" a été envoyé.
    // Utilisé comme verrou idempotent : INSERT ON CONFLICT DO NOTHING pour
    // éviter qu'un redémarrage du process n'envoie 2 DM le même jour.
    await pool.query(`
    CREATE TABLE IF NOT EXISTS agency_fee_reminder_runs (
      run_date    DATE PRIMARY KEY,
      sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      items_count INT NOT NULL DEFAULT 0
    );
  `);
}
