// api/src/db/migrations/mig060_ig_config_constraints.ts
// Crée streamer_ig_config si absente, et s'assure que la contrainte UNIQUE
// sur streamer_slug existe (nécessaire pour les upserts ON CONFLICT).
export async function mig060_ig_config_constraints(pool) {
    // Crée la table complète si elle n'existe pas encore
    await pool.query(`
    CREATE TABLE IF NOT EXISTS streamer_ig_config (
      id            SERIAL PRIMARY KEY,
      streamer_slug VARCHAR(100) NOT NULL,
      trigger_word  VARCHAR(100) NOT NULL,
      offer_label   TEXT,
      offer_detail  TEXT,
      process_info  TEXT,
      discord_url   TEXT,
      extra_url     TEXT,
      active        BOOLEAN NOT NULL DEFAULT true,
      created_at    TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
    // Contrainte UNIQUE sur streamer_slug (nécessaire pour ON CONFLICT upsert)
    await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_streamer_ig_config_slug
      ON streamer_ig_config (LOWER(streamer_slug));
  `);
}
