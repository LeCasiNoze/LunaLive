import { Router } from "express";
import { pool } from "../db.js";
import { searchSlots } from "../calls/catalog.js";
import { keyText } from "../calls/normalize.js";
import { SHOP_RULES,validateOffers,type BonusOffer } from "../automod-shop/rules.js";
import { automodProviderAllowed } from "../calls/automod_provider_policy.js";
import {effectiveShopStake} from '../automod-shop/effective-stake.js';
import {findObservedBonusMenu} from '../automod-shop/catalog.js';
import {excludedSlotName} from '../calls/excluded-slot.js';
import {shopCommandAllowed} from '../automod-shop/mode-policy.js';
import {parisEventDay} from '../automod-shop/event-rules.js';
import {baselinePurchase} from '../automod-shop/purchase-upgrades.js';
export const automodShopRouter=Router();
// Public information only: the site generates commands; no browser may spend points.
automodShopRouter.get('/automod-shop',async(req,res)=>{
 try{
  const r=await pool.query(`SELECT s.id,c.desired_enabled,c.dashboard_settings,c.runtime_status,c.runtime_seen_at FROM streamers s
    LEFT JOIN automod_control c ON c.streamer_id=s.id WHERE lower(s.slug)='lecasinoze' LIMIT 1`);
  const row=r.rows[0];if(!row)return res.status(404).json({ok:false});
  const allowed=row.dashboard_settings?.allowedProviders??row.runtime_status?.config?.allowedProviders??['hacksaw','pragmatic'];
  const base=Number(row.dashboard_settings?.stakeCents??row.runtime_status?.config?.stakeCents??10);
  const catalogBase=await effectiveShopStake(pool,row.id,base);
  const q=String(req.query.q??'').trim().slice(0,160);
  const slots=q.length>=2?(await searchSlots(pool,q,12)).filter(s=>!excludedSlotName(s.name)&&automodProviderAllowed(s.provider,allowed)):[];
  const slotKey=keyText(String(req.query.slot??'').slice(0,160));
  let catalog=slotKey&&!excludedSlotName(slotKey)?await findObservedBonusMenu(pool,row.id,slotKey,catalogBase):null;
  let upgradeBaseline:BonusOffer|null=null;
  if(['serie','offert'].includes(String(req.query.upgrade))&&catalog){
    const family=automodProviderAllowed(catalog.provider,['hacksaw'])?'hacksaw':'pragmatic';
    if(family==='hacksaw')catalog=await findObservedBonusMenu(pool,row.id,slotKey,Math.max(1,Math.floor(base/2)));
    if(catalog){
      const offers=validateOffers(catalog.offers),baseline=baselinePurchase(family,base,offers);upgradeBaseline=baseline;
      catalog={...catalog,offers:baseline?offers.filter(o=>o.baseStakeCents===baseline.baseStakeCents&&o.costCents>baseline.costCents):[]};
    }
  }
  const rain=await pool.query(`SELECT points,closes_at FROM automod_points_rains WHERE streamer_id=$1 AND closes_at>NOW() ORDER BY opened_at DESC LIMIT 1`,[row.id]);
  res.setHeader('Cache-Control','no-store');
  const eventDay=parisEventDay(new Date());
  const weekly={name:'Meilleur Achat',day:eventDay.key,available:eventDay.active&&row.desired_enabled===true&&row.runtime_status?.publisherActive===true&&Date.now()-new Date(row.runtime_seen_at).getTime()<60000&&Array.isArray(row.runtime_status?.supportedFeatures)&&row.runtime_status.supportedFeatures.includes('weekly-purchase')};
  return res.json({ok:true,enabled:row.desired_enabled===true,mode:row.runtime_status?.config?.mode??row.dashboard_settings?.mode??'automod',availablePurchases:['buy','stake','duration','globalstake'].filter(kind=>shopCommandAllowed(row,kind)),durationAllowed:shopCommandAllowed(row,'duration'),rules:SHOP_RULES,baseStakeCents:base,effectiveBaseStakeCents:catalogBase,
    slotDurationMs:Number(row.dashboard_settings?.slotDurationMs??row.runtime_status?.config?.slotDurationMs??420000),
    allowedProviders:allowed,slots,bonusMenu:catalog,rain:rain.rows[0]??null,weekly,upgradeBaseline,upgradeAvailable:Array.isArray(row.runtime_status?.supportedFeatures)&&row.runtime_status.supportedFeatures.includes('purchase-upgrade')});
 }catch{return res.status(503).json({ok:false,error:'shop_temporarily_unavailable'});}
});
