import {ChannelType,MessageFlags,SlashCommandBuilder,type Client,type Guild,type Interaction,type TextChannel} from 'discord.js';
import type {Pool} from 'pg';
import {isApproved} from './belva-approval.js';
import {BELVA_ROLES} from './belva-roles.js';
import {GRADE_KEYS,ROLE_SPEC} from './belva-role-spec.js';
import {GRADES,gradeUpCard,levelFor,tierUpLine} from './belva-progress-designs.js';

// XP du Discord de Belva : chaque gain est un événement unique (source + référence), rejouer le calcul ne double rien.
// Barème validé : chat Rumble +5 (max 1 toutes les 5 min), tournoi 25 + 20 par duel gagné, compte casino vérifié +300,
// dépôt remboursé 1 XP/€ (pas d'XP sur les dépôts offerts), wager Rainbet 1 XP/10 $.
const GUILD_ID=()=>process.env.BELVA_GUILD_ID?.trim()||'1429525570965737668';
const GENERAL_CHANNEL='1482859803905753372';
const REWARDS_CATEGORY='1481924757380272289';
const TOP_CHANNEL='🏅︱classements';
export const XP_START=()=>process.env.BELVA_XP_START?.trim()||'2026-12-01T00:00:00+01:00';
export const XP={chat:5,tournament:25,duel:20,verified:300};

let ready:Promise<unknown>|null=null;
function schema(pool:Pool){
  ready??=pool.query(`CREATE TABLE IF NOT EXISTS belva_xp_events(id bigserial PRIMARY KEY,discord_id text NOT NULL,source text NOT NULL,ref text NOT NULL,xp int NOT NULL,
    at timestamptz NOT NULL DEFAULT NOW(),UNIQUE(source,ref));
    CREATE INDEX IF NOT EXISTS belva_xp_events_user ON belva_xp_events(discord_id);
    CREATE TABLE IF NOT EXISTS belva_xp_levels(discord_id text PRIMARY KEY,label text NOT NULL,grade text NOT NULL,updated_at timestamptz NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS belva_xp_top(channel_id text NOT NULL,message_id text NOT NULL,PRIMARY KEY(channel_id));
    ALTER TABLE IF EXISTS belva_rainbet_wager_snapshots ADD COLUMN IF NOT EXISTS id bigserial`).catch(e=>{ready=null;throw e;});
  return ready;
}

// Sources lues en base (rien n'est inventé) : chaque ligne devient au plus un événement d'XP.
async function collect(pool:Pool){
  const start=XP_START();
  const q=(sql:string,args:unknown[]=[])=>pool.query(sql,args).catch(e=>{console.error('[nozebot] xp source',e?.message||e);return {rows:[]};});
  // Chat Rumble de Belva : un message par tranche de 5 minutes, pour les comptes reliés.
  await q(`INSERT INTO belva_xp_events(discord_id,source,ref,xp)
    SELECT DISTINCT l.discord_user_id,'chat',m.rumble_user_id||':'||floor(extract(epoch FROM m.created_at)/300)::bigint,${XP.chat}
    FROM rumble_chat_messages m JOIN streamers s ON s.id=m.streamer_id AND lower(s.slug)='belvaa'
    JOIN automod_discord_links l ON l.streamer_id=s.id AND l.rumble_user_id=m.rumble_user_id
    WHERE m.created_at>=$1::timestamptz ON CONFLICT DO NOTHING`,[start]);
  // Tournoi terminé : participation + duels gagnés.
  await q(`INSERT INTO belva_xp_events(discord_id,source,ref,xp)
    SELECT e.discord_id,'tournament',e.tournament_id||':'||e.discord_id,${XP.tournament}+${XP.duel}*COALESCE(e.wins,0)
    FROM belva_tournament_entries e JOIN belva_tournaments t ON t.id=e.tournament_id
    WHERE t.status='done' AND e.place IS NOT NULL AND t.finished_at>=$1::timestamptz ON CONFLICT DO NOTHING`,[start]);
  // Compte casino vérifié (un par casino).
  await q(`INSERT INTO belva_xp_events(discord_id,source,ref,xp)
    SELECT discord_id,'verified',casino||':'||discord_id,${XP.verified} FROM belva_casino_accounts
    WHERE guild_id=$1 AND verified_at IS NOT NULL ON CONFLICT DO NOTHING`,[GUILD_ID()]);
  // Dépôt remboursé (payé) : 1 XP par euro déposé. Les dépôts offerts ne rapportent rien.
  await q(`INSERT INTO belva_xp_events(discord_id,source,ref,xp)
    SELECT discord_id,'refund',id::text,GREATEST(1,COALESCE(deposit_eur,amount_eur)) FROM belva_refunds
    WHERE guild_id=$1 AND kind='refund' AND status='paid' AND COALESCE(paid_at,created_at)>=$2::timestamptz ON CONFLICT DO NOTHING`,[GUILD_ID(),start]);
  // Wager Rainbet : 1 XP par tranche de 10 $ de hausse entre deux relevés.
  await q(`INSERT INTO belva_xp_events(discord_id,source,ref,xp)
    SELECT a.discord_id,'wager',s.id::text,floor((s.wagered-p.wagered)/10)::int
    FROM belva_rainbet_wager_snapshots s
    JOIN LATERAL (SELECT wagered FROM belva_rainbet_wager_snapshots p WHERE lower(p.username)=lower(s.username) AND p.at<s.at ORDER BY p.at DESC LIMIT 1) p ON TRUE
    JOIN belva_casino_accounts a ON a.guild_id=$1 AND a.casino='rainbet' AND a.verified_at IS NOT NULL AND lower(a.casino_username)=lower(s.username)
    WHERE s.at>=$2::timestamptz AND s.wagered-p.wagered>=10 ON CONFLICT DO NOTHING`,[GUILD_ID(),start]);
}

export const totals=async(pool:Pool)=>(await pool.query(`SELECT discord_id,SUM(xp)::int AS xp FROM belva_xp_events GROUP BY 1 ORDER BY 2 DESC`)).rows as {discord_id:string;xp:number}[];

// Rubis et au-dessus demandent un dépôt vérifié (rôle Carré Or) : sans lui, on plafonne à Or V.
export function cappedLevel(xp:number,deposited:boolean){
  const l=levelFor(xp);if(!l)return null;
  if(deposited||!('deposit' in l.grade&&l.grade.deposit))return l;
  const orTop=GRADES.findIndex(g=>g.key==='rubis');const below=GRADES[orTop]!.xp-1;
  return levelFor(below);
}

async function applyGrades(client:Client,pool:Pool,guild:Guild,announce:boolean){
  const roles=await guild.roles.fetch();
  const gradeRole=Object.fromEntries(GRADE_KEYS.map(k=>[k,roles.find(r=>r.name===ROLE_SPEC.find(s=>s.key===k)!.name)?.id]));
  const known=new Map((await pool.query(`SELECT discord_id,label,grade FROM belva_xp_levels`)).rows.map(r=>[r.discord_id,r]));
  const general=announce?await client.channels.fetch(GENERAL_CHANNEL).catch(()=>null) as TextChannel|null:null;
  for(const t of await totals(pool)){
    const m=await guild.members.fetch(t.discord_id).catch(()=>null);if(!m)continue;
    const l=cappedLevel(t.xp,m.roles.cache.has(BELVA_ROLES.carreOr));if(!l)continue;
    const want=gradeRole[l.grade.key];
    const extra=Object.values(gradeRole).filter((id):id is string=>!!id&&id!==want&&m.roles.cache.has(id));
    if(extra.length)await m.roles.remove(extra,'Nouveau grade').catch(()=>undefined);
    if(want&&!m.roles.cache.has(want))await m.roles.add(want,`Grade ${l.label}`).catch(()=>undefined);
    const before=known.get(t.discord_id);
    if(before?.label===l.label)continue;
    await pool.query(`INSERT INTO belva_xp_levels(discord_id,label,grade) VALUES($1,$2,$3) ON CONFLICT(discord_id) DO UPDATE SET label=$2,grade=$3,updated_at=NOW()`,[t.discord_id,l.label,l.grade.key]);
    // Changement de grade : grande carte ; simple sous-niveau : une ligne. Premier calcul : rien n'est annoncé.
    if(!general||!before)continue;
    if(before.grade!==l.grade.key)await general.send(gradeUpCard({id:m.id,avatarUrl:m.displayAvatarURL({size:256,extension:'png'})},t.xp)).catch(()=>undefined);
    else await general.send(tierUpLine(m.id,t.xp)).catch(()=>undefined);
  }
}

// Top 10 de l'XP (salon 🏅︱classements) et /rang pour connaître sa place même hors du top.
export function topCard(rows:{discord_id:string;xp:number}[]){
  const medal=['🥇','🥈','🥉'];
  return {flags:MessageFlags.IsComponentsV2 as const,allowedMentions:{parse:[] as never[]},components:[{type:17,accent_color:0x9B7BD4,components:[
    {type:10,content:'# 🏅 Top 10 de l’XP'},
    {type:10,content:rows.length?rows.slice(0,10).map((r,k)=>`${medal[k]??`\`${k+1}.\``} <@${r.discord_id}> · **${r.xp.toLocaleString('fr-FR')} XP** · ${levelFor(r.xp)?.label??'—'}`).join('\n'):'Personne pour l’instant : l’XP démarre au lancement.'},
    {type:14,divider:true,spacing:1},
    {type:10,content:'-# Mis à jour toutes les heures. Tape **/rang** pour voir ta place, ton grade et ce qu’il te manque. XP : chat pendant les lives, tournoi, quêtes, comptes vérifiés, dépôts.'},
  ]}] as never[]};
}
export function rankText(rank:number,total:number,xp:number){
  const l=levelFor(xp);
  if(!l)return `Tu n’as pas encore d’XP. Écris dans le chat Rumble de Belva pendant les lives, joue le tournoi du samedi et fais tes quêtes (/quetes).`;
  const left=l.next?l.next-xp:0;
  return `🏅 **${rank}ᵉ** sur ${total} · **${xp.toLocaleString('fr-FR')} XP** · ${l.label}${l.next?`\nEncore **${left.toLocaleString('fr-FR')} XP** pour le palier suivant.`:'\nNiveau maximum atteint.'}`;
}

const RANK=new SlashCommandBuilder().setName('rang').setDescription('Ta place au classement de l’XP et ton grade');
export async function registerXpCommands(client:Client){
  const guild=await client.guilds.fetch(GUILD_ID()).catch(()=>null);if(!guild)return;
  await guild.commands.create(RANK.toJSON());
}
export async function handleBelvaXp(i:Interaction,pool?:Pool):Promise<boolean>{
  if(!i.isChatInputCommand()||i.commandName!=='rang'||i.guildId!==GUILD_ID())return false;
  if(!pool||!await isApproved(pool,'xp-top')){await i.reply({ephemeral:true,content:'Le classement de l’XP arrive au lancement 🏅'});return true;}
  await schema(pool);
  const all=await totals(pool);const k=all.findIndex(r=>r.discord_id===i.user.id);
  await i.reply({ephemeral:true,content:k<0?rankText(0,all.length,0):rankText(k+1,all.length,all[k]!.xp)});
  return true;
}

async function refreshTop(client:Client,pool:Pool,guild:Guild){
  const all=await guild.channels.fetch();
  const channel=all.find(c=>c?.type===ChannelType.GuildText&&c.name===TOP_CHANNEL) as TextChannel|undefined
    ??await guild.channels.create({name:TOP_CHANNEL,type:ChannelType.GuildText,parent:REWARDS_CATEGORY,topic:'Classements : saison du tournoi et top de l’XP.'});
  const card=topCard(await totals(pool));
  const row=(await pool.query(`SELECT * FROM belva_xp_top WHERE channel_id=$1`,[channel.id])).rows[0];
  const msg=row?await channel.messages.fetch(row.message_id).catch(()=>null):null;
  if(msg)await msg.edit(card);
  else{const m=await channel.send(card);await pool.query(`INSERT INTO belva_xp_top(channel_id,message_id) VALUES($1,$2) ON CONFLICT(channel_id) DO UPDATE SET message_id=$2`,[channel.id,m.id]);}
}

async function tick(client:Client,pool:Pool){
  if(!await isApproved(pool,'grades'))return;
  if(Date.now()<Date.parse(XP_START()))return;
  await schema(pool);
  await collect(pool);
  const guild=await client.guilds.fetch(GUILD_ID());
  await applyGrades(client,pool,guild,true);
  if(await isApproved(pool,'xp-top'))await refreshTop(client,pool,guild);
}

export function startBelvaXp(client:Client,pool?:Pool){
  if(!pool||process.env.BELVA_XP==='false')return;
  let busy=false;
  const run=()=>{if(busy)return;busy=true;void tick(client,pool).catch(e=>console.error('[nozebot] xp Belva',e)).finally(()=>{busy=false;});};
  setTimeout(run,90_000).unref();setInterval(run,60*60_000).unref();
}
