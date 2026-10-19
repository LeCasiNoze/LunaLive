import {Router,type RequestHandler} from 'express';
import type {PoolClient} from 'pg';
import {pool} from '../db.js';
import {requireAuth} from '../auth.js';
import {getRumbleBotSession} from '../rumble_chat_session.js';
import {raidDirectory} from '../rumble/raid-directory.js';
import {RaidError,raidUrl,raidVideoId,startRumbleRaid} from '../rumble/raid.js';

export function createRumbleRaidsRouter(deps={pool,auth:requireAuth as RequestHandler,directory:raidDirectory,session:getRumbleBotSession,start:startRumbleRaid}){
 const router=Router();
 router.use('/streamers/:slug/rumble/raids',deps.auth);
 async function channel(req:any){
  const r=await deps.pool.query(`SELECT s.id,s.user_id,s.rumble_username,i.is_live,i.live_video_id_numeric,i.video_url,
    EXISTS(SELECT 1 FROM streamer_mods m WHERE m.streamer_id=s.id AND m.user_id=$2 AND m.removed_at IS NULL) AS is_mod
    FROM streamers s LEFT JOIN streamer_rumble_info i ON i.streamer_id=s.id WHERE s.slug=$1`,[req.params.slug,req.user.id]);
  const row=r.rows[0];
  if(!row)throw new RaidError('streamer_not_found');
  if(Number(row.user_id)!==Number(req.user.id)&&req.user.role!=='admin'&&!row.is_mod)throw new RaidError('forbidden');
  return row;
 }
 const errors:Record<string,number>={forbidden:403,streamer_not_found:404,invalid_target:400,invalid_request:400,
  source_offline:409,source_changed:409,raid_busy:409,raid_uncertain:409,raid_cooldown:409,request_conflict:409,
  raid_refused:409,raid_target_unconfirmed:409,rumble_permission:403,session_unavailable:503};
 function fail(res:any,error:unknown){
  const code=error instanceof RaidError?error.code:'raid_unavailable';
  return res.status(errors[code]||503).json({ok:false,error:code});
 }
 router.get('/streamers/:slug/rumble/raids',async(req,res)=>{
  try{
   const source=await channel(req);
   const scope=req.query.scope==='all'?'all':'gambling';
   const page=Number(req.query.page||1);
   if(!Number.isInteger(page)||page<1||page>30)throw new RaidError('invalid_request');
   const result=await deps.directory(scope,page);
   const mine=raidVideoId(source.video_url||'');
   res.set('Cache-Control','private, no-store').json({ok:true,...result,
    targets:result.targets.filter(t=>raidVideoId(t.url)!==mine&&t.channel.toLowerCase()!==String(source.rumble_username||'').toLowerCase()),
    scope,page});
  }catch(e){fail(res,e);}
 });
 router.post('/streamers/:slug/rumble/raids',async(req,res)=>{
  let client:PoolClient|undefined,locked=false,claimed=false,sid=0,id='';
  try{
   const source=await channel(req);sid=Number(source.id);
   const target=raidUrl(req.body?.url);id=String(req.body?.requestId||'');
   if(!target)throw new RaidError('invalid_target');
   if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id))throw new RaidError('invalid_request');
   if(!source.is_live||!/^\d+$/.test(source.live_video_id_numeric||''))throw new RaidError('source_offline');
   if(raidVideoId(target)===raidVideoId(source.video_url||''))throw new RaidError('invalid_target');
   client=await deps.pool.connect();
   locked=(await client.query('SELECT pg_try_advisory_lock(7341,$1) AS locked',[sid])).rows[0]?.locked===true;
   if(!locked)throw new RaidError('raid_busy');
   const existing=(await client.query('SELECT * FROM rumble_raid_requests WHERE streamer_id=$1 AND request_id=$2',[sid,id])).rows[0];
   if(existing){
    if(existing.target_url!==target||existing.source_video_id!==source.live_video_id_numeric)throw new RaidError('request_conflict');
    if(existing.state==='confirmed')return res.json({ok:true,confirmed:true,duplicate:true});
    throw new RaidError(existing.state==='failed'?'raid_refused':'raid_uncertain');
   }
   const recent=await client.query(`SELECT state FROM rumble_raid_requests WHERE streamer_id=$1
     AND source_video_id=$2 AND state IN ('pending','confirmed','uncertain') AND created_at>NOW()-INTERVAL '10 minutes' LIMIT 1`,[sid,source.live_video_id_numeric]);
   if(recent.rows.length)throw new RaidError(recent.rows[0].state==='confirmed'?'raid_cooldown':'raid_uncertain');
   const session=await deps.session();
   if(!session.cookie)throw new RaidError('session_unavailable');
   await client.query(`INSERT INTO rumble_raid_requests(streamer_id,request_id,source_video_id,target_url,state) VALUES($1,$2,$3,$4,'pending')`,[sid,id,source.live_video_id_numeric,target]);
   claimed=true;
   await deps.start({sourceVideoId:source.live_video_id_numeric,targetUrl:target,session,sourceStillCurrent:async()=>{
    const latest=await client!.query('SELECT is_live,live_video_id_numeric FROM streamer_rumble_info WHERE streamer_id=$1',[sid]);
    return latest.rows[0]?.is_live===true&&latest.rows[0].live_video_id_numeric===source.live_video_id_numeric;
   }});
   await client.query("UPDATE rumble_raid_requests SET state='confirmed',finished_at=NOW() WHERE streamer_id=$1 AND request_id=$2",[sid,id]);
   res.json({ok:true,confirmed:true});
  }catch(e){
   if(claimed&&client){
    const uncertain=!(e instanceof RaidError)||e.uncertain;
    // Never repeat a confirmation after a timeout or an unrecorded response.
    await client.query('UPDATE rumble_raid_requests SET state=$3,error=$4,finished_at=NOW() WHERE streamer_id=$1 AND request_id=$2',
      [sid,id,uncertain?'uncertain':'failed',e instanceof RaidError?e.code:'raid_unavailable']).catch(()=>{});
    if(uncertain)e=new RaidError('raid_uncertain');
   }
   fail(res,e);
  }finally{
   if(client){
    try{if(locked)await client.query('SELECT pg_advisory_unlock(7341,$1)',[sid]);client.release();}
    catch(e){client.release(e as Error);}
   }
  }
 });
 return router;
}
export const rumbleRaidsRouter=createRumbleRaidsRouter();
