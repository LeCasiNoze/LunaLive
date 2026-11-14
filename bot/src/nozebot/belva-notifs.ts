import {ActionRowBuilder,ButtonBuilder,ButtonStyle,ChannelType,EmbedBuilder,type Client,type GuildMember,type Interaction} from 'discord.js';

// Belva's community server: self-assigned notification roles (pinged by Belva for lives, giveaways, new offers).
const GUILD_ID=()=>process.env.BELVA_GUILD_ID?.trim()||'1429525570965737668';
const PANEL_CHANNEL='1571152753022083072';
const P='belva:n:';
export const NOTIF_ROLES=[
  {key:'live',role:'1571152748030722179',emoji:'🔴',label:'Lives',desc:'Ping à chaque début de stream.'},
  {key:'giveaways',role:'1571152748970385530',emoji:'🎁',label:'Giveaways',desc:'Ping quand un giveaway est lancé.'},
  {key:'offres',role:'1571152750304301117',emoji:'🔥',label:'Offres casino',desc:'Ping pour les nouveaux bonus et offres.'},
] as const;

export function belvaNotifPanel(){
  const embed=new EmbedBuilder().setColor(0xff4f81).setTitle('🔔 Choisis tes notifications')
    .setDescription(['Clique sur un bouton pour **activer** la notification, reclique pour la **désactiver**.','',
      ...NOTIF_ROLES.map(n=>`${n.emoji} **${n.label}** · ${n.desc}`)].join('\n'));
  const row=new ActionRowBuilder<ButtonBuilder>().addComponents(NOTIF_ROLES.map(n=>
    new ButtonBuilder().setCustomId(P+n.key).setLabel(n.label).setEmoji(n.emoji).setStyle(ButtonStyle.Secondary)));
  return {embeds:[embed],components:[row]};
}

export async function handleBelvaNotifs(i:Interaction):Promise<boolean>{
  if(!i.isButton()||!i.customId.startsWith(P))return false;
  const n=NOTIF_ROLES.find(x=>P+x.key===i.customId);
  if(!n||!i.guild||i.guildId!==GUILD_ID())return true;
  const member:GuildMember=await i.guild.members.fetch(i.user.id);
  const has=member.roles.cache.has(n.role);
  try{
    if(has)await member.roles.remove(n.role,'Notifications (auto)');else await member.roles.add(n.role,'Notifications (auto)');
    await i.reply({ephemeral:true,content:has?`🔕 Notifications **${n.label}** désactivées.`:`${n.emoji} Notifications **${n.label}** activées !`});
  }catch(e){
    console.error('[nozebot] rôle notif Belva',e);
    await i.reply({ephemeral:true,content:'Impossible de changer ce rôle pour le moment, préviens le staff.'}).catch(()=>{});
  }
  return true;
}

export async function ensureBelvaNotifPanel(client:Client){
  if(process.env.BELVA_TICKETS_ENABLED==='false')return;
  const channel=await client.channels.fetch(PANEL_CHANNEL).catch(()=>null);
  if(channel?.type!==ChannelType.GuildText)return;
  const recent=await channel.messages.fetch({limit:20});
  if(recent.some(m=>m.author.id===client.user!.id&&m.components.length>0))return;
  await channel.send(belvaNotifPanel());
}
