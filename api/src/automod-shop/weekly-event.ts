import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {inTransaction,lockWallet,walletEntry} from './wallet.js';
import {parisEventDay,EVENT_RULES,selectSessionPurchase,type PurchaseOption,type EventProvider} from './event-rules.js';
import {validRumbleIdentity,validateOffers,type BonusOffer} from './rules.js';
import {huntSlotReserved} from '../calls/automod_hunt_reservations.js';

const schemas=new WeakMap<Pool,Promise<void>>();
export async function weeklyEventSchema(pool:Pool){
 let ready=schemas.get(pool);
 if(!ready){ready=pool.query(`CREATE TABLE IF NOT EXISTS automod_weekly_events(
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
  PRIMARY KEY(streamer_id,day,rumble_user_id));`).then(()=>undefined).catch(e=>{schemas.delete(pool);throw e});schemas.set(pool,ready);}
 await ready;
}
async function lockStreamer(c:PoolClient,sid:number){await c.query('SELECT pg_advisory_xact_lock($1)',[sid]);}
async function entry(c:PoolClient,sid:number,id:string){
 await lockStreamer(c,sid);
 const row=(await c.query(`SELECT q.*,e.streamer_id,e.day,e.status AS event_status FROM automod_weekly_entries q
 JOIN automod_weekly_events e ON e.id=q.event_id WHERE e.streamer_id=$1 AND q.id=$2 FOR UPDATE OF q`,[sid,id])).rows[0];
 if(!row)throw Error('weekly_entry_missing');return row;
}
/** Called only after catalog/provider/call-policy validation. Identity is native Rumble ID. */
export async function requestWeeklyPurchase(pool:Pool,sid:number,viewer:{userId:string;username:string},slot:{name:string;key:string;provider:EventProvider},now=new Date()){
 if(!validRumbleIdentity(viewer.userId)||!slot.key||slot.key.length>180||!slot.name||slot.name.length>160||!['pragmatic','hacksaw'].includes(slot.provider))throw Error('weekly_invalid_request');
 const day=parisEventDay(now);if(!day.active)throw Error('weekly_not_today');
 await weeklyEventSchema(pool);
 return inTransaction(pool,async c=>{
  await lockStreamer(c,sid);
  const control=(await c.query(`SELECT a.* FROM automod_control a JOIN streamer_rumble_info r ON r.streamer_id=a.streamer_id
   WHERE a.streamer_id=$1 AND a.desired_enabled=TRUE AND r.is_live=TRUE
   AND a.runtime_status->>'publisherActive'='true' AND a.runtime_seen_at>$2::timestamptz-INTERVAL '60 seconds'`,[sid,now])).rows[0];
  if(!control)throw Error('weekly_not_live');
  const allowed=control.dashboard_settings?.allowedProviders??control.runtime_status?.config?.allowedProviders??['hacksaw','pragmatic'];
  if(!Array.isArray(allowed)||!allowed.includes(slot.provider))throw Error('weekly_provider_disabled');
  if(await huntSlotReserved(c,sid,slot.name))throw Error('weekly_hunt_bonus_pending');
  const previous=(await c.query(`SELECT q.* FROM automod_weekly_entries q JOIN automod_weekly_events e ON e.id=q.event_id
   WHERE e.streamer_id=$1 AND e.day=$2 AND q.rumble_user_id=$3`,[sid,day.key,viewer.userId])).rows[0];
  if(previous&&previous.status!=='failed')return {created:false,entry:previous};
  const follow=await c.query(`SELECT 1 FROM automod_follow_events WHERE streamer_id=$1 AND rumble_user_id=$2
   AND last_confirmed_at BETWEEN $3::timestamptz-INTERVAL '2 minutes' AND $3::timestamptz+INTERVAL '30 seconds' LIMIT 1`,[sid,viewer.userId,now]);
  if(!follow.rowCount)throw Error('weekly_follow_required');
  const stake=Number(control.dashboard_settings?.stakeCents??control.runtime_status?.config?.stakeCents);
  if(!Number.isSafeInteger(stake)||stake<1||stake>10000)throw Error('weekly_invalid_stake');
  const event=(await c.query(`INSERT INTO automod_weekly_events(id,streamer_id,day,closes_at)
   VALUES($1,$2,$3::text,($3::text::date+1)::timestamp AT TIME ZONE 'Europe/Paris')
   ON CONFLICT(streamer_id,day) DO UPDATE SET day=EXCLUDED.day RETURNING *`,[randomUUID(),sid,day.key])).rows[0];
  if(event.status!=='open')throw Error('weekly_closed');
  if(previous){
   // Only a pre-intent technical failure is retryable; uncertain purchases
   // cannot recover their quota and accidentally authorize a second bonus.
   await c.query('INSERT INTO automod_weekly_failed_attempts(id,event_id,snapshot) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[previous.id,previous.event_id,JSON.stringify(previous)]);
   const retried=(await c.query(`UPDATE automod_weekly_entries SET id=$7,status='queued',slot_name=$2,slot_key=$3,provider=$4,
    session_stake_cents=$5,username=$6,quote=NULL,reason=NULL,created_at=NOW() WHERE id=$1 RETURNING *`,
    [previous.id,slot.name,slot.key,slot.provider,stake,viewer.username.slice(0,80),randomUUID()])).rows[0];
   return {created:true,entry:retried};
  }
  const added=(await c.query(`INSERT INTO automod_weekly_entries(id,event_id,rumble_user_id,username,slot_name,slot_key,provider,session_stake_cents)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[randomUUID(),event.id,viewer.userId,viewer.username.slice(0,80),slot.name,slot.key,slot.provider,stake])).rows[0];
  return {created:true,entry:added};
 });
}
/** Queue survives midnight. The worker inserts one entry between compatible ordinary calls. */
export async function nextWeeklyPurchase(pool:Pool,sid:number){
 await weeklyEventSchema(pool);
 return inTransaction(pool,async c=>{
  await lockStreamer(c,sid);
  const control=(await c.query('SELECT desired_enabled,dashboard_settings,runtime_status FROM automod_control WHERE streamer_id=$1',[sid])).rows[0];
  if(!control?.desired_enabled)return null;
  const modes=[control.dashboard_settings?.mode,control.runtime_status?.mode];
  if(modes.some(m=>m&&m!=='automod'))return null;
  const row=(await c.query(`SELECT q.* FROM automod_weekly_entries q JOIN automod_weekly_events e ON e.id=q.event_id
   WHERE e.streamer_id=$1 AND e.status='open' AND q.status NOT IN ('completed','failed')
   ORDER BY q.created_at,q.id LIMIT 1 FOR UPDATE OF q`,[sid])).rows[0];
  if(!row)return null;
  // An ambiguous purchase blocks this queue: never silently issue another purchase.
  if(row.status==='queued')await c.query("UPDATE automod_weekly_entries SET status='opening' WHERE id=$1",[row.id]);
  return {...row,status:row.status==='queued'?'opening':row.status};
 });
}
export async function quoteWeeklyPurchase(pool:Pool,sid:number,id:string,offers:BonusOffer[],kinds:Record<string,PurchaseOption['kind']>,verifiedMinimumStake?:number){
 const valid=validateOffers(offers);await weeklyEventSchema(pool);
 return inTransaction(pool,async c=>{
  const row=await entry(c,sid,id);
  if(row.status!=='opening')throw Error('weekly_invalid_transition');
  const minimum=verifiedMinimumStake??Number(row.session_stake_cents);
  if(!Number.isSafeInteger(minimum)||minimum<1||minimum>10000)throw Error('weekly_invalid_stake');
  const option=selectSessionPurchase(row.provider,Math.max(Number(row.session_stake_cents),minimum),valid.filter(o=>o.baseStakeCents===minimum&&!/__left$/.test(o.id)).map(o=>({id:o.id,kind:kinds[o.id]??'other',costCents:o.costCents,stakeCents:o.baseStakeCents,verified:true})));
  if(!option)throw Error('weekly_no_eligible_bonus');
  const quote=valid.find(o=>o.id===option.id)!;
  if(row.quote&&JSON.stringify(row.quote)!==JSON.stringify(quote)){
   // JSONB ordering is not stable; compare the actual quoted values.
   if(Object.entries(quote).some(([k,v])=>row.quote[k]!==v))throw Error('weekly_quote_changed');
  }
  await c.query('UPDATE automod_weekly_entries SET quote=$2 WHERE id=$1',[id,JSON.stringify(quote)]);return quote;
 });
}
export async function weeklyPurchaseIntent(pool:Pool,sid:number,id:string,offer:BonusOffer,upgradeId?:string){
 const quote=validateOffers([offer])[0]!;await weeklyEventSchema(pool);
 return inTransaction(pool,async c=>{
  const row=await entry(c,sid,id);
  if(['purchase-sent','bonus','completed','uncertain'].includes(row.status))return {authorized:false,status:row.status};
  if(row.status!=='opening'||!row.quote)throw Error('weekly_quote_changed');
  if(upgradeId){
   if(!/^[a-f0-9-]{36}$/.test(upgradeId))throw Error('weekly_upgrade_invalid');
   const upgrade=(await c.query("SELECT * FROM automod_shop_orders WHERE id=$1 AND streamer_id=$2 AND upgrade_kind='weekly' AND upgrade_target=$3 AND rumble_user_id=$4 FOR UPDATE",[upgradeId,sid,id,row.rumble_user_id])).rows[0];
   if(!upgrade||upgrade.status!=='chosen'||Object.entries(quote).some(([k,v])=>upgrade.selected_offer?.[k]!==v)||Object.entries(row.quote).some(([k,v])=>upgrade.upgrade_baseline?.[k]!==v))throw Error('weekly_quote_changed');
   await c.query("UPDATE automod_shop_orders SET status='purchase-sent',purchase_sent_at=NOW(),updated_at=NOW() WHERE id=$1",[upgradeId]);
  }else if(Object.entries(quote).some(([k,v])=>row.quote[k]!==v))throw Error('weekly_quote_changed');
  const control=(await c.query('SELECT desired_enabled,dashboard_settings,runtime_status FROM automod_control WHERE streamer_id=$1',[sid])).rows[0];
  if(!control?.desired_enabled||[control.dashboard_settings?.mode,control.runtime_status?.mode].some(m=>m&&m!=='automod'))throw Error('weekly_mode_changed');
  await c.query("UPDATE automod_weekly_entries SET status='purchase-sent',quote=$2 WHERE id=$1",[id,JSON.stringify(quote)]);return {authorized:true,status:'purchase-sent'};
 });
}
export async function finishWeeklyPurchase(pool:Pool,sid:number,id:string,gainCents:number){
 if(!Number.isSafeInteger(gainCents)||gainCents<0||gainCents>100000000)throw Error('weekly_invalid_gain');
 await weeklyEventSchema(pool);
 return inTransaction(pool,async c=>{
  const row=await entry(c,sid,id);
  if(row.status==='completed'){if(Number(row.gain_cents)!==gainCents)throw Error('weekly_result_conflict');return {changed:false};}
  if(!['purchase-sent','bonus','uncertain'].includes(row.status)||!row.quote)throw Error('weekly_invalid_transition');
  await c.query("UPDATE automod_weekly_entries SET status='completed',gain_cents=$2,completed_at=NOW() WHERE id=$1",[id,gainCents]);
  await lockWallet(c,sid,row.rumble_user_id,row.username);
  await walletEntry(c,sid,row.rumble_user_id,`weekly:${id}:participation`,0,0,'event-participation',{eventId:row.event_id});
  return {changed:true};
 });
}
export async function tickWeeklyEvents(pool:Pool,sid:number){
 await weeklyEventSchema(pool);
 const due=(await pool.query("SELECT day FROM automod_weekly_events WHERE streamer_id=$1 AND status='open' AND closes_at<=NOW() ORDER BY day",[sid])).rows;
 const settled=[];
 for(const row of due){try{const result=await settleWeeklyEvent(pool,sid,row.day);if(result?.changed)settled.push({day:row.day,...result});}
  catch(e){if(!(e instanceof Error)||e.message!=='weekly_pending_entries')throw e;}}
 return settled;
}
export async function failWeeklyPurchase(pool:Pool,sid:number,id:string,reason:string){
 await weeklyEventSchema(pool);return inTransaction(pool,async c=>{
  const row=await entry(c,sid,id);if(['completed','failed'].includes(row.status))return {status:row.status};
  const status=['purchase-sent','bonus','uncertain'].includes(row.status)?'uncertain':'failed';
  await c.query('UPDATE automod_weekly_entries SET status=$2,reason=$3 WHERE id=$1',[id,status,reason.slice(0,500)]);return {status};
 });
}
export async function settleWeeklyEvent(pool:Pool,sid:number,day:string,now=new Date()){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('weekly_invalid_day');await weeklyEventSchema(pool);
 return inTransaction(pool,async c=>{
  await lockStreamer(c,sid);
  const event=(await c.query('SELECT * FROM automod_weekly_events WHERE streamer_id=$1 AND day=$2 FOR UPDATE',[sid,day])).rows[0];
  if(!event)return null;if(event.status==='settled')return {changed:false};
  if(now.getTime()<new Date(event.closes_at).getTime())throw Error('weekly_still_open');
  if((await c.query("SELECT 1 FROM automod_weekly_entries WHERE event_id=$1 AND status NOT IN ('completed','failed') LIMIT 1",[event.id])).rowCount)throw Error('weekly_pending_entries');
  const winners=(await c.query(`SELECT rumble_user_id,username,gain_cents,quote FROM automod_weekly_entries WHERE event_id=$1 AND status='completed'
   ORDER BY gain_cents::numeric/(quote->>'baseStakeCents')::numeric DESC,created_at,id LIMIT 3`,[event.id])).rows;
  for(let rank=0;rank<winners.length;rank++){
   const winner=winners[rank];
   await c.query(`INSERT INTO automod_event_scores(streamer_id,rumble_user_id,event_key,month,points)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT(streamer_id,event_key) DO NOTHING`,[sid,winner.rumble_user_id,`meilleur-achat:${day}:rank:${rank+1}`,day.slice(0,7),EVENT_RULES.dailyEventRankPoints[rank]]);
  }
  await c.query("UPDATE automod_weekly_events SET status='settled',settled_at=$2 WHERE id=$1",[event.id,now]);
  return {changed:true,winners:winners.map((w,i)=>({userId:w.rumble_user_id,username:w.username,multiplier:Number(w.gain_cents)/Number(w.quote.baseStakeCents),points:EVENT_RULES.dailyEventRankPoints[i]}))};
 });
}
