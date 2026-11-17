import type {Client} from 'discord.js';
import type {Pool} from 'pg';
import {fetchWagers} from './rainbet-race.js';
import {BELVA_ROLES,grantCasinoRoles} from './belva-roles.js';

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

async function tick(client:Client,pool:Pool){
  await schema(pool);
  const day=(t:number)=>new Date(t).toISOString().slice(0,10);
  const list=await fetchWagers({start:day(Date.now()-119*86_400_000),end:day(Date.now()),endsAt:new Date(),label:''});
  const prev=new Map<string,number>((await pool.query(`SELECT DISTINCT ON (lower(username)) lower(username) AS u,wagered FROM belva_rainbet_wager_snapshots ORDER BY lower(username),at DESC`)).rows.map(r=>[r.u,Number(r.wagered)]));
  const {changed,deposits}=wagerSignals(prev,list,DEPOSIT_SIGNAL());
  for(const c of changed)await pool.query(`INSERT INTO belva_rainbet_wager_snapshots(username,wagered) VALUES($1,$2)`,[c.username,c.wagered]);
  for(const d of deposits)await pool.query(`INSERT INTO belva_rainbet_deposit_signals(username,delta,wagered) VALUES($1,$2,$3)`,[d.username,d.delta,d.wagered]);
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
