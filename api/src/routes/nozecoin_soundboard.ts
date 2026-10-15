import {Router} from 'express';
import {requireAuth} from '../auth.js';
import {pool} from '../db.js';
import {a} from '../utils/async.js';
import {controlSoundboard,heartbeatSoundboard,takeNextSound,settleSound,SoundboardError} from '../nozecoins/soundboard.js';
import {soundboardFeatureEnabled,soundCatalogue} from '../nozecoins/soundboard-config.js';
export const nozecoinSoundboardRouter=Router();

nozecoinSoundboardRouter.get('/public/nozecoins/sounds',(_req,res)=>{
 res.setHeader('Cache-Control','no-store');
 try{return res.json({ok:true,enabled:soundboardFeatureEnabled(),sounds:soundCatalogue()});}
 catch{return res.status(503).json({ok:false,error:'catalogue_unavailable',sounds:[]});}
});
nozecoinSoundboardRouter.post('/me/nozecoins/soundboard/:action',requireAuth,a(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!soundboardFeatureEnabled())return res.status(503).json({ok:false,error:'soundboard_disabled'});
 // Never trust a client-supplied streamer ID or an unverified role claim for ownership.
 const owner=(await pool.query("SELECT id FROM streamers WHERE lower(slug)='lecasinoze' AND user_id=$1 LIMIT 1",[req.user!.id])).rows[0];
 if(!owner)return res.status(403).json({ok:false,error:'soundboard_owner_required'});
 const sid=Number(owner.id),consumerId=String(req.body?.consumerId||'');
 try{
  if(req.params.action==='control'){
   if(typeof req.body?.enabled!=='boolean')return res.status(400).json({ok:false,error:'invalid_control'});
   return res.json({ok:true,...await controlSoundboard(pool,sid,req.body.enabled)});
  }
  if(req.params.action==='heartbeat')return res.json({ok:true,...await heartbeatSoundboard(pool,sid,consumerId)});
  if(req.params.action==='next')return res.json({ok:true,request:await takeNextSound(pool,sid,consumerId)});
  if(req.params.action==='ack')return res.json({ok:true,...await settleSound(pool,sid,consumerId,String(req.body?.requestId||''),req.body?.played)});
  return res.status(404).json({ok:false,error:'unknown_action'});
 }catch(error){if(error instanceof SoundboardError)return res.status(409).json({ok:false,error:error.message});throw error;}
}));
