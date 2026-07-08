// Comptes liés OAuth (Google / Discord). Un user peut avoir au plus une
// identité par provider (pas de UNIQUE(user_id, provider) volontairement :
// un même compte Discord/Google ne peut être lié qu'à un seul user, mais
// rien n'empêche techniquement plusieurs identités du même provider si un
// jour on gère le multi-compte — on reste au plus près du besoin actuel).
export async function mig122_oauth_identities(pool) {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS user_oauth_identities (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL CHECK (provider IN ('google','discord')),
      provider_user_id TEXT NOT NULL,
      email TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(provider, provider_user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_user_oauth_identities_user_id ON user_oauth_identities(user_id);
  `);
}
