// Traçabilité des lots d'event distribués (idempotence de closeAndDistribute)
// + colonne de détail manquante pour le nouveau bonus "jour actif" viewer_week.
export async function mig123_event_rewards(pool) {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS event_reward_grants (
      id BIGSERIAL PRIMARY KEY,
      event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tier TEXT NOT NULL CHECK (tier IN ('win','participation')),
      rank INT NULL,
      rubis INT NOT NULL DEFAULT 0,
      extras JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(event_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS event_reward_grants_event_idx
      ON event_reward_grants(event_id);
  `);
    await pool.query(`
    ALTER TABLE event_scores_viewer_week
      ADD COLUMN IF NOT EXISTS day_bonus_points INT NOT NULL DEFAULT 0;
  `);
}
