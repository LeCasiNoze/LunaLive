import 'dotenv/config';import fs from 'node:fs';import pg from 'pg';
import {enqueuePublication,eligiblePublication,type PublicationEvent} from './server/publication-outbox.js';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},max:1});
try{const e=JSON.parse(fs.readFileSync(0,'utf8')) as PublicationEvent;if(!eligiblePublication(e))throw Error('metadata_incomplete_or_ineligible');const inserted=await enqueuePublication(pool,e);console.log(JSON.stringify({ok:true,inserted}));}
catch{console.log(JSON.stringify({ok:false,error:'notification_outbox_unavailable'}));process.exitCode=1;}
finally{await pool.end();}
