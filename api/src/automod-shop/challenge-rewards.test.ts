import test from 'node:test';
import assert from 'node:assert/strict';
import {challengeRewardTerms,challengeReward} from './challenge-rewards.js';

test('early camps earn 1000 / 250, draw 500, no stake required',()=>{
 const terms=challengeRewardTerms(0,0,0);
 assert.equal(challengeReward(terms,'hacksaw','hacksaw',0).total,1000);
 assert.equal(challengeReward(terms,'hacksaw','pragmatic',0).total,250);
 assert.equal(challengeReward(terms,'hacksaw',null,0).total,500);
});
test('late arrival and a visible lead reduce the victory reward',()=>{
 const tied=challengeRewardTerms(3600000,0,0),leading=challengeRewardTerms(3600000,128.2,27.4);
 assert.equal(challengeReward(tied,'hacksaw','hacksaw',0).total,500);
 assert.ok(challengeReward(leading,'hacksaw','hacksaw',0).total<500);
 assert.equal(challengeRewardTerms(3600000,27.4,128.2).certaintyBps,10000);
 assert.equal(challengeReward(challengeRewardTerms(7200000,0,0),'hacksaw','hacksaw',0).total,0);
});
test('confirmed contribution earns 5 points per score, capped at 500, even in losing camp',()=>{
 const terms=challengeRewardTerms(0,0,0);
 assert.deepEqual(challengeReward(terms,'hacksaw','pragmatic',2740),{participation:250,contribution:137,total:387});
 assert.equal(challengeReward(terms,'hacksaw','hacksaw',100000).total,1500);
 assert.throws(()=>challengeReward(terms,'hacksaw',null,-1));
 assert.throws(()=>challengeRewardTerms(NaN,0,0));
});
