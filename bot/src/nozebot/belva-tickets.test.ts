import test from 'node:test';import assert from 'node:assert/strict';
import {accountModal,belvaTicketPanel,casino,casinoMenu,freeModal,walletModal} from './belva-tickets.js';
import {belvaNotifPanel} from './belva-notifs.js';
test('notification panel passes Discord builder validation',()=>{
  const p=belvaNotifPanel();p.embeds[0].toJSON();assert.equal(p.components[0].toJSON().components.length,3);
});
test('panel and casino menus pass Discord builder validation',()=>{
  belvaTicketPanel().components.forEach(row=>row.toJSON());
  assert.equal(casinoMenu('refund').toJSON().components[0].options.length,4);
  assert.equal(casinoMenu('verify').toJSON().components[0].options.length,5);
});
test('every modal passes Discord builder validation',()=>{
  for(const id of ['hazcasino','velobet','boo','celsius','rainbet'])for(const kind of ['refund','verify'] as const)accountModal(kind,casino(id)!).toJSON();
  for(const kind of ['help','partner','other'] as const)freeModal(kind).toJSON();
  walletModal(1).toJSON();
});
import {offerVerifyMessage} from './belva-tickets.js';
import {belvaRainbetModal,belvaRainbetPanel} from './belva-rainbet.js';
import {giveawayModal,parseDuration,staffPanel} from './belva-giveaways.js';
test('offer, Rainbet and giveaway components pass Discord builder validation',()=>{
  for(const id of ['hazcasino','velobet','boo','celsius'])offerVerifyMessage(casino(id)!).components[0].toJSON();
  belvaRainbetPanel().components[0].toJSON();belvaRainbetModal().toJSON();
  staffPanel().components[0].toJSON();giveawayModal().toJSON();
});
test('giveaway durations',()=>{
  assert.equal(parseDuration('30m'),1_800_000);assert.equal(parseDuration('1j 12h'),129_600_000);assert.equal(parseDuration('2H'),7_200_000);
  for(const bad of ['','abc','0m','31j','2h foo'])assert.equal(parseDuration(bad),null);
});
import {parseOfferChannel} from './belva-roles.js';
import {verifyRows} from './belva-tickets.js';
test('offer channel names map to brands',()=>{
  assert.deepEqual(parseOfferChannel('💴︱35€-offerts-celsius'),{id:'celsius',bonus:35});
  assert.deepEqual(parseOfferChannel('💵︱30€-offerts-velobet'),{id:'velobet',bonus:30});
  assert.deepEqual(parseOfferChannel('🌧️︱rainbet-rakeback-boost'),{id:'rainbet'});
  assert.deepEqual(parseOfferChannel('🎰︱50€-offerts-stake-casino'),{id:'stakecasino',bonus:50});
});
test('verify ticket offers every brand in multi-select',()=>{
  const rows=verifyRows('1');rows.forEach(r=>r.toJSON());
  assert.equal((rows[0].toJSON() as {components:{options:unknown[];max_values:number}[]}).components[0].options.length,5);
});
