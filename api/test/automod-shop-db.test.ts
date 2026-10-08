import {rewardFollow,announceNewFollow} from '../src/automod-shop/follows.js';
import {handleReferral,settleReferral} from '../src/automod-shop/referral.js';
import {mig143_automod_hunt_reservations} from '../src/db/migrations/mig143_automod_hunt_reservations.js';
import {readProfile} from '../src/automod-shop/profile.js';
import {mig144_automod_progression} from '../src/db/migrations/mig144_automod_progression.js';
import {mig145_automod_modes} from '../src/db/migrations/mig145_automod_modes.js';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {mig142_automod_points} from '../src/db/migrations/mig142_automod_points.js';
import {creditPoints,readWallet,inTransaction,lockWallet,walletEntry} from '../src/automod-shop/wallet.js';
import {mutateOrder,ordersForCall,ingestPointsEvent,reconcileRemovedShopCalls} from '../src/automod-shop/runtime.js';
import {handleShopChat} from '../src/automod-shop/commands.js';
import {keyText} from '../src/calls/normalize.js';
import {addCall} from '../src/calls/queue.js';
import {createChallenge,chooseCamp,settleChallenge} from '../src/automod-shop/provider-challenge.js';
import {requestWeeklyPurchase,nextWeeklyPurchase,quoteWeeklyPurchase,weeklyPurchaseIntent,finishWeeklyPurchase,failWeeklyPurchase,settleWeeklyEvent} from '../src/automod-shop/weekly-event.js';
import {weeklyGreeting} from '../src/automod-shop/weekly-chat.js';
import {dailyViewerGreeting,greetingText} from '../src/automod-shop/viewer-greeting.js';
import {followSnapshot} from '../src/automod-shop/follow-snapshot.js';
import {requestAutomodDiscordLink,handleDiscordLinkChat,automodDiscordProfile} from '../src/automod-shop/discord-profile.js';
import {claimAutomodReminder} from '../../bot/src/runtime/autopost-activity.js';
import {reservePurchaseUpgrade,purchaseUpgradeForTarget,reconcileUnusedPurchaseUpgrades} from '../src/automod-shop/purchase-upgrades.js';

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
  CREATE TABLE rumble_chat_messages(streamer_id BIGINT,rumble_user_id TEXT,created_at TIMESTAMPTZ DEFAULT NOW());

  CREATE TABLE automod_control(streamer_id BIGINT PRIMARY KEY,desired_enabled BOOLEAN,dashboard_settings JSONB DEFAULT '{}',runtime_status JSONB DEFAULT '{}');
  CREATE TABLE calls_queue(id BIGSERIAL PRIMARY KEY,streamer_id BIGINT,slot_name TEXT,slot_key TEXT,provider TEXT,user_id BIGINT,username TEXT,pos BIGINT,rumble_user_id TEXT,is_bonus BOOLEAN DEFAULT FALSE,bet NUMERIC,pay NUMERIC,bounty BOOLEAN);
  CREATE TABLE calls_settings(streamer_id BIGINT PRIMARY KEY,enabled BOOLEAN DEFAULT TRUE,show_cmd_in_chat BOOLEAN DEFAULT FALSE,show_accept_public BOOLEAN DEFAULT TRUE,allow_listec BOOLEAN DEFAULT TRUE,listec_max INT DEFAULT 10,per_user_limit INT DEFAULT 2,sync_hunt BOOLEAN DEFAULT FALSE);
  CREATE TABLE calls_bans(streamer_id BIGINT,kind TEXT,ban_key TEXT);
  CREATE TABLE calls_provider_policy(streamer_id BIGINT PRIMARY KEY,mode TEXT DEFAULT 'allow_all');
  CREATE TABLE calls_allowed_providers(streamer_id BIGINT,provider_norm TEXT);
  CREATE TABLE slots_catalog(name_key TEXT PRIMARY KEY,name TEXT,provider_norm TEXT,image_url TEXT);`);
 await mig142_automod_points(pool);await mig142_automod_points(pool);
 await mig143_automod_hunt_reservations(pool);
 await mig144_automod_progression(pool);await mig144_automod_progression(pool);
 await mig145_automod_modes(pool);await mig145_automod_modes(pool);
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

test('provider challenge call admission uses native camp and leaves classic calls unchanged',async()=>{
 await streamer(300);
 await pool.query("ALTER TABLE calls_queue ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT NOW()");
 await pool.query(`UPDATE automod_control SET dashboard_settings=dashboard_settings||'{"mode":"provider-challenge"}'::jsonb WHERE streamer_id=300`);
 const event=await createChallenge(pool,300,'admission',{stakeCents:20,slotDurationMs:240000,goldenEnabled:true});
 const call=(name:string,provider:string,uid='301')=>addCall(pool,300,0,'Viewer',name,provider,{rumbleUserId:uid,bypassLimit:true});
 assert.deepEqual(await call('Fruit Party','Pragmatic Play'),{ok:false,error:'challenge_choose_camp'});
 await chooseCamp(pool,300,event.id,{userId:'301',username:'Viewer'},'pragmatic');
 assert.deepEqual(await call('Le Bandit','Hacksaw Gaming'),{ok:false,error:'challenge_other_camp'});
 assert.equal((await call('Fruit Party','Pragmatic Play')).ok,true);
 await chooseCamp(pool,300,event.id,{userId:'302',username:'HacksawViewer'},'hacksaw');
 assert.equal((await call('Wanted Dead or a Wild','Hacksaw Gaming','302')).ok,true);
 await pool.query("DELETE FROM calls_queue WHERE streamer_id=300 AND provider='pragmatic play'");
 await pool.query("CREATE TABLE IF NOT EXISTS calls_automod_requests(streamer_id bigint,request_id text,call_id bigint,item jsonb,PRIMARY KEY(streamer_id,request_id))");
 await pool.query("UPDATE automod_provider_challenges SET status='playing' WHERE id=$1",[event.id]);
 const automatic=await addCall(pool,300,0,'Automod','Sugar Rush','Pragmatic Play',{automodRequestId:randomUUID(),bypassLimit:true});
 assert.equal(automatic.ok,true,'waiting Hacksaw calls must not prevent filling the empty Pragmatic queue');
 assert.equal((await pool.query("SELECT COUNT(*) AS n FROM calls_queue WHERE streamer_id=300 AND slot_name='Wanted Dead or a Wild'")).rows[0].n,'1');
 await pool.query('UPDATE automod_control SET desired_enabled=FALSE WHERE streamer_id=300');
 assert.equal((await call('Le Bandit','Hacksaw Gaming')).ok,true);
});
async function order(sid:number,status:string,reserved=1400,kind='buy'){
 const uid=await buyer(sid),id=randomUUID();
 const quote={id:'duel',label:'Duel',costCents:4000,baseStakeCents:20};
 await inTransaction(pool,async c=>{await lockWallet(c,sid,uid,'Owner');await walletEntry(c,sid,uid,`reserve:${id}`,0,reserved,'test');
  await c.query(`INSERT INTO automod_shop_orders(id,streamer_id,rumble_user_id,username,request_key,kind,slot_key,slot_name,provider,status,selected_offer,reserved_points,call_id)
   VALUES($1,$2,$3,'Owner',$8,$4,'wanted','Wanted Dead or a Wild','hacksaw',$5,$6,$7,123)`,[id,sid,uid,kind,status,JSON.stringify(quote),reserved,id]);});
 return {id,uid,quote};
}
const chat=(sid:number,uid:string,text:string,messageId=randomUUID())=>handleShopChat(pool,{streamerId:sid,userId:uid,username:'RenamedUser',text,messageId,createdAt:new Date()});

test('challenge shop accepts only own camp, replaces tiers without stacking, refunds an unclaimed boost after event',async()=>{
 const sid=301,uid=await buyer(sid,'303');
 await pool.query(`UPDATE automod_control SET dashboard_settings=dashboard_settings||'{"mode":"provider-challenge"}'::jsonb WHERE streamer_id=$1`,[sid]);
 const event=await createChallenge(pool,sid,'shop-camps',{stakeCents:20,slotDurationMs:240000,goldenEnabled:true});
 const command='!call +1 Wanted Dead or a Wild';
 assert.match((await chat(sid,uid,command))!,/Choisis d’abord/);
 await chooseCamp(pool,sid,event.id,{userId:uid,username:'Viewer'},'hacksaw');
 assert.match((await chat(sid,uid,command))!,/réservés/);
 assert.match((await chat(sid,uid,'!call +2 Wanted Dead or a Wild'))!,/supplémentaires/);
 assert.match((await chat(sid,uid,'!duree 1 Wanted Dead or a Wild'))!,/pas disponible/);
 const orders=(await pool.query('SELECT * FROM automod_shop_orders WHERE streamer_id=$1',[sid])).rows;
 assert.equal(orders.length,1);assert.equal(orders[0].tier,2);assert.equal(orders[0].result.challengeId,event.id);
 assert.equal((await readWallet(pool,sid,uid)).reserved,750);
 await creditPoints(pool,sid,'304','Other','seed-other',1000,'test');
 await chooseCamp(pool,sid,event.id,{userId:'304',username:'Other'},'pragmatic');
 assert.match((await chat(sid,'304',command))!,/uniquement les calls de ton camp/);
 assert.equal((await readWallet(pool,sid,'304')).reserved,0);
 await settleChallenge(pool,sid,event.id,true);
 assert.equal((await readWallet(pool,sid,uid)).reserved,0,'settlement must release the unused boost without waiting for its queued call');
 assert.equal((await mutateOrder(pool,sid,orders[0].id,'claim',{})).status,'refunded');
 assert.equal((await readWallet(pool,sid,uid)).reserved,0);
 assert.equal((await readWallet(pool,sid,uid)).balance,10000);
});

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

test('rain credits once per native identity, expires, and balance replies reflect the ledger',async()=>{
 await streamer(13);const rain=randomUUID();
 await pool.query(`INSERT INTO automod_points_rains(id,streamer_id,points,closes_at) VALUES($1,13,20,NOW()+INTERVAL '2 minutes')`,[rain]);
 const replies=await Promise.all(Array.from({length:3},()=>chat(13,'112','!rain')));
 assert.equal(replies.filter(r=>r?.includes('+20 points')).length,1);
 assert.deepEqual(await readWallet(pool,13,'112'),{balance:20,reserved:0,available:20});
 assert.match((await chat(13,'112','!points'))!,/20 points disponibles/);
 await pool.query(`UPDATE automod_points_rains SET closes_at=NOW()-INTERVAL '1 second' WHERE id=$1`,[rain]);
 assert.match((await chat(13,'113','!rain'))!,/Pas de rain/);
 assert.equal((await readWallet(pool,13,'113')).balance,0);
 await pool.query(`UPDATE automod_control SET desired_enabled=FALSE WHERE streamer_id=13`);
 assert.match((await chat(13,'112','!rain'))!,/pendant l’Automod/);
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


test('profile counts historical facts once, excludes purchased records and test credits',async()=>{
 const p=await readProfile(pool,12,'113');
 assert.equal(p.callsPlayed,1);assert.equal(p.naturalBonuses,1);assert.equal(p.bestMultiplier,500);
 assert.equal(p.xp,135);assert.equal(p.monthlyEventPoints,0);
 assert.equal((await readProfile(pool,2,'102')).xp,0);
 assert.match(await chat(12,'113','!profil')??'',/1 calls joués/);
});
test('discount remains frozen from reservation through bonus selection, debit and rebate',async()=>{
 const uid=await buyer(20,'120');
 await inTransaction(pool,async c=>{await lockWallet(c,20,uid,'User');for(let i=0;i<25;i++)await walletEntry(c,20,uid,`xp-call:${i}`,10,0,'first-spin-settled');});
 assert.equal((await readProfile(pool,20,uid)).discountPercent,1);
 assert.match(await chat(20,uid,'!achat Wanted Dead or a Wild')??'',/réservés/);
 const o=(await pool.query('SELECT * FROM automod_shop_orders WHERE streamer_id=20')).rows[0];
 assert.equal(o.discount_percent,1);assert.equal(Number(o.reserved_points),347);
 const offers=[{id:'train',label:'Train',costCents:2000,baseStakeCents:20},{id:'duel',label:'Duel',costCents:4000,baseStakeCents:20}];
 await mutateOrder(pool,20,o.id,'menu',{cacheBaseStakeCents:20,offers});
 await chat(20,uid,'2');assert.equal((await readWallet(pool,20,uid)).reserved,1386);
 await mutateOrder(pool,20,o.id,'intent',{offer:offers[1]});await mutateOrder(pool,20,o.id,'confirmed',{});
 await mutateOrder(pool,20,o.id,'complete',{gainCents:12000});
 assert.equal((await readWallet(pool,20,uid)).available,10250-1386+1524);
});


test('referral: stable code, reciprocal refusal, two calls, both follows, exactly once',async()=>{
 const sid=30,parent=await buyer(sid,'130'),child='131';
 const msg=(uid:string,text:string)=>handleReferral(pool,{streamerId:sid,userId:uid,username:'Viewer'+uid,text,createdAt:new Date()});
 await pool.query("INSERT INTO automod_viewer_first_seen VALUES($1,$2,NOW()),($1,$3,NOW())",[sid,parent,child]);
 const code=(await msg(parent,'!parrainer'))!.match(/!parrain ([A-F0-9]{8})/)![1];
 assert.match((await msg(parent,'!parrainer'))!,new RegExp(code));
 assert.match((await msg(parent,'!parrain '+code))!,/personnel/);
 assert.match((await msg(child,'!parrain '+code))!,/enregistré/);
 const childCode=(await msg(child,'!parrainer'))!.match(/!parrain ([A-F0-9]{8})/)![1];
 assert.match((await msg(parent,'!parrain '+childCode))!,/réciproque/);
 await pool.query('INSERT INTO automod_follow_events(streamer_id,rumble_user_id,username,followed_at,baseline,last_confirmed_at) VALUES($1,$2,$2,NOW(),FALSE,NOW()),($1,$3,$3,NOW(),FALSE,NOW())',[sid,parent,child]);
 const fact=(n:number)=>({id:'c'+n,kind:'first-spin-settled',item:{callId:String(n),requestedByRumbleId:child,requestedBy:'Child',slotName:'Test'},visitId:'v'+n,data:{}});
 await ingestPointsEvent(pool,sid,fact(1));assert.equal((await readWallet(pool,sid,child)).available,10);
 await Promise.all([ingestPointsEvent(pool,sid,fact(2)),ingestPointsEvent(pool,sid,fact(2))]);
 assert.equal((await readWallet(pool,sid,child)).available,520);assert.equal((await readWallet(pool,sid,parent)).available,10500);
 assert.equal((await readProfile(pool,sid,child)).xp,40);
 assert.match((await msg(child,'!parrain '+code))!,/validé/);
 assert.equal((await readWallet(pool,sid,parent)).available,10500);
});


test('referral waits for follow proof and enforces five atomic rewards per Paris month',async()=>{
 const sid=31,parent=await buyer(sid,'140');
 await pool.query('INSERT INTO automod_follow_events(streamer_id,rumble_user_id,username,followed_at,baseline,last_confirmed_at) VALUES($1,$2,$2,NOW(),FALSE,NOW())',[sid,parent]);
 for(let n=0;n<6;n++){
  const child=String(150+n);
  await pool.query("INSERT INTO automod_referrals(streamer_id,child_id,parent_id,child_name,parent_name,status) VALUES($1,$2,$3,'Child','Parent','pending')",[sid,child,parent]);
  for(let spin=0;spin<2;spin++)await ingestPointsEvent(pool,sid,{id:child+':'+spin,kind:'first-spin-settled',item:{callId:child+':'+spin,requestedByRumbleId:child,requestedBy:'Child'},visitId:'v',data:{}});
  assert.equal((await readWallet(pool,sid,child)).available,20);
  await pool.query('INSERT INTO automod_follow_events(streamer_id,rumble_user_id,username,followed_at,baseline,last_confirmed_at) VALUES($1,$2,$2,NOW(),FALSE,NOW())',[sid,child]);
  if(n===0){
   await pool.query("UPDATE automod_follow_events SET last_confirmed_at=NOW()-INTERVAL '3 minutes' WHERE streamer_id=$1 AND rumble_user_id=$2",[sid,child]);
   await inTransaction(pool,async c=>{await c.query('SELECT pg_advisory_xact_lock($1)',[sid]);assert.equal(await settleReferral(c,sid,child),false);});
   assert.equal((await readWallet(pool,sid,child)).available,20);
   await pool.query('UPDATE automod_follow_events SET last_confirmed_at=NOW() WHERE streamer_id=$1 AND rumble_user_id=$2',[sid,child]);
  }
  await inTransaction(pool,async c=>{await c.query('SELECT pg_advisory_xact_lock($1)',[sid]);await settleReferral(c,sid,child);});
  assert.equal((await readWallet(pool,sid,child)).available,n<5?520:20);
 }
 assert.equal((await readWallet(pool,sid,parent)).available,12500);
 assert.equal((await pool.query("SELECT COUNT(*) AS n FROM automod_referrals WHERE streamer_id=$1 AND status='limit-reached'",[sid])).rows[0].n,'1');
});

test('baseline follow binds the native ID without paying a historical welcome reward',async()=>{
 const sid=32,uid=await buyer(sid,'166');
 await pool.query(`UPDATE automod_control SET runtime_status='{"publisherActive":true}' WHERE streamer_id=$1`,[sid]);
 await pool.query("INSERT INTO automod_follow_events(streamer_id,username,followed_at,baseline,last_confirmed_at) VALUES($1,'KnownFollower',NOW(),TRUE,NOW())",[sid]);
 await pool.query("UPDATE automod_follow_events SET seen_at=NOW()-INTERVAL '30 days' WHERE streamer_id=$1",[sid]);
 await rewardFollow(pool,{streamerId:sid,userId:uid,username:'KnownFollower',createdAt:new Date()});
 assert.equal((await readWallet(pool,sid,uid)).available,10000);
 assert.equal((await pool.query('SELECT rumble_user_id FROM automod_follow_events WHERE streamer_id=$1',[sid])).rows[0].rumble_user_id,uid);
});

test('weekly free purchase is follower-only, once per Paris day, persists past midnight and ranks separately',async()=>{
 const sid=302,uid=await buyer(sid,'701'),now=new Date('2026-10-06T21:59:00Z');
 await pool.query('ALTER TABLE automod_control ADD COLUMN IF NOT EXISTS runtime_seen_at timestamptz');
 await pool.query('CREATE TABLE IF NOT EXISTS streamer_rumble_info(streamer_id bigint PRIMARY KEY,is_live boolean)');
 await pool.query('INSERT INTO streamer_rumble_info VALUES($1,TRUE)',[sid]);
 await pool.query(`UPDATE automod_control SET runtime_seen_at=$2,runtime_status='{"publisherActive":true,"mode":"automod"}' WHERE streamer_id=$1`,[sid,now]);
 const slot={name:'Fruit Party',key:'fruitparty',provider:'pragmatic' as const};
 await assert.rejects(requestWeeklyPurchase(pool,sid,{userId:uid,username:'Viewer'},slot,now),/follow_required/);
 await pool.query('INSERT INTO automod_follow_events(streamer_id,rumble_user_id,username,followed_at,baseline,last_confirmed_at) VALUES($1,$2,$2,$3,TRUE,$3)',[sid,uid,now]);
 const replies=await Promise.all([requestWeeklyPurchase(pool,sid,{userId:uid,username:'Viewer'},slot,now),requestWeeklyPurchase(pool,sid,{userId:uid,username:'Renamed'},slot,now)]);
 assert.equal(replies.filter(r=>r.created).length,1);assert.equal(replies[0].entry.id,replies[1].entry.id);
 const firstId=replies[0].entry.id;
 await failWeeklyPurchase(pool,sid,firstId,'slot-not-loaded-before-intent');
 const retry=await requestWeeklyPurchase(pool,sid,{userId:uid,username:'Viewer'},slot,now);
 const id=retry.entry.id;assert.equal(retry.created,true);assert.notEqual(id,firstId);
 assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM automod_weekly_failed_attempts WHERE id=$1',[firstId])).rows[0].n,1);
 await assert.rejects(requestWeeklyPurchase(pool,sid,{userId:uid,username:'Viewer'},slot,new Date('2026-10-06T22:01:00Z')),/not_today/);
 const queued=await nextWeeklyPurchase(pool,sid);assert.equal(queued.id,id);
 const offer={id:'normal',label:'Free Spins',baseStakeCents:20,costCents:2000};
 await quoteWeeklyPurchase(pool,sid,id,[offer,{...offer,id:'super',costCents:10000}],{normal:'classic',super:'other'});
 const intents=await Promise.all([weeklyPurchaseIntent(pool,sid,id,offer),weeklyPurchaseIntent(pool,sid,id,offer)]);
 assert.equal(intents.filter(r=>r.authorized).length,1);
 await failWeeklyPurchase(pool,sid,id,'connection-lost');
 assert.equal((await nextWeeklyPurchase(pool,sid)).status,'uncertain');
 await assert.rejects(settleWeeklyEvent(pool,sid,'2026-10-06',new Date('2026-10-06T22:01:00Z')),/pending_entries/);
 assert.equal((await finishWeeklyPurchase(pool,sid,id,6000)).changed,true);
 assert.equal((await finishWeeklyPurchase(pool,sid,id,6000)).changed,false);
 await assert.rejects(finishWeeklyPurchase(pool,sid,id,6001),/conflict/);
 const result=await settleWeeklyEvent(pool,sid,'2026-10-06',new Date('2026-10-06T22:01:00Z'));
 assert.equal(result?.winners?.[0].multiplier,300);assert.equal(result?.winners?.[0].points,100);
 assert.equal((await settleWeeklyEvent(pool,sid,'2026-10-06',new Date('2026-10-06T22:01:00Z')))?.changed,false);
 assert.equal((await readWallet(pool,sid,uid)).balance,10000,'event rankings must not mint spendable shop points');
 assert.equal((await readProfile(pool,sid,uid)).xp,25,'event participation grants XP without spendable points');
 assert.equal((await pool.query('SELECT SUM(points)::int AS n FROM automod_event_scores WHERE streamer_id=$1',[sid])).rows[0].n,100);
});

test('weekly greeting is once per native account/day and ranks only the top three',async()=>{
 const sid=303,now=new Date('2026-10-09T18:00:00Z');await streamer(sid);
 await pool.query('INSERT INTO streamer_rumble_info VALUES($1,TRUE)',[sid]);
 await pool.query(`UPDATE automod_control SET runtime_seen_at=$2,runtime_status='{"publisherActive":true,"mode":"automod","supportedFeatures":["weekly-purchase"]}' WHERE streamer_id=$1`,[sid,now]);
 const visitor={streamerId:sid,userId:'710',username:'NewViewer',createdAt:now};
 assert.match((await weeklyGreeting(pool,visitor,now))!,/follow la chaîne/);
 assert.equal(await weeklyGreeting(pool,{...visitor,username:'Renamed'},now),null);
 for(let n=0;n<4;n++){
  const uid=String(710+n);
  await pool.query('INSERT INTO automod_follow_events(streamer_id,rumble_user_id,username,followed_at,baseline,last_confirmed_at) VALUES($1,$2,$2,$3,TRUE,$3)',[sid,uid,now]);
  const created=await requestWeeklyPurchase(pool,sid,{userId:uid,username:uid},{name:'Fruit Party',key:'fruitparty',provider:'pragmatic'},now);
  const row=await nextWeeklyPurchase(pool,sid);assert.equal(row.id,created.entry.id);
  const offer={id:'normal',label:'Free Spins',baseStakeCents:20,costCents:2000};
  await quoteWeeklyPurchase(pool,sid,row.id,[offer],{normal:'classic'});await weeklyPurchaseIntent(pool,sid,row.id,offer);
  await finishWeeklyPurchase(pool,sid,row.id,[2000,6000,4000,1000][n]!);
 }
 const result=await settleWeeklyEvent(pool,sid,'2026-10-09',new Date('2026-10-09T22:00:01Z'));
 assert.deepEqual(result?.winners?.map(w=>[w.userId,w.points]),[['711',100],['712',50],['710',25]]);
 assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM automod_event_scores WHERE streamer_id=$1',[sid])).rows[0].n,3);
});

test('series upgrade reserves only the difference, cannot add a second upgrade, and uses actual paid points for rebate',async()=>{
 const sid=400,uid=await buyer(sid,'810');
 await pool.query(`UPDATE automod_control SET dashboard_settings=dashboard_settings||'{"mode":"session-buy"}'::jsonb,runtime_status='{"mode":"session-buy"}' WHERE streamer_id=$1`,[sid]);
 const offers=[{id:'train',label:'Train',baseStakeCents:20,costCents:2000},{id:'duel',label:'Duel',baseStakeCents:20,costCents:4000},{id:'dead',label:'Dead',baseStakeCents:20,costCents:8000}];
 const slotKey=keyText('Wanted Dead or a Wild');
 await pool.query("INSERT INTO automod_bonus_catalog(streamer_id,slot_key,slot_name,provider,base_stake_cents,offers) VALUES($1,$2,'Wanted Dead or a Wild','hacksaw',20,$3)",[sid,slotKey,JSON.stringify(offers)]);
 const request={messageId:'upgrade-request',kind:'series' as const,slotName:'Wanted Dead or a Wild',slotKey,provider:'hacksaw' as const,offerId:'duel'};
 const result=await reservePurchaseUpgrade(pool,sid,{userId:uid,username:'Viewer'},request);
 assert.equal(result.points,700);assert.equal((await readWallet(pool,sid,uid)).reserved,700);
 assert.equal((await reservePurchaseUpgrade(pool,sid,{userId:uid,username:'Renamed'},request)).created,false);
 const target=(await pool.query('SELECT call_id::text FROM automod_shop_orders WHERE id=$1',[result.id])).rows[0].call_id;
 assert.equal((await ordersForCall(pool,sid,target)).length,0,'ordinary slot shop must not execute a series upgrade');
 const upgrade=await purchaseUpgradeForTarget(pool,sid,'series',target);assert.equal(upgrade.id,result.id);
 await assert.rejects(reservePurchaseUpgrade(pool,sid,{userId:uid,username:'Viewer'},{...request,messageId:'second',offerId:'dead'}),/already_set/);
 await assert.rejects(mutateOrder(pool,sid,result.id,'intent',{offer:offers[1],upgradeBaseline:{...offers[0],costCents:2500}}),/quote_changed/);
 assert.equal((await mutateOrder(pool,sid,result.id,'intent',{offer:offers[1],upgradeBaseline:offers[0]})).authorized,true);
 assert.equal((await mutateOrder(pool,sid,result.id,'intent',{offer:offers[1],upgradeBaseline:offers[0]})).changed,false);
 await mutateOrder(pool,sid,result.id,'confirmed',{});
 assert.equal((await readWallet(pool,sid,uid)).balance,9300);
 await mutateOrder(pool,sid,result.id,'complete',{gainCents:12000});
 assert.equal((await readWallet(pool,sid,uid)).balance,10070);
 assert.equal((await purchaseUpgradeForTarget(pool,sid,'series',target)),null);
 await assert.rejects(reservePurchaseUpgrade(pool,sid,{userId:uid,username:'Viewer'},{...request,messageId:'third',offerId:'dead'}),/already_set/);
});

test('weekly upgrade authorizes the free entry and paid replacement together exactly once',async()=>{
 const sid=401,uid=await buyer(sid,'820'),now=new Date('2026-10-09T18:00:00Z');
 await pool.query('INSERT INTO streamer_rumble_info VALUES($1,TRUE)',[sid]);
 await pool.query(`UPDATE automod_control SET runtime_seen_at=$2,dashboard_settings=dashboard_settings||'{"mode":"automod"}'::jsonb,runtime_status='{"publisherActive":true,"mode":"automod"}' WHERE streamer_id=$1`,[sid,now]);
 await pool.query('INSERT INTO automod_follow_events(streamer_id,rumble_user_id,username,followed_at,baseline,last_confirmed_at) VALUES($1,$2,$2,$3,TRUE,$3)',[sid,uid,now]);
 const name='Wanted Dead or a Wild',slotKey=keyText(name);
 const offers=[{id:'train',label:'Train',baseStakeCents:20,costCents:2000},{id:'duel',label:'Duel',baseStakeCents:20,costCents:4000}];
 await pool.query("INSERT INTO automod_bonus_catalog(streamer_id,slot_key,slot_name,provider,base_stake_cents,offers) VALUES($1,$2,$3,'hacksaw',20,$4)",[sid,slotKey,name,JSON.stringify(offers)]);
 const free=await requestWeeklyPurchase(pool,sid,{userId:uid,username:'Viewer'},{name,key:slotKey,provider:'hacksaw'},now);
 const upgrade=await reservePurchaseUpgrade(pool,sid,{userId:uid,username:'Viewer'},{messageId:'weekly-upgrade',kind:'weekly',offerId:'duel',slotName:name,slotKey,provider:'hacksaw'});
 assert.equal(upgrade.points,700);
 await nextWeeklyPurchase(pool,sid);await quoteWeeklyPurchase(pool,sid,free.entry.id,offers,{train:'classic',duel:'other'},20);
 await assert.rejects(weeklyPurchaseIntent(pool,sid,free.entry.id,offers[1]!),/quote_changed/);
 const attempts=await Promise.all([weeklyPurchaseIntent(pool,sid,free.entry.id,offers[1]!,upgrade.id),weeklyPurchaseIntent(pool,sid,free.entry.id,offers[1]!,upgrade.id)]);
 assert.equal(attempts.filter(a=>a.authorized).length,1);
 assert.equal((await pool.query('SELECT status FROM automod_shop_orders WHERE id=$1',[upgrade.id])).rows[0].status,'purchase-sent');
 await mutateOrder(pool,sid,upgrade.id,'confirmed',{});await mutateOrder(pool,sid,upgrade.id,'complete',{gainCents:4000});
 await finishWeeklyPurchase(pool,sid,free.entry.id,4000);
 assert.equal((await readWallet(pool,sid,uid)).balance,9475);assert.equal((await readWallet(pool,sid,uid)).reserved,0);
 assert.equal((await pool.query('SELECT quote FROM automod_weekly_entries WHERE id=$1',[free.entry.id])).rows[0].quote.id,'duel');
});

test('an unused orphaned upgrade is refunded, but a sent upgrade stays reserved for reconciliation',async()=>{
 const safe=await order(403,'chosen',700),ambiguous=await order(404,'purchase-sent',700);
 for(const [sid,value] of [[403,safe],[404,ambiguous]] as const)await pool.query("UPDATE automod_shop_orders SET upgrade_kind='weekly',upgrade_target=$2 WHERE id=$1",[value.id,randomUUID()]);
 assert.equal((await reconcileUnusedPurchaseUpgrades(pool,403)).length,1);
 assert.equal((await reconcileUnusedPurchaseUpgrades(pool,403)).length,0);
 assert.equal((await readWallet(pool,403,safe.uid)).reserved,0);
 assert.equal((await reconcileUnusedPurchaseUpgrades(pool,404)).length,0);
 assert.equal((await readWallet(pool,404,ambiguous.uid)).reserved,700);
});

test('documented Rumble follow response works without root username and rejects wrong account',()=>{
 const data={type:'user',user_id:'12345',followers:{num_followers_total:12,recent_followers:[]}};
 assert.equal(followSnapshot(data,'LeCasiNoze')?.ownerId,'12345');
 assert.equal(followSnapshot({...data,username:'Other'},'LeCasiNoze'),null);
 assert.equal(followSnapshot({...data,type:'channel'},'LeCasiNoze'),null);
 assert.equal(followSnapshot(data,'Other'),null);
});

test('daily greeting follows native identity across rename, Paris day and current mode',async()=>{
 const sid=315,now=new Date('2026-10-08T21:59:00Z');await streamer(sid);
 await pool.query(`UPDATE automod_control SET runtime_seen_at=$2,runtime_status='{"publisherActive":true,"mode":"session-buy"}' WHERE streamer_id=$1`,[sid,now]);
 const viewer={streamerId:sid,userId:'7315',username:'Viewer',createdAt:now};
 const replies=await Promise.all([dailyViewerGreeting(pool,viewer,now),dailyViewerGreeting(pool,{...viewer,username:'Renamed'},now)]);
 assert.equal(replies.filter(Boolean).length,1);assert.match(replies.find(Boolean)!,/3 achats/);
 assert.equal(await dailyViewerGreeting(pool,viewer,now),null);
 const next=new Date('2026-10-08T22:01:00Z');
 await pool.query(`UPDATE automod_control SET runtime_seen_at=$2,runtime_status='{"publisherActive":true,"mode":"auto-hunt"}' WHERE streamer_id=$1`,[sid,next]);
 assert.match((await dailyViewerGreeting(pool,{...viewer,createdAt:next},next))!,/collecte les bonus/);
 await pool.query('UPDATE automod_control SET desired_enabled=FALSE WHERE streamer_id=$1',[sid]);
 assert.equal(await dailyViewerGreeting(pool,{...viewer,userId:'7316',createdAt:next},next),null);
 assert.doesNotMatch(greetingText('Follower','automod',true,false),/Follow pour/);
});

test('autoposts need fresh human activity and a durable twenty minute interval',async()=>{
 const sid=316;await streamer(sid);
 await pool.query(`CREATE TABLE IF NOT EXISTS chat_messages(id bigserial PRIMARY KEY,streamer_id bigint,user_id bigint,username text,body text,external_source text,created_at timestamptz DEFAULT NOW(),deleted_at timestamptz)`);
 assert.equal(await claimAutomodReminder(pool,sid,'lecasinoze',1),false);
 await pool.query(`INSERT INTO chat_messages(streamer_id,user_id,username,external_source) VALUES($1,0,'LunaLive_Bot','rumble')`,[sid]);
 assert.equal(await claimAutomodReminder(pool,sid,'lecasinoze',1),false);
 await pool.query(`INSERT INTO chat_messages(streamer_id,user_id,username,external_source) VALUES($1,0,'Viewer','rumble')`,[sid]);
 const claims=await Promise.all([claimAutomodReminder(pool,sid,'lecasinoze',1),claimAutomodReminder(pool,sid,'lecasinoze',1)]);
 assert.equal(claims.filter(Boolean).length,1);
 await pool.query(`INSERT INTO chat_messages(streamer_id,user_id,username,external_source) VALUES($1,0,'Viewer','rumble')`,[sid]);
 assert.equal(await claimAutomodReminder(pool,sid,'lecasinoze',1),false);
 await pool.query(`UPDATE automod_autopost_activity SET last_sent_at=NOW()-INTERVAL '21 minutes' WHERE streamer_id=$1`,[sid]);
 assert.equal(await claimAutomodReminder(pool,sid,'lecasinoze',1),true);
 await pool.query(`UPDATE automod_autopost_activity SET last_sent_at=NOW()-INTERVAL '21 minutes' WHERE streamer_id=$1`,[sid]);
 assert.equal(await claimAutomodReminder(pool,sid,'lecasinoze',1),false);
});

test('Discord code binds only a fresh native Rumble message, is one-use and cannot replace another link',async()=>{
 const sid=317,discord='123456789012345678',uid='7317';await streamer(sid);
 const link=await requestAutomodDiscordLink(pool,sid,discord);assert.equal(link.linked,false);
 assert.equal(await automodDiscordProfile(pool,sid,discord),null);
 const msg={streamerId:sid,userId:uid,username:'Verified',text:link.command!,createdAt:new Date()};
 assert.equal(await handleDiscordLinkChat(pool,{...msg,createdAt:new Date(Date.now()-180000)}),null);
 assert.match((await handleDiscordLinkChat(pool,msg))!,/Compte Rumble lié/);
 assert.equal((await automodDiscordProfile(pool,sid,discord))?.username,'Verified');
 assert.match((await handleDiscordLinkChat(pool,{...msg,userId:'7318'}))!,/expiré ou invalide/);
 const other=await requestAutomodDiscordLink(pool,sid,'123456789012345679');
 assert.match((await handleDiscordLinkChat(pool,{...msg,text:other.command!}))!,/déjà lié/);
 const stored=(await pool.query('SELECT code_hash FROM automod_discord_link_codes WHERE streamer_id=$1',[sid])).rows[0];
 assert.equal(stored.code_hash.length,64);assert.notEqual(stored.code_hash,other.command!.slice(6));
});

test('future-offset Rumble follow thanks and native-ID credit use observed freshness, exactly once',async()=>{
 const sid=470,uid='1470';await streamer(sid);
 await pool.query(`ALTER TABLE streamers ADD COLUMN IF NOT EXISTS slug text;
 ALTER TABLE streamer_rumble_info ADD COLUMN IF NOT EXISTS live_video_id_numeric text;
 CREATE TABLE rumble_send_queue(id bigserial PRIMARY KEY,video_id_numeric text,text text,status text,created_at timestamptz DEFAULT NOW());`);
 await pool.query("UPDATE streamers SET slug='lecasinoze' WHERE id=$1",[sid]);
 await pool.query("UPDATE automod_control SET runtime_seen_at=NOW(),runtime_status='{\"publisherActive\":true}' WHERE streamer_id=$1",[sid]);
 await pool.query("INSERT INTO streamer_rumble_info(streamer_id,is_live,live_video_id_numeric) VALUES($1,TRUE,'private-test')",[sid]);
 await pool.query(`INSERT INTO automod_follow_events(streamer_id,username,followed_at,baseline,last_confirmed_at)
 VALUES($1,'FreshViewer',NOW()+INTERVAL '4 hours',FALSE,NOW()),($1,'HistoricalViewer',NOW(),TRUE,NOW())`,[sid]);
 const sent=await Promise.all([announceNewFollow(pool,sid),announceNewFollow(pool,sid)]);
 assert.equal(sent.filter(Boolean).length,1);
 const queued=(await pool.query("SELECT text FROM rumble_send_queue WHERE video_id_numeric='private-test'")).rows;
 assert.equal(queued.length,1);assert.match(queued[0].text,/Merci.*FreshViewer/);
 await rewardFollow(pool,{streamerId:sid,userId:uid,username:'FreshViewer',createdAt:new Date()});
 await rewardFollow(pool,{streamerId:sid,userId:uid,username:'FreshViewer',createdAt:new Date()});
 assert.equal((await readWallet(pool,sid,uid)).available,100);
 await pool.query("INSERT INTO automod_follow_events(streamer_id,username,followed_at,baseline,seen_at) VALUES($1,'OldUnannounced',NOW(),FALSE,NOW()-INTERVAL '11 minutes')",[sid]);
 assert.equal(await announceNewFollow(pool,sid),false);
});
