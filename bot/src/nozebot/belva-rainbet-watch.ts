import type {Client,TextChannel} from 'discord.js';
import type {Pool} from 'pg';
import {fetchWagers} from './rainbet-race.js';
import {BELVA_ROLES,grantCasinoRoles} from './belva-roles.js';
import {isApproved} from './belva-approval.js';
import {GENERAL_CHANNEL,collect} from './belva-xp.js';
import {wagerRecapCard,wagerRecapLine} from './belva-progress-designs.js';

// Historique du wager Rainbet (l'API ne donne aucun montant de dépôt). Une hausse d'au moins DEPOSIT_SIGNAL $
// entre deux relevés est notée comme probable dépôt ; un membre vérifié qui se met à miser passe Carré Or.
const GUILD_ID=()=>process.env.BELVA_GUILD_ID?.trim()||'1429525570965737668';
export const DEPOSIT_SIGNAL=()=>Number(process.env.BELVA_RAINBET_DEPOSIT_SIGNAL_USD)||30;

let ready:Promise<unknown>|null=null;
function schema(pool:Pool){
  ready??=pool.query(`CREATE TABLE IF NOT EXISTS belva_rainbet_wager_snapshots(username text NOT NULL,wagered numeric NOT NULL,at timestamptz NOT NULL DEFAULT NOW());
    CREATE INDEX IF NOT EXISTS belva_rainbet_wager_snapshots_user ON belva_rainbet_wager_snapshots(lower(username),at DESC);
    CREATE TABLE IF NOT EXISTS belva_rainbet_deposit_signals(id serial PRIMARY KEY,username text NOT NULL,delta numeric NOT NULL,wagered numeric NOT NULL,at timestamptz NOT NULL DEFAULT NOW())`).catch(e=>{ready=null;throw e;});
  return ready;
}

// Le total renvoyé couvre une fenêtre glissante de 4 mois : il peut baisser quand d'anciennes mises sortent de la fenêtre.
export function wagerSignals(previous:Map<string,number>,current:{username:string;wagered:number}[],threshold:number){
  const changed:{username:string;wagered:number;delta:number}[]=[];
  for(const c of current){
    const before=previous.get(c.username.toLowerCase());
    if(before!==undefined&&Math.abs(c.wagered-before)<0.005)continue;
    changed.push({...c,delta:before===undefined?c.wagered:c.wagered-before});
  }
  // Premier relevé : on pose la base sans signaler les mises déjà faites.
  return {changed,deposits:previous.size?changed.filter(c=>c.delta>=threshold):[]};
}

type Snap={id:string;wagered:number;at:Date};
// Session = relevés en hausse consécutifs (écart d'au plus SESSION_GAP entre deux) ; elle est finie quand le dernier relevé
// n'a pas bougé et date d'au moins MIN_IDLE (un redémarrage du bot relance un relevé sans attendre l'heure).
const SESSION_GAP=75*60_000,MIN_IDLE=45*60_000,MAX_AGE=24*3_600_000;
export function endedSession(snaps:Snap[],lastNotified:number,now:number){
  const last=snaps[0];if(!last||Number(last.id)<=lastNotified||now-last.at.getTime()<MIN_IDLE)return null;
  if(now-last.at.getTime()>MAX_AGE)return {run:[last],wager:0};
  let k=0;while(k+1<snaps.length&&Number(snaps[k+1]!.id)>lastNotified&&snaps[k]!.at.getTime()-snaps[k+1]!.at.getTime()<=SESSION_GAP&&snaps[k+1]!.wagered<snaps[k]!.wagered)k++;
  // Relevé de base (avant la session) : sans lui, c'est le premier relevé du compte et il n'y a pas de mise à attribuer.
  const base=snaps[k+1];
  return {run:snaps.slice(0,k+1),wager:base?last.wagered-base.wagered:0};
}

async function recapSessions(client:Client,pool:Pool,moved:Set<string>){
  if(!await isApproved(pool,'grades')||!await isApproved(pool,'wager-recap'))return;
  await pool.query(`CREATE TABLE IF NOT EXISTS belva_wager_sessions(discord_id text NOT NULL,last_snapshot_id bigint NOT NULL,wager numeric NOT NULL,xp int NOT NULL,
    sent text,at timestamptz NOT NULL DEFAULT NOW(),PRIMARY KEY(discord_id,last_snapshot_id))`);
  // XP du wager posée avant le récap (même calcul que le tick horaire de l'XP, sans double compte).
  await collect(pool);
  const accounts=(await pool.query(`SELECT discord_id,casino_username FROM belva_casino_accounts WHERE guild_id=$1 AND casino='rainbet' AND verified_at IS NOT NULL`,[GUILD_ID()])).rows as {discord_id:string;casino_username:string}[];
  for(const a of accounts){
    if(moved.has(a.casino_username.toLowerCase()))continue;
    const done=Number((await pool.query(`SELECT COALESCE(max(last_snapshot_id),0) m FROM belva_wager_sessions WHERE discord_id=$1`,[a.discord_id])).rows[0].m);
    const snaps=(await pool.query(`SELECT id,wagered,at FROM belva_rainbet_wager_snapshots WHERE lower(username)=lower($1) ORDER BY at DESC LIMIT 50`,[a.casino_username])).rows
      .map(r=>({id:String(r.id),wagered:Number(r.wagered),at:new Date(r.at)}));
    const s=endedSession(snaps,done,Date.now());if(!s)continue;
    const xp=s.wager>=10?Number((await pool.query(`SELECT COALESCE(sum(xp),0) x FROM belva_xp_events WHERE discord_id=$1 AND source='wager' AND ref=ANY($2::text[])`,[a.discord_id,s.run.map(r=>r.id)])).rows[0].x):0;
    const fresh=(await pool.query(`INSERT INTO belva_wager_sessions(discord_id,last_snapshot_id,wager,xp,sent) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING 1`,
      [a.discord_id,s.run[0]!.id,s.wager,xp,xp>0?null:'skip'])).rowCount;
    if(!fresh||xp<=0)continue;
    const total=Number((await pool.query(`SELECT COALESCE(sum(xp),0) x FROM belva_xp_events WHERE discord_id=$1`,[a.discord_id])).rows[0].x);
    const user=await client.users.fetch(a.discord_id).catch(()=>null);
    let sent=user?await user.send(wagerRecapCard({id:a.discord_id,avatarUrl:user.displayAvatarURL({size:256,extension:'png'})},{wager:s.wager,xp,total})).then(()=>'dm',()=>null):null;
    if(!sent){const general=await client.channels.fetch(GENERAL_CHANNEL).catch(()=>null) as TextChannel|null;
      sent=general?await general.send(wagerRecapLine(a.discord_id,{xp,total})).then(()=>'general',()=>'none'):'none';}
    await pool.query(`UPDATE belva_wager_sessions SET sent=$3 WHERE discord_id=$1 AND last_snapshot_id=$2`,[a.discord_id,s.run[0]!.id,sent]);
  }
}

async function tick(client:Client,pool:Pool){
  await schema(pool);
  const day=(t:number)=>new Date(t).toISOString().slice(0,10);
  const list=await fetchWagers({start:day(Date.now()-119*86_400_000),end:day(Date.now()),endsAt:new Date(),label:''});
  const prev=new Map<string,number>((await pool.query(`SELECT DISTINCT ON (lower(username)) lower(username) AS u,wagered FROM belva_rainbet_wager_snapshots ORDER BY lower(username),at DESC`)).rows.map(r=>[r.u,Number(r.wagered)]));
  const {changed,deposits}=wagerSignals(prev,list,DEPOSIT_SIGNAL());
  for(const c of changed)await pool.query(`INSERT INTO belva_rainbet_wager_snapshots(username,wagered) VALUES($1,$2)`,[c.username,c.wagered]);
  for(const d of deposits)await pool.query(`INSERT INTO belva_rainbet_deposit_signals(username,delta,wagered) VALUES($1,$2,$3)`,[d.username,d.delta,d.wagered]);
  await recapSessions(client,pool,new Set(changed.map(c=>c.username.toLowerCase()))).catch(e=>console.error('[nozebot] récap session Rainbet',e?.message||e));
  // Membres vérifiés sur Rainbet qui ont misé depuis : rôle Carré Or (avoir misé = avoir déposé).
  const wagered=new Set(list.filter(w=>w.wagered>0).map(w=>w.username.toLowerCase()));
  const accounts=(await pool.query(`SELECT discord_id,casino_username FROM belva_casino_accounts WHERE guild_id=$1 AND casino='rainbet' AND verified_at IS NOT NULL`,[GUILD_ID()]).catch(()=>({rows:[]}))).rows as {discord_id:string;casino_username:string}[];
  const todo=accounts.filter(a=>wagered.has(a.casino_username.toLowerCase()));
  if(!todo.length)return;
  const guild=await client.guilds.fetch(GUILD_ID());
  for(const a of todo){
    const m=await guild.members.fetch(a.discord_id).catch(()=>null);
    if(m&&!m.roles.cache.has(BELVA_ROLES.carreOr))await grantCasinoRoles(m,'rainbet',true,'Mises Rainbet détectées (wager)').catch(()=>undefined);
  }
}

export function startBelvaRainbetWatch(client:Client,pool?:Pool){
  if(!pool||process.env.BELVA_RAINBET_WATCH==='false')return;
  const run=()=>void tick(client,pool).catch(e=>console.error('[nozebot] suivi wager Rainbet',e?.message||e));
  setTimeout(run,60_000).unref();setInterval(run,60*60_000).unref();
}
