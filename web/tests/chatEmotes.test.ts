import test from "node:test";
import assert from "node:assert/strict";
import {createEmoteResolver,emotesFromPayload,emojiTextParts,isEmotesOnly} from "../src/lib/chatEmotes.ts";
const base='https://api.example.test';
test("custom emotes use the API origin, and channel names override globals",()=>{
  const resolve=createEmoteResolver([
    {kind:'emoji',scope:'channel',name:'Wave',url:'/channel.webp'},
    {kind:'emoji',scope:'global',name:'wave',url:'/global.webp'},
    {kind:'gif',scope:'global',name:'dance',url:'https://cdn.example.test/dance.gif'},
    {kind:'emoji',scope:'global',name:'bad',url:'javascript:alert(1)'},
  ],base);
  assert.equal(resolve({kind:'emoji',name:'WAVE'})?.url,`${base}/channel.webp`);
  assert.equal(resolve({kind:'gif',name:'dance'})?.url,'https://cdn.example.test/dance.gif');
  assert.equal(resolve({kind:'emoji',name:'bad'}),null);
  assert.match(resolve({kind:'gif',name:'party'})!.url,/^data:image\/svg/);
});
test("late catalogue loading provides a new resolver for memoized history bubbles",()=>{
  const before=createEmoteResolver([],base);
  const after=createEmoteResolver(emotesFromPayload({channel:[{kind:'emoji',scope:'channel',name:'luna',url:'/luna.png'}]}),base);
  assert.notEqual(before,after);assert.equal(before({kind:'emoji',name:'luna'}),null);
  assert.equal(after({kind:'emoji',name:'luna'})!.url,`${base}/luna.png`);
  assert.deepEqual(emotesFromPayload({emotes:[{kind:'emoji',scope:'global',name:'disabled',url:'/x',status:'disabled'}]}),[]);
});
test("emoji graphemes preserve families, skin tones, flags and keycaps",()=>{
  const emojis=['👨‍👩‍👧‍👦','👍🏽','🇫🇷','1️⃣','❤️‍🔥'];
  for(const emoji of emojis)assert.deepEqual(emojiTextParts(emoji),[{text:emoji,emoji:true}]);
  const text=`Salut ${emojis.join(' ')} !`;
  assert.equal(emojiTextParts(text).map(x=>x.text).join(''),text);
  assert.equal(emojiTextParts('Un message normal').length,1);
});
test("only actual emoji messages receive the extra large layout",()=>{
  for(const text of ['😀','👨‍👩‍👧‍👦 🇫🇷',':e:luna: :g:party:','👍🏽 :e:luna:'])assert.equal(isEmotesOnly(text),true,text);
  for(const text of ['','  ','Salut 😀','@Nico 😀','https://lunalive.win 😀','123'])assert.equal(isEmotesOnly(text),false,text);
});
