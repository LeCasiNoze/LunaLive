// api/src/db/migrations/mig029_stripe_subscriptions.ts
import type { Pool } from "pg";

export async function mig029_stripe_subscriptions(pool: Pool) {
  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

    CREATE TABLE IF NOT EXISTS user_subscriptions (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan_code TEXT NOT NULL,                 -- 'viewer' | 'streamer'
      provider TEXT NOT NULL DEFAULT 'stripe',
      provider_subscription_id TEXT NOT NULL,
      status TEXT NOT NULL,                    -- active|canceled|past_due|...
      current_period_start TIMESTAMPTZ,
      current_period_end TIMESTAMPTZ,
      cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, plan_code),
      UNIQUE (provider, provider_subscription_id)
    );

    -- tickets/coupons (sub offert, futur wheel tickets, etc.)
    CREATE TABLE IF NOT EXISTS user_coupons (
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      qty INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, code)
    );

    -- idempotence webhook (évite double-crédit si Stripe renvoie 2 fois)
    CREATE TABLE IF NOT EXISTS billing_idempotency (
      id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

export async function down(pool: Pool) {
  await pool.query(`
    DROP TABLE IF EXISTS billing_idempotency;
    DROP TABLE IF EXISTS user_coupons;
    DROP TABLE IF EXISTS user_subscriptions;
    ALTER TABLE users DROP COLUMN IF EXISTS stripe_customer_id;
  `);
}
