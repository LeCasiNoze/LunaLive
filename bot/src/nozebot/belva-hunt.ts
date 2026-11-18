import {ChannelType,LabelBuilder,MessageFlags,ModalBuilder,SlashCommandBuilder,StringSelectMenuBuilder,TextInputBuilder,TextInputStyle,type Client,type Interaction,type TextChannel} from 'discord.js';
import type {Pool} from 'pg';
import {isApproved} from './belva-approval.js';
import * as L from './belva-layout.js';
import {EVENT_GUILDS,LCN_GUILD,LINK_SLUGS,findChannel,isEventGuild,lcnChannel,mirror} from './belva-guilds.js';
import {BELVA_ROLES} from './belva-roles.js';
import {searchSlots} from './belva-tournament.js';
import {LunaLiveApiError,belvaHuntCall,type LunaLiveApiConfig} from './lunalive-api.js';

// Hunt des viewers du mercredi : /hunt <machine> (membres 🍾 Carré Or), les calls entrent dans la file de calls
// de LeCasiNoze (outil Hunt de LunaLive). Le salon 🎯︱hunt affiche le hunt en direct, du farm à l'ouverture.
const GUILD_ID=()=>process.env.BELVA_GUILD_ID?.trim()||'1429525570965737668';
const REWARDS_CATEGORY='1481924757380272289';
const CHANNEL_NAME='🎯︱hunt';
const HUNT_SLUG=()=>(process.env.BELVA_HUNT_STREAMER||'lecasinoze').toLowerCase();
const ACCENT=0xF3C14B;
const T=(content:string)=>({type:10,content});
const SEP=(spacing=1,divider=true)=>({type:14,divider,spacing});
const eur=(n:number)=>n.toLocaleString('fr-FR',{minimumFractionDigits:n%1?2:0,maximumFractionDigits:2})+' €';
const x=(n:number)=>'x'+n.toLocaleString('fr-FR',{maximumFractionDigits:n<10?2:0});

const COMMAND=new SlashCommandBuilder().setName('hunt').setDescription('Proposer ta machine pour le hunt des viewers du mercredi')
  .addStringOption(o=>o.setName('machine').setDescription('Commence à taper le nom de la slot').setRequired(true).setAutocomplete(true));
export async function registerHuntCommand(client:Client){
  for(const id of EVENT_GUILDS()){const guild=await client.guilds.fetch(id).catch(()=>null);if(guild)await guild.commands.create(COMMAND.toJSON()).catch(()=>undefined);}
}

const ERRORS:Record<string,string>={
  no_hunt:'Pas de hunt des viewers en cours : les calls ouvrent le mercredi matin.',
  slot_taken:'Cette machine est déjà callée par quelqu’un d’autre : choisis-en une autre.',
  already_called:'Tu as déjà utilisé tes calls pour ce hunt (1 machine, 2 à partir du grade 💠 Saphir).',
};

const P='belva:hunt:';
// Premier hunt des viewers : le mercredi 25 novembre 2026. D'ici là, les calls sont réservés d'avance.
const FIRST_HUNT=()=>process.env.BELVA_HUNT_FIRST?.trim()||'2026-11-25';
export function nextHuntDay(now=new Date()){
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'}).formatToParts(now);
  const g=(t:string)=>p.find(x=>x.type===t)!.value;
  const wd=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(g('weekday'));
  const today=Date.UTC(Number(g('year')),Number(g('month'))-1,Number(g('day')));
  const wed=new Date(today+((2-wd+7)%7)*86400e3).toISOString().slice(0,10);
  return wed<FIRST_HUNT()?FIRST_HUNT():wed;
}
export const dayLabel=(iso:string)=>new Intl.DateTimeFormat('fr-FR',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long'}).format(new Date(iso+'T12:00:00Z'));
export const HUNT_RULES=['**1 ·** Une machine par joueur (deux à partir du grade 💠 Saphir).','**2 ·** Jamais deux fois la même machine dans un hunt : premier arrivé, premier servi.',
  '**3 ·** Le matin, LeCasiNoze farme les bonus sur vos machines. Le soir, Belva les ouvre en live.','**4 ·** Ton call rapporte **1 XP par tranche de 5x** (max 500), et le staff tippe les gros hits.'];

// Carte permanente du salon 🎯︱hunt : prochain hunt, étapes avec leurs boutons, règles, calls déjà réservés.
export function huntInfoCard(day:string,calls:{slot:string;who:string}[],ch:{offers?:string;guide?:string;guild?:string}={}){
  return {flags:MessageFlags.IsComponentsV2 as const,allowedMentions:{parse:[] as never[]},components:[{type:17,accent_color:ACCENT,components:[
    L.T('# 🎯 Hunt des viewers'),L.T(`Prochain hunt : **${dayLabel(day)}**\n🌅 **10 h** · farm des bonus\n🌙 **19 h 30** · ouverture en live`),
    L.LINE,
    ...L.step('1 · Avoir le rôle 🍾 Carré Or','Un compte casino vérifié et un premier dépôt avec le lien de Belva. Pas encore fait ? C’est par ici :',[L.chLink('Les offres casino','🎁',ch.offers,ch.guild)]),
    L.GAP,
    ...L.step('2 · Faire ton call','Choisis la machine que tu veux voir dans le hunt. Les calls sont ouverts dès maintenant.',[L.btn('Faire mon call','🎯',3,`${P}call`),L.btn('Retirer mon call','↩️',2,`${P}clear`)]),
    L.LINE,
    ...L.step('📜 Les règles',HUNT_RULES.join('\n'),[L.chLink('Guide VIP','📖',ch.guide,ch.guild)]),
    L.LINE,
    L.T(calls.length?`### 📝 Calls réservés (${calls.length})\n${calls.map(c=>`${c.slot} (${c.who})`).join(' · ')}`.slice(0,1500):'### 📝 Calls réservés\nAucun call pour l’instant : sois le premier !'),
    L.FOOT,
  ]}] as never[]};
}

// Pas encore Carré Or : on explique ce qu'il faut faire, chaque étape avec son bouton.
export function notEligibleCard(offers?:string,guild?:string){
  return {flags:MessageFlags.IsComponentsV2 as const,components:[{type:17,accent_color:ACCENT,components:[
    L.T('## 🔒 Le hunt est réservé aux joueurs qui ont déposé'),
    L.T('Pour caller une machine, il te faut le rôle 🍾 **Carré Or**.'),
    L.LINE,
    ...L.step('1 · Crée ton compte et fais ton premier dépôt','Sur un de nos casinos, avec le lien de Belva.',[L.chLink('Les offres casino','🎁',offers,guild)]),
    L.GAP,
    ...L.step('2 · Demande ton remboursement','Bouton **Remboursement** sur la carte du casino. Une fois validé, tu as le rôle et tu peux caller.'),
  ]}] as never[]};
}

let preReady:Promise<unknown>|null=null;
const preSchema=(pool:Pool)=>preReady??=pool.query(`CREATE TABLE IF NOT EXISTS belva_hunt_precalls(id serial PRIMARY KEY,discord_id text NOT NULL,name text NOT NULL,slot text NOT NULL,slot_key text NOT NULL,provider text,
  created_at timestamptz NOT NULL DEFAULT NOW(),hunt_id int,result text);
  CREATE UNIQUE INDEX IF NOT EXISTS belva_hunt_precalls_slot ON belva_hunt_precalls(slot_key) WHERE hunt_id IS NULL`).catch(e=>{preReady=null;throw e;});
const pendingCalls=async(pool:Pool)=>(await pool.query(`SELECT * FROM belva_hunt_precalls WHERE hunt_id IS NULL ORDER BY id`)).rows as {id:number;discord_id:string;name:string;slot:string;slot_key:string;provider:string|null}[];
const callLimit=async(pool:Pool,discordId:string)=>['saphir','diamant','obsidienne'].includes((await pool.query(`SELECT grade FROM belva_xp_levels WHERE discord_id=$1`,[discordId]).catch(()=>({rows:[]}))).rows[0]?.grade??'')?2:1;
const activeHunt=async(pool:Pool)=>(await pool.query(`SELECT id FROM belva_hunts WHERE status='farm' ORDER BY id DESC LIMIT 1`).catch(()=>({rows:[]}))).rows[0]?.id as number|undefined;
const channelOf=async(client:Client,name:string,guildId=GUILD_ID())=>{const g=await client.guilds.fetch(guildId).catch(()=>null);
  return g?(await findChannel(g,name))?.id:undefined;};
// Les offres : 🎰 toutes-les-offres chez Belva, le salon Rainbet chez LeCasiNoze.
const offersChannelOf=(client:Client,guildId=GUILD_ID())=>channelOf(client,guildId===LCN_GUILD()?'rainbet':'toutes-les-offres',guildId);
const rumbleName=async(pool:Pool,discordId:string)=>(await pool.query(`SELECT l.username FROM automod_discord_links l JOIN streamers s ON s.id=l.streamer_id WHERE lower(s.slug) IN ${LINK_SLUGS} AND l.discord_user_id=$1 LIMIT 1`,[discordId]).catch(()=>({rows:[]}))).rows[0]?.username as string|undefined;
// 🍾 Carré Or sur l'un des deux Discord.
async function hasCarreOr(client:Client,discordId:string){
  const belva=await client.guilds.fetch(GUILD_ID()).then(g=>g.members.fetch(discordId)).catch(()=>null);
  if(belva?.roles.cache.has(BELVA_ROLES.carreOr))return true;
  const lcn=await client.guilds.fetch(LCN_GUILD()).then(g=>g.members.fetch(discordId)).catch(()=>null);
  return !!lcn?.roles.cache.some(r=>r.name==='🍾 Carré Or');
}

async function handleCallButton(i:Interaction,pool:Pool,config:LunaLiveApiConfig):Promise<boolean>{
  if(!(i.isButton()||i.isStringSelectMenu()||i.isModalSubmit())||!i.customId.startsWith(P))return false;
  const id=i.customId;
  if(!await isApproved(pool,'hunt-week')){await i.reply({ephemeral:true,content:'Le hunt des viewers arrive très bientôt 🎯'});return true;}
  await preSchema(pool);
  if(id===`${P}clear`){
    const n=(await pool.query(`DELETE FROM belva_hunt_precalls WHERE discord_id=$1 AND hunt_id IS NULL`,[i.user.id])).rowCount;
    await i.reply({ephemeral:true,content:n?'↩️ Ton call est retiré : la machine est libérée.':'Tu n’as pas de call réservé pour le prochain hunt.'});
    if(n)void refreshInfo(i.client,pool).catch(()=>undefined);
    return true;
  }
  const member=await i.guild!.members.fetch(i.user.id).catch(()=>null);
  if(!member||!await hasCarreOr(i.client,i.user.id)){await i.reply({...notEligibleCard(await offersChannelOf(i.client,i.guildId!),i.guildId!),flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral});return true;}
  if(id===`${P}call`&&i.isButton()){
    await i.showModal(new ModalBuilder().setCustomId(`${P}modal`).setTitle('Mon call pour le hunt').addLabelComponents(
      new LabelBuilder().setLabel('Ta machine').setDescription('Le nom de la slot (ex. Sweet Bonanza)').setTextInputComponent(
        new TextInputBuilder().setCustomId('machine').setStyle(TextInputStyle.Short).setMinLength(2).setMaxLength(80).setRequired(true))));
    return true;
  }
  if(id===`${P}modal`&&i.isModalSubmit()){
    const found=await searchSlots(pool,i.fields.getTextInputValue('machine'),10);
    if(!found.length){await i.reply({ephemeral:true,content:'Machine introuvable : réessaie avec le début du nom.'});return true;}
    await i.reply({ephemeral:true,content:'Quelle machine exactement ?',components:[{type:1,components:[new StringSelectMenuBuilder().setCustomId(`${P}pick`).setPlaceholder('Choisis ta machine')
      .addOptions(found.map(s=>({label:s.name.slice(0,100),value:s.key.slice(0,100),...(s.provider?{description:s.provider.slice(0,100)}:{})}))).toJSON()]}] as never[]});
    return true;
  }
  if(id===`${P}pick`&&i.isStringSelectMenu()){
    const slot=(await searchSlots(pool,i.values[0]!,1))[0];
    if(!slot){await i.update({content:'Machine introuvable, recommence.',components:[]});return true;}
    const name=await rumbleName(pool,i.user.id)??member.displayName;
    // Farm en cours : le call part directement dans la file. Sinon il est réservé pour le prochain hunt.
    if(await activeHunt(pool)){
      try{const r=await belvaHuntCall(config,i.user.id,{name,slot:slot.name,provider:slot.provider});
        await i.update({content:`🎯 **Call enregistré !** ${slot.name} (${r.position}ᵉ dans la file).`,components:[]});}
      catch(e){await i.update({content:e instanceof LunaLiveApiError?ERRORS[e.code]??'Call refusé, réessaie.':'Call indisponible pour le moment.',components:[]});}
      return true;
    }
    const mine=(await pool.query(`SELECT slot FROM belva_hunt_precalls WHERE discord_id=$1 AND hunt_id IS NULL`,[i.user.id])).rows.map(r=>r.slot as string);
    const limit=await callLimit(pool,i.user.id);
    if(mine.length>=limit){await i.update({content:`Tu as déjà ${limit>1?'tes calls':'ton call'} : **${mine.join('**, **')}**. Clique sur **Retirer mon call** pour en changer.`,components:[]});return true;}
    try{await pool.query(`INSERT INTO belva_hunt_precalls(discord_id,name,slot,slot_key,provider) VALUES($1,$2,$3,$4,$5)`,[i.user.id,name.slice(0,80),slot.name,slot.key,slot.provider]);}
    catch(e){if((e as {code?:string}).code==='23505'){await i.update({content:`**${slot.name}** est déjà callée par quelqu’un d’autre : choisis-en une autre.`,components:[]});return true;}throw e;}
    await i.update({content:`🎯 **Call réservé !** ${slot.name} pour le hunt du **${dayLabel(nextHuntDay())}**. Il entre dans la file dès l’ouverture du farm.`,components:[]});
    void refreshInfo(i.client,pool).catch(()=>undefined);
    return true;
  }
  return true;
}

// Au lancement du farm, les calls réservés entrent dans la file, dans l'ordre où ils ont été faits.
async function submitPrecalls(pool:Pool,config:LunaLiveApiConfig){
  const hunt=await activeHunt(pool);if(!hunt)return false;
  const list=await pendingCalls(pool);
  for(const c of list){
    const res=await belvaHuntCall(config,c.discord_id,{name:c.name,slot:c.slot,provider:c.provider}).then(()=>'ok',(e:unknown)=>e instanceof LunaLiveApiError?e.code:'error');
    await pool.query(`UPDATE belva_hunt_precalls SET hunt_id=$2,result=$3 WHERE id=$1`,[c.id,hunt,res]);
  }
  return list.length>0;
}

let infoSig='';
async function refreshInfo(client:Client,pool:Pool){
  if(!await isApproved(pool,'hunt-week'))return;
  await preSchema(pool);
  const channel=await huntChannel(client);if(!channel)return;
  const calls=(await pendingCalls(pool)).map(c=>({slot:c.slot,who:c.name}));
  const card=huntInfoCard(nextHuntDay(),calls,{offers:await offersChannelOf(client),guide:await channelOf(client,'guide-vip')});const sig=JSON.stringify(card.components);
  if(sig===infoSig)return;
  // Même carte sur le Discord LeCasiNoze, avec ses propres salons.
  const lcn=await lcnChannel(client,'🎯','hunt','Le hunt des viewers du mercredi, commun avec le Discord de Belva : fais ton call ici.');
  await mirror(client,pool,'hunt-info','1',lcn,huntInfoCard(nextHuntDay(),calls,{offers:await offersChannelOf(client,LCN_GUILD()),guide:await channelOf(client,'guide-vip',LCN_GUILD()),guild:LCN_GUILD()}));
  await pool.query(`CREATE TABLE IF NOT EXISTS belva_hunt_info(id int PRIMARY KEY DEFAULT 1,channel_id text NOT NULL,message_id text NOT NULL)`);
  const row=(await pool.query(`SELECT * FROM belva_hunt_info WHERE id=1`)).rows[0];
  const msg=row?.channel_id===channel.id?await channel.messages.fetch(row.message_id).catch(()=>null):null;
  if(msg)await msg.edit(card);
  else{const m=await channel.send(card);await pool.query(`INSERT INTO belva_hunt_info(id,channel_id,message_id) VALUES(1,$1,$2) ON CONFLICT(id) DO UPDATE SET channel_id=$1,message_id=$2`,[channel.id,m.id]);}
  infoSig=sig;
}

export async function handleBelvaHunt(i:Interaction,pool:Pool|undefined,config:LunaLiveApiConfig):Promise<boolean>{
  if(pool&&isEventGuild(i.guildId)&&await handleCallButton(i,pool,config))return true;
  if(!isEventGuild(i.guildId)||!(i.isChatInputCommand()||i.isAutocomplete())||i.commandName!=='hunt')return false;
  if(!pool)return true;
  if(i.isAutocomplete()){
    await i.respond((await searchSlots(pool,String(i.options.getFocused()??''),25)).map(s=>({name:`${s.name}${s.provider?` · ${s.provider}`:''}`.slice(0,100),value:s.name.slice(0,100)}))).catch(()=>undefined);
    return true;
  }
  await i.deferReply({ephemeral:true});
  if(!await isApproved(pool,'hunt')){await i.editReply('Le hunt des viewers arrive très bientôt 🎯');return true;}
  const member=await i.guild!.members.fetch(i.user.id).catch(()=>null);
  if(!member||!await hasCarreOr(i.client,i.user.id)){await i.editReply('Le hunt des viewers est réservé aux membres 🍾 Carré Or (compte casino vérifié + dépôt). Va dans 🎰 toutes-les-offres pour vérifier ton compte.');return true;}
  const slot=(await searchSlots(pool,i.options.getString('machine',true),1))[0];
  if(!slot){await i.editReply('Machine introuvable : tape le début du nom et choisis dans la liste.');return true;}
  const rumble=await rumbleName(pool,i.user.id);
  try{
    const r=await belvaHuntCall(config,i.user.id,{name:rumble??member.displayName,slot:slot.name,provider:slot.provider});
    await i.editReply(`🎯 **Call enregistré !** ${slot.name} (${r.position}ᵉ dans la file). Suis le hunt en direct dans <#${(await huntChannel(i.client))?.id??''}>.`);
  }catch(e){await i.editReply(e instanceof LunaLiveApiError?ERRORS[e.code]??'Call refusé, réessaie.':'Call indisponible pour le moment.');}
  return true;
}

type HuntItem={slot:string;caller:string|null;bet:number|null;pay:number|null;bonus:boolean;image:string|null};
export type HuntView={id:number;status:'farm'|'open'|'done';startedAt:Date;start:number;items:HuntItem[]};

// Carte en direct du hunt (salon 🎯︱hunt) : stats, bonus tombés avec leur caller, calls en attente, meilleurs calls.
export function huntCard(h:HuntView){
  const bonus=h.items.filter(i=>i.bonus),calls=h.items.filter(i=>!i.bonus);
  const paid=bonus.filter(i=>i.pay!==null),todo=bonus.filter(i=>i.pay===null);
  const totalBet=bonus.reduce((s,i)=>s+(i.bet??0),0),totalPay=paid.reduce((s,i)=>s+(i.pay??0),0);
  const remainingBet=todo.reduce((s,i)=>s+(i.bet??0),0),beNow=remainingBet?Math.max(0,h.start-totalPay)/remainingBet:0;
  const next=h.status==='open'?todo[0]:null;
  const date=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',weekday:'long',day:'numeric',month:'long'}).format(h.startedAt);
  const status=h.status==='farm'?'🌾 **Farm en cours** · propose ta machine avec **/hunt**':h.status==='open'?'🔓 **Ouverture en cours** sur le live de Belva':'🏁 **Hunt terminé**';
  const stats=[`💰 Start **${eur(h.start)}**`,`🎁 **${bonus.length}** bonus`,`🎲 Bets **${eur(totalBet)}**`,...(totalBet?[`📈 BE **${x(h.start/totalBet)}**`]:[]),
    ...(h.status==='open'&&todo.length?[`🎯 BE restant **${x(beNow)}**`]:[]),...(paid.length?[`💸 Gains **${eur(totalPay)}**`]:[])].join(' · ');
  const line=(i:HuntItem)=>i.pay!==null?`✅ **${i.slot}** · ${i.caller??'?'} · ${eur(i.bet??0)} → **${eur(i.pay)}** (${x(i.bet?i.pay/i.bet:0)})`
    :`${i===next?'▶️':'🎁'} **${i.slot}** · ${i.caller??'?'} · ${eur(i.bet??0)}`;
  const best=paid.filter(i=>i.bet).sort((a,b)=>b.pay!/b.bet!-a.pay!/a.bet!).slice(0,3);
  return {flags:MessageFlags.IsComponentsV2 as const,allowedMentions:{parse:[] as never[]},components:[{type:17,accent_color:ACCENT,components:[
    T(`# 🎯 Hunt des viewers · ${date}`),T(status),T(stats),
    ...(next?[SEP(),{type:9,components:[T(`### ▶️ Bonus à ouvrir\n**${next.slot}** · call de **${next.caller??'?'}** · bet ${eur(next.bet??0)}`)],
      accessory:{type:11,media:{url:next.image??'https://cdn.discordapp.com/embed/avatars/0.png'},description:next.slot}}]:[]),
    SEP(),
    T(bonus.length?`### 🎁 Bonus (${bonus.length})\n${bonus.map(line).join('\n')}`.slice(0,2800):'### 🎁 Bonus\nAucun bonus pour l’instant.'),
    ...(calls.length&&h.status==='farm'?[SEP(1,false),T(`### 📝 Calls en attente (${calls.length})\n${calls.map(c=>`${c.slot} (${c.caller??'?'})`).join(' · ')}`.slice(0,900))]:[]),
    ...(best.length?[SEP(),T(`### 🏅 Meilleurs calls\n${best.map((b,k)=>`${['🥇','🥈','🥉'][k]} **${b.caller??'?'}** · ${b.slot} · **${x(b.pay!/b.bet!)}**`).join('\n')}`)]:[]),
    SEP(),
    T('-# Réservé aux membres 🍾 Carré Or · ton call rapporte 1 XP par tranche de 5x (max 500), et le staff tippe les gros hits. 🔞 18+ · Joueurs Info Service : 09 74 75 13 13.'),
  ]}] as never[]};
}

async function huntChannel(client:Client){
  const guild=await client.guilds.fetch(GUILD_ID()).catch(()=>null);if(!guild)return null;
  const all=await guild.channels.fetch();
  return all.find(c=>c?.type===ChannelType.GuildText&&c.name===CHANNEL_NAME) as TextChannel|undefined
    ??await guild.channels.create({name:CHANNEL_NAME,type:ChannelType.GuildText,parent:REWARDS_CATEGORY,topic:'Le hunt des viewers du mercredi en direct : /hunt + ta machine.'});
}

async function loadView(pool:Pool):Promise<(HuntView&{version:number})|null>{
  const h=(await pool.query(`SELECT * FROM belva_hunts ORDER BY id DESC LIMIT 1`).catch(()=>({rows:[]}))).rows[0];if(!h)return null;
  const sid=(await pool.query(`SELECT id FROM streamers WHERE lower(slug)=$1`,[HUNT_SLUG()])).rows[0]?.id;if(!sid)return null;
  const start=Number((await pool.query(`SELECT start FROM calls_hunt_sessions WHERE streamer_id=$1`,[sid])).rows[0]?.start??0);
  const items=(await pool.query(`SELECT q.slot_name,q.username,q.bet,q.pay,(q.is_bonus OR COALESCE(q.bet,0)>0) AS bonus,sc.image_url
    FROM calls_queue q LEFT JOIN slots_catalog sc ON sc.name_key=q.slot_key WHERE q.streamer_id=$1 ORDER BY q.pos`,[sid])).rows.map(r=>({slot:r.slot_name,caller:r.username,
      bet:r.bet===null?null:Number(r.bet),pay:r.pay===null?null:Number(r.pay),bonus:!!r.bonus,image:r.image_url??null}));
  return {id:h.id,status:h.status,startedAt:h.started_at,start,items,version:h.version};
}

let lastSig='';
async function follow(client:Client,pool:Pool){
  if(!await isApproved(pool,'hunt'))return;
  await pool.query(`CREATE TABLE IF NOT EXISTS belva_hunt_messages(hunt_id int PRIMARY KEY,channel_id text NOT NULL,message_id text NOT NULL,final boolean NOT NULL DEFAULT false)`);
  const v=await loadView(pool);if(!v)return;
  // Une fois terminé, la carte est réécrite une dernière fois puis figée (la file de LeCasiNoze peut resservir).
  if(v.status==='done'&&(await pool.query(`SELECT final FROM belva_hunt_messages WHERE hunt_id=$1`,[v.id])).rows[0]?.final!==false)return;
  const card=huntCard(v);const sig=JSON.stringify(card.components);
  if(sig===lastSig)return;
  const row=(await pool.query(`SELECT * FROM belva_hunt_messages WHERE hunt_id=$1`,[v.id])).rows[0];
  const channel=row?await client.channels.fetch(row.channel_id).catch(()=>null) as TextChannel|null:await huntChannel(client);
  const msg=row&&channel?await channel.messages.fetch(row.message_id).catch(()=>null):null;
  if(msg)await msg.edit(card);
  else if(channel){const m=await channel.send(card);await pool.query(`INSERT INTO belva_hunt_messages(hunt_id,channel_id,message_id) VALUES($1,$2,$3) ON CONFLICT(hunt_id) DO UPDATE SET channel_id=$2,message_id=$3`,[v.id,channel.id,m.id]);}
  await mirror(client,pool,'hunt-live',v.id,await lcnChannel(client,'🎯','hunt','Le hunt des viewers du mercredi, commun avec le Discord de Belva.'),card);
  if(v.status==='done')await pool.query(`UPDATE belva_hunt_messages SET final=true WHERE hunt_id=$1`,[v.id]);
  lastSig=sig;
}

export function startBelvaHunt(client:Client,pool?:Pool,config?:LunaLiveApiConfig){
  if(!pool)return;let busy=false;
  setInterval(()=>{if(busy)return;busy=true;void (async()=>{
    if(config&&await isApproved(pool,'hunt-week')){await preSchema(pool);if(await submitPrecalls(pool,config))infoSig='';}
    await follow(client,pool);await refreshInfo(client,pool);
  })().catch(e=>console.error('[nozebot] hunt Belva',e)).finally(()=>{busy=false;});},15_000).unref();
}
