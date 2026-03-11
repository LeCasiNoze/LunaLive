export async function mig024_calls_bans_policy(pool) {
    await pool.query(`
    DO $$
    BEGIN
      -- calls_bans: bans user / slot / provider (clé normalisée)
      IF to_regclass('public.calls_bans') IS NULL THEN
        CREATE TABLE calls_bans (
          id BIGSERIAL PRIMARY KEY,
          streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
          kind TEXT NOT NULL, -- 'user' | 'slot' | 'provider'
          ban_key TEXT NOT NULL,
          label TEXT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT calls_bans_kind_chk CHECK (kind IN ('user','slot','provider'))
        );
        CREATE UNIQUE INDEX calls_bans_uniq ON calls_bans(streamer_id, kind, ban_key);
        CREATE INDEX calls_bans_streamer_kind ON calls_bans(streamer_id, kind);
      END IF;

      -- calls_provider_policy: allow_all ou allow_only (whitelist)
      IF to_regclass('public.calls_provider_policy') IS NULL THEN
        CREATE TABLE calls_provider_policy (
          streamer_id INT PRIMARY KEY REFERENCES streamers(id) ON DELETE CASCADE,
          mode TEXT NOT NULL DEFAULT 'allow_all', -- 'allow_all' | 'allow_only'
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT calls_provider_policy_mode_chk CHECK (mode IN ('allow_all','allow_only'))
        );
      END IF;

      -- calls_allowed_providers: whitelist si mode=allow_only
      IF to_regclass('public.calls_allowed_providers') IS NULL THEN
        CREATE TABLE calls_allowed_providers (
          id BIGSERIAL PRIMARY KEY,
          streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
          provider_norm TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE UNIQUE INDEX calls_allowed_providers_uniq ON calls_allowed_providers(streamer_id, provider_norm);
        CREATE INDEX calls_allowed_providers_streamer ON calls_allowed_providers(streamer_id);
      END IF;
    END $$;
  `);
}
