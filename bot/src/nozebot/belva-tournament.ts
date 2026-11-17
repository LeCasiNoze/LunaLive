import {
  ActionRowBuilder,ButtonBuilder,ButtonStyle,ChannelType,LabelBuilder,MessageFlags,ModalBuilder,PermissionFlagsBits,SlashCommandBuilder,
  StringSelectMenuBuilder,TextInputBuilder,TextInputStyle,type Client,type Guild,type Interaction,type TextChannel,
} from 'discord.js';
import type {Pool} from 'pg';
import {isApproved} from './belva-approval.js';
import {seasonCard,type SeasonRow} from './belva-progress-designs.js';

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
    .addSubcommand(s=>s.setName('fermer').setDescription('Fermer les inscriptions'))
    .addSubcommand(s=>s.setName('resultats').setDescription('Saisir le classement du tournoi'))
    .addSubcommand(s=>s.setName('retirer').setDescription('Retirer un inscrit').addUserOption(o=>o.setName('joueur').setDescription('Le joueur à retirer').setRequired(true))),
];
export async function registerTournamentCommands(client:Client){
  const guild=await client.guilds.fetch(GUILD_ID()).catch(()=>null);if(!guild)return;
  for(const c of COMMANDS)await guild.commands.create(c.toJSON());
}

type Tournament={id:number;title:string;status:'open'|'closed'|'done';buy_cents:number;channel_id:string|null;message_id:string|null};
type Entry={discord_id:string;display_name:string;slot_name:string;slot_key:string;provider:string|null;image_url:string|null;bonus_label:string;multiplier:string|null;bet_cents:number|null;cost_cents:number;place:number|null};
const current=async(pool:Pool)=>(await pool.query(`SELECT * FROM belva_tournaments WHERE status IN ('open','closed') ORDER BY id DESC LIMIT 1`)).rows[0] as Tournament|undefined;
const entriesOf=async(pool:Pool,id:number)=>(await pool.query(`SELECT * FROM belva_tournament_entries WHERE tournament_id=$1 ORDER BY COALESCE(place,999),created_at`,[id])).rows as Entry[];

// Carte des inscriptions : une ligne illustrée par machine (Discord limite un message à 40 composants).
export function registrationCard(t:{title:string;status:string;buy_cents:number},entries:Entry[]){
  const head=t.status==='open'?`🟢 **Inscriptions ouvertes** · tape **/tournoi** puis le nom de ta machine`
    :t.status==='closed'?'🔒 **Inscriptions fermées** · bonne chance à tous !':'🏁 **Tournoi terminé** · résultats ci-dessous';
  const line=(e:Entry,i:number)=>`**${e.place?(e.place===1?'🥇':e.place===2?'🥈':e.place===3?'🥉':`${e.place}ᵉ`):`${i+1} ·`} ${e.slot_name}** · ${e.bonus_label}\n-# ${e.multiplier?`${Number(e.multiplier)}x · mise ${eur(e.bet_cents!)} · `:''}<@${e.discord_id}>`;
  const rich=entries.slice(0,10),rest=entries.slice(10);
  return {flags:MessageFlags.IsComponentsV2 as const,allowedMentions:{parse:[] as never[]},components:[{type:17,accent_color:ACCENT,components:[
    T(`# ⚔️ ${t.title}`),T(`${head}\nPrix d’achat : **${eur(t.buy_cents)} par bonus** · une machine par joueur · jamais deux fois la même machine`),
    SEP(),
    ...(entries.length?rich.map((e,i)=>e.image_url?{type:9,components:[T(line(e,i))],accessory:{type:11,media:{url:e.image_url},description:e.slot_name}}:T(line(e,i)))
      :[T('Aucun inscrit pour l’instant : sois le premier !')]),
    ...(rest.length?[SEP(1,false),T(rest.map((e,i)=>line(e,i+10)).join('\n'))]:[]),
    SEP(),
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
}

// Saison = mois (heure de Paris) de fin du tournoi. Le message du mois est réécrit, puis figé quand le mois change.
const monthOf=(d:Date)=>{const p=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit'}).formatToParts(d);
  return `${p.find(x=>x.type==='year')!.value}-${p.find(x=>x.type==='month')!.value}`;};
const monthLabel=(d:Date)=>new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',month:'long',year:'numeric'}).format(d);
async function seasonData(pool:Pool,month:string){
  const ts=(await pool.query(`SELECT id FROM belva_tournaments WHERE status='done' AND to_char(finished_at AT TIME ZONE 'Europe/Paris','YYYY-MM')=$1 ORDER BY finished_at`,[month])).rows.map(r=>Number(r.id));
  const es=(await pool.query(`SELECT tournament_id,discord_id,display_name,place FROM belva_tournament_entries WHERE tournament_id=ANY($1::int[])`,[ts])).rows;
  const rows=new Map<string,SeasonRow>();
  for(const e of es){const r=rows.get(e.discord_id)??{name:e.display_name,places:ts.map(()=>null)};r.name=e.display_name;r.places[ts.indexOf(Number(e.tournament_id))]=e.place??null;rows.set(e.discord_id,r);}
  return {total:ts.length,rows:[...rows.values()]};
}
export async function refreshSeason(client:Client,pool:Pool){
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

export async function handleBelvaTournament(i:Interaction,pool?:Pool):Promise<boolean>{
  if(i.guildId!==GUILD_ID())return false;
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
  if(i.isChatInputCommand()){
    const t=await current(pool);
    if(!t||t.status!=='open'){await i.reply({ephemeral:true,content:'Aucune inscription ouverte pour l’instant. Les inscriptions ouvrent avant chaque tournoi du samedi.'});return true;}
    const q=i.options.getString('machine',true);
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
      await pool.query(`INSERT INTO belva_tournament_entries(tournament_id,discord_id,display_name,slot_key,slot_name,provider,image_url,bonus_id,bonus_label,multiplier,bet_cents,cost_cents)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(tournament_id,discord_id) DO UPDATE SET display_name=$3,slot_key=$4,slot_name=$5,provider=$6,image_url=$7,
        bonus_id=$8,bonus_label=$9,multiplier=$10,bet_cents=$11,cost_cents=$12,created_at=NOW()`,
        [t.id,i.user.id,name,draft.slot.key,draft.slot.name,draft.slot.provider,draft.slot.image,o.id,o.label,o.multiplier,o.betCents,o.costCents]);
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
  if(id===`${P}results`&&i.isModalSubmit())return saveResults(i,pool);
  return true;
}

async function staff(i:import('discord.js').ChatInputCommandInteraction,pool:Pool){
  const sub=i.options.getSubcommand();const t=await current(pool);
  if(sub==='ouvrir'){
    if(t){await i.reply({ephemeral:true,content:`Un tournoi est déjà en cours (« ${t.title} »). Termine-le avec /tournoi-staff resultats.`});return true;}
    const channel=await ensureChannel(i.guild!,REG_CHANNEL,'Inscriptions au tournoi du samedi : /tournoi + le nom de ta machine.');
    const prix=i.options.getInteger('prix');
    const row=(await pool.query(`INSERT INTO belva_tournaments(title,buy_cents,channel_id,created_by) VALUES($1,$2,$3,$4) RETURNING *`,
      [i.options.getString('titre',true).slice(0,120),prix?prix*100:BUY_CENTS(),channel.id,i.user.id])).rows[0] as Tournament;
    await refreshCard(i.client,pool,row);
    await i.reply({ephemeral:true,content:`Inscriptions ouvertes dans <#${channel.id}>.`});return true;
  }
  if(!t){await i.reply({ephemeral:true,content:'Aucun tournoi en cours. Ouvre-en un avec /tournoi-staff ouvrir.'});return true;}
  if(sub==='fermer'){await pool.query(`UPDATE belva_tournaments SET status='closed' WHERE id=$1`,[t.id]);await refreshCard(i.client,pool,t);await i.reply({ephemeral:true,content:'Inscriptions fermées.'});return true;}
  if(sub==='retirer'){
    const u=i.options.getUser('joueur',true);
    const n=(await pool.query(`DELETE FROM belva_tournament_entries WHERE tournament_id=$1 AND discord_id=$2`,[t.id,u.id])).rowCount;
    await refreshCard(i.client,pool,t);await i.reply({ephemeral:true,content:n?`${u.username} retiré, sa machine est libérée.`:`${u.username} n’était pas inscrit.`});return true;
  }
  const es=await entriesOf(pool,t.id);
  if(!es.length){await i.reply({ephemeral:true,content:'Aucun inscrit.'});return true;}
  // Le staff remet les lignes dans l'ordre d'arrivée : la 1re ligne = 1er.
  await i.showModal(new ModalBuilder().setCustomId(`${P}results`).setTitle('Classement du tournoi').addLabelComponents(
    new LabelBuilder().setLabel('Une ligne par joueur, du 1er au dernier').setDescription('Déplace les lignes pour les classer. Supprime celles des absents.')
      .setTextInputComponent(new TextInputBuilder().setCustomId('order').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(4000)
        .setValue(es.map(e=>`${e.display_name} — ${e.slot_name}`).join('\n').slice(0,4000)))));
  return true;
}

export function parseOrder(text:string,entries:{discord_id:string;display_name:string;slot_name:string}[]){
  const left=[...entries];const order:string[]=[];const unknown:string[]=[];
  for(const raw of text.split('\n').map(l=>l.trim()).filter(Boolean)){
    const name=raw.split(' — ')[0]!.trim().toLowerCase();
    const k=left.findIndex(e=>e.display_name.toLowerCase()===name||`${e.display_name} — ${e.slot_name}`.toLowerCase()===raw.toLowerCase());
    if(k<0){unknown.push(raw);continue;}
    order.push(left[k]!.discord_id);left.splice(k,1);
  }
  return {order,unknown,missing:left.map(e=>e.display_name)};
}

async function saveResults(i:import('discord.js').ModalSubmitInteraction,pool:Pool){
  const t=await current(pool);if(!t){await i.reply({ephemeral:true,content:'Aucun tournoi en cours.'});return true;}
  const es=await entriesOf(pool,t.id);
  const {order,unknown,missing}=parseOrder(i.fields.getTextInputValue('order'),es);
  if(unknown.length){await i.reply({ephemeral:true,content:`Lignes non reconnues : ${unknown.map(u=>`« ${u.slice(0,40)} »`).join(', ')}. Rien n’est enregistré, relance /tournoi-staff resultats.`});return true;}
  for(const [k,id] of order.entries())await pool.query(`UPDATE belva_tournament_entries SET place=$3 WHERE tournament_id=$1 AND discord_id=$2`,[t.id,id,k+1]);
  // Les lignes supprimées = absents : ils ne marquent pas de points.
  if(missing.length)await pool.query(`DELETE FROM belva_tournament_entries WHERE tournament_id=$1 AND place IS NULL`,[t.id]);
  await pool.query(`UPDATE belva_tournaments SET status='done',finished_at=NOW() WHERE id=$1`,[t.id]);
  await refreshCard(i.client,pool,t);
  await refreshSeason(i.client,pool);
  await i.reply({ephemeral:true,content:`Classement enregistré (${order.length} joueurs${missing.length?`, ${missing.length} absent${missing.length>1?'s':''} retiré${missing.length>1?'s':''}`:''}). La saison est mise à jour.`});
  return true;
}

export function startBelvaTournament(client:Client,pool?:Pool){
  if(!pool)return;
  // Fige la saison du mois écoulé même sans nouveau tournoi.
  setInterval(()=>void schema(pool).then(()=>refreshSeason(client,pool)).catch(e=>console.error('[nozebot] saison tournoi',e)),60*60_000).unref();
}
