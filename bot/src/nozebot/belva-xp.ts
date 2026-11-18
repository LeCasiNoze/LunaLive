import {ChannelType,MessageFlags,SlashCommandBuilder,type Client,type Guild,type GuildMember,type Interaction,type TextChannel} from 'discord.js';
import type {Pool} from 'pg';
import {isApproved} from './belva-approval.js';
import {BELVA_ROLES} from './belva-roles.js';
import {GRADE_KEYS,ROLE_SPEC} from './belva-role-spec.js';
import {LCN_GUILD,LINK_SLUGS,findChannel} from './belva-guilds.js';
import {lcnRole} from './lcn-role-spec.js';
import {fetchWagers} from './rainbet-race.js';
import {GRADES,gradeUpCard,levelFor,tierUpLine} from './belva-progress-designs.js';

// XP du Discord de Belva : chaque gain est un événement unique (source + référence), rejouer le calcul ne double rien.
// Barème validé : chat Rumble +5 (max 1 toutes les 5 min), tournoi 25 + 20 par duel gagné, compte casino vérifié +300,
// dépôt remboursé 1 XP/€ (pas d'XP sur les dépôts offerts), wager Rainbet 1 XP/10 $.
const GUILD_ID=()=>process.env.BELVA_GUILD_ID?.trim()||'1429525570965737668';
const GENERAL_CHANNEL='1482859803905753372';
const REWARDS_CATEGORY='1481924757380272289';
const TOP_CHANNEL='🏅︱classements';
// XP comptée rétroactivement depuis le début du duo (décision de Lucas, 17/11/2026).
export const XP_START=()=>process.env.BELVA_XP_START?.trim()||'2026-11-01T00:00:00+01:00';
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
  // Chat Rumble de Belva et de LeCasiNoze : un message par tranche de 5 minutes (tous lives confondus), pour les comptes reliés.
  await q(`INSERT INTO belva_xp_events(discord_id,source,ref,xp)
    SELECT DISTINCT l.discord_user_id,'chat',m.rumble_user_id||':'||floor(extract(epoch FROM m.created_at)/300)::bigint,${XP.chat}
    FROM rumble_chat_messages m JOIN streamers s ON s.id=m.streamer_id AND lower(s.slug) IN ${LINK_SLUGS}
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

const VIP_CATEGORY='1483118160344514650';
// Rubis et plus voient le salon 💎 VIP (et ses giveaways exclusifs).
async function ensureVipAccess(guild:Guild){
  const roles=await guild.roles.fetch();
  const ids=['rubis','saphir','diamant','obsidienne'].map(k=>roles.find(r=>r.name===ROLE_SPEC.find(s=>s.key===k)!.name)?.id).filter((x):x is string=>!!x);
  for(const c of (await guild.channels.fetch()).filter(c=>c&&(c.id===VIP_CATEGORY||c.parentId===VIP_CATEGORY)).values())
    for(const id of ids)if(c&&'permissionOverwrites' in c&&!c.permissionOverwrites.cache.has(id))await c.permissionOverwrites.edit(id,{ViewChannel:true,Connect:true},{reason:'Avantage de grade Rubis+'}).catch(()=>undefined);
}

async function diamondReward(client:Client,pool:Pool,guild:Guild,discordId:string){
  await pool.query(`CREATE TABLE IF NOT EXISTS belva_grade_rewards(discord_id text NOT NULL,grade text NOT NULL,at timestamptz NOT NULL DEFAULT NOW(),PRIMARY KEY(discord_id,grade))`);
  const fresh=(await pool.query(`INSERT INTO belva_grade_rewards(discord_id,grade) VALUES($1,'diamant') ON CONFLICT DO NOTHING RETURNING 1`,[discordId])).rowCount;if(!fresh)return;
  const list=(await guild.channels.fetch()).find(c=>c?.type===ChannelType.GuildText&&c.name==='📋︱liste-remboursements') as TextChannel|undefined;
  await list?.send({content:`💎 <@${discordId}> vient d’atteindre **Diamant** : **cash prize de 100 €** à verser (même règle que les remboursements : en priorité sur un casino où il n’a pas encore de compte).`,allowedMentions:{parse:[]}});
  const user=await client.users.fetch(discordId).catch(()=>null);
  await user?.send('💎 Bravo, tu es **Diamant** sur le Discord de Belva ! Ton **cash prize de 100 €** arrive : le staff te contacte pour savoir où te l’envoyer.').catch(()=>undefined);
}

async function applyGrades(client:Client,pool:Pool,guild:Guild,announce:boolean){
  // Mêmes grades sur les deux Discord : noms de Belva chez Belva, noms LunaLive chez LeCasiNoze.
  const lcn=await client.guilds.fetch(LCN_GUILD()).catch(()=>null);
  const roleMap=async(g:Guild,nameOf:(k:string)=>string)=>{const roles=await g.roles.fetch();
    return Object.fromEntries(GRADE_KEYS.map(k=>[k,roles.find(r=>r.name===nameOf(k))?.id])) as Record<string,string|undefined>;};
  const belvaRoles=await roleMap(guild,k=>ROLE_SPEC.find(s=>s.key===k)!.name);
  const lcnRoles=lcn?await roleMap(lcn,k=>lcnRole(k).name):{};
  const lcnVip=lcn?(await lcn.roles.fetch()).find(r=>r.name===lcnRole('carreOr').name)?.id:undefined;
  const paid=new Set((await pool.query(`SELECT DISTINCT discord_id FROM belva_refunds WHERE status='paid'`).catch(()=>({rows:[]}))).rows.map(r=>String(r.discord_id)));
  const known=new Map((await pool.query(`SELECT discord_id,label,grade FROM belva_xp_levels`)).rows.map(r=>[r.discord_id,r]));
  const general=announce?await client.channels.fetch(GENERAL_CHANNEL).catch(()=>null) as TextChannel|null:null;
  const lcnGeneral=announce&&lcn?await findChannel(lcn,'general')??null:null;
  const setGrade=async(m:GuildMember,map:Record<string,string|undefined>,want:string|undefined,label:string)=>{
    const extra=Object.values(map).filter((id):id is string=>!!id&&id!==want&&m.roles.cache.has(id));
    if(extra.length)await m.roles.remove(extra,'Nouveau grade').catch(()=>undefined);
    if(want&&!m.roles.cache.has(want))await m.roles.add(want,`Grade ${label}`).catch(()=>undefined);
  };
  for(const t of await totals(pool)){
    const mb=await guild.members.fetch(t.discord_id).catch(()=>null);
    const ml=lcn?await lcn.members.fetch(t.discord_id).catch(()=>null):null;
    if(!mb&&!ml)continue;
    // Dépôt vérifié (remboursement payé) : rôle Carré Or / Table VIP sur l'un des deux Discord, ou paiement en base.
    const deposit=!!mb?.roles.cache.has(BELVA_ROLES.carreOr)||!!(lcnVip&&ml?.roles.cache.has(lcnVip))||paid.has(t.discord_id);
    const l=cappedLevel(t.xp,deposit);if(!l)continue;
    if(mb)await setGrade(mb,belvaRoles,belvaRoles[l.grade.key],l.label);
    if(ml)await setGrade(ml,lcnRoles,lcnRoles[l.grade.key],l.label);
    const before=known.get(t.discord_id);
    if(before?.label===l.label)continue;
    await pool.query(`INSERT INTO belva_xp_levels(discord_id,label,grade) VALUES($1,$2,$3) ON CONFLICT(discord_id) DO UPDATE SET label=$2,grade=$3,updated_at=NOW()`,[t.discord_id,l.label,l.grade.key]);
    // Changement de grade : grande carte ; simple sous-niveau : une ligne. Premier calcul : rien n'est annoncé.
    // Diamant : cash prize de 100 € une seule fois, le staff le verse comme un remboursement.
    if(l.grade.key==='diamant'||l.grade.key==='obsidienne')await diamondReward(client,pool,guild,t.discord_id);
    if(!before)continue;
    const who=(mb??ml)!;
    const msg=before.grade!==l.grade.key?gradeUpCard({id:who.id,avatarUrl:who.displayAvatarURL({size:256,extension:'png'})},t.xp):tierUpLine(who.id,t.xp);
    if(mb&&general)await general.send(msg).catch(()=>undefined);
    if(ml&&lcnGeneral)await lcnGeneral.send(msg).catch(()=>undefined);
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

// Wager Rainbet avant le premier relevé (17/11) : XP rétroactive depuis XP_START, une seule fois par compte.
async function wagerBase(pool:Pool){
  const first=(await pool.query(`SELECT min(at) t FROM belva_rainbet_wager_snapshots`).catch(()=>({rows:[]}))).rows[0]?.t as Date|undefined;if(!first)return;
  const start=XP_START().slice(0,10),end=new Date(new Date(first).getTime()-86_400_000).toISOString().slice(0,10);
  if(end<start)return;
  const list=await fetchWagers({start,end,endsAt:new Date(first),label:''}).catch(()=>[]);
  for(const w of list){
    const xp=Math.floor(w.wagered/10);if(xp<=0)continue;
    await pool.query(`INSERT INTO belva_xp_events(discord_id,source,ref,xp) SELECT a.discord_id,'wager',$2,$3 FROM belva_casino_accounts a
      WHERE a.casino='rainbet' AND a.verified_at IS NOT NULL AND lower(a.casino_username)=lower($1) LIMIT 1 ON CONFLICT DO NOTHING`,[w.username,`base:${w.username.toLowerCase()}:${start}`,xp]);
  }
}

async function tick(client:Client,pool:Pool){
  if(!await isApproved(pool,'grades'))return;
  if(Date.now()<Date.parse(XP_START()))return;
  await schema(pool);
  await collect(pool);
  await wagerBase(pool).catch(e=>console.error('[nozebot] xp wager rétroactive',e?.message||e));
  const guild=await client.guilds.fetch(GUILD_ID());
  await ensureVipAccess(guild).catch(e=>console.error('[nozebot] accès VIP',e?.message||e));
  await applyGrades(client,pool,guild,true);
  if(await isApproved(pool,'xp-top'))await refreshTop(client,pool,guild);
}

export function startBelvaXp(client:Client,pool?:Pool){
  if(!pool||process.env.BELVA_XP==='false')return;
  let busy=false;
  const run=()=>{if(busy)return;busy=true;void tick(client,pool).catch(e=>console.error('[nozebot] xp Belva',e)).finally(()=>{busy=false;});};
  setTimeout(run,90_000).unref();setInterval(run,60*60_000).unref();
}
