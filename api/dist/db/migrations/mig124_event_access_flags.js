// Déclaratif "j'ai suivi @lunalive_tv sur Instagram" (v1b, non vérifiable par
// API — on fait confiance) + futur emplacement pour d'autres flags d'accès
// events non modélisables ailleurs.
export async function mig124_event_access_flags(pool) {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS event_access_flags (
      user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      insta_declared_at TIMESTAMPTZ NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}
