import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {handleNozeBotCommand,registerNozeBotCommands} from '../src/nozebot/commands.js';
const oldFetch=globalThis.fetch,oldFlag=process.env.NOZECOINS_ENABLED;
afterEach(()=>{globalThis.fetch=oldFetch;if(oldFlag===undefined)delete process.env.NOZECOINS_ENABLED;else process.env.NOZECOINS_ENABLED=oldFlag;});
const config={guildId:'1188913226990235800',commandsChannelId:'1304110217419559026',lunaLive:{baseUrl:'https://example.test',internalKey:'test-only',guildId:'1188913226990235800'}};
function interaction(name:string){const replies:any[]=[];return {commandName:name,guildId:config.guildId,user:{id:'100000000000000001'},id:'100000000000000002',guild:null,
 isButton:()=>false,isChatInputCommand:()=>true,deferReply:async()=>{},editReply:async(x:any)=>{replies.push(x);},replies};}
test('claim uses NozeCoins route and unique interaction receipt, never Rubis',async()=>{
 process.env.NOZECOINS_ENABLED='true';let request:any;
 globalThis.fetch=async(url:any,options:any)=>{request={url,body:JSON.parse(options.body)};return new Response(JSON.stringify({ok:true,delta:100,balance:100,nextAt:'2030-01-01T00:00:00Z'}));};
 const i=interaction('claim');assert.equal(await handleNozeBotCommand(i as any,config),true);
 assert.equal(request.url,'https://example.test/internal/bot/nozebot/coins/claim');assert.equal(request.body.receipt,i.id);
 assert.match(i.replies[0],/100 NozeCoins/);
});
test('cooldown is displayed accurately rather than treated as unknown network failure',async()=>{
 process.env.NOZECOINS_ENABLED='true';globalThis.fetch=async()=>new Response(JSON.stringify({ok:false,error:'cooldown',nextAt:'2030-01-01T00:00:00Z'}));
 const i=interaction('claim');await handleNozeBotCommand(i as any,config);assert.match(i.replies[0],/Délai en cours/);
});
test('a shop button belonging to another member cannot issue a debit',async()=>{
 process.env.NOZECOINS_ENABLED='true';globalThis.fetch=async()=>{throw Error('must not fetch');};
 const i={...interaction('shop'),customId:'nz:c:100000000000000099:claim:0',isButton:()=>true,isChatInputCommand:()=>false};
 await handleNozeBotCommand(i as any,config);assert.match(i.replies[0],/autre compte/);
});
test('enabled server registers only channel currency commands',async()=>{
 process.env.NOZECOINS_ENABLED='true';let commands:any[]=[];
 const client={guilds:{fetch:async()=>({commands:{set:async(c:any[])=>{commands=c;}}})}};
 await registerNozeBotCommands(client as any,config);
 assert.deepEqual(commands.map(c=>c.name),['link','claim','slot','solde','profil','shop','ameliorer','regles','sons']);
});
test('shop redirects to the site without fetching or debiting a wallet',async()=>{
 process.env.NOZECOINS_ENABLED='true';globalThis.fetch=async()=>{throw Error('must not fetch');};
 const i=interaction('shop');await handleNozeBotCommand(i as any,config);assert.match(i.replies[0].content,/shop/);assert.equal(i.replies[0].components[0].components[0].data.url,'https://lecasinoze.onrender.com/shop/');
});
test('insufficient funds give the actual shortfall',async()=>{
 process.env.NOZECOINS_ENABLED='true';globalThis.fetch=async()=>new Response(JSON.stringify({ok:false,error:'insufficient_coins',balance:10,cost:20,missing:10}),{status:409});
 const i=interaction('slot');await handleNozeBotCommand(i as any,config);assert.match(i.replies[0],/solde 10, prix 20, il manque 10/);
});
test('legacy Rubis blackjack is not dispatched after activation',async()=>{
 process.env.NOZECOINS_ENABLED='true';globalThis.fetch=async()=>{throw Error('must not fetch');};
 assert.equal(await handleNozeBotCommand(interaction('blackjack') as any,config),false);
});

test('profile shows persisted talents and shortcuts without debit',async()=>{
 process.env.NOZECOINS_ENABLED='true';let path='';
 globalThis.fetch=async(url:any)=>{path=String(url);return new Response(JSON.stringify({ok:true,profile:{username:'CNZ Viewer',balance:321,automod:999,nextClaimAt:null,rules:{claim:125,claimMs:24*3600000,rain:25,bet:20},tiers:{claim:1,cooldown:0,rain:0,slot:0}}}));};
 const i=interaction('profil');await handleNozeBotCommand(i as any,config);
 assert.match(path,/coins\/profile$/);
 const data=i.replies[0];assert.match(JSON.stringify(data.embeds[0].data.fields),/Valeur claim : \*\*1\/3\*\*/);
 assert.equal(data.components[0].components[0].data.url,'https://lecasinoze.onrender.com/shop/');
});
test('slot result can be watched publicly in the games channel without replaying debit',async()=>{
 process.env.NOZECOINS_ENABLED='true';let visibility:any;
 globalThis.fetch=async()=>new Response(JSON.stringify({ok:true,art:'OOOXXX',bet:20,payout:20,balance:100,replayed:true}));
 const i={...interaction('slot'),channelId:config.commandsChannelId,deferReply:async(x:any)=>{visibility=x;}};
 await handleNozeBotCommand(i as any,config);assert.equal(visibility.ephemeral,false);assert.match(i.replies[0],/\[OOO XXX\]/);
});
