import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import type {Pool} from 'pg';
import {coinsSchema,coinsProfile,coinAction,linkedCoins,observeCoinName,weeklyCnz} from '../src/nozecoins/wallet.js';
import {handleCoinsChat} from '../src/nozecoins/chat.js';

// Real PostgreSQL WASM engine, isolated in memory. A single serialized connection
// validates SQL, transactions, constraints and receipts; not a multiprocess load test.
const db=new PGlite();let tail=Promise.resolve();
async function connect(){let unlock!:()=>void;const previous=tail;tail=new Promise<void>(r=>{unlock=r;});await previous;
 return {query:async(sql:string,params?:unknown[])=>{
  if(!params&&sql.includes(';')){const r=await db.exec(sql);return {rows:r.at(-1)?.rows??[],rowCount:r.at(-1)?.affectedRows??0};}
  const r=await db.query(sql,params);return {rows:r.rows,rowCount:r.affectedRows??r.rows.length};
 },release:unlock};
}
const pool={connect,query:async(sql:string,params?:unknown[])=>{const c=await connect();try{return await c.query(sql,params);}finally{c.release();}}} as unknown as Pool;
before(async()=>{
 await db.exec(`CREATE TABLE streamers(id bigint PRIMARY KEY);INSERT INTO streamers VALUES(1);
 CREATE TABLE automod_points_accounts(streamer_id bigint,rumble_user_id text,username text,balance bigint,reserved bigint);
 CREATE TABLE automod_control(streamer_id bigint,desired_enabled boolean,runtime_status jsonb);
 INSERT INTO automod_control VALUES(1,FALSE,'{"publisherActive":false}');
 CREATE TABLE streamer_rumble_info(streamer_id bigint,is_live boolean,live_video_id_numeric text,updated_at timestamptz);
 INSERT INTO streamer_rumble_info VALUES(1,TRUE,'77',NOW());
 CREATE TABLE users(id bigint,rubis bigint);INSERT INTO users VALUES(1,1234);`);
 await coinsSchema(pool);await coinsSchema(pool);
 process.env.NOZECOINS_ENABLED='true';
});
after(async()=>{delete process.env.NOZECOINS_ENABLED;await db.close();});
test('claim credits 100 once, receipt replays, second request waits 24h',async()=>{
 const uid='284177710';const first=await coinAction(pool,1,uid,'Viewer','claim','claim:1');
 assert.equal(first.balance,100);assert.equal(first.delta,100);
 assert.equal((await coinAction(pool,1,uid,'Viewer','claim','claim:1')).replayed,true);
 assert.equal((await coinAction(pool,1,uid,'Viewer','claim','claim:2')).error,'cooldown');
 assert.equal((await coinsProfile(pool,1,uid,'Viewer')).balance,100);
});
test('retrying many claims never credits more than once',async()=>{
 const results=await Promise.all(Array.from({length:10},(_,i)=>coinAction(pool,1,'284177711','Two','claim',`race:${i}`)));
 assert.equal(results.filter(r=>r.ok).length,1);
 assert.equal((await coinsProfile(pool,1,'284177711','Two')).balance,100);
});
test('slot insufficient funds rolls back; replay does not reroll or charge',async()=>{
 await assert.rejects(coinAction(pool,1,'284177712','Empty','slot','slot:empty'),/insufficient_coins/);
 await coinAction(pool,1,'284177712','Empty','claim','seed');
 const first=await coinAction(pool,1,'284177712','Empty','slot','slot:one');
 const again=await coinAction(pool,1,'284177712','Empty','slot','slot:one');
 assert.equal(again.art,first.art);assert.equal(again.balance,first.balance);assert.equal(again.replayed,true);
 assert.equal((await coinAction(pool,1,'284177712','Empty','slot','slot:two')).error,'cooldown');
 const wait=await coinAction(pool,1,'284177712','Empty','slot','slot:three');
 assert.ok(new Date(String(wait.nextAt)).getTime()-Date.now()>29*60000);
});
test('shop insufficient funds and stale menu never debit or grant tiers',async()=>{
 await coinAction(pool,1,'284177713','Buyer','claim','seed');
 await assert.rejects(coinAction(pool,1,'284177713','Buyer','upgrade','buy:1','claim',0),/insufficient_coins/);
 let p=await coinsProfile(pool,1,'284177713','Buyer');assert.equal(p.tiers.claim,0);assert.equal(p.balance,100);
 await pool.query('UPDATE nozecoin_accounts SET balance=1000 WHERE rumble_user_id=$1',['284177713']);
 const bought=await coinAction(pool,1,'284177713','Buyer','upgrade','buy:2','claim',0);assert.equal(bought.balance,700);
 await assert.rejects(coinAction(pool,1,'284177713','Buyer','upgrade','buy:3','claim',0),/stale_shop/);
 p=await coinsProfile(pool,1,'284177713','Buyer');assert.equal(p.tiers.claim,1);assert.equal(p.balance,700);
});
test('rain gives a single credit per native account and stops in Automod',async()=>{
 await pool.query(`INSERT INTO nozecoin_rains(streamer_id,session_id,bucket,closes_at,announced_at) VALUES(1,'77',1,NOW()+INTERVAL '2 minutes',NOW())`);
 const first=await coinAction(pool,1,'284177714','Rain','rain','message:1');assert.equal(first.balance,25);
 const again=await coinAction(pool,1,'284177714','Rain','rain','message:2');assert.equal(again.replayed,true);assert.equal(again.balance,25);
 await pool.query('UPDATE automod_control SET desired_enabled=TRUE');
 await assert.rejects(coinAction(pool,1,'284177715','Automod','rain','message:3'),/no_rain/);
 await pool.query('UPDATE automod_control SET desired_enabled=FALSE');
});
test('balances stay separate and linked identity shares the native account',async()=>{
 await pool.query(`INSERT INTO automod_points_accounts VALUES(1,'284177710','Viewer',777,7)`);
 // Ensure link tables using the existing schema via linkedCoins.
 await assert.rejects(linkedCoins(pool,1,'1188913226990235800'),/rumble_not_linked/);
 await pool.query(`INSERT INTO automod_discord_links(streamer_id,discord_user_id,rumble_user_id,username) VALUES(1,'1188913226990235800','284177710','Renamed')`);
 const link=await linkedCoins(pool,1,'1188913226990235800');assert.equal(link.username,'Renamed');
 const p=await coinsProfile(pool,1,link.rumble_user_id,link.username);assert.equal(p.balance,100);assert.equal(p.automod,770);
 assert.equal((await pool.query('SELECT rubis FROM users')).rows[0].rubis,1234);
 assert.equal((await pool.query('SELECT balance FROM automod_points_accounts')).rows[0].balance,777);
});
test('stale and future chat messages cannot credit; rain stays Rumble-only',async()=>{
 const m={streamerId:1,userId:'284177716',username:'Old',messageId:'old',text:'!claim',createdAt:new Date(Date.now()-180000)};
 assert.equal(await handleCoinsChat(pool,m),null);
 assert.equal(await handleCoinsChat(pool,{...m,createdAt:new Date(Date.now()+60000)}),null);
 assert.equal((await coinsProfile(pool,1,m.userId,m.username)).balance,0);
});
test('nickname observations follow native IDs and ignore older events',async()=>{
 const now=new Date();await observeCoinName(pool,1,'284177710','Newest',now);
 await observeCoinName(pool,1,'284177710','Older',new Date(now.getTime()-1000));
 assert.equal((await linkedCoins(pool,1,'1188913226990235800')).username,'Newest');
 await observeCoinName(pool,1,'284177710','Stale',new Date(now.getTime()-180000));
 assert.equal((await linkedCoins(pool,1,'1188913226990235800')).username,'Newest');
});
test('weekly CNZ rewards require a fresh tagged native identity and cannot duplicate',async()=>{
 await pool.query(`INSERT INTO automod_discord_links(streamer_id,discord_user_id,rumble_user_id,username) VALUES(1,'100000000000000003','284177718','CNZ Old')`);
 await observeCoinName(pool,1,'284177710','CNZ Viewer',new Date());
 const before=(await coinsProfile(pool,1,'284177710','CNZ Viewer')).balance;
 const pending=await weeklyCnz(pool,1);assert.equal(pending.length,1);
 assert.equal(pending[0].amount,200);
 assert.equal((await coinsProfile(pool,1,'284177710','CNZ Viewer')).balance,before+200);
 await weeklyCnz(pool,1);assert.equal((await coinsProfile(pool,1,'284177710','CNZ Viewer')).balance,before+200);
 await pool.query('UPDATE nozecoin_cnz_announcements SET announced_at=NOW()');
 assert.equal((await weeklyCnz(pool,1)).length,0);
});
