import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { inTransaction } from './wallet.js';
import { notifyShop } from './notify.js';

const ready=new WeakMap<Pool,Promise<void>>();
async function schema(pool:Pool){
 let promise=ready.get(pool);
 if(!promise){promise=pool.query(`CREATE TABLE IF NOT EXISTS automod_hunt_votes (
  id uuid PRIMARY KEY,streamer_id integer NOT NULL REFERENCES streamers(id),checkpoint text NOT NULL,
  bonus_count integer NOT NULL,closes_at timestamptz NOT NULL,announced_at timestamptz,
  result text CHECK(result IN ('open','continue')),UNIQUE(streamer_id,checkpoint));
 CREATE TABLE IF NOT EXISTS automod_hunt_ballots (
  vote_id uuid NOT NULL REFERENCES automod_hunt_votes(id),rumble_user_id text NOT NULL,
  choice text NOT NULL CHECK(choice IN ('open','continue')),PRIMARY KEY(vote_id,rumble_user_id))`).then(()=>undefined).catch(e=>{ready.delete(pool);throw e;});ready.set(pool,promise);}
 await promise;
}
function view(row:any){return {id:row.id,closesAt:new Date(row.closes_at).toISOString(),openVotes:Number(row.open_votes),continueVotes:Number(row.continue_votes)};}
export async function pollHuntVote(pool:Pool,streamerId:number,input:any){
 if(typeof input?.checkpoint!=='string'||!/^[-a-f0-9]{36}:[1-9][0-9]{0,3}$/.test(input.checkpoint)||!Number.isSafeInteger(input.bonusCount)||input.bonusCount<1||input.bonusCount>1000)throw Error('invalid_hunt_vote');
 await schema(pool);
 const row=await inTransaction(pool,async c=>{
  await c.query('SELECT pg_advisory_xact_lock($1)',[streamerId]);
  const control=(await c.query('SELECT desired_enabled,dashboard_settings,runtime_status FROM automod_control WHERE streamer_id=$1',[streamerId])).rows[0];
  if(!control?.desired_enabled||control.dashboard_settings?.mode!=='auto-hunt'||control.dashboard_settings?.hunt?.openingCondition!=='vote')throw Error('hunt_vote_disabled');
  await c.query(`INSERT INTO automod_hunt_votes(id,streamer_id,checkpoint,bonus_count,closes_at) VALUES($1,$2,$3,$4,NOW()+INTERVAL '60 seconds') ON CONFLICT(streamer_id,checkpoint) DO NOTHING`,[randomUUID(),streamerId,input.checkpoint,input.bonusCount]);
  const r=(await c.query(`SELECT v.*,COUNT(b.vote_id) FILTER(WHERE b.choice='open')::int AS open_votes,COUNT(b.vote_id) FILTER(WHERE b.choice='continue')::int AS continue_votes FROM automod_hunt_votes v LEFT JOIN automod_hunt_ballots b ON b.vote_id=v.id WHERE v.streamer_id=$1 AND v.checkpoint=$2 GROUP BY v.id`,[streamerId,input.checkpoint])).rows[0];
  if(!r.result&&new Date(r.closes_at).getTime()<=Date.now()){
   r.result=Number(r.open_votes)>Number(r.continue_votes)?'open':'continue';
   await c.query('UPDATE automod_hunt_votes SET result=$2 WHERE id=$1',[r.id,r.result]);
  }
  return r;
 });
 if(!row.announced_at&&!row.result){
  const n=await notifyShop(pool,streamerId,`Hunt : ${row.bonus_count} bonus ! Vote pendant 60 secondes : !hunt ouvrir ou !hunt continuer. Une voix par personne ; égalité = continuer.`);
  if(n.sent)await pool.query('UPDATE automod_hunt_votes SET announced_at=NOW() WHERE id=$1',[row.id]);
 }
 return {ok:true,vote:view(row),result:row.result??null};
}
export async function castHuntVote(pool:Pool,streamerId:number,userId:string,username:string,choice:'open'|'continue'){
 await schema(pool);
 return inTransaction(pool,async c=>{
  await c.query('SELECT pg_advisory_xact_lock($1)',[streamerId]);
  const row=(await c.query(`SELECT v.id FROM automod_hunt_votes v JOIN automod_control a ON a.streamer_id=v.streamer_id WHERE v.streamer_id=$1 AND a.desired_enabled=TRUE AND a.dashboard_settings->>'mode'='auto-hunt' AND v.result IS NULL AND v.closes_at>NOW() ORDER BY v.closes_at DESC LIMIT 1`,[streamerId])).rows[0];
  if(!row)return `@${username} — Aucun vote Hunt en cours.`;
  const inserted=await c.query('INSERT INTO automod_hunt_ballots(vote_id,rumble_user_id,choice) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[row.id,userId,choice]);
  return `@${username} — ${inserted.rowCount?'Vote enregistré : '+(choice==='open'?'ouvrir':'continuer')+'.':'Tu as déjà voté.'}`;
 });
}
