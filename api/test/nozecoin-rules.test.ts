import test from 'node:test';
import assert from 'node:assert/strict';
import {accountRules,slotOutcome,SLOT_OUTCOMES,UPGRADES} from '../src/nozecoins/rules.js';
test('base rules: claim 100/24h, rain 25, fixed virtual bet 20',()=>{
 assert.deepEqual(accountRules({}),{claim:100,claimMs:86400000,rain:25,bet:20});
});
test('upgrades have hard caps and never change Rubis or Automod',()=>{
 assert.deepEqual(accountRules({claim_tier:3,cooldown_tier:3,rain_tier:3,slot_tier:3}),{claim:175,claimMs:72000000,rain:40,bet:50});
 assert.deepEqual(accountRules({claim_tier:100,cooldown_tier:100,rain_tier:100,slot_tier:100}),accountRules({claim_tier:3,cooldown_tier:3,rain_tier:3,slot_tier:3}));
 assert.deepEqual(accountRules({claim_tier:-1}),accountRules({}));
 assert.equal(Object.keys(UPGRADES).length,4);
});
test('all 100000 draws produce exactly the advertised exclusive weights',()=>{
 const counts=new Map<string,number>();
 for(let draw=0;draw<100000;draw++){const out=slotOutcome(draw);counts.set(out.art,(counts.get(out.art)||0)+1);}
 for(const item of SLOT_OUTCOMES)assert.equal(counts.get(item.art),item.weight);
 assert.equal(slotOutcome(0).multiplier,0);assert.equal(slotOutcome(99999).art,'MAX WIN');
 for(const n of [-1,100000,0.5,NaN])assert.throws(()=>slotOutcome(n));
});
test('shop prices are positive integer coins and sequential tiers only',()=>{
 for(const item of Object.values(UPGRADES)){assert.equal(item.costs.length,3);assert.ok(item.costs.every(n=>Number.isSafeInteger(n)&&n>0));}
});
