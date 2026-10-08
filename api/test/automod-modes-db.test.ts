import test,{before,after} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import pg from 'pg';
import {tickEngagement,pollEngagement,castEngagement,applyModeVote} from '../src/automod-shop/engagement.js';
import {createChallenge,chooseCamp,challengeCallAllowed,startChallengePass,finishChallengePass,settleChallenge,challengeSnapshot,refundStoppedChallenges} from '../src/automod-shop/provider-challenge.js';
import {setAutomodEnabled} from '../src/automod-shop/control-transition.js';
import {creditPoints,readWallet} from '../src/automod-shop/wallet.js';
const admin=new pg.Pool({host:'127.0.0.1',port:55432,user:'automod',database:'postgres',max:1});
const database='automod_modes_test_'+randomUUID().replaceAll('-','');
const pool=new pg.Pool({host:'127.0.0.1',port:55432,user:'automod',database,max:4});let created=false;
before(async()=>{
 assert.equal((await admin.query("SELECT current_setting('data_directory') AS path")).rows[0].path,'/tmp/automod-points-pg-data');
 await admin.query(`CREATE DATABASE ${database}`);created=true;
 await pool.query(`CREATE TABLE streamers(id bigint PRIMARY KEY);
 CREATE TABLE automod_control(streamer_id bigint PRIMARY KEY,desired_enabled boolean,dashboard_settings jsonb DEFAULT '{}',runtime_status jsonb DEFAULT '{}',runtime_seen_at timestamptz DEFAULT NOW(),settings_revision bigint DEFAULT 0,updated_at timestamptz DEFAULT NOW(),updated_by bigint);
 CREATE TABLE streamer_rumble_info(streamer_id bigint PRIMARY KEY,is_live boolean,viewers_count integer);
 CREATE TABLE automod_shop_orders(id uuid,streamer_id bigint,rumble_user_id text,status text,kind text,result jsonb);
 CREATE TABLE automod_points_accounts(streamer_id bigint,rumble_user_id text,username text,balance bigint DEFAULT 0,reserved bigint DEFAULT 0,updated_at timestamptz DEFAULT NOW(),PRIMARY KEY(streamer_id,rumble_user_id));
 CREATE TABLE automod_points_ledger(streamer_id bigint,rumble_user_id text,event_key text,delta bigint,reserved_delta bigint,reason text,metadata jsonb,PRIMARY KEY(streamer_id,event_key));
 INSERT INTO streamers VALUES(1),(2);
 INSERT INTO automod_control(streamer_id,desired_enabled,runtime_status) VALUES(1,TRUE,'{"publisherActive":true,"supportedModes":["automod","auto-hunt","session-buy"]}'),(2,TRUE,'{"publisherActive":true}');
 INSERT INTO streamer_rumble_info VALUES(1,TRUE,3),(2,TRUE,1);`);
});
after(async()=>{await pool.end();if(created)await admin.query(`DROP DATABASE ${database}`);await admin.end();});
const vote=(sid:number,uid:string,text:string)=>castEngagement(pool,{streamerId:sid,userId:uid,username:'Viewer',messageId:randomUUID(),createdAt:new Date(),text});
test('two hour clock, one pending vote, deferred hunt keeps its five minute window',async()=>{
 assert.equal(await tickEngagement(pool,1),null);
 await pool.query("UPDATE automod_mode_clock SET due_at=NOW()-INTERVAL '4 hours' WHERE streamer_id=1");
 const queued=await tickEngagement(pool,1);assert.equal(queued?.status,'queued');assert.deepEqual(queued?.options,['automod','auto-hunt','session-buy']);
 await tickEngagement(pool,1);assert.equal((await pool.query('SELECT COUNT(*) AS n FROM automod_engagement WHERE streamer_id=1')).rows[0].n,'1');
 await pool.query("UPDATE automod_engagement SET created_at=NOW()-INTERVAL '4 hours' WHERE streamer_id=1");
 assert.equal((await pollEngagement(pool,1,{kind:'mode',prepareOnly:true})).event?.status,'queued');
 const opened=(await pollEngagement(pool,1,{kind:'mode'})).event!;
 assert.equal(opened.status,'open');assert.ok(Date.parse(opened.closesAt!)-Date.now()>290000);
 assert.match((await vote(1,'101','!3'))!,/Session achat/);assert.match((await vote(1,'102','!3'))!,/Session achat/);
 assert.match((await vote(1,'103','!1'))!,/Automod/);assert.match((await vote(1,'104','!4'))!,/Choisis/);
 assert.match((await vote(1,'101','!1'))!,/déjà/);
 await pool.query("UPDATE automod_engagement SET closes_at=NOW()-INTERVAL '1 second' WHERE id=$1",[opened.id]);
 assert.equal((await pollEngagement(pool,1,{kind:'mode'})).event?.result,'session-buy');
 await pool.query("INSERT INTO automod_shop_orders(streamer_id,status,kind,result) VALUES(1,'pending','buy',NULL)");
 assert.equal((await applyModeVote(pool,1,opened.id)).applied,false);
 await pool.query("DELETE FROM automod_shop_orders WHERE streamer_id=1");
 assert.equal((await applyModeVote(pool,1,opened.id)).applied,true);
 assert.equal((await pool.query('SELECT dashboard_settings FROM automod_control WHERE streamer_id=1')).rows[0].dashboard_settings.mode,'session-buy');
 assert.equal(await tickEngagement(pool,1),null);
 const remaining=Number((await pool.query("SELECT EXTRACT(EPOCH FROM (due_at-NOW())) AS s FROM automod_mode_clock WHERE streamer_id=1")).rows[0].s);
 assert.ok(remaining>7190&&remaining<=7200);
});
test('older worker receives only the two supported modes; stopping clears the clock',async()=>{
 await tickEngagement(pool,2);await pool.query("UPDATE automod_mode_clock SET due_at=NOW()-INTERVAL '1 second' WHERE streamer_id=2");
 assert.deepEqual((await tickEngagement(pool,2))?.options,['automod','auto-hunt']);
 await pollEngagement(pool,2,{kind:'mode'});assert.match((await vote(2,'201','!3'))!,/Choisis !1 ou !2/);
 await pool.query('UPDATE automod_control SET desired_enabled=FALSE WHERE streamer_id=2');
 assert.equal(await tickEngagement(pool,2),null);
 assert.equal((await pool.query('SELECT COUNT(*) AS n FROM automod_mode_clock WHERE streamer_id=2')).rows[0].n,'0');
});

test('challenge persists camps, 3+3 rotation and settles once without creating points',async()=>{
 await pool.query('INSERT INTO streamers VALUES(3)');
 await pool.query(`INSERT INTO automod_control(streamer_id,desired_enabled,dashboard_settings) VALUES(3,TRUE,'{"mode":"provider-challenge"}')`);
 const config={stakeCents:20,slotDurationMs:240000,goldenEnabled:true};
 const event=await createChallenge(pool,3,'round1',config);
 assert.equal((await createChallenge(pool,3,'round1',config)).id,event.id);
 await creditPoints(pool,3,'301','P','seed-p',1000,'test');await creditPoints(pool,3,'302','H','seed-h',1000,'test');
 await chooseCamp(pool,3,event.id,{userId:'301',username:'P'},'pragmatic',100);
 await chooseCamp(pool,3,event.id,{userId:'302',username:'H'},'hacksaw',300);
 assert.equal((await readWallet(pool,3,'301')).reserved,100);
 await assert.rejects(chooseCamp(pool,3,event.id,{userId:'301',username:'P'},'hacksaw'),/camp_locked/);
 assert.equal(await challengeCallAllowed(pool,3,'301','hacksaw'),'challenge_other_camp');
 assert.equal(await challengeCallAllowed(pool,3,'999','pragmatic'),'challenge_choose_camp');
 await assert.rejects(startChallengePass(pool,3,event.id,{id:'p0',provider:'pragmatic',slotName:'P0'}),/not_ready/);
 await pool.query("UPDATE automod_provider_challenges SET closes_at=NOW()-INTERVAL '1 second' WHERE id=$1",[event.id]);
 for(let i=0;i<6;i++){
  const provider=i<3?'pragmatic' as const:'hacksaw' as const;
  const p={id:'p'+i,provider,slotName:'slot'+i};await startChallengePass(pool,3,event.id,p);
  if(i===0){
   await assert.rejects(startChallengePass(pool,3,event.id,{id:'overlap',provider,slotName:'other'}),/unresolved/);
   await assert.rejects(chooseCamp(pool,3,event.id,{userId:'303',username:'late'},'pragmatic',100),/bets_closed/);
   await chooseCamp(pool,3,event.id,{userId:'303',username:'late'},'pragmatic');
  }
  const receipt={spentCents:1000,returnedCents:provider==='pragmatic'?3000:500,naturalBonuses:1,bestMultiplier:300,rounds:10,bonusActive:false as const,measurement:'provider-ledger' as const};
  const done=await finishChallengePass(pool,3,event.id,p.id,receipt);
  assert.equal(done.score,provider==='pragmatic'?55:5); // 20 euro net -> 40 pts + 5 bonus + 10 spectacle.
  assert.equal((await finishChallengePass(pool,3,event.id,p.id,receipt)).changed,false);
  await assert.rejects(finishChallengePass(pool,3,event.id,p.id,{...receipt,returnedCents:9}),/conflict/);
  if(i===0)await assert.rejects(startChallengePass(pool,3,event.id,{id:'wrong',provider:'hacksaw',slotName:'H'}),/rotation/);
 }
 await assert.rejects(settleChallenge(pool,3,event.id),/not_complete/);
 await pool.query("UPDATE automod_provider_challenges SET started_at=NOW()-INTERVAL '2 hours 1 minute' WHERE id=$1",[event.id]);
 assert.equal((await settleChallenge(pool,3,event.id)).result,'pragmatic');
 assert.equal((await settleChallenge(pool,3,event.id)).changed,false);
 assert.equal((await readWallet(pool,3,'301')).balance,1300);assert.equal((await readWallet(pool,3,'302')).balance,700);
 assert.equal((await readWallet(pool,3,'301')).reserved,0);
 assert.equal(await challengeCallAllowed(pool,3,'301','hacksaw'),null);
});

test('interrupted challenge refunds reservations and cannot score an unknown receipt',async()=>{
 await pool.query('INSERT INTO streamers VALUES(4)');
 const e=await createChallenge(pool,4,'cancelled',{stakeCents:20,slotDurationMs:240000,goldenEnabled:true});
 await creditPoints(pool,4,'401','P','seed',1000,'test');await chooseCamp(pool,4,e.id,{userId:'401',username:'P'},'pragmatic',500);
 await assert.rejects(finishChallengePass(pool,4,e.id,'missing',{spentCents:null} as any),/unconfirmed/);
 assert.equal((await settleChallenge(pool,4,e.id,true)).refunded,true);
 assert.deepEqual(await readWallet(pool,4,'401'),{balance:1000,reserved:0,available:1000});
 assert.equal((await settleChallenge(pool,4,e.id,true)).changed,false);
});

test('native wallet delta scores net profit but never claims starting balance was spent',async()=>{
 await pool.query('INSERT INTO streamers VALUES(5)');
 const e=await createChallenge(pool,5,'wallet',{stakeCents:20,slotDurationMs:240000,goldenEnabled:true});
 await pool.query("UPDATE automod_provider_challenges SET closes_at=NOW()-INTERVAL '1 second' WHERE id=$1",[e.id]);
 await startChallengePass(pool,5,e.id,{id:'visit',provider:'pragmatic',slotName:'Fruit Party'});
 const receipt={measurement:'balance-delta' as const,balanceBeforeCents:50000,balanceAfterCents:52000,rounds:100,naturalBonuses:1,bestMultiplier:300,bonusActive:false as const};
 assert.equal((await finishChallengePass(pool,5,e.id,'visit',receipt)).score,55);
 const snapshot=await challengeSnapshot(pool,5,e.id);
 assert.equal(snapshot.scores.pragmatic,55);assert.equal(snapshot.passes[0]!.receipt.spentCents,null);assert.equal(snapshot.passes[0]!.receipt.profitCents,2000);
 assert.equal((await finishChallengePass(pool,5,e.id,'visit',receipt)).changed,false);
});

test('stop persists cancellation across immediate restart and refunds only once',async()=>{
 await pool.query('INSERT INTO streamers VALUES(6)');
 await pool.query('INSERT INTO automod_control(streamer_id,desired_enabled) VALUES(6,FALSE)');
 const e=await createChallenge(pool,6,'restart',{stakeCents:20,slotDurationMs:240000,goldenEnabled:true});
 await creditPoints(pool,6,'601','Viewer','seed-restart',1000,'test');
 await chooseCamp(pool,6,e.id,{userId:'601',username:'Viewer'},'pragmatic',100);
 await setAutomodEnabled(pool,6,false,null);
 await setAutomodEnabled(pool,6,true,null);
 assert.ok((await pool.query('SELECT cancel_requested_at FROM automod_provider_challenges WHERE id=$1',[e.id])).rows[0].cancel_requested_at);
 await refundStoppedChallenges(pool,6);
 await refundStoppedChallenges(pool,6);
 assert.deepEqual(await readWallet(pool,6,'601'),{balance:1000,reserved:0,available:1000});
 await assert.rejects(chooseCamp(pool,6,e.id,{userId:'602',username:'Late'},'hacksaw',100),/closed/);
 assert.equal((await pool.query("SELECT COUNT(*) AS n FROM automod_points_ledger WHERE streamer_id=6 AND reason='challenge-refund'")).rows[0].n,'1');
});
