import test from 'node:test';
import assert from 'node:assert/strict';
import {providerPassScore,nextChallengeProvider,canFinishChallenge,remainingPassMs,selectSessionPurchase,assertShopContext,parisEventDay} from './event-rules.js';
test('20 euro profit is 40 score points, plus natural and highest spectacle tier only',()=>{
 assert.equal(providerPassScore({spentCents:5000,returnedCents:7000,naturalBonuses:2,bestMultiplier:500}).score,70);
 assert.equal(providerPassScore({spentCents:5000,returnedCents:3000,naturalBonuses:0,bestMultiplier:0}).score,-40);
 assert.equal(providerPassScore({spentCents:101,returnedCents:100,naturalBonuses:0,bestMultiplier:0}).score,-0.02);
});
test('blocks of three, no early finish at two hours while providers are unequal or bonus running',()=>{
 assert.deepEqual(Array.from({length:6},(_,i)=>nextChallengeProvider(i)),['pragmatic','pragmatic','pragmatic','hacksaw','hacksaw','hacksaw']);
 const base={elapsedMs:7_200_000,pragmaticPasses:6,hacksawPasses:4,bonusActive:false,passActive:false};
 assert.equal(canFinishChallenge(base),false);
 assert.equal(canFinishChallenge({...base,hacksawPasses:6,bonusActive:true}),false);
 assert.equal(canFinishChallenge({...base,hacksawPasses:6}),true);
 assert.equal(remainingPassMs(240000,90000),150000);
});
test('40 cent session chooses 40-50 euro Bounty, never 200 euro premium',()=>{
 const offers=[{id:'normal',kind:'classic' as const,costCents:2000,stakeCents:20,verified:true},{id:'bounty',kind:'bounty' as const,costCents:5000,stakeCents:20,verified:true},{id:'premium',kind:'other' as const,costCents:20000,stakeCents:40,verified:true}];
 assert.equal(selectSessionPurchase('hacksaw',40,offers)?.id,'bounty');
 assert.equal(selectSessionPurchase('pragmatic',40,[...offers,{id:'p40',kind:'classic',costCents:4000,stakeCents:40,verified:true}])?.id,'p40');
 assert.equal(selectSessionPurchase('hacksaw',10,offers),null);
 assert.equal(selectSessionPurchase('hacksaw',40,offers.map(o=>({...o,verified:false}))),null);
});
test('mode changes and prohibited purchases reject before any wallet mutation',()=>{
 assert.throws(()=>assertShopContext('old','new','automod','raise'),/context_changed/);
 for(const feature of ['bonus','extend','upgrade-one-purchase'] as const)assert.throws(()=>assertShopContext('same','same','provider-challenge',feature),/unavailable/);
 assert.doesNotThrow(()=>assertShopContext('same','same','provider-challenge','raise'));
 assert.doesNotThrow(()=>assertShopContext('same','same','session-buy','upgrade-one-purchase'));
 assert.throws(()=>assertShopContext('same','same','auto-hunt','extend',true));
});
test('Tuesday/Friday eligibility follows Paris midnight in summer and winter',()=>{
 assert.equal(parisEventDay(new Date('2026-10-05T21:59:59Z')).active,false);
 assert.deepEqual(parisEventDay(new Date('2026-10-05T22:00:00Z')),{key:'2026-10-06',month:'2026-10',active:true});
 assert.equal(parisEventDay(new Date('2026-10-06T22:00:00Z')).active,false);
 assert.equal(parisEventDay(new Date('2026-11-02T22:59:59Z')).active,false);
 assert.equal(parisEventDay(new Date('2026-11-02T23:00:00Z')).active,true);
});
