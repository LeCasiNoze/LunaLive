// api/src/db/migrations/mig043_discord_guild_claim.ts
import type { Pool } from "pg";

export async function mig043_discord_guild_claim(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_discord_guilds (
      guild_id TEXT PRIMARY KEY,
      streamer_id INT UNIQUE REFERENCES streamers(id) ON DELETE CASCADE,
      claimed_by_discord_user_id TEXT NOT NULL,

      claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      config JSONB NOT NULL DEFAULT '{}'::jsonb,

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_bot_discord_guilds_streamer_id
      ON bot_discord_guilds(streamer_id);

    CREATE INDEX IF NOT EXISTS idx_bot_discord_guilds_claimed_at
      ON bot_discord_guilds(claimed_at DESC);
  `);
}
