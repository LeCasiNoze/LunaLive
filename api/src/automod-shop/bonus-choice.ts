import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {inTransaction} from './wallet.js';
import {notifyShop} from './notify.js';
import {validRumbleIdentity} from './rules.js';

const ready=new WeakMap<Pool,Promise<void>>();
async function schema(pool:Pool){
 let p=ready.get(pool);
 if(!p){p=pool.query(`CREATE TABLE IF NOT EXISTS automod_bonus_choices(
 id uuid PRIMARY KEY,streamer_id bigint NOT NULL REFERENCES streamers(id),checkpoint uuid NOT NULL,
 slot_name text NOT NULL,closes_at timestamptz NOT NULL DEFAULT NOW()+INTERVAL '1 minute',
 result text CHECK(result IN ('left','right')),announced_at timestamptz,UNIQUE(streamer_id,checkpoint));
 CREATE TABLE IF NOT EXISTS automod_bonus_choice_ballots(
 round_id uuid NOT NULL REFERENCES automod_bonus_choices(id),rumble_user_id text NOT NULL,
 choice text NOT NULL CHECK(choice IN ('left','right')),PRIMARY KEY(round_id,rumble_user_id));`).then(()=>{}).catch(e=>{ready.delete(pool);throw e;});ready.set(pool,p);}
 await p;
}
export async function pollBonusChoice(pool:Pool,sid:number,input:any){
 if(!/^[a-f0-9-]{36}$/.test(input.checkpoint)||typeof input.slotName!=='string'||!input.slotName.trim()||input.slotName.length>160)throw Error('invalid_bonus_choice');
 await schema(pool);
 const reply=await inTransaction(pool,async c=>{
  await c.query('SELECT pg_advisory_xact_lock($1)',[sid]);
  const live=(await c.query(`SELECT 1 FROM automod_control c JOIN streamer_rumble_info r ON r.streamer_id=c.streamer_id
   WHERE c.streamer_id=$1 AND c.desired_enabled AND r.is_live AND c.runtime_status->>'publisherActive'='true' AND c.runtime_seen_at>NOW()-INTERVAL '60 seconds'`,[sid])).rowCount;
  if(!live)return {ok:true,event:null};
  await c.query(`INSERT INTO automod_bonus_choices(id,streamer_id,checkpoint,slot_name) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[randomUUID(),sid,input.checkpoint,input.slotName]);
  const row=(await c.query('SELECT * FROM automod_bonus_choices WHERE streamer_id=$1 AND checkpoint=$2 FOR UPDATE',[sid,input.checkpoint])).rows[0];
  const counts=(await c.query('SELECT choice,COUNT(*)::int AS n FROM automod_bonus_choice_ballots WHERE round_id=$1 GROUP BY choice',[row.id])).rows;
  const left=Number(counts.find(x=>x.choice==='left')?.n??0),right=Number(counts.find(x=>x.choice==='right')?.n??0);
  if(!row.result&&Date.parse(row.closes_at)<=Date.now()){
   row.result=left>right?'left':'right';
   await c.query('UPDATE automod_bonus_choices SET result=$2 WHERE id=$1',[row.id,row.result]);
  }
  return {ok:true,event:{id:row.id,kind:'choice' as const,status:row.result?'locked':'open',result:row.result,closesAt:new Date(row.closes_at).toISOString(),slotName:row.slot_name,leftVotes:left,rightVotes:right},announce:!row.announced_at&&!row.result};
 });
 if(reply.announce&&reply.event&&(await notifyShop(pool,sid,`${reply.event.slotName} · Quel bonus ? !gauche ou !droite · 1 minute. Sans vote ou égalité : droite.`)).sent)await pool.query('UPDATE automod_bonus_choices SET announced_at=NOW() WHERE id=$1',[reply.event.id]);
 return reply;
}
export async function castBonusChoice(pool:Pool,m:{streamerId:number;userId:string;username:string;createdAt:Date;text:string}){
 const command=/^!(gauche|droite)\s*$/i.exec(m.text.trim());if(!command)return null;
 if(!validRumbleIdentity(m.userId)||Math.abs(Date.now()-m.createdAt.getTime())>120000)return null;
 await schema(pool);
 return inTransaction(pool,async c=>{
  await c.query('SELECT pg_advisory_xact_lock($1)',[m.streamerId]);
  const row=(await c.query(`SELECT b.id FROM automod_bonus_choices b JOIN automod_control c ON c.streamer_id=b.streamer_id
   WHERE b.streamer_id=$1 AND b.result IS NULL AND b.closes_at>NOW() AND c.desired_enabled ORDER BY b.closes_at DESC LIMIT 1 FOR UPDATE OF b`,[m.streamerId])).rows[0];
  if(!row)return `@${m.username} — Aucun choix de bonus en cours.`;
  await c.query(`INSERT INTO automod_bonus_choice_ballots(round_id,rumble_user_id,choice) VALUES($1,$2,$3)
   ON CONFLICT(round_id,rumble_user_id) DO UPDATE SET choice=EXCLUDED.choice`,[row.id,m.userId,command[1]!.toLowerCase()==='gauche'?'left':'right']);
  // Counts update on screen; avoid one bot message for every ballot.
  return '';
 });
}
