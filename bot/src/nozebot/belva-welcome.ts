import {ChannelType,Events,MessageFlags,type Client,type GuildMember} from 'discord.js';
import {BELVA_ROLES} from './belva-roles.js';
import {LINK_BUTTON} from './belva-info.js';
import {isApproved} from './belva-approval.js';
import type {Pool} from 'pg';

// Arrivée sur le Discord de Belva (remplace MEE6) : rôle Invité + carte de bienvenue dans 👋︱bienvenue.
const GUILD_ID=()=>process.env.BELVA_GUILD_ID?.trim()||'1429525570965737668';
const T=(content:string)=>({type:10,content});
const link=(label:string,emoji:string,url:string)=>({type:2,style:5,label,emoji:{name:emoji},url});

// Pensée mobile : une étape par bloc, son bouton juste à côté, de l'air entre les blocs.
export function welcomeCard(member:{id:string;avatarUrl:string},count:number,channels:{offers?:string;link?:string;notifs?:string;games?:string}){
  const url=(id?:string)=>id?`https://discord.com/channels/${GUILD_ID()}/${id}`:null;
  const GAP={type:14,divider:false,spacing:2},LINE={type:14,divider:true,spacing:2};
  const step=(title:string,body:string,accessory:object|null)=>accessory
    ?{type:9,components:[T(`### ${title}\n${body}`)],accessory}:T(`### ${title}\n${body}`);
  const go=(label:string,emoji:string,id?:string)=>{const u=url(id);return u?link(label,emoji,u):null;};
  return {flags:MessageFlags.IsComponentsV2 as const,allowedMentions:{users:[member.id]},components:[{type:17,accent_color:0x19d3d3,components:[
    {type:9,components:[T('# 👋 Bienvenue !'),T(`<@${member.id}>`),T(`Tu es le **${count}ᵉ** membre de la commu Belva 🎰`)],
      accessory:{type:11,media:{url:member.avatarUrl},description:'Nouveau membre'}},
    LINE,
    T('**Pour bien démarrer, 4 étapes :**'),
    GAP,
    step('🎁 1 · Ton bonus','Jusqu’à **30 € remboursés** ou **20 € offerts** sur ton 1er dépôt.',go('Les offres','🎁',channels.offers)),
    GAP,
    step('🔗 2 · Relie ton Rumble','Gagne des **BCoins** et de l’**XP** pour monter en grade.',{type:2,style:1,label:'Lier',emoji:{name:'🔗'},custom_id:LINK_BUTTON}),
    GAP,
    step('🔔 3 · Les notifs','Sois prévenu dès que Belva lance un live.',go('Activer','🔔',channels.notifs)),
    ...(channels.games?[GAP,step('🃏 4 · Les mini-jeux','Blackjack et machine à sous avec tes BCoins.',go('Jouer','🃏',channels.games))]:[]),
    LINE,
    {type:1,components:[link('Regarder Belva sur Rumble','🟢','https://rumble.com/user/Belvaa/live')]},
    T('-# 🔞 18+ · Joue de façon responsable. Joueurs Info Service : 09 74 75 13 13.'),
  ]}] as never[]};
}

async function welcome(member:GuildMember,pool?:Pool){
  if(member.guild.id!==GUILD_ID()||member.user.bot)return;
  await member.roles.add(BELVA_ROLES.invite,'Arrivée sur le serveur').catch(e=>console.error('[nozebot] rôle Invité Belva',e?.message||e));
  if(!await isApproved(pool,'welcome'))return;
  const all=await member.guild.channels.fetch();
  const find=(suffix:string)=>all.find(c=>c?.type===ChannelType.GuildText&&c.name.endsWith(suffix))?.id;
  const channel=all.find(c=>c?.type===ChannelType.GuildText&&c.name.endsWith('bienvenue'));
  if(channel?.type!==ChannelType.GuildText)return;
  await channel.send(welcomeCard({id:member.id,avatarUrl:member.displayAvatarURL({size:256,extension:'png'})},member.guild.memberCount,
    {offers:find('toutes-les-offres'),link:find('lier-mon-compte'),notifs:find('notifications'),games:find('mini-jeux')}));
}

export function startBelvaWelcome(client:Client,pool?:Pool){
  if(process.env.BELVA_WELCOME==='false')return;
  client.on(Events.GuildMemberAdd,m=>void welcome(m,pool).catch(e=>console.error('[nozebot] bienvenue Belva',e)));
}
