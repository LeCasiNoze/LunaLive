import test from 'node:test';
import assert from 'node:assert/strict';
import {RaidError,raidUrl,startRumbleRaid} from '../src/rumble/raid.js';
import {parseLiveDirectory,sortTargets} from '../src/rumble/raid-directory.js';
import {callProviderAdmission} from '../src/calls/automod_provider_policy.js';

const target='https://rumble.com/v7abcde-target.html';
const session={username:'fixture',cookie:'u_s=fixture-cookie-not-a-real-secret',userAgent:'fixture'};
const response=(data:any,status=200)=>new Response(JSON.stringify(data),{status});
test('raid URLs accept only public Rumble video pages and discard tracking',()=>{
 assert.equal(raidUrl(target+'?tracking=1'),target);
 for(const url of ['http://rumble.com/v7abcde.html','https://evil.test/v7abcde.html','https://rumble.com.evil.test/v7abcde.html','https://rumble.com@evil.test/v7abcde.html','https://x@rumble.com/v7abcde.html','https://rumble.com:444/v7abcde.html','https://rumble.com/account/profile'])assert.equal(raidUrl(url),null);
});
test('native command is followed by exactly one confirmation, never ordinary chat',async()=>{
 const calls:{url:string;init:RequestInit}[]=[];
 const request:any=async(url:string,init:RequestInit)=>{calls.push({url,init});return calls.length===1?response({data:{target_url:target}}):response({data:{success:true}});};
 await startRumbleRaid({sourceVideoId:'123',targetUrl:target,session,sourceStillCurrent:async()=>true,request});
 assert.deepEqual(calls.map(c=>c.url),['https://rumble.com/chat/command','https://rumble.com/service.php?name=raid.confirm']);
 assert.deepEqual(JSON.parse(String(calls[0].init.body)),{video_id:'123',message:'/raid '+target});
 assert.equal((calls[1].init.body as FormData).get('video_id'),'123');
});
test('a different prepared destination cannot be confirmed',async()=>{
 let count=0;const request:any=async()=>{count++;return response({data:{target_url:'https://rumble.com/v7fffff-other.html'}});};
 await assert.rejects(startRumbleRaid({sourceVideoId:'123',targetUrl:target,session,sourceStillCurrent:async()=>true,request}),/raid_target_unconfirmed/);
 assert.equal(count,1);
});
test('a changed source live cannot be raided',async()=>{
 let count=0;const request:any=async()=>{count++;return response({data:{target_url:target}});};
 await assert.rejects(startRumbleRaid({sourceVideoId:'123',targetUrl:target,session,sourceStillCurrent:async()=>false,request}),/source_changed/);
 assert.equal(count,1);
});
test('unconfirmed network result is uncertain and must not be retried',async()=>{
 let count=0;const request:any=async()=>{if(++count===1)return response({data:{target_url:target}});throw Error('timeout');};
 await assert.rejects(startRumbleRaid({sourceVideoId:'123',targetUrl:target,session,sourceStillCurrent:async()=>true,request}),e=>e instanceof RaidError&&e.uncertain);
 assert.equal(count,2);
});
test('Rumble application errors do not produce a confirmation',async()=>{
 let count=0;const request:any=async()=>{count++;return response({errors:[{message:'not allowed'}]});};
 await assert.rejects(startRumbleRaid({sourceVideoId:'123',targetUrl:target,session,sourceStillCurrent:async()=>true,request}),/raid_refused/);assert.equal(count,1);
});
test('public directory extracts channel names rather than total channel views',()=>{
 const html=`<div class="videostream thumbnail__grid-item" role="listitem" data-video-id="123"><span class="videostream__number">2.23K</span><div class="videostream__status--live"></div><a class="title__link link" href="/v7abcde-raw.html?track=1"><h3>Title &amp; more</h3></a><span class="channel__name truncate">Channel &amp; Name</span><span>999K total views</span></div><a rel="next" href="?page=2">next</a>`;
 const r=parseLiveDirectory(html);assert.equal(r.hasMore,true);assert.deepEqual(r.targets,[{url:'https://rumble.com/v7abcde-raw.html',channel:'Channel & Name',viewers:2230,title:'Title & more',videoId:'123'}]);
});
test('viewer counts sort descending with unavailable counts last',()=>{
 const base={url:target,title:'',videoId:'123'};
 assert.deepEqual(sortTargets([{...base,channel:'a',viewers:null},{...base,channel:'b',viewers:0},{...base,channel:'c',viewers:100}]).map(t=>t.channel),['c','b','a']);
});
test('explicit personal publication overrides stale AutoMod intention for Play’n GO and BGaming',async()=>{
 const db:any={query:async()=>({rows:[{publication_owner:'manual',desired_enabled:true,dashboard_settings:{allowedProviders:['hacksaw','pragmatic']},runtime_status:{phase:'idle'}}]})};
 for(const provider of ['Play’n GO','Play n Go','BGaming'])assert.deepEqual(await callProviderAdmission(db,12,provider),{automod:false,allowed:true});
 assert.deepEqual(await callProviderAdmission(db,12,'BGaming',true),{automod:true,allowed:false});
});
test('AutoMod CAPTCHA and error pauses retain their provider restrictions',async()=>{
 for(const phase of ['running','error','idle']){
  const db:any={query:async()=>({rows:[{publication_owner:'automod',desired_enabled:true,runtime_status:{phase},dashboard_settings:{allowedProviders:['hacksaw']}}]})};
  assert.deepEqual(await callProviderAdmission(db,12,'Play’n GO'),{automod:true,allowed:false});
 }
});
