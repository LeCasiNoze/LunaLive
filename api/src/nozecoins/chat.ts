import type {Pool} from 'pg';
import {inTransaction} from '../automod-shop/wallet.js';
import {validRumbleIdentity} from '../automod-shop/rules.js';
import {notifyShop} from '../automod-shop/notify.js';
import {coinsSchema,coinAction,coinsProfile} from './wallet.js';
import {COIN_RULES} from './rules.js';
type Message={streamerId:number;userId:string;username:string;messageId:string;text:string;createdAt:Date};
export async function handleCoinsChat(pool:Pool,m:Message){
 if(process.env.NOZECOINS_ENABLED!=='true'||!/^!(claim|slot|solde|profil|profile|rain)\s*$/i.test(m.text.trim()))return null;
 if(!validRumbleIdentity(m.userId)||!m.messageId||Date.now()-m.createdAt.getTime()>120000||m.createdAt.getTime()>Date.now()+30000)return null;
 const command=m.text.trim().slice(1).toLowerCase();
 if(['profil','profile','solde'].includes(command)){
  const p=await coinsProfile(pool,m.streamerId,m.userId,m.username);
  return `@${m.username} — ${p.balance} NozeCoins · ${p.automod} points Automod disponibles. Claim : ${p.rules.claim} / ${p.rules.claimMs/3600000} h. Discord : /shop.`;
 }
 if(command==='rain'){
  const mode=(await pool.query('SELECT desired_enabled FROM automod_control WHERE streamer_id=$1',[m.streamerId])).rows[0];
  if(mode?.desired_enabled!==false)return null; // Automod keeps its own rain and currency.
 }
 try{
  const result=await coinAction(pool,m.streamerId,m.userId,m.username,command as 'claim'|'slot'|'rain',`rumble:${command}:${m.messageId}`);
  if(result.replayed)return command==='rain'?`@${m.username} — Rain déjà récupérée.`:null;
  if(!result.ok)return `@${m.username} — Délai en cours : ${Math.max(1,Math.ceil((new Date(String(result.nextAt)).getTime()-Date.now())/60000))} min.`;
  return `@${m.username} — ${command==='slot'?`${result.art} · mise ${result.bet}, retour ${result.payout}`:`+${result.delta}`} NozeCoins · solde ${result.balance}.`;
 }catch(e){const code=e instanceof Error?e.message:'';
  if(code==='no_rain')return `@${m.username} — Pas de rain NozeCoins en cours.`;
  if(code==='insufficient_coins')return `@${m.username} — Pas assez de NozeCoins. !claim pour ton bonus quotidien.`;
  throw e;
 }
}
export async function tickCoinsRain(pool:Pool,sid:number){
 if(process.env.NOZECOINS_ENABLED!=='true')return;
 await coinsSchema(pool);
 const rain=await inTransaction(pool,async c=>{
  await c.query('SELECT pg_advisory_xact_lock($1)',[sid]);
  const live=(await c.query(`SELECT i.live_video_id_numeric AS id FROM streamer_rumble_info i
   JOIN automod_control a ON a.streamer_id=i.streamer_id WHERE i.streamer_id=$1 AND i.is_live=TRUE
   AND i.updated_at>NOW()-INTERVAL '2 minutes' AND a.desired_enabled=FALSE
   AND COALESCE((a.runtime_status->>'publisherActive')::boolean,FALSE)=FALSE`,[sid])).rows[0];
  if(!live?.id)return null;
  await c.query('INSERT INTO nozecoin_rain_sessions(streamer_id,session_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[sid,String(live.id)]);
  const elapsed=Number((await c.query(`SELECT EXTRACT(EPOCH FROM (NOW()-started_at))*1000 AS elapsed FROM nozecoin_rain_sessions WHERE streamer_id=$1 AND session_id=$2`,[sid,String(live.id)])).rows[0]?.elapsed);
  const bucket=Math.floor(elapsed/COIN_RULES.rainIntervalMs);if(bucket<1)return null;
  await c.query(`INSERT INTO nozecoin_rains(streamer_id,session_id,bucket,closes_at) VALUES($1,$2,$3,NOW()+INTERVAL '2 minutes') ON CONFLICT DO NOTHING`,[sid,String(live.id),bucket]);
  // One announcer wins even when multiple bridges or timers run concurrently.
  return (await c.query('UPDATE nozecoin_rains SET announced_at=NOW() WHERE streamer_id=$1 AND session_id=$2 AND bucket=$3 AND closes_at>NOW() AND announced_at IS NULL RETURNING *',[sid,String(live.id),bucket])).rows[0]??null;
 });
 if(rain){const sent=await notifyShop(pool,sid,'🌧️ Rain NozeCoins ! Tape !rain dans les 2 minutes : +25 NozeCoins (bonus selon ton amélioration).');
  if(!sent.sent)await pool.query('UPDATE nozecoin_rains SET announced_at=NULL WHERE streamer_id=$1 AND session_id=$2 AND bucket=$3',[sid,rain.session_id,rain.bucket]);
 }
}
