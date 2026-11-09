import test from 'node:test';import assert from 'node:assert/strict';
import {monthRange,maskName,ranking,racePanel,RACE_TITLE} from './rainbet-race.js';
test('month range covers the whole UTC month, end included',()=>{
  const r=monthRange(new Date('2026-11-09T12:00:00Z'));assert.equal(r.start,'2026-11-01');assert.equal(r.end,'2026-11-30');assert.equal(r.endsAt.toISOString(),'2026-12-01T00:00:00.000Z');
  const p=monthRange(new Date('2026-01-15T00:00:00Z'),-1);assert.equal(p.start,'2025-12-01');assert.equal(p.end,'2025-12-31');});
test('usernames are masked',()=>{assert.equal(maskName('Player123'),'Pl****3');assert.equal(maskName('ab'),'a**');});
test('prizes go to the top 5 only above the minimum wager',()=>{
  const r=ranking([{username:'a',wagered:5000},{username:'b',wagered:999},{username:'c',wagered:0},{username:'d',wagered:2000}]);
  assert.deepEqual(r.map(e=>[e.username,e.rank,e.prize]),[['a',1,60],['d',2,40],['b',3,0]]);});
test('empty race still renders a panel with its image',async()=>{const p=await racePanel([],[],new Date('2026-11-09T00:00:00Z'));assert.equal(p.embeds[0].data.title,RACE_TITLE);assert.equal(p.embeds[0].data.image?.url,'attachment://wager-race.png');assert.equal(p.files.length,1);});
