// Table de scores GÉNÉRIQUE réutilisable par les events à classement qui
// n'ont pas besoin de colonnes détaillées dédiées (contrairement à
// event_scores_viewer_week) : roue, course aux clips, duo, etc. Le détail
// spécifique à chaque event vit dans la colonne `detail` (JSONB).
export async function mig125_event_scores(pool) {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS event_scores (
      event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_id  INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

      points INT NOT NULL DEFAULT 0,
      detail JSONB NOT NULL DEFAULT '{}'::jsonb,

      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (event_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS event_scores_event_points_idx
      ON event_scores(event_id, points DESC);
  `);
}
