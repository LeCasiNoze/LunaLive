import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { pool } from "../src/db.js";
import { mig012_streamer_chest } from "../src/db/migrations/mig012_streamer_chest.js";
import { mig153_chest_payout_history } from "../src/db/migrations/mig153_chest_payout_history.js";
import { closeOpeningAndPayout } from "../src/routes/chest.js";
import { computeMetricProgress } from "../src/services/quests.js";

async function fixture(t: any) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE TABLE users(id INT PRIMARY KEY,rubis INT NOT NULL DEFAULT 0);
    CREATE TABLE streamers(id INT PRIMARY KEY);
    CREATE TABLE rubis_tx(id BIGINT PRIMARY KEY);
    CREATE TABLE wallet_lots(id SERIAL PRIMARY KEY,user_id INT,origin TEXT,amount_remaining INT,meta JSONB,created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE wallet_tx(id SERIAL PRIMARY KEY,user_id INT,kind TEXT,origin TEXT,amount INT,meta JSONB,created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE user_subscriptions(user_id INT,plan_code TEXT,status TEXT,current_period_end TIMESTAMPTZ);
    CREATE TABLE stream_viewer_minutes(streamer_id INT,viewer_key TEXT,bucket_ts TIMESTAMPTZ);
    INSERT INTO users(id) VALUES(4),(7),(174);
    INSERT INTO streamers VALUES(12);
  `);
  const client={query:(sql:string,args?:any[])=>db.query(sql,args),release(){}};
  const adapter={query:client.query,connect:async()=>client} as any;
  // pg's simple-query protocol accepts this existing multi-statement migration.
  await mig012_streamer_chest({query:(sql:string)=>db.exec(sql)} as any);
  await db.exec(`
    INSERT INTO streamer_chests(streamer_id) VALUES(12);
    INSERT INTO streamer_chest_openings(id,streamer_id,created_by_user_id,closes_at) VALUES(9,12,4,NOW());
    INSERT INTO streamer_chest_participants(opening_id,user_id) VALUES(9,7),(9,174);
    INSERT INTO streamer_chest_lots(streamer_id,origin,weight_bp,amount_remaining) VALUES(12,'chest_auto',2000,1237);
  `);
  t.mock.method(pool,"connect",adapter.connect);
  return {db,client,adapter};
}

test("chest payouts immediately count towards quests and cannot pay or count twice",async t=>{
  const {db,client}=await fixture(t);
  const result=await closeOpeningAndPayout(9,"auto");
  assert.equal(result.payouts.length,2);
  assert.equal(result.payouts.reduce((sum,p)=>sum+p.amount,0),1237);
  for(const userId of [7,174]) {
    const audit=(await db.query<any>("SELECT amount FROM streamer_chest_payouts WHERE opening_id=9 AND user_id=$1",[userId])).rows[0];
    const wallet=(await db.query<any>("SELECT rubis FROM users WHERE id=$1",[userId])).rows[0];
    assert.equal(audit.amount,wallet.rubis);
    assert.equal(await computeMetricProgress(client as any,userId,"chest_open","weekly"),1);
    assert.equal(await computeMetricProgress(client as any,userId,"chest_open","monthly"),1);
  }
  assert.equal((await closeOpeningAndPayout(9,"streamer")).alreadyClosed,true);
  assert.equal((await db.query<any>("SELECT COUNT(*)::int AS n FROM streamer_chest_payouts")).rows[0].n,2);
  assert.equal((await db.query<any>("SELECT COUNT(*)::int AS n FROM wallet_tx")).rows[0].n,2);
});

test("a payout history failure rolls back the credit, balance and opening closure",async t=>{
  const {db,client}=await fixture(t);
  const query=client.query;
  const mock=t.mock.method(client,"query",async(sql:string,args?:any[])=>{
    if(sql.includes("INSERT INTO streamer_chest_payouts")) throw new Error("audit_unavailable");
    return query(sql,args);
  });
  await assert.rejects(closeOpeningAndPayout(9,"auto"),/audit_unavailable/);
  mock.mock.restore();
  assert.equal((await db.query<any>("SELECT SUM(rubis)::int AS n FROM users")).rows[0].n,0);
  assert.equal((await db.query<any>("SELECT COUNT(*)::int AS n FROM wallet_tx")).rows[0].n,0);
  assert.equal((await db.query<any>("SELECT status FROM streamer_chest_openings WHERE id=9")).rows[0].status,"open");
  assert.equal((await db.query<any>("SELECT SUM(amount_remaining)::int AS n FROM streamer_chest_lots")).rows[0].n,1237);
  assert.equal((await closeOpeningAndPayout(9,"auto")).payouts.length,2);
});

test("historical recovery restores only proven credits once, preserving their dates and balances",async t=>{
  const {db,adapter,client}=await fixture(t);
  await db.exec(`
    UPDATE streamer_chest_openings SET status='closed';
    UPDATE users SET rubis=612 WHERE id=7;
    UPDATE users SET rubis=625 WHERE id=174;
    INSERT INTO wallet_tx(user_id,kind,origin,amount,meta) VALUES
      (7,'earn','chest_streamer',612,'{"openingId":9}'),
      (174,'earn','chest_streamer',625,'{"openingId":9}'),
      (4,'earn','chest_streamer',10,'{"openingId":9}'),
      (7,'earn','chest_streamer',10,'{"openingId":"invalid"}'),
      (7,'earn','other',10,'{"openingId":9}');
    INSERT INTO streamer_chest_openings(id,streamer_id,created_by_user_id,status,closes_at) VALUES(8,12,4,'closed',NOW()-INTERVAL '40 days');
    INSERT INTO streamer_chest_participants(opening_id,user_id,joined_at) VALUES(8,7,NOW()-INTERVAL '40 days');
    INSERT INTO wallet_tx(user_id,kind,origin,amount,meta,created_at) VALUES(7,'earn','chest_streamer',20,'{"openingId":8}',NOW()-INTERVAL '40 days');
  `);
  const balances=await db.query("SELECT id,rubis FROM users ORDER BY id");
  await mig153_chest_payout_history(adapter);
  await mig153_chest_payout_history(adapter);
  assert.equal((await db.query<any>("SELECT COUNT(*)::int AS n FROM streamer_chest_payouts")).rows[0].n,3);
  assert.deepEqual((await db.query("SELECT id,rubis FROM users ORDER BY id")).rows,balances.rows);
  assert.equal((await db.query<any>("SELECT COUNT(*)::int AS n FROM wallet_tx")).rows[0].n,6);
  for(const userId of [7,174]) {
    assert.equal(await computeMetricProgress(client as any,userId,"chest_open","weekly"),1);
    assert.equal(await computeMetricProgress(client as any,userId,"chest_open","monthly"),1);
  }
  const matched=await db.query<any>(`SELECT COUNT(*)::int AS n FROM streamer_chest_payouts p JOIN wallet_tx w
    ON p.user_id=w.user_id AND w.meta->>'openingId'=p.opening_id::text AND w.kind='earn' AND w.origin='chest_streamer'
    WHERE p.created_at=w.created_at AND p.amount=w.amount`);
  assert.equal(matched.rows[0].n,3);
});
