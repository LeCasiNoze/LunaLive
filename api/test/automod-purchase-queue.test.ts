import test from 'node:test';import assert from 'node:assert/strict';
import {requirePurchaseSlotAvailable} from '../src/automod-shop/purchase-queue.js';
for(const rowCount of [0,1])test('purchase refuses queued machine regardless of caller: '+rowCount,async()=>{
 const db={query:async(sql:string,args:unknown[])=>{assert.match(sql,/SELECT 1 FROM calls_queue/);assert.doesNotMatch(sql,/rumble_user_id/);assert.deepEqual(args,[7,'wanted']);return {rowCount};}};
 if(rowCount)await assert.rejects(()=>requirePurchaseSlotAvailable(db,7,'wanted'),/buy_slot_already_waiting/);
 else await requirePurchaseSlotAvailable(db,7,'wanted');
});
