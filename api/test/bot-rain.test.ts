import test from "node:test";
import assert from "node:assert/strict";
import { pool } from "../src/db.js";
import { advanceIfNeeded, botRainRouter } from "../src/routes/bot_rain.js";
const cfg={enabled:true,intervalMin:60,joinWindowSec:120,rubiesPerUser:15,offlineResetSec:600};
const streamer={streamerId:12,slug:"lecasinoze",ownerUserId:4,isLive:true,appearance:{}};
const app={locals:{}};
test("duplicate rain join is idempotent and publishes no second announcement",async(t)=>{
  const calls:string[]=[];
  const state={phase:"open",roundId:23,closeAtMs:Date.now()+60000,nextAtMs:Date.now()+60000};
  const client={async query(sql:string){calls.push(sql);return {rows:sql.includes("FROM bot_rain_state")?[state]:[],rowCount:0};},release(){}};
  t.mock.method(pool,"connect",async()=>client);
  t.mock.method(pool,"query",async(sql:string)=>({rows:sql.includes("FROM streamers")?[{id:12,slug:"lecasinoze",isLive:true}]:sql.includes("FROM bot_rain_cfg")?[cfg]:sql.includes("FROM bot_rain_state")?[state]:[]}));
  const handler=(botRainRouter as any).stack.find((layer:any)=>layer.route?.path==="/join").route.stack[0].handle;
  const response=await new Promise<any>((resolve,reject)=>handler({body:{slug:"lecasinoze"},user:{id:7,username:"Nico"},app},{status(){return this},json:resolve},reject));
  assert.equal(response.alreadyJoined,true);
  assert.ok(calls.some(sql=>sql.includes("DO NOTHING RETURNING user_id")));
});
test("expired rain pays once even if stream ended, then schedules next rain",async(t)=>{
  let phase="open";const payouts:any[]=[];let commits=0;
  const client={async query(sql:string,params?:any[]){
    if(sql==="COMMIT") commits++;
    if(sql.includes("FROM bot_rain_state")) return {rows:[{phase,roundId:23,closeAtMs:Date.now()-60000,nextAtMs:Date.now()-60000}]};
    if(sql.includes("FROM bot_rain_joins")) return {rows:[{user_id:7,username:"Nico"}]};
    if(sql.includes("SELECT id, rubis FROM users")) return {rows:[{id:7,rubis:0}]};
    if(sql.includes("INSERT INTO wallet_tx")) payouts.push(params);
    if(sql.includes("SET phase='waiting'")) phase="waiting";
    return {rows:[]};
  },release(){}};
  t.mock.method(pool,"connect",async()=>client);
  t.mock.method(pool,"query",async()=>({rows:[{id:900,created_at:new Date()}]}));
  await advanceIfNeeded({app},{...streamer,isLive:false},cfg);
  assert.equal(payouts.length,1);assert.equal(payouts[0][2],15);assert.equal(phase,"waiting");
  await advanceIfNeeded({app},{...streamer,isLive:false},cfg);
  assert.equal(payouts.length,1);assert.ok(commits>=2);
});
import { tickBotRains } from "../src/routes/bot_rain.js";
test("scheduler opens a due rain without any viewer polling the bot menu",async(t)=>{
  let opened=false;
  const state={phase:"waiting",roundId:23,nextAtMs:Date.now()-1000,closeAtMs:null};
  const client={async query(sql:string){if(sql.includes("SET phase='open'")) opened=true;return {rows:sql.includes("FROM bot_rain_state")?[state]:[]};},release(){}};
  t.mock.method(pool,"connect",async()=>client);
  t.mock.method(pool,"query",async(sql:string)=>({rows:sql.includes("SELECT s.slug")?[{slug:"lecasinoze"}]:sql.includes("FROM streamers")?[{id:12,slug:"lecasinoze",isLive:true}]:sql.includes("FROM bot_rain_cfg")?[cfg]:sql.includes("FROM bot_rain_state")?[state]:[]}));
  await tickBotRains(app);
  assert.equal(opened,true);
});
