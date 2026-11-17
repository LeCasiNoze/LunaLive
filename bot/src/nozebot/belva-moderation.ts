import {ChannelType,EmbedBuilder,Events,OverwriteType,PermissionFlagsBits,type Client,type Guild,type GuildMember,type Message,type PartialGuildMember,type PartialMessage,type TextChannel} from 'discord.js';
import type {Pool} from 'pg';

// Modération du Discord de Belva : pas de lien hors 💰 big-win (et là, seulement des replays / clips de gains),
// spam et arnaques supprimés, tout est tracé dans 🛡️ modération ; les départs dans 🚪 départs.
const GUILD_ID=()=>process.env.BELVA_GUILD_ID?.trim()||'1429525570965737668';
const STAFF_CATEGORY='1483112145154474005';
const TICKET_CATEGORIES=['1483151398005637352','1483151400161775656'];
const PATRON_ROLE='1482854912059511006',VIDEUR_ROLE='1483165106140352632';
const LOG_NAME='🛡️︱modération',LEAVE_NAME='🚪︱départs';

const URL_RE=/\b(?:https?:\/\/|www\.)[^\s<>]+|\b(?:discord\.gg|discord\.com\/invite|t\.me|wa\.me)\/[^\s<>]+/gi;
// GIF du sélecteur Discord : autorisés partout.
const GIF_HOSTS=['tenor.com','giphy.com'];
// Hébergeurs de clips / captures : autorisés dans big-win.
const MEDIA_HOSTS=['rumble.com','kick.com','twitch.tv','clips.twitch.tv','youtube.com','youtu.be','streamable.com','medal.tv','imgur.com','i.imgur.com','cdn.discordapp.com','media.discordapp.net','prnt.sc','gyazo.com'];
// Casinos : autorisés dans big-win seulement pour un replay de pari (jamais un lien d'affiliation).
const CASINO_HOSTS=['rainbet.com','stake.com','stake.us','stake.bet','celsius.games','celsiuscasino.com','hazcasino.com','velobet.com','betportal.com','roobet.com','shuffle.com','gamdom.com','bc.game','duelbits.com','rollbit.com','thrill.com','winna.com','razed.com','metaspins.com'];
const REPLAY_RE=/[?&](bet|betid|bet_id|iid|modal=bet|id)=|\/(bets?|replay|share|game-history)\//i;
const REFERRAL_RE=/[?&](ref|r|aff|affiliate|code|promo|invite|bta|btag|c)=|\/(r|ref|referral|invite|aff)\//i;
const SPAM_RE=/\b(free\s*nitro|nitro\s*(gratuit|free)|steam\s*(gift|cadeau)|airdrop|crypto\s*signals?|invest(issement|ment)\s*(garanti|guaranteed)|onlyfans|dm\s*me|contact\s*me|add\s*me|écri[st][- ]?moi\s*en\s*(mp|privé)|viens?\s*en\s*mp|telegram|whatsapp)\b/i;

const host=(raw:string)=>{try{return new URL(/^https?:/i.test(raw)?raw:'https://'+raw).hostname.toLowerCase().replace(/^www\./,'');}catch{return '';}};
const inList=(h:string,list:string[])=>list.some(d=>h===d||h.endsWith('.'+d));

// Raison de suppression, ou null si le message est autorisé.
export function verdict(text:string,channelName:string):string|null{
  if(/@(everyone|here)\b/.test(text))return 'mention @everyone/@here';
  const urls=text.match(URL_RE)??[];
  const bigWin=channelName.endsWith('big-win');
  for(const u of urls){
    const h=host(u);
    if(inList(h,GIF_HOSTS))continue;
    if(/discord\.gg|discord\.com\/invite|t\.me\/|wa\.me\//i.test(u))return 'invitation / lien de contact';
    if(!bigWin)return 'lien hors 💰 big-win';
    if(REFERRAL_RE.test(u))return 'lien d’affiliation';
    if(inList(h,MEDIA_HOSTS))continue;
    if(inList(h,CASINO_HOSTS)&&REPLAY_RE.test(u))continue;
    return 'lien qui n’est pas un replay de gain';
  }
  if(SPAM_RE.test(text))return 'spam / démarchage';
  return null;
}

async function staffChannel(guild:Guild,name:string,topic:string):Promise<TextChannel|null>{
  const all=await guild.channels.fetch();
  const found=all.find(c=>c?.type===ChannelType.GuildText&&c.name===name);
  if(found)return found as TextChannel;
  return guild.channels.create({name,type:ChannelType.GuildText,parent:STAFF_CATEGORY,topic,permissionOverwrites:[
    {id:guild.roles.everyone.id,type:OverwriteType.Role,deny:[PermissionFlagsBits.ViewChannel]},
    {id:PATRON_ROLE,type:OverwriteType.Role,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.ReadMessageHistory]},
    {id:VIDEUR_ROLE,type:OverwriteType.Role,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.ReadMessageHistory]},
    {id:guild.client.user.id,type:OverwriteType.Member,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks]},
  ]}).catch(e=>{console.error('[nozebot] salon staff Belva',name,e?.message||e);return null;});
}

const clip=(s:string,n=1000)=>s.length>n?s.slice(0,n-1)+'…':s||'*(vide ou pièce jointe)*';
const isStaff=(m:GuildMember|null)=>!!m&&(m.permissions.has(PermissionFlagsBits.ManageMessages)||m.roles.cache.has(PATRON_ROLE)||m.roles.cache.has(VIDEUR_ROLE));
const exemptChannel=(msg:Message|PartialMessage)=>{
  const ch=msg.channel;const parent='parentId' in ch?ch.parentId??'':'';
  return parent===STAFF_CATEGORY||TICKET_CATEGORIES.includes(parent);
};

export function startBelvaModeration(client:Client,_pool?:Pool){
  if(process.env.BELVA_MODERATION==='false')return;
  let log:TextChannel|null=null,leave:TextChannel|null=null;
  // Démarré avant la connexion : les salons sont créés une fois le bot prêt.
  const ready=new Promise<void>(done=>client.once(Events.ClientReady,()=>void (async()=>{
    const guild=await client.guilds.fetch(GUILD_ID()).catch(()=>null);if(!guild)return;
    log=await staffChannel(guild,LOG_NAME,'Messages supprimés par le bot (liens, spam), messages modifiés et supprimés par les membres.');
    leave=await staffChannel(guild,LEAVE_NAME,'Membres qui quittent le serveur.');
  })().catch(e=>console.error('[nozebot] modération Belva',e)).finally(done)));
  const post=async(embed:EmbedBuilder)=>{await ready;await log?.send({embeds:[embed],allowedMentions:{parse:[]}}).catch(()=>undefined);};
  const ours=(g?:{id:string}|null)=>g?.id===GUILD_ID();
  const author=(m:Message|PartialMessage)=>m.author?`<@${m.author.id}> (${m.author.tag})`:'inconnu';

  // Un message déjà supprimé par le bot ne doit pas réapparaître en « supprimé par un membre ».
  const removedByBot=new Set<string>();
  async function check(msg:Message,edited:boolean){
    if(!ours(msg.guild)||msg.author.bot||exemptChannel(msg))return;
    const member=msg.member??await msg.guild!.members.fetch(msg.author.id).catch(()=>null);
    if(isStaff(member))return;
    const name=('name' in msg.channel?msg.channel.name:'')??'';
    const reason=verdict(msg.content,name);if(!reason)return;
    removedByBot.add(msg.id);
    await msg.delete().catch(()=>removedByBot.delete(msg.id));
    await post(new EmbedBuilder().setColor(0xE8475F).setTitle(`🗑️ Supprimé par le bot · ${reason}${edited?' (après modification)':''}`)
      .setDescription(clip(msg.content)).addFields({name:'Auteur',value:author(msg),inline:true},{name:'Salon',value:`<#${msg.channelId}>`,inline:true})
      .setTimestamp());
  }
  client.on(Events.MessageCreate,m=>void check(m,false).catch(e=>console.error('[nozebot] modération Belva',e)));
  client.on(Events.MessageUpdate,(before,after)=>void (async()=>{
    if(!ours(after.guild)||after.author?.bot||exemptChannel(after))return;
    const full=after.partial?await after.fetch().catch(()=>null):after;if(!full)return;
    if(before.content===full.content)return; // aperçu de lien, épingle…
    await post(new EmbedBuilder().setColor(0xF3C14B).setTitle('✏️ Message modifié')
      .addFields({name:'Avant',value:before.partial?'*(pas en mémoire : message antérieur au dernier redémarrage)*':clip(before.content,1000)},
        {name:'Après',value:clip(full.content,1000)},{name:'Auteur',value:author(full),inline:true},{name:'Salon',value:`${full.url}`,inline:true})
      .setTimestamp());
    await check(full,true);
  })().catch(e=>console.error('[nozebot] modération Belva',e)));
  client.on(Events.MessageDelete,m=>void (async()=>{
    if(!ours(m.guild)||m.author?.bot||exemptChannel(m))return;
    if(removedByBot.delete(m.id))return;
    await post(new EmbedBuilder().setColor(0x7A8796).setTitle('🗑️ Message supprimé')
      .setDescription(m.partial?'*(contenu pas en mémoire : message antérieur au dernier redémarrage)*':clip(m.content??''))
      .addFields({name:'Auteur',value:author(m),inline:true},{name:'Salon',value:`<#${m.channelId}>`,inline:true})
      .setTimestamp());
  })().catch(e=>console.error('[nozebot] modération Belva',e)));
  client.on(Events.GuildMemberRemove,m=>void (async()=>{
    if(!ours(m.guild)||m.user.bot)return;
    await ready;
    const roles=(m as GuildMember|PartialGuildMember).roles.cache.filter(r=>r.id!==m.guild.roles.everyone.id).map(r=>r.name).slice(0,15);
    await leave?.send({allowedMentions:{parse:[]},embeds:[new EmbedBuilder().setColor(0x7A8796).setTitle('🚪 Départ du serveur')
      .setThumbnail(m.user.displayAvatarURL({size:128}))
      .setDescription(`<@${m.id}> · **${m.displayName}** (${m.user.tag})`)
      .addFields({name:'Arrivé',value:m.joinedTimestamp?`<t:${Math.floor(m.joinedTimestamp/1000)}:R>`:'inconnu',inline:true},
        {name:'Membres restants',value:String(m.guild.memberCount),inline:true},
        {name:'Rôles',value:roles.length?roles.join(', '):'aucun'})
      .setTimestamp()]}).catch(()=>undefined);
  })().catch(e=>console.error('[nozebot] départs Belva',e)));
}
