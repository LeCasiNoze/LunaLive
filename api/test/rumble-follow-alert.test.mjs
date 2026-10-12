import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(file,globals,names){
 const source=fs.readFileSync(new URL(file,import.meta.url),'utf8').replace(/^import\b[\s\S]*?;\r?\n/gm,'');
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/\bexport /g,'');
 return vm.runInNewContext(code+`;({${names.join(',')}})`,globals);
}
const {emitFollowOverlayAlert,renderFollowTemplate}=load('../src/follow_alert.ts',{},['emitFollowOverlayAlert','renderFollowTemplate']);
function fixture({initialized=true,live=true,automod=false}={}){
 let owner=initialized?'owner':null;const events=new Map(),queued=[],cards=[],alerts=[];
 const config={alerts:{follow_tpl:'Bienvenue @{user} !',follow_img:'https://cdn.example/follow.gif',follow_sound:'https://cdn.example/follow.mp3',sound_vol:.35,follow_duration_ms:8000}};
 const db={query:async(sql,args=[])=>{
  if(sql.startsWith('CREATE TABLE'))return {rows:[]};
  if(sql.includes('SELECT owner_id'))return {rows:owner?[{owner_id:owner}]:[]};
  if(sql.startsWith('INSERT INTO automod_follow_state')){owner=args[1];return {rows:[]};}
  if(sql.startsWith('INSERT INTO automod_follow_events')){const key=args[1]+':'+args[2].toISOString();if(!events.has(key))events.set(key,{username:args[1],baseline:args[3],announced:false,event_key:args[2].toISOString()});return {rows:[]};}
  if(sql.includes('SELECT i.live_video_id_numeric'))return {rows:live?[{live_video_id_numeric:'current-live',slug:'LeCasiNoze',ownerUserId:7,automodActive:automod}]:[]};
  if(sql.includes('SELECT username,followed_at::text'))return {rows:[...events.values()].filter(e=>!e.baseline&&!e.announced).slice(0,1)};
  if(sql.startsWith('INSERT INTO rumble_send_queue')){queued.push({videoId:args[0],text:args[1]});return {rows:[]};}
  if(sql.startsWith('UPDATE automod_follow_events SET announced_at')){events.get(args[1]+':'+args[2]).announced=true;return {rows:[]};}
  if(sql.includes('SELECT config'))return {rows:[{config}]};
  return {rows:[]};
 }};
 const io={to:room=>{const rooms=[room];const chain={to:r=>{rooms.push(r);return chain;},emit:(event,payload)=>alerts.push({rooms,event,payload})};return chain;}};
 const {recordFollowSnapshot,announceNewFollow}=load('../src/automod-shop/follows.ts',{
  console,Date,WeakMap,Map,inTransaction:async(_db,fn)=>fn(db),followSnapshot(){},emitFollowOverlayAlert,
  emitSpecialCard:(_io,slug,type,data)=>cards.push({slug,type,data}),shopReplyChunks:text=>[text],
 },['recordFollowSnapshot','announceNewFollow']);
 const snapshot={ownerId:'owner',total:51,recent:[{username:'NewViewer',followed_on:new Date(Date.now()+4*3600000).toISOString()}]};
 return {db,io,queued,cards,alerts,events,record:()=>recordFollowSnapshot(db,5,snapshot),announce:()=>announceNewFollow(db,5,io)};
}
test('manual Rumble follow uses configured LunaBot text, image, audio and both overlay rooms once',async()=>{
 const f=fixture();await f.record();assert.equal(await f.announce(),true);
 assert.equal(f.queued.length,1);assert.equal(f.queued[0].videoId,'current-live');assert.equal(f.queued[0].text,'Merci pour ton follow @NewViewer !');
 assert.equal(f.cards.length,1);assert.equal(f.cards[0].data.platform,'rumble');
 const a=f.alerts[0];assert.deepEqual(a.rooms,['stream:lecasinoze','obsview:lecasinoze']);
 assert.equal(a.event,'obs:alert');assert.equal(a.payload.text,'Bienvenue @NewViewer !');assert.equal(a.payload.volume,.35);assert.equal(a.payload.durationMs,8000);assert.match(a.payload.imageUrl,/follow.gif/);assert.match(a.payload.soundUrl,/follow.mp3/);
 await f.record();assert.equal(await f.announce(),false);assert.equal(f.alerts.length,1);assert.equal(f.queued.length,1);
});
test('AutoMod keeps its welcome points message and also emits LunaBot alert',async()=>{
 const f=fixture({automod:true});await f.record();await f.announce();assert.match(f.queued[0].text,/100 points/);assert.equal(f.alerts.length,1);
});
test('initial inventory and offline state never announce historical follows',async()=>{
 for(const options of [{initialized:false},{live:false}]){const f=fixture(options);await f.record();assert.equal(await f.announce(),false);assert.equal(f.alerts.length,0);assert.equal(f.queued.length,0);}
});
test('account changes are rejected instead of confusing another account followers',async()=>{
 const f=fixture();await f.record();await assert.rejects(()=>load('../src/automod-shop/follows.ts',{console,Date,WeakMap,Map,inTransaction:async(_db,fn)=>fn(f.db)},['recordFollowSnapshot']).recordFollowSnapshot(f.db,5,{ownerId:'other',total:1,recent:[]}),/ACCOUNT_CHANGED/);
});
test('native LunaLive helper keeps template substitutions and clamps malformed settings',async()=>{
 assert.equal(renderFollowTemplate('Salut {user} et @{user}','Viewer'),'Salut Viewer et @Viewer');
 const emitted=[];const chain={to:()=>chain,emit:(_e,p)=>emitted.push(p)};
 await emitFollowOverlayAlert({query:async()=>({rows:[{config:{alerts:{sound_vol:'bad',follow_duration_ms:-50}}}]})},{to:()=>chain},{slug:'lecasinoze',ownerUserId:7},'Viewer');
 assert.equal(emitted[0].volume,1);assert.equal(emitted[0].durationMs,1200);
});
