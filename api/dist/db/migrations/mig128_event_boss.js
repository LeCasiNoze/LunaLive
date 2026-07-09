// Burns rubis (sink) pour l'event collectif "Boss à abattre" (burn_boss).
// Un burn = un ACCÉLÉRATEUR de dégâts optionnel, PAS la seule source (cf
// docs/events-design.md #5) : additionné à la contribution activité (watch/
// claims/calls/chat/spins) dans event_scores via events/burn_boss.ts, avec un
// ratio rubis→dégâts configurable (cf rewards.ts
// EVENT_REWARD_CONFIGS.burn_boss.boss.ratio). Jamais effacée par un
// recompute — la table est la source de vérité, re-sommée à chaque tick
// (même pattern que event_chest_deposits, cf mig126).
export async function mig128_event_boss(pool) {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS event_boss_damage (
      id BIGSERIAL PRIMARY KEY,
      event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rubis INT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS event_boss_damage_event_idx
      ON event_boss_damage(event_id);
  `);
}
