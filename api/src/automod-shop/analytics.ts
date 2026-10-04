import {followSchema} from './follows.js';
import type {Pool} from 'pg';
import {engagementSchema} from './engagement.js';
/** Distinct speakers count identities, never add up hourly distinct counts. */
export async function automodAnalytics(pool:Pool,sid:number,days:number){
 await engagementSchema(pool);await followSchema(pool);
 const span=[1,7,30].includes(days)?days:7;
 const since=`NOW()-($2::int * INTERVAL '1 day')`;
 const [summary,daily,hours,audience]=await Promise.all([
  pool.query(`SELECT COUNT(*)::int AS messages,COUNT(DISTINCT rumble_user_id)::int AS speakers,MIN(occurred_at) AS first_seen FROM automod_chat_activity WHERE streamer_id=$1 AND occurred_at>${since}`,[sid,span]),
  pool.query(`SELECT to_char(occurred_at AT TIME ZONE 'Europe/Paris','YYYY-MM-DD') AS day,COUNT(*)::int AS messages,COUNT(DISTINCT rumble_user_id)::int AS speakers FROM automod_chat_activity WHERE streamer_id=$1 AND occurred_at>${since} GROUP BY 1 ORDER BY 1`,[sid,span]),
  pool.query(`SELECT EXTRACT(HOUR FROM occurred_at AT TIME ZONE 'Europe/Paris')::int AS hour,COUNT(*)::int AS messages,COUNT(DISTINCT rumble_user_id)::int AS speakers FROM automod_chat_activity WHERE streamer_id=$1 AND occurred_at>${since} GROUP BY 1 ORDER BY 1`,[sid,span]),
  pool.query(`SELECT to_char(sample_at AT TIME ZONE 'Europe/Paris','YYYY-MM-DD') AS day,ROUND(AVG(viewer_count),1)::float AS average_viewers,MAX(viewer_count)::int AS peak_viewers,COUNT(*)::int AS samples FROM automod_audience_samples WHERE streamer_id=$1 AND sample_at>${since} GROUP BY 1 ORDER BY 1`,[sid,span])
 ]);
 const followers=(await pool.query(`SELECT sample_at,total FROM automod_follower_samples WHERE streamer_id=$1 AND sample_at>${since} ORDER BY sample_at`,[sid,span])).rows;
 const first=followers[0],last=followers.at(-1);
 return {ok:true,followers:{total:last?.total??null,growth:first&&last?last.total-first.total:null,since:first?.sample_at??null},days:span,timeZone:'Europe/Paris',summary:summary.rows[0],daily:daily.rows,hours:hours.rows,audience:audience.rows,collectionStartedAt:(await pool.query('SELECT MIN(sample_at) AS at FROM automod_audience_samples WHERE streamer_id=$1',[sid])).rows[0]?.at??null};
}
