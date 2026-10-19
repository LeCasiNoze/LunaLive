import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {ChatMessageBubble} from "../src/components/chat/ChatMessageBubble";
import {DEFAULT_APPEARANCE} from "../src/lib/appearance";
import {createEmoteResolver} from "../src/lib/chatEmotes";
const resolve=createEmoteResolver([{kind:'emoji',scope:'channel',name:'luna',url:'/luna.webp'}],'https://api.example.test');
function render(body:string,resolver=resolve) {
  return renderToStaticMarkup(<ChatMessageBubble msg={{id:1,userId:7,username:'Nico',body,createdAt:'2026-10-19T12:00:00Z'}} streamerAppearance={DEFAULT_APPEARANCE} resolveEmote={resolver}/>);
}
test("shared chat/overlay bubbles render custom images and whole Unicode emoji",()=>{
  const html=render('Salut :e:luna: 👨‍👩‍👧‍👦 🇫🇷');
  assert.match(html,/src="https:\/\/api.example.test\/luna.webp"/);
  assert.match(html,/class="ll-emote ll-emote--emoji"/);
  assert.match(html,/class="ll-unicode-emoji">👨‍👩‍👧‍👦<\/span>/);
  assert.match(html,/class="ll-unicode-emoji">🇫🇷<\/span>/);
  assert.doesNotMatch(html,/chatBodyText emotes-only/);
});
test("emoji-only bubbles get the larger layout and unknown tokens remain readable",()=>{
  assert.match(render(':e:luna: 👍🏽'),/chatBodyText emotes-only/);
  assert.match(render(':e:missing:'),/:e:missing:/);
  const before=render(':e:luna:',createEmoteResolver([],'https://api.example.test'));
  assert.doesNotMatch(before,/<img[^>]*class="ll-emote/);
  assert.match(render(':e:luna:'),/<img[^>]*class="ll-emote/);
});
test("emoji rendering preserves links, mentions and text escaping",()=>{
  const html=render('🔥 <script>alert(1)</script> https://lunalive.win @Nico');
  assert.match(html,/href="https:\/\/lunalive.win"/);
  assert.match(html,/@Nico/);
  assert.match(html,/&lt;script&gt;/);
  assert.doesNotMatch(html,/<script>/);
});
