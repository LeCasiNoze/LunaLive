import test from 'node:test';
import assert from 'node:assert/strict';
import {priceOption} from './belva-tournament.js';
import {levelFor,levelThresholds,seasonScore,SEASON_EXAMPLE} from './belva-progress-designs.js';

test('every bonus costs about the same buy price: the bet follows the buy multiplier',()=>{
  assert.deepEqual(priceOption('duel','Duel',200,12000),{id:'duel',label:'Duel',multiplier:200,betCents:60,costCents:12000});
  assert.deepEqual(priceOption('dead','Dead',400,12000),{id:'dead',label:'Dead',multiplier:400,betCents:30,costCents:12000});
  assert.equal(priceOption('x','x',333,12000).betCents,40);
  assert.equal(priceOption('x','x',333,12000).costCents,13320);
  assert.deepEqual(priceOption('b','Bounty',null,12000),{id:'b',label:'Bounty',multiplier:null,betCents:null,costCents:12000});
});

test('season: showing up every week beats a single win',()=>{
  const max=SEASON_EXAMPLE.rows.find(r=>r.name==='Mise_Max')!,sam=SEASON_EXAMPLE.rows.find(r=>r.name==='Spin_Sam')!;
  assert.equal(seasonScore(max,4),40+0+10+10+15+10);
  assert.equal(seasonScore(sam,4),25);
  assert.equal(seasonScore({name:'x',places:[9,9,9,9]},4),50);
});

test('grades have 5 increasing sub-levels each',()=>{
  const all=levelThresholds();assert.equal(all.length,35);
  for(let k=1;k<all.length;k++)assert.ok(all[k]!.xp>all[k-1]!.xp);
  assert.equal(levelFor(0),null);
  assert.match(levelFor(300)!.label,/Bronze I$/);
  assert.match(levelFor(9_000)!.label,/Or I$/);
  assert.match(levelFor(260_000)!.label,/Obsidienne V$/);
});
