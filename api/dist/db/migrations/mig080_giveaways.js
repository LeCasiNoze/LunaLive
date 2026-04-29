export async function mig080_giveaways(pool) {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS discord_giveaways (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id         TEXT NOT NULL,
      channel_id       TEXT NOT NULL,
      message_id       TEXT,
      prize            TEXT NOT NULL,
      winner_count     INTEGER NOT NULL DEFAULT 1,
      ends_at          TIMESTAMPTZ NOT NULL,
      eligible_role_ids TEXT[] NOT NULL DEFAULT '{}',
      conditions       TEXT,
      created_by       TEXT,
      state            TEXT NOT NULL DEFAULT 'active', -- active | ended | cancelled
      winner_ids       TEXT[] NOT NULL DEFAULT '{}',
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS discord_giveaway_entries (
      giveaway_id      UUID NOT NULL REFERENCES discord_giveaways(id) ON DELETE CASCADE,
      discord_user_id  TEXT NOT NULL,
      entered_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (giveaway_id, discord_user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_giveaways_state ON discord_giveaways(guild_id, state);
    CREATE INDEX IF NOT EXISTS idx_giveaway_entries ON discord_giveaway_entries(giveaway_id);
  `);
}
