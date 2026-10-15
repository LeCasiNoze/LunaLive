// Finite, public read-only probe. Outputs aggregates only; no archive or API ingestion.
import { fetchPublicCategoryPage } from "../../dist/observatory/category.js";
import { readPublicChat } from "../../dist/observatory/sse.js";
const started = Date.now(),
  baseline = process.resourceUsage(),
  lives = new Map(),
  results = [],
  counts = {
    categoryBytes: 0,
    sseBytes: 0,
    categoryRequests: 0,
    sseRequests: 0,
  };
let complete = false,
  error = null;
if (process.env.OBSERVATORY_PROBE_SEED) {
  const { readFile } = await import("node:fs/promises");
  const seed = JSON.parse(
    await readFile(process.env.OBSERVATORY_PROBE_SEED, "utf8"),
  );
  for (const c of seed.lives) lives.set(c.videoId, c);
  error = "manual_category_seed_not_automated_discovery";
} else
  try {
    for (let page = 1; page <= 20; page++) {
      counts.categoryRequests++;
      const p = await fetchPublicCategoryPage(page, (n) => {
        counts.categoryBytes += n;
      });
      let added = 0;
      for (const c of p.lives.values())
        if (!lives.has(c.videoId)) {
          lives.set(c.videoId, c);
          added++;
        }
      if (p.hasMore === false) {
        complete = true;
        break;
      }
      if (!added) break;
    }
  } catch (e) {
    error = e.message;
  }
await Promise.all(
  [...lives.values()]
    .filter((c) => c.videoIdNumeric)
    .slice(0, 4)
    .map(async (c) => {
      const ac = new AbortController(),
        ids = new Set(),
        accounts = new Set(),
        connected = Date.now();
      let timer;
      const s = {
        channel: c.username,
        viewers: c.viewersCount,
        opened: false,
        initMessagesIgnored: 0,
        newMessages: 0,
        activeAccounts: 0,
        bytes: 0,
        error: null,
      };
      counts.sseRequests++;
      const task = readPublicChat(
        c.videoIdNumeric,
        ac.signal,
        (e) => {
          if (e?.type === "init") {
            s.initMessagesIgnored += e.data?.messages?.length ?? 0;
            return;
          }
          if (e?.type !== "messages") return;
          for (const m of e.data?.messages ?? []) {
            const t = Date.parse(m.time);
            if (
              !Number.isFinite(t) ||
              t < connected ||
              t > Date.now() + 5000 ||
              !m.id ||
              !m.user_id ||
              ids.has(String(m.id))
            )
              continue;
            ids.add(String(m.id));
            accounts.add(String(m.user_id));
            s.newMessages++;
          }
        },
        (n) => {
          s.bytes += n;
          counts.sseBytes += n;
          if (s.bytes > 1024 * 1024) ac.abort();
        },
        () => {
          s.opened = true;
        },
      ).catch((e) => {
        if (e.name !== "AbortError") s.error = e.message;
      });
      await Promise.race([
        task,
        new Promise((r) => {
          timer = setTimeout(r, 30000);
        }),
      ]);
      clearTimeout(timer);
      ac.abort();
      s.activeAccounts = accounts.size;
      results.push(s);
    }),
);
const usage = process.resourceUsage();
console.log(
  JSON.stringify(
    {
      observedAt: new Date(started).toISOString(),
      elapsedSeconds: (Date.now() - started) / 1000,
      categoryComplete: complete,
      discoveredVideos: lives.size,
      error,
      counts,
      sseSamples: results,
      rssMiB: process.memoryUsage().rss / 1024 / 1024,
      cpuMs:
        (usage.userCPUTime +
          usage.systemCPUTime -
          baseline.userCPUTime -
          baseline.systemCPUTime) /
        1000,
      note: "Finite public read-only sample. Initial history ignored, accounts not verified humans; not a 15/60-minute coverage measurement. Body bytes only, not provider billing.",
    },
    null,
    2,
  ),
);

// Hard stop only for this finite probe, after synchronous aggregate output.
setTimeout(() => process.exit(0), 250);
