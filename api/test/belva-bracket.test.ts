import test from 'node:test';
import assert from 'node:assert/strict';
import {applyGain,computeBracket,type Leg} from '../src/belva_bracket_engine.js';

const play=(draw:string[],gains:number[])=>{let legs:Record<string,Leg[]>={};for(const g of gains){const r=applyGain(draw,legs,g);assert.ok(r);legs=r.legs;}return legs;};

test('5 players: 8-slot bracket, byes go straight to round 2, sequence A then B',()=>{
  const draw=['p1','p2','p3','p4','p5'];
  const b=computeBracket(draw,{});
  assert.equal(b.size,8);assert.equal(b.rounds,3);
  assert.deepEqual(b.matches.filter(m=>m.round===1).map(m=>[m.a,m.b,m.status]),[['p1','p5','ready'],['p2',null,'bye'],['p3',null,'bye'],['p4',null,'bye']]);
  assert.deepEqual(b.current,{key:'1-0',leg:0,side:'a',player:'p1',opponent:'p5'});
  const legs=play(draw,[100]);
  assert.equal(computeBracket(draw,legs).current?.player,'p5');
});

test('a tie rebuys both bonuses; the bigger win goes through',()=>{
  const draw=['a','b','c','d'];
  const legs=play(draw,[0,0,50,40]);
  const m=computeBracket(draw,legs).matches.find(m=>m.key==='1-0')!;
  assert.equal(m.legs.length,2);assert.equal(m.winner,'a');assert.equal(m.loser,'c');
});

test('final is best of 3 on the same slots, places: 1, 2, then 3rd ex aequo',()=>{
  const draw=['a','b','c','d'];
  // demi 1 : a bat c ; demi 2 : d bat b ; finale : a 10/20, puis 30/5, puis 50/1 -> a 2-1
  const legs=play(draw,[10,5, 1,2, 10,20, 30,5, 50,1]);
  const br=computeBracket(draw,legs);
  assert.equal(br.champion,'a');assert.equal(br.current,null);
  assert.deepEqual(br.places,{b:3,c:3,d:2,a:1});
  assert.equal(br.matches.find(m=>m.round===2)!.legs.length,3);
});

test('correcting an earlier gain replays the rest of the bracket',()=>{
  const draw=['a','b','c','d'];
  const legs=play(draw,[10,5, 1,2]);
  const fixed={...legs,'1-0':[{a:1,b:5}]};
  const br=computeBracket(draw,fixed);
  assert.equal(br.matches.find(m=>m.key==='2-0')!.a,'c');
});
