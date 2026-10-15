import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {handleSoundboardInteraction} from '../src/nozebot/soundboard.js';
const original=globalThis.fetch;
afterEach(()=>{globalThis.fetch=original;});
const config={guildId:'1188913226990235800',lunaLive:{baseUrl:'https://example.test',internalKey:'unit-test-only',guildId:'1188913226990235800'}};
const owner='100000000000000001';
function interaction(kind:'command'|'select'|'button',customId='',userId=owner){
 const replies:any[]=[];
 return {guildId:config.guildId,user:{id:userId},id:'100000000000000002',commandName:'sons',customId,values:['test-tone'],replies,
  isChatInputCommand:()=>kind==='command',isStringSelectMenu:()=>kind==='select',isButton:()=>kind==='button',
  deferReply:async(options:any)=>{assert.equal(options.ephemeral,true);},editReply:async(payload:any)=>{replies.push(payload);}};
}
const catalogue={ok:true,enabled:true,sounds:[{id:'test-tone',label:'Test fixture',audioUrl:'https://www.myinstants.com/media/sounds/test-tone.mp3',cost:25,durationMs:2000,volume:0.5}]};
test('disabled catalogue is explicit and cannot issue a debit',async()=>{
 const requests:string[]=[];globalThis.fetch=async(url:any)=>{requests.push(String(url));return new Response(JSON.stringify({ok:true,enabled:false,sounds:[]}));};
 const i=interaction('command');await handleSoundboardInteraction(i as any,config);
 assert.equal(requests.length,1);assert.match(requests[0]!,/sound-catalogue$/);assert.match(i.replies[0].content,/Aucun achat ni débit/);
});
test('selecting a sound displays preview and priced confirmation, never purchases',async()=>{
 const requests:string[]=[];globalThis.fetch=async(url:any)=>{requests.push(String(url));return new Response(JSON.stringify(catalogue));};
 const i=interaction('select',`nz:s:menu:${owner}`);await handleSoundboardInteraction(i as any,config);
 assert.equal(requests.length,1);assert.match(requests[0]!,/sound-catalogue$/);
 const buttons=i.replies[0].components[0].components;
 assert.equal(buttons[0].data.label,'Aperçu gratuit');assert.equal(buttons[1].data.custom_id,`nz:s:buy:${owner}:test-tone:25`);
});
test('another viewer cannot trigger a copied confirmation button',async()=>{
 globalThis.fetch=async()=>{throw Error('must not fetch');};
 const i=interaction('button',`nz:s:buy:${owner}:test-tone:25`,'100000000000000099');await handleSoundboardInteraction(i as any,config);
 assert.match(i.replies[0],/autre compte/);
});
test('a command copied from the shop selects its sound without purchasing',async()=>{
 const requests:string[]=[];globalThis.fetch=async(url:any)=>{requests.push(String(url));return new Response(JSON.stringify(catalogue));};
 const i={...interaction('command'),options:{getString:(name:string)=>name==='son'?'test-tone':null}};
 await handleSoundboardInteraction(i as any,config);
 assert.equal(requests.length,1);assert.match(requests[0]!,/sound-catalogue$/);
 assert.equal(i.replies[0].components[0].components[1].data.custom_id,`nz:s:buy:${owner}:test-tone:25`);
});
test('confirmed request carries a unique receipt and expected price, no viewer URL',async()=>{
 let request:any;globalThis.fetch=async(url:any,options:any)=>{request={url:String(url),body:JSON.parse(options.body)};return new Response(JSON.stringify({ok:true,state:'queued',balance:75}));};
 const i=interaction('button',`nz:s:buy:${owner}:test-tone:25`);await handleSoundboardInteraction(i as any,config);
 assert.match(request.url,/coins\/sound$/);assert.equal(request.body.receipt,i.id);assert.equal(request.body.expectedCost,25);assert.equal(request.body.soundId,'test-tone');assert.equal(request.body.audioUrl,undefined);
 assert.match(i.replies[0],/remboursé/);
});
test('OBS unavailable explicitly means no debit',async()=>{
 globalThis.fetch=async()=>new Response(JSON.stringify({ok:false,error:'soundboard_unavailable'}),{status:409});
 const i=interaction('button',`nz:s:buy:${owner}:test-tone:25`);await handleSoundboardInteraction(i as any,config);
 assert.match(i.replies[0],/Rien n’a été débité/);
});
