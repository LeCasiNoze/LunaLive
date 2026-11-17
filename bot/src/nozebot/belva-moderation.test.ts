import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verdict} from './belva-moderation.js';

test('général : aucun lien, sauf les GIF', ()=>{
  assert.equal(verdict('regarde https://exemple.com','💬︱général'),'lien hors 💰 big-win');
  assert.equal(verdict('www.site-random.fr','💬︱général'),'lien hors 💰 big-win');
  assert.equal(verdict('https://tenor.com/view/gif-123','💬︱général'),null);
  assert.equal(verdict('gg belva quel bonus','💬︱général'),null);
});

test('big-win : replays et clips oui, affiliation et sites au hasard non', ()=>{
  assert.equal(verdict('x500 https://stake.com/casino/home?betId=abc&modal=bet','💰︱big-win'),null);
  assert.equal(verdict('https://rainbet.com/bets/123456','💰︱big-win'),null);
  assert.equal(verdict('https://rumble.com/v78mwa8-clip.html','💰︱big-win'),null);
  assert.equal(verdict('https://stake.com/?c=moncode','💰︱big-win'),'lien d’affiliation');
  assert.equal(verdict('https://rainbet.com/','💰︱big-win'),'lien qui n’est pas un replay de gain');
  assert.equal(verdict('https://arnaque.xyz/gain','💰︱big-win'),'lien qui n’est pas un replay de gain');
});

test('spam, invitations et mentions de masse', ()=>{
  assert.equal(verdict('discord.gg/abcdef','💰︱big-win'),'invitation / lien de contact');
  assert.equal(verdict('Free nitro pour tous','💬︱général'),'spam / démarchage');
  assert.equal(verdict('contact me on telegram','💬︱général'),'spam / démarchage');
  assert.equal(verdict('@everyone live','💬︱général'),'mention @everyone/@here');
});
