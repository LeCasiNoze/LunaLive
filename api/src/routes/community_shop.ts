import {Router,type Request} from 'express';
import {pool} from '../db.js';
import {a} from '../utils/async.js';
import {exchangeCommunityCode,communityIdentity,revokeCommunitySession} from '../nozecoins/community-session.js';
import {requestAutomodDiscordLink,discordProfileSchema} from '../automod-shop/discord-profile.js';
import {linkedCoins,coinsProfile,coinAction,InsufficientCoins} from '../nozecoins/wallet.js';
import {UPGRADES,type Upgrade} from '../nozecoins/rules.js';
import {soundCatalogue,soundboardFeatureEnabled} from '../nozecoins/soundboard-config.js';
import {enqueueSound,SoundboardError} from '../nozecoins/soundboard.js';
export const communityShopRouter=Router();
const bearer=(req:Request)=>String(req.headers.authorization||'').match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1]??'';
// Opaque community sessions have no access to LunaLive JWT routes, Rubis or stream controls.
communityShopRouter.use('/community',(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
communityShopRouter.post('/community/auth/exchange',a(async(req,res)=>{
 try{return res.json({ok:true,token:await exchangeCommunityCode(pool,String(req.body?.code||''),String(req.body?.verifier||''))});}
 catch(e){if((e as Error).message==='invalid_code')return res.status(401).json({ok:false,error:'invalid_code'});throw e;}
}));
communityShopRouter.all('/community/me/:action?',a(async(req,res)=>{
 const discordId=await communityIdentity(pool,bearer(req));if(!discordId)return res.status(401).json({ok:false,error:'unauthorized'});
 const action=String(req.params.action||'profile');
 if(action==='logout'&&req.method==='POST'){await revokeCommunitySession(pool,bearer(req));return res.json({ok:true});}
 if(process.env.NOZECOINS_ENABLED!=='true')return res.status(503).json({ok:false,error:'coins_disabled'});
 const sid=Number((await pool.query("SELECT id FROM streamers WHERE lower(slug)='lecasinoze' LIMIT 1")).rows[0]?.id);
 if(!sid)return res.status(404).json({ok:false,error:'streamer_missing'});
 try{
  if(action==='link'&&req.method==='POST')return res.json({ok:true,...await requestAutomodDiscordLink(pool,sid,discordId)});
  await discordProfileSchema(pool);
  const link=await linkedCoins(pool,sid,discordId);
  if(action==='profile'&&req.method==='GET')return res.json({ok:true,linked:true,profile:await coinsProfile(pool,sid,link.rumble_user_id,link.username),shop:UPGRADES});
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'method_not_allowed'});
  const receipt=String(req.body?.receipt||'');
  if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(receipt))return res.status(400).json({ok:false,error:'bad_receipt'});
  if(action==='sound'){
   if(!soundboardFeatureEnabled())return res.status(503).json({ok:false,error:'soundboard_disabled'});
   const sound=soundCatalogue().find(s=>s.id===req.body?.soundId);
   if(!sound)return res.status(404).json({ok:false,error:'unknown_sound'});
   if(req.body?.expectedCost!==sound.cost)return res.status(409).json({ok:false,error:'sound_price_changed'});
   return res.json({ok:true,...await enqueueSound(pool,{streamerId:sid,rumbleId:link.rumble_user_id,username:link.username,receipt:'web:'+receipt,sound})});
  }
  if(action==='upgrade'){
   const upgrade=String(req.body?.upgrade) as Upgrade,tier=req.body?.tier;
   if(!Object.hasOwn(UPGRADES,upgrade)||!Number.isInteger(tier)||tier<1||tier>3)return res.status(400).json({ok:false,error:'bad_upgrade'});
   if(req.body?.expectedCost!==UPGRADES[upgrade].costs[tier-1])return res.status(409).json({ok:false,error:'price_changed'});
   return res.json({ok:true,...await coinAction(pool,sid,link.rumble_user_id,link.username,'upgrade','web:'+receipt,upgrade,tier-1)});
  }
  return res.status(404).json({ok:false,error:'unknown_action'});
 }catch(e){
  if((e as Error).message==='rumble_not_linked')return res.status(409).json({ok:false,error:'rumble_not_linked',linked:false});
  if(e instanceof InsufficientCoins)return res.status(409).json({ok:false,error:e.message,balance:e.balance,cost:e.cost,missing:e.cost-e.balance});
  if(e instanceof SoundboardError||['link_cooldown','stale_shop','max_tier'].includes((e as Error).message))return res.status(409).json({ok:false,error:(e as Error).message});
  throw e;
 }
}));
