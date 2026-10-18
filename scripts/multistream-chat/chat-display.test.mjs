import test from 'node:test';
import assert from 'node:assert/strict';
import {compactBotReply} from './chat-display.mjs';
import {Store} from './store.mjs';
import {RelayWorker} from './worker.mjs';

test('compact English bot replies preserve native usernames and slot titles',()=>{
  assert.equal(compactBotReply('🎰 Call ajouté : "Dork Unit" (hacksaw gaming) — @LeCasiNoze — dans ~4 min'),'Added: "Dork Unit" (hacksaw gaming) — @LeCasiNoze · ETA ~4 min');
  assert.equal(compactBotReply('@SomeTwitchUser — Machine introuvable : Essaie un nom plus précis.'),'@SomeTwitchUser — Game not found. Use its full name.');
  assert.equal(compactBotReply('📋 Calls: aucun call en file.'),'Queue empty.');
});

test('an existing Kick Discord response prevents a second answer, without mirroring BotRix',async()=>{
  const store=new Store(':memory:');let sends=0;
  const worker=new RelayWorker({store,apis:{kick:{send:async()=>{sends++;return 'sent';}}}});
  try{
    store.enqueueBot('discord','kick','Discord: https://discord.gg/fUjnwHkZUw');
    assert.equal((await worker.receive({platform:'kick',username:'BotRix',text:'Rejoignez notre discord ! https://discord.gg/36TMsTNxJD'})).accepted,false);
    store.db.prepare('UPDATE outbox SET due=0').run();await worker.send();
    assert.equal(sends,0);assert.equal(store.db.prepare('SELECT status FROM outbox').get().status,'ignored');
  }finally{store.close();}
});
test('Discord still sends when the existing Kick bot does not answer',async()=>{
  const store=new Store(':memory:');let sends=0;
  const worker=new RelayWorker({store,apis:{kick:{send:async()=>{sends++;return 'sent';}}}});
  try{
    store.enqueueBot('discord','kick','Discord: https://discord.gg/fUjnwHkZUw');
    store.db.prepare('UPDATE outbox SET due=0').run();await worker.send();
    assert.equal(sends,1);assert.equal(store.db.prepare('SELECT status FROM outbox').get().status,'done');
  }finally{store.close();}
});
test('Discord is concise and help advertises only supported cross-chat commands',()=>{
  assert.equal(compactBotReply('Rejoins notre Discord : https://discord.gg/fixture'),'Discord: https://discord.gg/fixture');
  assert.equal(compactBotReply('!call !mcall !music !discord — Guide : https://example.com'),'Commands: !call game · !listec · !discord · !site');
});
test('internal UI prompts are excluded and unknown text is not invented',()=>{
  assert.equal(compactBotReply('🌧️ Rain en cours ! [RAIN_OPEN] clique sur le toast'),null);
  assert.equal(compactBotReply('🌧️ Rain terminée : aucun participant.'),null);
  assert.equal(compactBotReply('✅ Rain terminée : aucun participant.'),null);
  assert.equal(compactBotReply('A factual message.'),'A factual message.');
});
test('bot duplicates share a durable short cooldown, preserving human messages and destinations',()=>{
  const store=new Store(':memory:');
  try{
    assert.equal(store.enqueueBot('a','kick','Discord: link'),true);
    assert.equal(store.enqueueBot('b','kick','Discord: link'),false);
    assert.equal(store.enqueueBot('c','twitch','Discord: link'),true);
    assert.equal(store.enqueue('human','kick','Discord: link'),true);
    assert.equal(store.enqueueBot('d','kick','Discord: link',Date.now()+21_000),true);
  }finally{store.close();}
});
