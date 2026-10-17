import test from "node:test";
import assert from "node:assert/strict";
import { eventDeadline, secondsRemaining, eventIdentity } from "../src/components/chat/eventTiming.ts";
test("absolute deadlines survive background throttling, late delivery and replay",()=>{
  const end=eventDeadline({endsAtMs:120000},120,1000);
  assert.equal(secondsRemaining(end,110000),10);
  assert.equal(secondsRemaining(end,190000),0);
  assert.equal(eventDeadline({createdAt:"2026-10-17T09:00:00Z"},120,Date.parse("2026-10-17T09:01:00Z")),Date.parse("2026-10-17T09:02:00Z"));
});
test("event identities retain UUIDs and distinguish successive wheel rounds",()=>{
  assert.equal(eventIdentity("chest",{round:"abc-def"}),"chest:abc-def");
  assert.notEqual(eventIdentity("chest",{round:"a"}),eventIdentity("chest",{round:"b"}));
  assert.notEqual(eventIdentity("wheel",{round:12,messageId:-1}),eventIdentity("wheel",{round:12,messageId:-2}));
});
