import type {Pool,PoolClient} from 'pg';
import {inTransaction,readWallet} from '../automod-shop/wallet.js';
import {discordProfileSchema} from '../automod-shop/discord-profile.js';
import {validRumbleIdentity} from '../automod-shop/rules.js';
import {accountRules,COIN_RULES,slotOutcome,UPGRADES,type Upgrade} from './rules.js';
const ready=new WeakMap<Pool,Promise<void>>();
const namesReady=new WeakMap<Pool,Promise<void>>();
export class InsufficientCoins extends Error {
 constructor(public balance:number,public cost:number){super('insufficient_coins');}
}
export async function observeCoinName(pool:Pool,sid:number,uid:string,name:string,createdAt:Date){
 if(process.env.NOZECOINS_ENABLED!=='true'||!validRumbleIdentity(uid)||Date.now()-createdAt.getTime()>120000||createdAt.getTime()>Date.now()+30000)return;
 let setup=namesReady.get(pool);if(!setup){setup=discordProfileSchema(pool).then(async()=>{
  await pool.query("ALTER TABLE automod_discord_links ADD COLUMN IF NOT EXISTS rumble_username_seen_at timestamptz NOT NULL DEFAULT '-infinity'");
 }).catch(e=>{namesReady.delete(pool);throw e;});namesReady.set(pool,setup);}await setup;
 await pool.query(`UPDATE automod_discord_links SET username=$3,rumble_username_seen_at=$4 WHERE streamer_id=$1 AND rumble_user_id=$2 AND rumble_username_seen_at<$4`,[sid,uid,name.slice(0,80),createdAt]);
}
export async function coinsSchema(pool:Pool){
 let task=ready.get(pool);if(!task){task=inTransaction(pool,async c=>{
  await c.query('SELECT pg_advisory_xact_lock(8244148)');
  await c.query(`CREATE TABLE IF NOT EXISTS nozecoin_accounts(
   streamer_id bigint NOT NULL REFERENCES streamers(id),rumble_user_id text NOT NULL,username text NOT NULL,
   balance bigint NOT NULL DEFAULT 0 CHECK(balance BETWEEN 0 AND 1000000000000),
   claim_tier integer NOT NULL DEFAULT 0 CHECK(claim_tier BETWEEN 0 AND 3),
   cooldown_tier integer NOT NULL DEFAULT 0 CHECK(cooldown_tier BETWEEN 0 AND 3),
   rain_tier integer NOT NULL DEFAULT 0 CHECK(rain_tier BETWEEN 0 AND 3),
   slot_tier integer NOT NULL DEFAULT 0 CHECK(slot_tier BETWEEN 0 AND 3),
   last_claim_at timestamptz,last_slot_at timestamptz,PRIMARY KEY(streamer_id,rumble_user_id));
   CREATE TABLE IF NOT EXISTS nozecoin_ledger(
    streamer_id bigint NOT NULL,rumble_user_id text NOT NULL,event_key text NOT NULL,
    delta bigint NOT NULL,reason text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT NOW(),
    PRIMARY KEY(streamer_id,rumble_user_id,event_key),
    FOREIGN KEY(streamer_id,rumble_user_id) REFERENCES nozecoin_accounts(streamer_id,rumble_user_id));
   CREATE TABLE IF NOT EXISTS nozecoin_rains(
    streamer_id bigint NOT NULL REFERENCES streamers(id),session_id text NOT NULL,bucket bigint NOT NULL,
    opened_at timestamptz NOT NULL DEFAULT NOW(),closes_at timestamptz NOT NULL,announced_at timestamptz,
    PRIMARY KEY(streamer_id,session_id,bucket));`);
  await c.query(`CREATE TABLE IF NOT EXISTS nozecoin_rain_sessions(streamer_id bigint NOT NULL,session_id text NOT NULL,started_at timestamptz NOT NULL DEFAULT NOW(),PRIMARY KEY(streamer_id,session_id))`);
 }).catch(e=>{ready.delete(pool);throw e;});ready.set(pool,task);}await task;
}
async function lock(c:PoolClient,sid:number,uid:string,name:string){
 if(!validRumbleIdentity(uid))throw Error('bad_identity');
 await c.query(`INSERT INTO nozecoin_accounts(streamer_id,rumble_user_id,username) VALUES($1,$2,$3)
  ON CONFLICT(streamer_id,rumble_user_id) DO UPDATE SET username=EXCLUDED.username`,[sid,uid,name.slice(0,80)]);
 return (await c.query('SELECT *,NOW() AS now FROM nozecoin_accounts WHERE streamer_id=$1 AND rumble_user_id=$2 FOR UPDATE',[sid,uid])).rows[0];
}
export async function coinsProfile(pool:Pool,sid:number,uid:string,name:string){
 await coinsSchema(pool);
 return inTransaction(pool,async c=>{
  const row=await lock(c,sid,uid,name);const rules=accountRules(row);
  const automod=await readWallet(c,sid,uid);
  return {username:name,balance:Number(row.balance),automod:automod.available,rules,
   nextClaimAt:row.last_claim_at?new Date(new Date(row.last_claim_at).getTime()+rules.claimMs).toISOString():null,
   tiers:{claim:row.claim_tier,cooldown:row.cooldown_tier,rain:row.rain_tier,slot:row.slot_tier}};
 });
}
export async function coinAction(pool:Pool,sid:number,uid:string,name:string,action:'claim'|'slot'|'rain'|'upgrade',eventKey:string,upgrade?:Upgrade,expectedTier?:number){
 if(!eventKey||eventKey.length>200)throw Error('bad_event');
 await coinsSchema(pool);
 return inTransaction(pool,async c=>{
  const row=await lock(c,sid,uid,name);const rules=accountRules(row),now=new Date(row.now).getTime();
  let key=eventKey,delta=0,extra:Record<string,unknown>={};
  // Stable event receipts are checked under the account lock before RNG or credit.
  if(action==='rain'){
   const active=(await c.query(`SELECT r.* FROM nozecoin_rains r JOIN streamer_rumble_info i ON i.streamer_id=r.streamer_id
    LEFT JOIN automod_control a ON a.streamer_id=r.streamer_id WHERE r.streamer_id=$1 AND r.closes_at>NOW()
    AND i.is_live=TRUE AND i.live_video_id_numeric=r.session_id AND i.updated_at>NOW()-INTERVAL '2 minutes'
    AND a.desired_enabled=FALSE AND COALESCE((a.runtime_status->>'publisherActive')::boolean,FALSE)=FALSE
    ORDER BY r.opened_at DESC LIMIT 1`,[sid])).rows[0];
   if(!active)throw Error('no_rain');
   key=`rain:${active.session_id}:${active.bucket}`;delta=rules.rain;
  }
  const previous=(await c.query('SELECT result FROM nozecoin_ledger WHERE streamer_id=$1 AND rumble_user_id=$2 AND event_key=$3',[sid,uid,key])).rows[0];
  if(previous)return {...previous.result,balance:Number(row.balance),replayed:true};
  if(action==='claim'){
   const next=row.last_claim_at?new Date(row.last_claim_at).getTime()+rules.claimMs:0;
   if(next>now)return {ok:false,error:'cooldown',nextAt:new Date(next).toISOString()};
   delta=rules.claim;extra={amount:delta,nextAt:new Date(now+rules.claimMs).toISOString()};
   await c.query('UPDATE nozecoin_accounts SET last_claim_at=NOW() WHERE streamer_id=$1 AND rumble_user_id=$2',[sid,uid]);
  }
  if(action==='slot'){
   const next=row.last_slot_at?new Date(row.last_slot_at).getTime()+COIN_RULES.slotCooldownMs:0;
   if(next>now)return {ok:false,error:'cooldown',nextAt:new Date(next).toISOString()};
   if(Number(row.balance)<rules.bet)throw new InsufficientCoins(Number(row.balance),rules.bet);
   const outcome=slotOutcome();const payout=Math.floor(rules.bet*outcome.multiplier);
   delta=payout-rules.bet;extra={art:outcome.art,bet:rules.bet,payout,multiplier:outcome.multiplier};
   await c.query('UPDATE nozecoin_accounts SET last_slot_at=NOW() WHERE streamer_id=$1 AND rumble_user_id=$2',[sid,uid]);
  }
  if(action==='upgrade'){
   if(!upgrade||!Object.hasOwn(UPGRADES,upgrade))throw Error('bad_upgrade');
   const tier=Number(row[`${upgrade}_tier`]);if(tier>=3)throw Error('max_tier');
   if(expectedTier!==tier)throw Error('stale_shop');
   delta=-UPGRADES[upgrade].costs[tier]!;extra={upgrade,tier:tier+1,cost:-delta};
   if(Number(row.balance)<-delta)throw new InsufficientCoins(Number(row.balance),-delta);
   // Column is from the explicit Upgrade allowlist, never from an unchecked string.
   await c.query(`UPDATE nozecoin_accounts SET ${upgrade}_tier=${upgrade}_tier+1 WHERE streamer_id=$1 AND rumble_user_id=$2`,[sid,uid]);
  }
  const updated=(await c.query(`UPDATE nozecoin_accounts SET balance=balance+$3 WHERE streamer_id=$1 AND rumble_user_id=$2
   AND balance+$3 BETWEEN 0 AND 1000000000000 RETURNING balance`,[sid,uid,delta])).rows[0];
  if(!updated)throw Error('insufficient_coins');
  const result={ok:true,action,delta,balance:Number(updated.balance),...extra};
  await c.query(`INSERT INTO nozecoin_ledger(streamer_id,rumble_user_id,event_key,delta,reason,result) VALUES($1,$2,$3,$4,$5,$6::jsonb)`,[sid,uid,key,delta,action,JSON.stringify(result)]);
  return result;
 });
}
export async function linkedCoins(pool:Pool,sid:number,discordId:string){
 await discordProfileSchema(pool);
 const link=(await pool.query(`SELECT l.rumble_user_id,l.username FROM automod_discord_links l
  WHERE l.streamer_id=$1 AND l.discord_user_id=$2`,[sid,discordId])).rows[0];
 if(!link)throw Error('rumble_not_linked');return link as {rumble_user_id:string;username:string};
}

// A permanent receipt per native account/week prevents relinks or restarts duplicating credits.
export async function weeklyCnz(pool:Pool,sid:number){
 await coinsSchema(pool);await discordProfileSchema(pool);
 return inTransaction(pool,async c=>{
  await c.query('SELECT pg_advisory_xact_lock(8244150)');
  await c.query("ALTER TABLE automod_discord_links ADD COLUMN IF NOT EXISTS rumble_username_seen_at timestamptz NOT NULL DEFAULT '-infinity'");
  const week=String((await c.query("SELECT to_char(date_trunc('week',NOW() AT TIME ZONE 'UTC'),'YYYY-MM-DD') AS week")).rows[0].week);
  await c.query(`CREATE TABLE IF NOT EXISTS nozecoin_cnz_announcements(streamer_id bigint NOT NULL,week text NOT NULL,discord_user_id text NOT NULL,rumble_user_id text NOT NULL,username text NOT NULL,announced_at timestamptz,PRIMARY KEY(streamer_id,week,rumble_user_id))`);
  const links=(await c.query(`SELECT * FROM automod_discord_links WHERE streamer_id=$1 AND username ~* '(^|[^a-z0-9])CNZ([^a-z0-9]|$)' AND rumble_username_seen_at>=date_trunc('week',NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' ORDER BY rumble_user_id`,[sid])).rows;
  for(const link of links){
   const row=await lock(c,sid,link.rumble_user_id,link.username),key=`cnz:${week}`;
   const exists=(await c.query('SELECT 1 FROM nozecoin_ledger WHERE streamer_id=$1 AND rumble_user_id=$2 AND event_key=$3',[sid,link.rumble_user_id,key])).rows[0];
   if(exists)continue;
   if(Number(row.balance)>1_000_000_000_000-200)continue;
   await c.query('UPDATE nozecoin_accounts SET balance=balance+200 WHERE streamer_id=$1 AND rumble_user_id=$2',[sid,link.rumble_user_id]);
   const result={ok:true,delta:200,balance:Number(row.balance)+200};
   await c.query(`INSERT INTO nozecoin_ledger(streamer_id,rumble_user_id,event_key,delta,reason,result) VALUES($1,$2,$3,200,'cnz',$4::jsonb)`,[sid,link.rumble_user_id,key,JSON.stringify(result)]);
   await c.query('INSERT INTO nozecoin_cnz_announcements(streamer_id,week,discord_user_id,rumble_user_id,username) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[sid,week,link.discord_user_id,link.rumble_user_id,link.username]);
  }
  const pending=(await c.query(`SELECT a.week,a.discord_user_id AS "discordId",a.rumble_user_id AS "rumbleId",a.username,l.delta::integer AS amount FROM nozecoin_cnz_announcements a JOIN nozecoin_ledger l ON l.streamer_id=a.streamer_id AND l.rumble_user_id=a.rumble_user_id AND l.event_key='cnz:'||a.week WHERE a.streamer_id=$1 AND a.announced_at IS NULL ORDER BY a.week,a.rumble_user_id LIMIT 25`,[sid])).rows;
  return pending;
 });
}
