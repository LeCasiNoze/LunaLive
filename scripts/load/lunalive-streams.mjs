import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "../..");
const webRequire = createRequire(path.join(root, "web", "package.json"));
const apiRequire = createRequire(path.join(root, "api", "package.json"));
const { io } = webRequire("socket.io-client");
const { Pool } = apiRequire("pg");
const { Agent } = apiRequire("undici");

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "1"];
  })
);

const apiBase = String(args.get("api") || "https://lunalive-api.onrender.com").replace(/\/$/, "");
const stages = String(args.get("stages") || "10:90,25:90,50:120")
  .split(",")
  .map((part) => {
    const [streamsRaw, secondsRaw] = part.split(":");
    const streams = Number(streamsRaw);
    const seconds = Number(secondsRaw);
    if (!Number.isInteger(streams) || streams < 1 || !Number.isFinite(seconds) || seconds < 30) {
      throw new Error(`Invalid stage: ${part}`);
    }
    return { streams, seconds };
  });
const databaseUrl = String(process.env.DATABASE_URL || "").trim();
if (!databaseUrl) throw new Error("DATABASE_URL missing");

const runId = `llstream_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const slugPrefix = `__load_${runId.replace(/[^a-z0-9_]/gi, "")}_`;
const heartbeatMs = 30_000;
const pollMs = 30_000;
const maxErrorRate = Math.max(0.001, Number(args.get("max-error-rate") || 0.01));
const maxP95Ms = Math.max(100, Number(args.get("max-p95-ms") || 1_500));

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
  max: 8,
  connectionTimeoutMillis: 8_000,
});
const httpDispatcher = new Agent({
  connections: 256,
  pipelining: 1,
  connect: { timeout: 8_000 },
});

const streams = [];
const measurements = {
  heartbeat: [],
  socketConnect: [],
  socketJoin: [],
  pollOne: [],
  pollCycle: [],
};
const counters = {
  heartbeatAttempts: 0,
  heartbeatErrors: 0,
  socketAttempts: 0,
  socketErrors: 0,
  pollAttempts: 0,
  pollErrors: 0,
};
const errorKinds = {};
let stopping = false;

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function metricSummary(values) {
  return {
    count: values.length,
    p50: Math.round(percentile(values, 50)),
    p95: Math.round(percentile(values, 95)),
    p99: Math.round(percentile(values, 99)),
    max: Math.round(values.length ? Math.max(...values) : 0),
  };
}

function recordError(error) {
  const key = String(error?.message || error || "unknown").slice(0, 120);
  errorKinds[key] = (errorKinds[key] || 0) + 1;
}

async function heartbeat(stream) {
  const started = performance.now();
  counters.heartbeatAttempts += 1;
  try {
    const response = await fetch(`${apiBase}/watch/heartbeat`, {
      method: "POST",
      dispatcher: httpDispatcher,
      signal: AbortSignal.timeout(10_000),
      headers: {
        "content-type": "application/json",
        "user-agent": "LunaLiveStreamLoadTest/1.0",
      },
      body: JSON.stringify({
        slug: stream.slug,
        anonId: `${runId}_${stream.id}`,
        isLive: true,
      }),
    });
    if (!response.ok) throw new Error(`heartbeat_${response.status}`);
    await response.arrayBuffer();
  } catch (error) {
    counters.heartbeatErrors += 1;
    recordError(error);
  } finally {
    measurements.heartbeat.push(performance.now() - started);
  }
}

async function pollOne(stream) {
  const started = performance.now();
  counters.pollAttempts += 1;
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE streamers
       SET is_live=true,
           live_started_at=COALESCE(live_started_at, NOW()),
           title='Test de charge LunaLive',
           viewers=$2,
           updated_at=NOW()
       WHERE id=$1 AND platform='loadtest'`,
      [stream.id, stream.syntheticViewers]
    );
    await client.query(
      `INSERT INTO streamer_rumble_info
       (streamer_id, is_live, title, viewers_count, hls_url, video_url,
        thumbnail_url, live_id, live_video_id_numeric, live_started_at, updated_at)
       VALUES ($1, true, 'Test de charge LunaLive', $2, NULL, NULL, NULL,
               $3, $4, $5, NOW())
       ON CONFLICT (streamer_id) DO UPDATE SET
         is_live=EXCLUDED.is_live,
         title=EXCLUDED.title,
         viewers_count=EXCLUDED.viewers_count,
         live_id=EXCLUDED.live_id,
         live_video_id_numeric=EXCLUDED.live_video_id_numeric,
         live_started_at=EXCLUDED.live_started_at,
         updated_at=NOW()`,
      [stream.id, stream.syntheticViewers, `${runId}_${stream.id}`, String(stream.id), Date.now()]
    );
  } catch (error) {
    counters.pollErrors += 1;
    recordError(error);
  } finally {
    client.release();
    measurements.pollOne.push(performance.now() - started);
  }
}

async function runWithConcurrency(items, concurrency, task) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      await task(item);
    }
  });
  await Promise.all(workers);
}

async function pollCycle() {
  const started = performance.now();
  await runWithConcurrency(streams, 6, pollOne);
  measurements.pollCycle.push(performance.now() - started);
}

async function createStream(index) {
  const slug = `${slugPrefix}${String(index).padStart(4, "0")}`;
  const client = await pool.connect();
  let row;
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO streamers
       (slug, display_name, title, viewers, is_live, suspended_until,
        live_started_at, platform, featured)
       VALUES ($1, $2, 'Test de charge LunaLive', 1, true,
               NOW() + INTERVAL '2 hours', NOW(), 'loadtest', false)
       RETURNING id, slug`,
      [slug, `Load test ${index}`]
    );
    row = inserted.rows[0];
    await client.query(
      `INSERT INTO live_sessions(streamer_id, started_at)
       VALUES ($1, NOW())`,
      [row.id]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const stream = {
    id: Number(row.id),
    slug: String(row.slug),
    syntheticViewers: 1 + (index % 500),
    socket: null,
    heartbeatTimer: null,
  };
  streams.push(stream);

  counters.socketAttempts += 1;
  const socketStarted = performance.now();
  const socket = io(apiBase, {
    transports: ["websocket", "polling"],
    withCredentials: false,
    reconnection: false,
    timeout: 10_000,
  });
  stream.socket = socket;
  const connected = await new Promise((resolve) => {
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      measurements.socketConnect.push(performance.now() - socketStarted);
      if (!ok) counters.socketErrors += 1;
      resolve(ok);
    };
    socket.once("connect", () => done(true));
    socket.once("connect_error", () => done(false));
    setTimeout(() => done(false), 11_000);
  });

  if (connected) {
    const joinStarted = performance.now();
    await new Promise((resolve) => {
      let settled = false;
      const done = (ok) => {
        if (settled) return;
        settled = true;
        measurements.socketJoin.push(performance.now() - joinStarted);
        if (!ok) counters.socketErrors += 1;
        resolve();
      };
      socket.emit("chat:join", { slug, mode: "public" }, (ack) => done(!!ack?.ok));
      setTimeout(() => done(false), 10_000);
    });
  }

  await heartbeat(stream);
  stream.heartbeatTimer = setInterval(() => void heartbeat(stream), heartbeatMs);
}

async function rampTo(target) {
  const missing = target - streams.length;
  if (missing <= 0) return;
  const delayMs = Math.max(100, Math.min(500, Math.floor(10_000 / missing)));
  for (let i = 0; i < missing; i += 1) {
    await createStream(streams.length + 1);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

function baseline() {
  return {
    counters: { ...counters },
    lengths: Object.fromEntries(
      Object.entries(measurements).map(([key, values]) => [key, values.length])
    ),
  };
}

function summary(stage, base) {
  const stageCounters = Object.fromEntries(
    Object.entries(counters).map(([key, value]) => [key, value - (base?.counters?.[key] || 0)])
  );
  const failures = stageCounters.heartbeatErrors + stageCounters.socketErrors + stageCounters.pollErrors;
  const attempts = stageCounters.heartbeatAttempts + stageCounters.socketAttempts + stageCounters.pollAttempts;
  return {
    runId,
    stage,
    activeStreams: streams.length,
    errorRate: attempts ? failures / attempts : 0,
    counters: stageCounters,
    totalCounters: { ...counters },
    errorKinds: { ...errorKinds },
    latencyMs: Object.fromEntries(
      Object.entries(measurements).map(([key, values]) => [
        key,
        metricSummary(values.slice(base?.lengths?.[key] || 0)),
      ])
    ),
  };
}

async function cleanup() {
  for (const stream of streams) {
    if (stream.heartbeatTimer) clearInterval(stream.heartbeatTimer);
    stream.socket?.disconnect();
  }
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  await pool.query(
    `DELETE FROM streamers
     WHERE platform='loadtest' AND slug LIKE $1`,
    [`${slugPrefix}%`]
  );
}

async function main() {
  console.log(JSON.stringify({ event: "start", runId, apiBase, stages, pollMs }));
  try {
    for (const stage of stages) {
      if (stopping) break;
      const base = baseline();
      await rampTo(stage.streams);
      const started = Date.now();
      await pollCycle();
      console.log(JSON.stringify({ event: "stage_started", ...stage, at: new Date().toISOString() }));
      let nextPollAt = Date.now() + pollMs;
      while (!stopping && Date.now() - started < stage.seconds * 1_000) {
        await new Promise((resolve) => setTimeout(resolve, 10_000));
        if (Date.now() >= nextPollAt) {
          await pollCycle();
          nextPollAt = Date.now() + pollMs;
        }
        const current = summary(stage, base);
        console.log(JSON.stringify({ event: "sample", at: new Date().toISOString(), ...current }));
        const heartbeatP95 = current.latencyMs.heartbeat.p95;
        const pollCycleMax = current.latencyMs.pollCycle.max;
        if (
          current.counters.heartbeatAttempts + current.counters.pollAttempts > 20 &&
          (current.errorRate > maxErrorRate ||
            (current.latencyMs.heartbeat.count > 10 && heartbeatP95 > maxP95Ms) ||
            pollCycleMax > pollMs)
        ) {
          stopping = true;
          console.error(JSON.stringify({
            event: "threshold_exceeded",
            maxErrorRate,
            maxP95Ms,
            maxPollCycleMs: pollMs,
            ...current,
          }));
        }
      }
      console.log(JSON.stringify({ event: "stage_finished", at: new Date().toISOString(), ...summary(stage, base) }));
    }
  } finally {
    await cleanup();
    await httpDispatcher.close();
    await pool.end();
  }
  console.log(JSON.stringify({ event: "finished", at: new Date().toISOString(), ...summary(null, null) }));
}

process.once("SIGINT", () => {
  stopping = true;
});
process.once("SIGTERM", () => {
  stopping = true;
});

await main();
