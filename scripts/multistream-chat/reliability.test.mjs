import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHmac} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from './store.mjs';
import {PlatformApi,Vault} from './platforms.mjs';
import {RelayWorker} from './worker.mjs';
import {verifyKickWebhook,dashboardSessionValid,twitchReconnectUrl,twitchReplyAllowed} from './security.mjs';
import {planChatEvent} from './relay-policy.mjs';

const keys=generateKeyPairSync('rsa',{modulusLength:2048});
const raw=Buffer.from(JSON.stringify({message_id:'message-123',content:'bonjour'}));
const now=Date.now(),stamp=new Date(now).toISOString(),id='event-123456';
const signature=sign('RSA-SHA256',Buffer.concat([Buffer.from(id+'.'+stamp+'.'),raw]),keys.privateKey).toString('base64');
const headers={'kick-event-message-id':id,'kick-event-message-timestamp':stamp,'kick-event-signature':signature,'kick-event-type':'chat.message.sent','kick-event-version':'1'};
test('Kick accepts an authentic signed raw body',()=>assert.equal(verifyKickWebhook(headers,raw,keys.publicKey,now),true));
test('Kick rejects altered body, signature, type and stale timestamps',()=>{
  assert.equal(verifyKickWebhook(headers,Buffer.from('{}'),keys.publicKey,now),false);
  assert.equal(verifyKickWebhook({...headers,'kick-event-signature':'AAAA'},raw,keys.publicKey,now),false);
  assert.equal(verifyKickWebhook({...headers,'kick-event-type':'channel.followed'},raw,keys.publicKey,now),false);
  assert.equal(verifyKickWebhook(headers,raw,keys.publicKey,now+301_000),false);
});
test('private panel accepts existing LunaClip sessions but refuses expired or forged ones',()=>{
  const token='test-only-dashboard-key',payload=Math.floor(now/1000+3600)+'.nonce';
  const cookie='lunaclip_session='+payload+'.'+createHmac('sha256',token).update('dashboard-session:'+payload).digest('base64url');
  assert.equal(dashboardSessionValid(cookie,token,now),true);
  assert.equal(dashboardSessionValid(cookie,'wrong',now),false);
  assert.equal(dashboardSessionValid(cookie,token,now+3601_000),false);
  assert.equal(dashboardSessionValid('',token,now),false);
});
test('Twitch reconnect endpoints cannot send credentials to another host',()=>{
  assert.match(twitchReconnectUrl('wss://eventsub.wss.twitch.tv/ws?session=123'),/^wss:/);
  for(const url of ['wss://evil.example/ws','https://eventsub.wss.twitch.tv','wss://user@eventsub.wss.twitch.tv/ws'])assert.throws(()=>twitchReconnectUrl(url));
});
test('Twitch local Discord replies are allowed, external live and casino promotions blocked',()=>{
  assert.equal(twitchReplyAllowed('Discord : https://discord.gg/example'),true);
  assert.equal(twitchReplyAllowed('Suite du direct sur https://rumble.com/c/lecasinoze'),false);
  assert.equal(twitchReplyAllowed('Rejoins https://shuffle.com'),false);
});
test('durable inbox cannot execute a repeated event twice and OAuth states are one-use',()=>{
  const store=new Store(':memory:');
  assert.equal(store.receive('a',{text:'!call fixture'}),true);assert.equal(store.receive('a',{text:'!call fixture'}),false);
  assert.equal(store.nextInbox().id,'a');assert.equal(store.nextInbox(),null);store.finishInbox('a');assert.equal(store.nextInbox(),null);
  const oauth=store.oauth('kick');assert.equal(store.consumeOauth(oauth.state,'kick').verifier,oauth.verifier);assert.throws(()=>store.consumeOauth(oauth.state,'kick'));store.close();
});
test('crash during external send is marked uncertain on restart instead of duplicated',()=>{
  const dir=mkdtempSync(join(tmpdir(),'multichat-test-')),path=join(dir,'relay.sqlite');
  try{let store=new Store(path);store.enqueue('a','kick','test');assert.equal(store.nextOutbox().id,'a');store.close();store=new Store(path);assert.equal(store.nextOutbox(),null);assert.equal(store.counts().outbox[0].status,'uncertain');store.close();}finally{rmSync(dir,{recursive:true,force:true});}
});
test('old outbound messages expire instead of flooding a chat on recovery',()=>{
  const store=new Store(':memory:');store.enqueue('a','kick','test');assert.equal(store.nextOutbox(Date.now()+601_000),null);assert.equal(store.counts().outbox[0].status,'expired');store.close();
});
test('temporary broadcaster identity keeps human commands while ignoring confirmed relay echoes',()=>{
  const config={streamerSlug:'lecasinoze',channels:{kick:'42'},botUserIds:{kick:['42']},sharedSenderIds:{kick:'42'}};
  const event={platform:'kick',channelId:'42',messageId:'a',userId:'42',username:'LeCasiNoze',text:'!discord'};
  assert.equal(planChatEvent(event,config).command.name,'discord');assert.equal(planChatEvent({...event,origin:'relay'},config).ignored,true);
});
test('expired access token refreshes once under concurrency and persists rotated refresh token',async()=>{
  let refreshes=0;
  const credential={clientId:'fake-client',clientSecret:'fixture-only',accessToken:'old',refreshToken:'refresh-old',expiresAt:0,scopes:['user:read:chat','user:write:chat'],userId:'42',channelId:'42'};
  const vault={value:credential,async get(){return this.value;},async save(_p,value){this.value=value;}};
  const api=new PlatformApi('twitch',vault,{origin:'https://panel.example',fetchImpl:async()=>{refreshes++;await new Promise(resolve=>setTimeout(resolve,5));return new Response(JSON.stringify({access_token:'new',refresh_token:'refresh-new',expires_in:3600,scope:credential.scopes}));}});
  const results=await Promise.all([api.credential(),api.credential(),api.credential()]);assert.equal(refreshes,1);assert.equal(vault.value.refreshToken,'refresh-new');assert.equal(results.every(value=>value.accessToken==='new'),true);
});
test('an authorization for a different channel is rejected without replacing the previous credential',async()=>{
  const vault={value:{clientId:'fixture',clientSecret:'fixture'},async get(){return this.value;},async save(_p,value){this.value=value;}};
  const api=new PlatformApi('twitch',vault,{origin:'https://panel.example',fetchImpl:async url=>new Response(JSON.stringify(url.includes('/token')?{access_token:'wrong',refresh_token:'wrong-refresh',expires_in:3600,scope:['user:read:chat','user:write:chat']}:{data:[{id:'9',login:'other'}]}))});
  await assert.rejects(api.exchange('fixture-code','fixture-verifier'),/wrong_account/);assert.equal(vault.value.accessToken,undefined);
});
test('HTTP 401 refreshes and retries once; successful message must have a provider message ID',async()=>{
  const value={clientId:'fixture',clientSecret:'fixture',accessToken:'old',refreshToken:'r',expiresAt:Date.now()+3600_000,scopes:['user:read:chat','user:write:chat'],userId:'42',channelId:'42'};
  const vault={value,async get(){return this.value;},async save(_p,v){this.value=v;}};let sent=0;
  const api=new PlatformApi('twitch',vault,{fetchImpl:async url=>{if(url.includes('/token'))return new Response(JSON.stringify({access_token:'new',refresh_token:'next',expires_in:3600,scope:value.scopes}));if(++sent===1)return new Response('{}',{status:401});return new Response(JSON.stringify({data:[{is_sent:true,message_id:'id-123'}]}));}});
  assert.equal(await api.send('Test technique'),'id-123');assert.equal(sent,2);assert.equal(vault.value.refreshToken,'next');
});
test('relay waits for the central idempotent bridge before acknowledging synchronization',async()=>{
  const store=new Store(':memory:');store.receive('event-key',{platform:'twitch',channelId:'42',messageId:'msg',userId:'1',username:'Alice',text:'!discord'});
  let requests=0;const worker=new RelayWorker({store,apis:{},apiBase:'https://api.example',botKey:'fixture',fetchImpl:async()=>{requests++;return new Response(JSON.stringify({ok:true,replies:[{id:80,body:'Discord : https://discord.gg/test'}]}));}});
  await worker.processInbox();await worker.processInbox();assert.equal(requests,1);assert.equal(store.counts().inbox[0].status,'done');assert.equal(store.nextOutbox().id,'db:80:twitch');store.close();
});
test('missing API integration blocks the event explicitly and never claims successful synchronization',async()=>{
  const store=new Store(':memory:');store.receive('event-key',{platform:'kick',text:'test'});
  const worker=new RelayWorker({store,apis:{},apiBase:'https://api.example',botKey:'fixture',fetchImpl:async()=>new Response('{}',{status:404})});
  await worker.processInbox();assert.equal(store.counts().inbox[0].status,'blocked');assert.equal(store.nextOutbox(),null);store.close();
});
test('shared Discord reply reaches Kick and Twitch, ordinary viewer chat reaches Kick only',async()=>{
  const store=new Store(':memory:');store.set('chatCursor','0');
  const rows=[{id:'1',user_id:9,username:'Alice',body:'bonjour',external_source:null,created_at:new Date()},
    {id:'2',user_id:99,username:'LunaBot',body:'Discord : https://discord.gg/test',external_source:null,created_at:new Date()},
    {id:'3',user_id:0,username:'RumbleBot',body:'message déjà relayé',external_source:'rumble',created_at:new Date()}];
  const worker=new RelayWorker({store,apis:{},pool:{async query(){return {rows};}}});
  worker.streamerId=1;worker.botUserId=99;worker.rumbleBotName='rumblebot';worker.credentials={kick:{channelId:'k'},twitch:{channelId:'t'}};
  await worker.tail();const out=store.db.prepare('SELECT id,platform,text FROM outbox ORDER BY id').all();
  assert.deepEqual(out.map(row=>row.id),['db:1:kick','db:2:kick','db:2:twitch']);assert.equal(store.get('chatCursor'),'3');store.close();
});
