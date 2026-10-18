import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type {Pool} from 'pg';
import {createMultichatBridgeRouter} from './multichat_bridge.js';
import {eventKey,externalChatEvent} from '../multichat/policy.js';

const sample={platform:'kick',channelId:'24912362',messageId:'fixture-message',userId:'123',username:'Alice',text:'!call Fixture Slot',streamerSlug:'lecasinoze'};
async function fixture(run:(f:any)=>Promise<void>,{failCall=false,processing=false}={}){
  const claims=new Map<string,any>(),calls:any[]=[],broadcasts:any[]=[],texts:string[]=[];let nextId=10,queries=0;
  if(processing)claims.set(eventKey(externalChatEvent(sample)),{state:'processing'});
  const pool={async query(sql:string,p:any[]=[]){queries++;
    if(sql.includes("SELECT id,user_id FROM streamers"))return {rows:[{id:1,user_id:2}]};
    if(sql.startsWith('INSERT INTO multichat_bridge_events')){if(claims.has(p[0]))return {rowCount:0,rows:[]};claims.set(p[0],{state:'processing'});return {rowCount:1,rows:[{event_key:p[0]}]};}
    if(sql.startsWith('SELECT state,result'))return {rows:[claims.get(p[0])]};
    if(sql.startsWith('INSERT INTO chat_messages')){texts.push(p[2]);return {rows:[{id:nextId++,created_at:new Date()}]};}
    if(sql.includes('SELECT live_video_id_numeric'))return {rows:[]};
    if(sql.includes('SELECT response FROM bot_commands'))return {rows:p[1]==='discord'?[{response:'Discord : https://discord.gg/fixture'}]:[]};
    if(sql.includes("SET state='done'")){claims.set(p[0],{state:'done',result:JSON.parse(p[1])});return {rows:[]};}
    if(sql.includes("SET state='uncertain'")){claims.set(p[0],{state:'uncertain'});return {rows:[]};}
    if(sql.startsWith('SELECT event_key'))return {rows:[]};
    throw Error('Unexpected fixture query');
  }} as unknown as Pool;
  const io:any={to(){return this;},emit(name:string,payload:any){broadcasts.push({name,payload});}};
  const app=express();app.use(express.json());app.locals.io=io;
  app.use(createMultichatBridgeRouter({pool,keys:()=>['fixture-key'],handleCallsCommand:async opts=>{calls.push(opts);if(failCall)throw Error('simulated_failure');return {handled:true,showOriginalInChat:false};},sendBotChat:async(_pool,replyIo,_opts,body)=>{replyIo.to('chat:lecasinoze:public').emit('chat:message',{id:nextId++,isBot:true,body});},sendRumbleMessageReliable:async()=>{throw Error('Must not send a real Rumble message in tests');}}));
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  const addr=server.address();if(!addr||typeof addr==='string')throw Error('test_bind_failed');
  const post=(body:any,key='fixture-key')=>fetch(`http://127.0.0.1:${addr.port}/internal/bot/multichat/event`,{method:'POST',headers:{'Content-Type':'application/json','x-bot-key':key},body:JSON.stringify(body)});
  try{await run({post,calls,texts,broadcasts,claims,get queries(){return queries;}});}finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
}

test('unauthenticated requests cannot write chat or calls',()=>fixture(async f=>{assert.equal((await f.post(sample,'wrong')).status,401);assert.equal(f.queries,0);}));
test('another streamer cannot be targeted with this endpoint',()=>fixture(async f=>{assert.equal((await f.post({...sample,streamerSlug:'other'})).status,400);assert.equal(f.queries,0);}));
test('a replayed external call invokes the existing handler exactly once',()=>fixture(async f=>{
  const first=await f.post(sample);assert.equal(first.status,200);const result=await first.json();
  const replay=await f.post(sample);assert.equal(replay.status,200);assert.deepEqual(await replay.json(),result);assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].actorUserId,0);assert.equal(f.calls[0].actorRole,'viewer');assert.equal(f.calls[0].canMod,false);assert.equal(f.calls[0].actorUsername,'kick:123');
  assert.match(f.texts[0],/^\[Kick\] Alice : !call/);
}));
test('unfinished claims are not silently executed again',()=>fixture(async f=>{assert.equal((await f.post(sample)).status,409);assert.equal(f.calls.length,0);},{processing:true}));
test('privileged commands remain ordinary messages, even with a forged role',()=>fixture(async f=>{assert.equal((await f.post({...sample,text:'!resetc',actorRole:'admin',canMod:true})).status,200);assert.equal(f.calls.length,0);}));
test('Discord uses the configured response and returns the actual reply ID to the source adapter',()=>fixture(async f=>{const r=await f.post({...sample,platform:'twitch',channelId:'535777475',text:'!discord'});assert.equal(r.status,200);const body=await r.json();assert.equal(body.replies.length,1);assert.equal(body.replies[0].body,'Discord : https://discord.gg/fixture');assert.equal(f.calls.length,0);}));
test('an ambiguous handler failure is preserved and does not duplicate a call on retry',()=>fixture(async f=>{assert.equal((await f.post(sample)).status,503);assert.equal((await f.post(sample)).status,409);assert.equal(f.calls.length,1);},{failCall:true}));

test('queue listing reuses the existing viewer handler without adding a call',()=>fixture(async f=>{const r=await f.post({...sample,text:'!listec'});assert.equal(r.status,200);assert.equal(f.calls.length,1);assert.equal(f.calls[0].cmd,'listec');assert.equal(f.calls[0].canMod,false);}));
test('help without a custom response advertises only supported viewer commands',()=>fixture(async f=>{const r=await f.post({...sample,text:'!help'});const body=await r.json();assert.equal(body.replies.length,1);assert.match(body.replies[0].body,/!call.*!listec.*!discord/);assert.equal(f.calls.length,0);}));
