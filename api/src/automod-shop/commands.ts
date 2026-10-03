import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { resolveSlot } from "../calls/catalog.js";
import { keyText } from "../calls/normalize.js";
import { normalizeProvider } from "../calls/provider_aliases.js";
import { automodProviderAllowed } from "../calls/automod_provider_policy.js";
import { getCallsSettings,isUserBannedFromCalls,isSlotBanned,isProviderBanned,isProviderAllowedByPolicy } from "../calls/queue.js";
import { SHOP_RULES,parseShopCommand,bonusPointPrice,validateOffers,validRumbleIdentity } from "./rules.js";
import { inTransaction,lockWallet,walletEntry,readWallet,walletSummary } from "./wallet.js";
import {effectiveShopStake} from './effective-stake.js';
import {requirePurchaseSlotAvailable} from './purchase-queue.js';

export interface ShopChatMessage { streamerId:number; userId:string; username:string; messageId:string; text:string; createdAt:Date; }
const SHOP_URL="https://lecasinoze.onrender.com/automod-shop/";
export async function handleShopChat(pool:Pool,m:ShopChatMessage):Promise<string|null> {
  if(!validRumbleIdentity(m.userId) || !m.messageId) return null;
  const open=await pool.query(`SELECT id FROM automod_shop_orders WHERE streamer_id=$1 AND rumble_user_id=$2 AND status='offered' LIMIT 1`,[m.streamerId,m.userId]);
  const cmd=parseShopCommand(m.text,Boolean(open.rowCount));
  if(!cmd)return null;
  const control=await pool.query(`SELECT desired_enabled,dashboard_settings,runtime_status FROM automod_control WHERE streamer_id=$1`,[m.streamerId]);
  if(control.rows[0]?.desired_enabled!==true)return `@${m.username} — Le shop et les points sont disponibles pendant l’Automod.`;
  // SSE init replays old messages: do not turn them into new orders or rain joins.
  if(Date.now()-m.createdAt.getTime()>120_000 || m.createdAt.getTime()>Date.now()+30_000)return null;
  try{
    if(cmd.kind==='shop')return `@${m.username} — Le shop Automod : ${SHOP_URL} Choisis une option, puis copie sa commande ici. Aucun compte nécessaire !`;
    if(cmd.kind==='balance'){
      return `@${m.username} — ${walletSummary(await readWallet(pool,m.streamerId,m.userId))} !shop pour les utiliser.`;
    }
    if(cmd.kind==='rain'){
      return await inTransaction(pool,async c=>{
        await c.query(`SELECT pg_advisory_xact_lock($1)`,[m.streamerId]);
        const rain=await c.query(`SELECT id,points FROM automod_points_rains WHERE streamer_id=$1 AND closes_at>NOW() ORDER BY opened_at DESC LIMIT 1`,[m.streamerId]);
        if(!rain.rows[0])return `@${m.username} — Pas de rain en cours. Le bot annoncera le prochain !`;
        await lockWallet(c,m.streamerId,m.userId,m.username);
        const added=await walletEntry(c,m.streamerId,m.userId,`rain:${rain.rows[0].id}:${m.userId}`,Number(rain.rows[0].points),0,'rain');
        return `@${m.username} — ${added?`+${rain.rows[0].points} points, rain récupéré !`:'Tu as déjà récupéré ce rain.'} ${walletSummary(await readWallet(c,m.streamerId,m.userId))}`;
      });
    }
    if(cmd.kind==='choose'){
      return await inTransaction(pool,async c=>{
        await c.query(`SELECT pg_advisory_xact_lock($1)`,[m.streamerId]);
        await lockWallet(c,m.streamerId,m.userId,m.username);
        const r=await c.query(`SELECT * FROM automod_shop_orders WHERE streamer_id=$1 AND rumble_user_id=$2 AND status='offered' ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,[m.streamerId,m.userId]);
        const order=r.rows[0];if(!order)return `@${m.username} — Aucun choix d’achat en attente pour toi.`;
        const offers=validateOffers(order.offers),offer=offers[cmd.choice-1];
        if(!offer)return `@${m.username} — Choisis un numéro entre 1 et ${offers.length}.`;
        const price=bonusPointPrice(offer.costCents),delta=price-Number(order.reserved_points);
        if(delta)await walletEntry(c,m.streamerId,m.userId,`order:${order.id}:choice:${offer.id}`,0,delta,'bonus-choice-reservation');
        await c.query(`UPDATE automod_shop_orders SET status='chosen',selected_offer=$3,offer_id=$4,reserved_points=$5,updated_at=NOW() WHERE streamer_id=$1 AND id=$2`,[m.streamerId,order.id,JSON.stringify(offer),offer.id,price]);
        return `@${m.username} — ${offer.label} sélectionné (${(offer.costCents/100).toFixed(2)} €, ${price} points réservés). ${walletSummary(await readWallet(c,m.streamerId,m.userId))} Achat dès la fin du round ou bonus en cours.`;
      });
    }
    if(cmd.kind==='globalstake'){
      return await inTransaction(pool,async c=>{
        await c.query(`SELECT pg_advisory_xact_lock($1)`,[m.streamerId]);
        const mode=await c.query(`SELECT desired_enabled FROM automod_control WHERE streamer_id=$1 FOR UPDATE`,[m.streamerId]);
        if(!mode.rows[0]?.desired_enabled)throw Error('automod_disabled');
        const previous=await c.query(`SELECT id FROM automod_shop_orders WHERE streamer_id=$1 AND request_key=$2`,[m.streamerId,`rumble:${m.messageId}`]);
        if(previous.rowCount)return null;
        await c.query(`UPDATE automod_shop_orders SET status='expired',updated_at=NOW() WHERE streamer_id=$1 AND kind='globalstake' AND status='done' AND (result->>'activeUntil')::timestamptz<=NOW()`,[m.streamerId]);
        const active=await c.query(`SELECT id FROM automod_shop_orders WHERE streamer_id=$1 AND kind='globalstake' AND status IN ('pending','opening','done') LIMIT 1`,[m.streamerId]);
        if(active.rowCount)throw Error('global_boost_already_active');
        await lockWallet(c,m.streamerId,m.userId,m.username);
        const id=randomUUID(),price=SHOP_RULES.globalStake.points;
        await walletEntry(c,m.streamerId,m.userId,`order:${id}:reserve`,0,price,'global-stake-reservation');
        await c.query(`INSERT INTO automod_shop_orders(id,streamer_id,rumble_user_id,username,request_key,kind,slot_key,slot_name,provider,tier,reserved_points)
          VALUES($1,$2,$3,$4,$5,'globalstake','session','Session Automod','all',1,$6)`,[id,m.streamerId,m.userId,m.username,`rumble:${m.messageId}`,price]);
        return `@${m.username} — Mise de session ×3 pour une heure : ${price} points réservés. Début au premier spin confirmé sur la prochaine machine ; aucun cumul de boosts. ${walletSummary(await readWallet(c,m.streamerId,m.userId))}`;
      });
    }
    // Resolve exact catalogue identity before any points are reserved.
    const slot=await resolveSlot(pool,cmd.slotName);
    if(!slot || keyText(slot.name)!==keyText(cmd.slotName))return `@${m.username} — Machine non reconnue avec ce nom complet. Utilise la recherche du !shop.`;
    const provider=String(normalizeProvider(slot.provider)||'').toLowerCase();
    const allowed=control.rows[0].dashboard_settings?.allowedProviders??control.rows[0].runtime_status?.config?.allowedProviders??['hacksaw','pragmatic'];
    if(!automodProviderAllowed(provider,allowed))return `@${m.username} — Ce provider n’est pas autorisé dans cette session Automod.`;
    const settings=await getCallsSettings(pool,m.streamerId);
    if(!settings.enabled || await isUserBannedFromCalls(pool,m.streamerId,0,m.username)
      || await isSlotBanned(pool,m.streamerId,keyText(slot.name)) || await isProviderBanned(pool,m.streamerId,provider)
      || !await isProviderAllowedByPolicy(pool,m.streamerId,provider))return `@${m.username} — Ce call n’est pas autorisé.`;
    return await inTransaction(pool,async c=>{
      await c.query(`SELECT pg_advisory_xact_lock($1)`,[m.streamerId]);
      const mode=await c.query(`SELECT desired_enabled,dashboard_settings,runtime_status FROM automod_control WHERE streamer_id=$1 FOR UPDATE`,[m.streamerId]);
      if(!mode.rows[0]?.desired_enabled)throw Error('automod_disabled');
      const currentAllowed=mode.rows[0].dashboard_settings?.allowedProviders??mode.rows[0].runtime_status?.config?.allowedProviders??['hacksaw','pragmatic'];
      if(!automodProviderAllowed(provider,currentAllowed))throw Error('provider_not_allowed');
      const previous=await c.query(`SELECT id,status FROM automod_shop_orders WHERE streamer_id=$1 AND request_key=$2`,[m.streamerId,`rumble:${m.messageId}`]);
      if(previous.rows[0])return null;
      if(cmd.kind==='buy'){
        await requirePurchaseSlotAvailable(c,m.streamerId,keyText(slot.name));
      }
      const wallet=await lockWallet(c,m.streamerId,m.userId,m.username);
      if(cmd.kind==='buy'){
        const pending=await c.query(`SELECT 1 FROM automod_shop_orders WHERE streamer_id=$1 AND rumble_user_id=$2 AND kind='buy' AND status NOT IN ('done','expired','refunded') LIMIT 1`,[m.streamerId,m.userId]);
        if(pending.rowCount)throw Error('buy_already_pending');
        const cool=await c.query(`SELECT EXTRACT(EPOCH FROM (MAX(completed_at)+INTERVAL '15 minutes'-NOW())) AS remaining FROM automod_shop_orders WHERE streamer_id=$1 AND rumble_user_id=$2 AND kind='buy' AND status IN ('done','expired')`,[m.streamerId,m.userId]);
        if(Number(cool.rows[0]?.remaining)>0)throw Error(`cooldown:${Math.ceil(Number(cool.rows[0].remaining)/60)}`);
      }
      const sessionBase=Number(mode.rows[0].dashboard_settings?.stakeCents??mode.rows[0].runtime_status?.config?.stakeCents??10);
      const base=await effectiveShopStake(c,m.streamerId,sessionBase,m.userId,keyText(slot.name));
      if(cmd.kind==='stake'&&await effectiveShopStake(c,m.streamerId,sessionBase)>=sessionBase*SHOP_RULES.stake[cmd.tier-1]!.factor)throw Error('boost_already_covered');
      let points=0,offer:any=null;
      if(cmd.kind==='buy'){
        const cache=await c.query(`SELECT offers FROM automod_bonus_catalog WHERE streamer_id=$1 AND slot_key=$2 AND base_stake_cents=$3`,[m.streamerId,keyText(slot.name),base]);
        if(cmd.offerId){
          offer=cache.rows[0]?validateOffers(cache.rows[0].offers).find(o=>o.id===cmd.offerId):null;
          if(!offer)throw Error('bonus_menu_changed');points=bonusPointPrice(offer.costCents);
        }else{
          // Reserve half the actual cheapest cached buy, or a 100x base estimate.
          // Actual discovery replaces this amount before the no-response fee can apply.
          const cheapest=cache.rows[0]?Math.min(...validateOffers(cache.rows[0].offers).map(o=>o.costCents)):base*100;
          points=Math.ceil(bonusPointPrice(cheapest)/2);
        }
      }else points=(cmd.kind==='stake'?SHOP_RULES.stake:SHOP_RULES.duration)[cmd.tier-1]!.points;
      const existing=await c.query(`SELECT id::text,pos FROM calls_queue WHERE streamer_id=$1 AND rumble_user_id=$2 AND slot_key=$3 ORDER BY pos LIMIT 1 FOR UPDATE`,[m.streamerId,m.userId,keyText(slot.name)]);
      let call=existing.rows[0];
      const runtimeCall=String(mode.rows[0].runtime_status?.slot?.callId??'');
      if(call?.id===runtimeCall)throw Error('call_already_started');
      if(!call){
        const count=await c.query(`SELECT COUNT(*)::int AS n FROM calls_queue WHERE streamer_id=$1 AND rumble_user_id=$2`,[m.streamerId,m.userId]);
        if(Number(count.rows[0].n)>=SHOP_RULES.maxPendingCalls)throw Error('call_limit');
        const pos=await c.query(`SELECT COALESCE(MAX(pos),0)+1 AS p FROM calls_queue WHERE streamer_id=$1`,[m.streamerId]);
        const added=await c.query(`INSERT INTO calls_queue(streamer_id,slot_name,slot_key,provider,user_id,username,pos,rumble_user_id,is_bonus)
          VALUES($1,$2,$3,$4,0,$5,$6,$7,FALSE) RETURNING id::text,pos`,[m.streamerId,slot.name,keyText(slot.name),provider,m.username,pos.rows[0].p,m.userId]);
        call=added.rows[0];
        await c.query(`INSERT INTO calls_actions(user_id,streamer_id,action) VALUES(0,$1,'call_add')`,[m.streamerId]);
      }
      if(cmd.kind==='buy'){
        // FIFO of buy requests after the CURRENT call; classic queue remains visible.
        const buys=await c.query(`SELECT MAX(q.pos) AS p FROM automod_shop_orders o JOIN calls_queue q ON q.id=o.call_id WHERE o.streamer_id=$1 AND o.kind='buy' AND o.status NOT IN ('done','expired','refunded') AND q.id<>$2`,[m.streamerId,call.id]);
        const current=runtimeCall?await c.query(`SELECT pos FROM calls_queue WHERE streamer_id=$1 AND id::text=$2`,[m.streamerId,runtimeCall]):{rows:[]};
        const position=Math.max(Number(buys.rows[0]?.p??0),Number(current.rows[0]?.pos??0))+1;
        await c.query(`UPDATE calls_queue SET pos=pos+1 WHERE streamer_id=$1 AND pos>=$2 AND id<>$3`,[m.streamerId,position,call.id]);
        await c.query(`UPDATE calls_queue SET pos=$3 WHERE streamer_id=$1 AND id=$2`,[m.streamerId,call.id,position]);
      }
      const id=randomUUID();
      if(cmd.kind!=='buy'){
        const other=await c.query(`SELECT id,tier,status,reserved_points FROM automod_shop_orders WHERE streamer_id=$1 AND call_id=$2 AND kind=$3 AND status NOT IN ('refunded','expired') FOR UPDATE`,[m.streamerId,call.id,cmd.kind]);
        const old=other.rows[0];
        if(old){
          if(old.status!=='pending'||cmd.tier<=Number(old.tier))throw Error('boost_already_set');
          const difference=points-Number(old.reserved_points);
          if(wallet.available<difference)throw Error('insufficient_points');
          await walletEntry(c,m.streamerId,m.userId,`order:${old.id}:upgrade:${m.messageId}`,0,difference,'shop-upgrade-reservation');
          await c.query(`UPDATE automod_shop_orders SET tier=$3,reserved_points=$4,updated_at=NOW() WHERE streamer_id=$1 AND id=$2`,[m.streamerId,old.id,cmd.tier,points]);
          return `@${m.username} — ${slot.name} : palier ${cmd.tier} réservé, seulement ${difference} points supplémentaires. ${walletSummary(await readWallet(c,m.streamerId,m.userId))}`;
        }
      }
      if(wallet.available<points)throw Error('insufficient_points');
      await walletEntry(c,m.streamerId,m.userId,`order:${id}:reserve`,0,points,'shop-reservation');
      await c.query(`INSERT INTO automod_shop_orders(id,streamer_id,rumble_user_id,username,request_key,kind,slot_key,slot_name,provider,tier,offer_id,selected_offer,call_id,reserved_points)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,[id,m.streamerId,m.userId,m.username,`rumble:${m.messageId}`,cmd.kind,keyText(slot.name),slot.name,provider,'tier'in cmd?cmd.tier:null,cmd.kind==='buy'?cmd.offerId:null,offer?JSON.stringify(offer):null,call.id,points]);
      return `@${m.username} — ${slot.name} : ${points} points réservés. ${walletSummary(await readWallet(c,m.streamerId,m.userId))} ${cmd.kind==='buy'?(offer?'Bonus choisi, achat vérifié au passage sur la machine.':'Passage prioritaire ; choix du bonus dans le chat. Sans réponse : moitié du plus petit achat vérifié, uniquement si la machine joue.'):cmd.kind==='stake'?`Mise ×${SHOP_RULES.stake[cmd.tier-1]!.factor} demandée, Golden inclus dans le contrôle du coût.`:`Durée ×${SHOP_RULES.duration[cmd.tier-1]!.factor}.`}`;
    });
  }catch(error){
    const key=error instanceof Error?error.message:'';
    if(key==='global_boost_already_active')return `@${m.username} — Un boost de session est déjà actif ou réservé. Ils ne se cumulent pas.`;
    if(key==='boost_already_covered')return `@${m.username} — Le boost de session couvre déjà cette mise. Aucun point réservé ; choisis un palier supérieur.`;
    if(key==='buy_slot_already_waiting')return `@${m.username} — Cette machine est déjà en cours ou en attente. Attends la fin de son call avant de demander un achat dessus. Aucun point réservé.`;
    const labels:Record<string,string>={insufficient_points:'Points disponibles insuffisants.',buy_already_pending:'Tu as déjà un achat en attente.',bonus_menu_changed:'Menu du bonus non connu à cette mise. Utilise !achat + nom complet pour le découvrir.',call_limit:'Tu as déjà deux calls en attente.',call_already_started:'Cette amélioration doit être choisie avant le début du call.',boost_already_set:'Cette amélioration est déjà réservée pour ce call.',automod_disabled:'L’Automod est arrêté.'};
    return `@${m.username} — ${key.startsWith('cooldown:')?`Prochain achat possible dans ${key.split(':')[1]} min.`:labels[key]??'Demande non enregistrée. Réessaie dans un instant ; aucun débit partiel.'}`;
  }
}
