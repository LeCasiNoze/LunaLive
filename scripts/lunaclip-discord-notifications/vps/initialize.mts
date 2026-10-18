import 'dotenv/config';import pg from 'pg';import fs from 'node:fs';
import {PUBLICATION_SCHEMA,PUBLICATION_CHANNEL} from './server/publication-outbox.js';
import {refreshCurrencyReference} from './server/caption-currency.js';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},max:1});
try{await pool.query(PUBLICATION_SCHEMA);await refreshCurrencyReference();const row=(await pool.query('SELECT channel_id,activated_at FROM lunaclip_discord_config WHERE channel_id=$1',[PUBLICATION_CHANNEL])).rows[0];fs.mkdirSync('data/discord-publications-20261018',{recursive:true,mode:0o700});fs.writeFileSync('data/discord-publications-20261018/activation.json',JSON.stringify({...row,historyBackfill:false},null,2),{mode:0o600});console.log(JSON.stringify({...row,historyBackfill:false,currencyReference:fs.existsSync('data/ars-eur-reference.json')}));}
finally{await pool.end();}
