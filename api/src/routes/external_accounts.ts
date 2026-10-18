import {Router} from 'express';
import {pool} from '../db.js';
import {requireAuth} from '../auth.js';
import {externalAccountsSchema,externalAccountStatus,issueExternalCode,resolveExternalUser,synchronizeExternalName,communityDiscordIds} from '../community/external-accounts.js';
import {discordSyncNow} from '../discord/bot.js';
export const externalAccountsRouter=Router();
externalAccountsRouter.use('/me/external-accounts',requireAuth);
externalAccountsRouter.get('/me/external-accounts',async(req,res,next)=>{try{res.json({ok:true,...await externalAccountStatus(pool,Number(req.user!.id))});}catch(e){next(e);}});
externalAccountsRouter.post('/me/external-accounts/rumble/code',async(req,res,next)=>{
 try{res.json({ok:true,...await issueExternalCode(pool,Number(req.user!.id),req.body?.syncUsername===true)});}catch(e){if((e as Error).message==='link_cooldown')return res.status(429).json({ok:false,error:'link_cooldown'});next(e);}
});
externalAccountsRouter.post('/me/external-accounts/rumble/sync',async(req,res,next)=>{
 try{
  const userId=Number(req.user!.id),status=await externalAccountStatus(pool,userId);
  if(!status.rumble.linked||!('id' in status.rumble))return res.status(409).json({ok:false,error:'not_linked'});
  const r=status.rumble;
  // Inherited proof is checked again before opting in to permanent name sync.
  const proof=(await pool.query(`SELECT streamer_id FROM automod_discord_links WHERE rumble_user_id=$1 LIMIT 1`,[r.id])).rows[0];
  if(await resolveExternalUser(pool,'rumble',String(r.id),Number(proof?.streamer_id??0))!==userId)return res.status(409).json({ok:false,error:'identity_conflict'});
  const saved=await pool.query(`INSERT INTO external_account_links(provider,external_id,user_id,username,sync_username) VALUES('rumble',$1,$2,$3,TRUE)
   ON CONFLICT(provider,external_id) DO UPDATE SET sync_username=TRUE WHERE external_account_links.user_id=EXCLUDED.user_id RETURNING user_id`,[r.id,userId,r.username]);
  if(!saved.rowCount)return res.status(409).json({ok:false,error:'identity_conflict'});
  await synchronizeExternalName(pool,String(r.id),String(r.username),new Date());
  for(const discordId of await communityDiscordIds(pool,userId))void discordSyncNow(discordId).catch(()=>{});
  res.json({ok:true,...await externalAccountStatus(pool,userId)});
 }catch(e){if((e as any).code==='23505'||(e as Error).message==='identity_conflict')return res.status(409).json({ok:false,error:'identity_conflict'});next(e);}
});
// Safe public recovery for a display-only overlay: no participation, balances or identities.
externalAccountsRouter.get('/chat/:slug/rain',async(req,res,next)=>{
 try{
  await externalAccountsSchema(pool);
  const row=(await pool.query(`SELECT st.round_id AS round,st.close_at_ms AS "endsAtMs",cfg.join_window_sec AS "durationSec",cfg.rubies_per_user AS pot,
    (SELECT COUNT(*)::int FROM bot_rain_joins j WHERE j.streamer_id=s.id AND j.round_id=st.round_id) AS count
   FROM streamers s JOIN bot_rain_state st ON st.streamer_id=s.id JOIN bot_rain_cfg cfg ON cfg.streamer_id=s.id
   WHERE lower(s.slug)=lower($1) AND cfg.enabled=TRUE AND st.phase='open' AND st.close_at_ms>$2`,[req.params.slug,Date.now()])).rows[0];
  res.set('Cache-Control','no-store').json({ok:true,rain:row?{...row,real:true,endsAtMs:Number(row.endsAtMs)}:null});
 }catch(e){next(e);}
});
