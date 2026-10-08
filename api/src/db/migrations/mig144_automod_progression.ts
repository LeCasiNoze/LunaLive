import type {Pool} from 'pg';
export async function mig144_automod_progression(pool:Pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS automod_follow_events(streamer_id bigint NOT NULL REFERENCES streamers(id),username text NOT NULL,followed_at timestamptz NOT NULL,baseline boolean NOT NULL,seen_at timestamptz NOT NULL DEFAULT NOW(),announced_at timestamptz,rumble_user_id text,PRIMARY KEY(streamer_id,username,followed_at));
 ALTER TABLE automod_follow_events ADD COLUMN IF NOT EXISTS last_confirmed_at timestamptz;
 ALTER TABLE automod_shop_orders ADD COLUMN IF NOT EXISTS discount_percent integer NOT NULL DEFAULT 0 CHECK(discount_percent BETWEEN 0 AND 10);
 CREATE INDEX IF NOT EXISTS automod_points_events_identity ON automod_points_events(streamer_id,(payload#>>'{item,requestedByRumbleId}'));
 CREATE TABLE IF NOT EXISTS automod_event_scores (
  streamer_id bigint NOT NULL REFERENCES streamers(id),rumble_user_id text NOT NULL,event_key text NOT NULL,
  month text NOT NULL CHECK(month ~ '^[0-9]{4}-[0-9]{2}$'),points integer NOT NULL CHECK(points>=0),
  created_at timestamptz NOT NULL DEFAULT NOW(),PRIMARY KEY(streamer_id,event_key));
 CREATE TABLE IF NOT EXISTS automod_referral_codes (
  streamer_id bigint NOT NULL REFERENCES streamers(id),rumble_user_id text NOT NULL,username text NOT NULL,code text NOT NULL,
  PRIMARY KEY(streamer_id,rumble_user_id),UNIQUE(streamer_id,code));
 CREATE TABLE IF NOT EXISTS automod_viewer_first_seen (
  streamer_id bigint NOT NULL REFERENCES streamers(id),rumble_user_id text NOT NULL,first_seen_at timestamptz NOT NULL,
  PRIMARY KEY(streamer_id,rumble_user_id));
 INSERT INTO automod_viewer_first_seen(streamer_id,rumble_user_id,first_seen_at)
 SELECT streamer_id,rumble_user_id,MIN(created_at) FROM rumble_chat_messages
 WHERE rumble_user_id ~ '^[1-9][0-9]{0,19}$' GROUP BY streamer_id,rumble_user_id
 ON CONFLICT(streamer_id,rumble_user_id) DO UPDATE SET first_seen_at=LEAST(automod_viewer_first_seen.first_seen_at,EXCLUDED.first_seen_at);
 CREATE TABLE IF NOT EXISTS automod_referrals (
  streamer_id bigint NOT NULL REFERENCES streamers(id),child_id text NOT NULL,parent_id text NOT NULL,
  child_name text NOT NULL,parent_name text NOT NULL,status text NOT NULL CHECK(status IN ('pending','rewarded','limit-reached')),
  rewarded_month text,rewarded_at timestamptz,created_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY(streamer_id,child_id),CHECK(child_id<>parent_id));
 CREATE INDEX IF NOT EXISTS automod_referrals_parent ON automod_referrals(streamer_id,parent_id,rewarded_month);
 CREATE INDEX IF NOT EXISTS automod_event_scores_month ON automod_event_scores(streamer_id,rumble_user_id,month);`);
}
