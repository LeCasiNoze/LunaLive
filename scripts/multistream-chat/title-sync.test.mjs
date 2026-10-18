import test from 'node:test';
import assert from 'node:assert/strict';
import {PlatformApi,SCOPES,TITLE_SCOPES} from './platforms.mjs';
import {TitleSynchronizer,titlePlan,contextWithAutomod} from './mode-title-sync.mjs';

const active=(mode='automod',huntPhase=null)=>({publicationOwner:'automod',automodService:'active',titleContext:{available:true,mode,huntPhase}});
function memory(){const values=new Map();return {get:(k,d=null)=>values.has(k)?values.get(k):d,set:(k,v)=>values.set(k,v)};}
function fixture(platform,extra={}){
 let credential={clientId:'app',accessToken:'private-test-token',clientSecret:'private-test-secret',
  userId:'42',channelId:'42',login:'lecasinoze',expiresAt:Date.now()+3600000,
  scopes:[...SCOPES[platform],TITLE_SCOPES[platform]],...extra};
 let title='Old title';const calls=[];
 const vault={get:async()=>credential,save:async(_p,c)=>{credential=c;}};
 const api=new PlatformApi(platform,vault,{origin:'https://example.test',fetchImpl:async(url,o={})=>{
  calls.push({url,method:o.method||'GET',body:o.body});
  if(o.method==='PATCH'){const body=JSON.parse(o.body);title=body.stream_title||body.title;return new Response(null,{status:204});}
  return Response.json({data:[{broadcaster_id:'42',broadcaster_user_id:42,title,stream_title:title}]});
 }});
 return {api,calls,setTitle:v=>title=v,vault};
}
test('personal streams, stopped publishers, unknown context and other modes never produce title plans',()=>{
 for(const c of [{...active(),publicationOwner:'manual'},{...active(),automodService:'inactive'},
  {...active(),titleContext:{available:false}},active('session-buy'),active('provider-challenge')])assert.equal(titlePlan(c),null);
});
test('classic, hunt farming and hunt opening have distinct titles; Twitch/Kick English and Rumble French',()=>{
 const classic=titlePlan(active()),farm=titlePlan(active('auto-hunt','farming')),open=titlePlan(active('auto-hunt','opening'));
 assert.match(classic.titles.kick,/You pick the slots/);assert.equal(classic.titles.kick,classic.titles.twitch);
 assert.match(classic.titles.rumble,/Vous choisissez/);assert.notEqual(farm.key,open.key);
 assert.match(open.titles.twitch,/Bonus opening/);
});
for(const p of ['kick','twitch']){
 test(p+' uses the official PATCH, accepts HTTP 204, preserves other metadata and verifies the result',async()=>{
  const f=fixture(p),r=await f.api.setTitle('Automod | Test | 18+');
  assert.equal(r.status,'confirmed');const patches=f.calls.filter(c=>c.method==='PATCH');assert.equal(patches.length,1);
  assert.deepEqual(JSON.parse(patches[0].body),p==='kick'?{stream_title:'Automod | Test | 18+'}:{title:'Automod | Test | 18+'});
  await f.api.setTitle('Automod | Test | 18+');assert.equal(f.calls.filter(c=>c.method==='PATCH').length,1);
 });
 test(p+' refuses missing title permission or a non-broadcaster identity without issuing requests',async()=>{
  for(const extra of [{scopes:SCOPES[p]},{userId:'43'},{login:'lunalive_bot'}]){
   const f=fixture(p,extra);await assert.rejects(f.api.setTitle('Title'),/title_authorization_required/);assert.equal(f.calls.length,0);
  }
 });
 test(p+' preserves a personal handoff happening during the preflight read',async()=>{
  const f=fixture(p);await assert.rejects(f.api.setTitle('Title',{stillAllowed:async()=>false}),/title_context_changed/);
  assert.equal(f.calls.filter(c=>c.method==='PATCH').length,0);
 });
 test(p+' preserves already granted title access during later authorizations',async()=>{
  const f=fixture(p);let u=new URL(await f.api.authorization('state','verifier'));
  assert.equal(u.searchParams.get('scope').includes(TITLE_SCOPES[p]),true);
  u=new URL(await f.api.authorization('state','verifier',{titles:true}));
  assert.equal(u.searchParams.get('scope').includes(TITLE_SCOPES[p]),true);
 });
}
test('synchronizer debounces mode changes and independently reports missing permissions',async()=>{
 let now=1000,context=active();const store=memory(),seen=[];
 const sync=new TitleSynchronizer({store,context:async()=>context,clock:()=>now,
  apis:{kick:{setTitle:async()=>{throw Error('title_authorization_required');}},
  twitch:{setTitle:async(title)=>{seen.push(title);return {status:'confirmed',title};}}}});
 await sync.tick();assert.equal(seen.length,0);now+=11000;await sync.tick();assert.equal(seen.length,1);
 assert.equal(store.get('titleSync').platforms.kick.status,'authorization_required');
 assert.equal(store.get('titleSync').platforms.twitch.status,'confirmed');
 context={...active(),publicationOwner:'manual'};now+=60000;await sync.tick();assert.equal(seen.length,1);
 assert.equal(store.get('titleSync').reason,'personal_stream_preserved');
});
test('invalid titles never reach an upstream endpoint',async()=>{
 const f=fixture('kick');for(const title of ['', 'x'.repeat(141),'a\nb'])await assert.rejects(f.api.setTitle(title),/invalid_stream_title/);
 assert.equal(f.calls.length,0);
});
test('mode context makes no local API request for manual or inactive publishers',async()=>{
 let reads=0;const fetchImpl=async()=>{reads++;throw Error('unexpected');};
 await contextWithAutomod({...active(),publicationOwner:'manual'},{fetchImpl});
 await contextWithAutomod({...active(),automodService:'inactive'},{fetchImpl});assert.equal(reads,0);
});
test('mode context only exposes mode and phase; nonce and private settings are dropped',async()=>{
 const result=await contextWithAutomod({publicationOwner:'automod',automodService:'active'},
  {fetchImpl:async()=>Response.json({ok:true,phase:'running',publisherActive:true,mode:'bonus-hunt',controlNonce:'private-test-nonce',
   config:{private:'hidden'},bonusHunt:{phase:'opening',entries:['hidden']}})});
 assert.deepEqual(result.titleContext,{available:true,mode:'auto-hunt',huntPhase:'opening'});
 assert.equal(JSON.stringify(result).includes('private-test'),false);
});
test('unavailable or malformed mode API fails closed',async()=>{
 for(const fetchImpl of [async()=>{throw Error('offline');},async()=>new Response('not json'),async()=>new Response('no',{status:500})]){
  const r=await contextWithAutomod(active(),{fetchImpl});assert.equal(r.titleContext.available,false);assert.equal(titlePlan(r),null);
 }
});
test('an absent offline Kick title stays unknown instead of becoming an empty confirmed title',async()=>{
 const f=fixture('kick');f.setTitle('');assert.equal(await f.api.channelTitle(),null);
});
