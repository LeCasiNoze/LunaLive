import type {Pool} from 'pg';
import {refundStoppedChallenges} from './provider-challenge.js';

export const MAINTENANCE_MESSAGE = "L’Automod s’arrête pour une mise à jour. Merci pour votre participation ! Follow la chaîne pour retrouver les prochains lives de LeCasiNoze.";

/** Persist the stop and its announcement together; repeated stop requests do not spam. */
export async function setAutomodEnabled(pool:Pool,streamerId:number,enabled:boolean,userId:number|null){
 const c=await pool.connect();
 try{
  await c.query('BEGIN');
  await c.query('SELECT pg_advisory_xact_lock($1)',[streamerId]);
  const previous=(await c.query('SELECT desired_enabled FROM automod_control WHERE streamer_id=$1 FOR UPDATE',[streamerId])).rows[0];
  let announcementQueued=false;
  if(previous?.desired_enabled===true&&!enabled){
   await c.query('SAVEPOINT announcement');
   try{
    const result=await c.query(`INSERT INTO rumble_send_queue(video_id_numeric,text,status)
     SELECT i.live_video_id_numeric,$2,'pending' FROM streamer_rumble_info i
     JOIN streamers s ON s.id=i.streamer_id
     WHERE s.id=$1 AND lower(s.slug)='lecasinoze' AND i.is_live=TRUE AND i.live_video_id_numeric IS NOT NULL
     RETURNING id`,[streamerId,MAINTENANCE_MESSAGE]);
    announcementQueued=Boolean(result.rowCount);
   }catch{await c.query('ROLLBACK TO SAVEPOINT announcement');console.warn('[automod] stop announcement unavailable; stop remains permitted');}
  }
  const result=await c.query(`INSERT INTO automod_control(streamer_id,desired_enabled,updated_by) VALUES($1,$2,$3)
   ON CONFLICT(streamer_id) DO UPDATE SET desired_enabled=EXCLUDED.desired_enabled,updated_by=EXCLUDED.updated_by,updated_at=NOW()
   RETURNING desired_enabled,updated_at`,[streamerId,enabled,userId]);
  // Record cancellation in the same transaction as the stop. A subsequent
  // restart must not erase the obligation to refund the previous event.
  if(!enabled&&(await c.query("SELECT to_regclass('automod_provider_challenges') AS relation")).rows[0]?.relation){
   await c.query("UPDATE automod_provider_challenges SET cancel_requested_at=COALESCE(cancel_requested_at,NOW()) WHERE streamer_id=$1 AND status IN ('preparing','playing')",[streamerId]);
  }
  await c.query('COMMIT');
  if(!enabled)void refundStoppedChallenges(pool,streamerId).catch(()=>console.warn('[automod] challenge refund pending retry'));
  return {...result.rows[0],announcementQueued};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
