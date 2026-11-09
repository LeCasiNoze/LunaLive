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
