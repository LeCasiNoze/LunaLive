// api/src/db/migrations/mig010_wallet_economy.ts
import type { Pool } from "pg";

export async function mig010_wallet_economy(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wallet_lots (
      id BIGSERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      origin TEXT NOT NULL,
      amount_remaining BIGINT NOT NULL,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS wallet_lots_user_idx
      ON wallet_lots(user_id, created_at ASC);

    CREATE INDEX IF NOT EXISTS wallet_lots_user_origin_idx
      ON wallet_lots(user_id, origin);

    CREATE TABLE IF NOT EXISTS wallet_tx (
      id BIGSERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,           -- earn|spend|adjust
      origin TEXT NULL,             -- pour earn/adjust
      spend_kind TEXT NULL,         -- support|sink
      spend_type TEXT NULL,         -- sub|tip|cosmetic|...
      streamer_id INT NULL REFERENCES streamers(id) ON DELETE SET NULL,
      amount BIGINT NOT NULL,
      breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
      support_rubis BIGINT NULL,
      streamer_earn_rubis BIGINT NULL,
      platform_cut_rubis BIGINT NULL,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS wallet_tx_user_idx
      ON wallet_tx(user_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS wallet_tx_streamer_idx
      ON wallet_tx(streamer_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS streamer_earnings_ledger (
      id BIGSERIAL PRIMARY KEY,
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      payer_user_id INT NULL REFERENCES users(id) ON DELETE SET NULL,
      spend_type TEXT NOT NULL, -- sub|tip|gift_sub
      spent_rubis BIGINT NOT NULL,
      support_rubis BIGINT NOT NULL,
      streamer_earn_rubis BIGINT NOT NULL,
      platform_cut_rubis BIGINT NOT NULL,
      breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS streamer_earnings_streamer_idx
      ON streamer_earnings_ledger(streamer_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS streamer_wallets (
      streamer_id INT PRIMARY KEY REFERENCES streamers(id) ON DELETE CASCADE,
      available_rubis BIGINT NOT NULL DEFAULT 0,
      lifetime_rubis BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS cashout_requests (
      id BIGSERIAL PRIMARY KEY,
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      amount_rubis BIGINT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',  -- pending|approved|paid|rejected
      note TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS cashout_requests_streamer_idx
      ON cashout_requests(streamer_id, created_at DESC);

    -- subs (MVP)
    CREATE TABLE IF NOT EXISTS streamer_subscriptions (
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (streamer_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS streamer_subscriptions_user_idx
      ON streamer_subscriptions(user_id, expires_at DESC);
  `);

  // lien vers le ledger pour breakdown cashout
  await pool.query(`
    ALTER TABLE cashout_requests
    ADD COLUMN IF NOT EXISTS tx_id BIGINT NULL;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS cashout_requests_tx_idx
    ON cashout_requests(tx_id);
  `);

  // Backfill wallet_lots legacy
  await pool.query(`
    INSERT INTO wallet_lots (user_id, origin, amount_remaining, meta)
    SELECT u.id, 'legacy', u.rubis, jsonb_build_object('note','backfill from users.rubis')
    FROM users u
    WHERE u.rubis > 0
      AND NOT EXISTS (SELECT 1 FROM wallet_lots wl WHERE wl.user_id = u.id)
  `);
}
