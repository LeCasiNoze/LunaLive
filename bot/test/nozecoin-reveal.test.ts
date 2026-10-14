import test from 'node:test';
import assert from 'node:assert/strict';
import {coinRevealFrames,revealCoinSlot} from '../src/nozebot/coin-reveal.js';
test('X ends suspense immediately, all remaining symbols are X',()=>{
 assert.deepEqual(coinRevealFrames('XXXXXX'),['[??? ???]','[XXX XXX]']);
 assert.deepEqual(coinRevealFrames('OOXXXX'),['[??? ???]','[O?? ???]','[OO? ???]','[OOX XXX]']);
});
test('six O, sevens and max win remain bracketed',()=>{
 assert.equal(coinRevealFrames('OOOOOO').at(-1),'[OOO OOO]');
 assert.equal(coinRevealFrames('777777').at(-1),'[777 777]');
 assert.equal(coinRevealFrames('MAX WIN').at(-1),'[MAX WIN]');
 assert.throws(()=>coinRevealFrames('bad'));
});
test('reveal edits one reply and never invokes a wallet action',async()=>{
 const edits:string[]=[];let waits=0;
 await revealCoinSlot(async text=>{edits.push(text);},'OOOXXX','FINAL',async()=>{waits++;});
 assert.equal(edits[0],'**[??? ???]**');assert.equal(edits.at(-1),'FINAL');assert.equal(waits,4);
});
