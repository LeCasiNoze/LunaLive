import {settleReferral} from './referral.js';
import {purchaseUpgradeSchema,assertUpgradeContext} from './purchase-upgrades.js';
import {discountedPoints} from './profile.js';
import type { Pool } from "pg";
import { bonusPointPrice,bonusRebatePoints,performancePoints,SHOP_RULES,validateOffers,validRumbleIdentity } from "./rules.js";
import { inTransaction,lockWallet,walletEntry,readWallet } from "./wallet.js";
export function purchaseCertainlyNotSent(reason:unknown):boolean{
 if(typeof reason!=='string'||!reason.startsWith('SHOP_BUY_NOT_TRIGGERED: select: '))return false;
 try{const value=JSON.parse(reason.slice('SHOP_BUY_NOT_TRIGGERED: select: '.length));return value.triggered===false&&['shop-control-not-unique-or-visible','native-shop-action-refused'].includes(value.error);}catch{return false;}
}
/** Only a native selection refusal proves no purchase confirmation was sent. */
export async function reconcileProvenUnsentPurchases(pool:Pool,streamerId:number){
 return inTransaction(pool,async c=>{
  await c.query('SELECT pg_advisory_xact_lock($1)',[streamerId]);
  const rows=(await c.query("SELECT * FROM automod_shop_orders WHERE streamer_id=$1 AND status='uncertain' AND spent_points=0 AND reserved_points>0 ORDER BY rumble_user_id,id FOR UPDATE",[streamerId])).rows;
  const released=[];
  for(const o of rows){
   if(!purchaseCertainlyNotSent(o.result?.reason))continue;
   await lockWallet(c,streamerId,o.rumble_user_id,o.username);
   await walletEntry(c,streamerId,o.rumble_user_id,`order:${o.id}:refund-reservation`,0,-Number(o.reserved_points),'technical-failure-release',{reason:'native-selection-refused-before-confirmation'});
   await c.query("UPDATE automod_shop_orders SET status='refunded',reserved_points=0,result=$3,updated_at=NOW(),completed_at=NOW() WHERE streamer_id=$1 AND id=$2",[streamerId,o.id,JSON.stringify({reason:'native-selection-refused-before-confirmation',previous:o.result})]);
   released.push({username:o.username,wallet:await readWallet(c,streamerId,o.rumble_user_id)});
  }return released;
 });
}

export async function ordersForCall(pool:Pool,streamerId:number,callId:string){
 await purchaseUpgradeSchema(pool);
 const r=await pool.query(`SELECT id,kind,tier,offer_id AS "offerId",status,selected_offer AS "selectedOffer",offers,
 reserved_points AS "reservedPoints",rumble_user_id AS "rumbleUserId",slot_name AS "slotName",call_id::text AS "callId",result
 FROM automod_shop_orders WHERE streamer_id=$1 AND upgrade_kind IS NULL AND ((call_id::text=$2 AND kind<>'globalstake' AND status NOT IN ('expired','refunded'))
 OR (kind='globalstake' AND (status IN ('pending','opening') OR status='done' AND (result->>'activeUntil')::timestamptz>NOW()))) ORDER BY created_at`,[streamerId,callId]);
 return r.rows;
}
/** A deleted pending call must not strand its points. Never release an ambiguous purchase. */
export async function reconcileRemovedShopCalls(pool:Pool,streamerId:number){
 return inTransaction(pool,async c=>{
  await c.query(`SELECT pg_advisory_xact_lock($1)`,[streamerId]);
  const mode=await c.query(`SELECT runtime_status FROM automod_control WHERE streamer_id=$1 FOR UPDATE`,[streamerId]);
  const activeCall=String(mode.rows[0]?.runtime_status?.slot?.callId??'');
  const orders=await c.query(`SELECT * FROM automod_shop_orders o WHERE streamer_id=$1
    AND status IN ('pending','opening','offered','chosen') AND call_id::text<>$2
    AND NOT EXISTS(SELECT 1 FROM calls_queue q WHERE q.streamer_id=o.streamer_id AND q.id=o.call_id)
    ORDER BY rumble_user_id,id FOR UPDATE`,[streamerId,activeCall]);
  const released=[];
  for(const o of orders.rows){
   await lockWallet(c,streamerId,o.rumble_user_id,o.username);
   await walletEntry(c,streamerId,o.rumble_user_id,`order:${o.id}:refund-reservation`,0,-Number(o.reserved_points),'technical-failure-release',{reason:'pending-call-removed'});
   await c.query(`UPDATE automod_shop_orders SET status='refunded',reserved_points=0,result=$3,updated_at=NOW(),completed_at=NOW() WHERE streamer_id=$1 AND id=$2`,[streamerId,o.id,JSON.stringify({reason:'pending-call-removed'})]);
   released.push({username:o.username,wallet:await readWallet(c,streamerId,o.rumble_user_id)});
  }
  return released;
 });
}
export async function mutateOrder(pool:Pool,streamerId:number,id:string,action:string,input:any){
 return inTransaction(pool,async c=>{
  await c.query(`SELECT pg_advisory_xact_lock($1)`,[streamerId]);
  const r=await c.query(`SELECT * FROM automod_shop_orders WHERE streamer_id=$1 AND id=$2 FOR UPDATE`,[streamerId,id]);
  const o=r.rows[0];if(!o)throw Error('order_not_found');
  await lockWallet(c,streamerId,o.rumble_user_id,o.username);
  const result=(extra:any={})=>({id:o.id,status:o.status,...extra});
  if(['done','expired','refunded'].includes(o.status))return result({changed:false});
  async function status(next:string,fields:any={}){
   await c.query(`UPDATE automod_shop_orders SET status=$3,result=COALESCE($4::jsonb,result),updated_at=NOW(),
    completed_at=CASE WHEN $3 IN ('done','expired','refunded') THEN NOW() ELSE completed_at END WHERE streamer_id=$1 AND id=$2`,[streamerId,id,next,fields.result?JSON.stringify(fields.result):null]);
   o.status=next;return result({changed:true,...fields,username:o.username,wallet:await readWallet(c,streamerId,o.rumble_user_id)});
  }
  if(action==='claim'){
   if(!['pending','opening'].includes(o.status))return result({changed:false,tier:o.tier});
   if(o.result?.challengeId){
    const valid=(await c.query(`SELECT 1 FROM automod_provider_challenges e JOIN automod_control a ON a.streamer_id=e.streamer_id
     WHERE e.id::text=$2 AND e.streamer_id=$1 AND e.status IN ('preparing','playing') AND e.cancel_requested_at IS NULL AND a.desired_enabled=TRUE
     AND (a.dashboard_settings->>'mode'='provider-challenge' OR a.runtime_status->>'mode'='provider-challenge')`,[streamerId,o.result.challengeId])).rowCount;
    if(!valid){
     if(o.status!=='pending')throw Error('challenge_boost_reconciliation_required');
     await walletEntry(c,streamerId,o.rumble_user_id,`order:${id}:refund-reservation`,0,-Number(o.reserved_points),'technical-failure-release',{reason:'challenge-ended-before-boost'});
     await c.query('UPDATE automod_shop_orders SET reserved_points=0 WHERE streamer_id=$1 AND id=$2',[streamerId,id]);
     return status('refunded',{result:{...o.result,reason:'challenge-ended-before-boost'}});
    }
   }
   return status('opening',{tier:o.tier});
  }
  if(action==='menu'){
   if(o.upgrade_kind)throw Error('upgrade_menu_requires_requote');
   if(o.kind!=='buy'||!['pending','opening','offered','chosen'].includes(o.status))throw Error('invalid_order_transition');
   const offers=validateOffers(input.offers);
   const cacheBase=Number(input.cacheBaseStakeCents);
   if(!Number.isSafeInteger(cacheBase)||cacheBase<=0||cacheBase>10000)throw Error('invalid_cache_stake');
   await c.query(`INSERT INTO automod_bonus_catalog(streamer_id,slot_key,slot_name,provider,base_stake_cents,offers)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(streamer_id,slot_key,base_stake_cents) DO UPDATE SET offers=EXCLUDED.offers,observed_at=NOW()`,[streamerId,o.slot_key,o.slot_name,o.provider,cacheBase,JSON.stringify(offers)]);
   const selected=o.offer_id?offers.find(f=>f.id===o.offer_id):null;
   // A known command is not permission for a higher price or a different base stake.
   if(selected&&o.selected_offer&&(selected.costCents!==o.selected_offer.costCents||selected.baseStakeCents!==o.selected_offer.baseStakeCents))throw Error('bonus_quote_changed');
   if(o.offer_id&&!selected)throw Error('bonus_variant_missing');
   const reserve=selected?discountedPoints(bonusPointPrice(selected.costCents),Number(o.discount_percent)):Math.ceil(discountedPoints(bonusPointPrice(Math.min(...offers.map(f=>f.costCents))),Number(o.discount_percent))/2);
   const delta=reserve-Number(o.reserved_points);
   if(delta)await walletEntry(c,streamerId,o.rumble_user_id,`order:${id}:menu-reserve:${reserve}`,0,delta,'actual-bonus-menu');
   await c.query(`UPDATE automod_shop_orders SET offers=$3,selected_offer=$4,reserved_points=$5 WHERE streamer_id=$1 AND id=$2`,[streamerId,id,JSON.stringify(offers),selected?JSON.stringify(selected):null,reserve]);
   o.offers=offers;o.reserved_points=reserve;o.selected_offer=selected;
   return status(selected?'chosen':'offered',{offers,selectedOffer:selected,reservedPoints:reserve,username:o.username});
  }
  if(action==='intent'){
   if(o.status==='purchase-sent'||o.status==='bonus'||o.status==='uncertain')return result({changed:false});
   if(o.kind!=='buy'||o.status!=='chosen'||!o.selected_offer)throw Error('invalid_order_transition');
   const offer=validateOffers([input.offer])[0]!;
   if(offer.id!==o.selected_offer.id||offer.costCents!==o.selected_offer.costCents||offer.baseStakeCents!==o.selected_offer.baseStakeCents)throw Error('bonus_quote_changed');
   await assertUpgradeContext(c,streamerId,o,input.upgradeBaseline);
   const mode=await c.query(`SELECT desired_enabled FROM automod_control WHERE streamer_id=$1 FOR UPDATE`,[streamerId]);
   if(!mode.rows[0]?.desired_enabled)throw Error('automod_disabled');
   const previous=await c.query(`SELECT EXTRACT(EPOCH FROM (MAX(purchase_sent_at)+INTERVAL '10 minutes'-NOW()))*1000 AS wait FROM automod_shop_orders WHERE streamer_id=$1 AND kind='buy' AND status IN ('purchase-sent','bonus','done','uncertain') AND id<>$2`,[streamerId,id]);
   if(!o.upgrade_kind&&Number(previous.rows[0]?.wait)>0)return result({changed:false,waitMs:Number(previous.rows[0].wait)});
   // Persist BEFORE the irreversible click. Repeated calls never authorize a second click.
   await c.query(`UPDATE automod_shop_orders SET purchase_sent_at=NOW() WHERE streamer_id=$1 AND id=$2`,[streamerId,id]);
   return status('purchase-sent',{offer,authorized:true});
  }
  if(action==='confirmed'){
   if(o.status==='bonus')return result({changed:false});
   if(o.kind!=='buy'||o.status!=='purchase-sent')throw Error('invalid_order_transition');
   const cost=Number(o.reserved_points);
   await walletEntry(c,streamerId,o.rumble_user_id,`order:${id}:spent`,-cost,-cost,'bonus-purchased',o.selected_offer);
   await c.query(`UPDATE automod_shop_orders SET spent_points=$3,reserved_points=0 WHERE streamer_id=$1 AND id=$2`,[streamerId,id,cost]);
   return status('bonus',{spentPoints:cost});
  }
  if(action==='boost-applied'){
   if(o.kind==='buy'||!['pending','opening'].includes(o.status))throw Error('invalid_order_transition');
   if(input.applied!==true)throw Error('boost_not_verified');
   const cost=Number(o.reserved_points);
   await walletEntry(c,streamerId,o.rumble_user_id,`order:${id}:spent`,-cost,-cost,'boost-applied',input);
   await c.query(`UPDATE automod_shop_orders SET spent_points=$3,reserved_points=0 WHERE streamer_id=$1 AND id=$2`,[streamerId,id,cost]);
   if(o.kind==='globalstake'){
    const clock=await c.query(`SELECT NOW()+INTERVAL '1 hour' AS until`);
    return status('done',{spentPoints:cost,result:{...input,factor:SHOP_RULES.globalStake.factor,activeUntil:new Date(clock.rows[0].until).toISOString()}});
   }
   return status('done',{spentPoints:cost,result:input});
  }
  if(action==='complete'){
   if(o.kind!=='buy'||o.status!=='bonus'||!Number.isSafeInteger(input.gainCents)||input.gainCents<0||input.gainCents>100000000)throw Error('invalid_bonus_result');
   const rebate=bonusRebatePoints(Number(o.spent_points),input.gainCents,o.selected_offer.costCents);
   await walletEntry(c,streamerId,o.rumble_user_id,`order:${id}:rebate`,rebate,0,'bonus-rebate',{gainCents:input.gainCents,costCents:o.selected_offer.costCents});
   return status('done',{result:{gainCents:input.gainCents,rebatePoints:rebate,costCents:o.selected_offer.costCents},username:o.username});
  }
  if(action==='expire'){
   if(o.kind!=='buy'||o.status!=='offered'||input.played!==true||input.technicalFailure===true)throw Error('no_response_fee_not_allowed');
   const offers=validateOffers(o.offers),fee=Math.ceil(discountedPoints(bonusPointPrice(Math.min(...offers.map(f=>f.costCents))),Number(o.discount_percent))/2);
   if(fee!==Number(o.reserved_points))throw Error('fee_not_reserved');
   await walletEntry(c,streamerId,o.rumble_user_id,`order:${id}:no-response`,-fee,-Number(o.reserved_points),'no-response-priority-fee');
   await c.query(`UPDATE automod_shop_orders SET spent_points=$3,reserved_points=0 WHERE streamer_id=$1 AND id=$2`,[streamerId,id,fee]);
   return status('expired',{result:{feePoints:fee},username:o.username});
  }
  if(action==='failure'){
   if(['purchase-sent','bonus','uncertain'].includes(o.status)&&!(o.status!=='bonus'&&Number(o.spent_points)===0&&purchaseCertainlyNotSent(input.reason)))return status('uncertain',{result:{reason:String(input.reason??'purchase-unconfirmed').slice(0,240)}});
   const reserved=Number(o.reserved_points);
   await walletEntry(c,streamerId,o.rumble_user_id,`order:${id}:refund-reservation`,0,-reserved,'technical-failure-release',input);
   await c.query(`UPDATE automod_shop_orders SET reserved_points=0 WHERE streamer_id=$1 AND id=$2`,[streamerId,id]);
   return status('refunded',{result:{reason:String(input.reason??'technical-failure').slice(0,240)},username:o.username});
  }
  throw Error('unknown_shop_action');
 });
}

export async function ingestPointsEvent(pool:Pool,streamerId:number,event:any){
 if(!event||typeof event.id!=='string'||event.id.length>230||typeof event.kind!=='string'||!event.item
   ||!validRumbleIdentity(event.item.requestedByRumbleId)||JSON.stringify(event).length>12000)throw Error('invalid_points_event');
 const uid=event.item.requestedByRumbleId,username=String(event.item.requestedBy??'').slice(0,80);
 const d=event.data??{},origin=d.purchaseOrderId?'purchase':d.inheritedBonus?'inherited':'natural';
 let amount=0,key='';
 if(event.kind==='first-spin-settled'||event.kind==='call-played'){amount=SHOP_RULES.firstSpinPoints;key=`first:${event.item.callId}`;}
 else if(event.kind==='bonus-started'&&origin==='natural'){amount=SHOP_RULES.naturalBonusPoints;key=`bonus-start:${event.visitId}:${d.bonus?.startedAt}`;}
 else if(event.kind==='bonus-ended'){amount=performancePoints(d.bonus?.gainCents,d.baseStakeCents,origin);key=`bonus-result:${event.visitId}:${d.bonus?.startedAt}`;}
 else if(event.kind==='round'&&!d.bonusActive){amount=performancePoints(d.gainCents,d.baseStakeCents,origin);key=`round:${event.visitId}:${d.roundNumber}`;}
 else return {accepted:true,points:0};
 if(!event.item.callId||!event.visitId||key.endsWith(':undefined'))throw Error('invalid_reward_identity');
 return inTransaction(pool,async c=>{
  await c.query('SELECT pg_advisory_xact_lock($1)',[streamerId]);
  await lockWallet(c,streamerId,uid,username);
  const seen=await c.query(`INSERT INTO automod_points_events(streamer_id,event_key,kind,payload) VALUES($1,$2,$3,$4)
    ON CONFLICT DO NOTHING RETURNING event_key`,[streamerId,key,event.kind,JSON.stringify(event)]);
  if(!seen.rowCount)return {accepted:true,points:0,duplicate:true};
  if(amount)await walletEntry(c,streamerId,uid,`reward:${key}`,amount,0,event.kind,{sessionId:event.sessionId,slotName:event.item.slotName});
  if(event.kind==='first-spin-settled'||event.kind==='call-played')await settleReferral(c,streamerId,uid);
  return {accepted:true,points:amount,userId:uid,username,wallet:await readWallet(c,streamerId,uid)};
 });
}
