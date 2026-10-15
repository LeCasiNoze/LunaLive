import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../../web/public/overlay/obs/nozecoins-sounds.js',import.meta.url),'utf8');
function runtime(options:{token?:string;control?:boolean;autoStart?:boolean;session?:string;ready?:boolean;playFailure?:boolean;obsStreaming?:boolean;missingObs?:boolean}={}){
 const nodes=new Map<string,any>();const listeners=new Map<string,()=>unknown>();const timers:Array<()=>unknown>=[];
 const requests:Array<{action:string;body:any;authorization:string}>=[];const audio:any[]=[];let replaced='';
 const document={hidden:false,getElementById:(id:string)=>{if(!nodes.has(id))nodes.set(id,{hidden:true,textContent:'',addEventListener:(event:string,fn:()=>unknown)=>listeners.set(`${id}:${event}`,fn)});return nodes.get(id);},addEventListener:()=>{}};
 const context={document,location:{hash:options.token===undefined?'#token=test.token.signature':options.token,search:options.control?'?control=1':options.autoStart?'?autostart=1':'',pathname:'/overlay/obs/nozecoins-sounds.html'},
  history:{replaceState:(_state:any,_title:string,url:string)=>{replaced=url;}},URLSearchParams,crypto:{randomUUID:()=> '10000000-0000-4000-8000-000000000001'},
  AbortSignal:{timeout:()=>undefined},
  obsstudio:options.missingObs?undefined:{getStatus:(callback:any)=>callback({streaming:options.obsStreaming??true})},
  setInterval:(fn:()=>unknown)=>{timers.push(fn);return timers.length;},clearInterval:()=>{},setTimeout:()=>1,clearTimeout:()=>{},addEventListener:()=>{},
  fetch:async(url:string,init:any)=>{const action=url.split('/').at(-1)!;const body=JSON.parse(init.body);requests.push({action,body,authorization:init.headers.authorization});
   return {ok:true,status:200,json:async()=>action==='heartbeat'?{ok:true,ready:options.ready??true,session:options.session??null}:action==='next'?{ok:true,request:{requestId:'10000000-0000-4000-8000-000000000099',sound:{audioUrl:'https://myinstants.com/media/sounds/test.mp3',label:'Fixture',durationMs:2000,volume:0.5}}}:{ok:true}};},
  Audio:class {volume=0;src='';onplaying:any;onended:any;onerror:any;constructor(){audio.push(this);}play(){if(options.playFailure)return Promise.reject(Error('autoplay'));this.onplaying?.();return Promise.resolve();}pause(){}removeAttribute(){}load(){}},
 };
 vm.runInNewContext(code,context);
 return {nodes,listeners,timers,requests,audio,replaced:()=>replaced};
}
async function flush(){for(let i=0;i<8;i++)await new Promise<void>(resolve=>setImmediate(resolve));}
test('missing owner token never contacts a backend or starts a player',async()=>{
 const r=runtime({token:''});await flush();assert.equal(r.requests.length,0);assert.equal(r.audio.length,0);assert.match(r.nodes.get('status').textContent,/Configuration requise/);
});
test('controller page never claims or plays sounds, even when enabled',async()=>{
 const r=runtime({control:true});await flush();assert.equal(r.requests.length,0);assert.equal(r.timers.length,0);
 await r.listeners.get('enable:click')!();await flush();assert.deepEqual(r.requests.map(x=>x.action),['control']);assert.equal(r.audio.length,0);
 assert.equal(r.requests[0]?.body.enabled,true);assert.ok(!r.replaced().includes('token='));
});
test('successful audio is acknowledged only on ended, with auth outside URLs',async()=>{
 const r=runtime();await flush();const pending=r.timers[1]!();await flush();assert.equal(r.audio.length,1);assert.equal(r.requests.some(x=>x.action==='ack'),false);
 r.audio[0].onended();await pending;await flush();assert.equal(r.requests.find(x=>x.action==='ack')?.body.played,true);
 assert.ok(r.requests.every(x=>x.authorization==='Bearer test.token.signature'));
});
test('audio failure sends a failed receipt for server-side refund',async()=>{
 const r=runtime({playFailure:true});await flush();await r.timers[1]!();await flush();assert.equal(r.requests.find(x=>x.action==='ack')?.body.played,false);
});
test('not-ready OBS never claims or plays a queued sound',async()=>{
 const r=runtime({ready:false});await flush();await r.timers[1]!();await flush();assert.equal(r.requests.some(x=>x.action==='next'),false);assert.equal(r.audio.length,0);
});
test('OBS preview without streaming never advertises availability or buys playback',async()=>{
 const r=runtime({obsStreaming:false});await flush();await r.timers[1]!();await flush();assert.equal(r.requests.length,0);assert.equal(r.audio.length,0);
});
test('ordinary browser without OBS read access cannot become an audio consumer',async()=>{
 const r=runtime({missingObs:true});await flush();await r.timers[1]!();await flush();assert.equal(r.requests.length,0);assert.equal(r.audio.length,0);
});
test('automatic source arms only once per backend-verified personal session',async()=>{
 const r=runtime({autoStart:true,session:'live-123'});await flush();await r.timers[0]!();await flush();
 assert.equal(r.requests.filter(x=>x.action==='control').length,1);
 assert.equal(r.requests.find(x=>x.action==='control')?.body.enabled,true);
});
test('automatic source never arms an unverified or Automod session',async()=>{
 const r=runtime({autoStart:true,ready:false});await flush();await r.timers[0]!();await flush();
 assert.equal(r.requests.some(x=>x.action==='control'),false);
});
test('automatic source cannot arm from an offline OBS preview',async()=>{
 const r=runtime({autoStart:true,session:'live-123',obsStreaming:false});await flush();
 assert.equal(r.requests.length,0);
});
