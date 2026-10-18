import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {tickReviewPublisher} from './review-publisher.js';
test('Discord/outbox failure never changes confirmed Instagram publication or resends the media',async()=>{
 const cwd=process.cwd(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'lc-publisher-'));const oldFetch=globalThis.fetch;
 const keys=['INSTAGRAM_LECASINOZE_ACCESS_TOKEN','INSTAGRAM_LECASINOZE_USER_ID','LUNACLIP_REVIEW_PUBLISH_ENABLED','INSTAGRAM_LUNALIVE_PUBLISH_ENABLED'] as const;
 const before=Object.fromEntries(keys.map(k=>[k,process.env[k]]));let state='queued',publishes=0,outboxChecks=0;const errors:string[]=[];
 process.chdir(dir);process.env.INSTAGRAM_LECASINOZE_ACCESS_TOKEN='IG_simulated_only';process.env.INSTAGRAM_LECASINOZE_USER_ID='simulated_actor';process.env.LUNACLIP_REVIEW_PUBLISH_ENABLED='0';process.env.INSTAGRAM_LUNALIVE_PUBLISH_ENABLED='0';
 globalThis.fetch=async(input)=>{
  const u=new URL(String(input));
  if(u.pathname.endsWith('/media_publish')){publishes++;return Response.json({id:'123456789'});}
  if(u.searchParams.get('fields')==='status_code')return Response.json({status_code:'FINISHED'});
  if(u.searchParams.get('fields')==='permalink')return Response.json({permalink:'https://www.instagram.com/reel/SIM_ONLY/'});
  return Response.json({results:[]});
 };
 const query=async(sql:string,args?:unknown[])=>{
  if(sql.includes('JOIN lunaclip_discord_config')){outboxChecks++;throw Error('simulated_outbox_database_failure');}
  if(sql.startsWith('SELECT rp.*,pj.clip_id'))return {rows:state==='queued'?[{publish_job_id:1,clip_id:1,phase:'processing',container_id:'simulated_container',instagram_account_key:'lecasinoze',description:'Titre\n18+ · Jouer comporte des risques.',output_url:'https://example.test/clip.mp4'}]:[]};
  if(sql.startsWith("UPDATE publish_jobs SET status='done'"))state='done';
  if(sql.includes('error_msg=$2'))errors.push(String(args?.[1]));
  return {rows:[]};
 };
 const pool={query,connect:async()=>({query,release(){}})};
 try{
  await tickReviewPublisher(pool as never);await new Promise(r=>setImmediate(r));
  assert.equal(state,'done');assert.equal(publishes,1);assert.equal(outboxChecks,1);assert.deepEqual(errors,[]);
  await tickReviewPublisher(pool as never);assert.equal(publishes,1);
 }finally{
  globalThis.fetch=oldFetch;process.chdir(cwd);for(const k of keys){if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k];}fs.rmSync(dir,{recursive:true,force:true});
 }
});
