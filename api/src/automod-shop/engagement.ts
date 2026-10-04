import {randomUUID,randomInt} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {inTransaction,lockWallet,walletEntry,walletSummary,readWallet} from './wallet.js';
import {notifyShop} from './notify.js';
import {validRumbleIdentity} from './rules.js';
import {PREDICTION_MS,MODE_VOTE_MS,validPredictionPoints,predictionPayouts,predictionStats,parisVoteCheckpoint,type PredictionBet} from './engagement-rules.js';

const ready=new WeakMap<Pool,Promise<void>>();
export async function engagementSchema(pool:Pool){
 let p=ready.get(pool);if(!p){p=pool.query(`CREATE TABLE IF NOT EXISTS automod_engagement (
 id uuid PRIMARY KEY,streamer_id bigint NOT NULL REFERENCES streamers(id),kind text NOT NULL CHECK(kind IN ('prediction','mode')),
 checkpoint text NOT NULL,status text NOT NULL CHECK(status IN ('queued','open','locked','settled','refunded')),
 payload jsonb NOT NULL DEFAULT '{}',result text,closes_at timestamptz,created_at timestamptz NOT NULL DEFAULT NOW(),
 announced_at timestamptz,UNIQUE(streamer_id,kind,checkpoint));
 CREATE TABLE IF NOT EXISTS automod_engagement_ballots (
 round_id uuid NOT NULL REFERENCES automod_engagement(id),rumble_user_id text NOT NULL,username text NOT NULL,
 choice text NOT NULL,points integer NOT NULL DEFAULT 0 CHECK(points>=0 AND points<=500),PRIMARY KEY(round_id,rumble_user_id));
 CREATE TABLE IF NOT EXISTS automod_chat_activity (
 streamer_id bigint NOT NULL REFERENCES streamers(id),message_id text NOT NULL,rumble_user_id text NOT NULL,
 username text NOT NULL,occurred_at timestamptz NOT NULL,PRIMARY KEY(streamer_id,message_id));
 CREATE INDEX IF NOT EXISTS automod_chat_activity_time ON automod_chat_activity(streamer_id,occurred_at);
 CREATE TABLE IF NOT EXISTS automod_audience_samples (
 streamer_id bigint NOT NULL REFERENCES streamers(id),sample_at timestamptz NOT NULL,viewer_count integer NOT NULL CHECK(viewer_count>=0),
 PRIMARY KEY(streamer_id,sample_at));`).then(()=>undefined).catch(e=>{ready.delete(pool);throw e;});ready.set(pool,p);}await p;
}
async function liveControl(c:Pick<PoolClient,'query'>,sid:number){
 const r=(await c.query(`SELECT a.*,i.is_live,i.viewers_count FROM automod_control a LEFT JOIN streamer_rumble_info i ON i.streamer_id=a.streamer_id WHERE a.streamer_id=$1`,[sid])).rows[0];
 return r?.desired_enabled===true&&r.runtime_status?.publisherActive===true&&r.is_live===true&&Date.now()-new Date(r.runtime_seen_at).getTime()<60000?r:null;
}
const betsOf=(rows:any[]):PredictionBet[]=>rows.map(b=>({userId:b.rumble_user_id,choice:b.choice,points:Number(b.points)}));
async function display(c:Pick<PoolClient,'query'>,row:any){
 if(!row)return null;
 const rows=(await c.query('SELECT * FROM automod_engagement_ballots WHERE round_id=$1 ORDER BY rumble_user_id',[row.id])).rows;
 return {id:row.id,kind:row.kind,status:row.status,closesAt:row.closes_at?new Date(row.closes_at).toISOString():null,result:row.result,
  ...(row.kind==='prediction'?predictionStats(betsOf(rows)):{automodVotes:rows.filter(b=>b.choice==='automod').length,huntVotes:rows.filter(b=>b.choice==='auto-hunt').length}),
  summary:row.payload.summary??null,entries:row.payload.entries??[],checkpoint:row.checkpoint};
}
async function release(c:PoolClient,sid:number,row:any,winner:'yes'|'no'|null){
 const ballots=(await c.query('SELECT * FROM automod_engagement_ballots WHERE round_id=$1 ORDER BY rumble_user_id',[row.id])).rows;
 const settlement=predictionPayouts(betsOf(ballots),winner),payouts=new Map(settlement.payouts.map(p=>[p.userId,p.points]));
 for(const b of ballots){
  await lockWallet(c,sid,b.rumble_user_id,b.username);
  // Reservation is released in the same transaction as final debit/payout.
  const received=payouts.get(b.rumble_user_id)??0;
  await walletEntry(c,sid,b.rumble_user_id,`prediction:${row.id}:settlement:${b.rumble_user_id}`,received-Number(b.points),-Number(b.points),settlement.refund?'prediction-refund':'prediction-settlement',{winner,stake:b.points,payout:received});
 }
 await c.query('UPDATE automod_engagement SET status=$2,result=$3 WHERE id=$1',[row.id,settlement.refund?'refunded':'settled',settlement.refund?'refund':winner]);
 return settlement;
}
export async function observeAutomodChat(pool:Pool,m:{streamerId:number;userId:string;username:string;messageId:string;createdAt:Date}){
 if(!validRumbleIdentity(m.userId)||!m.messageId||m.messageId.length>150||Date.now()-m.createdAt.getTime()>120000||m.createdAt.getTime()>Date.now()+30000)return;
 await engagementSchema(pool);
 await pool.query(`INSERT INTO automod_chat_activity(streamer_id,message_id,rumble_user_id,username,occurred_at)
 SELECT $1,$2,$3,$4,$5 WHERE EXISTS(SELECT 1 FROM automod_control WHERE streamer_id=$1 AND desired_enabled=TRUE)
 ON CONFLICT DO NOTHING`,[m.streamerId,m.messageId,m.userId,m.username.slice(0,80),m.createdAt]);
}
export async function tickEngagement(pool:Pool,sid:number){
 await engagementSchema(pool);
 return inTransaction(pool,async c=>{
  await c.query('SELECT pg_advisory_xact_lock($1)',[sid]);
  const live=await liveControl(c,sid);
  const enabled=(await c.query('SELECT desired_enabled FROM automod_control WHERE streamer_id=$1',[sid])).rows[0]?.desired_enabled===true;
  if(!enabled){
   const pending=(await c.query(`SELECT * FROM automod_engagement WHERE streamer_id=$1 AND status IN ('queued','open','locked') FOR UPDATE`,[sid])).rows;
   for(const row of pending){if(row.kind==='prediction')await release(c,sid,row,null);else await c.query("UPDATE automod_engagement SET status='refunded',result='cancelled' WHERE id=$1",[row.id]);}
   return null;
  }
  const checkpoint=live?parisVoteCheckpoint(new Date()):null;
  if(live&&Number.isSafeInteger(live.viewers_count)&&live.viewers_count>=0)await c.query("INSERT INTO automod_audience_samples(streamer_id,sample_at,viewer_count) VALUES($1,date_trunc('minute',NOW()),$2) ON CONFLICT DO NOTHING",[sid,live.viewers_count]);
  if(checkpoint)await c.query(`INSERT INTO automod_engagement(id,streamer_id,kind,checkpoint,status) VALUES($1,$2,'mode',$3,'queued') ON CONFLICT DO NOTHING`,[randomUUID(),sid,checkpoint]);
  const row=(await c.query(`SELECT * FROM automod_engagement WHERE streamer_id=$1 AND status IN ('queued','open') ORDER BY CASE WHEN kind='prediction' THEN 0 ELSE 1 END,created_at LIMIT 1`,[sid])).rows[0];
  return display(c,row);
 });
}
function validSummary(s:any){return s&&['startBalanceCents','openingBalanceCents','remainingStakeCents'].every(k=>Number.isSafeInteger(s[k])&&s[k]>=0&&s[k]<100000000)&&s.startBalanceCents>0&&s.remainingStakeCents>0;}
/** Called only at a safe slot boundary. Server creates the deadline, never accepts a viewer deadline. */
export async function pollEngagement(pool:Pool,sid:number,input:any){
 await engagementSchema(pool);
 const result=await inTransaction(pool,async c=>{
  await c.query('SELECT pg_advisory_xact_lock($1)',[sid]);
  const live=await liveControl(c,sid);if(!live){
   const existing=input.kind==='prediction'?(await c.query("SELECT * FROM automod_engagement WHERE streamer_id=$1 AND kind='prediction' AND checkpoint=$2 AND status IN ('open','locked')",[sid,String(input.checkpoint)])).rows[0]:null;
   return {ok:true,event:await display(c,existing),live:false};
  }
  if(input.kind==='prediction'){
   if(!/^[a-f0-9-]{36}$/.test(input.checkpoint)||!validSummary(input.summary)||!Array.isArray(input.entries)||input.entries.length<1||input.entries.length>300)throw Error('invalid_prediction');
   const entries=input.entries.map((e:any)=>({slotName:String(e.slotName??'').slice(0,120),baseStakeCents:Number(e.baseStakeCents)}));
   if(entries.some((e:any)=>!e.slotName||!Number.isSafeInteger(e.baseStakeCents)||e.baseStakeCents<=0)||entries.reduce((s:number,e:any)=>s+e.baseStakeCents,0)!==input.summary.remainingStakeCents)throw Error('invalid_prediction_entries');
   await c.query(`INSERT INTO automod_engagement(id,streamer_id,kind,checkpoint,status,payload,closes_at)
    VALUES($1,$2,'prediction',$3,'open',$4,NOW()+($5*INTERVAL '1 millisecond')) ON CONFLICT DO NOTHING`,[randomUUID(),sid,input.checkpoint,JSON.stringify({summary:input.summary,entries}),PREDICTION_MS]);
  }
  let row=(await c.query(`SELECT * FROM automod_engagement WHERE streamer_id=$1 AND ${input.kind==='prediction'?"kind='prediction' AND checkpoint=$2":"kind='mode' AND status IN ('queued','open','locked')"} ORDER BY created_at LIMIT 1 FOR UPDATE`,input.kind==='prediction'?[sid,input.checkpoint]:[sid])).rows[0];
  if(!row)return {ok:true,event:null,live:true};
  if(row.kind==='mode'&&row.status==='queued'){
   // Do not resurrect yesterday's missed vote after a long failure.
   if(Date.now()-new Date(row.created_at).getTime()>3600000){await c.query("UPDATE automod_engagement SET status='refunded',result='missed' WHERE id=$1",[row.id]);return {ok:true,event:null,live:true};}
   row=(await c.query(`UPDATE automod_engagement SET status='open',closes_at=NOW()+($2*INTERVAL '1 millisecond') WHERE id=$1 RETURNING *`,[row.id,MODE_VOTE_MS])).rows[0];
  }
  if(row.status==='open'&&new Date(row.closes_at).getTime()<=Date.now()){
   if(row.kind==='mode'){
    const b=(await c.query('SELECT choice,COUNT(*)::int AS n FROM automod_engagement_ballots WHERE round_id=$1 GROUP BY choice',[row.id])).rows;
    const a=Number(b.find(x=>x.choice==='automod')?.n??0),h=Number(b.find(x=>x.choice==='auto-hunt')?.n??0);
    row.result=a===h?(randomInt(2)?'auto-hunt':'automod'):h>a?'auto-hunt':'automod';
   }
   row.status='locked';await c.query("UPDATE automod_engagement SET status='locked',result=$2 WHERE id=$1",[row.id,row.result??null]);
  }
  return {ok:true,event:await display(c,row),live:true,announce:!row.announced_at&&row.status==='open'};
 });
 if(result.announce&&result.event){
  const event=result.event;
  const text=event.kind==='prediction'?`Préparation du Hunt · 3 minutes ! Sera-t-il rentable ? !pari oui 100 ou !pari non 100 (10 à 500 points, multiples de 10). Pot partagé, cotes finales à la clôture ; un seul camp = remboursement. Start ${(event.summary.startBalanceCents/100).toFixed(2)} € · ${event.entries.length} bonus.`:'Vote de mode · 5 minutes : !1 Automod, !2 Auto Hunt. Une voix par personne. Égalité ou aucun vote : choix aléatoire.';
  if((await notifyShop(pool,sid,text)).sent)await pool.query('UPDATE automod_engagement SET announced_at=NOW() WHERE id=$1',[event.id]);
 }
 return result;
}
export async function castEngagement(pool:Pool,m:{streamerId:number;userId:string;username:string;messageId:string;createdAt:Date;text:string}):Promise<string|null>{
 const prediction=/^!pari\s+(oui|non)\s+(\d{1,6})\s*$/i.exec(m.text.trim()),vote=/^!(?:vote\s+)?([12])\s*$/i.exec(m.text.trim());
 if(!prediction&&!vote)return null;
 if(!validRumbleIdentity(m.userId)||Date.now()-m.createdAt.getTime()>120000||m.createdAt.getTime()>Date.now()+30000)return null;
 await engagementSchema(pool);
 try{return await inTransaction(pool,async c=>{
  await c.query('SELECT pg_advisory_xact_lock($1)',[m.streamerId]);
  if(!await liveControl(c,m.streamerId))return `@${m.username} — Les votes et pronostics sont disponibles pendant le direct Automod.`;
  const kind=prediction?'prediction':'mode';
  const row=(await c.query(`SELECT * FROM automod_engagement WHERE streamer_id=$1 AND kind=$2 AND status='open' AND closes_at>NOW() ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,[m.streamerId,kind])).rows[0];
  if(!row)return `@${m.username} — Aucun ${prediction?'pronostic':'vote de mode'} ouvert.`;
  const previous=(await c.query('SELECT 1 FROM automod_engagement_ballots WHERE round_id=$1 AND rumble_user_id=$2',[row.id,m.userId])).rowCount;
  if(previous)return `@${m.username} — Participation déjà enregistrée ; un seul choix par personne.`;
  const points=prediction?Number(prediction[2]):0;
  if(prediction&&!validPredictionPoints(points))return `@${m.username} — Choisis 10 à 500 points, par multiples de 10.`;
  if(prediction){await lockWallet(c,m.streamerId,m.userId,m.username);await walletEntry(c,m.streamerId,m.userId,`prediction:${row.id}:reserve:${m.userId}`,0,points,'prediction-reservation');}
  const choice=prediction?(prediction[1]!.toLowerCase()==='oui'?'yes':'no'):vote![1]==='1'?'automod':'auto-hunt';
  await c.query('INSERT INTO automod_engagement_ballots(round_id,rumble_user_id,username,choice,points) VALUES($1,$2,$3,$4,$5)',[row.id,m.userId,m.username.slice(0,80),choice,points]);
  return `@${m.username} — ${prediction?`${points} points réservés sur « ${choice==='yes'?'rentable':'non rentable'} ». ${walletSummary(await readWallet(c,m.streamerId,m.userId))}`:`Vote ${choice==='automod'?'Automod':'Auto Hunt'} enregistré.`}`;
 });}catch(e){if(String(e).includes('insufficient_points'))return `@${m.username} — Points disponibles insuffisants ; aucun point réservé.`;throw e;}
}
export async function finishPrediction(pool:Pool,sid:number,input:any){
 await engagementSchema(pool);
 return inTransaction(pool,async c=>{
  await c.query('SELECT pg_advisory_xact_lock($1)',[sid]);
  const row=(await c.query("SELECT * FROM automod_engagement WHERE streamer_id=$1 AND kind='prediction' AND checkpoint=$2 FOR UPDATE",[sid,String(input.checkpoint)])).rows[0];
  if(!row||['settled','refunded'].includes(row.status))return {ok:true,changed:false};
  const complete=input.complete===true&&Number.isSafeInteger(input.totalGainCents)&&input.totalGainCents>=0&&input.bonusCount===row.payload.entries.length&&input.openedCount===row.payload.entries.length&&input.failedCount===0;
  if(complete&&row.status!=='locked')throw Error('prediction_not_closed');
  const finalBalance=row.payload.summary.openingBalanceCents+Number(input.totalGainCents??0);
  const winner=complete?(finalBalance>=row.payload.summary.startBalanceCents?'yes':'no'):null;
  const settled=await release(c,sid,row,winner);
  return {ok:true,changed:true,winner:!settled.refund?winner:null,refunded:settled.refund,pot:settled.payouts.reduce((s,b)=>s+b.points,0)};
 });
}
export async function applyModeVote(pool:Pool,sid:number,id:string){
 await engagementSchema(pool);
 return inTransaction(pool,async c=>{
  await c.query('SELECT pg_advisory_xact_lock($1)',[sid]);
  const row=(await c.query("SELECT * FROM automod_engagement WHERE streamer_id=$1 AND id=$2 AND kind='mode' FOR UPDATE",[sid,id])).rows[0];
  const live=await liveControl(c,sid);
  if(!row||!['automod','auto-hunt'].includes(row.result)||!live)return {ok:true,applied:false};
  if(row.status==='settled')return {ok:true,applied:live.dashboard_settings?.mode===row.result,mode:row.result};
  if(row.status!=='locked')return {ok:true,applied:false};
  await c.query(`UPDATE automod_control SET dashboard_settings=jsonb_set(dashboard_settings,'{mode}',$2::jsonb),settings_revision=settings_revision+1,updated_at=NOW() WHERE streamer_id=$1 AND desired_enabled=TRUE`,[sid,JSON.stringify(row.result)]);
  await c.query("UPDATE automod_engagement SET status='settled' WHERE id=$1",[id]);
  return {ok:true,applied:true,mode:row.result};
 });
}
