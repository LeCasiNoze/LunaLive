// api/src/db/migrations/mig003_users_upgrade.ts
import type { Pool } from "pg";

export async function mig003_users_upgrade(pool: Pool) {
  // Upgrade users (ajout de colonnes si elles n'existent pas)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ NULL;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS created_ip INET NULL;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ip INET NULL;`);

  // provider_accounts upgrade (si existait avant)
  await pool.query(`ALTER TABLE provider_accounts ADD COLUMN IF NOT EXISTS channel_username TEXT;`);

  // On garde username/password_hash non null pour la logique auth
  await pool.query(`ALTER TABLE users ALTER COLUMN username SET NOT NULL;`);
  await pool.query(`ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;`);

  // Backfill pour les users déjà existants
  await pool.query(`
    UPDATE users
    SET email = COALESCE(email, ('legacy+' || id::text || '@lunalive.invalid')),
        email_verified = TRUE
    WHERE email IS NULL OR email = '';
  `);

  // Index uniques case-insensitive
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_uq ON users (lower(username));`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uq ON users (lower(email));`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS pending_username_lower_uq ON pending_registrations (lower(username));`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS pending_email_lower_uq ON pending_registrations (lower(email));`);
}
