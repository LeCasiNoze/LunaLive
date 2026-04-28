// api/src/db/migrations/mig096_rumble_radio_sources.ts
import type { Pool } from "pg";

/**
 * Liste curated des sources Rumble pour la radio (id=32).
 *
 * La radio rotate parmi des créateurs Rumble externes qui n'ont PAS de chaîne
 * LunaLive — ekanos, vitapvpey, put4, etc. — donc ils ne sont pas dans la
 * table streamers du tout. On stocke juste leur username Rumble + un flag
 * actif. Le rumble_poller cycle à travers la liste à chaque rotation.
 */
export async function mig096_rumble_radio_sources(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rumble_radio_sources (
      id BIGSERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      notes TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_rumble_radio_sources_active
      ON rumble_radio_sources (active, id);
  `);

  // Seed with known external creators (à compléter via /admin ou SQL)
  await pool.query(`
    INSERT INTO rumble_radio_sources (username, display_name, notes)
    VALUES
      ('ekanos', 'Ekanos', 'seed initial'),
      ('vitapvpey', 'Vita', 'seed initial'),
      ('put4', 'Put4', 'seed initial')
    ON CONFLICT (username) DO NOTHING
  `);
}
