// api/src/db/migrations/mig097_users_signup_utm.ts
import type { Pool } from "pg";

/**
 * Stocke la source d'acquisition (UTM params + landing path + referrer)
 * pour chaque inscription. Permet de répondre à "d'où viennent les nouveaux
 * comptes ?" : ad TikTok, ad Insta, partage Discord, organique, etc.
 *
 * Capturé silencieusement côté front (localStorage 30j), envoyé au backend
 * dans /auth/register, puis copié sur users à la création.
 */
export async function mig097_users_signup_utm(pool: Pool) {
  await pool.query(`
    ALTER TABLE pending_registrations
      ADD COLUMN IF NOT EXISTS signup_utm JSONB NULL;
  `);
  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS signup_utm JSONB NULL;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_users_signup_utm_source
      ON users ((signup_utm->>'source'));
  `);
}
