import {
  ActionRowBuilder,ButtonBuilder,ButtonStyle,ChannelType,EmbedBuilder,FileUploadBuilder,LabelBuilder,ModalBuilder,
  OverwriteType,PermissionFlagsBits,StringSelectMenuBuilder,TextInputBuilder,TextInputStyle,
  type Attachment,type Client,type Guild,type GuildMember,type Interaction,type ModalSubmitInteraction,type TextChannel,
} from 'discord.js';
import {matchBetportalDeposit} from './belva-betportal-match.js';
import type {Pool} from 'pg';
import {LCN_TICKETS,brand,brands,grantCasinoRoles,refreshBrands,ticketCtx,type Brand,type TicketGuild,offerOn} from './belva-roles.js';
import {OFFERS,ensureOfferCards} from './belva-offers.js';
import {ensureInfoCards} from './belva-info.js';

// Belva's community server: ticket system for casino account checks and the "30 € offerts" deposit refunds.
const BELVA:TicketGuild={id:process.env.BELVA_GUILD_ID?.trim()||'1429525570965737668',brand:'Belva',staff:['1482854912059511006','1483165106140352632'],
  panel:'1483116856826007736',openCat:'1483151398005637352',closedCat:'1483151400161775656',staffCat:'1483112145154474005',listName:'📋︱liste-remboursements'};
// Serveur en cours (Belva par défaut, LeCasiNoze pendant une interaction sur son Discord).
const S=()=>ticketCtx.getStore()??BELVA;
const GUILD_ID=()=>S().id;
const STAFF=()=>S().staff;

type Casino=Brand;
export const casino=brand;

const KINDS={
  refund:{emoji:'💸',label:'Remboursement de dépôt',short:'remb',description:'Récupérer tes 30 € offerts après ton dépôt via notre lien.'},
  offer:{emoji:'🎁',label:'Dépôt offert (nouveau compte)',short:'offert',description:'20 € offerts pour ton 1er dépôt sur un casino où tu n’as pas de compte.'},
  verify:{emoji:'🔎',label:'Vérification de compte',short:'verif',description:'Faire vérifier ton compte sur un casino partenaire.'},
  help:{emoji:'🛟',label:'Aide / question',short:'aide',description:'Un problème ou une question pour le staff.'},
  partner:{emoji:'🤝',label:'Partenariat',short:'partenariat',description:'Proposition professionnelle ou prise de contact.'},
  vip:{emoji:'💎',label:'Demande VIP host',short:'vip',description:'Gros joueur : un accompagnement personnalisé.'},
  other:{emoji:'📝',label:'Autre demande',short:'autre',description:'Tout ce qui ne rentre pas dans les autres choix.'},
} as const;
type Kind=keyof typeof KINDS;
type MoneyKind='refund'|'offer';
const OFFER_EUR=20;
// Remboursement = montant déposé, plafonné au bonus du casino (30 €, 35 € Celsius) ; en dessous de 20 € le CPA n'est pas garanti.
const MIN_DEPOSIT=20;

const P='belva:t:';
const ID={
  panel:P+'new',casinoSelect:P+'casino:',modal:P+'modal:',approve:P+'approve:',reject:P+'reject:',close:P+'close',
  wallet:P+'wallet:',walletModal:P+'walletmodal:',paid:P+'paid:',unpaid:P+'unpaid:',verified:P+'verified:',quick:P+'quick:',
  verifySel:P+'vsel:',verifyDep:P+'vdep:',dest:P+'dest:',
};
const IN={user:'user',email:'email',proof:'proof',details:'details',network:'network',address:'address',walletProof:'walletproof',destUser:'destuser',deposit:'deposit'};

const clean=(s:string,max=200)=>s.replace(/[`\\*_~|<>@]/g,'').replace(/[\r\n]+/g,' ').trim().slice(0,max);
const code=(s:string)=>'`'+(clean(s,180)||'—')+'`';
const slug=(s:string)=>s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'membre';
const marker=(userId:string,status:'open'|'closed')=>`belva-ticket:${userId}:${status}`;
// Pseudo affiché sur le serveur ; s'il n'a aucune lettre (emojis seuls), le nom d'utilisateur.
const ticketName=(i:ModalSubmitInteraction)=>{const shown=slug((i.member&&'displayName' in i.member?i.member.displayName:null)??i.user.displayName);return shown==='membre'?slug(i.user.username):shown;};
// Police grasse des salons LeCasiNoze (〈🎫〉┃𝗧𝗜𝗖𝗞𝗘𝗧…) : lettres et chiffres en « sans-serif gras » Unicode.
export const boldCaps=(s:string)=>[...s.toUpperCase()].map(ch=>/[A-Z]/.test(ch)?String.fromCodePoint(0x1D5D4+ch.charCodeAt(0)-65):/[0-9]/.test(ch)?String.fromCodePoint(0x1D7EC+ch.charCodeAt(0)-48):ch).join('');
export const ticketChannelName=(emoji:string,base:string,lcn=false)=>lcn?`〈${emoji}〉┃${boldCaps(base.slice(0,45))}`:`${emoji}︱${base}`.slice(0,90);

let tablesReady=false;
export async function ensureTables(pool:Pool){
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
  // kind=offer : 20 € envoyés pour un 1er dépôt sur un nouveau compte. dest_casino : casino où l'argent est versé (adresse de dépôt).
  await pool.query(`ALTER TABLE belva_refunds ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'refund',
    ADD COLUMN IF NOT EXISTS dest_casino TEXT, ADD COLUMN IF NOT EXISTS dest_username TEXT, ADD COLUMN IF NOT EXISTS deposit_eur INT`);
  tablesReady=true;
}

type Refund={id:number;discord_id:string;discord_tag:string;casino:string;casino_username:string;casino_email:string;amount_eur:number;
  status:string;ticket_channel_id:string|null;wallet_network:string|null;wallet_address:string|null;list_message_id:string|null;
  approved_by:string|null;paid_by:string|null;paid_at:Date|null;kind:MoneyKind;dest_casino:string|null;dest_username:string|null};
const getRefund=async(pool:Pool,id:number)=>(await pool.query(`SELECT * FROM belva_refunds WHERE id=$1 AND guild_id=$2`,[id,GUILD_ID()])).rows[0] as Refund|undefined;

const isStaff=(m:GuildMember)=>STAFF().some(r=>m.roles.cache.has(r))||m.permissions.has(PermissionFlagsBits.Administrator);
const isPatron=(m:GuildMember)=>m.roles.cache.has(STAFF()[0]!)||m.guild.ownerId===m.id||m.permissions.has(PermissionFlagsBits.Administrator);

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
        ...(offerOn()?['🎁 **Dépôt offert** · pas encore de compte sur un de nos casinos ? Inscris-toi avec notre lien : on t’offre ton 1er dépôt de 20 €.']:[]),
        '💸 **Remboursement de dépôt** · tes 30 € offerts (35 € sur Celsius) après ton dépôt via notre lien, versés de préférence sur un casino où tu n’as pas encore de compte.',
        '🔎 **Vérification de compte** · faire vérifier ton compte sur un casino partenaire.',
        '🛟 **Aide**, 🤝 **Partenariat** ou 📝 **Autre** pour le reste.',
        '',
        '📸 Prépare une **capture de ton dépôt** pour un remboursement.',
      ].join('\n'))
      .setFooter({text:`${S().brand} • Support privé · 18+ · Joue de façon responsable`})],
    components:[new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(ID.panel)
      .setPlaceholder('Choisis le type de demande…')
      .addOptions((Object.keys(KINDS) as Kind[]).filter(k=>(k!=='offer'||offerOn())&&(k!=='vip'||!!S().lcn)).map(k=>({value:k,label:KINDS[k].label,emoji:KINDS[k].emoji,description:KINDS[k].description}))))],
  };
}

// Options du panneau de tickets pour le serveur en cours (VIP host chez LeCasiNoze, dépôt offert selon BELVA_OFFER).
export function ticketKindOptions(){
  return (Object.keys(KINDS) as Kind[]).filter(k=>(k!=='offer'||offerOn())&&(k!=='vip'||!!S().lcn))
    .map(k=>({value:k,label:KINDS[k].label,emoji:{name:KINDS[k].emoji},description:KINDS[k].description}));
}
export const TICKET_PANEL_ID=ID.panel;

export function casinoMenu(kind:MoneyKind|'verify'){
  const list=brands().filter(c=>kind==='verify'||c.bonus).slice(0,25);
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(ID.casinoSelect+kind)
    .setPlaceholder('Sur quel casino ?')
    .addOptions(list.map(c=>({value:c.id,label:c.name,emoji:c.emoji,description:kind==='refund'?`${c.bonus} € offerts`:kind==='offer'?`${OFFER_EUR} € offerts pour ton 1er dépôt`:'Vérifier mon compte'}))));
}

export function accountModal(kind:MoneyKind|'verify',c:Casino){
  const m=new ModalBuilder().setCustomId(`${ID.modal}${kind}:${c.id}`).setTitle(`${{refund:'Remboursement',offer:'Dépôt offert',verify:'Vérification'}[kind]} · ${c.name}`.slice(0,45));
  m.addLabelComponents(
    new LabelBuilder().setLabel(`Ton pseudo sur ${c.name}`).setTextInputComponent(new TextInputBuilder().setCustomId(IN.user).setStyle(TextInputStyle.Short).setMinLength(2).setMaxLength(60).setRequired(true)),
    new LabelBuilder().setLabel(`Ton adresse mail sur ${c.name}`).setTextInputComponent(new TextInputBuilder().setCustomId(IN.email).setStyle(TextInputStyle.Short).setMinLength(5).setMaxLength(120).setRequired(true)),
  );
  if(kind==='refund')m.addLabelComponents(new LabelBuilder().setLabel('Montant de ton dépôt (€)')
    .setDescription(`Minimum ${MIN_DEPOSIT} €. Remboursé jusqu’à ${c.bonus} €.`)
    .setTextInputComponent(new TextInputBuilder().setCustomId(IN.deposit).setStyle(TextInputStyle.Short).setMinLength(2).setMaxLength(6).setPlaceholder('20').setRequired(true)));
  // Betportal ne transmet pas le pseudo : la capture du dépôt (montant et heure) sert à retrouver le joueur.
  const depositProof=kind==='refund'||(kind==='verify'&&c.id==='betportal');
  m.addLabelComponents(
    new LabelBuilder().setLabel(depositProof?'Capture de ton dépôt':'Capture de ton compte (facultatif)')
      .setDescription(depositProof?'Montant, date et heure du dépôt visibles.':'Ta page profil par exemple.')
      .setFileUploadComponent(new FileUploadBuilder().setCustomId(IN.proof).setMinValues(depositProof?1:0).setMaxValues(3).setRequired(depositProof)),
  );
  return m;
}

export function freeModal(kind:Kind){
  return new ModalBuilder().setCustomId(`${ID.modal}${kind}:-`).setTitle(KINDS[kind].label).addLabelComponents(
    new LabelBuilder().setLabel('Explique ta demande').setTextInputComponent(new TextInputBuilder().setCustomId(IN.details).setStyle(TextInputStyle.Paragraph).setMinLength(5).setMaxLength(1500).setRequired(true)));
}

// Sans dest : ancien flux (wallet perso). Avec dest : l'argent part directement sur l'adresse de dépôt crypto du casino.
export function walletModal(refundId:number,dest?:Casino,askUser=false){
  const m=new ModalBuilder().setCustomId(ID.walletModal+refundId).setTitle(dest?`Recevoir sur ${dest.name}`.slice(0,45):'Mon wallet pour le remboursement');
  if(dest&&askUser)m.addLabelComponents(new LabelBuilder().setLabel(`Ton pseudo sur ${dest.name}`.slice(0,45)).setDescription('Le compte créé avec notre lien.')
    .setTextInputComponent(new TextInputBuilder().setCustomId(IN.destUser).setStyle(TextInputStyle.Short).setMinLength(2).setMaxLength(60).setRequired(true)));
  return m.addLabelComponents(
    new LabelBuilder().setLabel('Crypto et réseau').setDescription('Ex. USDT TRC20, USDT ERC20, BTC, SOL, LTC…')
      .setTextInputComponent(new TextInputBuilder().setCustomId(IN.network).setStyle(TextInputStyle.Short).setMinLength(2).setMaxLength(40).setRequired(true)),
    new LabelBuilder().setLabel(dest?`Adresse de dépôt ${dest.name}`.slice(0,45):'Adresse du wallet')
      .setDescription(dest?`Sur ${dest.name}, ouvre Dépôt, choisis la crypto et copie l’adresse.`.slice(0,100):'Copie-colle-la, ne la tape pas à la main.')
      .setTextInputComponent(new TextInputBuilder().setCustomId(IN.address).setStyle(TextInputStyle.Short).setMinLength(20).setMaxLength(130).setRequired(true)),
    new LabelBuilder().setLabel(dest?'Capture de l’écran de dépôt':'Capture de ton adresse de réception').setDescription(dest?'Avec l’adresse et ton pseudo visibles.':'Écran de réception de ton wallet, avec l’adresse visible.')
      .setFileUploadComponent(new FileUploadBuilder().setCustomId(IN.walletProof).setMinValues(1).setMaxValues(1).setRequired(true)));
}

// Règle Belva : le remboursement va sur un casino CPA où le membre n'a pas encore de compte (nouveau FTD) ; s'il les a tous, sur celui où il a joué.
export function destMenu(r:{id:number;casino:string},owned:Set<string>){
  const missing=brands().filter(b=>b.bonus&&b.id!==r.casino&&!owned.has(b.id));
  const options=missing.length
    ?missing.map(b=>({value:b.id,label:`${b.name} · nouveau compte`,emoji:b.emoji,description:'Inscris-toi d’abord avec notre lien.'}))
    :[{value:r.casino,label:casino(r.casino)?.name??r.casino,emoji:casino(r.casino)?.emoji,description:'Le casino où tu as joué.'}];
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(ID.dest+r.id)
    .setPlaceholder('Où veux-tu recevoir ton remboursement ?').addOptions(options.slice(0,25)));
}
const ownedCasinos=async(pool:Pool,userId:string)=>new Set(((await pool.query(`SELECT casino FROM belva_casino_accounts WHERE guild_id=$1 AND discord_id=$2`,[GUILD_ID(),userId])).rows as {casino:string}[]).map(x=>x.casino));

async function openChannel(i:ModalSubmitInteraction,kind:Kind,c?:Casino):Promise<TextChannel|null>{
  const guild=i.guild!;
  const all=await guild.channels.fetch();
  const existing=all.find(ch=>ch?.type===ChannelType.GuildText&&ch.topic?.includes(marker(i.user.id,'open')));
  if(existing){await i.editReply(`Tu as déjà un ticket ouvert : <#${existing.id}>. Termine-le avant d’en ouvrir un autre.`);return null;}
  const view=[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.AttachFiles,PermissionFlagsBits.EmbedLinks];
  return guild.channels.create({
    // Pseudo affiché sur le serveur (celui que le staff voit), pas le nom d'utilisateur Discord.
    name:ticketChannelName(KINDS[kind].emoji,`${KINDS[kind].short}${c?'-'+c.id:''}-${ticketName(i)}`,Boolean(S().lcn)),
    type:ChannelType.GuildText,parent:S().openCat,
    topic:`${marker(i.user.id,'open')};type:${kind}${c?';casino:'+c.id:''}`,
    permissionOverwrites:[
      {id:guild.roles.everyone.id,type:OverwriteType.Role,deny:[PermissionFlagsBits.ViewChannel]},
      {id:i.user.id,type:OverwriteType.Member,allow:view},
      ...STAFF().map(id=>({id,type:OverwriteType.Role,allow:[...view,PermissionFlagsBits.ManageMessages]})),
      {id:i.client.user.id,type:OverwriteType.Member,allow:[...view,PermissionFlagsBits.ManageChannels]},
    ],
    reason:`${KINDS[kind].label} ouvert par ${i.user.username}`,
  });
}

// Staff can tick several brands at once: members often send proofs for more than one casino in a single ticket.
export function verifyRows(userId:string){
  const select=(id:string,placeholder:string)=>new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder()
    .setCustomId(id+userId).setPlaceholder(placeholder).setMinValues(1).setMaxValues(Math.min(25,brands().length))
    .addOptions(brands().slice(0,25).map(b=>({value:b.id,label:b.name,emoji:b.emoji}))));
  return [select(ID.verifySel,'✅ Staff : vérifié sur… (plusieurs choix possibles)'),
    select(ID.verifyDep,'🍾 Staff : vérifié + dépôt sur…'),
    new ActionRowBuilder<ButtonBuilder>().addComponents(closeButton())];
}

const closeButton=()=>new ButtonBuilder().setCustomId(ID.close).setLabel('Fermer le ticket').setEmoji('🔒').setStyle(ButtonStyle.Secondary);
const staffPing=()=>STAFF().map(r=>`<@&${r}>`).join(' ');

async function submitTicket(i:ModalSubmitInteraction,pool:Pool|undefined,kind:Kind,casinoId:string){
  await i.deferReply({ephemeral:true});
  const c=casino(casinoId);
  if(kind==='refund'||kind==='offer'||kind==='verify'){
    const money=kind==='refund'||kind==='offer';
    if(!c||(money&&!c.bonus)){await i.editReply('Ce casino n’est plus proposé. Réessaie depuis le salon ticket.');return;}
    if(kind==='offer'&&!offerOpen()){await i.editReply(OFFER_SOON);return;}
    if(!pool){await i.editReply('Le système de tickets est momentanément indisponible. Réessaie dans quelques minutes.');return;}
    await ensureTables(pool);
    const user=clean(i.fields.getTextInputValue(IN.user),60);
    const email=i.fields.getTextInputValue(IN.email).trim().toLowerCase().slice(0,120);
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)){await i.editReply('Cette adresse mail ne semble pas valide. Réessaie.');return;}
    const proofs=[...(i.fields.getUploadedFiles(IN.proof)?.values()??[])];
    const deposit=kind==='refund'?Math.floor(Number(i.fields.getTextInputValue(IN.deposit).replace(',','.').replace(/[^0-9.]/g,''))):0;
    if(kind==='refund'&&!(deposit>=MIN_DEPOSIT&&deposit<=100000)){await i.editReply(`Indique le montant de ton dépôt en euros (minimum ${MIN_DEPOSIT} €).`);return;}
    let warning='';
    if(kind==='offer'&&(await ownedCasinos(pool,i.user.id)).has(c.id)){
      await i.editReply(`Tu as déjà un compte ${c.name} chez nous : le dépôt offert est réservé aux nouveaux comptes. Regarde nos autres casinos dans les offres !`);return;}
    if(money){
      const dup=(await pool.query(`SELECT id,discord_id,status FROM belva_refunds WHERE guild_id=$1 AND casino=$2 AND kind=$6 AND status<>'rejected'
        AND (discord_id=$3 OR lower(casino_username)=lower($4) OR casino_email=$5)`,[GUILD_ID(),c.id,i.user.id,user,email,kind])).rows as {id:number;discord_id:string;status:string}[];
      if(dup.some(d=>d.discord_id===i.user.id)){await i.editReply(`Tu as déjà une demande ${kind==='offer'?'de dépôt offert':'de remboursement'} ${c.name} (n°${dup.find(d=>d.discord_id===i.user.id)!.id}). Une seule par casino.`);return;}
      if(dup.length)warning=`⚠️ **Attention staff** : ce pseudo ou ce mail ${c.name} a déjà servi pour la demande n°${dup[0].id} de <@${dup[0].discord_id}>.`;
    }
    const channel=await openChannel(i,kind,c);if(!channel)return;
    await pool.query(`INSERT INTO belva_casino_accounts (guild_id,discord_id,discord_tag,casino,casino_username,casino_email) VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (guild_id,discord_id,casino) DO UPDATE SET casino_username=EXCLUDED.casino_username,casino_email=EXCLUDED.casino_email,discord_tag=EXCLUDED.discord_tag,updated_at=now()`,
      [GUILD_ID(),i.user.id,i.user.username,c.id,user,email]);
    let refundId=0;
    const amount=kind==='offer'?OFFER_EUR:Math.min(deposit,c.bonus!);
    if(money)refundId=(await pool.query(`INSERT INTO belva_refunds (guild_id,discord_id,discord_tag,casino,casino_username,casino_email,amount_eur,ticket_channel_id,kind,dest_casino,dest_username,deposit_eur)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,[GUILD_ID(),i.user.id,i.user.username,c.id,user,email,amount,channel.id,kind,
      kind==='offer'?c.id:null,kind==='offer'?user:null,kind==='refund'?deposit:OFFER_EUR])).rows[0].id;
    const files=await reupload(proofs,kind==='refund'?'depot':'compte');
    const embed=new EmbedBuilder().setColor(kind==='refund'?0xf1c40f:kind==='offer'?0x22c55e:0x4cc9f0)
      .setTitle(`${KINDS[kind].emoji} ${KINDS[kind].label} · ${c.emoji} ${c.name}${refundId?` · n°${refundId}`:''}`)
      .setDescription(kind==='refund'
        ?`Merci ! Le staff vérifie ton inscription et ton dépôt. Dès que c’est validé, tu choisiras ici sur quel casino recevoir tes **${amount} €**.${files.length?'':'\n\n⚠️ La capture n’a pas pu être récupérée : renvoie-la dans ce salon.'}`
        :kind==='offer'
        ?`Merci ! Le staff vérifie que ton compte ${c.name} a bien été créé avec notre lien. Dès que c’est validé, tu enverras ici ton adresse de dépôt ${c.name} et on y verse tes **${amount} €**.`
        :'Merci ! Le staff vérifie ton compte et te répond ici.')
      .addFields(
        {name:'Membre',value:`<@${i.user.id}>\n${code(i.user.username)}`,inline:true},
        {name:'Casino',value:`${c.emoji} ${c.name}`,inline:true},
        {name:`Pseudo ${c.name}`,value:code(user),inline:true},
        {name:'Mail',value:code(email),inline:true},
        ...(kind==='refund'?[{name:'Dépôt déclaré',value:`${deposit} €`,inline:true}]:[]),
        ...(refundId?[{name:kind==='refund'?'Remboursement':'Montant',value:`**${amount} €**`,inline:true}]:[]),
        ...(kind==='offer'?[{name:'Staff',value:'Valide seulement si ce pseudo apparaît dans le dashboard affilié.',inline:false}]:[]),
      ).setFooter({text:`${S().brand} • Support privé`}).setTimestamp();
    const components=money
      ?[new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(ID.approve+refundId).setLabel('Valider').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(ID.reject+refundId).setLabel('Refuser').setEmoji('❌').setStyle(ButtonStyle.Danger),closeButton())]
      :verifyRows(i.user.id);
    await channel.send({content:`<@${i.user.id}> ${staffPing()}${warning?'\n'+warning:''}`,embeds:[embed],files,
      components,allowedMentions:{users:[i.user.id],roles:STAFF()}});
    if(c.id==='betportal'&&kind!=='offer'&&files[0]&&pool){
      const ext=files[0].name.split('.').pop()?.toLowerCase();
      void matchBetportalDeposit(i.client,pool,{discordId:i.user.id,ticketChannelId:channel.id,image:files[0].attachment,
        mediaType:ext==='jpg'||ext==='jpeg'?'image/jpeg':ext==='webp'?'image/webp':'image/png',declared:kind==='refund'?deposit:undefined})
        .catch(e=>console.error('[nozebot] rapprochement Betportal',e));
    }
    await i.editReply(`✅ Ton ticket est ouvert : <#${channel.id}>.`);
    return;
  }
  const channel=await openChannel(i,kind);if(!channel)return;
  await channel.send({content:`<@${i.user.id}> ${staffPing()}`,allowedMentions:{users:[i.user.id],roles:STAFF()},
    embeds:[new EmbedBuilder().setColor(0x4cc9f0).setTitle(`${KINDS[kind].emoji} ${KINDS[kind].label}`)
      .setDescription(i.fields.getTextInputValue(IN.details).slice(0,1500)).addFields({name:'Membre',value:`<@${i.user.id}>`,inline:true})
      .setFooter({text:`${S().brand} • Le staff te répond ici`}).setTimestamp()],
    components:[new ActionRowBuilder<ButtonBuilder>().addComponents(closeButton())]});
  await i.editReply(`✅ Ton ticket est ouvert : <#${channel.id}>.`);
}

async function listChannel(guild:Guild):Promise<TextChannel>{
  const all=await guild.channels.fetch();
  const found=all.find(ch=>ch?.type===ChannelType.GuildText&&ch.name===S().listName);
  if(found)return found as TextChannel;
  return guild.channels.create({name:S().listName,type:ChannelType.GuildText,parent:S().staffCat,
    topic:'Remboursements à faire : pseudo, casino, wallet. Clique « Remboursé » une fois le paiement envoyé.',
    permissionOverwrites:[
      {id:guild.roles.everyone.id,type:OverwriteType.Role,deny:[PermissionFlagsBits.ViewChannel]},
      ...STAFF().map(id=>({id,type:OverwriteType.Role,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.ReadMessageHistory]})),
      {id:guild.client.user.id,type:OverwriteType.Member,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.AttachFiles,PermissionFlagsBits.EmbedLinks]},
    ],reason:`Liste des remboursements ${S().brand}`});
}

function listEntry(r:Refund,image?:string){
  const c=casino(r.casino);const paid=r.status==='paid';const offer=r.kind==='offer';
  const d=r.dest_casino?casino(r.dest_casino):undefined;const fresh=!!r.dest_casino&&(offer||r.dest_casino!==r.casino);
  const embed=new EmbedBuilder().setColor(paid?0x2ecc71:offer?0x22c55e:0xf1c40f)
    .setTitle(`${paid?'✅ Envoyé':offer?'🎁 Dépôt offert à envoyer':'⏳ À rembourser'} · n°${r.id} · ${c?.emoji??''} ${c?.name??r.casino} · ${r.amount_eur} €`)
    .addFields(
      {name:'Membre',value:`<@${r.discord_id}>\n${code(r.discord_tag)}`,inline:true},
      {name:`Pseudo ${c?.name??r.casino}`,value:code(r.casino_username),inline:true},
      {name:'Mail',value:code(r.casino_email),inline:true},
      ...(r.dest_casino?[{name:'Verser sur',value:`${d?.emoji??''} **${d?.name??r.dest_casino}**${fresh?' · nouveau compte (vérifie-le dans le dashboard)':''}${r.dest_username?'\n'+code(r.dest_username):''}`,inline:false}]:[]),
      {name:'Réseau',value:code(r.wallet_network??''),inline:true},
      {name:r.dest_casino?'Adresse de dépôt':'Wallet',value:'```'+clean(r.wallet_address??'',150)+'```',inline:false},
      ...(r.ticket_channel_id?[{name:'Ticket',value:`<#${r.ticket_channel_id}>`,inline:true}]:[]),
      ...(paid?[{name:'Remboursé par',value:`<@${r.paid_by}> · <t:${Math.floor(new Date(r.paid_at!).getTime()/1000)}:f>`,inline:true}]:[]),
    ).setTimestamp();
  if(image)embed.setImage(`attachment://${image}`);
  const row=new ActionRowBuilder<ButtonBuilder>().addComponents(paid
    ?new ButtonBuilder().setCustomId(ID.unpaid+r.id).setLabel('Annuler (pas encore payé)').setEmoji('↩️').setStyle(ButtonStyle.Secondary)
    :new ButtonBuilder().setCustomId(ID.paid+r.id).setLabel(offer?'Envoyé':'Remboursé').setEmoji('✅').setStyle(ButtonStyle.Success));
  return {embeds:[embed],components:[row]};
}

async function memberOf(i:Interaction){return i.guild!.members.fetch(i.user.id);}

// Anciens boutons « Dépôt offert » encore affichés quelque part : réponse polie tant que l'offre est retirée.
const offerOpen=offerOn;
const OFFER_SOON='🎁 Le **dépôt offert** n’est pas disponible pour le moment. Le remboursement de dépôt, lui, est ouvert.';

export async function handleBelvaTickets(interaction:Interaction,pool?:Pool):Promise<boolean>{
  const cid='customId' in interaction?String(interaction.customId):'';
  if(!cid.startsWith(P))return false;
  const ctx=interaction.guildId===BELVA.id?BELVA:interaction.guildId===LCN_TICKETS.id?LCN_TICKETS:null;
  if(!interaction.guild||!ctx)return true;
  return ticketCtx.run(ctx,()=>ticketsIn(interaction,pool,cid));
}

// Catégorie des tickets fermés (créée au besoin chez LeCasiNoze).
async function closedCategory(guild:Guild){
  if(S().closedCat)return S().closedCat!;
  const name='〈🗄️〉┃𝗧𝗜𝗖𝗞𝗘𝗧𝗦-𝗙𝗘𝗥𝗠𝗘́𝗦';
  const found=(await guild.channels.fetch()).find(c=>c?.type===ChannelType.GuildCategory&&c.name===name);
  return (found??await guild.channels.create({name,type:ChannelType.GuildCategory,permissionOverwrites:[{id:guild.id,deny:[PermissionFlagsBits.ViewChannel]},
    ...STAFF().map(id=>({id,allow:[PermissionFlagsBits.ViewChannel]}))]}).catch(()=>null))?.id??null;
}

async function ticketsIn(interaction:Interaction,pool:Pool|undefined,cid:string):Promise<boolean>{
  const i=interaction;
  if(!S().lcn)await refreshBrands(i.guild!).catch(e=>console.error('[nozebot] casinos Belva',e));

  if(i.isStringSelectMenu()&&cid===ID.panel){
    const kind=i.values[0] as Kind;
    if(kind==='offer'&&!offerOpen()){await i.reply({ephemeral:true,content:OFFER_SOON});return true;}
    if(kind==='refund'||kind==='offer'||kind==='verify'){
      await i.reply({ephemeral:true,content:{refund:'💸 Pour quel casino veux-tu ton remboursement ?',offer:'🎁 Sur quel casino viens-tu de créer ton compte avec notre lien ?',verify:'🔎 Quel compte veux-tu faire vérifier ?'}[kind],components:[casinoMenu(kind)]});
    }else if(KINDS[kind])await i.showModal(freeModal(kind));
    return true;
  }
  if(i.isStringSelectMenu()&&cid.startsWith(ID.casinoSelect)){
    const kind=cid.slice(ID.casinoSelect.length) as MoneyKind|'verify';const c=casino(i.values[0]);
    if(kind==='offer'&&!offerOpen()){await i.reply({ephemeral:true,content:OFFER_SOON});return true;}
    if(c)await i.showModal(accountModal(kind,c));
    return true;
  }
  // Boutons des cartes d'offres (chaque action existe deux fois sur la carte : dans sa section et en bas).
  const quick=/^belva:t:(quick|qoffer|qrefund)2?:([a-z0-9]+)$/.exec(cid);
  if(i.isButton()&&quick){
    const c=casino(quick[2]);const kind=({quick:'verify',qoffer:'offer',qrefund:'refund'} as const)[quick[1] as 'quick'|'qoffer'|'qrefund'];
    if(!c||(kind!=='verify'&&!c.bonus)){await i.reply({ephemeral:true,content:'Cette offre n’est plus disponible.'});return true;}
    if(kind==='offer'&&!offerOpen()){await i.reply({ephemeral:true,content:OFFER_SOON});return true;}
    await i.showModal(accountModal(kind,c));
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
    const closed=await closedCategory(i.guild!);if(closed)await channel.setParent(closed,{lockPermissions:false}).catch(()=>undefined);
    await channel.setTopic((channel.topic||'').replace(marker(owner,'open'),marker(owner,'closed')));
    await channel.send({embeds:[new EmbedBuilder().setColor(0x94a3b8).setDescription(`🔒 Ticket fermé par <@${i.user.id}>.`).setTimestamp()],allowedMentions:{parse:[]}});
    await i.editReply('Ticket fermé et archivé pour le staff.');
    return true;
  }
  const verifyFrom=i.isButton()&&cid.startsWith(ID.verified)?'button':i.isStringSelectMenu()&&(cid.startsWith(ID.verifySel)||cid.startsWith(ID.verifyDep))?'select':null;
  if(verifyFrom&&(i.isButton()||i.isStringSelectMenu())){
    if(!isStaff(await memberOf(i))){await i.reply({ephemeral:true,content:'Réservé au staff.'});return true;}
    if(!pool)throw Error('pool absent');
    await ensureTables(pool);
    let userId:string,ids:string[],deposited:boolean;
    if(i.isButton()){const [casinoId,uid,flag]=cid.slice(ID.verified.length).split(':');userId=uid;ids=[casinoId];deposited=flag==='d';}
    else{deposited=cid.startsWith(ID.verifyDep);userId=cid.slice((deposited?ID.verifyDep:ID.verifySel).length);ids=i.values;}
    const list=ids.map(id=>casino(id)).filter((b):b is Casino=>!!b);
    const target=await i.guild!.members.fetch(userId).catch(()=>null);
    for(const b of list){
      await pool.query(`INSERT INTO belva_casino_accounts (guild_id,discord_id,discord_tag,casino,casino_username,casino_email,verified_by,verified_at) VALUES ($1,$2,$3,$4,'','',$5,now())
        ON CONFLICT (guild_id,discord_id,casino) DO UPDATE SET verified_by=EXCLUDED.verified_by,verified_at=now(),updated_at=now()`,[GUILD_ID(),userId,target?.user.username??userId,b.id,i.user.id]);
      if(target)await grantCasinoRoles(target,b.id,deposited,`Compte ${b.id} vérifié par ${i.user.username}`).catch(e=>console.error('[nozebot] rôles Belva',e));
    }
    // Old single-brand buttons are swapped for the multi-brand selects so staff can add more brands later.
    await i.update({components:verifyRows(userId)});
    await i.followUp({content:`✅ <@${userId}>, compte${list.length>1?'s':''} vérifié${list.length>1?'s':''} par <@${i.user.id}> : ${list.map(b=>`${b.emoji} **${b.name}**`).join(', ')}${target?`\nTu as maintenant ${S().lcn?[...list.map(b=>`**${b.emoji} ${b.name}**`),'**✅ Joueur Vérifié**',...(deposited?['**🍾 Table VIP**']:[])].join(', '):`${list.map(b=>`<@&${b.role}>`).join(' ')}${deposited?' et <@&1571169943981133894>':''}`} !`:''}`,allowedMentions:{users:[userId]}});
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
    const offer=r.kind==='offer';
    if(ok){
      const target=await i.guild!.members.fetch(r.discord_id).catch(()=>null);
      if(target)await grantCasinoRoles(target,r.casino,!offer,`${offer?'Compte':'Dépôt'} ${r.casino} validé par ${i.user.username}`).catch(e=>console.error('[nozebot] rôles Belva',e));
    }
    if(ok&&offer)await i.followUp({content:`✅ <@${r.discord_id}>, ton compte est **validé** par <@${i.user.id}> !\nClique ci-dessous pour envoyer ton **adresse de dépôt ${casino(r.casino)?.name??r.casino}** avec une capture : Belva y verse tes **${r.amount_eur} €**.`,
      allowedMentions:{users:[r.discord_id]},components:[new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(ID.wallet+r.id).setLabel('Envoyer mon adresse de dépôt').setEmoji('💳').setStyle(ButtonStyle.Primary))]});
    else if(ok)await i.followUp({content:`✅ <@${r.discord_id}>, ta demande est **validée** par <@${i.user.id}> !\nChoisis où recevoir tes **${r.amount_eur} €** : on les verse directement en dépôt sur un casino où tu n’as pas encore de compte (inscris-toi d’abord avec notre lien, dans les offres). Si tu as déjà tous nos casinos, ils vont sur celui où tu as joué.`,
      allowedMentions:{users:[r.discord_id]},components:[destMenu(r,await ownedCasinos(pool,r.discord_id))]});
    else await i.followUp({content:`❌ <@${r.discord_id}>, ta demande ${offer?'de dépôt offert':'de remboursement'} est **refusée** par <@${i.user.id}>. Le staff t’explique pourquoi ici.`,allowedMentions:{users:[r.discord_id]}});
    return true;
  }
  if(i.isButton()&&cid.startsWith(ID.wallet)){
    if(i.user.id!==r.discord_id){await i.reply({ephemeral:true,content:'Seul le membre qui a ouvert la demande peut envoyer son wallet.'});return true;}
    if(r.status==='paid'){await i.reply({ephemeral:true,content:'Ce remboursement est déjà envoyé ✅'});return true;}
    if(r.status!=='approved'&&r.status!=='wallet_received'){await i.reply({ephemeral:true,content:'Ta demande doit d’abord être validée par le staff.'});return true;}
    if(r.kind==='refund'&&!r.dest_casino){await i.reply({ephemeral:true,content:'Choisis d’abord où recevoir ton remboursement :',components:[destMenu(r,await ownedCasinos(pool,r.discord_id))]});return true;}
    await i.showModal(walletModal(r.id,r.dest_casino?casino(r.dest_casino):undefined));
    return true;
  }
  if(i.isStringSelectMenu()&&cid.startsWith(ID.dest)){
    if(i.user.id!==r.discord_id){await i.reply({ephemeral:true,content:'Seul le membre qui a ouvert la demande peut choisir.'});return true;}
    if(r.status!=='approved'&&r.status!=='wallet_received'){await i.reply({ephemeral:true,content:'Cette demande ne peut plus être modifiée.'});return true;}
    const allowed=destMenu(r,await ownedCasinos(pool,r.discord_id)).toJSON().components[0].options.map(o=>o.value);
    const d=casino(i.values[0]);
    if(!d||!allowed.includes(d.id)){await i.reply({ephemeral:true,content:'Ce casino n’est plus disponible, rouvre le menu.'});return true;}
    await pool.query(`UPDATE belva_refunds SET dest_casino=$1,dest_username=NULL,updated_at=now() WHERE id=$2`,[d.id,r.id]);
    await i.showModal(walletModal(r.id,d,d.id!==r.casino));
    return true;
  }
  if(i.isModalSubmit()&&cid.startsWith(ID.walletModal)){
    await i.deferReply({ephemeral:true});
    if(i.user.id!==r.discord_id||(r.status!=='approved'&&r.status!=='wallet_received')){await i.editReply('Cette demande ne peut plus recevoir de wallet.');return true;}
    const network=clean(i.fields.getTextInputValue(IN.network),40);
    const address=i.fields.getTextInputValue(IN.address).replace(/\s+/g,'');
    if(!/^[A-Za-z0-9:_.-]{20,130}$/.test(address)){await i.editReply('Cette adresse contient des caractères inattendus. Copie-colle exactement l’adresse de réception.');return true;}
    const [proof]=await reupload(i.fields.getUploadedFiles(IN.walletProof)?.values()??[],`wallet-${r.id}`);
    let destUser:string|null=null;try{destUser=clean(i.fields.getTextInputValue(IN.destUser),60)||null;}catch{/* champ absent : pas de nouveau compte */}
    await pool.query(`UPDATE belva_refunds SET wallet_network=$1,wallet_address=$2,status='wallet_received',dest_username=COALESCE($4,dest_username),updated_at=now() WHERE id=$3`,[network,address,r.id,destUser]);
    if(destUser&&r.dest_casino)await pool.query(`INSERT INTO belva_casino_accounts (guild_id,discord_id,discord_tag,casino,casino_username,casino_email) VALUES ($1,$2,$3,$4,$5,'')
      ON CONFLICT (guild_id,discord_id,casino) DO UPDATE SET casino_username=EXCLUDED.casino_username,updated_at=now()`,[GUILD_ID(),r.discord_id,r.discord_tag,r.dest_casino,destUser]);
    const fresh=(await getRefund(pool,r.id))!;
    const list=await listChannel(i.guild!);
    const entry={...listEntry(fresh,proof?.name),files:proof?[proof]:[],allowedMentions:{parse:[] as never[]}};
    const old=fresh.list_message_id?await list.messages.fetch(fresh.list_message_id).catch(()=>null):null;
    const msg=old?await old.edit({...entry,attachments:[]}):await list.send(entry);
    if(!old)await pool.query(`UPDATE belva_refunds SET list_message_id=$1 WHERE id=$2`,[msg.id,r.id]);
    const ticket=fresh.ticket_channel_id?await i.guild!.channels.fetch(fresh.ticket_channel_id).catch(()=>null):null;
    const dn=fresh.dest_casino?casino(fresh.dest_casino)?.name??fresh.dest_casino:null;
    if(ticket?.type===ChannelType.GuildText)await ticket.send({content:`💳 ${dn?`Adresse de dépôt ${dn}`:'Wallet'} reçue (${code(network)}) : ${code(address)}\nOn t’envoie tes **${fresh.amount_eur} €** dès que possible. Tu seras prévenu ici.`,files:proof?[proof]:[],allowedMentions:{parse:[]}});
    await i.editReply('✅ Wallet enregistré ! Tu seras prévenu dans ton ticket quand le remboursement sera envoyé.');
    return true;
  }
  if(i.isButton()&&(cid.startsWith(ID.paid)||cid.startsWith(ID.unpaid))){
    if(!isPatron(await memberOf(i))){await i.reply({ephemeral:true,content:'Seul un Patron peut marquer un paiement.'});return true;}
    const paid=cid.startsWith(ID.paid);
    if(paid)await pool.query(`UPDATE belva_refunds SET status='paid',paid_by=$1,paid_at=now(),updated_at=now() WHERE id=$2`,[i.user.id,r.id]);
    else await pool.query(`UPDATE belva_refunds SET status='wallet_received',paid_by=NULL,paid_at=NULL,updated_at=now() WHERE id=$1`,[r.id]);
    const fresh=(await getRefund(pool,r.id))!;
    await i.update(listEntry(fresh,i.message.attachments.first()?.name));
    const ticket=fresh.ticket_channel_id?await i.guild!.channels.fetch(fresh.ticket_channel_id).catch(()=>null):null;
    // Payer sur un nouveau compte suppose que le staff l'a vu dans le dashboard affilié : on le marque vérifié avec son rôle casino.
    if(paid&&fresh.dest_casino&&(fresh.kind==='offer'||fresh.dest_casino!==fresh.casino)){
      await pool.query(`UPDATE belva_casino_accounts SET verified_by=$1,verified_at=now(),updated_at=now() WHERE guild_id=$2 AND discord_id=$3 AND casino=$4`,[i.user.id,GUILD_ID(),fresh.discord_id,fresh.dest_casino]);
      const target=await i.guild!.members.fetch(fresh.discord_id).catch(()=>null);
      if(target)await grantCasinoRoles(target,fresh.dest_casino,true,`Dépôt ${fresh.dest_casino} envoyé par ${i.user.username}`).catch(e=>console.error('[nozebot] rôles Belva',e));
    }
    const dn=fresh.dest_casino?casino(fresh.dest_casino)?.name??fresh.dest_casino:null;
    if(paid&&ticket?.type===ChannelType.GuildText)await ticket.send({content:`💸 <@${fresh.discord_id}>, tes **${fresh.amount_eur} €** ont été envoyés${dn?` sur ton adresse de dépôt **${dn}**`:''} ! ${dn?'Ils arrivent en quelques minutes.':'Vérifie ton wallet.'} Tu peux fermer le ticket quand c’est bon. Joue de façon responsable.`,allowedMentions:{users:[fresh.discord_id]}});
    return true;
  }
  return true;
}

// Posts the ticket panel once; later restarts find it and leave it alone.
export function offerVerifyMessage(c:Casino){
  return {embeds:[new EmbedBuilder().setColor(0x60a5fa).setTitle(`✅ Inscrit sur ${c.name} ? Vérifie ton compte`)
      .setDescription([`Tu t’es inscrit sur **${c.name}** avec notre lien ? Clique sur le bouton, donne ton pseudo et ton mail ${c.name} : un ticket s’ouvre et le staff vérifie.`,
        '',`Une fois vérifié, tu obtiens le rôle **${c.emoji} ${c.name}** et tu passes **🃏 Membre du Club** : tu peux participer aux giveaways réservés aux membres.`].join('\n'))
      .setFooter({text:'18+ · Joue de façon responsable'})],
    components:[new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ID.quick+c.id).setLabel('Me vérifier').setEmoji('✅').setStyle(ButtonStyle.Success))]};
}

// Every offer channel (except API-verified brands, which have their own panel) gets a one-click verify button.
const checkedOfferChannels=new Set<string>();
async function ensureOfferButtons(client:Client){
  const guild=await client.guilds.fetch(GUILD_ID()).catch(()=>null);if(!guild)return;
  for(const c of await refreshBrands(guild)){
    if(c.api||!c.channelId||OFFERS[c.id]||checkedOfferChannels.has(c.channelId))continue;
    const channel=await client.channels.fetch(c.channelId).catch(()=>null);
    if(channel?.type!==ChannelType.GuildText)continue;
    const recent=await channel.messages.fetch({limit:30});
    if(!recent.some(m=>m.author.id===client.user!.id&&JSON.stringify(m.components.map(r=>r.toJSON())).includes(ID.quick)))await channel.send(offerVerifyMessage(c));
    checkedOfferChannels.add(c.channelId);
  }
}

export async function ensureBelvaTicketPanel(client:Client,pool?:Pool){
  if(process.env.BELVA_TICKETS_ENABLED==='false')return;
  await ensureOfferCards(client).catch(e=>console.error('[nozebot] cartes offres Belva',e));
  await ensureInfoCards(client,pool).catch(e=>console.error('[nozebot] cartes info Belva',e));
  await ensureOfferButtons(client).catch(e=>console.error('[nozebot] boutons offres Belva',e));
  setInterval(()=>void ensureOfferButtons(client).catch(e=>console.error('[nozebot] boutons offres Belva',e)),10*60_000).unref();
  const channel=await client.channels.fetch(BELVA.panel).catch(()=>null);
  if(channel?.type!==ChannelType.GuildText)return;
  const recent=await channel.messages.fetch({limit:30});
  // Panneau déjà posté : on le remet à jour pour qu'il propose toujours les types de demande actuels.
  const old=recent.find(m=>m.author.id===client.user!.id&&m.components.some(row=>JSON.stringify(row.toJSON()).includes(ID.panel)));
  if(old){await old.edit(belvaTicketPanel());return;}
  await channel.send(belvaTicketPanel());
}
