import { Router } from "express";
import { pool } from "../db.js";
import { searchSlots } from "../calls/catalog.js";
import { keyText } from "../calls/normalize.js";
import { SHOP_RULES } from "../automod-shop/rules.js";
import { automodProviderAllowed } from "../calls/automod_provider_policy.js";
import {effectiveShopStake} from '../automod-shop/effective-stake.js';
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
  const slots=q.length>=2?(await searchSlots(pool,q,12)).filter(s=>automodProviderAllowed(s.provider,allowed)):[];
  const slotKey=keyText(String(req.query.slot??'').slice(0,160));
  const catalog=slotKey?await pool.query(`SELECT slot_name,provider,base_stake_cents,offers,observed_at FROM automod_bonus_catalog WHERE streamer_id=$1 AND slot_key=$2 AND base_stake_cents=$3`,[row.id,slotKey,catalogBase]):{rows:[]};
  const rain=await pool.query(`SELECT points,closes_at FROM automod_points_rains WHERE streamer_id=$1 AND closes_at>NOW() ORDER BY opened_at DESC LIMIT 1`,[row.id]);
  res.setHeader('Cache-Control','no-store');
  return res.json({ok:true,enabled:row.desired_enabled===true,rules:SHOP_RULES,baseStakeCents:base,effectiveBaseStakeCents:catalogBase,
    slotDurationMs:Number(row.dashboard_settings?.slotDurationMs??row.runtime_status?.config?.slotDurationMs??420000),
    allowedProviders:allowed,slots,bonusMenu:catalog.rows[0]??null,rain:rain.rows[0]??null});
 }catch{return res.status(503).json({ok:false,error:'shop_temporarily_unavailable'});}
});
