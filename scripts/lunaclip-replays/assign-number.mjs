import 'dotenv/config';import pg from 'pg';
const id=process.argv[2];if(!/^\d+$/.test(id||''))throw Error('invalid_vod_id');
const p=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},max:1});
try{await p.query('BEGIN');await p.query('SELECT pg_advisory_xact_lock(1280659009,61)');
const row=(await p.query(`SELECT v.id,v.yt_stream_number FROM rumble_vods v JOIN streamers s ON s.id=v.streamer_id WHERE v.id=$1 AND lower(s.slug)='lecasinoze' FOR UPDATE OF v`,[id])).rows[0];
if(!row)throw Error('wrong_vod_owner');let number=Number(row.yt_stream_number);
if(!Number.isSafeInteger(number)||number<1){const max=(await p.query(`SELECT COALESCE(MAX(v.yt_stream_number),0)::int AS n FROM rumble_vods v JOIN streamers s ON s.id=v.streamer_id WHERE lower(s.slug)='lecasinoze'`)).rows[0].n;number=Number(max)+1;await p.query('UPDATE rumble_vods SET yt_stream_number=$2 WHERE id=$1',[id,number]);}
await p.query('COMMIT');console.log(JSON.stringify({number}));
}catch{await p.query('ROLLBACK');console.error('replay_number_unavailable');process.exitCode=1;}finally{await p.end();}
