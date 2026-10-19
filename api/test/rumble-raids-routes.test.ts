import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {randomUUID} from 'node:crypto';
import {createRumbleRaidsRouter} from '../src/routes/rumble_raids.js';
import {RaidError} from '../src/rumble/raid.js';

const target='https://rumble.com/v7abcde-target.html';
async function fixture(run:(f:any)=>Promise<void>,options:any={}){
 const rows=new Map<string,any>();let locked=false,calls=0,queries=0;
 const source={id:12,user_id:1,rumble_username:'Mine',is_live:options.offline!==true,live_video_id_numeric:'123',video_url:'https://rumble.com/v7fffff-mine.html'};
 const query=async(sql:string,p:any[]=[])=>{queries++;
  if(sql.startsWith('SELECT s.id'))return {rows:[{...source,is_mod:p[1]===2}]};
  if(sql.startsWith('SELECT pg_try_advisory_lock')){const acquired=!locked;locked=true;return {rows:[{locked:acquired}]};}
  if(sql.startsWith('SELECT pg_advisory_unlock')){locked=false;return {rows:[]};}
  if(sql.startsWith('SELECT * FROM rumble_raid_requests'))return {rows:rows.has(p[1])?[rows.get(p[1])]:[]};
  if(sql.startsWith('SELECT state FROM rumble_raid_requests'))return {rows:[...rows.values()].filter(r=>['pending','confirmed','uncertain'].includes(r.state))};
  if(sql.startsWith('INSERT INTO rumble_raid_requests')){rows.set(p[1],{target_url:p[3],source_video_id:p[2],state:'pending'});return {rows:[]};}
  if(sql.startsWith('UPDATE rumble_raid_requests')){rows.get(p[1]).state=sql.includes("state='confirmed'")?'confirmed':p[2];return {rows:[]};}
  if(sql.startsWith('SELECT is_live,live_video_id_numeric'))return {rows:[source]};
  throw Error('Unexpected fixture SQL: '+sql.slice(0,70));
 };
 const db:any={query,connect:async()=>({query,release(){}})};
 const app=express();app.use(express.json());app.use(createRumbleRaidsRouter({pool:db,
  auth:(req:any,res,next)=>{const user=req.get('x-test-user');if(!user)return void res.sendStatus(401);req.user={id:user==='owner'?1:user==='mod'?2:3,role:'viewer'};next();},
  session:async()=>({username:'Fixture',cookie:'u_s=fixture-cookie-for-tests-only',userAgent:'fixture'}),
  directory:async()=>({targets:[{url:target,channel:'Other',title:'',viewers:10,videoId:'456'},{url:source.video_url,channel:'Mine',title:'',viewers:20,videoId:'123'}],hasMore:false}),
  start:async(input)=>{calls++;if(options.start)await options.start(input);},
 }));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const addr=server.address();if(!addr||typeof addr==='string')throw Error();
 const root=`http://127.0.0.1:${addr.port}/streamers/mine/rumble/raids`;
 const post=(body={url:target,requestId:randomUUID()},user='owner')=>fetch(root,{method:'POST',headers:{'content-type':'application/json',...(user?{'x-test-user':user}:{})},body:JSON.stringify(body)});
 try{await run({post,get:(user='owner')=>fetch(root,{headers:{'x-test-user':user}}),rows,get calls(){return calls;},get queries(){return queries;}});}
 finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
}
test('unauthenticated request does not query data or raid',()=>fixture(async f=>{assert.equal((await f.post(undefined,'')).status,401);assert.equal(f.calls,0);assert.equal(f.queries,0);}));
test('viewer cannot raid even by directly calling the API',()=>fixture(async f=>{assert.equal((await f.post(undefined,'viewer')).status,403);assert.equal(f.calls,0);}));
test('moderator can use the native raid integration',()=>fixture(async f=>{assert.equal((await f.post(undefined,'mod')).status,200);assert.equal(f.calls,1);}));
test('offline source cannot launch a raid',()=>fixture(async f=>{assert.equal((await f.post()).status,409);assert.equal(f.calls,0);},{offline:true}));
test('confirmed idempotency key cannot execute a second raid',()=>fixture(async f=>{
 const body={url:target,requestId:randomUUID()};assert.equal((await f.post(body)).status,200);
 const replay=await f.post(body);assert.equal(replay.status,200);assert.equal((await replay.json()).duplicate,true);assert.equal(f.calls,1);
}));
test('different key is still blocked during the Rumble cooldown',()=>fixture(async f=>{
 assert.equal((await f.post()).status,200);const again=await f.post();assert.equal(again.status,409);assert.equal((await again.json()).error,'raid_cooldown');assert.equal(f.calls,1);
}));
test('uncertain confirmation is persisted and not executed again',()=>fixture(async f=>{
 assert.equal((await f.post()).status,409);const again=await f.post();assert.equal((await again.json()).error,'raid_uncertain');assert.equal(f.calls,1);
},{start:async()=>{throw new RaidError('rumble_unavailable',true);}}));
test('concurrent clicks across tabs cannot start two raids',async()=>{
 let release:()=>void=()=>{},started:()=>void=()=>{};
 const ready=new Promise<void>(r=>started=r),wait=new Promise<void>(r=>release=r);
 await fixture(async f=>{
  const first=f.post();await ready;
  const second=await f.post();assert.equal(second.status,409);assert.equal((await second.json()).error,'raid_busy');
  release();assert.equal((await first).status,200);assert.equal(f.calls,1);
 },{start:async()=>{started();await wait;}});
});
test('directory is private and excludes the source channel',()=>fixture(async f=>{
 const r=await f.get();assert.equal(r.status,200);assert.match(r.headers.get('cache-control')||'',/private/);
 assert.deepEqual((await r.json()).targets.map((t:any)=>t.channel),['Other']);
}));
test('invalid URLs and self raids never reach Rumble',()=>fixture(async f=>{
 for(const url of ['https://evil.test/v7abcde.html','https://rumble.com/v7fffff-mine.html'])assert.equal((await f.post({url,requestId:randomUUID()})).status,400);
 assert.equal(f.calls,0);
}));
