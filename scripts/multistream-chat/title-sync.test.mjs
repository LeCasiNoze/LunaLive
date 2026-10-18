import test from 'node:test';
import assert from 'node:assert/strict';
import {titlesForMode,syncTitles} from './mode-title-sync.mjs';
import {Store} from './store.mjs';
import {PlatformApi} from './platforms.mjs';
const status={phase:'running',publisherActive:true,config:{sessionMode:'classic',bonusHunt:{enabled:false}}};
test('only an active Automod owns the automatic titles',()=>{
 assert.equal(titlesForMode(status,'manual'),null);
 assert.equal(titlesForMode({...status,publisherActive:false},'automod'),null);
 assert.match(titlesForMode(status,'automod').twitch,/Auto Mode/);
 assert.match(titlesForMode({...status,config:{bonusHunt:{enabled:true}}},'automod').kick,/Auto Hunt/);
});
test('mode transitions update once, missing scopes back off, personal streams stay untouched',async()=>{
 const store=new Store(':memory:');const calls=[];
 const apis={kick:{title:async t=>calls.push(t)},twitch:{title:async()=>{throw Error('title_authorization_required');}}};
 try{
  let r=await syncTitles({status,owner:'automod',apis,store,now:100});assert.equal(r.twitch,'title_authorization_required');
  await syncTitles({status,owner:'automod',apis,store,now:200});assert.equal(calls.length,1);
  await syncTitles({status:{...status,config:{bonusHunt:{enabled:true}}},owner:'automod',apis,store,now:300});assert.equal(calls.length,2);
  await syncTitles({status,owner:'manual',apis,store,now:400});assert.equal(calls.length,2);
  await syncTitles({status,owner:'automod',apis,store,now:500});assert.equal(calls.length,3);
 }finally{store.close();}
});
test('title permissions are optional for existing chat connections and 204 is valid',async()=>{
 for(const platform of ['kick','twitch']){
  const scope=platform==='kick'?'channel:write':'channel:manage:broadcast';let patches=0;
  const credential={accessToken:'test',expiresAt:Date.now()+999999,clientId:'fixture',clientSecret:'fixture',channelId:'123',userId:'123',login:'lecasinoze',scopes:[scope]};
  const api=new PlatformApi(platform,{get:async()=>credential},{origin:'https://example.com',fetchImpl:async(_url,options)=>{
   if(options.method==='PATCH'){patches++;return new Response(null,{status:204});}
   return Response.json({data:[{title:'Auto Mode',stream_title:'Auto Mode'}]});
  }});
  await api.title('Auto Mode');assert.equal(patches,1);
  await assert.rejects(()=>api.title('Auto Mode',{stillAllowed:async()=>false}),/title_mode_changed/);assert.equal(patches,1);
  const base=new URL(await api.authorization('state','verifier'));assert.equal(base.searchParams.get('scope').includes(scope),false);
  const extra=new URL(await api.authorization('state','verifier',{manageTitles:true}));assert.equal(extra.searchParams.get('scope').includes(scope),true);
 }
});
