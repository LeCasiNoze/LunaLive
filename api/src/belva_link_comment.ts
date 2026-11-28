import {createHash} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {inTransaction} from './automod-shop/wallet.js';
import {bindDiscordLink,discordProfileSchema,linkGroup} from './automod-shop/discord-profile.js';

// Liaison Rumble ↔ Discord hors live : le viewer poste son code en commentaire sous la dernière vidéo de Belva.
// Les commentaires Rumble sont publics et donnent le pseudo exact de l'auteur, ce qui prouve qu'il possède le compte.
// Un faux User-Agent navigateur déclenche le challenge Cloudflare : on reste en client JSON simple.
const digest=(value:string)=>createHash('sha256').update(value.toUpperCase()).digest('hex');
const b36=(n:number)=>n.toString(36);
const urls=new Map<string,string>();

export async function linkTargets(pool:Pool,sid:number){
 const row=(await pool.query(`SELECT is_live,live_video_id_numeric FROM streamer_rumble_info WHERE streamer_id=$1`,[sid])).rows[0];
 const live=Boolean(row?.is_live),id=row?.live_video_id_numeric?String(row.live_video_id_numeric):null;
 let videoUrl=id?urls.get(id)??null:null;
 if(id&&!videoUrl){
  const text=await fetch(`https://rumble.com/service.php?name=media.share&video_id=${id}`,{headers:{accept:'application/json'},signal:AbortSignal.timeout(8000)}).then(r=>r.text()).catch(()=>'');
  videoUrl=/https:\/\/rumble\.com\/v[a-z0-9]+-[^"'\s<\\?]*\.html/.exec(text)?.[0]??null;
  if(videoUrl)urls.set(id,videoUrl);
 }
 return {live,liveUrl:'https://rumble.com/user/Belvaa/live',videoId:id,videoUrl:videoUrl??'https://rumble.com/user/Belvaa'};
}

export function parseComments(html:string){
 return [...html.matchAll(/data-username="([^"]+)"[\s\S]*?<p class="comment-text">([\s\S]*?)<\/p>/g)].map(m=>({username:m[1],text:m[2].replace(/<[^>]+>/g,' ')}));
}

async function pendingSchema(pool:Pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS belva_pending_links(streamer_id bigint NOT NULL,discord_user_id text NOT NULL,username text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),PRIMARY KEY(streamer_id,discord_user_id))`);
}

type Result={status:'no_code'|'not_found'|'unavailable'|'conflict'}|{status:'linked'|'pending';username:string};
export async function linkByComment(pool:Pool,sid:number,discordId:string,fetchHtml=fetchComments):Promise<Result>{
 await discordProfileSchema(pool);await pendingSchema(pool);
 const ids=await linkGroup(pool,sid);
 const code=(await pool.query(`SELECT code_hash FROM automod_discord_link_codes WHERE streamer_id=ANY($1::bigint[]) AND discord_user_id=$2 AND expires_at>NOW() LIMIT 1`,[ids,discordId])).rows[0]?.code_hash as string|undefined;
 if(!code)return {status:'no_code'};
 const videoId=(await pool.query(`SELECT live_video_id_numeric FROM streamer_rumble_info WHERE streamer_id=$1`,[sid])).rows[0]?.live_video_id_numeric;
 if(!videoId)return {status:'unavailable'};
 const html=await fetchHtml(String(videoId)).catch(()=>null);if(html===null)return {status:'unavailable'};
 const hit=parseComments(html).find(c=>[...c.text.matchAll(/[a-f0-9]{16}/gi)].some(m=>digest(m[0])===code));
 if(!hit)return {status:'not_found'};
 const known=(await pool.query(`SELECT rumble_user_id,username FROM rumble_chat_messages WHERE lower(username)=lower($1) AND rumble_user_id IS NOT NULL ORDER BY created_at DESC LIMIT 1`,[hit.username])).rows[0];
 return inTransaction(pool,async c=>{
  await c.query('SELECT pg_advisory_xact_lock($1)',[sid]);
  const still=(await c.query(`DELETE FROM automod_discord_link_codes WHERE streamer_id=ANY($1::bigint[]) AND discord_user_id=$2 AND code_hash=$3 RETURNING 1`,[ids,discordId,code])).rowCount;
  if(!still)return {status:'no_code'} as Result;
  if(!known){
   await c.query(`INSERT INTO belva_pending_links(streamer_id,discord_user_id,username) VALUES($1,$2,$3) ON CONFLICT(streamer_id,discord_user_id) DO UPDATE SET username=EXCLUDED.username,created_at=NOW()`,[sid,discordId,hit.username]);
   return {status:'pending',username:hit.username} as Result;
  }
  return bind(c,sid,discordId,String(known.rumble_user_id),hit.username);
 });
}

async function bind(c:PoolClient,sid:number,discordId:string,uid:string,username:string):Promise<Result>{
 const ids=await linkGroup(c,sid);
 if(!await bindDiscordLink(c,ids,discordId,uid,username))return {status:'conflict'};
 await c.query(`DELETE FROM belva_pending_links WHERE streamer_id=ANY($1::bigint[]) AND discord_user_id=$2`,[ids,discordId]);
 return {status:'linked',username};
}

// Pseudo vérifié par commentaire mais jamais vu dans le chat : la liaison se termine à son premier message.
export async function finishPendingLink(pool:Pool,sid:number,uid:string,username:string){
 await pendingSchema(pool);
 const row=(await pool.query(`SELECT discord_user_id FROM belva_pending_links WHERE streamer_id=ANY($1::bigint[]) AND lower(username)=lower($2) LIMIT 1`,[await linkGroup(pool,sid),username])).rows[0];
 if(!row)return null;
 const r=await inTransaction(pool,async c=>{await c.query('SELECT pg_advisory_xact_lock($1)',[sid]);return bind(c,sid,String(row.discord_user_id),uid,username);});
 if(r.status==='conflict')await pool.query(`DELETE FROM belva_pending_links WHERE streamer_id=$1 AND discord_user_id=$2`,[sid,row.discord_user_id]);
 return r.status==='linked'?`@${username} — Ton Discord est relié à ce compte Rumble.`:null;
}

async function fetchComments(videoId:string){
 const r=await fetch(`https://rumble.com/service.php?name=comment.list&video=${b36(Number(videoId))}&sort=date`,{headers:{accept:'application/json'},signal:AbortSignal.timeout(8000)});
 if(!r.ok)throw Error('comments_'+r.status);
 const html=(await r.json() as {html?:string}).html;if(typeof html!=='string')throw Error('comments_shape');
 return html;
}
