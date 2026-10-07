import test from 'node:test';
import assert from 'node:assert/strict';
import type {Pool} from 'pg';
import {setAutomodEnabled,MAINTENANCE_MESSAGE} from './control-transition.js';

function fixture(enabled:boolean,failQueue=false){
 const calls:string[]=[];let queued=0,released=false;
 const c={release(){released=true;},async query(sql:string,args?:unknown[]){
  calls.push(sql);
  if(sql.startsWith('SELECT desired_enabled'))return {rows:[{desired_enabled:enabled}]};
  if(sql.startsWith('INSERT INTO rumble_send_queue')){if(failQueue)throw Error('offline');queued++;return {rowCount:1,rows:[{id:1}]};}
  if(sql.startsWith('INSERT INTO automod_control')){enabled=args?.[1]===true;return {rows:[{desired_enabled:enabled,updated_at:'now'}]};}
  return {rows:[]};
 }};
 return {pool:{connect:async()=>c} as unknown as Pool,calls,get queued(){return queued;},get released(){return released;}};
}
test('one stop announcement, no duplicate on repeated dashboard stops',async()=>{
 const f=fixture(true);
 assert.equal((await setAutomodEnabled(f.pool,1,false,2)).announcementQueued,true);
 assert.equal((await setAutomodEnabled(f.pool,1,false,2)).announcementQueued,false);
 assert.equal(f.queued,1);assert.ok(f.released);
 assert.ok(f.calls.some(s=>s.includes("lower(s.slug)='lecasinoze'")));
 assert.ok(MAINTENANCE_MESSAGE.length<=200);
});
test('starting never posts a maintenance announcement',async()=>{
 const f=fixture(false);await setAutomodEnabled(f.pool,1,true,2);assert.equal(f.queued,0);
});
test('chat failure does not prevent stop',async()=>{
 const f=fixture(true,true);const r=await setAutomodEnabled(f.pool,1,false,2);
 assert.equal(r.desired_enabled,false);assert.equal(r.announcementQueued,false);
 assert.ok(f.calls.includes('ROLLBACK TO SAVEPOINT announcement'));assert.ok(f.calls.includes('COMMIT'));
});
