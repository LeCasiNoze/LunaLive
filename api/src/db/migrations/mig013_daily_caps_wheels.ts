// api/src/db/migrations/mig013_daily_caps_wheels.ts
import type { Pool } from "pg";

export async function mig013_daily_caps_wheels(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_daily_caps (
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day DATE NOT NULL,
      free_awarded INT NOT NULL DEFAULT 0,
      free_low_awarded INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, day)
    );

    CREATE INDEX IF NOT EXISTS user_daily_caps_day_idx
      ON user_daily_caps(day DESC);

    CREATE TABLE IF NOT EXISTS wheel_spins (
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day DATE NOT NULL,
      spun_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      raw_reward INT NOT NULL,
      minted_total INT NOT NULL,
      minted_normal INT NOT NULL,
      minted_low INT NOT NULL,
      dropped INT NOT NULL,

      tx_id BIGINT NULL REFERENCES rubis_tx(id) ON DELETE SET NULL,

      PRIMARY KEY (user_id, day)
    );

    CREATE INDEX IF NOT EXISTS wheel_spins_day_idx
      ON wheel_spins(day DESC);
  `);

  // Daily wheel spins
  await pool.query(`
    CREATE TABLE IF NOT EXISTS daily_wheel_spins (
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day DATE NOT NULL, -- jour Europe/Paris
      segment_index INT NOT NULL,
      reward_rubis INT NOT NULL,
      tx_id BIGINT NULL REFERENCES rubis_tx(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, day)
    );

    CREATE INDEX IF NOT EXISTS daily_wheel_spins_day_idx
      ON daily_wheel_spins(day DESC);

    CREATE INDEX IF NOT EXISTS daily_wheel_spins_user_idx
      ON daily_wheel_spins(user_id, created_at DESC);
  `);

  // Compat: si du code attend "spun_at", on garantit la colonne
  await pool.query(`
    ALTER TABLE daily_wheel_spins
    ADD COLUMN IF NOT EXISTS spun_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);
}
