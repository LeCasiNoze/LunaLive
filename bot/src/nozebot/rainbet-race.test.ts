import test from 'node:test';import assert from 'node:assert/strict';
import {weekRange,maskName,ranking,racePanel,RACE_TITLE} from './rainbet-race.js';
test('week runs Monday to Sunday included and closes Monday 00:00 UTC',()=>{
  for(const at of ['2026-11-09T00:00:00Z','2026-11-12T10:00:00Z','2026-11-15T23:59:59Z']){const r=weekRange(new Date(at));assert.equal(r.start,'2026-11-09');assert.equal(r.end,'2026-11-15');assert.equal(r.endsAt.toISOString(),'2026-11-16T00:00:00.000Z');assert.equal(r.label,'semaine du 9 au 15 novembre');}
  const p=weekRange(new Date('2026-11-09T08:00:00Z'),-1);assert.equal(p.start,'2026-11-02');assert.equal(p.end,'2026-11-08');
  assert.equal(weekRange(new Date('2026-12-01T00:00:00Z')).label,'semaine du 30 novembre au 6 décembre');});
test('usernames are masked',()=>{assert.equal(maskName('Player123'),'Pl****3');assert.equal(maskName('ab'),'a**');});
test('prizes go to the top 3 only above the minimum wager',()=>{
  const r=ranking([{username:'a',wagered:5000},{username:'b',wagered:999},{username:'c',wagered:0},{username:'d',wagered:2000}]);
  assert.deepEqual(r.map(e=>[e.username,e.rank,e.prize]),[['a',1,75],['d',2,50],['b',3,0]]);});
test('empty race still renders a panel with its image',async()=>{const p=await racePanel([],[],new Date('2026-11-09T00:00:00Z'));assert.equal(p.embeds[0].data.title,RACE_TITLE);assert.equal(p.embeds[0].data.image?.url,'attachment://wager-race.png');assert.equal(p.files.length,1);});
