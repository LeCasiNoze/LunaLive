import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {manualHuntRecap} from '../src/hunt2/recap.ts';
import {expectedAmount,onceSchema} from '../src/hunt2/amount.ts';
import {shopReplyChunks} from '../src/automod-shop/rules.ts';

function load(file,globals,names){
 const source=fs.readFileSync(new URL(file,import.meta.url),'utf8').replace(/^import\b[\s\S]*?;\r?\n/gm,'');
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/\bexport /g,'');
 return vm.runInNewContext(code+`;({${names.join(',')}})`,globals);
}

function fixture(phase='open',sync=false){
 let currentPhase=phase;
 const items=[{id:'1',name:'Slot A',bet:1,pay:null,pos:0},{id:'2',name:'Slot B',bet:2,pay:null,pos:1}];
 const messages=[],rumble=[],events=[],routes=new Map();
 let failSend=false;
 const io={to:room=>({emit:(event,msg)=>events.push({room,event,msg})})};
 const pool={query:async(sql,args=[])=>{
  if(sql.includes('UPDATE hunt_session_items SET pay=') || sql.includes('UPDATE calls_queue SET pay=')){
   const it=items.find(it=>it.id===args[1]);
   const guarded=sql.includes('IS NOT DISTINCT FROM');
   if(!it || (guarded?it.pay!==args[3]:it.pay===args[2]))return {rows:[],rowCount:0};
   it.pay=args[2];return {rows:[{id:it.id}],rowCount:1};
  }
  if(sql.includes('FROM hunt_session_items h'))return {rows:items};
  if(sql.includes('FROM calls_queue q'))return {rows:items};
  if(sql.includes('SELECT start FROM hunt_sessions'))return {rows:[{start:100}]};
  if(sql.includes('SELECT phase, opened, start, archive_id'))return {rows:[{phase:currentPhase,opened:currentPhase==='open',start:100}]};
  if(sql.includes('SELECT phase,archive_id'))return {rows:[{phase:currentPhase}]};
  if(sql.includes('INSERT INTO hunt_archives'))return {rows:[{id:88}]};
  if(sql.includes("UPDATE hunt_sessions SET phase='closed'")){currentPhase='closed';return {rows:[]};}
  if(sql.includes('FROM streamers WHERE user_id='))return {rows:[{id:77,slug:'lecasinoze',ownerUserId:10}]};
  if(sql.includes('INSERT INTO chat_messages')){
   if(failSend)throw Error('chat unavailable');
   messages.push(args[3]);return {rows:[{id:messages.length,createdAt:new Date()}]};
  }
  if(sql.includes('SELECT s.platform'))return {rows:[{platform:'rumble',is_live:true,live_video_id_numeric:'current-live'}]};
  return {rows:[],rowCount:0};
 }};
 pool.connect=async()=>({...pool,release(){}});
 const {sendBotChat}=load('../src/calls/commands.ts',{
  console,process:{env:{BOT_USER_ID:'99',BOT_USERNAME:'LunaBot'}},
  getChatCosmeticsForUsers:async()=>new Map(),
  sendRumbleMessageReliable:async(_pool,vid,text)=>{rumble.push({vid,text});return {sent:true,queued:false};},
 },['sendBotChat']);
 const router={use(){},get(){},post(path,...handlers){routes.set(path,handlers.at(-1));}};
 load('../src/routes/hunt2.ts',{
  console:{error(){}},express:{Router:()=>router,json:()=>()=>{}},pool,
  requireAuth(){},expectedAmount,onceSchema,manualHuntRecap,shopReplyChunks,sendBotChat,
  getCallsSettings:async()=>({syncHunt:sync}),
 },['hunt2Router']);
 async function pay(value,expected=null,id='1'){
  const response={code:200,status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
  const body={id,pay:value,...(expected==='unguarded'?{}:{expected})};
  await routes.get('/api/hunt2/set-pay')({user:{id:10},body,app:{locals:{io}}},response);
  await new Promise(resolve=>setImmediate(resolve));
  return response;
 }
 return {pay,messages,rumble,events,items,setFail:()=>{failSend=true;}};
}

test('saving manual gain emits matching recap into both Luna rooms and current Rumble live',async()=>{
 const f=fixture();assert.equal((await f.pay(20)).body.ok,true);
 assert.equal(f.messages.length,1);
 assert.match(f.messages[0],/Slot A : 20,00 €.*Ouverture 1\/2/);
 assert.deepEqual(f.events.map(e=>e.room),['chat:lecasinoze:public','chat:lecasinoze:popup']);
 assert.equal(f.rumble.length,1);assert.equal(f.rumble[0].vid,'current-live');
 assert.equal(f.rumble[0].text,f.messages[0]);
 assert.equal((await f.pay(20)).code,409);
 assert.equal(f.messages.length,1);
});
test('retry without expected does not repeat recap; correcting a payout does',async()=>{
 const f=fixture();await f.pay(0,'unguarded');await f.pay(0,'unguarded');
 assert.equal(f.messages.length,1);
 await f.pay(25,0);assert.equal(f.messages.length,2);
 assert.match(f.messages[1],/25,00 €/);
});
test('calls-synchronized hunt announces once and uses the same BE calculations',async()=>{
 const f=fixture('open',true);assert.equal((await f.pay(20)).body.ok,true);
 assert.match(f.messages[0],/Ouverture 1\/2.*BE restant 80,00 € \(×40,0\)/);
 await f.pay(20,'unguarded');assert.equal(f.messages.length,1);
 assert.equal(f.rumble.length,1);
});
test('last unguarded payout sends the final recap before automatic archive',async()=>{
 const f=fixture();await f.pay(20,'unguarded');
 const result=await f.pay(0,'unguarded','2');
 assert.equal(result.body.autoArchived,true);
 assert.equal(result.body.state.phase,'closed');
 assert.equal(f.messages.length,2);
 assert.match(f.messages[1],/Ouverture 2\/2 · 0 bonus restants/);
 assert.equal(f.rumble.length,2);
});
test('no recap during farm, and chat failure does not lose the entered gain',async()=>{
 const edit=fixture('edit');await edit.pay(20);assert.equal(edit.messages.length,0);
 const fail=fixture();fail.setFail();assert.equal((await fail.pay(20)).body.ok,true);
 assert.equal(fail.items[0].pay,20);
});
