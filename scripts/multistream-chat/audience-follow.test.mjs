import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {normalizeAudience,AudienceMonitor} from './audience.mjs';
import {normalizeKickFollow,normalizeTwitchFollow,verifyKickWebhook} from './security.mjs';
import {PlatformApi,TwitchReceiver} from './platforms.mjs';
import {Store} from './store.mjs';
import {RelayWorker} from './worker.mjs';
test('official viewer count is never invented from missing data',()=>{
 assert.deepEqual(normalizeAudience('twitch',{data:[]}),{live:false,viewers:0});
 assert.deepEqual(normalizeAudience('kick',{data:[{broadcaster_user_id:24912362,stream:{is_live:true,viewer_count:29}}]}),{live:true,viewers:29});
 assert.deepEqual(normalizeAudience('kick',{data:[{broadcaster_user_id:24912362,stream:{is_live:true}}]}),{live:true,viewers:null});
 assert.throws(()=>normalizeAudience('kick',{data:[]}));
 assert.throws(()=>normalizeAudience('kick',{data:[{broadcaster_user_id:99,stream:{is_live:true}}]}));
});
test('one provider failure leaves unknown instead of zero and does not block the other provider',async()=>{
 const samples=[],store=new Store(':memory:');
 const monitor=new AudienceMonitor({store,botKey:'fixture',apiBase:'https://fixture',apis:{kick:{async request(){throw Error('kick_http_503');}},twitch:{async request(){return {data:[{user_id:'535777475',type:'live',viewer_count:4}]};}}},fetchImpl:async(_url,options)=>{samples.push(JSON.parse(options.body));return new Response('{}');}});
 await monitor.tick();assert.equal(samples[0].viewers,null);assert.equal(samples[1].viewers,4);assert.equal(store.get('audienceDelivery:twitch').ok,true);store.close();
});
test('Kick follow requires the same valid signature, fixed event type and timestamp',()=>{
 const keys=generateKeyPairSync('rsa',{modulusLength:2048}),body={broadcaster:{user_id:24912362},follower:{user_id:9,username:'Alice'}};
 const raw=Buffer.from(JSON.stringify(body)),stamp=new Date().toISOString(),id='follow-123456';
 const headers={'kick-event-type':'channel.followed','kick-event-version':'1','kick-event-message-id':id,'kick-event-message-timestamp':stamp};
 headers['kick-event-signature']=sign('RSA-SHA256',Buffer.concat([Buffer.from(id+'.'+stamp+'.'),raw]),keys.privateKey).toString('base64');
 assert.equal(verifyKickWebhook(headers,raw,keys.publicKey),true);assert.equal(verifyKickWebhook(headers,Buffer.from('{}'),keys.publicKey),false);
 const normalized=normalizeKickFollow(body,headers);assert.equal(normalized.eventId,id);assert.equal(normalized.kind,'follow');assert.equal(normalized.userId,'9');
 assert.equal(normalizeTwitchFollow({broadcaster_user_id:'535777475',user_id:'9',user_name:'Alice',followed_at:stamp},id).eventId,id);
});
test('follow notifications use the durable follow endpoint and never execute a call or send a duplicate',async()=>{
 const store=new Store(':memory:'),vault={async get(){return {accessToken:'fixture',channelId:'24912362',userId:'24912362',login:'lecasinoze'};}};
 let requests=0;const worker=new RelayWorker({store,apis:{kick:{vault},twitch:{vault:{async get(){return {};}}}},apiBase:'https://fixture',botKey:'fixture',fetchImpl:async(url)=>{assert.match(url,/multichat\/follow$/);requests++;return new Response(JSON.stringify({ok:true,obsAlert:'sent'}));}});
 const event={kind:'follow',platform:'kick',channelId:'24912362',eventId:'follow-unique',userId:'9',username:'Alice',occurredAt:new Date().toISOString()};
 assert.equal((await worker.receive(event)).accepted,true);assert.equal((await worker.receive(event)).duplicate,true);
 await worker.processInbox();await worker.processInbox();assert.equal(requests,1);assert.equal(store.nextOutbox(),null);
 assert.equal((await worker.receive({...event,channelId:'999'})).accepted,false);store.close();
});
test('follow authorization is opt-in and preserves chat and title permissions',async()=>{
 const credential={clientId:'fixture',clientSecret:'fixture',scopes:['user:read:chat','user:write:chat','channel:manage:broadcast']};
 const api=new PlatformApi('twitch',{async get(){return credential;}},{origin:'https://fixture'});
 const plain=new URL(await api.authorization('state','verifier')),follow=new URL(await api.authorization('state','verifier',{follows:true}));
 assert.equal(plain.searchParams.get('scope').includes('moderator:read:followers'),false);
 for(const scope of [...credential.scopes,'moderator:read:followers'])assert.equal(follow.searchParams.get('scope').split(' ').includes(scope),true);
});

test('Twitch EventSub subscribes to follows v2 and delivers their native identity without disrupting chat',async()=>{
 let socket;const requested=[],events=[];let connected,following;
 const ready=new Promise(r=>connected=r),followsReady=new Promise(r=>following=r);
 class FakeSocket{constructor(){socket=this;this.handlers={};}addEventListener(type,fn){this.handlers[type]=fn;}close(){}emit(value){this.handlers.message({data:JSON.stringify(value)});}}
 const c={channelId:'535777475',userId:'535777475',scopes:['moderator:read:followers']};
 const api={async credential(){return c;},async request(path,options){if(options?.body)requested.push(JSON.parse(options.body));return {data:[]};}};
 const receiver=new TwitchReceiver(api,{WebSocketImpl:FakeSocket,onStatus:s=>{if(s==='connected')connected();},onFollowStatus:s=>{if(s==='connected')following();},onEvent:e=>{events.push(e);}});
 try{receiver.start();socket.emit({metadata:{message_type:'session_welcome'},payload:{session:{id:'fixture-session',keepalive_timeout_seconds:30}}});await ready;await followsReady;
  assert.deepEqual(requested.map(r=>r.type),['channel.chat.message','channel.follow']);assert.equal(requested[1].version,'2');assert.equal(requested[1].condition.moderator_user_id,c.userId);
  socket.emit({metadata:{message_type:'notification',message_id:'follow-delivery-1'},payload:{subscription:{type:'channel.follow'},event:{broadcaster_user_id:c.channelId,user_id:'91',user_name:'Alice',followed_at:new Date().toISOString()}}});
  await new Promise(r=>setImmediate(r));assert.equal(events[0].username,'Alice');assert.equal(events[0].kind,'follow');
 }finally{receiver.stop();}
});
