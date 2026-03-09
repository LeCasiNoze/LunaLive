export async function mig033_account_actions(pool) {
    // cooldown rename
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_rename_at TIMESTAMPTZ;`);
    // codes d'actions compte (rename/password/forgot)
    await pool.query(`
    CREATE TABLE IF NOT EXISTS account_action_codes (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NULL REFERENCES users(id) ON DELETE CASCADE,
      email TEXT NULL,
      kind TEXT NOT NULL, -- 'rename' | 'password' | 'forgot'
      code_hash TEXT NOT NULL,
      attempts INT NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ NULL,
      created_ip TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS account_action_codes_user_kind_idx
      ON account_action_codes (user_id, kind, created_at DESC);
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS account_action_codes_email_kind_idx
      ON account_action_codes (email, kind, created_at DESC);
  `);
}
