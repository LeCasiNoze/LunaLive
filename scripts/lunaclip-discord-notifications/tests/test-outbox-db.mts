import 'dotenv/config';import pg from 'pg';import assert from 'node:assert/strict';
import {PUBLICATION_SCHEMA,enqueuePublication} from './server/publication-outbox.js';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},max:1});const c=await pool.connect();
try{
 await c.query('BEGIN');await c.query('CREATE SCHEMA lunaclip_discord_sim_20261018');await c.query('SET LOCAL search_path=lunaclip_discord_sim_20261018');await c.query(PUBLICATION_SCHEMA);
 const now=(await c.query('SELECT clock_timestamp() AS at')).rows[0].at as Date;
 const event={platform:'instagram' as const,mediaId:'111111111',account:'lecasinoze',visibility:'public',title:'Simulation',url:'https://www.instagram.com/reel/DB_SIM/',publishedAt:new Date(now.getTime()+1000).toISOString()};
 assert(await enqueuePublication(c as never,event));assert(!await enqueuePublication(c as never,event));
 assert(!await enqueuePublication(c as never,{...event,mediaId:'222222222',publishedAt:'2000-01-01T00:00:00Z'}));
 await c.query(PUBLICATION_SCHEMA);assert.equal((await c.query('SELECT count(*)::int AS n FROM lunaclip_discord_outbox')).rows[0].n,1);
 assert.equal((await c.query('SELECT message_id FROM lunaclip_discord_outbox')).rows[0].message_id,null);
 console.log(JSON.stringify({ok:true,checks:['migration_idempotent','unique_media_channel','activation_watermark','no_historic_backfill','no_public_send'],rolledBack:true}));
}finally{await c.query('ROLLBACK');c.release();await pool.end();}
