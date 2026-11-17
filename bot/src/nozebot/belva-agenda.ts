import {ChannelType,MessageFlags,PermissionFlagsBits,SlashCommandBuilder,type Client,type Interaction,type TextChannel} from 'discord.js';
import type {Pool} from 'pg';
import {isApproved} from './belva-approval.js';

// Agenda de la semaine du Discord de Belva : streams du matin et du soir chaque jour, events fixes,
// absences et notes ajoutées par le staff (/agenda). Une carte par semaine, réécrite à chaque changement.
const GUILD_ID=()=>process.env.BELVA_GUILD_ID?.trim()||'1429525570965737668';
const INFOS_CATEGORY='1429525571661987936';
const CHANNEL_NAME='📅︱agenda';
const DAYS=['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'] as const;
const SLOTS={matin:'🌅 10 h',soir:'🌙 19 h 30'} as const;
// Qui stream : le matin LeCasiNoze, le soir Belva (comptes Discord).
export const HOSTS={matin:'682472610868887567',soir:'506048442813120513'} as const;
type Slot=keyof typeof SLOTS;
// Programme type (validé avec Belva le 18/11/2026) ; null = pas de stream sur ce créneau.
export const WEEK:{[d in typeof DAYS[number]]:{event?:string;matin:string|null;soir:string|null}}={
  lundi:{matin:null,soir:'stream raw Rainbet'},
  mardi:{matin:'stream raw Rainbet',soir:'start 2K'},
  mercredi:{event:'🎯 Hunt des viewers',matin:'farm du hunt (fais ton call dans 🎯 hunt)',soir:'ouverture du hunt'},
  jeudi:{matin:'stream',soir:'stream raw Rainbet'},
  vendredi:{matin:'stream raw Rainbet',soir:'start 2K'},
  samedi:{event:'⚔️ Tournoi',matin:'stream',soir:'duels du tournoi (tirage du bracket à 18 h)'},
  dimanche:{matin:'stream raw Rainbet',soir:null},
};
const T=(content:string)=>({type:10,content});
const channelUrl=(id?:string)=>`https://discord.com/channels/${GUILD_ID()}${id?'/'+id:''}`;
const SEP=(spacing=1,divider=true)=>({type:14,divider,spacing});

let ready:Promise<unknown>|null=null;
function schema(pool:Pool){
  ready??=pool.query(`CREATE TABLE IF NOT EXISTS belva_agenda_notes(id serial PRIMARY KEY,day date NOT NULL,slot text NOT NULL,kind text NOT NULL,who text,text text,
    created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS belva_agenda_weeks(week date PRIMARY KEY,channel_id text NOT NULL,message_id text NOT NULL)`).catch(e=>{ready=null;throw e;});
  return ready;
}

// Lundi (heure de Paris) de la semaine de `d`, au format AAAA-MM-JJ.
export function mondayOf(d:Date){
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'}).formatToParts(d);
  const get=(t:string)=>p.find(x=>x.type===t)!.value;
  const wd=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(get('weekday'));
  const day=new Date(Date.UTC(Number(get('year')),Number(get('month'))-1,Number(get('day'))-wd));
  return day.toISOString().slice(0,10);
}
const addDays=(iso:string,n:number)=>new Date(Date.parse(iso+'T12:00:00Z')+n*86400e3).toISOString().slice(0,10);
const label=(iso:string)=>new Intl.DateTimeFormat('fr-FR',{timeZone:'UTC',day:'numeric',month:'long'}).format(new Date(iso+'T12:00:00Z')).replace(/^1 /,'1er ');

type Note={day:string;slot:string;kind:'absent'|'note';who:string|null;text:string|null};
const parisDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function agendaCard(monday:string,notes:Note[],today=mondayOf(new Date())===monday?parisDay():null,ch:{hunt?:string;tournament?:string}={}){
  const lines=DAYS.map((d,i)=>{
    const iso=addDays(monday,i),w=WEEK[d],ns=notes.filter(n=>n.day===iso);
    const slot=(s:Slot)=>{
      const abs=ns.filter(n=>n.kind==='absent'&&(n.slot===s||n.slot==='journee'));
      const what=w[s];
      if(what===null)return `> ${SLOTS[s]} · *pas de stream*`;
      return `> ${SLOTS[s]} · <@${HOSTS[s]}> · ${what}${abs.length?` · ⚠️ ${abs.map(a=>`${a.who} absent`).join(', ')}`:''}`;
    };
    const extra=ns.filter(n=>n.kind==='note').map(n=>`> 📝 ${n.text}`);
    const head=`**${iso===today?'▶️ ':''}${d[0]!.toUpperCase()+d.slice(1)} ${label(iso)}**${w.event?` · ${w.event}`:''}`;
    return [head,slot('matin'),slot('soir'),...extra].join('\n');
  });
  return {flags:MessageFlags.IsComponentsV2 as const,allowedMentions:{parse:[] as never[]},components:[{type:17,accent_color:0x19D3D3,components:[
    T(`# 📅 Agenda · semaine du ${label(monday)}`),
    T(`Le matin à **10 h** avec <@${HOSTS.matin}>, le soir à **19 h 30** avec <@${HOSTS.soir}>. Les events sont indiqués à côté du jour. Le dimanche soir, Belva se repose.`),
    SEP(),
    T(lines.slice(0,4).join('\n\n')),SEP(1,false),T(lines.slice(4).join('\n\n')),
    SEP(),
    {type:1,components:[{type:2,style:5,label:'Faire mon call (hunt)',emoji:{name:'🎯'},url:channelUrl(ch.hunt)},{type:2,style:5,label:'M’inscrire au tournoi',emoji:{name:'⚔️'},url:channelUrl(ch.tournament)}]},
    T('-# Le staff met l’agenda à jour avec /agenda. Les horaires peuvent bouger : suivez 🔔 les notifications live.'),
  ]}] as never[]};
}

const COMMAND=new SlashCommandBuilder().setName('agenda').setDescription('Mettre à jour l’agenda de la semaine (staff)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addSubcommand(s=>s.setName('absent').setDescription('Signaler une absence')
    .addStringOption(o=>o.setName('jour').setDescription('Le jour').setRequired(true).addChoices(...DAYS.map(d=>({name:d,value:d}))))
    .addStringOption(o=>o.setName('moment').setDescription('Matin, soir ou toute la journée').setRequired(true).addChoices({name:'matin (10 h)',value:'matin'},{name:'soir (19 h 30)',value:'soir'},{name:'toute la journée',value:'journee'}))
    .addStringOption(o=>o.setName('qui').setDescription('Le nom affiché (ton pseudo par défaut)')))
  .addSubcommand(s=>s.setName('note').setDescription('Ajouter une info sur un jour (event, giveaway, horaire décalé…)')
    .addStringOption(o=>o.setName('jour').setDescription('Le jour').setRequired(true).addChoices(...DAYS.map(d=>({name:d,value:d}))))
    .addStringOption(o=>o.setName('texte').setDescription('Ex. Giveaway 50 € à 21 h').setRequired(true).setMaxLength(120)))
  .addSubcommand(s=>s.setName('effacer').setDescription('Retirer les absences et notes d’un jour')
    .addStringOption(o=>o.setName('jour').setDescription('Le jour').setRequired(true).addChoices(...DAYS.map(d=>({name:d,value:d})))));

export async function registerAgendaCommand(client:Client){
  const guild=await client.guilds.fetch(GUILD_ID()).catch(()=>null);if(!guild)return;
  await guild.commands.create(COMMAND.toJSON());
}

const weekNotes=async(pool:Pool,monday:string)=>(await pool.query(`SELECT to_char(day,'YYYY-MM-DD') AS day,slot,kind,who,text FROM belva_agenda_notes WHERE day BETWEEN $1::date AND $1::date+6 ORDER BY id`,[monday])).rows as Note[];

export async function refreshAgenda(client:Client,pool:Pool){
  if(!await isApproved(pool,'agenda'))return;
  await schema(pool);
  const guild=await client.guilds.fetch(GUILD_ID());
  const all=await guild.channels.fetch();
  let channel=all.find(c=>c?.type===ChannelType.GuildText&&c.name===CHANNEL_NAME) as TextChannel|undefined;
  channel??=await guild.channels.create({name:CHANNEL_NAME,type:ChannelType.GuildText,parent:INFOS_CATEGORY,topic:'Le programme de la semaine : streams, hunt, tournoi, giveaways.'});
  const monday=mondayOf(new Date());
  const find=(n:string)=>all.find(c=>c?.type===ChannelType.GuildText&&c.name===n)?.id;
  const card=agendaCard(monday,await weekNotes(pool,monday),undefined,{hunt:find('🎯︱hunt'),tournament:find('⚔️︱tournoi')});
  const row=(await pool.query(`SELECT * FROM belva_agenda_weeks WHERE week=$1`,[monday])).rows[0];
  const msg=row?await channel.messages.fetch(row.message_id).catch(()=>null):null;
  if(msg)await msg.edit(card);
  else{const m=await channel.send(card);await pool.query(`INSERT INTO belva_agenda_weeks(week,channel_id,message_id) VALUES($1,$2,$3) ON CONFLICT(week) DO UPDATE SET channel_id=$2,message_id=$3`,[monday,channel.id,m.id]);}
}

export async function handleBelvaAgenda(i:Interaction,pool?:Pool):Promise<boolean>{
  if(!i.isChatInputCommand()||i.commandName!=='agenda'||i.guildId!==GUILD_ID())return false;
  if(!pool||!await isApproved(pool,'agenda')){await i.reply({ephemeral:true,content:'L’agenda arrive bientôt.'});return true;}
  await schema(pool);
  const sub=i.options.getSubcommand(),day=addDays(mondayOf(new Date()),DAYS.indexOf(i.options.getString('jour',true) as typeof DAYS[number]));
  const name=i.options.getString('qui')??(i.member&&'displayName' in i.member?i.member.displayName:i.user.username);
  if(sub==='absent')await pool.query(`INSERT INTO belva_agenda_notes(day,slot,kind,who,created_by) VALUES($1,$2,'absent',$3,$4)`,[day,i.options.getString('moment',true),name.slice(0,40),i.user.id]);
  if(sub==='note')await pool.query(`INSERT INTO belva_agenda_notes(day,slot,kind,text,created_by) VALUES($1,'journee','note',$2,$3)`,[day,i.options.getString('texte',true),i.user.id]);
  if(sub==='effacer')await pool.query(`DELETE FROM belva_agenda_notes WHERE day=$1`,[day]);
  await refreshAgenda(i.client,pool);
  await i.reply({ephemeral:true,content:'Agenda mis à jour ✅'});
  return true;
}

export function startBelvaAgenda(client:Client,pool?:Pool){
  if(!pool)return;
  const run=()=>void refreshAgenda(client,pool).catch(e=>console.error('[nozebot] agenda Belva',e));
  run();setInterval(run,10*60_000).unref();
}
