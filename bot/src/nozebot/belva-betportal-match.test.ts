import test from 'node:test';
import assert from 'node:assert/strict';
import {parisToDate,readDepositScreen} from './belva-betportal-match.js';

test('screen time is read as Paris time (winter and summer)',()=>{
  assert.equal(parisToDate('2026-11-16 22:30')!.toISOString(),'2026-11-16T21:30:00.000Z');
  assert.equal(parisToDate('2026-07-10 12:00')!.toISOString(),'2026-07-10T10:00:00.000Z');
  assert.equal(parisToDate('pas une date'),null);
});

test('without an API key the screen is not read (no call made)',async()=>{
  const saved=process.env.ANTHROPIC_API_KEY;delete process.env.ANTHROPIC_API_KEY;
  assert.equal(await readDepositScreen(Buffer.from(''),'image/png'),null);
  if(saved)process.env.ANTHROPIC_API_KEY=saved;
});
