/**
 * Table de tracking des premiers unlocks de succès.
 * Permet d'accorder l'XP une seule fois par succès par user.
 *
 * Tables additionnelles créées ici :
 * - discord_command_uses : tracking des commandes Discord par user (pour succès Discord)
 */
export async function mig101_user_achievements_unlocks(pool) {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS user_achievements_unlocks (
      user_id INT NOT NULL,
      achievement_id TEXT NOT NULL,
      unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      xp_awarded INT NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, achievement_id)
    );
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_user_achievements_unlocks_user
      ON user_achievements_unlocks(user_id);
  `);
    // Tracking commandes Discord par user (succès discord_command_silver, discord_slots_gold, discord_claim_master)
    await pool.query(`
    CREATE TABLE IF NOT EXISTS discord_command_uses (
      id BIGSERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      command TEXT NOT NULL,
      used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_discord_command_uses_user
      ON discord_command_uses(user_id, command);
  `);
    // Table stream_first_chatters pour le succès "premier chatter d'un live"
    await pool.query(`
    CREATE TABLE IF NOT EXISTS stream_first_chatters (
      live_session_id INT NOT NULL,
      user_id INT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (live_session_id)
    );
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_stream_first_chatters_user
      ON stream_first_chatters(user_id);
  `);
}
