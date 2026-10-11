import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionBuyAvailable} from './session-buy-availability.js';
import {modeVoteOptions} from './mode-vote-options.js';
test('availability follows Paris midnight in summer and winter',()=>{
 for(const [time,expected] of [
  ['2026-10-08T21:59:59Z',false],['2026-10-08T22:00:00Z',true],
  ['2026-10-10T21:59:59Z',true],['2026-10-10T22:00:00Z',false],
  ['2026-12-03T22:59:59Z',false],['2026-12-03T23:00:00Z',true],
  ['2026-12-05T22:59:59Z',true],['2026-12-05T23:00:00Z',false],
 ] as const)assert.equal(sessionBuyAvailable(new Date(time)),expected,time);
});
test('legacy polls and duplicates cannot expose purchase mode',()=>{
 assert.deepEqual(modeVoteOptions({options:['automod','auto-hunt','session-buy','provider-challenge','provider-challenge','unknown']}),['automod','auto-hunt','provider-challenge']);
 assert.deepEqual(modeVoteOptions(null),['automod','auto-hunt']);
 assert.deepEqual(modeVoteOptions({options:['session-buy']}),['automod','auto-hunt']);
});
