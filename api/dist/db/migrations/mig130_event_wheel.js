// Semaine de la roue — REDESIGN v2 (cf docs/events-design.md #2). Systèmes
// GÉNÉRIQUES pensés pour être réutilisés par les prochains events (paliers +
// boutique + inventaire de tickets + quêtes d'event) — pas de couplage au
// mot "roue" dans le nommage des tables.
export async function mig130_event_wheel(pool) {
    // Inventaire de tickets PERSISTANT (stackable, cap 50 enforcé en code) :
    // contrairement à user_tokens (générique mais partagé avec d'autres
    // features), cette table est dédiée aux tickets d'event pour ne jamais
    // mélanger avec le "wheel_ticket" de la roue quotidienne (cf wheel.ts).
    // Les tickets non utilisés se gardent d'un event à l'autre (pas de reset).
    await pool.query(`
    CREATE TABLE IF NOT EXISTS user_event_tickets (
      user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      amount INT NOT NULL DEFAULT 0
    );
  `);
    // Paliers de points cumulés réclamés EN DIRECT (pas à la clôture) :
    // idempotence via la PK (event_id,user_id,palier_index).
    await pool.query(`
    CREATE TABLE IF NOT EXISTS event_palier_claims (
      event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      palier_index INT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (event_id, user_id, palier_index)
    );
  `);
    // Achats boutique — day_date (Paris) sert aux caps/jour ET au prix
    // escalier (ex. ticket de roue) ; les items à cap/event (pas cap/jour)
    // relisent la même table sans filtrer sur day_date.
    await pool.query(`
    CREATE TABLE IF NOT EXISTS event_shop_purchases (
      id BIGSERIAL PRIMARY KEY,
      event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      item_code TEXT NOT NULL,
      day_date DATE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS event_shop_purchases_lookup_idx
      ON event_shop_purchases(event_id, user_id, day_date, item_code);
  `);
    // Log de chaque spin — source d'audit pour les quêtes ("spin_1", "spin_20",
    // "days_3") et pour un futur historique affiché au joueur. Le score
    // s'accumule dans event_scores (générique, cf mig125) ; cette table ne
    // sert jamais à recomputer les points (contrairement à l'ancien
    // wheel_week.ts recompute-from-wallet_tx, désormais remplacé).
    await pool.query(`
    CREATE TABLE IF NOT EXISTS event_wheel_spins (
      id BIGSERIAL PRIMARY KEY,
      event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      segment_index INT NOT NULL,
      points INT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS event_wheel_spins_event_user_idx
      ON event_wheel_spins(event_id, user_id);
  `);
    // Quêtes d'event réclamées. ⚠️ Pas de colonne "day" : pour les quêtes
    // DAILY (répétables chaque jour de l'event), la clé stockée dans
    // quest_key est composite "<key>:<YYYY-MM-DD Paris>" (cf events/wheel_event.ts
    // claimQuest) — les quêtes WEEKLY utilisent la clé nue (une seule fois par
    // event). Ça évite d'ajouter une colonne day à cette table générique tout
    // en gardant le repeat quotidien.
    await pool.query(`
    CREATE TABLE IF NOT EXISTS event_quest_claims (
      event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      quest_key TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (event_id, user_id, quest_key)
    );
  `);
}
