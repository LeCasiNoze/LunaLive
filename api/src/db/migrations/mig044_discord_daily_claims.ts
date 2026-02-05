// api/src/db/migrations/mig044_discord_daily_claims.ts
import type { Pool } from "pg";

export async function mig044_discord_daily_claims(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS discord_daily_claims (
      discord_user_id TEXT PRIMARY KEY,
      month_key TEXT NOT NULL,            -- ex: "2026-02" (Europe/Paris)
      claim_count INT NOT NULL DEFAULT 0,
      last_claim_at TIMESTAMPTZ NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_discord_daily_claims_month
    ON discord_daily_claims (month_key);
  `);
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS discord_slot_cooldowns (
      discord_user_id TEXT PRIMARY KEY,
      last_play_at TIMESTAMPTZ NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS discord_slot_cooldowns_last_play_idx
      ON discord_slot_cooldowns(last_play_at DESC);
  `);
}
