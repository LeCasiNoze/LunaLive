import express from 'express';
import type {Server} from 'socket.io';
import {pool as defaultPool} from '../db.js';
import {handleCallsCommand as defaultHandleCallsCommand,sendBotChat as defaultSendBotChat} from '../calls/commands.js';
import {sendRumbleMessageReliable as defaultSendRumbleMessageReliable} from '../rumble_chat_bridge.js';
import {authenticatedBotKey,externalChatEvent,eventKey,command} from '../multichat/policy.js';

type Dependencies={pool:typeof defaultPool;handleCallsCommand:typeof defaultHandleCallsCommand;sendBotChat:typeof defaultSendBotChat;sendRumbleMessageReliable:typeof defaultSendRumbleMessageReliable;keys:()=>unknown[]};
export function createMultichatBridgeRouter({pool,handleCallsCommand,sendBotChat,sendRumbleMessageReliable,keys}:Dependencies){
const multichatBridgeRouter=express.Router();
multichatBridgeRouter.use('/internal/bot/multichat',(req,res,next)=>{
  if(!authenticatedBotKey(req.headers['x-bot-key'],keys()))return res.status(401).json({ok:false,error:'invalid_bot_key'});
  res.set('Cache-Control','no-store');next();
});
multichatBridgeRouter.get('/internal/bot/multichat/status',async(_req,res)=>{
  try{await pool.query('SELECT event_key FROM multichat_bridge_events LIMIT 0');res.json({ok:true,streamerSlug:'lecasinoze',platforms:['kick','twitch'],commands:['call','listec','discord','help','aide','site','ping'],botUserId:Number(process.env.BOT_USER_ID||0)});}
  catch{res.status(503).json({ok:false,error:'multichat_schema_unavailable'});}
});

multichatBridgeRouter.post('/internal/bot/multichat/event',async(req,res)=>{
  let event;try{event=externalChatEvent(req.body);}catch{return res.status(400).json({ok:false,error:'invalid_event'});}
  const key=eventKey(event);
  try{
    const streamer=(await pool.query("SELECT id,user_id FROM streamers WHERE slug='lecasinoze'")).rows[0];
    if(!streamer)return res.status(404).json({ok:false,error:'streamer_not_found'});
    const claim=await pool.query(`INSERT INTO multichat_bridge_events(event_key,streamer_id,platform,channel_id,message_id,user_id)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING event_key`,[key,streamer.id,event.platform,event.channelId,event.messageId,event.userId]);
    if(!claim.rowCount){
      const previous=(await pool.query('SELECT state,result FROM multichat_bridge_events WHERE event_key=$1',[key])).rows[0];
      if(previous?.state==='done')return res.json(previous.result);
      // Do not re-add a call after an ambiguous process crash / timeout.
      return res.status(409).json({ok:false,error:'event_processing_or_uncertain'});
    }
    const liveIo=req.app.locals.io as Server|undefined;
    if(!liveIo){await pool.query("DELETE FROM multichat_bridge_events WHERE event_key=$1 AND state='processing'",[key]);return res.status(503).json({ok:false,error:'chat_not_ready'});}
    const label=event.platform==='kick'?'Kick':'Twitch';
    // A visible source prefix also keeps the existing generic bot poller from
    // dispatching the same external !command a second time.
    const displayed=`[${label}] ${event.username} : ${event.text}`.slice(0,2000);
    const inserted=await pool.query(`INSERT INTO chat_messages(streamer_id,user_id,username,body,external_source,external_msg_id)
      VALUES($1,0,$2,$3,$4,$5) ON CONFLICT(streamer_id,external_source,external_msg_id)
      WHERE external_source IS NOT NULL AND external_msg_id IS NOT NULL DO NOTHING RETURNING id,created_at`,
      [streamer.id,event.username,displayed,event.platform,event.messageId]);
    const message=inserted.rows[0];
    if(message){
      liveIo.to('chat:lecasinoze:public').to('chat:lecasinoze:popup').emit('chat:message',{id:Number(message.id),userId:0,username:event.username,body:displayed,createdAt:new Date(message.created_at).toISOString(),role:'viewer',externalSource:event.platform});
      const target=(await pool.query('SELECT live_video_id_numeric FROM streamer_rumble_info WHERE streamer_id=$1 AND is_live=true',[streamer.id])).rows[0]?.live_video_id_numeric;
      if(target)await sendRumbleMessageReliable(pool,String(target),displayed.slice(0,200));
    }
    const replies=new Map<number,{id:number;body:string}>();
    // Capture the existing calls handler's bot replies while forwarding every
    // socket emission unchanged. No external nickname receives local privileges.
    const capturingIo={to(room:string){const target=liveIo.to(room);return {emit(name:string,payload:any){if(name==='chat:message'&&payload?.isBot&&Number(payload.id)>0)replies.set(Number(payload.id),{id:Number(payload.id),body:String(payload.body)});return target.emit(name as any,payload);}};}} as unknown as Server;
    const cmd=command(event);
    if(cmd?.name==='call'||cmd?.name==='listec'){
      await handleCallsCommand({pool,io:capturingIo,slug:'lecasinoze',streamerId:Number(streamer.id),streamerOwnerUserId:Number(streamer.user_id)||null,
        actorUserId:0,actorUsername:event.platform+':'+event.userId,actorRole:'viewer',canMod:false,cmd:cmd.name,arg:cmd.arg});
    }else if(cmd){
      let text=cmd.name==='ping'?`pong @${event.username} ✅`:'';
      if(cmd.name!=='ping'){
        const trigger=cmd.name==='aide'?'help':cmd.name;
        const configured=(await pool.query("SELECT response FROM bot_commands WHERE streamer_id=$1 AND lower(regexp_replace(trigger,'^[!/]+',''))=$2 AND enabled=true LIMIT 1",[streamer.id,trigger])).rows[0]?.response;
        text=String(configured||'');
        if(!text&&trigger==='help')text='Commandes : !call nom complet · !listec pour voir la file · !discord pour la communauté.';
        const values:Record<string,string>={user:event.username,streamer:'LeCasiNoze',slug:'lecasinoze',trigger,args:cmd.arg};
        for(const [name,value]of Object.entries(values))text=text.replaceAll('{'+name+'}',value);
      }
      if(text)await sendBotChat(pool,capturingIo,{streamerId:Number(streamer.id),slug:'lecasinoze'},text);
    }
    const result={ok:true,eventKey:key,replies:[...replies.values()]};
    await pool.query("UPDATE multichat_bridge_events SET state='done',result=$2::jsonb,completed_at=NOW() WHERE event_key=$1",[key,JSON.stringify(result)]);
    return res.json(result);
  }catch{
    await pool.query("UPDATE multichat_bridge_events SET state='uncertain' WHERE event_key=$1 AND state='processing'",[key]).catch(()=>{});
    return res.status(503).json({ok:false,error:'multichat_event_failed'});
  }
});
return multichatBridgeRouter;
}
export const multichatBridgeRouter=createMultichatBridgeRouter({pool:defaultPool,handleCallsCommand:defaultHandleCallsCommand,sendBotChat:defaultSendBotChat,sendRumbleMessageReliable:defaultSendRumbleMessageReliable,keys:()=>[process.env.INTERNAL_BOT_KEY,process.env.BOT_INTERNAL_KEY]});
