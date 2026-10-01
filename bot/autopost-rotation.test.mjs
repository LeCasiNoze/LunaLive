import assert from 'node:assert/strict';
import {StreamerRunner} from './dist/runtime/runner.js';
const real={setTimeout,clearTimeout,setInterval,clearInterval,fetch,log:console.log};
const timeouts=[],intervals=[],sent=[];
let messages=[],live=true;
const pool={async query(sql){
 if(sql.includes('FROM bot_commands'))return {rows:[]};
 if(sql.includes('FROM bot_autoposts'))return {rows:messages.map(message=>({message,every_sec:1200,enabled:true}))};
 if(sql.includes('SELECT is_live'))return {rowCount:1,rows:[{is_live:live}]};
 if(sql.includes('MAX(id)'))return {rows:[{id:0}]};
 return {rows:[]};
}};
try {
globalThis.setTimeout=(fn,delay)=>{const t={fn,delay};timeouts.push(t);return t;};
globalThis.clearTimeout=t=>{const i=timeouts.indexOf(t);if(i>=0)timeouts.splice(i,1);};
globalThis.setInterval=(fn,delay)=>{const t={fn,delay};intervals.push(t);return t;};
globalThis.clearInterval=()=>{};
globalThis.fetch=async(url,options)=>{if(url.endsWith('/internal/bot/chat/send'))sent.push(JSON.parse(options.body).body);return {ok:true,status:200};};
console.log=()=>{};
const runner=new StreamerRunner(pool,{BOT_DEFAULT_PREFIX:'!',BOT_CHAT_START_FROM_NOW:true,BOT_CHAT_POLL_MS:1000,BOT_CHAT_BATCH:10,BOT_API_BASE:'https://example.test',BOT_INTERNAL_KEY:'test-only'},{id:12,slug:'lecasinoze',displayName:'LeCasiNoze',isLive:true},{enabled:true,prefix:'!',liveOnly:true});
runner.start();
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
await flush();
await timeouts.shift().fn();
assert.equal(timeouts[0].delay,30000,'empty list must keep checking');
messages=['avis','discord','session'];
await intervals.find(x=>x.delay===10000).fn();await flush();
for(let i=0;i<4;i++){
 await timeouts.shift().fn();
 assert.equal(timeouts[0].delay,1200000,'one post per 20 minutes');
 await intervals.find(x=>x.delay===10000).fn();await flush();
}
assert.deepEqual(sent,['avis','discord','session','avis'],'rotation survives configuration reloads');
live=false;await timeouts.shift().fn();assert.equal(sent.length,4);assert.equal(timeouts[0].delay,30000);
runner.stop();assert.equal(timeouts.length,0);
real.log('PASS: empty startup recovery, reload-safe rotation, 20-minute interval, offline guard, stop');
}finally{Object.assign(globalThis,{setTimeout:real.setTimeout,clearTimeout:real.clearTimeout,setInterval:real.setInterval,clearInterval:real.clearInterval,fetch:real.fetch});console.log=real.log;}

