import {test} from 'node:test';import assert from 'node:assert/strict';
import {predictionPayouts,predictionStats,validPredictionPoints,parisVoteCheckpoint} from '../src/automod-shop/engagement-rules.js';
import {purchaseCertainlyNotSent} from '../src/automod-shop/runtime.js';
test('Pot conserved across 1000 deterministic markets, every cap and imbalance',()=>{
 for(let seed=1;seed<=1000;seed++){
  const bets=Array.from({length:2+seed%50},(_,i)=>({userId:String(i),choice:((seed+i)%3?'yes':'no') as 'yes'|'no',points:10*((seed*17+i*13)%50+1)}));
  for(const winner of ['yes','no',null] as const){const result=predictionPayouts(bets,winner);assert.equal(result.payouts.reduce((s,b)=>s+b.points,0),bets.reduce((s,b)=>s+b.points,0));assert.ok(result.payouts.every(b=>Number.isSafeInteger(b.points)&&b.points>=0));}
 }
});
test('One camp refunds and odds follow points rather than people',()=>{
 const bets=[{userId:'1',choice:'yes' as const,points:10},{userId:'2',choice:'no' as const,points:500}];
 const stats=predictionStats(bets);assert.equal(stats.yesVotes,1);assert.equal(stats.noVotes,1);assert.equal(stats.yesOdds,51);assert.equal(stats.noOdds,1.02);
 assert.equal(predictionPayouts(bets.slice(0,1),'yes').refund,true);
 for(const n of [0,1,64.2,9,501,510,Infinity])assert.equal(validPredictionPoints(n),false);
});
test('Paris schedules include daylight saving, exclude offline catchup windows',()=>{
 assert.equal(parisVoteCheckpoint(new Date('2026-10-04T08:00:00Z')),'2026-10-04:10');
 assert.equal(parisVoteCheckpoint(new Date('2026-12-04T09:00:00Z')),'2026-12-04:10');
 assert.equal(parisVoteCheckpoint(new Date('2026-10-04T12:00:00Z')),'2026-10-04:14');
 assert.equal(parisVoteCheckpoint(new Date('2026-10-04T18:00:00Z')),'2026-10-04:20');
 assert.equal(parisVoteCheckpoint(new Date('2026-10-04T08:15:00Z')),null);
});
test('Historical release requires explicit refusal before confirmation',()=>{
 assert.equal(purchaseCertainlyNotSent('SHOP_BUY_NOT_TRIGGERED: select: {"triggered":false,"error":"shop-control-not-unique-or-visible"}'),true);
 for(const value of ['timeout','SHOP_BUY_NOT_TRIGGERED: confirm: {"triggered":false}', 'SHOP_BUY_NOT_TRIGGERED: select: {"triggered":true,"error":"shop-control-not-unique-or-visible"}'])assert.equal(purchaseCertainlyNotSent(value),false);
});
