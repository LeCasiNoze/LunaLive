import {test} from 'node:test';
import assert from 'node:assert/strict';
import {messagePresentation} from '../src/components/chat/messagePresentation.ts';
import {normalizeOverlayMessage} from '../src/components/chat/overlayMessages.ts';

test('Twitch and Kick have distinct accents, without changing message text or mentions',()=>{
 const body='Salut @LeCasinoz';
 for(const platform of ['kick','twitch']){
  const m=normalizeOverlayMessage({id:1,userId:0,username:'Viewer',body,externalSource:platform,style:{msgColor:'#2EF2B3'}},'lecasinoze')!;
  assert.equal(m.body,body);assert.equal(messagePresentation(m).platform,platform);
  assert.equal(messagePresentation(m).textColor,'#2EF2B3');
 }
 assert.notEqual(messagePresentation({externalSource:'kick'}).accent,messagePresentation({externalSource:'twitch'}).accent);
});
test('history snake case and old bridge prefixes retain platform identity',()=>{
 const m=normalizeOverlayMessage({id:2,userId:0,body:'x',external_source:'kick'},'lecasinoze')!;
 assert.equal(messagePresentation(m).platform,'kick');
 assert.equal(messagePresentation({userId:0,body:'[Twitch] Viewer : hello'}).platform,'twitch');
 assert.equal(messagePresentation({userId:4,body:'[Twitch] not a source'}).platform,undefined);
});
test('invalid colors cannot become CSS and foreign channels are rejected',()=>{
 assert.equal(messagePresentation({msgColor:'url(https://invalid)'}).textColor,undefined);
 assert.equal(normalizeOverlayMessage({slug:'another',body:'x'},'lecasinoze'),null);
 assert.equal(messagePresentation({}).textColor,undefined);
});
