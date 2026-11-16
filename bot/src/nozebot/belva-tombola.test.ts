import test from 'node:test';
import assert from 'node:assert/strict';
import {pickWinners} from './belva-tombola.js';

test('tombola draw is weighted by tickets, skips ineligible members and never picks twice',()=>{
  const tickets=[{discord_id:'a',n:1},{discord_id:'b',n:5},{discord_id:'c',n:3}];
  assert.deepEqual(pickWinners(tickets,2,id=>id!=='c',()=>0),['a','b']);
  assert.deepEqual(pickWinners(tickets,2,()=>true,max=>max-1),['c','b']);
  assert.deepEqual(pickWinners(tickets,5,()=>true,()=>0),['a','b','c']);
  assert.deepEqual(pickWinners(tickets,2,()=>false),[]);
});
