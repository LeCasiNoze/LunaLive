// api/src/db/migrations/mig024_calls_hunt_bans_policy.ts
import type { Pool } from "pg";

export async function mig024_calls_hunt_bans_policy(pool: Pool) {
  // Tables bans + allowlist providers (idempotent)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS calls_bans (
      streamer_id         INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      kind                TEXT NOT NULL CHECK (kind IN ('user','slot','provider')),
      ban_key             TEXT NOT NULL,
      note                TEXT NULL,
      created_by_user_id  INT NULL,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (streamer_id, kind, ban_key)
    );

    CREATE INDEX IF NOT EXISTS calls_bans_streamer_kind_idx
      ON calls_bans(streamer_id, kind);

    CREATE TABLE IF NOT EXISTS calls_provider_policy (
      streamer_id  INT PRIMARY KEY REFERENCES streamers(id) ON DELETE CASCADE,
      mode         TEXT NOT NULL DEFAULT 'allow_all' CHECK (mode IN ('allow_all','allow_only')),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS calls_allowed_providers (
      streamer_id    INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      provider_norm  TEXT NOT NULL,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (streamer_id, provider_norm)
    );

    CREATE INDEX IF NOT EXISTS calls_allowed_providers_streamer_idx
      ON calls_allowed_providers(streamer_id);
  `);
}
