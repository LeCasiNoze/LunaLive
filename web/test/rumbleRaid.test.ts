import test from 'node:test';
import assert from 'node:assert/strict';
import {raidCommand,raidError,raidQueryUrl} from '../src/lib/rumbleRaid.js';
test('slash raid opens a private picker and accepts channel searches or full URLs',()=>{
 assert.deepEqual(raidCommand('/raid'),{query:''});assert.deepEqual(raidCommand('/RAID Foo'),{query:'Foo'});
 assert.deepEqual(raidCommand('/raid https://rumble.com/v7abcde.html'),{query:'https://rumble.com/v7abcde.html'});
 for(const message of ['!raid','bonjour /raid','/raider','/raidtest'])assert.equal(raidCommand(message),null);
});
test('uncertain raids ask for verification rather than claiming success',()=>{
 assert.match(raidError('raid_uncertain'),/Vérifie le chat Rumble/);assert.match(raidError('source_offline'),/Aucun live/);
});
test('pasted Rumble URLs can be selected even outside the loaded directory page',()=>{
 assert.equal(raidQueryUrl('https://rumble.com/v7abcde-other.html?source=chat'),'https://rumble.com/v7abcde-other.html');
 assert.equal(raidQueryUrl('https://rumble.com.evil.test/v7abcde.html'),null);
 assert.equal(raidQueryUrl('Chaîne A'),null);
});
