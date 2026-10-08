import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {inTransaction,lockWallet,walletEntry,readWallet} from './wallet.js';
import {findObservedBonusMenu} from './catalog.js';
import {validateOffers,bonusPointPrice,SHOP_RULES,type BonusOffer} from './rules.js';
import {discountedPoints,readProfile} from './profile.js';
import {selectSessionPurchase,type EventProvider} from './event-rules.js';
import {weeklyEventSchema} from './weekly-event.js';
import {huntSlotReserved} from '../calls/automod_hunt_reservations.js';

const schemas=new WeakMap<Pool,Promise<void>>();
export async function purchaseUpgradeSchema(pool:Pool){
 let ready=schemas.get(pool);
 if(!ready){ready=pool.query(`ALTER TABLE automod_shop_orders ADD COLUMN IF NOT EXISTS upgrade_kind text;
 ALTER TABLE automod_shop_orders ADD COLUMN IF NOT EXISTS upgrade_target text;
 ALTER TABLE automod_shop_orders ADD COLUMN IF NOT EXISTS upgrade_baseline jsonb;
 CREATE UNIQUE INDEX IF NOT EXISTS automod_one_upgrade_per_target ON automod_shop_orders(streamer_id,upgrade_kind,upgrade_target)
 WHERE upgrade_kind IS NOT NULL AND status NOT IN ('refunded','expired');`).then(()=>undefined).catch(e=>{schemas.delete(pool);throw e});schemas.set(pool,ready);}
 await ready;
}
export function baselinePurchase(provider:EventProvider,sessionStake:number,offers:BonusOffer[]){
 const base=offers[0]?.baseStakeCents??sessionStake;
 const option=selectSessionPurchase(provider,Math.max(sessionStake,base),offers.filter(o=>!/__left$/.test(o.id)).map(o=>({
  id:o.id,costCents:o.costCents,stakeCents:o.baseStakeCents,verified:true,
  kind:/bounty|progressive/i.test(o.id+' '+o.label)?'bounty' as const:/super|epic|legendary|ultra|enhanced/i.test(o.id+' '+o.label)?'other' as const:'classic' as const})));
 return option?offers.find(o=>o.id===option.id)!:null;
}
/** The caller validates the resolved catalog slot and channel bans first. */
export async function reservePurchaseUpgrade(pool:Pool,sid:number,viewer:{userId:string;username:string},request:{messageId:string;kind:'series'|'weekly';offerId:string;slotName:string;slotKey:string;provider:EventProvider}){
 await purchaseUpgradeSchema(pool);if(request.kind==='weekly')await weeklyEventSchema(pool);
 return inTransaction(pool,async c=>{
  await c.query('SELECT pg_advisory_xact_lock($1)',[sid]);
  const control=(await c.query('SELECT desired_enabled,dashboard_settings,runtime_status FROM automod_control WHERE streamer_id=$1 FOR UPDATE',[sid])).rows[0];
  if(!control?.desired_enabled)throw Error('automod_disabled');
  const required=request.kind==='series'?'session-buy':'automod';
  const modes=[control.dashboard_settings?.mode,control.runtime_status?.config?.mode??control.runtime_status?.mode].filter(Boolean);
  if(!modes.length||modes.some(m=>m!==required))throw Error('upgrade_mode_changed');
  const allowed=control.dashboard_settings?.allowedProviders??control.runtime_status?.config?.allowedProviders??[];
  if(!Array.isArray(allowed)||!allowed.includes(request.provider))throw Error('provider_not_allowed');
  if(await huntSlotReserved(c,sid,request.slotName))throw Error('automod_bonus_pending');
  const replay=(await c.query('SELECT id,reserved_points FROM automod_shop_orders WHERE streamer_id=$1 AND request_key=$2',[sid,'rumble:'+request.messageId])).rows[0];
  if(replay)return {created:false,id:replay.id,points:Number(replay.reserved_points)};
  let target:string,callId:string|null=null;
  let sessionStake=Number(control.dashboard_settings?.stakeCents??control.runtime_status?.config?.stakeCents);
  if(request.kind==='weekly'){
   const free=(await c.query(`SELECT q.* FROM automod_weekly_entries q JOIN automod_weekly_events e ON e.id=q.event_id
    WHERE e.streamer_id=$1 AND q.rumble_user_id=$2 AND q.slot_key=$3 AND e.status='open' AND q.status='queued'
    ORDER BY q.created_at LIMIT 1 FOR UPDATE OF q`,[sid,viewer.userId,request.slotKey])).rows[0];
   if(!free)throw Error('upgrade_free_entry_required');target=free.id;sessionStake=Number(free.session_stake_cents);
  }else{
   let call=(await c.query('SELECT id::text FROM calls_queue WHERE streamer_id=$1 AND rumble_user_id=$2 AND slot_key=$3 ORDER BY pos LIMIT 1 FOR UPDATE',[sid,viewer.userId,request.slotKey])).rows[0];
   if(call&&String(control.runtime_status?.slot?.callId??'')===call.id)throw Error('call_already_started');
   if(!call){
    if(Number((await c.query('SELECT COUNT(*) AS n FROM calls_queue WHERE streamer_id=$1 AND rumble_user_id=$2',[sid,viewer.userId])).rows[0].n)>=SHOP_RULES.maxPendingCalls)throw Error('call_limit');
    call=(await c.query(`INSERT INTO calls_queue(streamer_id,rumble_user_id,username,user_id,slot_name,slot_key,provider,pos,is_bonus)
     SELECT $1,$2,$3,0,$4,$5,$6,COALESCE(MAX(pos),0)+1,FALSE FROM calls_queue WHERE streamer_id=$1 RETURNING id::text`,[sid,viewer.userId,viewer.username,request.slotName,request.slotKey,request.provider])).rows[0];
   }
   callId=call.id;target=call.id;
  }
  const existing=await c.query("SELECT id FROM automod_shop_orders WHERE streamer_id=$1 AND upgrade_kind=$2 AND upgrade_target=$3 AND status NOT IN ('refunded','expired')",[sid,request.kind,target]);
  if(existing.rowCount)throw Error('upgrade_already_set');
  const menu=await findObservedBonusMenu(c,sid,request.slotKey,request.provider==='hacksaw'?Math.max(1,Math.floor(sessionStake/2)):sessionStake);
  if(!menu)throw Error('upgrade_menu_unknown');
  const offers=validateOffers(menu.offers),baseline=baselinePurchase(request.provider,sessionStake,offers),selected=offers.find(o=>o.id===request.offerId);
  if(!baseline||!selected||selected.baseStakeCents!==baseline.baseStakeCents||selected.costCents<=baseline.costCents)throw Error('upgrade_not_higher');
  const discount=(await readProfile(c,sid,viewer.userId)).discountPercent;
  const points=discountedPoints(bonusPointPrice(selected.costCents-baseline.costCents),discount),id=randomUUID();
  await lockWallet(c,sid,viewer.userId,viewer.username);
  await walletEntry(c,sid,viewer.userId,`order:${id}:reserve`,0,points,'shop-upgrade-reservation');
  await c.query(`INSERT INTO automod_shop_orders(id,streamer_id,rumble_user_id,username,request_key,kind,slot_key,slot_name,provider,offer_id,selected_offer,call_id,reserved_points,discount_percent,status,upgrade_kind,upgrade_target,upgrade_baseline)
   VALUES($1,$2,$3,$4,$5,'buy',$6,$7,$8,$9,$10,$11,$12,$13,'chosen',$14,$15,$16)`,[id,sid,viewer.userId,viewer.username,'rumble:'+request.messageId,request.slotKey,request.slotName,request.provider,selected.id,JSON.stringify(selected),callId,points,discount,request.kind,target,JSON.stringify(baseline)]);
  return {created:true,id,points,baseline,selected,wallet:await readWallet(c,sid,viewer.userId)};
 });
}
export async function purchaseUpgradeForTarget(pool:Pool,sid:number,kind:'series'|'weekly',target:string){
 await purchaseUpgradeSchema(pool);
 return (await pool.query(`SELECT id,status,selected_offer AS "selectedOffer",upgrade_baseline AS baseline FROM automod_shop_orders
  WHERE streamer_id=$1 AND upgrade_kind=$2 AND upgrade_target=$3 AND status NOT IN ('done','refunded','expired') ORDER BY created_at LIMIT 1`,[sid,kind,target])).rows[0]??null;
}
export async function assertUpgradeContext(c:PoolClient,sid:number,order:any,baseline:unknown){
 if(!order.upgrade_kind)return;
 const observed=validateOffers([baseline])[0]!;
 if(!order.upgrade_baseline||Object.entries(observed).some(([k,v])=>order.upgrade_baseline[k]!==v))throw Error('bonus_quote_changed');
 const control=(await c.query('SELECT desired_enabled,dashboard_settings,runtime_status FROM automod_control WHERE streamer_id=$1',[sid])).rows[0];
 const required=order.upgrade_kind==='series'?'session-buy':'automod';
 const modes=[control?.dashboard_settings?.mode,control?.runtime_status?.config?.mode??control?.runtime_status?.mode].filter(Boolean);
 if(!control?.desired_enabled||!modes.length||modes.some(m=>m!==required))throw Error('upgrade_mode_changed');
}

export async function reconcileUnusedPurchaseUpgrades(pool:Pool,sid:number){
 await purchaseUpgradeSchema(pool);await weeklyEventSchema(pool);
 return inTransaction(pool,async c=>{
  await c.query('SELECT pg_advisory_xact_lock($1)',[sid]);
  const unused=(await c.query(`SELECT o.* FROM automod_shop_orders o WHERE o.streamer_id=$1 AND o.status='chosen' AND (
   (o.upgrade_kind='series' AND NOT EXISTS(SELECT 1 FROM calls_queue q WHERE q.streamer_id=$1 AND q.id::text=o.upgrade_target)) OR
   (o.upgrade_kind='weekly' AND NOT EXISTS(SELECT 1 FROM automod_weekly_entries q WHERE q.id::text=o.upgrade_target AND q.status NOT IN ('failed','completed'))))
   ORDER BY o.rumble_user_id,o.id FOR UPDATE`,[sid])).rows;
  for(const order of unused){
   await lockWallet(c,sid,order.rumble_user_id,order.username);
   await walletEntry(c,sid,order.rumble_user_id,`order:${order.id}:refund-reservation`,0,-Number(order.reserved_points),'technical-failure-release',{reason:'upgrade-target-finished-without-purchase'});
   await c.query("UPDATE automod_shop_orders SET status='refunded',reserved_points=0,result=COALESCE(result,'{}')||'{\"reason\":\"upgrade-target-finished-without-purchase\"}'::jsonb,completed_at=NOW(),updated_at=NOW() WHERE id=$1",[order.id]);
  }
  return unused.map(o=>({id:o.id,username:o.username,points:Number(o.reserved_points)}));
 });
}
