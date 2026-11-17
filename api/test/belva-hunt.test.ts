import test from 'node:test';
import assert from 'node:assert/strict';
import {huntStats} from '../src/belva_hunt.js';

test('hunt stats follow the Hunt tool: BE = start / total bet, remaining BE = money left / bets left',()=>{
  const it=(slot:string,bet:number|null,pay:number|null,bonus=true)=>({id:slot,slot,caller:'x',bet,pay,bonus,pos:0});
  const list=[it('A',2,300),it('B',2,null),it('C',1,null),it('farm',null,null,false)];
  const s=huntStats(list,500);
  assert.equal(s.count,3);assert.equal(s.left,2);assert.equal(s.beStart,100);
  assert.equal(s.beNow,(500-300)/3);assert.equal(s.next?.slot,'B');
  assert.equal(huntStats([it('A',2,600)],500).beNow,0);
});
