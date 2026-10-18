import test from 'node:test';
import assert from 'node:assert/strict';
import {authenticatedBotKey,externalChatEvent,eventKey,command} from './policy.js';
const input={platform:'kick',channelId:'24912362',messageId:'message-1',userId:'123',username:'Alice',text:'!call Rip City',streamerSlug:'lecasinoze'};
test('multichat requires an existing internal credential and fails closed without configuration',()=>{
  assert.equal(authenticatedBotKey('fixture',['fixture']),true);
  assert.equal(authenticatedBotKey('wrong',['fixture']),false);
  assert.equal(authenticatedBotKey('',[undefined,'']),false);
});
test('only LeCasiNoze Kick/Twitch events with verified identifiers can enter',()=>{
  assert.equal(externalChatEvent(input).platform,'kick');
  for(const bad of [{...input,platform:'rumble'},{...input,streamerSlug:'other'},{...input,userId:''},{...input,messageId:'../bad'},{...input,text:'a'.repeat(2001)}])assert.throws(()=>externalChatEvent(bad));
});
test('claims bind platform, channel and provider message ID, not mutable display names',()=>{
  const first=externalChatEvent(input);
  assert.equal(eventKey(first),eventKey(externalChatEvent({...input,username:'Renamed'})));
  assert.notEqual(eventKey(first),eventKey(externalChatEvent({...input,platform:'twitch',channelId:'535777475'})));
  assert.throws(()=>externalChatEvent({...input,channelId:'43'}));
});
test('only viewer call, Discord and ping commands are dispatched',()=>{
  assert.deepEqual(command(externalChatEvent(input)),{name:'call',arg:'Rip City'});
  for(const text of ['!resetc','!pass','!pay 100','!mcall Mental','!bonus'])assert.equal(command(externalChatEvent({...input,text})),null);
  assert.deepEqual(command(externalChatEvent({...input,text:'!discord'})),{name:'discord',arg:''});
});
test('external role, local user IDs and claimed moderation privileges are discarded',()=>{
  const event=externalChatEvent({...input,actorRole:'admin',actorUserId:1,canMod:true});
  assert.equal('actorRole' in event,false);assert.equal('actorUserId' in event,false);assert.equal('canMod' in event,false);
});
