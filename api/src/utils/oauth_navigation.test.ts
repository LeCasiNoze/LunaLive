import test from 'node:test';
import assert from 'node:assert/strict';
import {oauthReturnOrigin,discordNeedsConsent} from './oauth_navigation.js';

test('OAuth returns to the official site that started login',()=>{
 const fallback='https://lunalive.win';
 for(const origin of ['https://lunalive.win','https://www.lunalive.win','https://lunalive.onrender.com'])assert.equal(oauthReturnOrigin(origin,fallback),origin);
 for(const origin of ['https://lunalive.win.evil.example','https://evil.example','javascript:alert(1)','https://user:pass@lunalive.win',null,['https://lunalive.win']])assert.equal(oauthReturnOrigin(origin,fallback),fallback);
});

test('Discord requests consent once when silent login needs interaction, never after cancellation',()=>{
 for(const error of ['consent_required','interaction_required','login_required']){
  assert.equal(discordNeedsConsent(error,false),true);
  assert.equal(discordNeedsConsent(error,true),false);
 }
 for(const error of ['access_denied','server_error',undefined])assert.equal(discordNeedsConsent(error,false),false);
});
