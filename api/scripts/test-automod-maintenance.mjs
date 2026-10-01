import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateCallMinutes,automodCallWaitSuffix} from '../dist/calls/automod_eta.js';
import {sessionCallCount} from '../dist/calls/automod_session_count.js';
test('ETA includes active slot once, subtracts elapsed time and freezes recovery time',()=>{
 const common={durationMs:420000,deadlineAt:600000,pausedAt:null,now:300000};
 assert.equal(estimateCallMinutes({...common,callsAhead:1,currentIncluded:true}),5);
 assert.equal(estimateCallMinutes({...common,callsAhead:2,currentIncluded:true}),12);
 assert.equal(estimateCallMinutes({...common,callsAhead:1,currentIncluded:false}),12);
 assert.equal(estimateCallMinutes({...common,callsAhead:1,currentIncluded:true,pausedAt:180000}),7);
 assert.equal(estimateCallMinutes({...common,callsAhead:1,currentIncluded:true,now:700000}),0);
});
test('ordinary mode and stale runtime keep the original confirmation unchanged',async()=>{
 for(const row of [{desired_enabled:false},{desired_enabled:true,runtime_status:{phase:'running'},runtime_seen_at:'2000-01-01'}]){
  assert.equal(await automodCallWaitSuffix({query:async()=>({rows:[row]})},1,'3'),'');
 }
});
test('call total uses immutable admission history and initial queue, not current pending size',async()=>{
 let queries=0;
 const pool={query:async()=>({rows:++queries===1?[{payload:{initialCallCount:3,callCount:10}}]:[{count:9}]})};
 assert.deepEqual(await sessionCallCount(pool,1,'session-id','2026-10-01'),{initialCallCount:3,callCount:12});
});
