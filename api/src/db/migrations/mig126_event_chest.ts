import type { Pool } from "pg";

// Dépôts rubis (sink) pour l'event collectif "Coffre communautaire"
// (global_chest). Additionnés à la contribution activité dans event_scores
// (cf events/global_chest.ts) ; jamais effacés par un recompute — la table
// est la source de vérité, re-sommée à chaque tick.
export async function mig126_event_chest(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_chest_deposits (
      id BIGSERIAL PRIMARY KEY,
      event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rubis INT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS event_chest_deposits_event_idx
      ON event_chest_deposits(event_id);
  `);
}
