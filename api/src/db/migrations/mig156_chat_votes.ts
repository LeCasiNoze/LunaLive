import type { Pool } from "pg";

// Prédictions jouables depuis le chat Rumble (!1/!2) + sondages.
export async function mig156_chat_votes(pool: Pool) {
  await pool.query(`
    -- Mises Rumble en BCoins (portefeuille nozecoin_accounts, identifié par
    -- l'id Rumble). Les mises en rubis restent dans prediction_bets.
    CREATE TABLE IF NOT EXISTS prediction_ext_bets (
      prediction_id BIGINT NOT NULL REFERENCES predictions(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      external_id TEXT NOT NULL,
      username TEXT NOT NULL,
      wallet_sid BIGINT NOT NULL,
      choice SMALLINT NOT NULL CHECK (choice IN (1, 2)),
      amount INT NOT NULL CHECK (amount > 0),
      payout INT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (prediction_id, provider, external_id)
    );

    ALTER TABLE predictions
      ADD COLUMN IF NOT EXISTS ext_announced_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS ext_reminded_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS ext_closed_announced_at TIMESTAMPTZ;

    CREATE TABLE IF NOT EXISTS polls (
      id BIGSERIAL PRIMARY KEY,
      streamer_id BIGINT NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      question TEXT NOT NULL,
      options JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
      created_by BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ends_at TIMESTAMPTZ NOT NULL,
      closed_at TIMESTAMPTZ,
      ext_announced_at TIMESTAMPTZ,
      ext_reminded_at TIMESTAMPTZ,
      ext_closed_announced_at TIMESTAMPTZ
    );
    CREATE UNIQUE INDEX IF NOT EXISTS polls_one_open_per_streamer
      ON polls(streamer_id) WHERE status = 'open';

    CREATE TABLE IF NOT EXISTS poll_votes (
      poll_id BIGINT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
      voter_key TEXT NOT NULL,
      username TEXT NOT NULL,
      choice SMALLINT NOT NULL CHECK (choice >= 1),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (poll_id, voter_key)
    );
  `);
}
