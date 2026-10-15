import type {PoolClient} from 'pg';
/** Called under the streamer's queue lock. Keep the current pending call, then
 * existing viewer calls in FIFO order, then the generated reserve. */
export async function viewerCallPosition(c:PoolClient,streamerId:number):Promise<number>{
 const q=await c.query(`SELECT id,pos,hunt_generated FROM calls_queue WHERE streamer_id=$1
  AND COALESCE(is_bonus,FALSE)=FALSE AND (bet IS NULL OR bet<=0) ORDER BY pos,id`,[streamerId]);
 const firstRandom=q.rows.slice(1).find(r=>r.hunt_generated);
 if(firstRandom){
  const pos=Number(firstRandom.pos);
  await c.query('UPDATE calls_queue SET pos=pos+1 WHERE streamer_id=$1 AND pos>=$2',[streamerId,pos]);
  return pos;
 }
 return Number((await c.query('SELECT COALESCE(MAX(pos),0)+1 AS pos FROM calls_queue WHERE streamer_id=$1',[streamerId])).rows[0].pos);
}
