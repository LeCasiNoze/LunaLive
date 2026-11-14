import {ActionRowBuilder,ButtonBuilder,ButtonStyle,ChannelType,EmbedBuilder,LabelBuilder,ModalBuilder,TextInputBuilder,TextInputStyle,type Client,type Interaction} from 'discord.js';
import type {Pool} from 'pg';
import {findReferred,referredUsers} from './rainbet.js';
import {fetchWagers} from './rainbet-race.js';
import {BELVA_ROLES,CASINO_ROLES,grantCasinoRoles} from './belva-roles.js';
import {ensureTables} from './belva-tickets.js';

// Belva's Rainbet channel: welcome offer + automatic account check against the NIVORANET affiliate list.
const GUILD_ID=()=>process.env.BELVA_GUILD_ID?.trim()||'1429525570965737668';
const CHANNEL='1571169962041811014';
const LINK='https://rainbet.com/?r=nivoranet';
const P='belva:rb:';
const ID={verify:P+'verify',modal:P+'modal'};

export function belvaRainbetPanel(){
  return {embeds:[new EmbedBuilder().setColor(0x3b82f6).setTitle('🌧️ Rainbet · +20 % de rakeback boost pendant 7 jours').setURL(LINK)
      .setDescription([
        'Offre de bienvenue **exclusive au lien de Belva** : inscris-toi avec notre lien (code **NIVORANET**) et profite de **+20 % de rakeback boost pendant une semaine**.',
        '',
        '**Déjà inscrit ?** Clique sur « Vérifier mon compte » et entre ton pseudo Rainbet. La vérification est **automatique** : tu reçois le rôle **🌧️ Rainbet** et tu passes **🃏 Membre du Club**.',
      ].join('\n'))
      .setFooter({text:'18+ · Joue de façon responsable'})],
    components:[new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(LINK).setLabel('S’inscrire sur Rainbet').setEmoji('🌧️'),
      new ButtonBuilder().setCustomId(ID.verify).setLabel('Vérifier mon compte').setEmoji('✅').setStyle(ButtonStyle.Success))]};
}

export function belvaRainbetModal(){
  return new ModalBuilder().setCustomId(ID.modal).setTitle('Vérifier mon compte Rainbet').addLabelComponents(
    new LabelBuilder().setLabel('Ton pseudo Rainbet').setDescription('Exactement comme sur ton profil Rainbet.')
      .setTextInputComponent(new TextInputBuilder().setCustomId('user').setStyle(TextInputStyle.Short).setMinLength(2).setMaxLength(40).setRequired(true)));
}

const lastTry=new Map<string,number>();

export async function handleBelvaRainbet(i:Interaction,pool?:Pool):Promise<boolean>{
  const cid='customId' in i?String(i.customId):'';
  if(!cid.startsWith(P))return false;
  if(!i.guild||i.guildId!==GUILD_ID())return true;
  if(i.isButton()&&cid===ID.verify){await i.showModal(belvaRainbetModal());return true;}
  if(!i.isModalSubmit()||cid!==ID.modal)return true;
  await i.deferReply({ephemeral:true});
  if(Date.now()-(lastTry.get(i.user.id)??0)<20_000){await i.editReply('Patiente quelques secondes avant de réessayer.');return true;}
  lastTry.set(i.user.id,Date.now());
  if(!pool){await i.editReply('Vérification momentanément indisponible. Réessaie plus tard ou ouvre un ticket.');return true;}
  const input=i.fields.getTextInputValue('user').trim();
  let referred;
  try{referred=findReferred(await referredUsers(),input);}
  catch(e){console.error('[nozebot] Rainbet Belva',e);await i.editReply('Rainbet ne répond pas pour le moment. Réessaie dans quelques minutes.');return true;}
  if(!referred){
    await i.editReply('Ce pseudo n’apparaît pas parmi les comptes inscrits avec le lien de Belva. Vérifie l’orthographe exacte. Si tu viens de t’inscrire, Rainbet peut mettre une dizaine de minutes à mettre la liste à jour. Sinon, ouvre un ticket « Vérification de compte ».');
    return true;
  }
  await ensureTables(pool);
  const taken=(await pool.query(`SELECT discord_id FROM belva_casino_accounts WHERE guild_id=$1 AND casino='rainbet' AND lower(casino_username)=lower($2) AND discord_id<>$3`,
    [GUILD_ID(),referred.username,i.user.id])).rows[0] as {discord_id:string}|undefined;
  if(taken){await i.editReply('Ce compte Rainbet est déjà lié à un autre membre du Discord. Ouvre un ticket « Vérification de compte » si c’est bien le tien.');return true;}
  await pool.query(`INSERT INTO belva_casino_accounts (guild_id,discord_id,discord_tag,casino,casino_username,casino_email,verified_by,verified_at) VALUES ($1,$2,$3,'rainbet',$4,'','api',now())
    ON CONFLICT (guild_id,discord_id,casino) DO UPDATE SET casino_username=EXCLUDED.casino_username,discord_tag=EXCLUDED.discord_tag,verified_by='api',verified_at=now(),updated_at=now()`,
    [GUILD_ID(),i.user.id,i.user.username,referred.username]);
  // Any wager means the account has been funded. RainBet caps the window at 4 months.
  const day=(t:number)=>new Date(t).toISOString().slice(0,10);
  const wagered=await fetchWagers({start:day(Date.now()-119*86_400_000),end:day(Date.now()),endsAt:new Date(),label:''})
    .then(list=>list.find(w=>w.username.toLowerCase()===referred.username.toLowerCase())?.wagered??0).catch(()=>0);
  const member=await i.guild.members.fetch(i.user.id);
  await grantCasinoRoles(member,'rainbet',wagered>0,'Compte Rainbet vérifié (API)');
  await i.editReply(`✅ Compte Rainbet **${referred.username}** vérifié ! Tu as le rôle <@&${CASINO_ROLES.rainbet}>${wagered>0?` et <@&${BELVA_ROLES.carreOr}>`:''}.`);
  return true;
}

export async function ensureBelvaRainbetPanel(client:Client){
  if(process.env.BELVA_TICKETS_ENABLED==='false')return;
  const channel=await client.channels.fetch(CHANNEL).catch(()=>null);
  if(channel?.type!==ChannelType.GuildText)return;
  const recent=await channel.messages.fetch({limit:20});
  if(recent.some(m=>m.author.id===client.user!.id&&m.components.length>0))return;
  await channel.send(belvaRainbetPanel());
}
