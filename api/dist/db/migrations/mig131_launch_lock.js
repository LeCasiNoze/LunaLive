// Cadenas de lancement des events (décision Lucas 11 juil) :
// - app_flags : petit store key/value global (premier usage : events_launch)
// - launch_lock_clicks : 1 clic par compte éligible ; à 30 clics le premier
//   event (Semaine du Viewer) se déclenche
export async function mig131_launch_lock(pool) {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS app_flags (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
    await pool.query(`
    CREATE TABLE IF NOT EXISTS launch_lock_clicks (
      user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}
