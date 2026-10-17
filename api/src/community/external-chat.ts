import type {Pool} from 'pg';
import type {Server} from 'socket.io';
import {externalAccountsSchema,resolveExternalUser,consumeExternalCode,synchronizeExternalName,communityDiscordIds,CONNECTIONS_URL,type ExternalProvider} from './external-accounts.js';
import {joinCommunityRain} from './rain-join.js';
import {getActiveSiteUserBan} from '../auth.js';
import {discordSyncNow} from '../discord/bot.js';

type Incoming={provider:ExternalProvider;externalId:string;streamerId:number;slug:string;username:string;text:string;createdAt:Date};
const observed=new Map<string,number>();
export async function observeExternalAccount(db:Pool,m:Incoming){
 if(m.provider!=='rumble'||!fresh(m.createdAt))return;
 const key=m.externalId+'|'+m.username;
 if(Date.now()-(observed.get(key)??0)<300000)return;
 observed.set(key,Date.now());if(observed.size>10000)observed.delete(observed.keys().next().value!);
 await externalAccountsSchema(db);
 const changed=await synchronizeExternalName(db,m.externalId,m.username,m.createdAt);
 if(changed)for(const discordId of await communityDiscordIds(db,changed))void discordSyncNow(discordId).catch(()=>{});
}
const fresh=(at:Date)=>Number.isFinite(at.getTime())&&Date.now()-at.getTime()<=120000&&at.getTime()-Date.now()<=30000;
export async function handleExternalCommunityChat(db:Pool,io:Server|undefined,m:Incoming):Promise<string|null>{
 const text=m.text.trim();const isLink=/^!lier\s+LL-/i.test(text),isRain=/^!rain\s*$/i.test(text);
 if(!isLink&&!isRain)return null;
 if(!fresh(m.createdAt)||!m.externalId||m.provider==='rumble'&&!/^[1-9]\d{0,29}$/.test(m.externalId))return null;
 await externalAccountsSchema(db);
 if(isLink){
  if(m.provider!=='rumble'||!/^!lier\s+LL-[A-F0-9]{32}$/i.test(text))return `@${m.username} — Copie la commande depuis ${CONNECTIONS_URL}`;
  try{
   await consumeExternalCode(db,{code:text.split(/\s+/)[1],externalId:m.externalId,username:m.username,streamerId:m.streamerId});
   observed.delete(m.externalId+'|'+m.username);
   await observeExternalAccount(db,{...m,createdAt:new Date()}).catch(()=>{});
   return `@${m.username} — Rumble lié à LunaLive ✅`;
  }catch(error){const conflict=(error as Error).message==='identity_conflict'||(error as any).code==='23505';return `@${m.username} — ${conflict?'Compte déjà lié. Vérifie tes connexions':'Code expiré ou utilisé. Recrée-le'} : ${CONNECTIONS_URL}`;}
 }
 // Only an actual LunaLive ruby rain takes precedence over legacy AutoMod/NozeCoins rains.
 const active=(await db.query(`SELECT 1 FROM bot_rain_state st JOIN bot_rain_cfg cfg ON cfg.streamer_id=st.streamer_id
  JOIN streamers s ON s.id=st.streamer_id WHERE st.streamer_id=$1 AND cfg.enabled=TRUE AND s.is_live=TRUE
  AND st.phase='open' AND st.close_at_ms>$2 AND (st.open_at_ms IS NULL OR st.open_at_ms<=$3)`,[m.streamerId,Date.now(),m.createdAt.getTime()])).rows[0];
 if(!active)return null;
 let userId:number|null;
 try{userId=await resolveExternalUser(db,m.provider,m.externalId,m.streamerId);}catch{return `@${m.username} — Vérifie tes comptes liés : ${CONNECTIONS_URL}`;}
 if(!userId)return `@${m.username} — Lie ton compte ${m.provider==='rumble'?'Rumble':m.provider} à LunaLive : ${CONNECTIONS_URL} · Discord déjà lié ? /link.`;
 if((await getActiveSiteUserBan(userId)).banned)return `@${m.username} — Participation indisponible.`;
 const user=(await db.query('SELECT username FROM users WHERE id=$1',[userId])).rows[0];
 if(!user)return null;
 const result=await joinCommunityRain(db,io,{streamerId:m.streamerId,slug:m.slug},{id:userId,username:user.username});
 return `@${m.username} — ${!result.ok?'Rain terminée.':result.alreadyJoined?'Tu participes déjà ✅':'Participation à la rain validée 💎'}`;
}
