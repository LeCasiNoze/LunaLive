import type {Pool} from 'pg';
export async function mig154_external_chat_bans(pool:Pool){
 // Bans decided in the LunaLive chat for viewers of a relayed platform.
 // platform_status is driven by the platform worker (Kick: multichat VPS).
 await pool.query(`CREATE TABLE IF NOT EXISTS external_chat_bans(
  streamer_id INTEGER NOT NULL, platform TEXT NOT NULL, external_user_id TEXT NOT NULL,
  username TEXT NOT NULL, created_by INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  platform_status TEXT NOT NULL DEFAULT 'pending', platform_error TEXT, platform_done_at TIMESTAMPTZ,
  PRIMARY KEY(streamer_id,platform,external_user_id));
  CREATE INDEX IF NOT EXISTS external_chat_bans_pending_idx ON external_chat_bans(platform) WHERE platform_status='pending';
 `);
}
