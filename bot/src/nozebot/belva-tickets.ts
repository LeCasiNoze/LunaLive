import {
  ActionRowBuilder,ButtonBuilder,ButtonStyle,ChannelType,EmbedBuilder,FileUploadBuilder,LabelBuilder,ModalBuilder,
  OverwriteType,PermissionFlagsBits,StringSelectMenuBuilder,TextInputBuilder,TextInputStyle,
  type Attachment,type Client,type Guild,type GuildMember,type Interaction,type ModalSubmitInteraction,type TextChannel,
} from 'discord.js';
import type {Pool} from 'pg';

// Belva's community server: ticket system for casino account checks and the "30 € offerts" deposit refunds.
const GUILD_ID=()=>process.env.BELVA_GUILD_ID?.trim()||'1429525570965737668';
const PATRON_ROLE='1482854912059511006';
const VIDEUR_ROLE='1483165106140352632';
const PANEL_CHANNEL='1483116856826007736';
const OPEN_CATEGORY='1483151398005637352';
const CLOSED_CATEGORY='1483151400161775656';
const STAFF_CATEGORY='1483112145154474005';
const LIST_CHANNEL_NAME='📋︱liste-remboursements';

type Casino={id:string;name:string;emoji:string;bonus?:number};
const CASINOS:Casino[]=[
  {id:'hazcasino',name:'HazCasino',emoji:'💜',bonus:30},
  {id:'velobet',name:'VeloBet',emoji:'💚',bonus:30},
  {id:'boo',name:'Boo!',emoji:'🩵',bonus:30},
  {id:'celsius',name:'Celsius',emoji:'🧡',bonus:35},
  {id:'rainbet',name:'Rainbet',emoji:'🌧️'},
];
export const casino=(id:string)=>CASINOS.find(c=>c.id===id);

const KINDS={
  refund:{emoji:'💸',label:'Remboursement de dépôt',short:'remb',description:'Récupérer tes 30 € offerts après ton dépôt via le lien de Belva.'},
  verify:{emoji:'🔎',label:'Vérification de compte',short:'verif',description:'Faire vérifier ton compte sur un casino partenaire.'},
  help:{emoji:'🛟',label:'Aide / question',short:'aide',description:'Un problème ou une question pour le staff.'},
  partner:{emoji:'🤝',label:'Partenariat',short:'partenariat',description:'Proposition professionnelle ou prise de contact.'},
  other:{emoji:'📝',label:'Autre demande',short:'autre',description:'Tout ce qui ne rentre pas dans les autres choix.'},
} as const;
type Kind=keyof typeof KINDS;

const P='belva:t:';
const ID={
  panel:P+'new',casinoSelect:P+'casino:',modal:P+'modal:',approve:P+'approve:',reject:P+'reject:',close:P+'close',
  wallet:P+'wallet:',walletModal:P+'walletmodal:',paid:P+'paid:',unpaid:P+'unpaid:',verified:P+'verified:',
};
const IN={user:'user',email:'email',proof:'proof',details:'details',network:'network',address:'address',walletProof:'walletproof'};

const clean=(s:string,max=200)=>s.replace(/[`\\*_~|<>@]/g,'').replace(/[\r\n]+/g,' ').trim().slice(0,max);
const code=(s:string)=>'`'+(clean(s,180)||'—')+'`';
const slug=(s:string)=>s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'membre';
const marker=(userId:string,status:'open'|'closed')=>`belva-ticket:${userId}:${status}`;

let tablesReady=false;
async function ensureTables(pool:Pool){
  if(tablesReady)return;
  await pool.query(`CREATE TABLE IF NOT EXISTS belva_casino_accounts (
    guild_id TEXT NOT NULL, discord_id TEXT NOT NULL, discord_tag TEXT NOT NULL, casino TEXT NOT NULL,
    casino_username TEXT NOT NULL, casino_email TEXT NOT NULL, verified_by TEXT, verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (guild_id,discord_id,casino))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS belva_refunds (
    id SERIAL PRIMARY KEY, guild_id TEXT NOT NULL, discord_id TEXT NOT NULL, discord_tag TEXT NOT NULL,
    casino TEXT NOT NULL, casino_username TEXT NOT NULL, casino_email TEXT NOT NULL, amount_eur INT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', ticket_channel_id TEXT, wallet_network TEXT, wallet_address TEXT,
    list_message_id TEXT, approved_by TEXT, approved_at TIMESTAMPTZ, paid_by TEXT, paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  tablesReady=true;
}

type Refund={id:number;discord_id:string;discord_tag:string;casino:string;casino_username:string;casino_email:string;amount_eur:number;
  status:string;ticket_channel_id:string|null;wallet_network:string|null;wallet_address:string|null;list_message_id:string|null;
  approved_by:string|null;paid_by:string|null;paid_at:Date|null};
const getRefund=async(pool:Pool,id:number)=>(await pool.query(`SELECT * FROM belva_refunds WHERE id=$1 AND guild_id=$2`,[id,GUILD_ID()])).rows[0] as Refund|undefined;

const isStaff=(m:GuildMember)=>m.roles.cache.has(PATRON_ROLE)||m.roles.cache.has(VIDEUR_ROLE)||m.permissions.has(PermissionFlagsBits.Administrator);
const isPatron=(m:GuildMember)=>m.roles.cache.has(PATRON_ROLE)||m.guild.ownerId===m.id||m.permissions.has(PermissionFlagsBits.Administrator);

async function reupload(files:Iterable<Attachment>,prefix:string){
  const out:{attachment:Buffer;name:string}[]=[];let i=0;
  for(const f of files){
    const r=await fetch(f.url,{signal:AbortSignal.timeout(20_000)}).catch(()=>null);
    if(!r?.ok)continue;
    // Discord n'affiche pas l'aperçu des .jfif/.jpe : on force une extension qu'il rend.
    const raw=(f.contentType?.split('/')[1]||f.name.match(/\.([a-z0-9]{2,5})$/i)?.[1]||'png').toLowerCase();
    const ext='.'+(/^(jpe?g|jfif|pjpeg|jpe)$/.test(raw)?'jpg':raw);
    out.push({attachment:Buffer.from(await r.arrayBuffer()),name:`${prefix}-${++i}${ext}`});
  }
  return out;
}

export function belvaTicketPanel(){
  return {
    embeds:[new EmbedBuilder().setColor(0xe74c3c).setTitle('🎫 Ouvrir un ticket')
      .setDescription([
        'Choisis ta demande dans le menu ci-dessous, un salon privé s’ouvrira avec le staff.',
        '',
        '💸 **Remboursement de dépôt** · tes 30 € offerts (35 € sur Celsius) après ton inscription via le lien de Belva et ton dépôt.',
        '🔎 **Vérification de compte** · faire vérifier ton compte sur un casino partenaire.',
        '🛟 **Aide**, 🤝 **Partenariat** ou 📝 **Autre** pour le reste.',
        '',
        '📸 Prépare une **capture de ton dépôt** pour un remboursement.',
      ].join('\n'))
      .setFooter({text:'Belva • Support privé · 18+ · Joue de façon responsable'})],
    components:[new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(ID.panel)
      .setPlaceholder('Choisis le type de demande…')
      .addOptions((Object.keys(KINDS) as Kind[]).map(k=>({value:k,label:KINDS[k].label,emoji:KINDS[k].emoji,description:KINDS[k].description}))))],
  };
}

export function casinoMenu(kind:'refund'|'verify'){
  const list=CASINOS.filter(c=>kind==='verify'||c.bonus);
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(ID.casinoSelect+kind)
    .setPlaceholder('Sur quel casino ?')
    .addOptions(list.map(c=>({value:c.id,label:c.name,emoji:c.emoji,description:kind==='refund'?`${c.bonus} € offerts`:'Vérifier mon compte'}))));
}

export function accountModal(kind:'refund'|'verify',c:Casino){
  const m=new ModalBuilder().setCustomId(`${ID.modal}${kind}:${c.id}`).setTitle(`${kind==='refund'?'Remboursement':'Vérification'} · ${c.name}`.slice(0,45));
  m.addLabelComponents(
    new LabelBuilder().setLabel(`Ton pseudo sur ${c.name}`).setTextInputComponent(new TextInputBuilder().setCustomId(IN.user).setStyle(TextInputStyle.Short).setMinLength(2).setMaxLength(60).setRequired(true)),
    new LabelBuilder().setLabel(`Ton adresse mail sur ${c.name}`).setTextInputComponent(new TextInputBuilder().setCustomId(IN.email).setStyle(TextInputStyle.Short).setMinLength(5).setMaxLength(120).setRequired(true)),
    new LabelBuilder().setLabel(kind==='refund'?'Capture de ton dépôt':'Capture de ton compte (facultatif)')
      .setDescription(kind==='refund'?'Montant, date et pseudo visibles.':'Ta page profil par exemple.')
      .setFileUploadComponent(new FileUploadBuilder().setCustomId(IN.proof).setMinValues(kind==='refund'?1:0).setMaxValues(3).setRequired(kind==='refund')),
  );
  return m;
}

export function freeModal(kind:Kind){
  return new ModalBuilder().setCustomId(`${ID.modal}${kind}:-`).setTitle(KINDS[kind].label).addLabelComponents(
    new LabelBuilder().setLabel('Explique ta demande').setTextInputComponent(new TextInputBuilder().setCustomId(IN.details).setStyle(TextInputStyle.Paragraph).setMinLength(5).setMaxLength(1500).setRequired(true)));
}

export function walletModal(refundId:number){
  return new ModalBuilder().setCustomId(ID.walletModal+refundId).setTitle('Mon wallet pour le remboursement').addLabelComponents(
    new LabelBuilder().setLabel('Crypto et réseau').setDescription('Ex. USDT TRC20, USDT ERC20, BTC, SOL, LTC…')
      .setTextInputComponent(new TextInputBuilder().setCustomId(IN.network).setStyle(TextInputStyle.Short).setMinLength(2).setMaxLength(40).setRequired(true)),
    new LabelBuilder().setLabel('Adresse du wallet').setDescription('Copie-colle-la, ne la tape pas à la main.')
      .setTextInputComponent(new TextInputBuilder().setCustomId(IN.address).setStyle(TextInputStyle.Short).setMinLength(20).setMaxLength(130).setRequired(true)),
    new LabelBuilder().setLabel('Capture de ton adresse de réception').setDescription('Écran de réception de ton wallet, avec l’adresse visible.')
      .setFileUploadComponent(new FileUploadBuilder().setCustomId(IN.walletProof).setMinValues(1).setMaxValues(1).setRequired(true)));
}

async function openChannel(i:ModalSubmitInteraction,kind:Kind,c?:Casino):Promise<TextChannel|null>{
  const guild=i.guild!;
  const all=await guild.channels.fetch();
  const existing=all.find(ch=>ch?.type===ChannelType.GuildText&&ch.topic?.includes(marker(i.user.id,'open')));
  if(existing){await i.editReply(`Tu as déjà un ticket ouvert : <#${existing.id}>. Termine-le avant d’en ouvrir un autre.`);return null;}
  const view=[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.AttachFiles,PermissionFlagsBits.EmbedLinks];
  return guild.channels.create({
    name:`${KINDS[kind].emoji}︱${KINDS[kind].short}${c?'-'+c.id:''}-${slug(i.user.username)}`.slice(0,90),
    type:ChannelType.GuildText,parent:OPEN_CATEGORY,
    topic:`${marker(i.user.id,'open')};type:${kind}${c?';casino:'+c.id:''}`,
    permissionOverwrites:[
      {id:guild.roles.everyone.id,type:OverwriteType.Role,deny:[PermissionFlagsBits.ViewChannel]},
      {id:i.user.id,type:OverwriteType.Member,allow:view},
      {id:PATRON_ROLE,type:OverwriteType.Role,allow:[...view,PermissionFlagsBits.ManageMessages]},
      {id:VIDEUR_ROLE,type:OverwriteType.Role,allow:[...view,PermissionFlagsBits.ManageMessages]},
      {id:i.client.user.id,type:OverwriteType.Member,allow:[...view,PermissionFlagsBits.ManageChannels]},
    ],
    reason:`${KINDS[kind].label} ouvert par ${i.user.username}`,
  });
}

const closeButton=()=>new ButtonBuilder().setCustomId(ID.close).setLabel('Fermer le ticket').setEmoji('🔒').setStyle(ButtonStyle.Secondary);
const staffPing=`<@&${PATRON_ROLE}> <@&${VIDEUR_ROLE}>`;

async function submitTicket(i:ModalSubmitInteraction,pool:Pool|undefined,kind:Kind,casinoId:string){
  await i.deferReply({ephemeral:true});
  const c=casino(casinoId);
  if(kind==='refund'||kind==='verify'){
    if(!c||(kind==='refund'&&!c.bonus)){await i.editReply('Ce casino n’est plus proposé. Réessaie depuis le salon ticket.');return;}
    if(!pool){await i.editReply('Le système de tickets est momentanément indisponible. Réessaie dans quelques minutes.');return;}
    await ensureTables(pool);
    const user=clean(i.fields.getTextInputValue(IN.user),60);
    const email=i.fields.getTextInputValue(IN.email).trim().toLowerCase().slice(0,120);
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)){await i.editReply('Cette adresse mail ne semble pas valide. Réessaie.');return;}
    const proofs=[...(i.fields.getUploadedFiles(IN.proof)?.values()??[])];
    let warning='';
    if(kind==='refund'){
      const dup=(await pool.query(`SELECT id,discord_id,status FROM belva_refunds WHERE guild_id=$1 AND casino=$2 AND status<>'rejected'
        AND (discord_id=$3 OR lower(casino_username)=lower($4) OR casino_email=$5)`,[GUILD_ID(),c.id,i.user.id,user,email])).rows as {id:number;discord_id:string;status:string}[];
      if(dup.some(d=>d.discord_id===i.user.id)){await i.editReply(`Tu as déjà une demande de remboursement ${c.name} (n°${dup.find(d=>d.discord_id===i.user.id)!.id}). Une seule par casino.`);return;}
      if(dup.length)warning=`⚠️ **Attention staff** : ce pseudo ou ce mail ${c.name} a déjà servi pour la demande n°${dup[0].id} de <@${dup[0].discord_id}>.`;
    }
    const channel=await openChannel(i,kind,c);if(!channel)return;
    await pool.query(`INSERT INTO belva_casino_accounts (guild_id,discord_id,discord_tag,casino,casino_username,casino_email) VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (guild_id,discord_id,casino) DO UPDATE SET casino_username=EXCLUDED.casino_username,casino_email=EXCLUDED.casino_email,discord_tag=EXCLUDED.discord_tag,updated_at=now()`,
      [GUILD_ID(),i.user.id,i.user.username,c.id,user,email]);
    let refundId=0;
    if(kind==='refund')refundId=(await pool.query(`INSERT INTO belva_refunds (guild_id,discord_id,discord_tag,casino,casino_username,casino_email,amount_eur,ticket_channel_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,[GUILD_ID(),i.user.id,i.user.username,c.id,user,email,c.bonus,channel.id])).rows[0].id;
    const files=await reupload(proofs,kind==='refund'?'depot':'compte');
    const embed=new EmbedBuilder().setColor(kind==='refund'?0xf1c40f:0x4cc9f0)
      .setTitle(`${KINDS[kind].emoji} ${KINDS[kind].label} · ${c.emoji} ${c.name}${refundId?` · n°${refundId}`:''}`)
      .setDescription(kind==='refund'
        ?`Merci ! Le staff vérifie ton inscription et ton dépôt. Dès que c’est validé, tu recevras ici un bouton pour envoyer ton **wallet**.${files.length?'':'\n\n⚠️ La capture n’a pas pu être récupérée : renvoie-la dans ce salon.'}`
        :'Merci ! Le staff vérifie ton compte et te répond ici.')
      .addFields(
        {name:'Membre',value:`<@${i.user.id}>\n${code(i.user.username)}`,inline:true},
        {name:'Casino',value:`${c.emoji} ${c.name}`,inline:true},
        {name:`Pseudo ${c.name}`,value:code(user),inline:true},
        {name:'Mail',value:code(email),inline:true},
        ...(refundId?[{name:'Montant',value:`**${c.bonus} €**`,inline:true}]:[]),
      ).setFooter({text:'Belva • Support privé'}).setTimestamp();
    const buttons=kind==='refund'
      ?[new ButtonBuilder().setCustomId(ID.approve+refundId).setLabel('Valider').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(ID.reject+refundId).setLabel('Refuser').setEmoji('❌').setStyle(ButtonStyle.Danger),closeButton()]
      :[new ButtonBuilder().setCustomId(`${ID.verified}${c.id}:${i.user.id}`).setLabel('Compte vérifié').setEmoji('✅').setStyle(ButtonStyle.Success),closeButton()];
    await channel.send({content:`<@${i.user.id}> ${staffPing}${warning?'\n'+warning:''}`,embeds:[embed],files,
      components:[new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons)],allowedMentions:{users:[i.user.id],roles:[PATRON_ROLE,VIDEUR_ROLE]}});
    await i.editReply(`✅ Ton ticket est ouvert : <#${channel.id}>.`);
    return;
  }
  const channel=await openChannel(i,kind);if(!channel)return;
  await channel.send({content:`<@${i.user.id}> ${staffPing}`,allowedMentions:{users:[i.user.id],roles:[PATRON_ROLE,VIDEUR_ROLE]},
    embeds:[new EmbedBuilder().setColor(0x4cc9f0).setTitle(`${KINDS[kind].emoji} ${KINDS[kind].label}`)
      .setDescription(i.fields.getTextInputValue(IN.details).slice(0,1500)).addFields({name:'Membre',value:`<@${i.user.id}>`,inline:true})
      .setFooter({text:'Belva • Le staff te répond ici'}).setTimestamp()],
    components:[new ActionRowBuilder<ButtonBuilder>().addComponents(closeButton())]});
  await i.editReply(`✅ Ton ticket est ouvert : <#${channel.id}>.`);
}

async function listChannel(guild:Guild):Promise<TextChannel>{
  const all=await guild.channels.fetch();
  const found=all.find(ch=>ch?.type===ChannelType.GuildText&&ch.name===LIST_CHANNEL_NAME);
  if(found)return found as TextChannel;
  return guild.channels.create({name:LIST_CHANNEL_NAME,type:ChannelType.GuildText,parent:STAFF_CATEGORY,
    topic:'Remboursements à faire : pseudo, casino, wallet. Clique « Remboursé » une fois le paiement envoyé.',
    permissionOverwrites:[
      {id:guild.roles.everyone.id,type:OverwriteType.Role,deny:[PermissionFlagsBits.ViewChannel]},
      {id:PATRON_ROLE,type:OverwriteType.Role,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.ReadMessageHistory]},
      {id:VIDEUR_ROLE,type:OverwriteType.Role,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.ReadMessageHistory]},
      {id:guild.client.user.id,type:OverwriteType.Member,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.AttachFiles,PermissionFlagsBits.EmbedLinks]},
    ],reason:'Liste des remboursements Belva'});
}

function listEntry(r:Refund,image?:string){
  const c=casino(r.casino);const paid=r.status==='paid';
  const embed=new EmbedBuilder().setColor(paid?0x2ecc71:0xf1c40f)
    .setTitle(`${paid?'✅ Remboursé':'⏳ À rembourser'} · n°${r.id} · ${c?.emoji??''} ${c?.name??r.casino} · ${r.amount_eur} €`)
    .addFields(
      {name:'Membre',value:`<@${r.discord_id}>\n${code(r.discord_tag)}`,inline:true},
      {name:`Pseudo ${c?.name??r.casino}`,value:code(r.casino_username),inline:true},
      {name:'Mail',value:code(r.casino_email),inline:true},
      {name:'Réseau',value:code(r.wallet_network??''),inline:true},
      {name:'Wallet',value:'```'+clean(r.wallet_address??'',150)+'```',inline:false},
      ...(r.ticket_channel_id?[{name:'Ticket',value:`<#${r.ticket_channel_id}>`,inline:true}]:[]),
      ...(paid?[{name:'Remboursé par',value:`<@${r.paid_by}> · <t:${Math.floor(new Date(r.paid_at!).getTime()/1000)}:f>`,inline:true}]:[]),
    ).setTimestamp();
  if(image)embed.setImage(`attachment://${image}`);
  const row=new ActionRowBuilder<ButtonBuilder>().addComponents(paid
    ?new ButtonBuilder().setCustomId(ID.unpaid+r.id).setLabel('Annuler (pas encore payé)').setEmoji('↩️').setStyle(ButtonStyle.Secondary)
    :new ButtonBuilder().setCustomId(ID.paid+r.id).setLabel('Remboursé').setEmoji('✅').setStyle(ButtonStyle.Success));
  return {embeds:[embed],components:[row]};
}

async function memberOf(i:Interaction){return i.guild!.members.fetch(i.user.id);}

export async function handleBelvaTickets(interaction:Interaction,pool?:Pool):Promise<boolean>{
  const cid='customId' in interaction?String(interaction.customId):'';
  if(!cid.startsWith(P))return false;
  if(!interaction.guild||interaction.guildId!==GUILD_ID())return true;
  const i=interaction;

  if(i.isStringSelectMenu()&&cid===ID.panel){
    const kind=i.values[0] as Kind;
    if(kind==='refund'||kind==='verify'){
      await i.reply({ephemeral:true,content:kind==='refund'?'💸 Pour quel casino veux-tu ton remboursement ?':'🔎 Quel compte veux-tu faire vérifier ?',components:[casinoMenu(kind)]});
    }else if(KINDS[kind])await i.showModal(freeModal(kind));
    return true;
  }
  if(i.isStringSelectMenu()&&cid.startsWith(ID.casinoSelect)){
    const kind=cid.slice(ID.casinoSelect.length) as 'refund'|'verify';const c=casino(i.values[0]);
    if(c)await i.showModal(accountModal(kind,c));
    return true;
  }
  if(i.isModalSubmit()&&cid.startsWith(ID.modal)){
    const [kind,casinoId]=cid.slice(ID.modal.length).split(':');
    if(KINDS[kind as Kind])await submitTicket(i,pool,kind as Kind,casinoId);
    return true;
  }
  if(i.isButton()&&cid===ID.close){
    const channel=i.channel as TextChannel;const owner=channel.topic?.match(/belva-ticket:(\d+):(?:open|closed)/)?.[1];
    if(!owner||(owner!==i.user.id&&!isStaff(await memberOf(i)))){await i.reply({ephemeral:true,content:'Tu ne peux pas fermer ce ticket.'});return true;}
    await i.deferReply({ephemeral:true});
    await channel.permissionOverwrites.edit(owner,{ViewChannel:false,SendMessages:false},{reason:`Ticket fermé par ${i.user.username}`});
    await channel.setParent(CLOSED_CATEGORY,{lockPermissions:false}).catch(()=>undefined);
    await channel.setTopic((channel.topic||'').replace(marker(owner,'open'),marker(owner,'closed')));
    await channel.send({embeds:[new EmbedBuilder().setColor(0x94a3b8).setDescription(`🔒 Ticket fermé par <@${i.user.id}>.`).setTimestamp()],allowedMentions:{parse:[]}});
    await i.editReply('Ticket fermé et archivé pour le staff.');
    return true;
  }
  if(i.isButton()&&cid.startsWith(ID.verified)){
    if(!isStaff(await memberOf(i))){await i.reply({ephemeral:true,content:'Réservé au staff.'});return true;}
    if(!pool)throw Error('pool absent');
    await ensureTables(pool);
    const [casinoId,userId]=cid.slice(ID.verified.length).split(':');
    await pool.query(`UPDATE belva_casino_accounts SET verified_by=$1,verified_at=now(),updated_at=now() WHERE guild_id=$2 AND discord_id=$3 AND casino=$4`,[i.user.id,GUILD_ID(),userId,casinoId]);
    await i.update({components:[new ActionRowBuilder<ButtonBuilder>().addComponents(closeButton())]});
    await i.followUp({content:`✅ <@${userId}>, ton compte ${casino(casinoId)?.name??casinoId} est vérifié par <@${i.user.id}>.`,allowedMentions:{users:[userId]}});
    return true;
  }

  const refundId=Number(cid.split(':').pop());
  if(!Number.isInteger(refundId)||refundId<=0)return true;
  if(!pool)throw Error('pool absent');
  await ensureTables(pool);
  const r=await getRefund(pool,refundId);
  if(!r){if(i.isRepliable())await i.reply({ephemeral:true,content:'Demande introuvable.'});return true;}

  if(i.isButton()&&(cid.startsWith(ID.approve)||cid.startsWith(ID.reject))){
    if(!isStaff(await memberOf(i))){await i.reply({ephemeral:true,content:'Réservé au staff.'});return true;}
    if(r.status!=='pending'){await i.reply({ephemeral:true,content:`Cette demande est déjà traitée (${r.status}).`});return true;}
    const ok=cid.startsWith(ID.approve);
    await pool.query(`UPDATE belva_refunds SET status=$1,approved_by=$2,approved_at=now(),updated_at=now() WHERE id=$3`,[ok?'approved':'rejected',i.user.id,r.id]);
    await i.update({components:[new ActionRowBuilder<ButtonBuilder>().addComponents(closeButton())]});
    if(ok)await i.followUp({content:`✅ <@${r.discord_id}>, ta demande est **validée** par <@${i.user.id}> !\nClique ci-dessous pour envoyer l’adresse de ton **wallet** avec une capture, puis Belva t’envoie tes **${r.amount_eur} €**.`,
      allowedMentions:{users:[r.discord_id]},components:[new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(ID.wallet+r.id).setLabel('Envoyer mon wallet').setEmoji('💳').setStyle(ButtonStyle.Primary))]});
    else await i.followUp({content:`❌ <@${r.discord_id}>, ta demande de remboursement est **refusée** par <@${i.user.id}>. Le staff t’explique pourquoi ici.`,allowedMentions:{users:[r.discord_id]}});
    return true;
  }
  if(i.isButton()&&cid.startsWith(ID.wallet)){
    if(i.user.id!==r.discord_id){await i.reply({ephemeral:true,content:'Seul le membre qui a ouvert la demande peut envoyer son wallet.'});return true;}
    if(r.status==='paid'){await i.reply({ephemeral:true,content:'Ce remboursement est déjà envoyé ✅'});return true;}
    if(r.status!=='approved'&&r.status!=='wallet_received'){await i.reply({ephemeral:true,content:'Ta demande doit d’abord être validée par le staff.'});return true;}
    await i.showModal(walletModal(r.id));
    return true;
  }
  if(i.isModalSubmit()&&cid.startsWith(ID.walletModal)){
    await i.deferReply({ephemeral:true});
    if(i.user.id!==r.discord_id||(r.status!=='approved'&&r.status!=='wallet_received')){await i.editReply('Cette demande ne peut plus recevoir de wallet.');return true;}
    const network=clean(i.fields.getTextInputValue(IN.network),40);
    const address=i.fields.getTextInputValue(IN.address).replace(/\s+/g,'');
    if(!/^[A-Za-z0-9:_.-]{20,130}$/.test(address)){await i.editReply('Cette adresse contient des caractères inattendus. Copie-colle exactement l’adresse de réception.');return true;}
    const [proof]=await reupload(i.fields.getUploadedFiles(IN.walletProof)?.values()??[],`wallet-${r.id}`);
    await pool.query(`UPDATE belva_refunds SET wallet_network=$1,wallet_address=$2,status='wallet_received',updated_at=now() WHERE id=$3`,[network,address,r.id]);
    const fresh=(await getRefund(pool,r.id))!;
    const list=await listChannel(i.guild!);
    const entry={...listEntry(fresh,proof?.name),files:proof?[proof]:[],allowedMentions:{parse:[] as never[]}};
    const old=fresh.list_message_id?await list.messages.fetch(fresh.list_message_id).catch(()=>null):null;
    const msg=old?await old.edit({...entry,attachments:[]}):await list.send(entry);
    if(!old)await pool.query(`UPDATE belva_refunds SET list_message_id=$1 WHERE id=$2`,[msg.id,r.id]);
    const ticket=fresh.ticket_channel_id?await i.guild!.channels.fetch(fresh.ticket_channel_id).catch(()=>null):null;
    if(ticket?.type===ChannelType.GuildText)await ticket.send({content:`💳 Wallet reçu (${code(network)}) : ${code(address)}\nBelva t’envoie tes **${fresh.amount_eur} €** dès que possible. Tu seras prévenu ici.`,files:proof?[proof]:[],allowedMentions:{parse:[]}});
    await i.editReply('✅ Wallet enregistré ! Tu seras prévenu dans ton ticket quand le remboursement sera envoyé.');
    return true;
  }
  if(i.isButton()&&(cid.startsWith(ID.paid)||cid.startsWith(ID.unpaid))){
    if(!isPatron(await memberOf(i))){await i.reply({ephemeral:true,content:'Seul Belva (Patron) peut marquer un remboursement.'});return true;}
    const paid=cid.startsWith(ID.paid);
    if(paid)await pool.query(`UPDATE belva_refunds SET status='paid',paid_by=$1,paid_at=now(),updated_at=now() WHERE id=$2`,[i.user.id,r.id]);
    else await pool.query(`UPDATE belva_refunds SET status='wallet_received',paid_by=NULL,paid_at=NULL,updated_at=now() WHERE id=$1`,[r.id]);
    const fresh=(await getRefund(pool,r.id))!;
    await i.update(listEntry(fresh,i.message.attachments.first()?.name));
    const ticket=fresh.ticket_channel_id?await i.guild!.channels.fetch(fresh.ticket_channel_id).catch(()=>null):null;
    if(paid&&ticket?.type===ChannelType.GuildText)await ticket.send({content:`💸 <@${fresh.discord_id}>, ton remboursement de **${fresh.amount_eur} €** a été envoyé ! Vérifie ton wallet. Tu peux fermer le ticket quand c’est bon.`,allowedMentions:{users:[fresh.discord_id]}});
    return true;
  }
  return true;
}

// Posts the ticket panel once; later restarts find it and leave it alone.
export async function ensureBelvaTicketPanel(client:Client){
  if(process.env.BELVA_TICKETS_ENABLED==='false')return;
  const channel=await client.channels.fetch(PANEL_CHANNEL).catch(()=>null);
  if(channel?.type!==ChannelType.GuildText)return;
  const recent=await channel.messages.fetch({limit:30});
  if(recent.some(m=>m.author.id===client.user!.id&&m.components.some(row=>JSON.stringify(row.toJSON()).includes(ID.panel))))return;
  await channel.send(belvaTicketPanel());
}
