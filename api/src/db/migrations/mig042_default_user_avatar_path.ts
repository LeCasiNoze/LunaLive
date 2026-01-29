// api/src/db/migrations/mig042_default_user_avatar_path.ts
import type { Pool } from "pg";

function clampInt(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

/**
 * Default avatars stored as public assets (web/public/Avatar/avatar_XXX.png)
 *
 * - Adds users.avatar_path if missing
 * - Backfills avatar_path for users who have no custom DB avatar (user_avatars)
 *   and no avatar_path yet.
 *
 * By default uses 20 avatars (001..020). You can override with env DEFAULT_AVATAR_COUNT.
 */
export async function mig042_default_user_avatar_path(pool: Pool) {
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS avatar_path TEXT NULL;
  `);

  const raw = Number(process.env.DEFAULT_AVATAR_COUNT ?? 20);
  const count = clampInt(Number.isFinite(raw) ? raw : 20, 1, 999);

  // Backfill only when user has no uploaded avatar AND no avatar_path yet
  await pool.query(
    `
    UPDATE users u
    SET avatar_path =
      '/Avatar/avatar_' ||
      LPAD(((u.id % $1) + 1)::text, 3, '0') ||
      '.png'
    WHERE u.avatar_path IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM user_avatars ua WHERE ua.user_id = u.id
      );
    `,
    [count]
  );
}
