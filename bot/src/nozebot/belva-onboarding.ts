import {ChannelType,MessageFlags,type Client,type Guild,type Interaction,type TextChannel} from 'discord.js';
import type {Pool} from 'pg';
import {isApproved} from './belva-approval.js';
import {BELVA_ROLES} from './belva-roles.js';
import {LINK_BUTTON} from './belva-info.js';

// Parcours d'arrivée sur le Discord de Belva : à l'arrivée on ne voit que 👋 bienvenue et 📜 règlement ;
// « J'accepte » donne le rôle technique 🔓 Accès (qui ouvre le serveur) + 🎟️ Invité, puis notifications et liaison Rumble.
const GUILD_ID=()=>process.env.BELVA_GUILD_ID?.trim()||'1429525570965737668';
const RULES_CHANNEL='1481613186535788656';
const WELCOME_CHANNEL='1482856061672095985';
const ACCESS_ROLE_NAME='🔓 Accès';
const NOTIFS={live:{id:'1571152748030722179',label:'Lives de Belva',emoji:'🔴'},giveaways:{id:'1571152748970385530',label:'Giveaways',emoji:'🎁'},offres:{id:'1571152750304301117',label:'Nouvelles offres casino',emoji:'🔥'}};
// Catégories qui restent fermées aux nouveaux tant que le règlement n'est pas accepté (Staff, VIP et tickets ont déjà leurs accès).
const GATED_CATEGORIES=['1429525571661987936','1572066401592549406','1570917911206563931','1481924757380272289','1482859189310197894','1483114551561158859','1481914839998791700'];
const P='belva:ob:';
const T=(content:string)=>({type:10,content});
const SEP=(spacing=1,divider=true)=>({type:14,divider,spacing});
const url=(id?:string)=>`https://discord.com/channels/${GUILD_ID()}${id?'/'+id:''}`;

export function rulesCard(){
  return {flags:MessageFlags.IsComponentsV2 as const,components:[{type:17,accent_color:0x19D3D3,components:[
    T('# 📜 Règlement de la commu Belva'),
    T('Bienvenue ! Ici on parle casino, lives et bonus, dans la bonne humeur. Cinq règles simples :'),
    SEP(),
    T(['**🤝 Respect** · pas d’insulte, de provocation ni de harcèlement.',
      '**🛡️ Sécurité** · pas de contenu choquant ou illégal. Ne partage jamais tes infos perso ni tes mots de passe. Toute arnaque = ban définitif.',
      '**🚫 Pas de pub ni de spam** · pas d’auto-promo, pas de flood, pas de mentions inutiles.',
      '**👥 Un seul compte** · multi-comptes et triche aux giveaways = sanction.',
      '**⚖️ Modération** · de l’avertissement au ban. Si ce n’est pas écrit, les modos tranchent.'].join('\n')),
    SEP(),
    T(['### 🔞 Jouer de façon responsable',
      '> Le jeu est un divertissement, pas un revenu : sur la durée, on perd. Ne joue que ce que tu peux perdre, fixe-toi des limites et fais une pause si tu veux te refaire.',
      '> **Joueurs Info Service : 09 74 75 13 13** (appel non surtaxé) · joueurs-info-service.fr'].join('\n')),
    SEP(),
    {type:1,components:[{type:2,style:3,label:'J’accepte le règlement',emoji:{name:'✅'},custom_id:`${P}accept`}]},
    T('-# En cliquant, tu confirmes avoir 18 ans ou plus et accepter ces règles. Ensuite : tes notifications, puis ton compte Rumble.'),
  ]}] as never[]};
}

export function notifStep(){
  return {flags:MessageFlags.IsComponentsV2 as const,components:[{type:17,accent_color:0x19D3D3,components:[
    T('### ✅ Règlement accepté, bienvenue !\n**Étape 2 sur 3 · Tes notifications.** Choisis ce qui te ping (tu pourras changer dans 🔔 notifications).'),
    {type:1,components:[{type:3,custom_id:`${P}notifs`,placeholder:'Choisis tes notifications',min_values:1,max_values:4,
      options:[...Object.entries(NOTIFS).map(([value,n])=>({value,label:n.label,emoji:{name:n.emoji}})),{value:'none',label:'Aucune, merci',emoji:{name:'🔕'}}]}]},
  ]}] as never[]};
}

export function linkStep(){
  return {flags:MessageFlags.IsComponentsV2 as const,components:[{type:17,accent_color:0x19D3D3,components:[
    T('### 🔔 C’est noté !\n**Étape 3 sur 3 · Relie ton compte Rumble** (30 secondes). Ça débloque les BCoins, le tournoi, le hunt, l’XP et le rôle 🌙 Habitué.'),
    {type:1,components:[{type:2,style:1,label:'Lier mon Rumble',emoji:{name:'🔗'},custom_id:LINK_BUTTON},{type:2,style:2,label:'Plus tard',custom_id:`${P}later`}]},
  ]}] as never[]};
}

export function doneStep(ch:{offers?:string;rewards?:string;games?:string;general?:string}){
  return {flags:MessageFlags.IsComponentsV2 as const,components:[{type:17,accent_color:0x2FBF71,components:[
    T('### 🎉 Tout est prêt !\nTu as accès à tout le serveur. Par où commencer :'),
    {type:1,components:[{type:2,style:5,label:'Les offres casino',emoji:{name:'🎁'},url:url(ch.offers)},{type:2,style:5,label:'Les récompenses',emoji:{name:'🏆'},url:url(ch.rewards)},{type:2,style:5,label:'Mini-jeux',emoji:{name:'🃏'},url:url(ch.games)}]},
    {type:1,components:[{type:2,style:5,label:'Le chat général',emoji:{name:'💬'},url:url(ch.general)},{type:2,style:5,label:'La chaîne de Belva',emoji:{name:'🟢'},url:'https://rumble.com/user/Belvaa'}]},
    T('-# Tu peux relier ton Rumble plus tard dans 🔗 lier-mon-compte.'),
  ]}] as never[]};
}

const accessRole=async(guild:Guild)=>(await guild.roles.fetch()).find(r=>r.name===ACCESS_ROLE_NAME)??null;
async function channelsOf(guild:Guild){
  const all=await guild.channels.fetch();const f=(s:string)=>all.find(c=>c?.type===ChannelType.GuildText&&c.name.endsWith(s))?.id;
  return {offers:f('︱toutes-les-offres'),rewards:f('︱récompenses'),games:f('︱mini-jeux'),general:f('︱général')};
}

export async function handleBelvaOnboarding(i:Interaction,pool?:Pool):Promise<boolean>{
  if(!(i.isButton()||i.isStringSelectMenu())||!i.customId.startsWith(P)||i.guildId!==GUILD_ID()||!i.inCachedGuild())return false;
  const id=i.customId;
  if(!await isApproved(pool,'onboarding')){await i.reply({ephemeral:true,content:'Bienvenue ! Le serveur est déjà ouvert pour toi.'});return true;}
  const access=await accessRole(i.guild);
  if(id===`${P}accept`){
    const add=[access?.id,BELVA_ROLES.invite].filter((r):r is string=>!!r&&!i.member.roles.cache.has(r));
    if(add.length)await i.member.roles.add(add,'Règlement accepté').catch(()=>undefined);
    await i.reply({...notifStep(),flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral});return true;
  }
  if(id===`${P}notifs`&&i.isStringSelectMenu()){
    const want=new Set(i.values);
    for(const [k,n] of Object.entries(NOTIFS)){
      if(want.has(k)&&!want.has('none'))await i.member.roles.add(n.id,'Notifications choisies').catch(()=>undefined);
      else await i.member.roles.remove(n.id,'Notifications choisies').catch(()=>undefined);
    }
    // Déjà relié : on saute l'étape Rumble.
    const linked=pool?(await pool.query(`SELECT 1 FROM automod_discord_links l JOIN streamers s ON s.id=l.streamer_id WHERE lower(s.slug)='belvaa' AND l.discord_user_id=$1`,[i.user.id]).catch(()=>({rowCount:0}))).rowCount:0;
    await i.update(linked?doneStep(await channelsOf(i.guild)):linkStep());return true;
  }
  if(id===`${P}later`){await i.update(doneStep(await channelsOf(i.guild)));return true;}
  return true;
}

// À la validation de la fiche : le rôle Accès est d'abord donné à tous les membres actuels, puis les catégories se ferment aux nouveaux.
export async function applyOnboarding(client:Client,pool?:Pool){
  const guild=await client.guilds.fetch(GUILD_ID());
  let access=await accessRole(guild);
  access??=await guild.roles.create({name:ACCESS_ROLE_NAME,permissions:[],hoist:false,mentionable:false,reason:'Parcours d’arrivée : accès au serveur après le règlement'});
  const members=await guild.members.fetch();
  for(const m of members.values())if(!m.user.bot&&!m.roles.cache.has(access.id))await m.roles.add(access.id,'Membre existant : accès conservé').catch(()=>undefined);
  const all=await guild.channels.fetch();
  const gated=all.filter(c=>!!c&&(GATED_CATEGORIES.includes(c.id)||GATED_CATEGORIES.includes(c.parentId??'')||['︱lier-mon-compte','︱notifications'].some(s=>c.name.endsWith(s))));
  for(const c of gated.values())if(c&&'permissionOverwrites' in c){
    await c.permissionOverwrites.edit(guild.id,{ViewChannel:false},{reason:'Parcours d’arrivée'}).catch(()=>undefined);
    await c.permissionOverwrites.edit(access.id,{ViewChannel:true},{reason:'Parcours d’arrivée'}).catch(()=>undefined);
  }
  // Règlement : la nouvelle carte remplace les anciens messages (sauvegardés avant le déploiement).
  const rules=await client.channels.fetch(RULES_CHANNEL).catch(()=>null) as TextChannel|null;
  if(rules){
    const recent=await rules.messages.fetch({limit:20});
    if(!recent.some(m=>m.author.id===client.user!.id&&JSON.stringify(m.components.map(c=>c.toJSON())).includes(`${P}accept`)))await rules.send(rulesCard());
    const old=[...recent.filter(m=>!JSON.stringify(m.components.map(c=>c.toJSON())).includes(`${P}accept`)).values()];
    // Sauvegarde en base avant suppression ; sans base, on ne supprime rien.
    if(old.length&&pool){
      await pool.query(`CREATE TABLE IF NOT EXISTS belva_message_backups(channel_id TEXT,message_id TEXT PRIMARY KEY,author TEXT,content TEXT,payload JSONB,saved_at TIMESTAMPTZ DEFAULT now())`);
      for(const m of old){
        await pool.query(`INSERT INTO belva_message_backups(channel_id,message_id,author,content,payload) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
          [m.channelId,m.id,m.author.tag,m.content,JSON.stringify({embeds:m.embeds.map(e=>e.toJSON()),components:m.components.map(c=>c.toJSON()),attachments:[...m.attachments.values()].map(x=>x.url),createdAt:m.createdAt})]);
        await m.delete().catch(()=>undefined);
      }
    }
  }
  await rules?.permissionOverwrites.edit(guild.id,{ViewChannel:true,SendMessages:false},{reason:'Règlement visible par tous'}).catch(()=>undefined);
  const welcome=await client.channels.fetch(WELCOME_CHANNEL).catch(()=>null) as TextChannel|null;
  await welcome?.permissionOverwrites.edit(guild.id,{ViewChannel:true,SendMessages:false},{reason:'Bienvenue visible par tous'}).catch(()=>undefined);
}
