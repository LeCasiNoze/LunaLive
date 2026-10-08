import type {Pool} from 'pg';
/** Schema for modes, weekly events, purchase upgrades and durable viewer messaging. */
export async function mig145_automod_modes(pool:Pool){
 await pool.query(`-- provider-challenge
CREATE TABLE IF NOT EXISTS automod_provider_challenges(
 id uuid PRIMARY KEY,streamer_id bigint NOT NULL REFERENCES streamers(id),checkpoint text NOT NULL,
 status text NOT NULL CHECK(status IN ('preparing','playing','settled','refunded')),
 config jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT NOW(),closes_at timestamptz NOT NULL,
 started_at timestamptz,result text,finished_at timestamptz,UNIQUE(streamer_id,checkpoint));
 ALTER TABLE automod_provider_challenges ADD COLUMN IF NOT EXISTS cancel_requested_at timestamptz;
 CREATE UNIQUE INDEX IF NOT EXISTS automod_provider_challenge_active ON automod_provider_challenges(streamer_id) WHERE status IN ('preparing','playing');
 CREATE TABLE IF NOT EXISTS automod_provider_camps(
 challenge_id uuid NOT NULL REFERENCES automod_provider_challenges(id),rumble_user_id text NOT NULL,
 username text NOT NULL,provider text NOT NULL CHECK(provider IN ('pragmatic','hacksaw')),
 points integer NOT NULL DEFAULT 0 CHECK(points BETWEEN 0 AND 500),PRIMARY KEY(challenge_id,rumble_user_id));
 CREATE TABLE IF NOT EXISTS automod_provider_passes(
 challenge_id uuid NOT NULL REFERENCES automod_provider_challenges(id),pass_id text NOT NULL,sequence integer NOT NULL,
 provider text NOT NULL CHECK(provider IN ('pragmatic','hacksaw')),slot_name text NOT NULL,
 started_at timestamptz NOT NULL DEFAULT NOW(),receipt jsonb,score_hundredths bigint,
 PRIMARY KEY(challenge_id,pass_id),UNIQUE(challenge_id,sequence));
-- weekly-event
CREATE TABLE IF NOT EXISTS automod_weekly_events(
  id uuid PRIMARY KEY,streamer_id bigint NOT NULL REFERENCES streamers(id),day text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','settled')),closes_at timestamptz NOT NULL,
  settled_at timestamptz,UNIQUE(streamer_id,day));
 CREATE TABLE IF NOT EXISTS automod_weekly_entries(
  id uuid PRIMARY KEY,event_id uuid NOT NULL REFERENCES automod_weekly_events(id),
  rumble_user_id text NOT NULL,username text NOT NULL,slot_name text NOT NULL,slot_key text NOT NULL,
  provider text NOT NULL CHECK(provider IN ('pragmatic','hacksaw')),session_stake_cents integer NOT NULL CHECK(session_stake_cents>0),
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','opening','purchase-sent','bonus','completed','failed','uncertain')),
  quote jsonb,gain_cents bigint,reason text,created_at timestamptz NOT NULL DEFAULT NOW(),completed_at timestamptz,
  UNIQUE(event_id,rumble_user_id));
 CREATE INDEX IF NOT EXISTS automod_weekly_queue ON automod_weekly_entries(event_id,created_at,id);
 CREATE TABLE IF NOT EXISTS automod_weekly_failed_attempts(
  id uuid PRIMARY KEY,event_id uuid NOT NULL REFERENCES automod_weekly_events(id),
  snapshot jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS automod_weekly_greetings(
  streamer_id bigint NOT NULL,day text NOT NULL,rumble_user_id text NOT NULL,
  PRIMARY KEY(streamer_id,day,rumble_user_id));
-- purchase-upgrades
ALTER TABLE automod_shop_orders ADD COLUMN IF NOT EXISTS upgrade_kind text;
 ALTER TABLE automod_shop_orders ADD COLUMN IF NOT EXISTS upgrade_target text;
 ALTER TABLE automod_shop_orders ADD COLUMN IF NOT EXISTS upgrade_baseline jsonb;
 CREATE UNIQUE INDEX IF NOT EXISTS automod_one_upgrade_per_target ON automod_shop_orders(streamer_id,upgrade_kind,upgrade_target)
 WHERE upgrade_kind IS NOT NULL AND status NOT IN ('refunded','expired');
-- discord-profile
CREATE TABLE IF NOT EXISTS automod_discord_links (
 streamer_id bigint NOT NULL REFERENCES streamers(id),discord_user_id text NOT NULL,rumble_user_id text NOT NULL,
 username text NOT NULL,created_at timestamptz NOT NULL DEFAULT NOW(),PRIMARY KEY(streamer_id,discord_user_id),UNIQUE(streamer_id,rumble_user_id));
 CREATE TABLE IF NOT EXISTS automod_discord_link_codes (
 streamer_id bigint NOT NULL REFERENCES streamers(id),discord_user_id text NOT NULL,code_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT NOW(),PRIMARY KEY(streamer_id,discord_user_id));
-- viewer-greeting
CREATE TABLE IF NOT EXISTS automod_daily_greetings (
   streamer_id bigint NOT NULL REFERENCES streamers(id),day date NOT NULL,rumble_user_id text NOT NULL,
   created_at timestamptz NOT NULL DEFAULT NOW(),PRIMARY KEY(streamer_id,day,rumble_user_id));
CREATE TABLE IF NOT EXISTS automod_autopost_activity(streamer_id bigint PRIMARY KEY REFERENCES streamers(id),last_message_id bigint NOT NULL,last_sent_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS automod_mode_clock(streamer_id bigint PRIMARY KEY REFERENCES streamers(id),due_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS automod_follow_state(streamer_id bigint PRIMARY KEY REFERENCES streamers(id),initialized_at timestamptz NOT NULL DEFAULT NOW(),owner_id text);
ALTER TABLE automod_follow_state ADD COLUMN IF NOT EXISTS owner_id text;`);
}
