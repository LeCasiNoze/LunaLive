import {settleReferral} from './referral.js';
import type {Pool} from 'pg';
import {inTransaction,lockWallet,walletEntry} from './wallet.js';
import {validRumbleIdentity} from './rules.js';
import {shopReplyChunks} from './rules.js';
import {followSnapshot} from './follow-snapshot.js';
const ready=new WeakMap<Pool,Promise<unknown>>();
export const FOLLOW_POINTS=100;
export async function followSchema(pool:Pool){
 let p=ready.get(pool);if(!p){p=pool.query(`CREATE TABLE IF NOT EXISTS automod_follow_state(streamer_id bigint PRIMARY KEY REFERENCES streamers(id),initialized_at timestamptz NOT NULL DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS automod_follow_events(streamer_id bigint NOT NULL REFERENCES streamers(id),username text NOT NULL,followed_at timestamptz NOT NULL,baseline boolean NOT NULL,seen_at timestamptz NOT NULL DEFAULT NOW(),announced_at timestamptz,rumble_user_id text,PRIMARY KEY(streamer_id,username,followed_at));
 CREATE TABLE IF NOT EXISTS automod_follower_samples(streamer_id bigint NOT NULL REFERENCES streamers(id),sample_at timestamptz NOT NULL,total integer NOT NULL CHECK(total>=0),PRIMARY KEY(streamer_id,sample_at));
 ALTER TABLE automod_follow_state ADD COLUMN IF NOT EXISTS owner_id text;
 ALTER TABLE automod_follow_events ADD COLUMN IF NOT EXISTS last_confirmed_at timestamptz;`).catch(e=>{ready.delete(pool);throw e;});ready.set(pool,p);}await p;
}
const polls=new Map<number,{at:number,promise:Promise<void>}>();
async function poll(pool:Pool,sid:number){
 const last=polls.get(sid);if(last&&Date.now()-last.at<60000)return last.promise;
 const promise=(async()=>{
  await followSchema(pool);
  const account=(await pool.query(`SELECT a.username,a.api_key FROM rumble_accounts a JOIN streamers s ON s.id=a.assigned_to_streamer_id WHERE s.id=$1 AND lower(s.slug)='lecasinoze' AND lower(a.username)='lecasinoze' LIMIT 1`,[sid])).rows[0];
  if(!account?.api_key)return;
  const response=await fetch('https://rumble.com/-livestream-api/get-data?key='+encodeURIComponent(account.api_key),{signal:AbortSignal.timeout(12000)});
  if(!response.ok)return;
  const snapshot=followSnapshot(await response.json(),account.username);
  if(!snapshot)return;
  await inTransaction(pool,async c=>{
   await c.query('SELECT pg_advisory_xact_lock($1)',[sid]);
   const state=(await c.query('SELECT owner_id FROM automod_follow_state WHERE streamer_id=$1',[sid])).rows[0];
   if(state?.owner_id&&state.owner_id!==snapshot.ownerId)throw Error('RUMBLE_FOLLOW_ACCOUNT_CHANGED');
   const initialized=Boolean(state);
   const list=snapshot.recent;
   for(const f of list.slice(0,500)){
    if(typeof f.username!=='string'||!f.username||f.username.length>80||!Number.isFinite(Date.parse(f.followed_on)))continue;
    // The first snapshot is an inventory, never a burst of historical alerts/rewards.
    await c.query('INSERT INTO automod_follow_events(streamer_id,username,followed_at,baseline,last_confirmed_at) VALUES($1,$2,$3,$4,NOW()) ON CONFLICT(streamer_id,username,followed_at) DO UPDATE SET last_confirmed_at=NOW()',[sid,f.username,new Date(f.followed_on),!initialized]);
   }
   await c.query('INSERT INTO automod_follow_state(streamer_id,owner_id) VALUES($1,$2) ON CONFLICT(streamer_id) DO UPDATE SET owner_id=COALESCE(automod_follow_state.owner_id,EXCLUDED.owner_id)',[sid,snapshot.ownerId]);
   await c.query("INSERT INTO automod_follower_samples(streamer_id,sample_at,total) VALUES($1,date_trunc('minute',NOW()),$2) ON CONFLICT DO NOTHING",[sid,snapshot.total]);
  });
 })();polls.set(sid,{at:Date.now(),promise});return promise;
}
export async function tickFollows(pool:Pool,sid:number){
 await poll(pool,sid);await followSchema(pool);
 await announceNewFollow(pool,sid);
 const recent=(await pool.query("SELECT username,announced_at FROM automod_follow_events WHERE streamer_id=$1 AND announced_at>NOW()-INTERVAL '12 seconds' ORDER BY announced_at DESC LIMIT 1",[sid])).rows[0];
 return recent?{username:recent.username,shownUntil:new Date(recent.announced_at).getTime()+12000}:null;
}
/** Rumble's offset currently places recent follows four hours in the future.
 * Preserve its timestamp as a deduplication key; freshness uses our first seen
 * time, never an invented timezone correction. Queue and receipt commit together. */
export async function announceNewFollow(pool:Pool,sid:number){
 return inTransaction(pool,async c=>{
  const live=(await c.query(`SELECT i.live_video_id_numeric FROM automod_control a
   JOIN streamers s ON s.id=a.streamer_id JOIN streamer_rumble_info i ON i.streamer_id=a.streamer_id
   WHERE a.streamer_id=$1 AND lower(s.slug)='lecasinoze' AND a.desired_enabled=TRUE
   AND a.runtime_status->>'publisherActive'='true' AND a.runtime_seen_at>NOW()-INTERVAL '60 seconds' AND i.is_live=TRUE`,[sid])).rows[0];
  if(!live?.live_video_id_numeric)return false;
  const event=(await c.query(`SELECT username,followed_at::text AS event_key FROM automod_follow_events
   WHERE streamer_id=$1 AND NOT baseline AND announced_at IS NULL
   AND seen_at>NOW()-INTERVAL '10 minutes' ORDER BY seen_at
   LIMIT 1 FOR UPDATE SKIP LOCKED`,[sid])).rows[0];
  if(!event)return false;
  for(const chunk of shopReplyChunks(`Merci pour ton follow @${event.username} ! +${FOLLOW_POINTS} points après ton premier message. Ton solde : !points.`)){
   await c.query("INSERT INTO rumble_send_queue(video_id_numeric,text,status) VALUES($1,$2,'pending')",[String(live.live_video_id_numeric),chunk]);
  }
  await c.query('UPDATE automod_follow_events SET announced_at=NOW() WHERE streamer_id=$1 AND username=$2 AND followed_at=$3',[sid,event.username,event.event_key]);
  return true;
 });
}
/** Follow API supplies names; only an authenticated Rumble chat event binds the durable numeric identity. */
export async function rewardFollow(pool:Pool,m:{streamerId:number;userId:string;username:string;createdAt:Date}){
 if(!validRumbleIdentity(m.userId)||Math.abs(Date.now()-m.createdAt.getTime())>120000)return;
 await followSchema(pool);
 await inTransaction(pool,async c=>{
  await c.query('SELECT pg_advisory_xact_lock($1)',[m.streamerId]);
  const control=(await c.query('SELECT desired_enabled,runtime_status FROM automod_control WHERE streamer_id=$1',[m.streamerId])).rows[0];
  if(!control?.desired_enabled||!control.runtime_status?.publisherActive)return;
  const events=(await c.query("SELECT *,followed_at::text AS followed_at_key FROM automod_follow_events WHERE streamer_id=$1 AND username=$2 AND rumble_user_id IS NULL AND last_confirmed_at>NOW()-INTERVAL '2 minutes' ORDER BY last_confirmed_at DESC,followed_at DESC LIMIT 1 FOR UPDATE",[m.streamerId,m.username])).rows;
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
