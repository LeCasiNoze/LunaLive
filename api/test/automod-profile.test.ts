import test from 'node:test';
import assert from 'node:assert/strict';
import {levelForXp,discountedPoints} from '../src/automod-shop/profile.js';
import {bonusRebatePoints} from '../src/automod-shop/rules.js';
test('level boundaries, discount cap, and invalid inputs',()=>{
 assert.deepEqual(levelForXp(0),{level:1,discountPercent:0,nextLevelXp:500});
 assert.equal(levelForXp(499).level,1);assert.equal(levelForXp(500).level,2);
 assert.equal(levelForXp(1999).level,2);assert.equal(levelForXp(2000).level,3);
 assert.deepEqual(levelForXp(50000),{level:11,discountPercent:10,nextLevelXp:null});
 assert.equal(levelForXp(10000000).discountPercent,10);
 for(const n of [-1,NaN,Infinity,2.2])assert.throws(()=>levelForXp(n));
});
test('rounding never gives a larger discount; rebates use paid price',()=>{
 for(let price=1;price<=10000;price+=13)for(let d=0;d<=10;d++){
  const net=discountedPoints(price,d);assert.ok(Number.isInteger(net)&&net<=price&&net>=price*(1-d/100));
  assert.equal(bonusRebatePoints(net,3000,1000),Math.floor(net*1.1));
 }
 assert.equal(discountedPoints(875,10),788);
 for(const d of [-1,11,NaN,1.5])assert.throws(()=>discountedPoints(500,d));
});
