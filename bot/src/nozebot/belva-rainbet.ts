import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {ActionRowBuilder,ButtonBuilder,ButtonStyle,ChannelType,EmbedBuilder,LabelBuilder,MessageFlags,ModalBuilder,TextInputBuilder,TextInputStyle,type Client,type Interaction} from 'discord.js';
import {isApproved} from './belva-approval.js';
import type {Pool} from 'pg';
import {findReferred,referredUsers} from './rainbet.js';
import {fetchWagers} from './rainbet-race.js';
import {BELVA_ROLES,brand,grantCasinoRoles} from './belva-roles.js';
import {ensureTables} from './belva-tickets.js';

// Belva's Rainbet channel: welcome offer + automatic account check against the NIVORANET affiliate list.
const GUILD_ID=()=>process.env.BELVA_GUILD_ID?.trim()||'1429525570965737668';
const CHANNEL='1571169962041811014';
const LINK='https://rainbet.com/?r=nivoranet';
const P='belva:rb:';
const ID={verify:P+'verify',modal:P+'modal'};

const RACE_CHANNEL='1481939824947626105';
const ASSETS=new URL('../../assets/belva/',import.meta.url);
const T=(content:string)=>({type:10,content});
const SEP=(spacing=1,divider=true)=>({type:14,divider,spacing});
const linkBtn=(label:string,emoji:string,url:string)=>({type:2,style:5,label,emoji:{name:emoji},url});
const verifyBtn=(label='Vérifier',id=ID.verify)=>({type:2,style:3,label,emoji:{name:'✅'},custom_id:id});

// Carte du salon Rainbet, partenaire principal : même format que les autres casinos, en plus mis en avant.
export function rainbetCard(){
  const race=`https://discord.com/channels/${GUILD_ID()}/${RACE_CHANNEL}`;
  const container={type:17,accent_color:0x3D8BFF,components:[
    {type:12,items:[{media:{url:'attachment://banner-rainbet.png'},description:'Rainbet × Belva : +20 % de rakeback pendant 7 jours avec le code NIVORANET'}]},
    SEP(2,false),
    {type:9,components:[T('# 🌧️ Rainbet × Belva'),T('⭐ **Notre partenaire principal.** L’offre de bienvenue exclusive au lien de Belva.\n-# Casino et sport crypto · 18+')],
      accessory:{type:11,media:{url:'attachment://logo-rainbet.png'},description:'Logo Rainbet'}},
    SEP(),
    {type:9,components:[T('### 🎁 +20 % de rakeback pendant 7 jours\nInscris-toi avec le lien de Belva, code **NIVORANET** : ton rakeback est boosté de **20 %** pendant ta première semaine.')],accessory:linkBtn('S’inscrire','🌧️',LINK)},
    SEP(1,false),
    {type:9,components:[T('### 🏁 Race du mois : 200 $\nChaque mois, du 16 au 15, le top 3 des joueurs Rainbet de la commu gagne **100 $ · 60 $ · 40 $**.\n-# Classement en direct dans le salon de la race')],accessory:linkBtn('Voir la race','🏁',race)},
    SEP(1,false),
    {type:9,components:[T('### ✅ Déjà inscrit ?\nVérification **automatique** en 10 secondes : tu reçois le rôle 🌧️ Rainbet et tu passes 🃏 Membre du Club.')],accessory:verifyBtn()},
    SEP(),
    T('### 📋 Comment ça marche\n**1 ·** Crée ton compte avec le bouton **S’inscrire** (le code NIVORANET est déjà dans le lien).\n**2 ·** Clique sur **Vérifier mon compte** et entre ton pseudo Rainbet.\n**3 ·** Joue : ton wager compte automatiquement pour la race du mois.'),
    SEP(),
    {type:1,components:[linkBtn('S’inscrire sur Rainbet','🌧️',LINK),verifyBtn('Vérifier mon compte',ID.verify+'2'),linkBtn('La race','🏁',race)]},
    SEP(1),
    T('-# 🔞 Les jeux d’argent comportent des risques : endettement, isolement, dépendance. Joueurs Info Service : 09 74 75 13 13.'),
  ]};
  return {flags:MessageFlags.IsComponentsV2 as const,components:[container] as never[],
    files:['banner-rainbet.png','logo-rainbet.png'].map(name=>({attachment:readFileSync(new URL(name,ASSETS)),name}))};
}
const cardVersion=()=>createHash('sha1').update(JSON.stringify(rainbetCard().components)).digest('hex').slice(0,10);

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
  if(i.isButton()&&(cid===ID.verify||cid===ID.verify+'2')){await i.showModal(belvaRainbetModal());return true;}
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
  const taken=(await pool.query(`SELECT discord_id FROM belva_casino_accounts WHERE guild_id=$1 AND casino='rainbet' AND lower(casino_username)=lower($2) AND discord_id<>$3 AND verified_at IS NOT NULL`,
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
  await i.editReply(`✅ Compte Rainbet **${referred.username}** vérifié ! Tu as le rôle <@&${brand('rainbet')?.role}>${wagered>0?` et <@&${BELVA_ROLES.carreOr}>`:''}.`);
  return true;
}

export async function ensureBelvaRainbetPanel(client:Client,pool?:Pool){
  if(process.env.BELVA_TICKETS_ENABLED==='false')return;
  const channel=await client.channels.fetch(CHANNEL).catch(()=>null);
  if(channel?.type!==ChannelType.GuildText)return;
  const recent=await channel.messages.fetch({limit:20});
  const mine=recent.filter(m=>m.author.id===client.user!.id&&m.components.length>0);
  // La nouvelle carte ne remplace l'ancien panneau qu'une fois validée dans le salon validation-design.
  if(!await isApproved(pool,'offer-rainbet')){if(!mine.size)await channel.send(belvaRainbetPanel());return;}
  const v=cardVersion();
  const card=mine.find(m=>m.components[0]?.type===17);
  if(card&&card.components[0]?.id===parseInt(v.slice(0,7),16))return;
  const payload={...rainbetCard(),components:[{...(rainbetCard().components[0] as object),id:parseInt(v.slice(0,7),16)}] as never[]};
  if(card)await card.edit({...payload,attachments:[]});else await channel.send(payload);
  for(const m of mine.filter(m=>m.id!==card?.id&&m.components[0]?.type!==17).values())await m.delete().catch(()=>undefined);
}
