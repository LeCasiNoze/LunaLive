import type { Pool, PoolClient } from 'pg';

export function huntSlotKey(name:string):string {
  return name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
}
export async function huntSlotReserved(client:PoolClient,streamerId:number,name:string):Promise<boolean>{
  // Failed openings remain in the recovery history, not in the call lock.
  // Recalling them lets the runner reconcile an existing bonus on entry.
  const result=await client.query(`SELECT 1 FROM automod_hunt_reservations WHERE streamer_id=$1 AND slot_key=$2 AND status IN ('pending','opening') LIMIT 1`,[streamerId,huntSlotKey(name)]);
  return result.rowCount!==0;
}
export async function syncHuntReservations(pool:Pool,streamerId:number,input:unknown){
  if(!Array.isArray(input)||input.length>300)throw Error('invalid_hunt_entries');
  for(const e of input)if(!e||typeof e.id!=='string'||e.id.length>250||typeof e.slotName!=='string'||!e.slotName.trim()||e.slotName.length>200||!['pending','opening','opened','failed'].includes(e.status))throw Error('invalid_hunt_entry');
  const c=await pool.connect();try{
    await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock($1)',[streamerId]);
    for(const e of input)await c.query(`INSERT INTO automod_hunt_reservations(streamer_id,entry_id,slot_key,slot_name,status) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(streamer_id,entry_id) DO UPDATE SET status=CASE WHEN automod_hunt_reservations.status='opened' THEN 'opened' ELSE EXCLUDED.status END,updated_at=NOW()`,[streamerId,e.id,huntSlotKey(e.slotName),e.slotName,e.status]);
    await c.query('COMMIT');return {ok:true};
  }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
}
