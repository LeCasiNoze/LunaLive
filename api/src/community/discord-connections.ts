import {pool} from '../db.js';
import {createLinkCode,getLinkedUser} from '../discord/link.js';
import {requestAutomodDiscordLink} from '../automod-shop/discord-profile.js';
import {externalAccountStatus} from './external-accounts.js';
export async function prepareDiscordConnections(discordId:string){
 const linked=await getLinkedUser(discordId);
 const status=linked?await externalAccountStatus(pool,Number(linked.id)):null;
 let rumble:any=status?.rumble?.linked?status.rumble:null;
 if(!rumble){const streamer=(await pool.query("SELECT id FROM streamers WHERE lower(slug)='lecasinoze' LIMIT 1")).rows[0];
  if(streamer)try{rumble=await requestAutomodDiscordLink(pool,Number(streamer.id),discordId);}catch(e){if((e as Error).message!=='link_cooldown')throw e;rumble={linked:false,retryAfterSec:60};}}
 if(linked)return {ok:true as const,linked:true as const,rumble,user:{id:Number(linked.id),username:String(linked.username),role:String(linked.role||'viewer')}};
 const code=await createLinkCode(discordId,{log:()=>{}});
 return {ok:true as const,linked:false as const,rumble,code:code.code,expiresAt:code.expiresAt.toISOString()};
}
