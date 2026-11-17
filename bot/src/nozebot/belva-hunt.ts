import {ChannelType,MessageFlags,SlashCommandBuilder,type Client,type Interaction,type TextChannel} from 'discord.js';
import type {Pool} from 'pg';
import {isApproved} from './belva-approval.js';
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
  const guild=await client.guilds.fetch(GUILD_ID()).catch(()=>null);if(!guild)return;
  await guild.commands.create(COMMAND.toJSON());
}

const ERRORS:Record<string,string>={
  no_hunt:'Pas de hunt des viewers en cours : les calls ouvrent le mercredi matin.',
  slot_taken:'Cette machine est déjà callée par quelqu’un d’autre : choisis-en une autre.',
  already_called:'Tu as déjà utilisé tes calls pour ce hunt (1 machine, 2 à partir du grade 💠 Saphir).',
};

export async function handleBelvaHunt(i:Interaction,pool:Pool|undefined,config:LunaLiveApiConfig):Promise<boolean>{
  if(i.guildId!==GUILD_ID()||!(i.isChatInputCommand()||i.isAutocomplete())||i.commandName!=='hunt')return false;
  if(!pool)return true;
  if(i.isAutocomplete()){
    await i.respond((await searchSlots(pool,String(i.options.getFocused()??''),25)).map(s=>({name:`${s.name}${s.provider?` · ${s.provider}`:''}`.slice(0,100),value:s.name.slice(0,100)}))).catch(()=>undefined);
    return true;
  }
  await i.deferReply({ephemeral:true});
  if(!await isApproved(pool,'hunt')){await i.editReply('Le hunt des viewers arrive très bientôt 🎯');return true;}
  const member=await i.guild!.members.fetch(i.user.id).catch(()=>null);
  if(!member?.roles.cache.has(BELVA_ROLES.carreOr)){await i.editReply('Le hunt des viewers est réservé aux membres 🍾 Carré Or (compte casino vérifié + dépôt). Va dans 🎰 toutes-les-offres pour vérifier ton compte.');return true;}
  const slot=(await searchSlots(pool,i.options.getString('machine',true),1))[0];
  if(!slot){await i.editReply('Machine introuvable : tape le début du nom et choisis dans la liste.');return true;}
  const rumble=(await pool.query(`SELECT l.username FROM automod_discord_links l JOIN streamers s ON s.id=l.streamer_id WHERE lower(s.slug)='belvaa' AND l.discord_user_id=$1`,[i.user.id]).catch(()=>({rows:[]}))).rows[0]?.username as string|undefined;
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
  if(v.status==='done')await pool.query(`UPDATE belva_hunt_messages SET final=true WHERE hunt_id=$1`,[v.id]);
  lastSig=sig;
}

export function startBelvaHunt(client:Client,pool?:Pool){
  if(!pool)return;let busy=false;
  setInterval(()=>{if(busy)return;busy=true;void follow(client,pool).catch(e=>console.error('[nozebot] hunt Belva',e)).finally(()=>{busy=false;});},15_000).unref();
}
