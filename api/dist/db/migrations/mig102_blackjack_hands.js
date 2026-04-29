/**
 * Table blackjack_hands : historique des mains jouées en blackjack Discord.
 *
 * Colonnes :
 * - result         : résultat main principale ('blackjack','win','push','lose','bust')
 * - net_gain       : gain net en rubis (positif = gain, négatif = perte)
 * - side_bet_21_3_result : résultat side bet 21+3 (NULL si pas de side bet ou perdant)
 *                   Valeurs possibles : 'Suited Trips', 'Trips', 'Straight Flush', 'Straight', 'Flush'
 *
 * Le code de jeu (games_blackjack.ts + commandes Discord) doit alimenter cette table
 * à la fin de chaque main.
 */
export async function mig102_blackjack_hands(pool) {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS blackjack_hands (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      result TEXT NOT NULL,
      net_gain NUMERIC(12,2) NOT NULL DEFAULT 0,
      side_bet_21_3_result TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_blackjack_hands_user
      ON blackjack_hands(user_id, created_at DESC);
  `);
    // Migration additive : si la table existait déjà sans la colonne side_bet_21_3_result
    await pool.query(`
    ALTER TABLE blackjack_hands
      ADD COLUMN IF NOT EXISTS side_bet_21_3_result TEXT NULL;
  `);
}
