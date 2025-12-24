// api/src/db/migrations/mig012_streamer_chest.ts
import type { Pool } from "pg";

export async function mig012_streamer_chest(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS streamer_chests (
      streamer_id INT PRIMARY KEY REFERENCES streamers(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS streamer_chest_lots (
      id BIGSERIAL PRIMARY KEY,
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      origin TEXT NOT NULL,          -- chest_deposit | chest_auto | ...
      weight_bp INT NOT NULL,        -- <= 2000
      amount_remaining INT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      meta JSONB NOT NULL DEFAULT '{}'::jsonb
    );

    CREATE INDEX IF NOT EXISTS streamer_chest_lots_streamer_idx
      ON streamer_chest_lots(streamer_id, created_at ASC);

    CREATE INDEX IF NOT EXISTS streamer_chest_lots_streamer_weight_idx
      ON streamer_chest_lots(streamer_id, weight_bp DESC);

    CREATE TABLE IF NOT EXISTS streamer_chest_openings (
      id BIGSERIAL PRIMARY KEY,
      streamer_id INT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      created_by_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

      status TEXT NOT NULL DEFAULT 'open', -- open|closed|canceled
      opens_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      closes_at TIMESTAMPTZ NOT NULL,

      min_watch_minutes INT NOT NULL DEFAULT 5,

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      closed_at TIMESTAMPTZ NULL,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb
    );

    CREATE UNIQUE INDEX IF NOT EXISTS streamer_chest_open_one_uq
      ON streamer_chest_openings(streamer_id)
      WHERE status='open';

    CREATE INDEX IF NOT EXISTS streamer_chest_openings_streamer_idx
      ON streamer_chest_openings(streamer_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS streamer_chest_participants (
      opening_id BIGINT NOT NULL REFERENCES streamer_chest_openings(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (opening_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS streamer_chest_participants_opening_idx
      ON streamer_chest_participants(opening_id, joined_at ASC);

    CREATE TABLE IF NOT EXISTS streamer_chest_payouts (
      id BIGSERIAL PRIMARY KEY,
      opening_id BIGINT NOT NULL REFERENCES streamer_chest_openings(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount INT NOT NULL,
      breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
      tx_id BIGINT NULL REFERENCES rubis_tx(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(opening_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS streamer_chest_payouts_opening_idx
      ON streamer_chest_payouts(opening_id, created_at ASC);

    CREATE TABLE IF NOT EXISTS streamer_chest_auto_state (
      streamer_id INT PRIMARY KEY REFERENCES streamers(id) ON DELETE CASCADE,
      last_bucket_ts TIMESTAMPTZ NULL,
      carry_minutes INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}
