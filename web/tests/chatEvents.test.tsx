// Run with an esbuild bundle (CSS loader: empty), then node --test the bundle.
import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SpecialEventCard from "../src/components/chat/SpecialEventCard";
import { ActionableChatCard, ActionablePinnedBar, type ActEvent } from "../src/components/chat/ActionableEvents";

const noop=()=>{};
const callbacks={currentUsername:'Nico',onGg:noop,onCombo:noop,onFollowChannel:noop,onSubscribe:noop,onBossPage:noop};
test("existing followers and subscribers see disabled combo buttons",()=>{
  for(const kind of ['follow','sub']) {
    const html=renderToStaticMarkup(<SpecialEventCard {...callbacks} type="combo" data={{kind,mult:3}} viewerFollows viewerSubbed/>);
    assert.match(html,/disabled=""[^>]*>✓ Déjà/);
  }
  const pending=renderToStaticMarkup(<SpecialEventCard {...callbacks} type="follow" data={{who:'A'}} viewerFollows={null}/>);
  assert.match(pending,/disabled=""[^>]*>Vérification/);
});
test("zero-bet predictions never present invented 50/50 percentages",()=>{
  const event:ActEvent={id:'p',kind:'predict',real:true,joined:false,participants:[],remaining:60,duration:60,locked:false,resolved:false,pctYes:50,percentagesKnown:false,myVote:null,serverCount:0,totalStake:0,stake:10,opt1:'Bleu',opt2:'Rouge'};
  const html=renderToStaticMarkup(<ActionableChatCard event={event} engine={{} as any} isStreamer={false}/>);
  assert.doesNotMatch(html,/>50%/);
  assert.match(html,/0 participant/);
  assert.match(html,/0 rubis misés/);
  const actual=renderToStaticMarkup(<ActionableChatCard event={{...event,serverCount:3,totalStake:75,pctYes:80,percentagesKnown:true,myVote:'yes'}} engine={{} as any} isStreamer={false}/>);
  assert.match(actual,/>80%/);assert.match(actual,/3 participant/);assert.match(actual,/75 rubis misés/);
  assert.match(actual,/disabled=""/);
});
test("finished and expired events disappear from the pinned bar",()=>{
  const event={id:'r',kind:'rain',real:true,joined:true,participants:[],remaining:0,duration:60,endsAtMs:Date.now()-1000,locked:true,resolved:false,pctYes:50,myVote:null};
  const html=renderToStaticMarkup(<ActionablePinnedBar engine={{events:[event]} as any} isStreamer={false}/>);
  assert.equal(html,'');
});
