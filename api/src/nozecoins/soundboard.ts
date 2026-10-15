import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {inTransaction} from '../automod-shop/wallet.js';
import {validRumbleIdentity} from '../automod-shop/rules.js';
import {coinsSchema,InsufficientCoins} from './wallet.js';

export type SoundEntry={id:string;label:string;audioUrl:string;cost:number;durationMs:number;volume:number};
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const setups=new WeakMap<Pool,Promise<void>>();
export class SoundboardError extends Error {}

/** Explicit approved catalogue only. Never accept a URL, price or duration from a viewer. */
export function validateSoundCatalogue(input:unknown):SoundEntry[]{
 if(!Array.isArray(input)||input.length>25)throw new SoundboardError('invalid_catalogue');
 const ids=new Set<string>();
 return input.map(value=>{
  if(!value||typeof value!=='object')throw new SoundboardError('invalid_sound');
  const v=value as Record<string,unknown>;
  if(typeof v.id!=='string'||!/^[a-z0-9][a-z0-9-]{1,47}$/.test(v.id)||ids.has(v.id))throw new SoundboardError('invalid_sound_id');
  ids.add(v.id);
  if(typeof v.label!=='string'||v.label.trim().length<2||v.label.length>60||/[\u0000-\u001f]/.test(v.label))throw new SoundboardError('invalid_sound_label');
  let url:URL;try{url=new URL(String(v.audioUrl));}catch{throw new SoundboardError('invalid_audio_url');}
  const myinstants=['www.myinstants.com','myinstants.com'].includes(url.hostname)&&/^\/media\/sounds\/[a-zA-Z0-9_%.-]+\.mp3$/.test(url.pathname);
  const own=url.hostname==='lecasinoze.onrender.com'&&/^\/soundboard\/[a-zA-Z0-9_-]+\.(mp3|ogg|wav)$/.test(url.pathname);
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash||(!myinstants&&!own)||url.pathname.includes('..'))throw new SoundboardError('invalid_audio_url');
  if(!Number.isSafeInteger(v.cost)||Number(v.cost)<1||Number(v.cost)>10000)throw new SoundboardError('invalid_sound_cost');
  if(!Number.isSafeInteger(v.durationMs)||Number(v.durationMs)<100||Number(v.durationMs)>12000)throw new SoundboardError('invalid_sound_duration');
  if(typeof v.volume!=='number'||!Number.isFinite(v.volume)||v.volume<=0||v.volume>0.7)throw new SoundboardError('invalid_sound_volume');
  return {id:v.id,label:v.label.trim(),audioUrl:url.href,cost:Number(v.cost),durationMs:Number(v.durationMs),volume:v.volume};
 });
}

export async function soundboardSchema(pool:Pool){
 let task=setups.get(pool);
 if(!task){task=(async()=>{
  await coinsSchema(pool);
  await inTransaction(pool,async c=>{
   await c.query('SELECT pg_advisory_xact_lock(8244160)');
   await c.query(`CREATE TABLE IF NOT EXISTS nozecoin_soundboard_state(
    streamer_id bigint PRIMARY KEY REFERENCES streamers(id),enabled boolean NOT NULL DEFAULT FALSE,enabled_session_id text,
    consumer_id text,consumer_seen_at timestamptz);
    CREATE TABLE IF NOT EXISTS nozecoin_soundboard_requests(
    id uuid PRIMARY KEY,streamer_id bigint NOT NULL,rumble_user_id text NOT NULL,receipt text NOT NULL,
    sound jsonb NOT NULL,cost integer NOT NULL CHECK(cost BETWEEN 1 AND 10000),session_id text NOT NULL,
    state text NOT NULL CHECK(state IN ('queued','claimed','played','refunded')),
    consumer_id text,created_at timestamptz NOT NULL DEFAULT NOW(),expires_at timestamptz NOT NULL,
    claimed_at timestamptz,finished_at timestamptz,
    UNIQUE(streamer_id,rumble_user_id,receipt),
    FOREIGN KEY(streamer_id,rumble_user_id) REFERENCES nozecoin_accounts(streamer_id,rumble_user_id));
    CREATE INDEX IF NOT EXISTS nozecoin_soundboard_pending ON nozecoin_soundboard_requests(streamer_id,state,created_at);`);
   await c.query('ALTER TABLE nozecoin_soundboard_state ADD COLUMN IF NOT EXISTS enabled_session_id text');
  });
 })().catch(error=>{setups.delete(pool);throw error;});setups.set(pool,task);}
 await task;
}

async function streamLock(c:PoolClient,sid:number){
 if(!Number.isSafeInteger(sid)||sid<=0||sid>2147483647)throw new SoundboardError('invalid_streamer');
 await c.query('SELECT pg_advisory_xact_lock(8244161,$1::integer)',[sid]);
 await c.query('INSERT INTO nozecoin_soundboard_state(streamer_id) VALUES($1) ON CONFLICT DO NOTHING',[sid]);
}
async function personalSession(c:PoolClient,sid:number):Promise<string|null>{
 const r=await c.query(`SELECT i.live_video_id_numeric AS session FROM streamer_rumble_info i
  JOIN automod_control a ON a.streamer_id=i.streamer_id WHERE i.streamer_id=$1 AND i.is_live=TRUE
  AND i.updated_at>NOW()-INTERVAL '2 minutes' AND a.desired_enabled=FALSE
  AND COALESCE((a.runtime_status->>'publisherActive')::boolean,FALSE)=FALSE`,[sid]);
 return r.rows[0]?.session?String(r.rows[0].session):null;
}
async function restore(c:PoolClient,row:any){
 if(row.state==='played'||row.state==='refunded')return;
 const key=`sound-refund:${row.id}`;
 await c.query('SELECT 1 FROM nozecoin_accounts WHERE streamer_id=$1 AND rumble_user_id=$2 FOR UPDATE',[row.streamer_id,row.rumble_user_id]);
 const updated=await c.query(`UPDATE nozecoin_accounts SET balance=balance+$3 WHERE streamer_id=$1 AND rumble_user_id=$2
  AND balance+$3<=1000000000000 RETURNING balance`,[row.streamer_id,row.rumble_user_id,row.cost]);
 if(!updated.rows[0])throw new SoundboardError('refund_requires_review');
 await c.query(`INSERT INTO nozecoin_ledger(streamer_id,rumble_user_id,event_key,delta,reason,result)
  VALUES($1,$2,$3,$4,'sound_refund',$5::jsonb)`,[row.streamer_id,row.rumble_user_id,key,row.cost,JSON.stringify({requestId:row.id,amount:row.cost})]);
 await c.query("UPDATE nozecoin_soundboard_requests SET state='refunded',finished_at=NOW() WHERE id=$1",[row.id]);
}
async function cleanup(c:PoolClient,sid:number,session:string|null,all=false){
 const rows=(await c.query(`SELECT * FROM nozecoin_soundboard_requests WHERE streamer_id=$1
  AND state IN ('queued','claimed') AND ($3::boolean OR session_id IS DISTINCT FROM $2 OR expires_at<=NOW()
   OR (state='claimed' AND claimed_at<NOW()-INTERVAL '30 seconds')) ORDER BY rumble_user_id,id FOR UPDATE`,[sid,session,all])).rows;
 for(const row of rows)await restore(c,row);
}

/** Owner-authorized control. Disabling refunds pending requests, without touching other balances. */
export async function controlSoundboard(pool:Pool,sid:number,enabled:boolean){
 if(typeof enabled!=='boolean')throw new SoundboardError('invalid_control');
 await soundboardSchema(pool);
 return inTransaction(pool,async c=>{
  await streamLock(c,sid);
  const session=enabled?await personalSession(c,sid):null;
  if(enabled&&!session)throw new SoundboardError('soundboard_unavailable');
  await c.query('UPDATE nozecoin_soundboard_state SET enabled=$2,enabled_session_id=$3 WHERE streamer_id=$1',[sid,enabled,session]);
  if(!enabled)await cleanup(c,sid,null,true);
  return {enabled};
 });
}

/** Run periodically even when OBS is disconnected, so pending refunds do not await a new buyer. */
export async function sweepSoundboard(pool:Pool,sid:number){
 await soundboardSchema(pool);
 await inTransaction(pool,async c=>{await streamLock(c,sid);await cleanup(c,sid,await personalSession(c,sid));});
}

/** Owner-authenticated OBS consumer; a second fresh consumer cannot take over the first. */
export async function heartbeatSoundboard(pool:Pool,sid:number,consumerId:string){
 if(!UUID.test(consumerId))throw new SoundboardError('invalid_consumer');
 await soundboardSchema(pool);
 return inTransaction(pool,async c=>{
  await streamLock(c,sid);const session=await personalSession(c,sid);await cleanup(c,sid,session);
  const state=(await c.query('SELECT *,consumer_seen_at>NOW()-INTERVAL \'15 seconds\' AS fresh FROM nozecoin_soundboard_state WHERE streamer_id=$1',[sid])).rows[0];
  if(state.fresh&&state.consumer_id!==consumerId)throw new SoundboardError('consumer_in_use');
  await c.query('UPDATE nozecoin_soundboard_state SET consumer_id=$2,consumer_seen_at=NOW() WHERE streamer_id=$1',[sid,consumerId]);
  return {ready:Boolean(session&&state.enabled&&state.enabled_session_id===session),session};
 });
}

export async function enqueueSound(pool:Pool,input:{streamerId:number;rumbleId:string;username:string;receipt:string;sound:SoundEntry}){
 const {streamerId:sid,rumbleId:uid,username,receipt}=input;
 if(!validRumbleIdentity(uid)||!/^[a-zA-Z0-9:_-]{1,100}$/.test(receipt))throw new SoundboardError('invalid_request');
 const sound=validateSoundCatalogue([input.sound])[0]!;
 await soundboardSchema(pool);
 return inTransaction(pool,async c=>{
  await streamLock(c,sid);
  const prior=(await c.query('SELECT id,state,sound FROM nozecoin_soundboard_requests WHERE streamer_id=$1 AND rumble_user_id=$2 AND receipt=$3',[sid,uid,receipt])).rows[0];
  if(prior){if(prior.sound.id!==sound.id)throw new SoundboardError('receipt_conflict');return {requestId:prior.id,state:prior.state,replayed:true};}
  const session=await personalSession(c,sid);await cleanup(c,sid,session);
  const state=(await c.query(`SELECT enabled AND enabled_session_id=$2 AND consumer_seen_at>NOW()-INTERVAL '15 seconds' AS ready FROM nozecoin_soundboard_state WHERE streamer_id=$1`,[sid,session])).rows[0];
  if(!session||!state.ready)throw new SoundboardError('soundboard_unavailable');
  const pending=Number((await c.query("SELECT COUNT(*)::integer AS n FROM nozecoin_soundboard_requests WHERE streamer_id=$1 AND state IN ('queued','claimed')",[sid])).rows[0].n);
  if(pending>=5)throw new SoundboardError('soundboard_queue_full');
  const recent=(await c.query("SELECT 1 FROM nozecoin_soundboard_requests WHERE streamer_id=$1 AND rumble_user_id=$2 AND state<>'refunded' AND created_at>NOW()-INTERVAL '60 seconds' LIMIT 1",[sid,uid])).rows.length;
  if(recent)throw new SoundboardError('soundboard_cooldown');
  await c.query(`INSERT INTO nozecoin_accounts(streamer_id,rumble_user_id,username) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[sid,uid,username.slice(0,80)]);
  const wallet=(await c.query('SELECT balance FROM nozecoin_accounts WHERE streamer_id=$1 AND rumble_user_id=$2 FOR UPDATE',[sid,uid])).rows[0];
  if(Number(wallet.balance)<sound.cost)throw new InsufficientCoins(Number(wallet.balance),sound.cost);
  const id=randomUUID();
  const updated=(await c.query('UPDATE nozecoin_accounts SET balance=balance-$3 WHERE streamer_id=$1 AND rumble_user_id=$2 RETURNING balance',[sid,uid,sound.cost])).rows[0];
  await c.query(`INSERT INTO nozecoin_soundboard_requests(id,streamer_id,rumble_user_id,receipt,sound,cost,session_id,state,expires_at)
   VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,'queued',NOW()+INTERVAL '2 minutes')`,[id,sid,uid,receipt,JSON.stringify(sound),sound.cost,session]);
  await c.query(`INSERT INTO nozecoin_ledger(streamer_id,rumble_user_id,event_key,delta,reason,result)
   VALUES($1,$2,$3,$4,'sound',$5::jsonb)`,[sid,uid,`sound:${receipt}`,-sound.cost,JSON.stringify({requestId:id,soundId:sound.id,cost:sound.cost})]);
  return {requestId:id,state:'queued',balance:Number(updated.balance),replayed:false};
 });
}

export async function takeNextSound(pool:Pool,sid:number,consumerId:string){
 if(!UUID.test(consumerId))throw new SoundboardError('invalid_consumer');
 await soundboardSchema(pool);
 return inTransaction(pool,async c=>{
  await streamLock(c,sid);const session=await personalSession(c,sid);await cleanup(c,sid,session);
  const state=(await c.query(`SELECT *,consumer_seen_at>NOW()-INTERVAL '15 seconds' AS fresh FROM nozecoin_soundboard_state WHERE streamer_id=$1`,[sid])).rows[0];
  if(!state.enabled||!state.fresh||state.consumer_id!==consumerId||!session||state.enabled_session_id!==session)return null;
  if((await c.query("SELECT 1 FROM nozecoin_soundboard_requests WHERE streamer_id=$1 AND state='claimed' LIMIT 1",[sid])).rows.length)return null;
  const row=(await c.query("SELECT * FROM nozecoin_soundboard_requests WHERE streamer_id=$1 AND state='queued' ORDER BY created_at,id LIMIT 1 FOR UPDATE",[sid])).rows[0];
  if(!row)return null;
  await c.query("UPDATE nozecoin_soundboard_requests SET state='claimed',consumer_id=$2,claimed_at=NOW() WHERE id=$1",[row.id,consumerId]);
  return {requestId:row.id,sound:row.sound as SoundEntry};
 });
}

export async function settleSound(pool:Pool,sid:number,consumerId:string,requestId:string,played:boolean){
 if(!UUID.test(consumerId)||!UUID.test(requestId)||typeof played!=='boolean')throw new SoundboardError('invalid_receipt');
 await soundboardSchema(pool);
 return inTransaction(pool,async c=>{
  await streamLock(c,sid);
  await cleanup(c,sid,await personalSession(c,sid));
  const row=(await c.query('SELECT * FROM nozecoin_soundboard_requests WHERE streamer_id=$1 AND id=$2 FOR UPDATE',[sid,requestId])).rows[0];
  if(!row||row.consumer_id!==consumerId)throw new SoundboardError('receipt_forbidden');
  if(row.state==='played'||row.state==='refunded')return {state:row.state,replayed:true};
  if(row.state!=='claimed')throw new SoundboardError('not_claimed');
  if(played)await c.query("UPDATE nozecoin_soundboard_requests SET state='played',finished_at=NOW() WHERE id=$1",[row.id]);
  else await restore(c,row);
  return {state:played?'played':'refunded',replayed:false};
 });
}
