import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {mig142_automod_points} from '../src/db/migrations/mig142_automod_points.js';
import {creditPoints,readWallet,inTransaction,lockWallet,walletEntry} from '../src/automod-shop/wallet.js';
import {mutateOrder,ordersForCall,ingestPointsEvent,reconcileRemovedShopCalls} from '../src/automod-shop/runtime.js';
import {handleShopChat} from '../src/automod-shop/commands.js';
import {keyText} from '../src/calls/normalize.js';

// Never accept a production connection string. This suite requires the disposable local cluster.
const admin=new pg.Pool({host:'127.0.0.1',port:55432,user:'automod',database:'postgres',max:1});
const database='automod_points_test_'+randomUUID().replaceAll('-','');
const pool=new pg.Pool({host:'127.0.0.1',port:55432,user:'automod',database,max:8});
let created=false;
before(async()=>{
 const directory=await admin.query(`SELECT current_setting('data_directory') AS path`);
 assert.equal(directory.rows[0].path,'/tmp/automod-points-pg-data');
 await admin.query(`CREATE DATABASE ${database}`);created=true;
 await pool.query(`CREATE TABLE streamers(id BIGINT PRIMARY KEY);
  CREATE TABLE automod_control(streamer_id BIGINT PRIMARY KEY,desired_enabled BOOLEAN,dashboard_settings JSONB DEFAULT '{}',runtime_status JSONB DEFAULT '{}');
  CREATE TABLE calls_queue(id BIGSERIAL PRIMARY KEY,streamer_id BIGINT,slot_name TEXT,slot_key TEXT,provider TEXT,user_id BIGINT,username TEXT,pos BIGINT,rumble_user_id TEXT,is_bonus BOOLEAN DEFAULT FALSE,bet NUMERIC,pay NUMERIC,bounty BOOLEAN);
  CREATE TABLE calls_settings(streamer_id BIGINT PRIMARY KEY,enabled BOOLEAN DEFAULT TRUE,show_cmd_in_chat BOOLEAN DEFAULT FALSE,show_accept_public BOOLEAN DEFAULT TRUE,allow_listec BOOLEAN DEFAULT TRUE,listec_max INT DEFAULT 10,per_user_limit INT DEFAULT 2,sync_hunt BOOLEAN DEFAULT FALSE);
  CREATE TABLE calls_bans(streamer_id BIGINT,kind TEXT,ban_key TEXT);
  CREATE TABLE calls_provider_policy(streamer_id BIGINT PRIMARY KEY,mode TEXT DEFAULT 'allow_all');
  CREATE TABLE calls_allowed_providers(streamer_id BIGINT,provider_norm TEXT);
  CREATE TABLE slots_catalog(name_key TEXT PRIMARY KEY,name TEXT,provider_norm TEXT,image_url TEXT);`);
 await mig142_automod_points(pool);await mig142_automod_points(pool);
 await pool.query(`INSERT INTO slots_catalog(name_key,name,provider_norm) VALUES($1,'Wanted Dead or a Wild','Hacksaw Gaming')`,[keyText('Wanted Dead or a Wild')]);
});
after(async()=>{
 await pool.end();if(created)await admin.query(`DROP DATABASE ${database}`);await admin.end();
});
async function streamer(id:number){
 await pool.query(`INSERT INTO streamers VALUES($1)`,[id]);
 await pool.query(`INSERT INTO automod_control(streamer_id,desired_enabled,dashboard_settings) VALUES($1,TRUE,'{"stakeCents":20,"allowedProviders":["hacksaw","pragmatic"]}')`,[id]);
}
async function buyer(id:number,user='284177710'){
 await streamer(id);await creditPoints(pool,id,user,'OriginalName',`seed:${id}`,10000,'test-credit');return user;
}
async function order(sid:number,status:string,reserved=1400,kind='buy'){
 const uid=await buyer(sid),id=randomUUID();
 const quote={id:'duel',label:'Duel',costCents:4000,baseStakeCents:20};
 await inTransaction(pool,async c=>{await lockWallet(c,sid,uid,'Owner');await walletEntry(c,sid,uid,`reserve:${id}`,0,reserved,'test');
  await c.query(`INSERT INTO automod_shop_orders(id,streamer_id,rumble_user_id,username,request_key,kind,slot_key,slot_name,provider,status,selected_offer,reserved_points,call_id)
   VALUES($1,$2,$3,'Owner',$8,$4,'wanted','Wanted Dead or a Wild','hacksaw',$5,$6,$7,123)`,[id,sid,uid,kind,status,JSON.stringify(quote),reserved,id]);});
 return {id,uid,quote};
}
const chat=(sid:number,uid:string,text:string,messageId=randomUUID())=>handleShopChat(pool,{streamerId:sid,userId:uid,username:'RenamedUser',text,messageId,createdAt:new Date()});

test('concurrent wallet reservations never exceed the native-ID balance and failed reservations roll back',async()=>{
 await streamer(1);await creditPoints(pool,1,'101','Alice','credit',2000,'test');
 const results=await Promise.allSettled(Array.from({length:5},(_,i)=>inTransaction(pool,async c=>{
  await lockWallet(c,1,'101','Alice');await c.query('SELECT pg_sleep(0.02)');
  await walletEntry(c,1,'101',`reserve:${i}`,0,500,'test');
 })));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,4);
 assert.deepEqual(await readWallet(pool,1,'101'),{balance:2000,reserved:2000,available:0});
 const ledger=await pool.query(`SELECT COUNT(*)::int n FROM automod_points_ledger WHERE streamer_id=1`);assert.equal(ledger.rows[0].n,5);
});
test('idempotent credit survives a username change without creating a second account',async()=>{
 await streamer(2);await creditPoints(pool,2,'102','Before','credit',100,'test');
 await creditPoints(pool,2,'102','After','credit',100,'test');
 assert.equal((await readWallet(pool,2,'102')).balance,100);
 assert.equal((await pool.query(`SELECT username FROM automod_points_accounts WHERE streamer_id=2`)).rows[0].username,'After');
 await assert.rejects(creditPoints(pool,2,'103','Other','credit',100,'test'),/wallet_event_conflict/);
});
test('only one concurrent intent can authorize the irreversible buy; an uncertain buy stays reserved',async()=>{
 const o=await order(3,'chosen');
 const intents=await Promise.all([mutateOrder(pool,3,o.id,'intent',{offer:o.quote}),mutateOrder(pool,3,o.id,'intent',{offer:o.quote})]);
 assert.equal(intents.filter((x:any)=>x.authorized===true).length,1);
 await mutateOrder(pool,3,o.id,'failure',{reason:'response lost'});
 assert.equal((await readWallet(pool,3,o.uid)).reserved,1400);
 const again:any=await mutateOrder(pool,3,o.id,'intent',{offer:o.quote});assert.notEqual(again.authorized,true);
});
test('confirmed purchase debits once and a 3x buy result rebates 110 percent once',async()=>{
 const o=await order(4,'chosen');await mutateOrder(pool,4,o.id,'intent',{offer:o.quote});
 await mutateOrder(pool,4,o.id,'confirmed',{});await mutateOrder(pool,4,o.id,'confirmed',{});
 assert.deepEqual(await readWallet(pool,4,o.uid),{balance:8600,reserved:0,available:8600});
 await mutateOrder(pool,4,o.id,'complete',{gainCents:12000});await mutateOrder(pool,4,o.id,'complete',{gainCents:12000});
 assert.equal((await readWallet(pool,4,o.uid)).balance,10140);
});
test('changed quote and disabled Automod refuse the buy without a partial debit',async()=>{
 const o=await order(5,'chosen');
 await assert.rejects(mutateOrder(pool,5,o.id,'intent',{offer:{...o.quote,costCents:4001}}),/bonus_quote_changed/);
 await pool.query(`UPDATE automod_control SET desired_enabled=FALSE WHERE streamer_id=5`);
 await assert.rejects(mutateOrder(pool,5,o.id,'intent',{offer:o.quote}),/automod_disabled/);
 assert.equal((await readWallet(pool,5,o.uid)).balance,10000);
});
test('actual minimum menu controls the no-response fee; a technical failure releases it',async()=>{
 const o=await order(6,'opening',350);
 const offers=[{id:'train',label:'Train',costCents:1600,baseStakeCents:20}];
 await mutateOrder(pool,6,o.id,'menu',{offers,cacheBaseStakeCents:20});
 assert.equal((await readWallet(pool,6,o.uid)).reserved,280);
 await assert.rejects(mutateOrder(pool,6,o.id,'expire',{played:true,technicalFailure:true}),/no_response_fee_not_allowed/);
 await mutateOrder(pool,6,o.id,'failure',{reason:'site unavailable'});
 assert.equal((await readWallet(pool,6,o.uid)).available,10000);
 const p=await order(7,'opening',350);await mutateOrder(pool,7,p.id,'menu',{offers,cacheBaseStakeCents:20});
 await mutateOrder(pool,7,p.id,'expire',{played:true,technicalFailure:false});
 assert.deepEqual(await readWallet(pool,7,p.uid),{balance:9720,reserved:0,available:9720});
});
test('removed pending call releases points, but removed post-intent call does not',async()=>{
 const a=await order(8,'pending',350);await reconcileRemovedShopCalls(pool,8);
 assert.equal((await readWallet(pool,8,a.uid)).reserved,0);
 const b=await order(9,'chosen');await mutateOrder(pool,9,b.id,'intent',{offer:b.quote});await reconcileRemovedShopCalls(pool,9);
 assert.equal((await readWallet(pool,9,b.uid)).reserved,1400);
});
test('only the native requester can choose a discovered bonus; replay is harmless',async()=>{
 const uid=await buyer(10,'110');const reply=await chat(10,uid,'!achat Wanted Dead or a Wild');assert.match(reply??'',/réservés/);
 const orders=await pool.query(`SELECT id FROM automod_shop_orders WHERE streamer_id=10`);const id=orders.rows[0].id;
 await mutateOrder(pool,10,id,'menu',{cacheBaseStakeCents:20,offers:[{id:'train',label:'Train',costCents:2000,baseStakeCents:20},{id:'duel',label:'Duel',costCents:4000,baseStakeCents:20}]});
 assert.match(await chat(10,'111','!achat 2')??'',/Aucun choix/);
 assert.equal((await readWallet(pool,10,uid)).reserved,350);
 assert.match(await chat(10,uid,'2')??'',/Duel sélectionné/);
 assert.equal((await readWallet(pool,10,uid)).reserved,1400);
 const replay=await chat(10,uid,'2');assert.equal(replay,null);assert.equal((await readWallet(pool,10,uid)).reserved,1400);
});
test('global hour reservation is unique, starts on confirmed play, and expires by server clock',async()=>{
 const uid=await buyer(11,'112');await chat(11,uid,'!mise 1h');
 const row=(await pool.query(`SELECT id FROM automod_shop_orders WHERE streamer_id=11`)).rows[0];
 await mutateOrder(pool,11,row.id,'claim',{});await mutateOrder(pool,11,row.id,'boost-applied',{applied:true,baseStakeCents:60,chargedStakeCents:90});
 assert.equal((await readWallet(pool,11,uid)).balance,7500);
 const active=await ordersForCall(pool,11,'');assert.equal(active.length,1);
 assert.ok(Date.parse(active[0].result.activeUntil)-Date.now()>3590000);
 assert.match(await chat(11,uid,'!mise 1h')??'',/déjà actif/);
 await pool.query(`UPDATE automod_shop_orders SET result=jsonb_set(result,'{activeUntil}',to_jsonb((NOW()-INTERVAL '1 second')::text)) WHERE id=$1`,[row.id]);
 assert.equal((await ordersForCall(pool,11,'')).length,0);
 assert.match(await chat(11,uid,'!mise 1h')??'',/réservés/);
 assert.equal((await readWallet(pool,11,uid)).reserved,2500);
});
test('natural rewards are business-event idempotent and bought bonuses earn no natural tiers',async()=>{
 await streamer(12);const base={id:'first',kind:'first-spin-settled',item:{callId:'123',requestedByRumbleId:'113',requestedBy:'Viewer',slotName:'Wanted'},visitId:'visit',data:{baseStakeCents:20}};
 await ingestPointsEvent(pool,12,base);await ingestPointsEvent(pool,12,{...base,id:'replayed-envelope'});
 await ingestPointsEvent(pool,12,{...base,id:'bonus',kind:'bonus-started',data:{baseStakeCents:20,bonus:{startedAt:1000}}});
 await ingestPointsEvent(pool,12,{...base,id:'result',kind:'bonus-ended',data:{baseStakeCents:20,bonus:{startedAt:1000,gainCents:10000}}});
 await ingestPointsEvent(pool,12,{...base,id:'bought',kind:'bonus-ended',visitId:'bought',data:{baseStakeCents:20,purchaseOrderId:randomUUID(),bonus:{startedAt:2000,gainCents:100000}}});
 assert.equal((await readWallet(pool,12,'113')).balance,110);
});
