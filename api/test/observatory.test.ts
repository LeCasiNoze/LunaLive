import test from "node:test";
import assert from "node:assert/strict";
import {
  Activity,
  summarize,
  MINUTE,
  HOUR,
  paris,
  pseudonym,
  firstObservedReport,
  modeFromTitle,
} from "../src/observatory/core.js";
import {
  parseRumbleCategoryLives,
  parsePublicCategoryJson,
} from "../src/observatory/category.js";
import {
  SseDecoder,
  readPublicChat,
  ChatReadError,
} from "../src/observatory/sse.js";
import { snapshotSchema } from "../src/observatory/schema.js";
const t = Date.parse("2026-10-15T08:00:00Z");
test("LeCasiNoze modes follow observed titles, preserve verified annotations and react to title changes", () => {
  for (const title of ["AutoMod — !call", "AUTOMOD", "AutoMode | votre session"])
    assert.equal(modeFromTitle(title), "automod");
  assert.equal(modeFromTitle("Hunt personnel"), "personal");
  for (const title of [null, undefined, "", "   "]) assert.equal(modeFromTitle(title), "unknown");
  const a = new Activity("secret".repeat(8));
  const channel = {username:"LeCasiNoze",videoId:"v123abc",videoIdNumeric:"123456",viewersCount:2,createdAt:null};
  a.discover([{...channel,title:"Hunt personnel"}],true,t);
  assert.equal(a.channels.get("lecasinoze")?.mode,"personal");
  a.discover([{...channel,title:"AUTOMOD — !call"}],true,t+MINUTE);
  assert.equal(a.channels.get("lecasinoze")?.mode,"automod");
  a.discover([{...channel,title:null},{...channel,username:"Other",videoId:"v456abc",title:"Personnel"}],true,t+2*MINUTE);
  assert.equal(a.channels.get("lecasinoze")?.mode,"unknown");
  assert.equal(a.channels.get("other")?.mode,"unknown");
  const annotated = new Activity("secret".repeat(8), {modes:[{start:t,end:t+HOUR,mode:"automod"}]});
  annotated.discover([{...channel,title:"Hunt personnel"}],true,t);
  assert.equal(annotated.channels.get("lecasinoze")?.mode,"automod");
});
const live = (
  username = "Alpha",
  video = "v123abc",
  viewersCount: number | null = 50,
) => ({
  username,
  videoId: video,
  videoIdNumeric: "123456",
  viewersCount,
  createdAt: null,
});
const envelope = (
  id: string,
  uid: string,
  name: string,
  text = "bonjour",
  at = t,
) => ({
  type: "messages",
  data: {
    users: [{ id: uid, username: name }],
    messages: [{ id, user_id: uid, text, time: new Date(at).toISOString() }],
  },
});
function ready() {
  const a = new Activity("secret".repeat(8), {
    bots: ["nozbot"],
    languages: { alpha: "fr" },
  });
  a.discover([live(), live("Beta", "v456abc")], true, t);
  for (const c of a.channels.values()) {
    c.connected = t - HOUR;
    c.lastFrame = t;
  }
  return a;
}
test("shared category parser preserves missing vs true zero and canonical slugs", () => {
  const html =
    '<rum-videos-grid collection="category.videos" filter="category=gambling-slots&video_type=live" limit="24"><script type="application/json">' +
    JSON.stringify({
      items: [
        {
          object_type: "video",
          live: true,
          id: 123,
          permalink_id: "v123abc",
          by: { relative_url: "/user/ALPHA" },
        },
        {
          object_type: "video",
          live: true,
          id: 456,
          permalink_id: "v456abc",
          watching_now: 0,
          by: { relative_url: "/user/Beta", followers: 0 },
        },
      ],
    }) +
    "</script>";
  const p = parseRumbleCategoryLives(html);
  assert.equal(p.lives.get("alpha")?.viewersCount, null);
  assert.equal(p.lives.get("beta")?.viewersCount, 0);
  assert.equal(p.lives.get("alpha")?.followersKnown, false);
  assert.equal(p.lives.get("beta")?.followersKnown, true);
  assert.equal(p.lives.get("beta")?.followers, 0);
  assert.equal(p.itemCount, 2);
  assert.throws(() => parseRumbleCategoryLives("403"));
});
test("SSE decodes split UTF8, split CRLF and multiline data", () => {
  const d = new SseDecoder(),
    bytes = Buffer.from(
      'data: {"type":"messages",\r\ndata: "word":"été"}\r\n\r\n',
    );
  let events: unknown[] = [];
  for (const b of bytes) events.push(...d.push(new Uint8Array([b])));
  assert.deepEqual(events, [{ type: "messages", word: "été" }]);
  assert.throws(() => d.push(Buffer.from("x".repeat(262145))));
});
test("bootstrap, replay, future, missing timestamp and unresolved author never inflate clean activity", () => {
  const a = ready();
  const init = envelope("1", "u", "Alice");
  init.type = "init";
  a.envelope("alpha", init, t);
  assert.equal(a.events.length, 0);
  a.envelope("alpha", envelope("1", "u", "Alice"), t);
  a.envelope("alpha", envelope("1", "u", "Alice"), t);
  a.envelope("alpha", envelope("2", "u", "Alice", "bonjour", t + MINUTE), t);
  const bad = envelope("3", "u", "Alice");
  bad.data.messages[0].time = "";
  a.envelope("alpha", bad, t);
  assert.equal(a.events.length, 1);
  assert.equal(a.point(t)[2], 1);
});
test("category union deduplicates accounts, keeps human commands, excludes confirmed bots and owner", () => {
  const a = ready();
  a.envelope("alpha", envelope("1", "same", "Alice", "!call"), t);
  a.envelope("beta", envelope("2", "same", "Alice"), t);
  a.envelope("alpha", envelope("3", "bot", "Nozbot"), t);
  a.envelope("alpha", envelope("4", "owner", "Alpha"), t);
  a.envelope("alpha", envelope("5", "notbot", "RobotFan"), t);
  assert.equal(a.point(t)[2], 2);
  assert.equal(a.point(t)[8], 4);
  assert.equal(a.point(t)[4], 3);
  assert.equal(a.point(t)[5], 2);
});
test("partial discovery, bootstrap, disconnected and missing chat cannot masquerade as zeros", () => {
  const a = ready();
  a.complete = false;
  assert.equal(a.point(t)[1], null);
  assert.equal(a.point(t)[2], null);
  a.complete = true;
  a.channels.get("alpha")!.connected = t;
  assert.equal(a.point(t)[2], null);
  a.channels.get("alpha")!.connected = null;
  assert.equal(a.point(t)[4], null);
  a.channels.clear();
  assert.equal(a.point(t)[2], null);
});
test("video dedup and new video reset coverage without guessing an end time", () => {
  const a = ready();
  a.discover([live("Alpha"), live("Alias")], true, t);
  assert.equal(a.visible.size, 1);
  assert.equal(a.point(t)[7], 1);
  a.discover([live("Alpha", "v999xyz")], true, t + MINUTE);
  assert.equal(a.channels.get("alpha")!.connected, null);
  assert.equal(a.channels.get("alpha")!.first, t + MINUTE);
});
test("hourly rollup exposes missing minutes as lower coverage", () => {
  const points = Array.from(
    { length: 30 },
    (_, i) => [t + i * MINUTE, 50, 2, 2, 1, 1, 1, 1, 2] as any,
  );
  const h = summarize(points, HOUR);
  assert.equal(h[0][6], 0.5);
  assert.equal(h[0][1], 50);
});
test("Paris DST repeats 02h on October 25 without merging UTC observations", () => {
  const a = Date.parse("2026-10-25T00:00:00Z"),
    b = a + HOUR;
  assert.equal(paris(a).hour, 2);
  assert.equal(paris(b).hour, 2);
  assert.equal(paris(a).date, "2026-10-25");
  assert.notEqual(
    pseudonym("s", "message", "a"),
    pseudonym("s", "account", "a"),
  );
});
test("strict ingestion refuses identifiers, text and oversized unknown objects", () => {
  const bad = { version: 1, raw: "chat text", account: "identity" };
  assert.equal(snapshotSchema.safeParse(bad).success, false);
});

test("public JSON category has explicit pagination, including full final page and partial pages", () => {
  const item = {
    object_type: "video",
    live: true,
    id: 123456,
    permalink_id: "v123abc",
    watching_now: 0,
    by: { relative_url: "/user/ALPHA" },
  };
  assert.equal(
    parsePublicCategoryJson({ data: { items: [item], has_more: false } }, 1)
      .hasMore,
    false,
  );
  assert.equal(
    parsePublicCategoryJson({ data: { items: [item], has_more: true } }, 24)
      .hasMore,
    true,
  );
  assert.equal(
    parsePublicCategoryJson({
      data: { items: [item], has_more: false },
    }).lives.get("alpha")?.viewersCount,
    0,
  );
  assert.throws(() => parsePublicCategoryJson({ data: { items: [item] } }));
});

test("unknown authors preserve raw counts but never a clean zero", () => {
  const a = ready();
  const e = envelope("unknown", "uid", "Name");
  e.data.users = [];
  a.envelope("alpha", e, t);
  assert.equal(a.point(t)[2], null);
  assert.equal(a.point(t)[4], null);
  assert.equal(a.point(t)[8], 1);
});
test("transport honors no-chat/Retry-After and aborts a silent reader", async () => {
  const real = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(null, { status: 204 });
    await assert.rejects(
      readPublicChat(
        "123",
        new AbortController().signal,
        () => {},
        () => {},
      ),
      (e) =>
        e instanceof ChatReadError &&
        e.status === 204 &&
        e.retryAfterMs >= 1800000,
    );
    globalThis.fetch = async () =>
      new Response(null, { status: 429, headers: { "retry-after": "3600" } });
    await assert.rejects(
      readPublicChat(
        "123",
        new AbortController().signal,
        () => {},
        () => {},
      ),
      (e) => e instanceof ChatReadError && e.retryAfterMs === 3600000,
    );
    globalThis.fetch = async () =>
      new Response(new ReadableStream({ start() {} }), {
        headers: { "content-type": "text/event-stream" },
      });
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 10);
    await readPublicChat(
      "123",
      ac.signal,
      () => {},
      () => {},
    );
    clearTimeout(timeout);
  } finally {
    globalThis.fetch = real;
  }
});

test('first report is delayed 48h, keeps missing coverage honest and only uses observed blocks',()=>{
 const start=Date.parse('2026-10-12T04:00:00Z');
 const points=Array.from({length:48},(_,i)=>[start+i*HOUR,50,5,10,2,1,1,2,6] as any);
 assert.equal(firstObservedReport(points,start,start+47*HOUR),null);
 const r=firstObservedReport(points,start,start+48*HOUR)!;assert.equal(r.status,'observed_windows');assert.equal(r.coveredHours,48);assert.ok(r.windows.every(w=>w.morning&&w.evening));assert.ok(r.windows.every(w=>points.some(p=>p[0]===w.morning!.start)&&points.some(p=>p[0]===w.evening!.start)));
 const insufficient=firstObservedReport([],start,start+48*HOUR)!;assert.equal(insufficient.status,'insufficient_coverage');assert.ok(insufficient.windows.every(w=>w.morning===null&&w.evening===null));
});
