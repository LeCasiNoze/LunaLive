/**
 * Système XP / Levels.
 *
 * - users.xp BIGINT : compteur cumulatif total XP gagné par le user
 * - xp_events : log des gains d'XP (audit complet, anti-fraude, leaderboard)
 *
 * Calcul du level : dérivé de users.xp via la table de seuils en code
 * (api/src/economy/xp.ts). On ne stocke PAS le level en DB pour rester
 * cohérent avec la formule (changement de courbe = 0 migration).
 *
 * Caps anti-spam (chat / watchtime / calls) tracked dans xp_events via
 * source + day pour appliquer un plafond par jour.
 */
export async function mig099_xp(pool) {
    await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS xp BIGINT NOT NULL DEFAULT 0;
  `);
    await pool.query(`
    CREATE TABLE IF NOT EXISTS xp_events (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      delta INT NOT NULL,
      source TEXT NOT NULL,
      reason TEXT NULL,
      meta JSONB NULL,
      day DATE NOT NULL DEFAULT (NOW() AT TIME ZONE 'Europe/Paris')::date,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_xp_events_user_day
      ON xp_events (user_id, day DESC);
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_xp_events_user_source_day
      ON xp_events (user_id, source, day);
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_xp_events_recent
      ON xp_events (created_at DESC);
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_users_xp
      ON users (xp DESC);
  `);
}
