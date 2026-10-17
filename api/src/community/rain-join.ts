import type {Pool} from 'pg';
import type {Server} from 'socket.io';
import {emitChatAll,emitChatLine} from '../socket_emit.js';
export async function joinCommunityRain(db:Pool,io:Server|undefined,streamer:{streamerId:number;slug:string},user:{id:number;username:string}){
 const client=await db.connect();let roundId=0;
 try{
  await client.query('BEGIN');
  const state=(await client.query(`SELECT phase,close_at_ms AS "closeAtMs",round_id AS "roundId" FROM bot_rain_state WHERE streamer_id=$1 FOR UPDATE`,[streamer.streamerId])).rows[0];
  if(state?.phase!=='open'||!Number(state.closeAtMs)||Date.now()>=Number(state.closeAtMs)){await client.query('ROLLBACK');return {ok:false as const,error:'not_open'};}
  roundId=Number(state.roundId);
  const inserted=await client.query(`INSERT INTO bot_rain_joins(streamer_id,round_id,user_id,username) VALUES($1,$2,$3,$4)
   ON CONFLICT(streamer_id,round_id,user_id) DO NOTHING RETURNING user_id`,[streamer.streamerId,roundId,user.id,user.username]);
  await client.query('COMMIT');
  if(!inserted.rowCount)return {ok:true as const,alreadyJoined:true,roundId};
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 if(io){
  try{
  const count=Number((await db.query(`SELECT COUNT(*)::int AS n FROM bot_rain_joins WHERE streamer_id=$1 AND round_id=$2`,[streamer.streamerId,roundId])).rows[0]?.n??0);
  emitChatAll(io,streamer.slug,'act:rain',{round:roundId,count});
  const safe=user.username.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
  emitChatLine(io,streamer.slug,'sys',`💎 <b>${safe}</b> participe à la rain`);
  }catch{/* Admission committed: a disconnected socket must not turn it into a failure. */}
 }
 return {ok:true as const,alreadyJoined:false,roundId};
}
