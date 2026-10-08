import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {inTransaction,lockWallet,walletEntry} from './wallet.js';
import {validRumbleIdentity} from './rules.js';
import {predictionPayouts} from './engagement-rules.js';
import {nextChallengeProvider,canFinishChallenge,providerPassScore,type EventProvider} from './event-rules.js';

const ready=new WeakMap<Pool,Promise<void>>();
export async function challengeSchema(pool:Pool){
 let task=ready.get(pool);
 if(!task){task=pool.query(`CREATE TABLE IF NOT EXISTS automod_provider_challenges(
 id uuid PRIMARY KEY,streamer_id bigint NOT NULL REFERENCES streamers(id),checkpoint text NOT NULL,
 status text NOT NULL CHECK(status IN ('preparing','playing','settled','refunded')),
 config jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT NOW(),closes_at timestamptz NOT NULL,
 started_at timestamptz,result text,finished_at timestamptz,UNIQUE(streamer_id,checkpoint));
 ALTER TABLE automod_provider_challenges ADD COLUMN IF NOT EXISTS cancel_requested_at timestamptz;
 CREATE UNIQUE INDEX IF NOT EXISTS automod_provider_challenge_active ON automod_provider_challenges(streamer_id) WHERE status IN ('preparing','playing');
 CREATE TABLE IF NOT EXISTS automod_provider_camps(
 challenge_id uuid NOT NULL REFERENCES automod_provider_challenges(id),rumble_user_id text NOT NULL,
 username text NOT NULL,provider text NOT NULL CHECK(provider IN ('pragmatic','hacksaw')),
 points integer NOT NULL DEFAULT 0 CHECK(points BETWEEN 0 AND 500),PRIMARY KEY(challenge_id,rumble_user_id));
 CREATE TABLE IF NOT EXISTS automod_provider_passes(
 challenge_id uuid NOT NULL REFERENCES automod_provider_challenges(id),pass_id text NOT NULL,sequence integer NOT NULL,
 provider text NOT NULL CHECK(provider IN ('pragmatic','hacksaw')),slot_name text NOT NULL,
 started_at timestamptz NOT NULL DEFAULT NOW(),receipt jsonb,score_hundredths bigint,
 PRIMARY KEY(challenge_id,pass_id),UNIQUE(challenge_id,sequence));`).then(()=>undefined).catch(e=>{ready.delete(pool);throw e});ready.set(pool,task);}
 await task;
}
async function locked(c:PoolClient,sid:number,id:string){
 await c.query('SELECT pg_advisory_xact_lock($1)',[sid]);
 const r=(await c.query('SELECT * FROM automod_provider_challenges WHERE streamer_id=$1 AND id=$2 FOR UPDATE',[sid,id])).rows[0];
 if(!r)throw Error('challenge_not_found');return r;
}
export async function createChallenge(pool:Pool,sid:number,checkpoint:string,config:{stakeCents:number;slotDurationMs:number;goldenEnabled:boolean}){
 if(!checkpoint||checkpoint.length>160||!Number.isSafeInteger(config.stakeCents)||config.stakeCents<1||config.stakeCents>10000||!Number.isSafeInteger(config.slotDurationMs)||config.slotDurationMs<60000||config.slotDurationMs>7200000)throw Error('challenge_invalid_config');
 await challengeSchema(pool);
 return inTransaction(pool,async c=>{
  await c.query('SELECT pg_advisory_xact_lock($1)',[sid]);
  const previous=(await c.query('SELECT * FROM automod_provider_challenges WHERE streamer_id=$1 AND checkpoint=$2',[sid,checkpoint])).rows[0];if(previous)return previous;
  if((await c.query("SELECT 1 FROM automod_provider_challenges WHERE streamer_id=$1 AND status IN ('preparing','playing')",[sid])).rowCount)throw Error('challenge_already_active');
  return (await c.query(`INSERT INTO automod_provider_challenges(id,streamer_id,checkpoint,status,config,closes_at)
   VALUES($1,$2,$3,'preparing',$4,NOW()+INTERVAL '3 minutes') RETURNING *`,[randomUUID(),sid,checkpoint,JSON.stringify(config)])).rows[0];
 });
}
export async function chooseCamp(pool:Pool,sid:number,id:string,viewer:{userId:string;username:string},provider:EventProvider,points=0){
 if(!validRumbleIdentity(viewer.userId)||!['pragmatic','hacksaw'].includes(provider)||!Number.isSafeInteger(points)||points<0||points>500||points%10!==0)throw Error('challenge_invalid_camp');
 await challengeSchema(pool);
 return inTransaction(pool,async c=>{
  const r=await locked(c,sid,id);
  if(r.cancel_requested_at||!['preparing','playing'].includes(r.status))throw Error('challenge_closed');
  const old=(await c.query('SELECT * FROM automod_provider_camps WHERE challenge_id=$1 AND rumble_user_id=$2',[id,viewer.userId])).rows[0];
  if(old){if(old.provider===provider&&Number(old.points)===points)return old;throw Error('challenge_camp_locked');}
  // Late spectators can join a camp and call, but cannot bet after play starts.
  if(points>0&&(r.status!=='preparing'||Date.now()>=new Date(r.closes_at).getTime()))throw Error('challenge_bets_closed');
  if(points){await lockWallet(c,sid,viewer.userId,viewer.username);await walletEntry(c,sid,viewer.userId,`challenge:${id}:reserve:${viewer.userId}`,0,points,'challenge-reservation');}
  return (await c.query('INSERT INTO automod_provider_camps(challenge_id,rumble_user_id,username,provider,points) VALUES($1,$2,$3,$4,$5) RETURNING *',[id,viewer.userId,viewer.username.slice(0,80),provider,points])).rows[0];
 });
}
export async function challengeCallAllowed(pool:Pool,sid:number,userId:string|null,provider:EventProvider){
 await challengeSchema(pool);
 return challengeCallAllowedInTransaction(pool,sid,userId,provider);
}
/** Caller serializes admission with mode changes through the streamer lock. */
export async function challengeCallAllowedInTransaction(db:Pick<PoolClient,'query'>,sid:number,userId:string|null,provider:string|null){
 const r=(await db.query(`SELECT c.id,p.provider FROM automod_provider_challenges c
 JOIN automod_control a ON a.streamer_id=c.streamer_id
 LEFT JOIN automod_provider_camps p ON p.challenge_id=c.id AND p.rumble_user_id=$2
 WHERE c.streamer_id=$1 AND c.status IN ('preparing','playing') AND a.desired_enabled=TRUE
 AND (a.dashboard_settings->>'mode'='provider-challenge' OR a.runtime_status->>'mode'='provider-challenge')`,[sid,userId])).rows[0];
 return !r?null:!r.provider?'challenge_choose_camp':r.provider!==provider?'challenge_other_camp':null;
}
export async function handleChallengeChat(pool:Pool,m:{streamerId:number;userId:string;username:string;text:string;createdAt:Date}){
 if(!/^!camp(?:\s|$)/i.test(m.text.trim()))return null;
 if(!validRumbleIdentity(m.userId)||Date.now()-m.createdAt.getTime()>120000||m.createdAt.getTime()>Date.now()+30000)return null;
 const help=`@${m.username} — Choisis !camp pragma ou !camp hacksaw. Pour parier avant le départ : !camp pragma 100 (10 à 500 points).`;
 const parsed=/^!camp\s+(pragma(?:tic)?|hacksaw|axo)(?:\s+(\d{1,5}))?\s*$/i.exec(m.text.trim());if(!parsed)return help;
 await challengeSchema(pool);
 const active=(await pool.query(`SELECT e.id FROM automod_provider_challenges e JOIN automod_control a ON a.streamer_id=e.streamer_id
 WHERE e.streamer_id=$1 AND e.status IN ('preparing','playing') AND a.desired_enabled=TRUE`,[m.streamerId])).rows[0];
 if(!active)return `@${m.username} — Aucun Défi providers en cours.`;
 const points=parsed[2]===undefined?0:Math.round(Number(parsed[2])/10)*10;if(parsed[2]!==undefined&&(points<10||points>500))return help;
 const provider=parsed[1]!.toLowerCase().startsWith('pragma')?'pragmatic':'hacksaw';
 try{await chooseCamp(pool,m.streamerId,active.id,m,provider,points);
  return `@${m.username} — Camp ${provider==='pragmatic'?'Pragmatic':'Hacksaw'} confirmé${points?`, ${points} points réservés`:''}. Fais tes calls dans ce camp !`;
 }catch(e){const reason=e instanceof Error?e.message:'';
  if(reason==='challenge_camp_locked')return `@${m.username} — Ton camp est déjà choisi pour ce défi. Il reste verrouillé jusqu’à la fin.`;
  if(reason==='challenge_bets_closed')return `@${m.username} — Les paris sont fermés. Tu peux encore rejoindre un camp sans montant : !camp ${provider==='pragmatic'?'pragma':'hacksaw'}.`;
  if(reason==='insufficient_points')return `@${m.username} — Pas assez de points disponibles. !points pour voir ton solde.`;
  throw e;
 }
}
export async function startChallengePass(pool:Pool,sid:number,id:string,pass:{id:string;provider:EventProvider;slotName:string}){
 if(!pass.id||pass.id.length>180||!pass.slotName||pass.slotName.length>160)throw Error('challenge_invalid_pass');
 await challengeSchema(pool);
 return inTransaction(pool,async c=>{
  const r=await locked(c,sid,id);
  const existing=(await c.query('SELECT * FROM automod_provider_passes WHERE challenge_id=$1 AND pass_id=$2',[id,pass.id])).rows[0];
  if(existing){if(existing.provider!==pass.provider||existing.slot_name!==pass.slotName)throw Error('challenge_pass_conflict');return existing;}
  if(r.cancel_requested_at||!['preparing','playing'].includes(r.status)||Date.now()<new Date(r.closes_at).getTime())throw Error('challenge_not_ready');
  const passes=(await c.query('SELECT * FROM automod_provider_passes WHERE challenge_id=$1 ORDER BY sequence',[id])).rows;
  if(passes.some(p=>p.receipt===null))throw Error('challenge_pass_unresolved');
  const next=nextChallengeProvider(passes.length);if(pass.provider!==next)throw Error('challenge_wrong_rotation');
  const elapsed=r.started_at?Date.now()-new Date(r.started_at).getTime():0;
  if(canFinishChallenge({elapsedMs:elapsed,pragmaticPasses:passes.filter(p=>p.provider==='pragmatic').length,hacksawPasses:passes.filter(p=>p.provider==='hacksaw').length,bonusActive:false,passActive:false}))throw Error('challenge_ready_to_settle');
  await c.query("UPDATE automod_provider_challenges SET status='playing',started_at=COALESCE(started_at,NOW()) WHERE id=$1",[id]);
  return (await c.query('INSERT INTO automod_provider_passes(challenge_id,pass_id,sequence,provider,slot_name) VALUES($1,$2,$3,$4,$5) RETURNING *',[id,pass.id,passes.length,pass.provider,pass.slotName])).rows[0];
 });
}
export type ChallengeReceipt = {naturalBonuses:number;bestMultiplier:number;rounds:number;bonusActive:false}&(
 {spentCents:number;returnedCents:number;measurement:'provider-ledger'}|
 {balanceBeforeCents:number;balanceAfterCents:number;measurement:'balance-delta'});
export async function finishChallengePass(pool:Pool,sid:number,id:string,passId:string,receipt:ChallengeReceipt){
 if(!['provider-ledger','balance-delta'].includes(receipt.measurement)||receipt.bonusActive!==false||!Number.isSafeInteger(receipt.rounds)||receipt.rounds<1)throw Error('challenge_receipt_unconfirmed');
 const amounts=receipt.measurement==='balance-delta'?{spentCents:receipt.balanceBeforeCents,returnedCents:receipt.balanceAfterCents}:receipt;
 const score=providerPassScore({...amounts,naturalBonuses:receipt.naturalBonuses,bestMultiplier:receipt.bestMultiplier});
 // Keep a canonical receipt for retry comparisons; unknown values are rejected.
 // A wallet difference proves net profit, NOT gross spend. Never label the
 // starting balance as money spent or re-add the bonus total to wallet gains.
 const fact={...(receipt.measurement==='balance-delta'?{balanceBeforeCents:receipt.balanceBeforeCents,balanceAfterCents:receipt.balanceAfterCents,spentCents:null,returnedCents:null}:{spentCents:receipt.spentCents,returnedCents:receipt.returnedCents}),profitCents:score.profitCents,naturalBonuses:receipt.naturalBonuses,bestMultiplier:receipt.bestMultiplier,rounds:receipt.rounds,bonusActive:false,measurement:receipt.measurement};
 await challengeSchema(pool);
 return inTransaction(pool,async c=>{
  const r=await locked(c,sid,id);
  const p=(await c.query('SELECT * FROM automod_provider_passes WHERE challenge_id=$1 AND pass_id=$2 FOR UPDATE',[id,passId])).rows[0];
  if(!p)throw Error('challenge_pass_not_found');
  if(p.receipt){if(Object.entries(fact).some(([k,v])=>p.receipt[k]!==v))throw Error('challenge_receipt_conflict');return {changed:false,...score};}
  if(r.cancel_requested_at||r.status!=='playing')throw Error('challenge_closed');
  await c.query('UPDATE automod_provider_passes SET receipt=$3,score_hundredths=$4 WHERE challenge_id=$1 AND pass_id=$2',[id,passId,JSON.stringify(fact),score.scoreHundredths]);
  return {changed:true,...score};
 });
}
export async function challengeSnapshot(pool:Pool,sid:number,id:string){
 await challengeSchema(pool);
 const event=(await pool.query('SELECT * FROM automod_provider_challenges WHERE streamer_id=$1 AND id=$2',[sid,id])).rows[0];if(!event)throw Error('challenge_not_found');
 const passes=(await pool.query('SELECT pass_id,sequence,provider,slot_name,receipt,score_hundredths FROM automod_provider_passes WHERE challenge_id=$1 ORDER BY sequence',[id])).rows;
 const camps=(await pool.query('SELECT provider,COUNT(*)::int AS viewers,SUM(points)::int AS points FROM automod_provider_camps WHERE challenge_id=$1 GROUP BY provider',[id])).rows;
 const scores={pragmatic:0,hacksaw:0};for(const p of passes)scores[p.provider as EventProvider]+=Number(p.score_hundredths??0)/100;
 const complete=passes.filter(p=>p.receipt!==null),counts={pragmatic:complete.filter(p=>p.provider==='pragmatic').length,hacksaw:complete.filter(p=>p.provider==='hacksaw').length};
 return {id:event.id,status:event.status,config:event.config,closesAt:new Date(event.closes_at).toISOString(),startedAt:event.started_at?new Date(event.started_at).toISOString():null,result:event.result,
  scores,counts,camps,passes:passes.map(p=>({id:p.pass_id,provider:p.provider,slotName:p.slot_name,receipt:p.receipt,score:p.score_hundredths===null?null:Number(p.score_hundredths)/100})),
  nextProvider:nextChallengeProvider(complete.length),readyToSettle:canFinishChallenge({elapsedMs:event.started_at?Math.max(0,Date.now()-new Date(event.started_at).getTime()):0,pragmaticPasses:counts.pragmatic,hacksawPasses:counts.hacksaw,bonusActive:false,passActive:passes.some(p=>p.receipt===null)})};
}
export async function settleChallenge(pool:Pool,sid:number,id:string,cancel=false){
 await challengeSchema(pool);
 return inTransaction(pool,async c=>{
  const r=await locked(c,sid,id);
  if(['settled','refunded'].includes(r.status))return {changed:false,result:r.result};
  cancel=cancel||Boolean(r.cancel_requested_at);
  const passes=(await c.query('SELECT * FROM automod_provider_passes WHERE challenge_id=$1',[id])).rows;
  if(!cancel&&!canFinishChallenge({elapsedMs:r.started_at?Math.max(0,Date.now()-new Date(r.started_at).getTime()):0,
   pragmaticPasses:passes.filter(p=>p.provider==='pragmatic').length,hacksawPasses:passes.filter(p=>p.provider==='hacksaw').length,
   bonusActive:false,passActive:passes.some(p=>p.receipt===null)}))throw Error('challenge_not_complete');
  const totals={pragmatic:0,hacksaw:0};for(const p of passes)totals[p.provider as EventProvider]+=Number(p.score_hundredths??0);
  const winner=cancel||totals.pragmatic===totals.hacksaw?null:totals.pragmatic>totals.hacksaw?'pragmatic':'hacksaw';
  const camps=(await c.query('SELECT * FROM automod_provider_camps WHERE challenge_id=$1 AND points>0 ORDER BY rumble_user_id',[id])).rows;
  const result=predictionPayouts(camps.map(p=>({userId:p.rumble_user_id,choice:p.provider==='pragmatic'?'yes' as const:'no' as const,points:Number(p.points)})),winner===null?null:winner==='pragmatic'?'yes':'no');
  const amounts=new Map(result.payouts.map(p=>[p.userId,p.points]));
  // Pending reinforcements have never been handed to the worker. Return them
  // at event end even when their call remains queued for the following mode.
  const unused=(await c.query("SELECT * FROM automod_shop_orders WHERE streamer_id=$1 AND kind='stake' AND status='pending' AND result->>'challengeId'=$2 ORDER BY rumble_user_id,id FOR UPDATE",[sid,id])).rows;
  for(const o of unused){
   await lockWallet(c,sid,o.rumble_user_id,o.username);
   await walletEntry(c,sid,o.rumble_user_id,`order:${o.id}:refund-reservation`,0,-Number(o.reserved_points),'technical-failure-release',{reason:'challenge-ended-before-boost'});
   await c.query("UPDATE automod_shop_orders SET status='refunded',reserved_points=0,result=result||'{\"reason\":\"challenge-ended-before-boost\"}'::jsonb,updated_at=NOW(),completed_at=NOW() WHERE streamer_id=$1 AND id=$2",[sid,o.id]);
  }
  for(const p of camps){await lockWallet(c,sid,p.rumble_user_id,p.username);await walletEntry(c,sid,p.rumble_user_id,`challenge:${id}:settle:${p.rumble_user_id}`,(amounts.get(p.rumble_user_id)??0)-Number(p.points),-Number(p.points),result.refund?'challenge-refund':'challenge-settlement');}
  await c.query('UPDATE automod_provider_challenges SET status=$2,result=$3,finished_at=NOW() WHERE id=$1',[id,result.refund?'refunded':'settled',winner??'draw']);
  return {changed:true,result:winner??'draw',refunded:result.refund,totals};
 });
}
export async function refundStoppedChallenges(pool:Pool,sid:number){
 await challengeSchema(pool);
 const events=(await pool.query(`SELECT e.id FROM automod_provider_challenges e JOIN automod_control a ON a.streamer_id=e.streamer_id
 WHERE e.streamer_id=$1 AND (a.desired_enabled=FALSE OR e.cancel_requested_at IS NOT NULL) AND e.status IN ('preparing','playing')`,[sid])).rows;
 for(const event of events)await settleChallenge(pool,sid,event.id,true);
}
