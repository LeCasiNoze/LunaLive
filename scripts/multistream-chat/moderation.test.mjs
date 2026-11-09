import test from 'node:test';
import assert from 'node:assert/strict';
import {RelayWorker} from './worker.mjs';
import {Store} from './store.mjs';

test('suppressed Kick identities cannot enter the inbox, including case changes and renames',async()=>{
 const store=new Store(':memory:');
 try{
  store.set('suppressedKickUsers',[{username:'Spammer',userId:'123'}]);
  const worker=new RelayWorker({store,apis:{},fetchImpl:()=>{throw Error('must not send');}});
  for(const event of [{platform:'kick',userId:'123',username:'NewName'},{platform:'kick',userId:'456',username:'SPAMMER'}]){
   assert.deepEqual(await worker.receive(event),{accepted:false,reason:'owner_muted_spam'});
  }
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM inbox').get().n,0);
  assert.equal(worker.isSuppressed({platform:'kick',userId:'456',username:'Viewer'}),false);
  assert.equal(worker.isSuppressed({platform:'twitch',userId:'123',username:'Spammer'}),false);
 }finally{store.close();}
});

test('already queued messages are ignored when their Kick sender is suppressed',async()=>{
 const store=new Store(':memory:');
 try{
  store.receive('queued-before-mute',{platform:'kick',userId:'123',username:'Spammer'});
  store.set('suppressedKickUsers',[{username:'Spammer',userId:'123'}]);
  let sends=0;
  const worker=new RelayWorker({store,apis:{},fetchImpl:()=>{sends++;throw Error('must not send');}});
  await worker.processInbox();
  assert.equal(sends,0);
  assert.equal(store.db.prepare('SELECT status FROM inbox').get().status,'ignored');
 }finally{store.close();}
});

test('current Kick seller campaigns are detected, warnings and normal chat are not',async()=>{
 const {spamSignature}=await import('./kick-community.mjs');
 for(const text of ["Kick views, follows & chat bøts - don't get ripped off, fair pricing with no middlemen!",
  'Kick views, followers & chat bøts - grow fast, custom usernames for all!','own kick. co m',
  '@lecasinoze Make your stream fire with "Bot Liva com" @8c9e0c',
  'With our AI service, your chat stays online 24/7. To stop receiving messages, simply type **!noads**.'])
  assert.ok(spamSignature(text),text);
 for(const text of ['attention les chat bots qui vendent des views follows, ne cliquez pas','rainbet is amaaazing',
  '!call street racer','tu te fais pas strike avec le contenu casino ?',"don't click the kick views & chat bots link",'go sur kick.com/lecasinoze'])
  assert.equal(spamSignature(text),null,text);
});

test('a LunaLive moderator ban queues the Kick ban and message deletions',async()=>{
 const {KickCommunity}=await import('./kick-community.mjs');
 const store=new Store(':memory:');
 try{
  const queries=[];
  const pool={query:async(sql,params)=>{queries.push([sql,params]);
   if(/FROM external_chat_bans/.test(sql))return {rows:[{external_user_id:'777',username:'Rude'}]};
   if(/FROM multichat_bridge_events/.test(sql))return {rows:[{message_id:'m1'},{message_id:'m2'}]};
   return {rows:[]};}};
  const community=new KickCommunity({store,api:null,pool});
  await community.lunaliveBans();
  assert.equal(store.db.prepare("SELECT reason,ban_status FROM kick_spam_accounts WHERE user_id='777'").get().reason,'lunalive_moderator_ban');
  assert.deepEqual(store.db.prepare("SELECT message_id FROM kick_spam_messages ORDER BY message_id").all().map(r=>r.message_id),['m1','m2']);
  assert.ok(queries.some(([sql,params])=>/UPDATE external_chat_bans/.test(sql)&&params[1]==='queued'));
  assert.equal(community.known({platform:'kick',kind:'chat',channelId:'24912362',userId:'777'}),true);
 }finally{store.close();}
});
