import {randomBytes,createHash} from 'node:crypto';
import type {Pool} from 'pg';
import {inTransaction} from './wallet.js';
import {validRumbleIdentity} from './rules.js';
import {readProfile,profileMessage} from './profile.js';
const digest=(value:string)=>createHash('sha256').update(value.toUpperCase()).digest('hex');
const ready=new WeakMap<Pool,Promise<void>>();
export async function discordProfileSchema(pool:Pool){
 let pending=ready.get(pool);if(!pending){pending=inTransaction(pool,async c=>{
 await c.query('SELECT pg_advisory_xact_lock(8244147)');
 await c.query(`CREATE TABLE IF NOT EXISTS automod_discord_links (
 streamer_id bigint NOT NULL REFERENCES streamers(id),discord_user_id text NOT NULL,rumble_user_id text NOT NULL,
 username text NOT NULL,created_at timestamptz NOT NULL DEFAULT NOW(),PRIMARY KEY(streamer_id,discord_user_id),UNIQUE(streamer_id,rumble_user_id));
 CREATE TABLE IF NOT EXISTS automod_discord_link_codes (
 streamer_id bigint NOT NULL REFERENCES streamers(id),discord_user_id text NOT NULL,code_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT NOW(),PRIMARY KEY(streamer_id,discord_user_id));`);
 }).catch(e=>{ready.delete(pool);throw e;});ready.set(pool,pending);}await pending;
}
// Belva et LeCasiNoze partagent une seule liaison Rumble ↔ Discord : un code demandé sur l'un des deux Discord
// vaut dans les deux chats Rumble (et sous les vidéos de Belva), et la liaison est écrite pour les deux chaînes.
type Q={query:Pool['query']};
export async function linkGroup(c:Q,sid:number):Promise<number[]>{
 const ids=(await c.query(`SELECT id FROM streamers WHERE lower(slug) IN ('belvaa','lecasinoze') ORDER BY id`)).rows.map(r=>Number(r.id));
 return ids.includes(Number(sid))?ids:[Number(sid)];
}
export async function bindDiscordLink(c:Q,ids:number[],discordId:string,uid:string,username:string):Promise<boolean>{
 const conflict=(await c.query(`SELECT 1 FROM automod_discord_links WHERE streamer_id=ANY($1::bigint[]) AND
  ((discord_user_id=$2 AND rumble_user_id<>$3) OR (rumble_user_id=$3 AND discord_user_id<>$2))`,[ids,discordId,uid])).rowCount;
 if(conflict)return false;
 for(const id of ids)await c.query(`INSERT INTO automod_discord_links(streamer_id,discord_user_id,rumble_user_id,username) VALUES($1,$2,$3,$4)
  ON CONFLICT(streamer_id,discord_user_id) DO UPDATE SET username=EXCLUDED.username`,[id,discordId,uid,username]);
 await c.query('DELETE FROM automod_discord_link_codes WHERE streamer_id=ANY($1::bigint[]) AND discord_user_id=$2',[ids,discordId]);
 return true;
}
export async function requestAutomodDiscordLink(pool:Pool,sid:number,discordId:string){
 if(!/^\d{17,20}$/.test(discordId))throw Error('bad_identity');
 await discordProfileSchema(pool);
 return inTransaction(pool,async c=>{
  await c.query('SELECT pg_advisory_xact_lock($1)',[sid]);
  const linked=(await c.query('SELECT username FROM automod_discord_links WHERE streamer_id=ANY($1::bigint[]) AND discord_user_id=$2 LIMIT 1',[await linkGroup(c,sid),discordId])).rows[0];
  if(linked)return {linked:true,username:linked.username};
  const previous=(await c.query(`SELECT 1 FROM automod_discord_link_codes WHERE streamer_id=$1 AND discord_user_id=$2 AND created_at>NOW()-INTERVAL '1 minute'`,[sid,discordId])).rowCount;
  if(previous)throw Error('link_cooldown');
  const code=randomBytes(8).toString('hex').toUpperCase();
  await c.query(`INSERT INTO automod_discord_link_codes(streamer_id,discord_user_id,code_hash,expires_at)
  VALUES($1,$2,$3,NOW()+INTERVAL '10 minutes') ON CONFLICT(streamer_id,discord_user_id)
  DO UPDATE SET code_hash=EXCLUDED.code_hash,expires_at=EXCLUDED.expires_at,created_at=NOW()`,[sid,discordId,digest(code)]);
  return {linked:false,command:'!lier '+code};
 });
}
export async function handleDiscordLinkChat(pool:Pool,m:{streamerId:number;userId:string;username:string;text:string;createdAt:Date},texts={command:'/automodlink',success:'Ton profil Automod est disponible sur Discord avec !profil ou /automodprofil.'}){
 if(!/^!lier(?:\s|$)/i.test(m.text.trim()))return null;
 if(!validRumbleIdentity(m.userId)||Math.abs(Date.now()-m.createdAt.getTime())>120000)return null;
 const match=/^!lier\s+([a-f0-9]{16})$/i.exec(m.text.trim());
 if(!match)return `@${m.username} — Sur Discord, utilise ${texts.command} puis colle ici la commande privée reçue.`;
 await discordProfileSchema(pool);
 return inTransaction(pool,async c=>{
  const ids=await linkGroup(c,m.streamerId);
  await c.query('SELECT pg_advisory_xact_lock($1)',[ids[0]]);
  const code=(await c.query('SELECT discord_user_id FROM automod_discord_link_codes WHERE streamer_id=ANY($1::bigint[]) AND code_hash=$2 AND expires_at>NOW() LIMIT 1 FOR UPDATE',[ids,digest(match[1])])).rows[0];
  if(!code)return `@${m.username} — Code expiré ou invalide. Redemande ${texts.command} sur Discord.`;
  if(!await bindDiscordLink(c,ids,code.discord_user_id,m.userId,m.username))return `@${m.username} — Un de ces comptes est déjà lié. Contacte un modérateur pour changer la liaison.`;
  return `@${m.username} — Compte Rumble lié ! ${texts.success}`;
 });
}
export async function automodDiscordProfile(pool:Pool,sid:number,discordId:string){
 await discordProfileSchema(pool);
 const link=(await pool.query('SELECT rumble_user_id,username FROM automod_discord_links WHERE streamer_id=$1 AND discord_user_id=$2',[sid,discordId])).rows[0];
 if(!link)return null;
 const p=await readProfile(pool,sid,link.rumble_user_id);
 return {username:link.username,...p,message:profileMessage(link.username,p)};
}
