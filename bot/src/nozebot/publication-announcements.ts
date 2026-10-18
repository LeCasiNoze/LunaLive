import {ChannelType,PermissionFlagsBits,type Client} from 'discord.js';
import type {Pool} from 'pg';
import {PUBLICATION_CHANNEL,PUBLICATION_GUILD,PUBLICATION_SCHEMA,publicationMessage,eligiblePublication,type PublicationEvent} from './publication-outbox.js';

export interface AnnouncementTransport {
 reconcile(event:PublicationEvent,startedAt:Date):Promise<string|null>;
 send(event:PublicationEvent):Promise<string>;
}
export interface OutboxRow {id:string;state:string;payload:PublicationEvent;send_started_at:Date|null;attempts:number}
export function failurePolicy(error:unknown,attempts:number){
 const e=error as {status?:number;code?:number;retry_after?:number;rawError?:{retry_after?:number}};
 const delay=Math.min(3600,Math.max(30,2**Math.min(attempts,10)*15));
 if(e.status===429)return {state:'queued',delay:Math.max(delay,Number(e.retry_after??e.rawError?.retry_after)||60),code:'discord_429'};
 if(e.status&&e.status>=400&&e.status<500)return {state:'blocked',delay,code:`discord_${e.status}`};
 return {state:'uncertain',delay,code:'discord_outcome_uncertain'};
}
/** The session advisory lock serializes delivery across restarts and overlapping deploys.
 * sending is committed before the HTTP call; unknown outcomes are reconciled before any retry. */
export async function deliverAnnouncement(pool:Pool,transport:AnnouncementTransport){
 const c=await pool.connect();let locked=false;
 try{
  locked=!!(await c.query('SELECT pg_try_advisory_lock(1280659009,194) AS locked')).rows[0].locked;if(!locked)return;
  const row=(await c.query<OutboxRow>(`SELECT * FROM lunaclip_discord_outbox WHERE channel_id='${PUBLICATION_CHANNEL}' AND state IN ('queued','sending','uncertain') AND next_attempt_at<=now() ORDER BY id LIMIT 1`)).rows[0];if(!row)return;
  if(!eligiblePublication(row.payload)){await c.query("UPDATE lunaclip_discord_outbox SET state='blocked',error_code='invalid_publication_event' WHERE id=$1",[row.id]);return;}
  if(row.state!=='queued'){
   try{
    const found=await transport.reconcile(row.payload,row.send_started_at!);
    if(found){await c.query("UPDATE lunaclip_discord_outbox SET state='sent',message_id=$2,sent_at=now(),error_code=NULL WHERE id=$1",[row.id,found]);return;}
   }catch{
    await c.query("UPDATE lunaclip_discord_outbox SET state='uncertain',attempts=attempts+1,next_attempt_at=now()+$2*INTERVAL '1 second',error_code='discord_reconciliation_unavailable' WHERE id=$1",[row.id,Math.min(3600,300*2**Math.min(row.attempts,4))]);
    return;
   }
  }
  await c.query("UPDATE lunaclip_discord_outbox SET state='sending',send_started_at=COALESCE(send_started_at,now()),attempts=attempts+1,next_attempt_at=now()+INTERVAL '5 minutes' WHERE id=$1",[row.id]);
  try{
   const messageId=await transport.send(row.payload);
   await c.query("UPDATE lunaclip_discord_outbox SET state='sent',message_id=$2,sent_at=now(),error_code=NULL WHERE id=$1",[row.id,messageId]);
   console.log('[nozebot][publications] delivered',{outboxId:row.id,messageId});
  }catch(error){
   const policy=failurePolicy(error,row.attempts+1);
   await c.query("UPDATE lunaclip_discord_outbox SET state=$2,next_attempt_at=now()+$3*INTERVAL '1 second',error_code=$4 WHERE id=$1",[row.id,policy.state,policy.delay,policy.code]);
   console.warn('[nozebot][publications]',{outboxId:row.id,code:policy.code});
  }
 }finally{if(locked)await c.query('SELECT pg_advisory_unlock(1280659009,194)').catch(()=>{});c.release();}
}

export async function startPublicationAnnouncements(client:Client,pool:Pool){
 await pool.query(PUBLICATION_SCHEMA);
 const channel=await client.channels.fetch(PUBLICATION_CHANNEL);
 if(!channel||channel.type!==ChannelType.GuildAnnouncement||channel.guildId!==PUBLICATION_GUILD)throw Error('publication_channel_mismatch');
 const me=await channel.guild.members.fetchMe();
 if(!channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks,PermissionFlagsBits.ReadMessageHistory]))throw Error('publication_channel_permissions_missing');
 const transport:AnnouncementTransport={
  async send(event){return (await channel.send(publicationMessage(event))).id;},
  async reconcile(event,startedAt){
   // Paginate down to BEFORE the original attempt. Incomplete history, permission
   // failures or deletion uncertainty must never turn into an automatic resend.
   let before:string|undefined;
   for(let page=0;page<30;page++){
    const messages=await channel.messages.fetch({limit:100,...(before?{before}:{})});
    const found=messages.find(m=>m.author.id===client.user!.id&&m.embeds.some(e=>e.url===event.url||e.footer?.text===`LeCasiNoze · ${event.platform}:${event.mediaId}`));if(found)return found.id;
    const oldest=messages.last();
    if(!oldest||oldest.createdTimestamp<new Date(startedAt).getTime()-60000)return null;
    before=oldest.id;
   }
   throw Error('publication_reconciliation_incomplete');
  }
 };
 let running=false,stopped=false;
 const tick=async()=>{if(running||stopped||!client.isReady())return;running=true;try{await deliverAnnouncement(pool,transport);}catch{console.warn('[nozebot][publications] reconciliation_or_database_unavailable');}finally{running=false;}};
 const timer=setInterval(()=>void tick(),30000);void tick();
 console.log('[nozebot][publications] ready',{channelId:PUBLICATION_CHANNEL,historyBackfill:false});
 return ()=>{stopped=true;clearInterval(timer);};
}
