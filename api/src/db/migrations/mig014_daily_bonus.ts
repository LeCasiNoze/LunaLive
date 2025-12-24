// api/src/db/migrations/mig014_daily_bonus.ts
import type { Pool } from "pg";

export async function mig014_daily_bonus(pool: Pool) {
  await pool.query(`
    -- 1 claim max / jour (Europe/Paris -> stocké en DATE)
    CREATE TABLE IF NOT EXISTS daily_bonus_claims (
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day DATE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, day)
    );

    CREATE INDEX IF NOT EXISTS daily_bonus_claims_user_day_idx
      ON daily_bonus_claims(user_id, day DESC);

    -- Pour éviter de re-déclencher les paliers chaque mois
    CREATE TABLE IF NOT EXISTS monthly_bonus_rewards (
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      month_start DATE NOT NULL,          -- 1er jour du mois (Europe/Paris)
      milestone INT NOT NULL,             -- 5 | 10 | 20 | 30
      granted JSONB NOT NULL DEFAULT '[]'::jsonb, -- trace de ce qui a été donné
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, month_start, milestone)
    );

    CREATE INDEX IF NOT EXISTS monthly_bonus_rewards_user_month_idx
      ON monthly_bonus_rewards(user_id, month_start DESC);

    -- Tokens génériques (wheel_ticket, prestige_token, etc.)
    CREATE TABLE IF NOT EXISTS user_tokens (
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL,
      amount INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, token)
    );

    -- Récompenses uniques (skin/title) — placeholder tant que shop pas prêt
    CREATE TABLE IF NOT EXISTS user_entitlements (
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,   -- 'skin' | 'title' (plus tard: badge, etc.)
      code TEXT NOT NULL,   -- ex: 'monthly_claim_20_skin'
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, kind, code)
    );
  `);
}
