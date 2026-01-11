// api/src/db/migrations/mig027_predictions.ts
import type { Pool } from "pg";

export async function mig027_predictions(pool: Pool) {
  /**
   * Module Prédictions LunaLive
   * - Live only
   * - 1 prédiction active max par stream
   * - 2 choix fixes
   * - Mise par défaut = 10 rubis
   * - Economy via wallet_engine (SINK / payout)
   */

  // ──────────────────────────────────────────
  // Table predictions
  // ──────────────────────────────────────────

  await pool.query(`
    CREATE TABLE IF NOT EXISTS predictions (
      id BIGSERIAL PRIMARY KEY,

      streamer_id BIGINT NOT NULL
        REFERENCES streamers(id)
        ON DELETE CASCADE,

      question TEXT NOT NULL,
      option1_label TEXT NOT NULL,
      option2_label TEXT NOT NULL,

      fixed_stake INTEGER NOT NULL DEFAULT 10,

      status TEXT NOT NULL CHECK (status IN ('open','locked','resolved')),

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      bets_close_at TIMESTAMPTZ NOT NULL,

      resolved_option SMALLINT NULL CHECK (resolved_option IN (1,2)),

      total_pool_1 INTEGER NOT NULL DEFAULT 0,
      total_pool_2 INTEGER NOT NULL DEFAULT 0
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS predictions_streamer_status_idx
      ON predictions(streamer_id, status);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS predictions_streamer_created_idx
      ON predictions(streamer_id, created_at DESC);
  `);

  // ──────────────────────────────────────────
  // Table prediction_bets
  // ──────────────────────────────────────────

  await pool.query(`
    CREATE TABLE IF NOT EXISTS prediction_bets (
      id BIGSERIAL PRIMARY KEY,

      prediction_id BIGINT NOT NULL
        REFERENCES predictions(id)
        ON DELETE CASCADE,

      user_id BIGINT NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

      choice SMALLINT NOT NULL CHECK (choice IN (1,2)),
      amount INTEGER NOT NULL CHECK (amount > 0),

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      UNIQUE (prediction_id, user_id)
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS prediction_bets_prediction_idx
      ON prediction_bets(prediction_id);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS prediction_bets_user_idx
      ON prediction_bets(user_id);
  `);

  // ──────────────────────────────────────────
  // Extension users: dernière mise prédiction
  // ──────────────────────────────────────────

  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS last_prediction_stake INTEGER NULL
      CHECK (last_prediction_stake IS NULL OR last_prediction_stake > 0);
  `);
}
