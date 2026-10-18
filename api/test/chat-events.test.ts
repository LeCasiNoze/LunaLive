import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { pool } from "../src/db.js";
import { addBet, resolvePrediction } from "../src/predictions/predictions.store.js";
import { readChatEvents } from "../src/routes/chat_events.js";
import { botWheelRouter } from "../src/routes/bot_wheel.js";
import { predictionsRouter } from "../src/predictions/predictions.routes.js";
import { tryHandleWheelCommand } from "../../bot/src/modules/wheel/wheel.js";

async function fixture(t: any) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE TABLE users(id INT PRIMARY KEY,rubis INT,last_prediction_stake INT);
    CREATE TABLE wallet_lots(id SERIAL PRIMARY KEY,user_id INT,origin TEXT,amount_remaining INT,created_at TIMESTAMPTZ DEFAULT NOW(),meta JSONB);
    CREATE TABLE wallet_tx(id SERIAL PRIMARY KEY,user_id INT,kind TEXT,origin TEXT,spend_kind TEXT,spend_type TEXT,streamer_id INT,amount INT,breakdown JSONB,support_rubis INT,streamer_earn_rubis INT,platform_cut_rubis INT,meta JSONB);
    CREATE TABLE predictions(id SERIAL PRIMARY KEY,streamer_id INT,question TEXT,option1_label TEXT,option2_label TEXT,fixed_stake INT,status TEXT,created_at TIMESTAMPTZ DEFAULT NOW(),bets_close_at TIMESTAMPTZ,resolved_option INT,total_pool_1 INT DEFAULT 0,total_pool_2 INT DEFAULT 0);
    CREATE TABLE prediction_bets(prediction_id INT,user_id INT,choice INT CHECK(choice IN (1,2)),amount INT,UNIQUE(prediction_id,user_id));
    INSERT INTO users VALUES(7,100,10);
    INSERT INTO wallet_lots(user_id,origin,amount_remaining) VALUES(7,'farm_watch',100);
    INSERT INTO predictions(streamer_id,question,option1_label,option2_label,fixed_stake,status,bets_close_at)
      VALUES(12,'Qui gagne ?','Équipe bleue','Équipe rouge',10,'open',NOW()+INTERVAL '10 minutes');
  `);
  const client = {query: (sql: string, args?: any[]) => db.query(sql,args),release() {}};
  const fakePool = {query:client.query,connect:async()=>client} as any;
  const pred = (await db.query<any>("SELECT * FROM predictions WHERE id=1")).rows[0];
  return {db,fakePool,pred};
}

test("a duplicate prediction bet never debits the wallet twice",async t=>{
  const {db,fakePool,pred}=await fixture(t);
  await addBet(fakePool,pred,7,1,10);
  await assert.rejects(addBet(fakePool,pred,7,2,25),/already_bet/);
  assert.equal((await db.query<any>("SELECT rubis FROM users WHERE id=7")).rows[0].rubis,90);
  assert.equal((await db.query<any>("SELECT COUNT(*)::int AS n FROM wallet_tx")).rows[0].n,1);
  assert.deepEqual((await db.query<any>("SELECT total_pool_1,total_pool_2 FROM predictions")).rows[0],{total_pool_1:10,total_pool_2:0});
});

test("expired bets and failed inserts leave both balance and wallet lots intact",async t=>{
  const {db,fakePool,pred}=await fixture(t);
  // A failure after the debit must roll the entire operation back.
  await assert.rejects(addBet(fakePool,pred,7,3 as any,10));
  await db.exec("UPDATE predictions SET bets_close_at=NOW()-INTERVAL '1 second'");
  await assert.rejects(addBet(fakePool,pred,7,1,10),/bets_closed/);
  assert.equal((await db.query<any>("SELECT rubis FROM users WHERE id=7")).rows[0].rubis,100);
  assert.equal((await db.query<any>("SELECT amount_remaining FROM wallet_lots")).rows[0].amount_remaining,100);
  assert.equal((await db.query<any>("SELECT COUNT(*)::int AS n FROM wallet_tx")).rows[0].n,0);
});

test("resolving an already resolved prediction cannot pay its winner twice",async t=>{
  const {db,fakePool,pred}=await fixture(t);
  await addBet(fakePool,pred,7,1,10);
  await resolvePrediction(fakePool,pred,1);
  await assert.rejects(resolvePrediction(fakePool,pred,1),/already_resolved/);
  assert.equal((await db.query<any>("SELECT rubis FROM users WHERE id=7")).rows[0].rubis,99);
  assert.equal((await db.query<any>("SELECT COUNT(*)::int AS n FROM wallet_tx WHERE kind='earn'")).rows[0].n,1);
});

test("snapshots use actual bets, labels and viewer participation, including zero bets",async t=>{
  const {db,fakePool,pred}=await fixture(t);
  await db.exec(`
    CREATE TABLE bot_rain_state(streamer_id INT,round_id INT,open_at_ms BIGINT,close_at_ms BIGINT,phase TEXT);
    CREATE TABLE bot_rain_cfg(streamer_id INT,enabled BOOLEAN,rubies_per_user INT);
    CREATE TABLE bot_rain_joins(streamer_id INT,round_id INT,user_id INT);
    CREATE TABLE streamer_chest_openings(id INT,streamer_id INT,opens_at TIMESTAMPTZ,closes_at TIMESTAMPTZ,status TEXT);
    CREATE TABLE streamer_chest_participants(opening_id INT,user_id INT);
    CREATE TABLE bot_wheel_cfg(streamer_id INT PRIMARY KEY,enroll_open BOOLEAN,updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE bot_wheel_entries(id SERIAL,streamer_id INT,user_id INT,username TEXT,username_lc TEXT,created_at TIMESTAMPTZ DEFAULT NOW(),UNIQUE(streamer_id,username_lc));
    CREATE UNIQUE INDEX wheel_user ON bot_wheel_entries(streamer_id,user_id) WHERE user_id IS NOT NULL;
    INSERT INTO bot_wheel_cfg VALUES(12,TRUE,NOW());
    INSERT INTO bot_wheel_entries(streamer_id,user_id,username,username_lc) VALUES(12,7,'Nico','nico');
    INSERT INTO bot_rain_cfg VALUES(12,TRUE,15);
    INSERT INTO bot_rain_state VALUES(12,23,EXTRACT(EPOCH FROM NOW())*1000,EXTRACT(EPOCH FROM NOW()+INTERVAL '2 minutes')*1000,'open');
    INSERT INTO bot_rain_joins VALUES(12,23,7);
    INSERT INTO streamer_chest_openings VALUES(1,12,NOW(),NOW()+INTERVAL '2 minutes','open');
    INSERT INTO streamer_chest_participants VALUES(1,7);
  `);
  t.mock.method(pool,"query",fakePool.query);
  const empty=await readChatEvents(12,7);
  const prediction=empty.events.find(x=>x.kind==='predict')!.data;
  assert.equal(prediction.pctYes,null);
  assert.equal(prediction.count,0);
  assert.equal(prediction.totalStake,0);
  assert.equal(prediction.option1,'Équipe bleue');
  const wheel=empty.events.find(x=>x.kind==='wheel')!.data;
  assert.equal(wheel.count,1);
  assert.equal(wheel.joined,true);
  assert.equal(wheel.endsAtMs,null);
  assert.deepEqual(wheel.participants,['Nico']);
  for(const kind of ['rain','chest']) {
    const event=empty.events.find(x=>x.kind===kind)!.data;
    assert.equal(event.count,1);assert.equal(event.joined,true);assert.ok(event.endsAtMs>Date.now());
  }
  await addBet(fakePool,pred,7,2,25);
  const snapshot=await readChatEvents(12,7);
  const actual=snapshot.events.find(x=>x.kind==='predict')!.data;
  assert.equal(actual.count,1);assert.equal(actual.totalStake,25);
  assert.equal(actual.pctYes,0);assert.equal(actual.myVote,'no');assert.equal(actual.joined,true);
  await db.exec("UPDATE predictions SET status='resolved'; UPDATE bot_wheel_cfg SET enroll_open=FALSE; UPDATE bot_rain_state SET phase='waiting'; UPDATE streamer_chest_openings SET status='closed'");
  assert.deepEqual((await readChatEvents(12,7)).events,[]);
  assert.equal(snapshot.complete.length,4);
  await db.exec("CREATE TABLE streamers(id INT,slug TEXT); INSERT INTO streamers VALUES(12,'lecasinoze')");
  await db.exec("UPDATE bot_wheel_cfg SET enroll_open=TRUE");
  const notices:string[]=[];
  const command={pool:fakePool,streamer:{id:12} as any,prefix:'!',msg:{userId:7,username:'Nico',body:'!join'},send:async(text:string)=>{notices.push(text);}};
  await tryHandleWheelCommand(command);
  await tryHandleWheelCommand(command);
  assert.equal(notices.every(text=>text.includes('déjà inscrit')),true);
  assert.equal((await db.query<any>("SELECT COUNT(*)::int AS n FROM bot_wheel_entries")).rows[0].n,1);
  t.mock.method(pool,"connect",fakePool.connect);
  const draw=(botWheelRouter as any).stack.find((x:any)=>x.route?.path==='/draw').route.stack.at(-1).handle;
  const io={to(){return this;},emit(){}};
  const request={streamerId:12,app:{locals:{io}}};
  const invoke=()=>new Promise<any>((resolve,reject)=>draw(request,{status(){return this;},json:resolve},reject));
  assert.equal((await invoke()).winner,'Nico');
  assert.equal((await invoke()).winner,null);
  await tryHandleWheelCommand(command);
  assert.match(notices.at(-1)!,/fermées/);
});

test("viewers cannot create or resolve someone else's prediction",async t=>{
  const calls:string[]=[];
  t.mock.method(pool,"query",async(sql:string)=>{calls.push(sql);return {rows:[{user_id:4}]};});
  for(const path of ['/api/bot/predictions/create','/api/bot/predictions/resolve']) {
    const handler=(predictionsRouter as any).stack.find((x:any)=>x.route?.path===path).route.stack.at(-1).handle;
    let code=200;
    const result=await new Promise<any>((resolve,reject)=>handler({user:{id:7,role:'viewer'},body:{streamerId:12,question:'Test',option1:'Oui',option2:'Non'}},{status(n:number){code=n;return this;},json:resolve},reject));
    assert.equal(code,403);assert.equal(result.reason,'forbidden');
  }
  assert.equal(calls.every(sql=>sql.includes('SELECT user_id FROM streamers')),true);
});

test("unavailable event sources are not reported as finished events",async t=>{
  t.mock.method(pool,"query",async(sql:string)=>{
    if(sql.includes('FROM predictions p')) throw Object.assign(new Error('unavailable'),{code:'test'});
    return {rows:[]};
  });
  const result=await readChatEvents(12,7);
  assert.deepEqual(result.events,[]);
  assert.equal(result.complete.includes('predict'),false);
  assert.equal(result.complete.length,3);
});
