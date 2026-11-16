import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {ChannelType,MessageFlags,type Client,type Message} from 'discord.js';
import {brands,refreshBrands} from './belva-roles.js';
import {OFFERS} from './belva-offers.js';

// Cartes d'information des salons fixes du Discord de Belva (offres, liaison Rumble, récompenses).
const GUILD_ID=()=>process.env.BELVA_GUILD_ID?.trim()||'1429525570965737668';
const ASSETS=new URL('../../assets/belva/',import.meta.url);
export const LINK_BUTTON='belva:link:start';
const T=(content:string)=>({type:10,content});
const SEP=(spacing=2,divider=true)=>({type:14,divider,spacing});
const link=(label:string,emoji:string,url:string)=>({type:2,style:5,label,emoji:{name:emoji},url});
const FOOTER=T('-# 🔞 18+ · Les jeux d’argent comportent des risques : endettement, isolement, dépendance. Joueurs Info Service : 09 74 75 13 13.');
const file=(name:string)=>({attachment:readFileSync(new URL(name,ASSETS)),name});

export function hubCard(){
  const casinos=brands().filter(b=>b.channelId&&OFFERS[b.id]);
  const rainbet=brands().find(b=>b.api&&b.channelId);
  const channel=(id:string)=>`https://discord.com/channels/${GUILD_ID()}/${id}`;
  return {files:[file('banner-hub.png')],components:[
    {type:12,items:[{media:{url:'attachment://banner-hub.png'},description:'Les offres casino de la commu Belva'}]},
    SEP(2,false),
    T('# Toutes les offres casino\nChoisis ton casino : chaque salon contient l’offre complète et les boutons pour en profiter en 2 clics.'),
    SEP(),
    ...casinos.flatMap((b,i)=>[...(i?[SEP(1,false)]:[]),{type:9,components:[T(`### ${OFFERS[b.id].title}\nJusqu’à **${b.bonus} €** remboursés · 1er dépôt de **20 €** offert\n-# ${OFFERS[b.id].tagline}`)],
      accessory:link('Voir l’offre','👉',channel(b.channelId!))}]),
    ...(rainbet?[SEP(1,false),{type:9,components:[T('### 🌧️ Rainbet\n**+20 % de rakeback** pendant 7 jours avec le code **NIVORANET**\n-# Race du mois : 200 $ pour le top 3 (100 / 60 / 40)')],accessory:link('Voir l’offre','👉',channel(rainbet.channelId!))}]:[]),
    SEP(),
    T('### 📋 En bref\n**Remboursement** · tu déposes avec notre lien, on te rembourse ton dépôt (jusqu’au plafond du casino).\n**Dépôt offert** · nouveau sur un casino ? On t’envoie 20 € pour ton premier dépôt.\n-# Un remboursement et un dépôt offert par casino. L’argent part directement sur ton adresse de dépôt, en priorité sur un casino où tu n’as pas encore de compte.'),
    SEP(1),FOOTER]};
}

export function linkCard(){
  return {files:[file('logo-belva.png')],components:[
    {type:9,components:[T('# 🔗 Relie ton compte Rumble'),T('Ton pseudo Rumble est reconnu sur le Discord de Belva : c’est ce qui permettra de compter tes participations pendant les lives.\n-# 30 secondes, une seule fois.')],
      accessory:{type:11,media:{url:'attachment://logo-belva.png'},description:'Belva'}},
    SEP(),
    T('### Comment faire\n**1 ·** Clique sur **Lier mon Rumble** juste en dessous (ou tape **/lier**).\n**2 ·** Le bot t’envoie en message privé une commande `!lier …`.\n**3 ·** Colle-la dans le **chat Rumble de Belva** pendant un live : le bot confirme dans le chat.\n-# La commande est valable 10 minutes et ne sert qu’une fois. Ouvre tes messages privés pour la recevoir.'),
    {type:1,components:[{type:2,style:1,label:'Lier mon Rumble',emoji:{name:'🔗'},custom_id:LINK_BUTTON},link('Ouvrir le live','🟢','https://rumble.com/user/Belvaa/live')]},
    SEP(1),T('-# Ton compte est déjà lié ? Le bouton te le confirme. Pour changer de compte, ouvre un ticket.')]};
}

export function rewardsCard(){
  return {files:[file('logo-belva.png')],components:[
    {type:9,components:[T('# 🏆 Les récompenses Belva'),T('Tout ce qu’il y a à gagner sur la chaîne et le Discord.\n-# Les gains en argent sont réservés aux membres avec un compte casino vérifié.')],
      accessory:{type:11,media:{url:'attachment://logo-belva.png'},description:'Belva'}},
    SEP(),
    T('### 🎁 Tout de suite\n> 💸 **Dépôt remboursé** · jusqu’à 30 € (35 € sur Celsius) sur ton 1er dépôt\n> 🎁 **Dépôt offert** · 20 € pour ton 1er dépôt sur un nouveau casino\n> 🏁 **Race Rainbet** · 200 $ chaque mois pour le top 3 (100 / 60 / 40), du 16 au 15\n> 🎉 **Giveaways** · annoncés dans les salons giveaways et live'),
    SEP(1,false),
    T('### 📅 À partir du 1er décembre\n> 🎟️ **Tombola du dimanche** · plusieurs gagnants chaque semaine, tickets gagnés en tapant les codes du live sur le Discord\n> ⚔️ **Saison du tournoi** · une session chaque dimanche, des points à chaque fois, le top 3 du mois gagne\n> 📱 **Giveaways réseaux** · des tickets pour tes commentaires sur nos vidéos YouTube, Instagram et TikTok'),
    SEP(),
    T('### ✅ Pour participer\n**1 ·** Vérifie un compte casino dans un salon d’offre.\n**2 ·** Relie ton Rumble dans 🔗︱lier-mon-compte.\n**3 ·** Active les notifications dans 🔔︱notifications pour ne rien rater.'),
    SEP(1),FOOTER]};
}

const CARDS:[string,()=>{files:{attachment:Buffer;name:string}[];components:object[]}][]=[
  ['toutes-les-offres',hubCard],['lier-mon-compte',linkCard],['récompenses',rewardsCard]];

// Le container porte un id dérivé du contenu : la carte n'est réécrite que si son contenu change.
const versionOf=(components:object[])=>parseInt(createHash('sha1').update(JSON.stringify(components)).digest('hex').slice(0,7),16);
const isMine=(m:Message,client:Client)=>m.author.id===client.user!.id&&m.components[0]?.type===17;

export async function ensureInfoCards(client:Client){
  if(process.env.BELVA_INFO_CARDS==='false')return;
  const guild=await client.guilds.fetch(GUILD_ID()).catch(()=>null);if(!guild)return;
  await refreshBrands(guild).catch(()=>undefined);
  const all=await guild.channels.fetch();
  for(const [suffix,build] of CARDS){
    const channel=all.find(c=>c?.type===ChannelType.GuildText&&c.name.endsWith('︱'+suffix));
    if(channel?.type!==ChannelType.GuildText)continue;
    const {files,components}=build();const id=versionOf(components);
    const payload={flags:MessageFlags.IsComponentsV2 as const,components:[{type:17,id,accent_color:0x19d3d3,components}] as never[],files};
    const mine=(await channel.messages.fetch({limit:20})).find(m=>isMine(m,client));
    if(!mine)await channel.send(payload);
    else if(mine.components[0].id!==id)await mine.edit({...payload,attachments:[]});
  }
}
