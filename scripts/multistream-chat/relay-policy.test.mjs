import test from 'node:test';
import assert from 'node:assert/strict';
import {planChatEvent} from './relay-policy.mjs';

const config = {streamerSlug:'lecasinoze',channels:{kick:'k',rumble:'r',twitch:'t'},
  botUserIds:{kick:['bot-k'],rumble:['bot-r'],twitch:['bot-t']},
  mirrorTargets:{kick:['rumble','twitch'],rumble:['kick','twitch'],twitch:['rumble','kick']}};
const event = {platform:'kick',channelId:'k',messageId:'m',userId:'42',username:'Alice',text:'!call Rip City'};

test('Kick call targets one shared command and a reply to the source', () => {
  const plan = planChatEvent(event, config);
  assert.equal(plan.command.name,'call');
  assert.equal(plan.command.argument,'Rip City');
  assert.equal(plan.command.streamerSlug,'lecasinoze');
  assert.equal(plan.command.replyTo.platform,'kick');
  assert.equal(plan.deliveries.length,1);
  assert.match(plan.deliveries[0].text,/^\[Kick\] Alice : !call/);
});
test('external chat is not merged into Twitch by default', () => {
  assert.equal(planChatEvent(event, config).deliveries.some(d=>d.platform==='twitch'),false);
});
test('bot echoes cannot retrigger a call', () => {
  assert.equal(planChatEvent({...event,userId:'bot-k'},config).ignored,true);
  assert.equal(planChatEvent({...event,origin:'relay'},config).ignored,true);
});
test('replayed events have a stable claim key, distinct providers remain distinct', () => {
  const first=planChatEvent(event,config);
  assert.equal(first.eventKey,planChatEvent({...event},config).eventKey);
  const other=planChatEvent({...event,platform:'twitch',channelId:'t'},config);
  assert.notEqual(first.eventKey,other.eventKey);
  assert.notEqual(first.externalIdentity,other.externalIdentity);
});
test('external nicknames and claimed roles never grant moderation privileges', () => {
  assert.equal(planChatEvent({...event,username:'admin',role:'admin'},config).command.actor.role,'viewer');
});
test('wrong streamer, wrong channel and missing bot identity are blocked', () => {
  assert.equal(planChatEvent(event,{...config,streamerSlug:'other'}).ignored,true);
  assert.equal(planChatEvent({...event,channelId:'other'},config).ignored,true);
  assert.equal(planChatEvent(event,{...config,botUserIds:{}}).ignored,true);
});
test('Discord command from Twitch can be handled locally and mirrored to Rumble', () => {
  const plan=planChatEvent({...event,platform:'twitch',channelId:'t',text:'!discord'},config);
  assert.equal(plan.command.name,'discord');
  assert.equal(plan.command.replyTo.platform,'twitch');
  assert.equal(plan.deliveries.some(d=>d.platform==='rumble'),true);
});
test('unknown privileged commands are not dispatched and unicode output remains bounded', () => {
  assert.equal(planChatEvent({...event,text:'!reset'},config).command,null);
  const plan=planChatEvent({...event,text:'🎉'.repeat(300)},config);
  assert.equal(Array.from(plan.deliveries[0].text).length,200);
  assert.equal(planChatEvent({...event,messageId:''},config).ignored,true);
});
