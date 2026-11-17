import {ChannelType,MessageFlags,SlashCommandBuilder,type Client,type Interaction} from 'discord.js';
import type {Pool} from 'pg';
import {isApproved} from './belva-approval.js';
import {levelFor} from './belva-progress-designs.js';
import {ROLE_SPEC} from './belva-role-spec.js';
import {XP_START} from './belva-xp.js';

// Journal de quêtes de la semaine (lundi 0 h, heure de Paris) : progression lue en base, XP versée une fois par quête.
const GUILD_ID=()=>process.env.BELVA_GUILD_ID?.trim()||'1429525570965737668';
const url=(id?:string)=>id?`https://discord.com/channels/${GUILD_ID()}/${id}`:'https://discord.com/channels/'+GUILD_ID();
type Quest={key:string;label:string;need:number;xp:number;once?:boolean;reward:string};
export const QUESTS:Quest[]=[
  {key:'link',label:'Relier ton compte Rumble',need:1,xp:150,once:true,reward:'+150 XP · une seule fois'},
  {key:'lives',label:'Être présent à 3 lives (au moins un message)',need:3,xp:90,reward:'+90 XP'},
  {key:'tournament',label:'Participer au tournoi du samedi',need:1,xp:80,reward:'+80 XP'},
  {key:'blackjack',label:'Jouer 3 mains de blackjack',need:3,xp:40,reward:'+40 XP'},
  {key:'casino',label:'Vérifier un compte casino partenaire',need:1,xp:300,once:true,reward:'+300 XP · rôle 🃏 Membre du Club'},
];
const WEEK_START=`date_trunc('week',NOW() AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'Europe/Paris'`;

// Progression réelle de chaque quête pour un membre.
export async function progress(pool:Pool,discordId:string){
  const one=async(sql:string,args:unknown[])=>Number((await pool.query(sql,args).catch(()=>({rows:[{n:0}]}))).rows[0]?.n??0);
  const link=await one(`SELECT count(*)::int n FROM automod_discord_links l JOIN streamers s ON s.id=l.streamer_id WHERE lower(s.slug)='belvaa' AND l.discord_user_id=$1`,[discordId]);
  // Un « live » = un stream du matin (avant 15 h) ou du soir, un jour donné, heure de Paris.
  const lives=await one(`SELECT count(DISTINCT (date(m.created_at AT TIME ZONE 'Europe/Paris'),(extract(hour FROM m.created_at AT TIME ZONE 'Europe/Paris')>=15)))::int n
    FROM rumble_chat_messages m JOIN streamers s ON s.id=m.streamer_id AND lower(s.slug)='belvaa'
    JOIN automod_discord_links l ON l.streamer_id=s.id AND l.rumble_user_id=m.rumble_user_id
    WHERE l.discord_user_id=$1 AND m.created_at>=${WEEK_START}`,[discordId]);
  const tournament=await one(`SELECT count(*)::int n FROM belva_tournament_entries e JOIN belva_tournaments t ON t.id=e.tournament_id
    WHERE e.discord_id=$1 AND t.status IN ('live','done') AND COALESCE(t.drawn_at,t.created_at)>=${WEEK_START}`,[discordId]);
  const blackjack=await one(`SELECT count(*)::int n FROM nozecoin_blackjack_sessions b JOIN streamers s ON s.id=b.streamer_id AND lower(s.slug)='belvaa'
    WHERE b.discord_user_id=$1 AND b.status='finished' AND b.created_at>=${WEEK_START}`,[discordId]);
  const casino=await one(`SELECT count(*)::int n FROM belva_casino_accounts WHERE guild_id=$1 AND discord_id=$2 AND verified_at IS NOT NULL`,[GUILD_ID(),discordId]);
  return {link,lives,tournament,blackjack,casino} as Record<string,number>;
}

const bar=(pct:number)=>'▰'.repeat(Math.round(pct/10))+'▱'.repeat(10-Math.round(pct/10))+` ${pct} %`;
const spec=(key:string)=>ROLE_SPEC.find(r=>r.key===key)!;
// Boutons d'action : un par quête non terminée (5 max sur une ligne).
export function questJournal(week:number,p:Record<string,number>,xp:number,channels:{link?:string;tournament?:string;games?:string;offers?:string}){
  const done=(q:Quest)=>(p[q.key]??0)>=q.need;
  const l=levelFor(xp);const doneN=QUESTS.filter(done).length;
  const action:Record<string,object>={
    link:{type:2,style:5,label:'Lier mon Rumble',emoji:{name:'🔗'},url:url(channels.link)},
    lives:{type:2,style:5,label:'Voir le live',emoji:{name:'🟢'},url:'https://rumble.com/user/Belvaa/live'},
    tournament:{type:2,style:5,label:'Le tournoi',emoji:{name:'⚔️'},url:url(channels.tournament)},
    blackjack:{type:2,style:5,label:'Mini-jeux',emoji:{name:'🃏'},url:url(channels.games)},
    casino:{type:2,style:5,label:'Les offres',emoji:{name:'🎁'},url:url(channels.offers)},
  };
  return {flags:MessageFlags.IsComponentsV2 as const,components:[{type:17,accent_color:l?spec(l.grade.key).color:0x19D3D3,components:[
    {type:10,content:`# 📜 Journal de quêtes · semaine ${week}`},
    {type:10,content:`${l?l.label:'Pas encore de grade'} · **${xp.toLocaleString('fr-FR')} XP** · ${doneN}/${QUESTS.length} quêtes terminées\n\`${bar(Math.round(doneN/QUESTS.length*100))}\``},
    {type:14,divider:true,spacing:1},
    ...QUESTS.map(q=>{const t={type:10,content:`${done(q)?'✅':'⬜'} **${q.label}**${q.need>1?` · ${Math.min(p[q.key]??0,q.need)}/${q.need}`:''}\n-# ${q.reward}`};
      return done(q)?t:{type:9,components:[t],accessory:action[q.key]};}),
    {type:14,divider:false,spacing:1},
    {type:10,content:'-# Nouvelles quêtes chaque lundi à 0 h. Les quêtes « une seule fois » ne reviennent pas. Tape /quetes à tout moment.'},
  ]}] as never[]};
}

const weekNumber=()=>{const d=new Date();const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));const day=t.getUTCDay()||7;t.setUTCDate(t.getUTCDate()+4-day);
  return Math.ceil(((t.getTime()-Date.UTC(t.getUTCFullYear(),0,1))/86400e3+1)/7);};

// XP des quêtes terminées : une fois par semaine (ou une fois tout court pour les quêtes « une seule fois »).
async function payQuests(pool:Pool,discordId:string,p:Record<string,number>){
  if(Date.now()<Date.parse(XP_START()))return;
  const week=(await pool.query(`SELECT to_char(${WEEK_START},'IYYY-IW') AS w`)).rows[0].w as string;
  for(const q of QUESTS)if((p[q.key]??0)>=q.need)
    await pool.query(`INSERT INTO belva_xp_events(discord_id,source,ref,xp) VALUES($1,'quest',$2,$3) ON CONFLICT DO NOTHING`,[discordId,`${q.once?'once':week}:${q.key}:${discordId}`,q.xp]).catch(()=>undefined);
}

async function channelsOf(client:Client){
  const guild=await client.guilds.fetch(GUILD_ID());const all=await guild.channels.fetch();
  const f=(s:string)=>all.find(c=>c?.type===ChannelType.GuildText&&c.name.endsWith(s))?.id;
  return {link:f('︱lier-mon-compte'),tournament:f('︱tournoi'),games:f('︱mini-jeux'),offers:f('︱toutes-les-offres')};
}
const xpOf=async(pool:Pool,id:string)=>Number((await pool.query(`SELECT COALESCE(SUM(xp),0)::int AS xp FROM belva_xp_events WHERE discord_id=$1`,[id]).catch(()=>({rows:[{xp:0}]}))).rows[0]?.xp??0);

const COMMAND=new SlashCommandBuilder().setName('quetes').setDescription('Ton journal de quêtes de la semaine');
export async function registerQuestCommand(client:Client){
  const guild=await client.guilds.fetch(GUILD_ID()).catch(()=>null);if(!guild)return;
  await guild.commands.create(COMMAND.toJSON());
}
export async function handleBelvaQuests(i:Interaction,pool?:Pool):Promise<boolean>{
  if(!i.isChatInputCommand()||i.commandName!=='quetes'||i.guildId!==GUILD_ID())return false;
  if(!pool||!await isApproved(pool,'quests')){await i.reply({ephemeral:true,content:'Le journal de quêtes arrive au lancement 📜'});return true;}
  await i.deferReply({ephemeral:true});
  const p=await progress(pool,i.user.id);await payQuests(pool,i.user.id,p);
  await i.editReply(questJournal(weekNumber(),p,await xpOf(pool,i.user.id),await channelsOf(i.client)));
  return true;
}

// Lundi : le journal arrive en MP aux membres qui ont relié leur Rumble (une fois par semaine).
async function mondayDms(client:Client,pool:Pool){
  if(!await isApproved(pool,'quests')||Date.now()<Date.parse(XP_START()))return;
  await pool.query(`CREATE TABLE IF NOT EXISTS belva_quest_dms(week text NOT NULL,discord_id text NOT NULL,PRIMARY KEY(week,discord_id))`);
  const week=(await pool.query(`SELECT to_char(${WEEK_START},'IYYY-IW') AS w,extract(isodow FROM NOW() AT TIME ZONE 'Europe/Paris')::int AS d,extract(hour FROM NOW() AT TIME ZONE 'Europe/Paris')::int AS h`)).rows[0];
  if(week.d!==1||week.h<10)return;
  const ids=(await pool.query(`SELECT l.discord_user_id AS id FROM automod_discord_links l JOIN streamers s ON s.id=l.streamer_id WHERE lower(s.slug)='belvaa'`)).rows.map(r=>String(r.id));
  const ch=await channelsOf(client);
  for(const id of ids){
    const fresh=(await pool.query(`INSERT INTO belva_quest_dms(week,discord_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING 1`,[week.w,id])).rowCount;if(!fresh)continue;
    const user=await client.users.fetch(id).catch(()=>null);if(!user)continue;
    await user.send({content:'📜 **Nouvelle semaine, nouvelles quêtes !** Voici ton journal (tape /quetes sur le serveur pour le revoir).'}).catch(()=>undefined);
    await user.send(questJournal(weekNumber(),await progress(pool,id),await xpOf(pool,id),ch)).catch(()=>undefined);
  }
}

// L'XP des quêtes est aussi versée chaque heure, sans attendre que le membre ouvre son journal.
async function payAll(pool:Pool){
  if(!await isApproved(pool,'quests')||Date.now()<Date.parse(XP_START()))return;
  const ids=(await pool.query(`SELECT l.discord_user_id AS id FROM automod_discord_links l JOIN streamers s ON s.id=l.streamer_id WHERE lower(s.slug)='belvaa'`)).rows.map(r=>String(r.id));
  for(const id of ids)await payQuests(pool,id,await progress(pool,id));
}

export function startBelvaQuests(client:Client,pool?:Pool){
  if(!pool)return;
  setInterval(()=>void mondayDms(client,pool).catch(e=>console.error('[nozebot] quêtes Belva',e)),30*60_000).unref();
  setInterval(()=>void payAll(pool).catch(e=>console.error('[nozebot] xp quêtes Belva',e)),60*60_000).unref();
}
