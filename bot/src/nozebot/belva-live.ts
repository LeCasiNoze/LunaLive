import {MessageFlags} from 'discord.js';
import type {LiveAlertConfig,LiveSnapshot} from './live-alerts.js';
import {brands,offerOn} from './belva-roles.js';

// Alerte live automatique du Discord de Belva (remplace les annonces manuelles dans 🎥︱live).
const GUILD_ID=process.env.BELVA_GUILD_ID?.trim()||'1429525570965737668';
const LINKS={
  rumble:'https://rumble.com/user/Belvaa/live',
  lunalive:'https://lunalive.win/s/belvaa',
  kick:process.env.BELVA_KICK_URL?.trim()||'',
  twitch:process.env.BELVA_TWITCH_URL?.trim()||'',
};

export function belvaLiveConfig(apiBase:string,pollMs:number):LiveAlertConfig{
  return {guildId:GUILD_ID,channelId:process.env.BELVA_LIVE_CHANNEL_ID?.trim()||'1483109861452550194',
    roleId:process.env.BELVA_LIVE_ROLE_ID?.trim()||'1571152748030722179',streamerSlug:'belvaa',apiBase,
    lunaLiveUrl:LINKS.lunalive,rumbleUrl:LINKS.rumble,pollMs,render:(s,ping)=>buildBelvaLiveMessage(s,ping)};
}

export function buildBelvaLiveMessage(s:LiveSnapshot,ping:boolean){
  const roleId=process.env.BELVA_LIVE_ROLE_ID?.trim()||'1571152748030722179';
  const T=(content:string)=>({type:10,content});
  const link=(label:string,emoji:string,url:string)=>({type:2,style:5,label,emoji:{name:emoji},url});
  const started=s.startedAt?`<t:${Math.floor(s.startedAt.getTime()/1000)}:R>`:'à l’instant';
  const header=[T(`-# @everyone · <@&${roleId}>`),T(`# Belva est en live !\n**${s.title}**\n-# En direct · lancé ${started}`)];
  const offers=brands().find(b=>b.channelId&&!b.api)?.channelId;
  const watch=[link('Regarder sur Rumble','🟢',LINKS.rumble),link('LunaLive','🌙',LINKS.lunalive),
    ...(LINKS.kick?[link('Kick','💚',LINKS.kick)]:[]),...(LINKS.twitch?[link('Twitch','💜',LINKS.twitch)]:[])];
  return {flags:MessageFlags.IsComponentsV2 as const,allowedMentions:ping?{parse:['everyone' as const],roles:[roleId]}:{parse:[] as never[]},components:[{type:17,accent_color:0xff2d55,components:[
    ...(s.avatarUrl?[{type:9,components:header,accessory:{type:11,media:{url:s.avatarUrl},description:'Belva'}}]:header),
    ...(s.thumbnailUrl?[{type:12,items:[{media:{url:s.thumbnailUrl},description:`Aperçu du live : ${s.title}`}]}]:[]),
    {type:14,divider:true,spacing:2},
    T('### 🎰 Pendant le live\n> 💸 **Jusqu’à 30 € remboursés** sur ton premier dépôt avec nos liens'+(offerOn()?'\n> 🎁 **20 € offerts** pour ton premier dépôt sur un nouveau casino':'')+'\n> 💬 Tape **!bonus** dans le chat · **/lier** ici pour relier ton compte Rumble'),
    {type:1,components:watch.slice(0,5)},
    ...(offers?[{type:1,components:[link('Voir les offres casino','🎁',`https://discord.com/channels/${GUILD_ID}/${offers}`)]}]:[]),
    {type:14,divider:false,spacing:1},
    T('-# 🔞 18+ · Les jeux d’argent comportent des risques : endettement, isolement, dépendance. Joueurs Info Service : 09 74 75 13 13.'),
  ]}] as never[]};
}
