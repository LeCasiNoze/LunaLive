import test from 'node:test';
import assert from 'node:assert/strict';
import {LunaLiveDbTransport} from '../src/providers/lunalive/db_transport.ts';

test('Rumble clips are not re-executed; Luna clips and other Rumble commands remain dispatched',async()=>{
 const rows=[
  {id:1,body:'!clip first',external_source:'rumble',user_id:0},
  {id:2,body:'  !CLIP second',external_source:'rumble',user_id:0},
  {id:3,body:'!clip native',external_source:null,user_id:5},
  {id:4,body:'!discord',external_source:'rumble',user_id:0},
  {id:5,body:'!clipping',external_source:'rumble',user_id:0},
 ].map(row=>({...row,streamer_id:77,username:'viewer',created_at:new Date(),user_role:'viewer'}));
 let lastCursor=0;
 const pool={query:async(_sql,args)=>{lastCursor=args[1];return {rows:rows.filter(row=>row.id>lastCursor)};}};
 const transport=new LunaLiveDbTransport(pool,{BOT_CHAT_START_FROM_NOW:false,BOT_CHAT_BATCH:50,BOT_CHAT_POLL_MS:20},{id:77,slug:'test'});
 const dispatched=[];
 transport.start(msg=>dispatched.push(msg.body));
 try {
  await new Promise(resolve=>setTimeout(resolve,100));
  assert.deepEqual(dispatched,['!clip native','!discord','!clipping']);
  assert.equal(lastCursor,5);
 } finally {transport.stop();}
});
