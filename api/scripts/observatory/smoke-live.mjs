// Finite validation only. Real public discovery/SSE, local synthetic ingestion; never POSTs to Render.
import { runCollector } from "./collector.mjs";
import { fetchPublicCategoryPage } from "../../dist/observatory/category.js";
import { mkdtemp, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
const dir = await mkdtemp(join(tmpdir(), "rumble-observatory-live-smoke-")),
  config = join(dir, "config.json"),
  baseline = process.resourceUsage(),
  start = Date.now();
await writeFile(
  config,
  JSON.stringify({
    bots: ["nozbot", "therumblebot", "lunalive_bot"],
    languages: { lecasinoze: "fr", put4click: "fr", crashkilltv: "fr" },
    modes: [],
  }),
);
const originalFetch = globalThis.fetch;
let snapshot,
  discoveryBytes = 0;
globalThis.fetch = async (input, init = {}) => {
  const u = new URL(String(input));
  if (u.hostname !== "fixture.invalid") return originalFetch(input, init);
  if (u.pathname.endsWith("/discovery")) {
    const lives = new Map();
    let complete = false;
    for (let page = 1; page <= 5; page++) {
      const p = await fetchPublicCategoryPage(page, (n) => {
        discoveryBytes += n;
      });
      for (const l of p.lives.values()) lives.set(l.videoId, l);
      if (p.hasMore === false) {
        complete = true;
        break;
      }
    }
    return new Response(
      JSON.stringify({
        fetchedAt: Date.now(),
        complete,
        lives: [...lives.values()],
      }),
      { headers: { "content-type": "application/json" } },
    );
  }
  if (u.pathname.endsWith("/ingest")) {
    snapshot = JSON.parse(gunzipSync(init.body));
    await writeFile(join(dir, "snapshot.json"), JSON.stringify(snapshot));
    return new Response(null, { status: 204 });
  }
  throw new Error("unexpected_local_fixture_url");
};
let collector;
try {
  collector = await runCollector({
    OBSERVATORY_DATA_DIR: dir,
    OBSERVATORY_CONFIG: config,
    OBSERVATORY_HMAC_KEY: randomBytes(32).toString("hex"),
    OBSERVATORY_INGEST_TOKEN: randomBytes(32).toString("hex"),
    OBSERVATORY_API_URL: "https://fixture.invalid/observatory/ingest",
  });
  await new Promise((r) => setTimeout(r, 65000));
  await collector.stop();
  collector = null;
  const { DatabaseSync } = await import("node:sqlite"),
    db = new DatabaseSync(join(dir, "observatory.sqlite"));
  const finalCosts = JSON.parse(
    db.prepare("SELECT v FROM state WHERE k='costs'").get().v,
  );
  const stored = db.prepare("SELECT COUNT(*) n FROM events").get().n,
    latest = db
      .prepare(
        "SELECT p FROM points WHERE channel='@all' ORDER BY t DESC LIMIT 1",
      )
      .get();
  db.close();
  const usage = process.resourceUsage();
  console.log(
    JSON.stringify(
      {
        observedAt: new Date(start).toISOString(),
        elapsedSeconds: (Date.now() - start) / 1000,
        categoryComplete: snapshot?.complete,
        channels: snapshot?.channels.length,
        storedPseudonymousNewMessages: stored,
        latestPoint: latest ? JSON.parse(latest.p) : null,
        categoryBodyBytes: discoveryBytes,
        sseBytes: finalCosts.rumbleBytes,
        snapshotRawBytes: snapshot
          ? Buffer.byteLength(JSON.stringify(snapshot))
          : null,
        snapshotGzipBytes: snapshot
          ? gzipSync(JSON.stringify(snapshot)).length
          : null,
        sqliteBytes: (await stat(join(dir, "observatory.sqlite"))).size,
        rssMiB: process.memoryUsage().rss / 1024 / 1024,
        cpuMs:
          (usage.userCPUTime +
            usage.systemCPUTime -
            baseline.userCPUTime -
            baseline.systemCPUTime) /
          1000,
        dataDirectory: dir,
        note: "Real finite read-only Rumble observation. API ingestion intercepted locally; Render bytes are fixture bookkeeping. 15/60-minute metrics remain null during bootstrap. All probes stopped.",
      },
      null,
      2,
    ),
  );
} finally {
  if (collector) await collector.stop();
  globalThis.fetch = originalFetch;
}
setTimeout(() => process.exit(0), 250);
