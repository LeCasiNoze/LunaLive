import test from 'node:test';
import assert from 'node:assert/strict';
import {publicRelayText} from '../src/nozecoins/relay.js';
test('relay preserves public author attribution and excludes bots and commands',()=>{
 assert.equal(publicRelayText('Alice','Salut tout le monde',9,8),'Alice: Salut tout le monde');
 for(const body of ['!claim',' !call x','/slot',''])assert.equal(publicRelayText('Alice',body,9,8),null);
 assert.equal(publicRelayText('Alice','hello',8,8),null);
 assert.equal(publicRelayText('LunaBot','hello',9,8),null);
 assert.equal(publicRelayText('NozeBot','hello',9,8),null);
});
test('relay removes control characters and respects Rumble length',()=>{
 assert.equal(publicRelayText('Ali\nce','a\nb',9,8),'Alice: a b');
 const long=publicRelayText('Alice','a'.repeat(300),9,8)!;assert.equal(long.length,200);assert.ok(long.endsWith('…'));
});
