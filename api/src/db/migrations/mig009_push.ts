// api/src/db/migrations/mig009_push.ts
import type { Pool } from "pg";

export async function mig009_push(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id BIGSERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      user_agent TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(endpoint)
    );

    CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
      ON push_subscriptions(user_id, updated_at DESC);
  `);
}
