import test from 'node:test';
import assert from 'node:assert/strict';
import {isDedicatedRelayEcho,relayDisplayBody} from './rumble-echo.js';
import {parseBangCommand} from '../calls/commands.js';
test('a dedicated relay help message cannot become another call',()=>{
  const text='!call !mcall !discord - Guide';
  assert.equal(parseBangCommand(text)?.cmd,'call');
  assert.equal(isDedicatedRelayEcho('LunaLive_Bot','lunalive_bot','lecasinoze'),true);
  assert.equal(isDedicatedRelayEcho('LunaLive_Bot123','lunalive_bot','lecasinoze'),false);
  assert.equal(isDedicatedRelayEcho('Viewer','lunalive_bot','lecasinoze'),false);
});
test('shared broadcaster credentials and unknown bot identities do not mute human commands',()=>{
  assert.equal(isDedicatedRelayEcho('LeCasiNoze','LeCasiNoze','lecasinoze'),false);
  assert.equal(isDedicatedRelayEcho('Viewer','','lecasinoze'),false);
});
test('display-only responses cannot execute a command, including on old workers',()=>{
 assert.equal(parseBangCommand(relayDisplayBody('!call !discord — Guide')!),null);
 assert.equal(relayDisplayBody('[Twitch] Alice : hello'),null);
 assert.equal(relayDisplayBody('@Alice — Rain validée'),'🤖 @Alice — Rain validée');
});
