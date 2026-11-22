import assert from 'node:assert/strict';
import {test} from 'node:test';
import {publicRace} from './rainbet-race.js';

test('public race masks names, ranks and keeps only aggregate data', () => {
  const now = new Date('2026-11-22T10:00:00Z');
  const out = publicRace([{username:'BelvaaaTV',wagered:2500.555},{username:'Nicozap7339',wagered:800},{username:'zz',wagered:0}],[{username:'PIAILLE',wagered:3000}],now);
  assert.equal(out.race.start,'2026-11-16'); assert.equal(out.race.end,'2026-12-15');
  assert.deepEqual(out.leaderboard.map(e=>[e.rank,e.name,e.prize]),[[1,'Be****V',100],[2,'Ni****9',0]]);
  assert.equal(out.players,2); assert.equal(out.totalWageredUsd,3301);
  assert.ok(!JSON.stringify(out).includes('BelvaaaTV'));
});
