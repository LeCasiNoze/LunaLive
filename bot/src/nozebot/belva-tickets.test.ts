import test from 'node:test';import assert from 'node:assert/strict';
import {accountModal,belvaTicketPanel,casino,casinoMenu,freeModal,walletModal} from './belva-tickets.js';
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
