import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {tickPublicationDiscord} from './publication-discord.js';
test('failed old metadata backs off durably and cannot starve a new publication',async()=>{
 const cwd=process.cwd(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'lc-metadata-'));const clock=Date.now;let now=clock(),enqueues=0;
 process.chdir(dir);fs.mkdirSync('data');Date.now=()=>now;
 const rows=Array.from({length:6},(_,i)=>({id:i+1,platform_id:String(123456789+i),title:'Vrai titre'}));
 const seen:number[][]=[];
 const pool={async query(sql:string,args:unknown[]=[]){
  if(sql.startsWith('INSERT INTO lunaclip_discord_outbox')){enqueues++;return {rowCount:1,rows:[{id:1}]};}
  const excluded=args[1] as number[];seen.push(excluded);return {rows:rows.filter(r=>!excluded.includes(r.id)).slice(0,5)};
 }};
 const graph=async(id:string)=>{if(id!==rows[5].platform_id)throw Error('simulated_archived_media');return {username:'lecasinoze',media_product_type:'REELS',timestamp:new Date().toISOString(),permalink:'https://www.instagram.com/reel/NEW_VALID/'};};
 try{
  await tickPublicationDiscord(pool as never,graph);assert.equal(enqueues,0);
  const saved=JSON.parse(fs.readFileSync('data/discord-metadata-retries.json','utf8'));assert.equal(Object.keys(saved).length,5);assert(Object.values(saved).every((r:any)=>r.after>now));
  now+=120001;await tickPublicationDiscord(pool as never,graph);assert.equal(enqueues,1);assert.deepEqual(seen[1],[1,2,3,4,5]);
 }finally{Date.now=clock;process.chdir(cwd);fs.rmSync(dir,{recursive:true,force:true});}
});
