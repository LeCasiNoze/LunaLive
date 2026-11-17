import test from 'node:test';
import assert from 'node:assert/strict';
import {cappedLevel,rankText,topCard} from './belva-xp.js';

test('XP grades: Rubis and above need a verified deposit, otherwise capped at Or V',()=>{
  assert.match(cappedLevel(30_000,true)!.label,/Rubis/);
  assert.match(cappedLevel(30_000,false)!.label,/Or V$/);
  assert.match(cappedLevel(500,false)!.label,/Bronze/);
  assert.equal(cappedLevel(0,true),null);
});

test('/rang tells the place, the XP and what is left for the next tier',()=>{
  assert.match(rankText(47,212,1_930),/47ᵉ\*\* sur 212 · \*\*1.930 XP\*\* · 🥉 Bronze IV/);
  assert.match(rankText(0,0,0),/pas encore d’XP/);
  assert.equal(JSON.stringify(topCard([])).includes('Personne'),true);
});
