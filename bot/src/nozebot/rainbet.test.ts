import test from 'node:test';import assert from 'node:assert/strict';
import {findReferred} from './rainbet.js';
const users=[{username:'Player123',id:'abc'},{username:'noid',id:''}];
test('matches case-insensitively, trims spaces and a leading @',()=>{assert.equal(findReferred(users,'  @player123 ')?.id,'abc');});
test('no partial matches',()=>{assert.equal(findReferred(users,'player12'),null);assert.equal(findReferred(users,'player1234'),null);});
test('empty input and users without public id never match',()=>{assert.equal(findReferred(users,'  '),null);assert.equal(findReferred(users,'noid'),null);});
