import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import {pool} from '../dist/db.js';
import {automodServiceRouter} from '../dist/routes/automod_service.js';
import {publicAutomodRuntime} from '../dist/routes/automod_runtime.js';
process.env.AUTOMOD_SERVICE_JWT_SECRET='test-only-service-secret-do-not-use-in-production';
const statements=[];let failRuntime=false;
pool.query=async(sql,params=[])=>{statements.push({sql,params});if(sql.includes('c.credential_version,s.slug'))return{rows:[{streamer_id:77,credential_version:1,slug:'lecasinoze'}]};if(failRuntime&&sql.includes('runtime_seen_at'))throw Error('database outage');return{rows:[],rowCount:0};};
const app=express();app.use(express.json());app.use(automodServiceRouter);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
const token=scope=>jwt.sign({sid:'test-id',ver:1,scope,typ:'automod-service',streamerId:77,slug:'lecasinoze'},process.env.AUTOMOD_SERVICE_JWT_SECRET,{issuer:'lunalive-api',audience:'automod',expiresIn:'15m'});
const post=async(path,body,scope=['automod:runtime:write'])=>{const response=await fetch(base+'/automod-service/v1/'+path,{method:'POST',headers:{'Content-Type':'application/json',...(scope?{Authorization:'Bearer '+token(scope)}:{})},body:JSON.stringify(body)});return{status:response.status,body:await response.json()};};
try{
 await test('runtime: unauthenticated and old-scope credentials cannot write',async()=>{assert.equal((await post('control/status',{},null)).status,401);assert.equal((await post('control/status',{},['automod:control:read'])).status,403);});
 await test('runtime: credential owns target, redacts secrets, preserves paused timer',async()=>{const r=await post('control/status',{streamerId:999,phase:'running',slotDeadlineAt:200,recoveryPausedAt:100,profile:'private-profile',lastError:'token=private123 https://example.test/private',appliedSettingsRevision:3});assert.equal(r.status,200);const s=statements.findLast(s=>s.sql.includes('INSERT INTO automod_control(streamer_id,runtime_status'));assert.equal(s.params[0],77);const runtime=JSON.parse(s.params[1]);assert.equal(runtime.recoveryPausedAt,100);assert.equal(runtime.profile,undefined);assert.ok(!JSON.stringify(runtime).includes('private123'));assert.equal(s.params[2],3);});
 await test('runtime: malformed and oversized payloads are refused',async()=>{assert.equal((await post('control/status',[])).status,400);assert.equal((await post('control/status',{phase:'running',noise:'x'.repeat(21000)})).status,400);assert.equal(publicAutomodRuntime({phase:'injected'}).phase,'error');});
 await test('commands: foreign IDs cannot be completed and claim is scoped',async()=>{assert.equal((await post('control/commands/claim',{})).status,200);const s=statements.findLast(s=>s.sql.includes("SET status='claimed'"));assert.deepEqual(s.params,[77]);assert.ok(s.sql.includes('streamer_id=$1'));const r=await post('control/commands/123/complete',{ok:true});assert.equal(r.body.ok,false);const done=statements.findLast(s=>s.sql.includes('finished_at=NOW()'));assert.equal(done.params[0],77);assert.ok(done.sql.includes('streamer_id=$1 AND id=$2'));assert.equal((await post('control/commands/nope/complete',{})).status,400);});
 await test('database outage: status endpoint returns 503 without killing API',async()=>{failRuntime=true;assert.equal((await post('control/status',{phase:'idle'})).status,503);failRuntime=false;assert.equal((await post('control/status',{phase:'idle'})).status,200);});
}finally{await new Promise(r=>server.close(r));await pool.end();}

