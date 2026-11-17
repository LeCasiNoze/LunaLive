import type {Client} from 'discord.js';
import type {Pool} from 'pg';
import {isApproved} from './belva-approval.js';
import {BELVA_ROLES} from './belva-roles.js';

// Comptes Rumble liés au Discord de Belva : le pseudo Discord du serveur devient le pseudo Rumble,
// et ceux qui portent le tag de la team (pseudo Rumble « BLVA… », majuscules ou non) reçoivent le rôle BLVA.
const GUILD_ID=()=>process.env.BELVA_GUILD_ID?.trim()||'1429525570965737668';
const BLVA_ROLE='1483154059534794883';
export const hasTeamTag=(rumble:string)=>/^blva/i.test(rumble.trim());

async function sync(client:Client,pool:Pool){
  const guild=await client.guilds.fetch(GUILD_ID()).catch(()=>null);if(!guild)return;
  const links=(await pool.query(`SELECT l.discord_user_id,l.username FROM automod_discord_links l JOIN streamers s ON s.id=l.streamer_id WHERE lower(s.slug)='belvaa'`)).rows as {discord_user_id:string;username:string}[];
  if(!links.length)return;
  // Le rôle garde son ancien nom (« Sub ») tant que la refonte des rôles n'est pas validée : on ne l'attribue qu'après.
  const roleOn=await isApproved(pool,'roles');
  const gr=await guild.roles.fetch();
  const habitue=gr.find(r=>r.name==='🌙 Habitué')?.id;
  const access=await isApproved(pool,'onboarding')?gr.find(r=>r.name==='🔓 Accès')?.id:undefined;
  const members=new Map<string,import('discord.js').GuildMember>();
  for(let k=0;k<links.length;k+=100){
    const part=await guild.members.fetch({user:links.slice(k,k+100).map(l=>l.discord_user_id)}).catch(e=>{console.error('[nozebot] liaisons Belva',e?.message||e);return null;});
    for(const [id,m] of part??[])members.set(id,m);
  }
  for(const l of links){
    const m=members.get(l.discord_user_id);if(!m)continue;
    const name=l.username.slice(0,32);
    if(m.displayName!==name&&m.manageable)await m.setNickname(name,'Pseudo Rumble lié').catch(()=>undefined);
    if(!roleOn)continue;
    // 🌙 Habitué : a relié son Rumble (et, avec le parcours d'arrivée, accepté le règlement) ; remplace 🎟️ Invité.
    if(habitue&&!m.roles.cache.has(habitue)&&(!access||m.roles.cache.has(access))){
      await m.roles.add(habitue,'Rumble relié').catch(()=>undefined);
      if(m.roles.cache.has(BELVA_ROLES.invite))await m.roles.remove(BELVA_ROLES.invite,'Devient Habitué').catch(()=>undefined);
    }
    const want=hasTeamTag(l.username),has=m.roles.cache.has(BLVA_ROLE);
    if(want&&!has)await m.roles.add(BLVA_ROLE,'Tag BLVA dans le pseudo Rumble').catch(()=>undefined);
    if(!want&&has)await m.roles.remove(BLVA_ROLE,'Tag BLVA retiré du pseudo Rumble').catch(()=>undefined);
  }
}

export function startBelvaLinkSync(client:Client,pool?:Pool){
  if(!pool||process.env.BELVA_LINK_SYNC==='false')return;
  let busy=false;
  const run=()=>{if(busy)return;busy=true;void sync(client,pool).catch(e=>console.error('[nozebot] synchro liaisons Belva',e)).finally(()=>{busy=false;});};
  run();setInterval(run,120_000).unref();
}
