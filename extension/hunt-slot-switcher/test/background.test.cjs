const {test}=require("node:test");const assert=require("node:assert/strict");const vm=require("node:vm");const fs=require("node:fs");const path=require("node:path");
function fixture(){
 const store={},sent=[];let handler,release;
 const tabs=[{id:8,url:"https://shuffle.com/games/old"},{id:9,url:"https://celsiuscasino.co/"}];
 const chrome={storage:{session:{get:async k=>({[k]:store[k]}),set:async data=>Object.assign(store,data),remove:async k=>{delete store[k];}}},
 tabs:{query:async filter=>filter?.active?[tabs[0]]:tabs,get:async id=>{const t=tabs.find(x=>x.id===id);if(!t)throw Error("closed");return t;},onRemoved:{addListener(){}},
 sendMessage:async(id,m)=>{if(m.type==="probe")return {ok:true};sent.push({id,...m});if(m.type==="cancel"){release?.({ok:false,error:"cancelled"});return {ok:true};}return await new Promise(r=>{release=r;});}},
 runtime:{onMessage:{addListener:f=>{handler=f;}}}};
 let ctx;
 function boot(){
  ctx=vm.createContext({URL,chrome,console});
  ctx.importScripts=()=>vm.runInContext(fs.readFileSync(path.join(__dirname,"../core.js"),"utf8"),ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname,"../background.js"),"utf8"),ctx);
 }
 boot();
 const sender={tab:{id:3},url:"https://lunalive.win/dashboard",frameId:0};
 const request=(m,s=sender)=>new Promise(r=>handler(m,s,r));
 return {store,sent,tabs,request,chrome,release:r=>release(r),restart:boot};
}
async function enabled(f){await f.request({type:"bind"},{});assert.equal((await f.request({type:"enable"})).ok,true);}
const slot={callId:"44",name:"Gems Bonanza"};
test("rejects a foreign page and iframe before opening any casino",async()=>{
 const f=fixture();assert.equal((await f.request({type:"open",slot},{tab:{id:3},url:"https://evil.test",frameId:0})).ok,false);
 assert.equal((await f.request({type:"open",slot},{tab:{id:3},url:"https://lunalive.win",frameId:1})).ok,false);assert.equal(f.sent.length,0);
});
test("must be enabled and must resolve ambiguity explicitly",async()=>{
 const f=fixture();assert.equal((await f.request({type:"enable"})).ok,false);assert.equal((await f.request({type:"open",slot})).ok,false);assert.equal(f.sent.length,0);
});
test("serializes rapid requests, then deduplicates the completed call",async()=>{
 const f=fixture();await enabled(f);const first=f.request({type:"open",slot});
 await new Promise(r=>setImmediate(r));
 const second=await f.request({type:"open",slot:{...slot,callId:"45"}});assert.equal(second.ok,false);assert.equal(f.sent.length,1);
 f.release({ok:true});assert.equal((await first).ok,true);
 assert.equal((await f.request({type:"open",slot})).ok,true);assert.equal(f.sent.length,1);
});
test("OFF cancels pending search and prevents future navigation",async()=>{
 const f=fixture();await enabled(f);const pending=f.request({type:"open",slot});await new Promise(r=>setImmediate(r));
 assert.equal((await f.request({type:"disable"})).ok,true);assert.equal((await pending).ok,false);
 assert.equal(f.sent[1].type,"cancel");assert.equal((await f.request({type:"open",slot:{...slot,callId:"46"}})).ok,false);
});
test("changing the selected tab to a different casino does not silently retarget",async()=>{
 const f=fixture();await enabled(f);f.tabs[0].url="https://celsiuscasino.com/";assert.equal((await f.request({type:"open",slot})).ok,false);assert.equal(f.sent.length,0);
});
test("consent is stored for MV3 service-worker suspension, not in local cookies",async()=>{
 const f=fixture();await enabled(f);assert.equal(f.store["huntSource:3"].target,8);await f.request({type:"disable"});assert.equal(f.store["huntSource:3"],undefined);
});
test("a sleeping MV3 worker restores consent and completed-call dedupe",async()=>{
 const f=fixture();await enabled(f);const pending=f.request({type:"open",slot});await new Promise(r=>setImmediate(r));f.release({ok:true});await pending;
 f.restart();assert.equal((await f.request({type:"open",slot})).ok,true);assert.equal(f.sent.length,1);
 const next=f.request({type:"open",slot:{...slot,callId:"45"}});await new Promise(r=>setImmediate(r));assert.equal(f.sent.length,2);f.release({ok:true});assert.equal((await next).ok,true);
});
test("OFF while enable is resolving wins over the late enable reply",async()=>{
 const f=fixture();await f.request({type:"bind"},{});
 let unblock;f.chrome.tabs.query=()=>new Promise(r=>{unblock=r;});const pending=f.request({type:"enable"});await new Promise(r=>setImmediate(r));
 await f.request({type:"disable"});unblock(f.tabs);assert.equal((await pending).ok,false);assert.equal(f.store["huntSource:3"],undefined);
});
test("activation requires a content-script handshake on the actual casino tab",async()=>{
 const f=fixture();await f.request({type:"bind"},{});
 f.chrome.tabs.sendMessage=async()=>{throw Error("Receiving end does not exist");};
 const response=await f.request({type:"enable"});assert.equal(response.ok,false);assert.match(response.error,/Recharge/);assert.equal(f.store["huntSource:3"],undefined);
});
