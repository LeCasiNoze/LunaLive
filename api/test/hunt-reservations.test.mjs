import assert from 'node:assert/strict';
import test from 'node:test';
import {huntSlotReserved} from '../dist/calls/automod_hunt_reservations.js';
test('call guard reserves pending and opening only, scoped to streamer and canonical slot',async()=>{
 const client={query:async(sql,args)=>{
  assert.match(sql,/status IN \('pending','opening'\)/);
  assert.match(sql,/streamer_id=\$1 AND slot_key=\$2/);
  assert.deepEqual(args,[77,'lifeanddeath']);
  return {rowCount:0};
 }};
 assert.equal(await huntSlotReserved(client,77,'Life and Death'),false);
 assert.equal(await huntSlotReserved({query:async()=>({rowCount:1})},77,'Life and Death'),true);
});
