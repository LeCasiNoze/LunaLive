// api/src/db/migrations/mig041_site_bans.ts
import type { Pool } from "pg";

export async function mig041_site_bans(pool: Pool) {
  // ─────────────────────────────────────────────
  // Site-wide bans (user + ip)
  // ─────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_user_bans (
      id          BIGSERIAL PRIMARY KEY,
      user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      until       TIMESTAMPTZ NULL,         -- NULL = permanent
      reason      TEXT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by  TEXT NULL,
      revoked_at  TIMESTAMPTZ NULL
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS site_user_bans_active_idx
      ON site_user_bans (user_id, created_at DESC)
      WHERE revoked_at IS NULL;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_ip_bans (
      id          BIGSERIAL PRIMARY KEY,
      ip          TEXT NOT NULL,            -- exact ip match (v1)
      until       TIMESTAMPTZ NULL,         -- NULL = permanent
      reason      TEXT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by  TEXT NULL,
      revoked_at  TIMESTAMPTZ NULL,
      user_id     INT NULL REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS site_ip_bans_active_idx
      ON site_ip_bans (ip, created_at DESC)
      WHERE revoked_at IS NULL;
  `);
}
