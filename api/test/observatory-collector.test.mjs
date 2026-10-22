import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import { runCollector } from "../scripts/observatory/collector.mjs";
const t = Date.now();
test("collector fixture end to end: read-only SSE, no bootstrap persistence, compressed snapshot, SQLite and clean stop", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rumble-observatory-fixture-")),
    config = join(dir, "config.json");
  await writeFile(
    config,
    JSON.stringify({ bots: ["nozbot"], languages: { lecasinoze: "fr" }, modes: [] }),
  );
  const realFetch = globalThis.fetch,
    requests = [],
    controllers = [];
  let snapshot;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    requests.push({ url, method: init.method ?? "GET" });
    if (url.endsWith("/discovery"))
      return new Response(
        JSON.stringify({
          complete: true,
          fetchedAt: Date.now(),
          lives: [
            {
              username: "LeCasiNoze",
              videoId: "v123abc",
              videoIdNumeric: "123456",
              viewersCount: 50,
              title: "Observed stream title",
              followers: 12,
              createdAt: null,
            },
          ],
        }),
        { headers: { "content-type": "application/json" } },
      );
    if (url.includes("/chat/api/chat/")) {
      return new Response(
        new ReadableStream({
          start(c) {
            controllers.push(c);
            c.enqueue(
              Buffer.from(
                "data: " +
                  JSON.stringify({
                    type: "init",
                    data: {
                      users: [{ id: "private-id", username: "private-name" }],
                      messages: [
                        {
                          id: "private-message",
                          user_id: "private-id",
                          text: "private chat text",
                          time: new Date().toISOString(),
                        },
                      ],
                    },
                  }) +
                  "\n\n",
              ),
            );
            init.signal.addEventListener(
              "abort",
              () => {
                try {
                  c.close();
                } catch {}
              },
              { once: true },
            );
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      );
    }
    if (url.endsWith("/ingest")) {
      snapshot = JSON.parse(gunzipSync(init.body));
      return new Response(null, { status: 204 });
    }
    throw new Error("unexpected_url");
  };
  let collector;
  try {
    collector = await runCollector({
      OBSERVATORY_DATA_DIR: dir,
      OBSERVATORY_CONFIG: config,
      OBSERVATORY_HMAC_KEY: "test-key".repeat(8),
      OBSERVATORY_INGEST_TOKEN: "test-token".repeat(8),
      OBSERVATORY_API_URL: "https://fixture.invalid/observatory/ingest",
    });
    assert.ok(snapshot);
    await assert.rejects(
      runCollector({
        OBSERVATORY_DATA_DIR: dir,
        OBSERVATORY_CONFIG: config,
        OBSERVATORY_HMAC_KEY: "test-key".repeat(8),
        OBSERVATORY_INGEST_TOKEN: "test-token".repeat(8),
        OBSERVATORY_API_URL: "https://fixture.invalid/observatory/ingest",
      }),
      /collector_already_running/,
    );
    assert.equal(snapshot.channels.length, 1);
    assert.equal(snapshot.channels[0].title, "Observed stream title");
    assert.equal(snapshot.channels[0].mode, "personal");
    assert.equal(snapshot.channels[0].sessions[0].mode, "personal");
    assert.equal(snapshot.channels[0].sessions[0].title, "Observed stream title");
    assert.equal(snapshot.channels[0].metrics.day.followersLast.total, 12);
    assert.equal(snapshot.channels[0].growth, null);
    assert.equal(snapshot.channels[0].metrics.day.uniqueChatters, null);
    assert.equal(snapshot.latest.fr[2], null);
    assert.ok(snapshot.startedAt >= t);
    assert.equal(requests.filter((r) => r.method === "POST").length, 1);
    assert.ok(
      requests.every((r) => r.method === "GET" || r.url.endsWith("/ingest")),
    );
    await collector.stop();
    collector = null;
    const db = new DatabaseSync(join(dir, "observatory.sqlite"));
    assert.equal(db.prepare("SELECT COUNT(*) n FROM events").get().n, 0);
    assert.equal(db.prepare("SELECT mode FROM observed_modes LIMIT 1").get().mode,"personal");
    db.close();
    assert.equal(
      (await readFile(join(dir, "observatory.sqlite"))).includes(
        Buffer.from("private chat text"),
      ),
      false,
    );
    console.log(
      JSON.stringify({
        fixture: true,
        snapshotBytes: JSON.stringify(snapshot).length,
        gzipBytes: gzipSync(JSON.stringify(snapshot)).length,
        requests: requests.length,
        rssMiB: process.memoryUsage().rss / 1024 / 1024,
        note: "Synthetic fixture, not live Rumble coverage",
      }),
    );
  } finally {
    if (collector) await collector.stop();
    globalThis.fetch = realFetch;
  }
});

test('VPS budget stops discovery before SSE and does not start the 48h clock',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'rumble-observatory-budget-')),config=join(dir,'config.json');await writeFile(config,JSON.stringify({bots:[],languages:{},modes:[]}));
 const original=globalThis.fetch,requests=[];globalThis.fetch=async(input,init={})=>{requests.push({url:String(input),method:init.method??'GET'});return new Response(JSON.stringify({complete:true,fetchedAt:Date.now(),lives:[{username:'Alpha',videoId:'v123abc',videoIdNumeric:'123456',viewersCount:50,createdAt:null}]}),{headers:{'content-type':'application/json'}});};
 let collector;try{collector=await runCollector({OBSERVATORY_DATA_DIR:dir,OBSERVATORY_CONFIG:config,OBSERVATORY_HMAC_KEY:'test-key'.repeat(8),OBSERVATORY_INGEST_TOKEN:'test-token'.repeat(8),OBSERVATORY_API_URL:'https://fixture.invalid/observatory/ingest',OBSERVATORY_VPS_DAILY_BYTES:'64'});await collector.stop();collector=null;const db=new DatabaseSync(join(dir,'observatory.sqlite'));assert.equal(db.prepare("SELECT v FROM state WHERE k='startedAt'").get(),undefined);assert.equal(db.prepare('SELECT COUNT(*) n FROM events').get().n,0);assert.equal(requests.length,1);assert.equal(requests[0].method,'GET');db.close();}finally{if(collector)await collector.stop();globalThis.fetch=original;}
});
