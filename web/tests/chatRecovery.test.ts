import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { startChatRecovery, reconcileChatHistory } from "../src/lib/chatRecovery.ts";
class FakeSocket extends EventEmitter {
  connected = false;
  sent: {event:string; payload:any; ack:(ack:any)=>void}[] = [];
  emit(event:string, payload?:any, ack?:any):boolean {
    if (event.startsWith("chat:")) { this.sent.push({event,payload,ack}); return true; }
    return super.emit(event,payload);
  }
  connect() { this.connected=true; this.emit("connect"); return this; }
  disconnect() { this.connected=false; this.emit("disconnect"); return this; }
}
function setup(mode:"public"|"popup"="public",timeoutMs=1000) {
  const socket=new FakeSocket(); let joined=0,synced=0;
  const recovery=startChatRecovery(socket as any,{slug:"channel",mode,timeoutMs,
    onJoined:()=>joined++,onSync:()=>synced++,onStatus:()=>{},onError:()=>{}});
  return {socket,recovery,joined:()=>joined,synced:()=>synced};
}
for (const mode of ["public","popup"] as const) test(`${mode}: rejoins after every reconnect`,()=>{
  const t=setup(mode); try {
    t.socket.connect(); t.socket.sent[0].ack({ok:true}); t.socket.disconnect().connect();
    assert.equal(t.socket.sent[1].event,"chat:join"); assert.equal(t.socket.sent[1].payload.mode,mode);
    t.socket.sent[1].ack({ok:true}); assert.equal(t.joined(),2);
  } finally {t.recovery.dispose();}
});
test("wake-up probes once, syncs history, and repairs missing room",()=>{
  const t=setup(); try {
    t.socket.connect(); t.socket.sent[0].ack({ok:true}); t.recovery.recover(); t.recovery.recover();
    assert.equal(t.socket.sent.length,2); assert.equal(t.socket.sent[1].event,"chat:refresh");
    t.socket.sent[1].ack({ok:true}); assert.equal(t.synced(),1);
    t.recovery.recover(); t.socket.sent[2].ack({ok:false,error:"chat_room_lost"});
    assert.equal(t.socket.sent[3].event,"chat:join");
  } finally {t.recovery.dispose();}
});
test("stalled socket reconnects and ignores late ack",async()=>{
  const t=setup("popup",30); try {
    t.socket.connect(); const late=t.socket.sent[0].ack;
    await new Promise(resolve=>setTimeout(resolve,45)); assert.ok(t.socket.sent.length>=2);
    late({ok:true}); assert.equal(t.joined(),0);
    t.socket.sent.at(-1)!.ack({ok:true}); assert.equal(t.joined(),1);
  } finally {t.recovery.dispose();}
});
test("cleanup removes listeners and ignores callbacks",()=>{
  const t=setup(); t.socket.connect(); const late=t.socket.sent[0].ack;
  t.recovery.dispose(); late({ok:true}); t.recovery.recover(); assert.equal(t.joined(),0);
  assert.equal(t.socket.listenerCount("connect"),0); assert.equal(t.socket.listenerCount("disconnect"),0);
});
test("history retains messages arriving during fetch without duplicates",()=>{
  assert.deepEqual(reconcileChatHistory([{id:1},{id:2}],[{id:2},{id:3}]),[{id:1},{id:2},{id:3}]);
  const result=reconcileChatHistory(Array.from({length:50},(_,id)=>({id})),[{id:50}]);
  assert.equal(result.length,50); assert.equal(result[0].id,1); assert.equal(result.at(-1)!.id,50);
});


test("history preserves local activity cards in chronological order",()=>{
  const result=reconcileChatHistory(
    [{id:1,createdAt:"2026-10-14T12:00:00Z"},{id:2,createdAt:"2026-10-14T12:02:00Z"}],
    [{id:3,createdAt:"2026-10-14T12:03:00Z"}],
    [{id:-1,createdAt:"2026-10-14T12:01:00Z"}],
  );
  assert.deepEqual(result.map(message=>message.id),[1,-1,2,3]);
});
