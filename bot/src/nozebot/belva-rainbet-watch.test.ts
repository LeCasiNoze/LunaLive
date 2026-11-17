import test from 'node:test';
import assert from 'node:assert/strict';
import {wagerSignals} from './belva-rainbet-watch.js';

test('wager history: first reading sets the base, then a jump of 30 $ or more is a deposit signal',()=>{
  assert.deepEqual(wagerSignals(new Map(),[{username:'Seyli92',wagered:27}],30).deposits,[]);
  const prev=new Map([['seyli92',27],['max',100]]);
  const r=wagerSignals(prev,[{username:'Seyli92',wagered:29},{username:'Max',wagered:160},{username:'New',wagered:45}],30);
  assert.deepEqual(r.changed.map(c=>[c.username,c.delta]),[['Seyli92',2],['Max',60],['New',45]]);
  assert.deepEqual(r.deposits.map(d=>d.username),['Max','New']);
  assert.deepEqual(wagerSignals(prev,[{username:'seyli92',wagered:27}],30).changed,[]);
});
