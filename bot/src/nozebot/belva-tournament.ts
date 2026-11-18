import {
  ButtonBuilder,ButtonStyle,ChannelType,LabelBuilder,MessageFlags,ModalBuilder,TextInputBuilder,TextInputStyle,PermissionFlagsBits,SlashCommandBuilder,StringSelectMenuBuilder,type Client,type Guild,type Interaction,type TextChannel,
} from 'discord.js';
import type {Pool} from 'pg';
import {isApproved} from './belva-approval.js';
import {seasonCard,type SeasonRow} from './belva-progress-designs.js';
import {belvaTournamentState,type LunaLiveApiConfig} from './lunalive-api.js';
import {linkPrompt} from './belva-link.js';
import {LINK_BUTTON} from './belva-info.js';
import * as L from './belva-layout.js';
import {BELVA_GUILD,EVENT_GUILDS,LCN_GUILD,LINK_SLUGS,isEventGuild,lcnChannel,mirror} from './belva-guilds.js';

// Tournoi du samedi de Belva : chaque joueur réserve UNE machine (jamais deux fois la même dans un tournoi)
// et choisit son bonus. Tous les bonus s'achètent au même prix ; la mise découle du multiplicateur d'achat.
const GUILD_ID=()=>process.env.BELVA_GUILD_ID?.trim()||'1429525570965737668';
const EVENTS_CATEGORY='1481924757380272289';
const REG_CHANNEL='⚔️︱tournoi',SEASON_CHANNEL='🏅︱classements';
export const BUY_CENTS=()=>Number(process.env.BELVA_TOURNAMENT_BUY_CENTS)||12_000;
const P='belva:tn:';
const ACCENT=0x4C7DFF;
const T=(content:string)=>({type:10,content});
const SEP=(spacing=1,divider=true)=>({type:14,divider,spacing});
const eur=(cents:number)=>(cents/100).toLocaleString('fr-FR',{minimumFractionDigits:cents%100?2:0,maximumFractionDigits:2})+' €';
const key=(s:string)=>s.normalize('NFKC').replace(/’/g,'\'').replace(/[–—]/g,'-').replace(/\s+/g,' ').trim().toLowerCase();

export type Slot={name:string;key:string;provider:string|null;image:string|null};
export type BonusOption={id:string;label:string;multiplier:number|null;betCents:number|null;costCents:number};

let ready:Promise<unknown>|null=null;
function schema(pool:Pool){
  ready??=pool.query(`CREATE TABLE IF NOT EXISTS belva_tournaments(id serial PRIMARY KEY,title text NOT NULL,status text NOT NULL DEFAULT 'open',
    buy_cents int NOT NULL,channel_id text,message_id text,created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT NOW(),finished_at timestamptz);
    CREATE TABLE IF NOT EXISTS belva_tournament_entries(tournament_id int NOT NULL REFERENCES belva_tournaments(id) ON DELETE CASCADE,discord_id text NOT NULL,
    display_name text NOT NULL,slot_key text NOT NULL,slot_name text NOT NULL,provider text,image_url text,bonus_id text NOT NULL,bonus_label text NOT NULL,
    multiplier numeric,bet_cents int,cost_cents int NOT NULL,place int,created_at timestamptz NOT NULL DEFAULT NOW(),
    PRIMARY KEY(tournament_id,discord_id),UNIQUE(tournament_id,slot_key));
    ALTER TABLE belva_tournaments ADD COLUMN IF NOT EXISTS draw jsonb,ADD COLUMN IF NOT EXISTS legs jsonb NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS draw_at timestamptz,ADD COLUMN IF NOT EXISTS drawn_at timestamptz,ADD COLUMN IF NOT EXISTS champion text,ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 0;
    ALTER TABLE belva_tournament_entries ADD COLUMN IF NOT EXISTS wins int;
    CREATE TABLE IF NOT EXISTS belva_tournament_pings(tournament_id int NOT NULL,discord_id text NOT NULL,PRIMARY KEY(tournament_id,discord_id));
    CREATE TABLE IF NOT EXISTS belva_seasons(month text PRIMARY KEY,label text NOT NULL,channel_id text NOT NULL,message_id text NOT NULL,final boolean NOT NULL DEFAULT false)`).catch(e=>{ready=null;throw e;});
  return ready;
}

export async function searchSlots(pool:Pool,q:string,limit=20):Promise<Slot[]>{
  const k=key(q);if(k.length<2)return [];
  const rows=(await pool.query(`SELECT name,name_key,provider_norm,image_url FROM slots_catalog WHERE name_key ILIKE $1
    ORDER BY (name_key=$2) DESC,EXISTS(SELECT 1 FROM automod_bonus_catalog b WHERE b.slot_key=name_key) DESC,(name_key LIKE $2||'%') DESC,length(name_key),name LIMIT $3`,[`%${k}%`,k,limit])).rows;
  return rows.map(r=>({name:r.name,key:r.name_key,provider:r.provider_norm,image:r.image_url}));
}

// Mise arrondie aux 10 centimes pour viser le prix d'achat commun ; le coût réel affiché suit cette mise.
export function priceOption(id:string,label:string,multiplier:number|null,buyCents:number):BonusOption{
  if(!multiplier)return {id,label,multiplier:null,betCents:null,costCents:buyCents};
  const bet=Math.max(10,Math.round(buyCents/multiplier/10)*10);
  return {id,label,multiplier,betCents:bet,costCents:Math.round(bet*multiplier)};
}
const pretty=(label:string)=>label.toLowerCase().replace(/(^|[\s·-])\S/g,c=>c.toUpperCase());

export async function bonusOptions(pool:Pool,slot:Slot,buyCents=BUY_CENTS()):Promise<BonusOption[]>{
  const menu=(await pool.query(`SELECT offers FROM automod_bonus_catalog WHERE slot_key=$1 ORDER BY observed_at DESC LIMIT 1`,[slot.key])).rows[0]?.offers as {id:string;label:string;costCents:number;baseStakeCents:number}[]|undefined;
  const offers=(menu??[]).filter(o=>!/__left$/.test(o.id)&&o.baseStakeCents>0);
  if(offers.length)return offers.map(o=>priceOption(o.id,pretty(o.label.replace(/^BUY\s*·\s*/i,'')),Math.round(o.costCents/o.baseStakeCents),buyCents));
  // Menu inconnu : Hacksaw a presque toujours un bonus classique et un bonus « bounty » environ deux fois plus cher.
  if(/hacksaw/i.test(slot.provider??''))return [priceOption('nobounty','Bonus classique (No Bounty)',null,buyCents),priceOption('bounty','Bonus Bounty',null,buyCents)];
  return [priceOption('classic','Bonus classique',null,buyCents)];
}
const optionText=(o:BonusOption)=>o.multiplier?`${o.multiplier}x · mise ${eur(o.betCents!)} · achat ${eur(o.costCents)}`:`achat ${eur(o.costCents)} · mise calculée en live`;

const COMMANDS=[
  new SlashCommandBuilder().setName('tournoi').setDescription('S’inscrire au tournoi du samedi avec ta machine')
    .addStringOption(o=>o.setName('machine').setDescription('Commence à taper le nom de la slot').setRequired(true).setAutocomplete(true)),
  new SlashCommandBuilder().setName('tournoi-staff').setDescription('Gérer le tournoi (staff)').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(s=>s.setName('ouvrir').setDescription('Ouvrir les inscriptions').addStringOption(o=>o.setName('titre').setDescription('Ex. Tournoi du samedi 6 décembre').setRequired(true))
      .addIntegerOption(o=>o.setName('prix').setDescription('Prix d’achat par bonus en euros (120 par défaut)').setMinValue(10).setMaxValue(1000)))
    .addSubcommand(s=>s.setName('prix').setDescription('Changer le prix d’achat par bonus').addIntegerOption(o=>o.setName('euros').setDescription('Prix en euros').setRequired(true).setMinValue(10).setMaxValue(1000)))
    .addSubcommand(s=>s.setName('retirer').setDescription('Retirer un inscrit').addUserOption(o=>o.setName('joueur').setDescription('Le joueur à retirer').setRequired(true))),
];
export async function registerTournamentCommands(client:Client){
  for(const id of EVENT_GUILDS()){const guild=await client.guilds.fetch(id).catch(()=>null);if(!guild)continue;
    for(const c of COMMANDS)await guild.commands.create(c.toJSON()).catch(()=>undefined);}
}
// Le tournoi est commun aux deux Discord : la carte est recopiée dans le salon tournoi de LeCasiNoze.
const lcnTournament=(client:Client)=>lcnChannel(client,'⚔️','tournoi','Le tournoi du samedi, commun avec le Discord de Belva : inscris-toi ici.');

type Tournament={id:number;title:string;status:'open'|'closed'|'done';buy_cents:number;channel_id:string|null;message_id:string|null};
type Entry={discord_id:string;display_name:string;slot_name:string;slot_key:string;provider:string|null;image_url:string|null;bonus_label:string;multiplier:string|null;bet_cents:number|null;cost_cents:number;place:number|null};
const current=async(pool:Pool)=>(await pool.query(`SELECT * FROM belva_tournaments WHERE status IN ('open','closed','live') ORDER BY id DESC LIMIT 1`)).rows[0] as Tournament|undefined;
const entriesOf=async(pool:Pool,id:number)=>(await pool.query(`SELECT * FROM belva_tournament_entries WHERE tournament_id=$1 ORDER BY COALESCE(place,999),created_at`,[id])).rows as Entry[];

// Carte des inscriptions : une ligne illustrée par machine (Discord limite un message à 40 composants).
export function registrationCard(t:{title:string;status:string;buy_cents:number},entries:Entry[]){
  const head=t.status==='open'?`🟢 **Inscriptions ouvertes**`
    :t.status==='closed'?'🔒 **Inscriptions fermées** · bonne chance à tous !':'🏁 **Tournoi terminé** · résultats ci-dessous';
  const line=(e:Entry,i:number)=>`**${e.place?(e.place===1?'🥇':e.place===2?'🥈':e.place===3?'🥉':`${e.place}ᵉ`):`${i+1} ·`} ${e.slot_name}** · ${e.bonus_label}\n-# ${e.multiplier?`${Number(e.multiplier)}x · mise ${eur(e.bet_cents!)} · `:''}<@${e.discord_id}>`;
  // 10 lignes illustrées (40 composants max par message), puis une liste texte plafonnée.
  // Pendant les inscriptions, les étapes prennent de la place : 6 lignes illustrées au lieu de 10.
  const R=t.status==='open'?6:10;
  const rich=entries.slice(0,R),rest=entries.slice(R,30),more=entries.length-30;
  return {flags:MessageFlags.IsComponentsV2 as const,allowedMentions:{parse:[] as never[]},components:[{type:17,accent_color:ACCENT,components:[
    T(`# ⚔️ ${t.title}`),T(`${head}\nPrix d’achat : **${eur(t.buy_cents)} par bonus** · une machine par joueur · jamais deux fois la même machine`),
    L.LINE,
    ...(t.status==='open'?[
      ...L.step('1 · Relie ton compte Rumble','C’est ton pseudo Rumble qui s’affiche dans le bracket. 30 secondes, une seule fois.',[L.btn('Lier mon Rumble','🔗',1,LINK_BUTTON)]),
      L.GAP,
      ...L.step('2 · Inscris-toi','Donne ta machine, puis choisis ton bonus.',[L.btn('S’inscrire','✍️',3,`${P}join`)]),
      L.LINE,T('### 📋 Les inscrits')]:[]),
    ...(entries.length?rich.map((e,i)=>e.image_url?{type:9,components:[T(line(e,i))],accessory:{type:11,media:{url:e.image_url},description:e.slot_name}}:T(line(e,i)))
      :[T('Aucun inscrit pour l’instant : sois le premier !')]),
    ...(rest.length?[SEP(1,false),T(`${rest.map((e,i)=>line(e,i+R)).join('\n')}${more>0?`\n-# … et ${more} autres inscrits`:''}`.slice(0,3000))]:[]),
    SEP(),
    {type:1,components:[{type:2,style:5,label:'Voir le tournoi',emoji:{name:'📺'},url:BRACKET_URL}]},
    T(`-# ${entries.length} inscrit${entries.length>1?'s':''} · 🔞 18+ · Joue de façon responsable. Joueurs Info Service : 09 74 75 13 13.`),
  ]}] as never[]};
}

// Étape de confirmation (visible par le joueur seul) : la machine trouvée, son image et ses bonus.
export function confirmCard(slot:Slot,options:BonusOption[],picked:string|null,takenBy?:string){
  const chosen=options.find(o=>o.id===picked);
  return {flags:MessageFlags.IsComponentsV2 as const,components:[{type:17,accent_color:ACCENT,components:[
    {type:9,components:[T(`### 🎰 ${slot.name}`),T(`${slot.provider??'Fournisseur inconnu'}\n${takenBy?`❌ **Déjà réservée par <@${takenBy}>** : choisis une autre machine.`:'C’est bien cette machine ?'}`)],
      accessory:{type:11,media:{url:slot.image??'https://cdn.discordapp.com/embed/avatars/0.png'},description:slot.name}},
    ...(takenBy?[]:[
      SEP(),
      T(chosen?`**Ton bonus :** ${chosen.label}\n-# ${optionText(chosen)}`:'**Choisis ton bonus :**'),
      {type:1,components:[new StringSelectMenuBuilder().setCustomId(`${P}bonus`).setPlaceholder('Quel bonus ?').addOptions(
        options.slice(0,25).map(o=>({label:o.label.slice(0,100),value:o.id,description:optionText(o).slice(0,100),default:o.id===picked}))).toJSON()]},
      {type:1,components:[new ButtonBuilder().setCustomId(`${P}ok`).setLabel('Confirmer mon inscription').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(!chosen).toJSON(),
        new ButtonBuilder().setCustomId(`${P}cancel`).setLabel('Annuler').setStyle(ButtonStyle.Secondary).toJSON()]},
    ]),
  ]}] as never[]};
}

const drafts=new Map<string,{slot:Slot;options:BonusOption[];picked:string|null;at:number}>();

async function ensureChannel(guild:Guild,name:string,topic:string){
  const all=await guild.channels.fetch();
  const found=all.find(c=>c?.type===ChannelType.GuildText&&c.name===name);
  if(found?.type===ChannelType.GuildText)return found;
  return guild.channels.create({name,type:ChannelType.GuildText,parent:EVENTS_CATEGORY,topic});
}

async function refreshCard(client:Client,pool:Pool,t:Tournament){
  const fresh=(await pool.query(`SELECT * FROM belva_tournaments WHERE id=$1`,[t.id])).rows[0] as Tournament;
  const channel=fresh.channel_id?await client.channels.fetch(fresh.channel_id).catch(()=>null) as TextChannel|null:null;if(!channel)return;
  const payload=registrationCard(fresh,await entriesOf(pool,fresh.id));
  const msg=fresh.message_id?await channel.messages.fetch(fresh.message_id).catch(()=>null):null;
  if(msg)await msg.edit(payload);
  else{const m=await channel.send(payload);await pool.query(`UPDATE belva_tournaments SET message_id=$2 WHERE id=$1`,[fresh.id,m.id]);}
  await mirror(client,pool,'tournament',fresh.id,await lcnTournament(client),payload);
}

// Saison = mois (heure de Paris) de fin du tournoi. Le message du mois est réécrit, puis figé quand le mois change.
const monthOf=(d:Date)=>{const p=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit'}).formatToParts(d);
  return `${p.find(x=>x.type==='year')!.value}-${p.find(x=>x.type==='month')!.value}`;};
const monthLabel=(d:Date)=>new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',month:'long',year:'numeric'}).format(d);
async function seasonData(pool:Pool,month:string){
  const ts=(await pool.query(`SELECT id FROM belva_tournaments WHERE status='done' AND to_char(COALESCE(draw_at,finished_at) AT TIME ZONE 'Europe/Paris','YYYY-MM')=$1 ORDER BY finished_at`,[month])).rows.map(r=>Number(r.id));
  const es=(await pool.query(`SELECT tournament_id,discord_id,display_name,place FROM belva_tournament_entries WHERE tournament_id=ANY($1::int[])`,[ts])).rows;
  const rows=new Map<string,SeasonRow>();
  for(const e of es){const r=rows.get(e.discord_id)??{name:e.display_name,id:String(e.discord_id),places:ts.map(()=>null)};r.name=e.display_name;r.places[ts.indexOf(Number(e.tournament_id))]=e.place??null;rows.set(e.discord_id,r);}
  return {total:ts.length,rows:[...rows.values()]};
}
export async function refreshSeason(client:Client,pool:Pool){
  if(!await isApproved(pool,'season'))return;
  const guild=await client.guilds.fetch(GUILD_ID());
  const now=new Date(),month=monthOf(now);
  const open=(await pool.query(`SELECT * FROM belva_seasons WHERE final=false`)).rows as {month:string;label:string;channel_id:string;message_id:string}[];
  for(const s of open.filter(s=>s.month!==month)){
    const ch=await client.channels.fetch(s.channel_id).catch(()=>null) as TextChannel|null;
    const msg=await ch?.messages.fetch(s.message_id).catch(()=>null);
    await msg?.edit(seasonCard({month:s.label,...await seasonData(pool,s.month),final:true}));
    await pool.query(`UPDATE belva_seasons SET final=true WHERE month=$1`,[s.month]);
  }
  const data=await seasonData(pool,month);if(!data.total)return;
  const card=seasonCard({month:monthLabel(now),...data});
  const row=(await pool.query(`SELECT * FROM belva_seasons WHERE month=$1`,[month])).rows[0];
  const ch=row?await client.channels.fetch(row.channel_id).catch(()=>null) as TextChannel|null:await ensureChannel(guild,SEASON_CHANNEL,'Classement de la saison du tournoi : un message par mois, l’historique reste.');
  const msg=row?await ch?.messages.fetch(row.message_id).catch(()=>null):null;
  if(msg)await msg.edit(card);
  else if(ch){const m=await ch.send(card);await pool.query(`INSERT INTO belva_seasons(month,label,channel_id,message_id) VALUES($1,$2,$3,$4) ON CONFLICT(month) DO UPDATE SET channel_id=$3,message_id=$4`,[month,monthLabel(now),ch.id,m.id]);}
}

const linkedRumble=async(pool:Pool,discordId:string)=>!!(await pool.query(`SELECT 1 FROM automod_discord_links l JOIN streamers s ON s.id=l.streamer_id WHERE lower(s.slug) IN ${LINK_SLUGS} AND l.discord_user_id=$1`,[discordId]).catch(()=>({rowCount:0}))).rowCount;
const linkReply=async(pool:Pool)=>await isApproved(pool,'link-prompt')?{ephemeral:true,...linkPrompt('Le tournoi est réservé aux comptes Rumble reliés : c’est ton pseudo Rumble qui s’affiche dans le bracket et dans le chat.')}
  :{ephemeral:true,content:'Pour t’inscrire, relie d’abord ton compte Rumble avec **/lier** (ou dans 🔗︱lier-mon-compte).'};
export async function handleBelvaTournament(i:Interaction,pool?:Pool):Promise<boolean>{
  if(!isEventGuild(i.guildId))return false;
  const id=(i.isButton()||i.isStringSelectMenu()||i.isModalSubmit())?i.customId:'';
  const isCmd=(i.isChatInputCommand()||i.isAutocomplete())&&(i.commandName==='tournoi'||i.commandName==='tournoi-staff');
  if(!isCmd&&!id.startsWith(P))return false;
  if(!pool)return true;
  await schema(pool);
  if(i.isAutocomplete()){
    const q=String(i.options.getFocused()??'');
    await i.respond((await searchSlots(pool,q,25)).map(s=>({name:`${s.name}${s.provider?` · ${s.provider}`:''}`.slice(0,100),value:s.key.slice(0,100)}))).catch(()=>undefined);
    return true;
  }
  if(!await isApproved(pool,'tournament')){if(i.isRepliable())await i.reply({ephemeral:true,content:'Le tournoi arrive très bientôt ⚔️'});return true;}
  if(i.isChatInputCommand()&&i.commandName==='tournoi-staff')return staff(i,pool);
  if(i.isButton()&&id===`${P}join`){
    const t=await current(pool);
    if(!t||t.status!=='open'){await i.reply({ephemeral:true,content:'Aucune inscription ouverte pour l’instant. Les inscriptions ouvrent avant chaque tournoi du samedi.'});return true;}
    if(!await linkedRumble(pool,i.user.id)){await i.reply(await linkReply(pool));return true;}
    await i.showModal(new ModalBuilder().setCustomId(`${P}joinmodal`).setTitle('Inscription au tournoi').addLabelComponents(
      new LabelBuilder().setLabel('Ta machine').setDescription('Le nom de la slot (ex. Gates of Olympus)').setTextInputComponent(
        new TextInputBuilder().setCustomId('machine').setStyle(TextInputStyle.Short).setMinLength(2).setMaxLength(80).setRequired(true))));
    return true;
  }
  if(i.isChatInputCommand()||(i.isModalSubmit()&&id===`${P}joinmodal`)){
    const t=await current(pool);
    if(!t||t.status!=='open'){await i.reply({ephemeral:true,content:'Aucune inscription ouverte pour l’instant. Les inscriptions ouvrent avant chaque tournoi du samedi.'});return true;}
    if(!await linkedRumble(pool,i.user.id)){await i.reply(await linkReply(pool));return true;}
    const q=i.isChatInputCommand()?i.options.getString('machine',true):i.fields.getTextInputValue('machine');
    const slot=(await searchSlots(pool,q,1))[0];
    if(!slot){await i.reply({ephemeral:true,content:`Je ne trouve pas « ${q.slice(0,60)} ». Tape le début du nom et choisis dans la liste.`});return true;}
    const taken=(await pool.query(`SELECT discord_id FROM belva_tournament_entries WHERE tournament_id=$1 AND slot_key=$2`,[t.id,slot.key])).rows[0]?.discord_id as string|undefined;
    const options=await bonusOptions(pool,slot,t.buy_cents);
    const picked=options.length===1?options[0]!.id:null;
    drafts.set(i.user.id,{slot,options,picked,at:Date.now()});
    await i.reply({...confirmCard(slot,options,picked,taken&&taken!==i.user.id?taken:undefined),flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral});
    return true;
  }
  const draft=drafts.get(i.user.id);
  if(id===`${P}cancel`&&i.isButton()){drafts.delete(i.user.id);await i.update({components:[{type:17,components:[T('Inscription annulée.')]}] as never[]});return true;}
  if(!draft||Date.now()-draft.at>15*60_000){if(i.isRepliable())await i.reply({ephemeral:true,content:'Cette sélection a expiré : relance **/tournoi**.'});return true;}
  if(id===`${P}bonus`&&i.isStringSelectMenu()){draft.picked=i.values[0]??null;await i.update(confirmCard(draft.slot,draft.options,draft.picked));return true;}
  if(id===`${P}ok`&&i.isButton()){
    const t=await current(pool);const o=draft.options.find(x=>x.id===draft.picked);
    if(!t||t.status!=='open'||!o){await i.update({components:[{type:17,components:[T('Les inscriptions sont fermées.')]}] as never[]});return true;}
    const name=(i.member&&'displayName' in i.member?i.member.displayName:null)??i.user.username;
    try{
      // Inscription seulement si le tournoi est toujours ouvert (le tirage a pu passer entre-temps).
      const done=(await pool.query(`INSERT INTO belva_tournament_entries(tournament_id,discord_id,display_name,slot_key,slot_name,provider,image_url,bonus_id,bonus_label,multiplier,bet_cents,cost_cents)
        SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12 WHERE EXISTS(SELECT 1 FROM belva_tournaments WHERE id=$1 AND status='open') ON CONFLICT(tournament_id,discord_id) DO UPDATE SET display_name=$3,slot_key=$4,slot_name=$5,provider=$6,image_url=$7,
        bonus_id=$8,bonus_label=$9,multiplier=$10,bet_cents=$11,cost_cents=$12,created_at=NOW()`,
        [t.id,i.user.id,name,draft.slot.key,draft.slot.name,draft.slot.provider,draft.slot.image,o.id,o.label,o.multiplier,o.betCents,o.costCents])).rowCount;
      if(!done){await i.update({components:[{type:17,components:[T('Les inscriptions viennent de fermer : le bracket est tiré.')]}] as never[]});return true;}
    }catch(e){
      if((e as {code?:string}).code==='23505'){
        const owner=(await pool.query(`SELECT discord_id FROM belva_tournament_entries WHERE tournament_id=$1 AND slot_key=$2`,[t.id,draft.slot.key])).rows[0]?.discord_id??'0';
        await i.update(confirmCard(draft.slot,draft.options,draft.picked,owner));return true;}
      throw e;
    }
    drafts.delete(i.user.id);
    await i.update({components:[{type:17,accent_color:ACCENT,components:[T(`✅ **Inscrit !** ${draft.slot.name} · ${o.label}\n-# ${optionText(o)}. Tu peux changer de machine en relançant /tournoi.`)]}] as never[]});
    await refreshCard(i.client,pool,t);
    return true;
  }
  return true;
}

// Tirage automatique le samedi 18 h (heure de Paris) par l'API ; ici : ouverture et réglages.
// Premier tournoi le samedi 28 novembre 2026 : pas de tirage avant.
export const FIRST_DRAW=()=>process.env.BELVA_TOURNAMENT_FIRST_DRAW?.trim()||'2026-11-28T18:00:00+01:00';
const NEXT_SATURDAY=`GREATEST(((date_trunc('week',NOW() AT TIME ZONE 'Europe/Paris')+interval '5 days 18 hours')
  +CASE WHEN (NOW() AT TIME ZONE 'Europe/Paris')>=date_trunc('week',NOW() AT TIME ZONE 'Europe/Paris')+interval '5 days 18 hours' THEN interval '7 days' ELSE interval '0' END) AT TIME ZONE 'Europe/Paris','${FIRST_DRAW()}'::timestamptz)`;
const titleFor=async(pool:Pool)=>{const d=(await pool.query(`SELECT ${NEXT_SATURDAY} AS d`)).rows[0].d as Date;
  return `Tournoi du ${new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',weekday:'long',day:'numeric',month:'long'}).format(d)}`;};
async function openTournament(client:Client,pool:Pool,buyCents:number,by:string,title?:string){
  const guild=await client.guilds.fetch(GUILD_ID());
  const channel=await ensureChannel(guild,REG_CHANNEL,'Inscriptions au tournoi du samedi : /tournoi + le nom de ta machine.');
  const row=(await pool.query(`INSERT INTO belva_tournaments(title,buy_cents,channel_id,created_by,draw_at) VALUES($1,$2,$3,$4,${NEXT_SATURDAY}) RETURNING *`,
    [(title??await titleFor(pool)).slice(0,120),buyCents,channel.id,by])).rows[0] as Tournament;
  await refreshCard(client,pool,row);
  return {row,channel};
}

async function staff(i:import('discord.js').ChatInputCommandInteraction,pool:Pool){
  const sub=i.options.getSubcommand();const t=await current(pool);
  if(sub==='ouvrir'){
    if(t){await i.reply({ephemeral:true,content:`Un tournoi est déjà en cours (« ${t.title} »).`});return true;}
    const prix=i.options.getInteger('prix');
    const {channel}=await openTournament(i.client,pool,prix?prix*100:BUY_CENTS(),i.user.id,i.options.getString('titre')??undefined);
    await i.reply({ephemeral:true,content:`Inscriptions ouvertes dans <#${channel.id}>.`});return true;
  }
  if(!t||t.status!=='open'){await i.reply({ephemeral:true,content:'Aucune inscription ouverte (le bracket est peut-être déjà tiré).'});return true;}
  if(sub==='prix'){
    const prix=i.options.getInteger('euros',true);
    await pool.query(`UPDATE belva_tournaments SET buy_cents=$2 WHERE id=$1`,[t.id,prix*100]);
    // Les mises affichées suivent le nouveau prix d'achat.
    for(const e of await entriesOf(pool,t.id))if(e.multiplier){const o=priceOption('x','x',Number(e.multiplier),prix*100);
      await pool.query(`UPDATE belva_tournament_entries SET bet_cents=$3,cost_cents=$4 WHERE tournament_id=$1 AND discord_id=$2`,[t.id,e.discord_id,o.betCents,o.costCents]);}
    await refreshCard(i.client,pool,t);await i.reply({ephemeral:true,content:`Prix d’achat : ${eur(prix*100)} par bonus.`});return true;
  }
  const u=i.options.getUser('joueur',true);
  const n=(await pool.query(`DELETE FROM belva_tournament_entries WHERE tournament_id=$1 AND discord_id=$2`,[t.id,u.id])).rowCount;
  await refreshCard(i.client,pool,t);await i.reply({ephemeral:true,content:n?`${u.username} retiré, sa machine est libérée.`:`${u.username} n’était pas inscrit.`});return true;
}

type LiveMatch={key:string;round:number;a:string|null;b:string|null;bestOf:number;legs:{a:number|null;b:number|null}[];winsA:number;winsB:number;winner:string|null;loser:string|null;status:string};
export type LiveState={tournament:{id:number;status:string;version:number;champion:string|null};players:Record<string,{rumble:string|null;name:string;slot:string;image:string|null;bonus:string}>;
  bracket:{rounds:number;matches:LiveMatch[];current:{key:string;player:string;opponent:string}|null;champion:string|null;places:Record<string,number>}|null};
export const BRACKET_URL='https://lunalive.win/belva/tournoi';
const roundName=(r:number,n:number)=>r===n?'Finale':r===n-1?'Demi-finales':r===n-2?'Quarts':r===n-3?'Huitièmes':`Tour ${r}`;
export const seasonPointsFor=(place:number)=>10+([15,10,7,4,4][place-1]??0);

// Carte du bracket dans ⚔️︱tournoi (remplace la carte des inscriptions une fois le tirage fait).
export function bracketCard(title:string,s:LiveState){
  const b=s.bracket!,ps=s.players,who=(id:string|null)=>id?(ps[id]?.rumble??ps[id]?.name??'?'):'À venir';
  const cur=b.current?b.matches.find(m=>m.key===b.current!.key):null;
  const line=(m:LiveMatch)=>{
    if(m.status==='bye')return `⏭️ ${who(m.a)} · qualifié d’office`;
    const g=(side:'a'|'b')=>m.legs.filter(l=>l[side]!==null).map(l=>eur(l[side]!)).join(' / ');
    const mark=m.winner?'✅':m.key===b.current?.key?'▶️':'⏳';
    const name=(id:string|null)=>m.winner&&id===m.winner?`**${who(id)}**`:who(id);
    return `${mark} ${name(m.a)}${g('a')?` (${g('a')})`:''} · ${m.bestOf>1?`${m.winsA}-${m.winsB}`:'vs'} · ${name(m.b)}${g('b')?` (${g('b')})`:''}`;
  };
  const rounds=Array.from({length:b.rounds},(_,r)=>b.matches.filter(m=>m.round===r+1));
  const curPlayer=cur&&b.current?ps[b.current.player]:null;
  return {flags:MessageFlags.IsComponentsV2 as const,allowedMentions:{parse:[] as never[]},components:[{type:17,accent_color:ACCENT,components:[
    T(`# ⚔️ ${title}`),
    T(b.champion?`🏆 **${who(b.champion)}** remporte le tournoi avec **${ps[b.champion]?.slot}** !`:'🔴 **Le tournoi est lancé** · le bracket se met à jour à chaque bonus'),
    ...(cur&&b.current&&curPlayer?[SEP(),{type:9,components:[T(`### ▶️ En cours · ${roundName(cur.round,b.rounds)}\n**${who(b.current.player)}** · ${curPlayer.slot} (${curPlayer.bonus})\ncontre **${who(b.current.opponent)}** · ${ps[b.current.opponent]?.slot}`)],
      accessory:{type:11,media:{url:curPlayer.image??'https://cdn.discordapp.com/embed/avatars/0.png'},description:curPlayer.slot}}]:[]),
    SEP(),
    T(rounds.map((ms,r)=>`### ${roundName(r+1,b.rounds)}\n${ms.map(line).join('\n')}`).join('\n').slice(0,3000)),
    SEP(),
    {type:1,components:[{type:2,style:5,label:'Voir le bracket en direct',emoji:{name:'📺'},url:BRACKET_URL}]},
    T('-# 🔞 18+ · Joue de façon responsable. Joueurs Info Service : 09 74 75 13 13.'),
  ]}] as never[]};
}
export const eliminationText=(userId:string,round:string,place:number)=>
  `⚔️ <@${userId}> est éliminé en **${round}** : **${place}ᵉ place** · **+${seasonPointsFor(place)} points** de saison. Merci d’avoir joué !`;
export const championText=(userId:string,slot:string)=>
  `🏆 <@${userId}> remporte le tournoi avec **${slot}** : **1re place** · **+${seasonPointsFor(1)} points** de saison ! Les inscriptions du prochain tournoi sont ouvertes : **/tournoi**.`;

// État complet (avec identifiants Discord, pour les pings) : route interne, la route publique les masque.
async function liveState(config:LunaLiveApiConfig):Promise<LiveState|null>{
  const r=await belvaTournamentState(config).catch(()=>null);
  return (r?.state as LiveState|undefined)??null;
}

// Suit le bracket tenu par l'API : carte en direct, ping des éliminés, puis saison et nouvelles inscriptions.
async function followBracket(client:Client,pool:Pool,config:LunaLiveApiConfig,seen:Map<number,number>){
  if(!await isApproved(pool,'bracket'))return;
  const s=await liveState(config);if(!s?.bracket)return;
  const t=(await pool.query(`SELECT * FROM belva_tournaments WHERE id=$1`,[s.tournament.id])).rows[0] as Tournament|undefined;if(!t)return;
  if(seen.get(t.id)===s.tournament.version)return;
  seen.set(t.id,s.tournament.version);
  const channel=t.channel_id?await client.channels.fetch(t.channel_id).catch(()=>null) as TextChannel|null:null;
  const msg=channel&&t.message_id?await channel.messages.fetch(t.message_id).catch(()=>null):null;
  if(msg)await msg.edit(bracketCard(t.title,s));
  const lcn=await lcnTournament(client);
  await mirror(client,pool,'tournament',t.id,lcn,bracketCard(t.title,s));
  // Joueurs inscrits depuis le Discord LeCasiNoze (absents de celui de Belva) : pingés là-bas.
  const where=async(id:string)=>{
    if(await client.guilds.fetch(BELVA_GUILD()).then(g=>g.members.fetch(id)).then(()=>true).catch(()=>false))return channel;
    return await client.guilds.fetch(LCN_GUILD()).then(g=>g.members.fetch(id)).then(()=>true).catch(()=>false)?lcn:channel;
  };
  const b=s.bracket;
  for(const m of b.matches.filter(m=>m.loser)){
    const fresh=(await pool.query(`INSERT INTO belva_tournament_pings(tournament_id,discord_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING 1`,[t.id,m.loser])).rowCount;
    if(fresh)await (await where(m.loser!))?.send({content:eliminationText(m.loser!,roundName(m.round,b.rounds),b.places[m.loser!]!),allowedMentions:{users:[m.loser!]}});
  }
  if(b.champion&&s.tournament.status==='done'){
    const fresh=(await pool.query(`INSERT INTO belva_tournament_pings(tournament_id,discord_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING 1`,[t.id,'champion:'+b.champion])).rowCount;
    if(fresh){
      const champ={content:championText(b.champion,s.players[b.champion]?.slot??''),allowedMentions:{users:[b.champion]}};
      await channel?.send(champ);await lcn?.send(champ);
      await refreshSeason(client,pool);
      // Les inscriptions du tournoi suivant s'ouvrent dès qu'un vainqueur est désigné, au même prix.
      if(!await current(pool)&&await isApproved(pool,'tournament'))await openTournament(client,pool,t.buy_cents,client.user!.id);
    }
  }
}

export function startBelvaTournament(client:Client,pool:Pool|undefined,config:LunaLiveApiConfig){
  if(!pool)return;
  const seen=new Map<number,number>();let busy=false;
  // Au démarrage : la carte du tournoi en cours est (re)publiée sur le Discord LeCasiNoze.
  setTimeout(()=>void schema(pool).then(()=>current(pool)).then(t=>t&&isApproved(pool,'tournament').then(ok=>ok?refreshCard(client,pool,t):undefined))
    .catch(e=>console.error('[nozebot] miroir tournoi',e)),20_000).unref();
  // Tout premier tournoi : inscriptions ouvertes d'office dès la validation (tirage au plus tôt le FIRST_DRAW).
  const ensureFirst=async()=>{if(!(await pool.query(`SELECT 1 FROM belva_tournaments LIMIT 1`)).rowCount&&await isApproved(pool,'tournament'))await openTournament(client,pool,BUY_CENTS(),client.user!.id);};
  setInterval(()=>{if(busy)return;busy=true;void schema(pool).then(ensureFirst).then(()=>followBracket(client,pool,config,seen)).catch(e=>console.error('[nozebot] bracket tournoi',e)).finally(()=>{busy=false;});},15_000).unref();
  // Fige la saison du mois écoulé même sans nouveau tournoi.
  setInterval(()=>void schema(pool).then(()=>refreshSeason(client,pool)).catch(e=>console.error('[nozebot] saison tournoi',e)),60*60_000).unref();
}
