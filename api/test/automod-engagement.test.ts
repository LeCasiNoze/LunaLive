import {test} from 'node:test';import assert from 'node:assert/strict';
import {predictionPayouts,predictionStats,validPredictionPoints,parisVoteCheckpoint} from '../src/automod-shop/engagement-rules.js';
import {purchaseCertainlyNotSent} from '../src/automod-shop/runtime.js';
test('Payout totals across 1000 markets: two camps share pot, sole winners receive x1.5',()=>{
 for(let seed=1;seed<=1000;seed++){
  const bets=Array.from({length:2+seed%50},(_,i)=>({userId:String(i),choice:((seed+i)%3?'yes':'no') as 'yes'|'no',points:10*((seed*17+i*13)%50+1)}));
  for(const winner of ['yes','no',null] as const){const result=predictionPayouts(bets,winner);const pot=bets.reduce((s,b)=>s+b.points,0),twoCamps=bets.some(b=>b.choice==='yes')&&bets.some(b=>b.choice==='no'); const expected=winner===null||twoCamps?pot:bets[0]?.choice===winner?pot*1.5:0;assert.equal(result.payouts.reduce((s,b)=>s+b.points,0),expected);assert.ok(result.payouts.every(b=>Number.isSafeInteger(b.points)&&b.points>=0));}
 }
});
test('One camp pays winners x1.5 and odds follow points rather than people',()=>{
 const bets=[{userId:'1',choice:'yes' as const,points:10},{userId:'2',choice:'no' as const,points:500}];
 const stats=predictionStats(bets);assert.equal(stats.yesVotes,1);assert.equal(stats.noVotes,1);assert.equal(stats.yesOdds,51);assert.equal(stats.noOdds,1.02);
 assert.deepEqual(predictionPayouts(bets.slice(0,1),'yes'),{refund:false,payouts:[{userId:'1',points:15}]});
 assert.deepEqual(predictionPayouts(bets.slice(0,1),'no'),{refund:false,payouts:[]});
 assert.deepEqual(predictionPayouts(bets.slice(0,1),null),{refund:true,payouts:[{userId:'1',points:10}]});
 assert.equal(predictionStats(bets.slice(0,1)).yesOdds,1.5);
 assert.deepEqual(predictionPayouts(bets.slice(1),'no'),{refund:false,payouts:[{userId:'2',points:750}]});
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

test('short prediction commands round to nearest ten and reject malformed or out-of-range stakes',async()=>{
 const {parsePredictionCommand}=await import('../src/automod-shop/engagement-rules.js');
 assert.deepEqual(parsePredictionCommand('!oui 63'),{error:false,choice:'yes',points:60});
 assert.deepEqual(parsePredictionCommand('!non 65'),{error:false,choice:'no',points:70});
 assert.deepEqual(parsePredictionCommand('!pari oui 100'),{error:false,choice:'yes',points:100});
 for(const text of ['!oui','!non abc','!oui 0','!oui 501','!oui -20'])assert.deepEqual(parsePredictionCommand(text),{error:true});
 assert.equal(parsePredictionCommand('!points'),null);
});
