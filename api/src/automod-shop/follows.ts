import {settleReferral} from './referral.js';
import type {Pool} from 'pg';
import {inTransaction,lockWallet,walletEntry} from './wallet.js';
import {validRumbleIdentity} from './rules.js';
import {notifyShop} from './notify.js';
const ready=new WeakMap<Pool,Promise<unknown>>();
export const FOLLOW_POINTS=100;
export async function followSchema(pool:Pool){
 let p=ready.get(pool);if(!p){p=pool.query(`CREATE TABLE IF NOT EXISTS automod_follow_state(streamer_id bigint PRIMARY KEY REFERENCES streamers(id),initialized_at timestamptz NOT NULL DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS automod_follow_events(streamer_id bigint NOT NULL REFERENCES streamers(id),username text NOT NULL,followed_at timestamptz NOT NULL,baseline boolean NOT NULL,seen_at timestamptz NOT NULL DEFAULT NOW(),announced_at timestamptz,rumble_user_id text,PRIMARY KEY(streamer_id,username,followed_at));
 CREATE TABLE IF NOT EXISTS automod_follower_samples(streamer_id bigint NOT NULL REFERENCES streamers(id),sample_at timestamptz NOT NULL,total integer NOT NULL CHECK(total>=0),PRIMARY KEY(streamer_id,sample_at));`).catch(e=>{ready.delete(pool);throw e;});ready.set(pool,p);}await p;
}
const polls=new Map<number,{at:number,promise:Promise<void>}>();
async function poll(pool:Pool,sid:number){
 const last=polls.get(sid);if(last&&Date.now()-last.at<60000)return last.promise;
 const promise=(async()=>{
  await followSchema(pool);
  const account=(await pool.query(`SELECT a.api_key FROM rumble_accounts a JOIN streamers s ON s.id=a.assigned_to_streamer_id WHERE s.id=$1 AND lower(s.slug)='lecasinoze'`,[sid])).rows[0];
  if(!account?.api_key)return;
  const response=await fetch('https://rumble.com/-livestream-api/get-data?key='+encodeURIComponent(account.api_key),{signal:AbortSignal.timeout(12000)});
  if(!response.ok)return;
  const data=await response.json() as any,followers=data?.followers;
  if(String(data?.username??'').toLowerCase()!=='lecasinoze')return;
  if(!followers||!Number.isSafeInteger(followers.num_followers_total)||followers.num_followers_total<0)return;
  await inTransaction(pool,async c=>{
   await c.query('SELECT pg_advisory_xact_lock($1)',[sid]);
   const initialized=Boolean((await c.query('SELECT 1 FROM automod_follow_state WHERE streamer_id=$1',[sid])).rowCount);
   const list=Array.isArray(followers.recent_followers)?followers.recent_followers:[];
   for(const f of list.slice(0,500)){
    if(typeof f.username!=='string'||!f.username||f.username.length>80||!Number.isFinite(Date.parse(f.followed_on)))continue;
    // The first snapshot is an inventory, never a burst of historical alerts/rewards.
    await c.query('INSERT INTO automod_follow_events(streamer_id,username,followed_at,baseline,last_confirmed_at) VALUES($1,$2,$3,$4,NOW()) ON CONFLICT(streamer_id,username,followed_at) DO UPDATE SET last_confirmed_at=NOW()',[sid,f.username,new Date(f.followed_on),!initialized]);
   }
   await c.query('INSERT INTO automod_follow_state(streamer_id) VALUES($1) ON CONFLICT DO NOTHING',[sid]);
   await c.query("INSERT INTO automod_follower_samples(streamer_id,sample_at,total) VALUES($1,date_trunc('minute',NOW()),$2) ON CONFLICT DO NOTHING",[sid,followers.num_followers_total]);
  });
 })();polls.set(sid,{at:Date.now(),promise});return promise;
}
export async function tickFollows(pool:Pool,sid:number){
 await poll(pool,sid);await followSchema(pool);
 const live=(await pool.query('SELECT desired_enabled,runtime_status FROM automod_control WHERE streamer_id=$1',[sid])).rows[0];
 if(!live?.desired_enabled||!live.runtime_status?.publisherActive)return null;
 const event=(await pool.query("SELECT username,followed_at FROM automod_follow_events WHERE streamer_id=$1 AND NOT baseline AND announced_at IS NULL AND seen_at>NOW()-INTERVAL '10 minutes' AND followed_at<=NOW()+INTERVAL '1 minute' ORDER BY followed_at LIMIT 1",[sid])).rows[0];
 if(event){const result=await notifyShop(pool,sid,`Bienvenue @${event.username}, merci pour ton follow ! ${FOLLOW_POINTS} points offerts une seule fois après ton premier message dans ce chat Automod. !points pour ton solde.`);if(result.sent)await pool.query('UPDATE automod_follow_events SET announced_at=NOW() WHERE streamer_id=$1 AND username=$2 AND followed_at=$3',[sid,event.username,event.followed_at]);}
 const recent=(await pool.query("SELECT username,announced_at FROM automod_follow_events WHERE streamer_id=$1 AND announced_at>NOW()-INTERVAL '12 seconds' ORDER BY announced_at DESC LIMIT 1",[sid])).rows[0];
 return recent?{username:recent.username,shownUntil:new Date(recent.announced_at).getTime()+12000}:null;
}
/** Follow API supplies names; only an authenticated Rumble chat event binds the durable numeric identity. */
export async function rewardFollow(pool:Pool,m:{streamerId:number;userId:string;username:string;createdAt:Date}){
 if(!validRumbleIdentity(m.userId)||Math.abs(Date.now()-m.createdAt.getTime())>120000)return;
 await followSchema(pool);
 await inTransaction(pool,async c=>{
  await c.query('SELECT pg_advisory_xact_lock($1)',[m.streamerId]);
  const control=(await c.query('SELECT desired_enabled,runtime_status FROM automod_control WHERE streamer_id=$1',[m.streamerId])).rows[0];
  if(!control?.desired_enabled||!control.runtime_status?.publisherActive)return;
  const events=(await c.query("SELECT *,followed_at::text AS followed_at_key FROM automod_follow_events WHERE streamer_id=$1 AND username=$2 AND rumble_user_id IS NULL AND seen_at>NOW()-INTERVAL '7 days' AND followed_at<=NOW()+INTERVAL '1 minute' ORDER BY followed_at DESC LIMIT 1 FOR UPDATE",[m.streamerId,m.username])).rows;
  if(events.length){
   await lockWallet(c,m.streamerId,m.userId,m.username);
   if(!events[0].baseline)await walletEntry(c,m.streamerId,m.userId,`follow:${m.userId}`,FOLLOW_POINTS,0,'follow-welcome');
   await c.query('UPDATE automod_follow_events SET rumble_user_id=$4 WHERE streamer_id=$1 AND username=$2 AND followed_at=$3',[m.streamerId,m.username,events[0].followed_at_key,m.userId]);
  }
  // Retry after a delayed follow observation, not only after the second call.
  const candidates=(await c.query("SELECT child_id FROM automod_referrals WHERE streamer_id=$1 AND status='pending' AND (parent_id=$2 OR child_id=$2) ORDER BY created_at LIMIT 100",[m.streamerId,m.userId])).rows;
  for(const candidate of candidates)await settleReferral(c,m.streamerId,candidate.child_id);
 });
}
