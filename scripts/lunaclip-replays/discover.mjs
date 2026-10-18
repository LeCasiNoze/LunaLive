// The DB supplies ownership and ended/live state; media URLs stay in a private file.
import 'dotenv/config';import fs from 'node:fs';import pg from 'pg';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},max:1});
try{
 const rows=(await pool.query(`SELECT v.id,v.video_id,v.title,v.duration_sec,v.started_at,v.ended_at,v.yt_video_id,
 s.slug,s.is_live,ri.live_id FROM rumble_vods v JOIN streamers s ON s.id=v.streamer_id
 LEFT JOIN streamer_rumble_info ri ON ri.streamer_id=s.id
 WHERE lower(s.slug)='lecasinoze' AND v.started_at>='2026-10-18T08:49:05Z'
 ORDER BY v.started_at DESC LIMIT 100`)).rows;
 fs.mkdirSync('data/youtube-replays',{recursive:true,mode:0o700});
 fs.writeFileSync('data/youtube-replays/candidates.json.tmp',JSON.stringify(rows),{mode:0o600});
 fs.renameSync('data/youtube-replays/candidates.json.tmp','data/youtube-replays/candidates.json');
 console.log(JSON.stringify({event:'replay_discovery',candidates:rows.length}));
}catch{console.error(JSON.stringify({event:'replay_discovery_failed'}));process.exitCode=1;}finally{await pool.end();}
