/**
 * Multi-slots titres : un user peut équiper jusqu'à 3 titres simultanément,
 * un par source (shop, achievement, level). Affichés ensemble dans le chat:
 *   [badge] Username [👑 Shop]
 *           [🏆 Achievement]  -  [Niveau Palier IV]
 *           message
 *
 * Colonnes ajoutées sur user_equipped_cosmetics:
 *   title_shop_code         : code du title shop équipé (NULL = aucun)
 *   title_achievement_code  : code du title achievement équipé (NULL = aucun)
 *   title_level_show        : afficher le titre niveau auto (palier courant) ?
 *
 * L'ancienne colonne title_code reste pour rétrocompat (lecture). Quand un user
 * configure un slot via la nouvelle API, on remplit aussi title_code avec
 * la priorité shop > achievement > level pour que le code legacy continue
 * de marcher (réseau, mobile non encore migré, etc.).
 */
export async function mig100_titles_multi_slots(pool) {
    await pool.query(`
    ALTER TABLE user_equipped_cosmetics
      ADD COLUMN IF NOT EXISTS title_shop_code TEXT NULL,
      ADD COLUMN IF NOT EXISTS title_achievement_code TEXT NULL,
      ADD COLUMN IF NOT EXISTS title_level_show BOOLEAN NOT NULL DEFAULT FALSE;
  `);
}
