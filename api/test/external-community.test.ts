import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import type {Pool} from 'pg';
import {externalAccountsSchema,issueExternalCode,consumeExternalCode,resolveExternalUser,externalAccountStatus,synchronizeExternalName} from '../src/community/external-accounts.js';
import {joinCommunityRain} from '../src/community/rain-join.js';
import {handleExternalCommunityChat} from '../src/community/external-chat.js';
import {pool} from '../src/db.js';
import {assertDiscordBinding} from '../src/community/discord-binding.js';
import {nextEphemeralChatId} from '../src/socket_emit.js';
import {getLinkedUser} from '../src/discord/link.js';

async function fixture(){
 const db=new PGlite();
 await db.exec(`CREATE TABLE users(id int PRIMARY KEY,username text UNIQUE,rubis int DEFAULT 0,role text DEFAULT 'viewer');
 CREATE TABLE streamers(id int PRIMARY KEY,slug text,is_live boolean);
 CREATE TABLE discord_links(discord_user_id text PRIMARY KEY,user_id int UNIQUE);
 CREATE TABLE user_oauth_identities(provider text,provider_user_id text,user_id int);
 INSERT INTO users(id,username) VALUES(1,'Alice'),(2,'Bob');INSERT INTO streamers VALUES(1,'test',TRUE);
 CREATE TABLE bot_rain_cfg(streamer_id int,enabled boolean);INSERT INTO bot_rain_cfg VALUES(1,TRUE);
 CREATE TABLE bot_rain_state(streamer_id int PRIMARY KEY,phase text,close_at_ms bigint,round_id bigint,open_at_ms bigint);
 CREATE TABLE bot_rain_joins(streamer_id int,round_id bigint,user_id int,username text,UNIQUE(streamer_id,round_id,user_id));`);
 const query=async(sql:string,params?:any[])=>{
  if(sql.includes('pg_advisory_xact_lock'))return {rows:[],rowCount:1};
  if(!params&&sql.includes(';')){await db.exec(sql);return {rows:[],rowCount:0};}
  const result=await db.query(sql,params);return {...result,rowCount:result.affectedRows??result.rows.length};
 };
 const adapter={query,connect:async()=>({query,release(){}})} as unknown as Pool;
 await externalAccountsSchema(adapter);
 const open=()=>db.query('INSERT INTO bot_rain_state VALUES(1,\'open\',$1,23,$2) ON CONFLICT(streamer_id) DO UPDATE SET phase=\'open\',close_at_ms=EXCLUDED.close_at_ms',[Date.now()+60000,Date.now()-60000]);
 return {db,adapter,open};
}

test('link code proves immutable Rumble ID, expires, and cannot be replayed or transfer an account',async()=>{
 const f=await fixture();try{
  const code=await issueExternalCode(f.adapter,1);
  await consumeExternalCode(f.adapter,{code:code.command.slice(6),externalId:'100',username:'AliceRum',streamerId:1});
  assert.equal(await resolveExternalUser(f.adapter,'rumble','100',1),1);
  await assert.rejects(consumeExternalCode(f.adapter,{code:code.command.slice(6),externalId:'200',username:'BobRum',streamerId:1}),/invalid_code/);
  const attacker=await issueExternalCode(f.adapter,2);
  await assert.rejects(consumeExternalCode(f.adapter,{code:attacker.command.slice(6),externalId:'100',username:'Taken',streamerId:1}),/identity_conflict/);
  assert.equal(await resolveExternalUser(f.adapter,'rumble','100',1),1);
  await f.db.query('UPDATE external_account_codes SET expires_at=NOW()-INTERVAL \'1 minute\' WHERE user_id=2');
  await assert.rejects(consumeExternalCode(f.adapter,{code:attacker.command.slice(6),externalId:'200',username:'BobRum',streamerId:1}),/invalid_code/);
 }finally{await f.db.close();}
});
test('existing verified Discord chain works in either linking order, including Discord OAuth',async()=>{
 const f=await fixture();try{
  await f.db.query(`INSERT INTO automod_discord_links(streamer_id,discord_user_id,rumble_user_id,username) VALUES(1,'123456789012345678','100','AliceRum')`);
  assert.equal(await resolveExternalUser(f.adapter,'rumble','100',1),null);
  await f.db.query(`INSERT INTO user_oauth_identities VALUES('discord','123456789012345678',1)`);
  assert.equal(await resolveExternalUser(f.adapter,'rumble','100',1),1);
  const status=await externalAccountStatus(f.adapter,1);assert.equal(status.rumble.linked,true);assert.equal(status.rumble.via,'discord');
  await f.db.query(`INSERT INTO discord_links VALUES('123456789012345678',2)`);
  await assert.rejects(resolveExternalUser(f.adapter,'rumble','100',1),/identity_conflict/);
 }finally{await f.db.close();}
});
test('web and external chat joins share one entry; no local ruby payout or duplicate announcement',async()=>{
 const f=await fixture();try{
  await f.open();const notices:any[]=[];const io={to(){return this;},emit(...args:any[]){notices.push(args);}} as any;
  const first=await joinCommunityRain(f.adapter,io,{streamerId:1,slug:'test'},{id:1,username:'<Alice>'});
  const second=await joinCommunityRain(f.adapter,io,{streamerId:1,slug:'test'},{id:1,username:'<Alice>'});
  assert.equal(first.ok,true);assert.equal(second.ok&&second.alreadyJoined,true);
  assert.equal((await f.db.query('SELECT * FROM bot_rain_joins')).rows.length,1);
  assert.equal(notices.length,2);assert.ok(notices[1][1].data.html.includes('&lt;Alice&gt;'));
  assert.equal((await f.db.query<{rubis:number}>('SELECT rubis FROM users WHERE id=1')).rows[0].rubis,0);
  const disconnected={to(){throw Error('socket disconnected');}} as any;
  assert.equal((await joinCommunityRain(f.adapter,disconnected,{streamerId:1,slug:'test'},{id:2,username:'Bob'})).ok,true);
  await f.db.query('UPDATE bot_rain_state SET close_at_ms=$1',[Date.now()-1]);
  assert.equal((await joinCommunityRain(f.adapter,io,{streamerId:1,slug:'test'},{id:2,username:'Bob'})).ok,false);
 }finally{await f.db.close();}
});

test('Discord recognizes LunaLive through a direct Rumble proof, and conflicting proofs fail closed',async()=>{
 const f=await fixture();try{
  await f.db.query(`INSERT INTO automod_discord_links(streamer_id,discord_user_id,rumble_user_id,username) VALUES(1,'123456789012345678','100','AliceRum')`);
  const code=await issueExternalCode(f.adapter,1);
  await consumeExternalCode(f.adapter,{code:code.command.slice(6),externalId:'100',username:'AliceRum',streamerId:1});
  assert.equal((await getLinkedUser('123456789012345678',f.adapter))?.id,1);
  assert.equal((await externalAccountStatus(f.adapter,1)).discordLinked,true);
  await assert.rejects(assertDiscordBinding(f.adapter,'123456789012345678',2),/identity_conflict/);
  await f.db.query(`INSERT INTO discord_links VALUES('123456789012345678',2)`);
  assert.equal(await getLinkedUser('123456789012345678',f.adapter),null);
  assert.equal((await externalAccountStatus(f.adapter,1)).rumble.linked,false);
 }finally{await f.db.close();}
});
test('unlinked rain gets a short connection link; replayed commands and absent rain do nothing',async(t)=>{
 const f=await fixture();try{
  t.mock.method(pool,'query',async()=>({rows:[]}));
  const m={provider:'rumble' as const,externalId:'100',streamerId:1,slug:'test',username:'AliceRum',text:'!rain',createdAt:new Date()};
  assert.equal(await handleExternalCommunityChat(f.adapter,undefined,m),null);
  await f.open();const hint=await handleExternalCommunityChat(f.adapter,undefined,m);assert.match(hint!,/profile\?tab=settings#connections/);
  await f.db.query('UPDATE bot_rain_state SET open_at_ms=$1',[Date.now()+1000]);
  assert.equal(await handleExternalCommunityChat(f.adapter,undefined,m),null);
  await f.db.query('UPDATE bot_rain_state SET open_at_ms=$1',[Date.now()-60000]);
  assert.equal((await f.db.query('SELECT * FROM bot_rain_joins')).rows.length,0);
  assert.equal(await handleExternalCommunityChat(f.adapter,undefined,{...m,createdAt:new Date(Date.now()-180000)}),null);
  const code=await issueExternalCode(f.adapter,1);await consumeExternalCode(f.adapter,{code:code.command.slice(6),externalId:'100',username:'AliceRum',streamerId:1});
  assert.match((await handleExternalCommunityChat(f.adapter,undefined,m))!,/validée/);
  assert.match((await handleExternalCommunityChat(f.adapter,undefined,m))!,/déjà/);
 }finally{await f.db.close();}
});
test('names sync only with consent; stale observations and occupied names never rename another account',async()=>{
 const f=await fixture();try{
  const code=await issueExternalCode(f.adapter,1);await consumeExternalCode(f.adapter,{code:code.command.slice(6),externalId:'100',username:'AliceRum',streamerId:1});
  await synchronizeExternalName(f.adapter,'100','RumbleName',new Date(Date.now()+100));
  assert.equal((await f.db.query<{username:string}>('SELECT username FROM users WHERE id=1')).rows[0].username,'Alice');
  await f.db.query(`UPDATE external_account_links SET sync_username=TRUE`);
  await synchronizeExternalName(f.adapter,'100','RumbleName',new Date(Date.now()+200));
  assert.equal((await f.db.query<{username:string}>('SELECT username FROM users WHERE id=1')).rows[0].username,'RumbleName');
  await synchronizeExternalName(f.adapter,'100','OldName',new Date(Date.now()-10000));
  await synchronizeExternalName(f.adapter,'100','Bob',new Date(Date.now()+300));
  assert.equal((await f.db.query<{username:string}>('SELECT username FROM users WHERE id=1')).rows[0].username,'RumbleName');
 }finally{await f.db.close();}
});
test('Discord link refuses to move another LunaLive account, including an OAuth identity',async()=>{
 const f=await fixture();try{
  await f.db.query("INSERT INTO user_oauth_identities VALUES('discord','123456789012345678',1)");
  await assertDiscordBinding(f.adapter,'123456789012345678',1);
  await assert.rejects(assertDiscordBinding(f.adapter,'123456789012345678',2),/identity_conflict/);
  await assert.rejects(assertDiscordBinding(f.adapter,'223456789012345678',1),/identity_conflict/);
 }finally{await f.db.close();}
});
test('simultaneous system/activity messages have distinct safe numeric IDs',()=>{
 const ids=Array.from({length:5000},()=>nextEphemeralChatId());assert.equal(new Set(ids).size,5000);assert.ok(ids.every(id=>Number.isSafeInteger(id)&&id<0));
});
test('verified future platform identities reuse the same rain admission',async(t)=>{
 const f=await fixture();try{
  t.mock.method(pool,'query',async()=>({rows:[]}));await f.open();
  await f.db.query("INSERT INTO external_account_links(provider,external_id,user_id,username) VALUES('kick','kick-alice',1,'Alice')");
  const m={provider:'kick' as const,externalId:'kick-alice',streamerId:1,slug:'test',username:'Alice',text:'!rain',createdAt:new Date()};
  assert.match((await handleExternalCommunityChat(f.adapter,undefined,m))!,/validée/);
  assert.equal((await f.db.query('SELECT * FROM bot_rain_joins')).rows.length,1);
 }finally{await f.db.close();}
});
