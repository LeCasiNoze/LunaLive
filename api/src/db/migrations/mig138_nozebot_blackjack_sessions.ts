import type { Pool } from "pg";

export async function mig138_nozebot_blackjack_sessions(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nozebot_blackjack_sessions (
      id UUID PRIMARY KEY,
      discord_user_id TEXT NOT NULL,
      discord_guild_id TEXT NOT NULL,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mode TEXT NOT NULL CHECK (mode IN ('classic', 'plus')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished', 'expired')),
      game JSONB NOT NULL,
      result JSONB NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ NULL,
      expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes')
    );
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS nozebot_blackjack_one_active_user_idx
      ON nozebot_blackjack_sessions(discord_user_id)
      WHERE status = 'active';
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS nozebot_blackjack_sessions_user_history_idx
      ON nozebot_blackjack_sessions(user_id, created_at DESC);
  `);
}
