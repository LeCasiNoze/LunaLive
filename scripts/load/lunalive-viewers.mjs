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
const slug = String(args.get("slug") || "test2");
const stageSpec = String(args.get("stages") || "10:60");
const runId = `llload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const heartbeatMs = Math.max(5_000, Number(args.get("heartbeat-ms") || 45_000));
const rampSeconds = Math.max(1, Number(args.get("ramp-seconds") || 10));
const maxErrorRate = Math.max(0.001, Number(args.get("max-error-rate") || 0.01));
const maxP95Ms = Math.max(100, Number(args.get("max-p95-ms") || 1_500));
const databaseUrl = String(process.env.DATABASE_URL || "").trim();

if (!databaseUrl) throw new Error("DATABASE_URL missing");

const stages = stageSpec.split(",").map((part) => {
  const [usersRaw, secondsRaw] = part.split(":");
  const users = Number(usersRaw);
  const seconds = Number(secondsRaw);
  if (!Number.isInteger(users) || users < 1 || !Number.isFinite(seconds) || seconds < 15) {
    throw new Error(`Invalid stage: ${part}`);
  }
  return { users, seconds };
});

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
  max: 4,
  connectionTimeoutMillis: 8_000,
});
const httpDispatcher = new Agent({
  connections: 256,
  pipelining: 1,
  connect: { timeout: 8_000 },
});

const measurements = {
  heartbeat: [],
  streamer: [],
  history: [],
  emotes: [],
  socketConnect: [],
  socketJoin: [],
};
const counters = {
  requests: 0,
  requestErrors: 0,
  socketAttempts: 0,
  socketErrors: 0,
};
const errorKinds = {};

let originalStreamer = null;
let liveSessionId = null;
let stopping = false;
const users = [];

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

async function timedFetch(kind, url, init = {}) {
  const started = performance.now();
  counters.requests += 1;
  let countedError = false;
  try {
    const response = await fetch(url, {
      ...init,
      dispatcher: httpDispatcher,
      signal: AbortSignal.timeout(10_000),
      headers: {
        "user-agent": "LunaLiveLoadTest/1.0",
        ...(init.headers || {}),
      },
    });
    if (!response.ok && !(kind === "emotes" && response.status === 401)) {
      counters.requestErrors += 1;
      countedError = true;
      throw new Error(`${kind}_${response.status}`);
    }
    measurements[kind].push(performance.now() - started);
    await response.arrayBuffer();
    return response;
  } catch (error) {
    measurements[kind].push(performance.now() - started);
    if (!countedError) counters.requestErrors += 1;
    const errorKey = String(error?.message || error || "unknown").slice(0, 120);
    errorKinds[errorKey] = (errorKinds[errorKey] || 0) + 1;
    throw error;
  }
}

async function prepareFixture() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT id, slug, is_live, live_started_at, title
       FROM streamers
       WHERE id=11 AND lower(slug)='test2'
       FOR UPDATE`
    );
    if (result.rowCount !== 1) throw new Error("Dedicated test streamer test2/id=11 missing");
    originalStreamer = result.rows[0];
    if (originalStreamer.is_live) throw new Error("Dedicated test streamer is already live");

    const open = await client.query(
      `SELECT id FROM live_sessions WHERE streamer_id=11 AND ended_at IS NULL`
    );
    if (open.rowCount) throw new Error("Dedicated test streamer already has an open live session");

    await client.query(
      `UPDATE streamers
       SET is_live=true, live_started_at=NOW(), title='Test de charge LunaLive', updated_at=NOW()
       WHERE id=11`
    );
    const session = await client.query(
      `INSERT INTO live_sessions(streamer_id, started_at)
       VALUES (11, NOW())
       RETURNING id`
    );
    liveSessionId = Number(session.rows[0].id);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function cleanupFixture() {
  if (!originalStreamer) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (liveSessionId) {
      await client.query(`DELETE FROM stream_viewer_samples WHERE live_session_id=$1`, [liveSessionId]);
      await client.query(`DELETE FROM live_sessions WHERE id=$1 AND streamer_id=11`, [liveSessionId]);
    }
    await client.query(
      `UPDATE streamers
       SET is_live=$1, live_started_at=$2, title=$3, updated_at=NOW()
       WHERE id=11 AND lower(slug)='test2'`,
      [originalStreamer.is_live, originalStreamer.live_started_at, originalStreamer.title]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function createViewer(index) {
  const anonId = `${runId}_${String(index).padStart(5, "0")}`;
  let active = true;
  let heartbeatTimer = null;
  let socket = null;

  const heartbeat = async () => {
    if (!active) return;
    try {
      await timedFetch("heartbeat", `${apiBase}/watch/heartbeat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, anonId, isLive: true }),
      });
    } catch {}
    if (active) {
      const jitter = Math.floor(heartbeatMs * (0.9 + Math.random() * 0.2));
      heartbeatTimer = setTimeout(heartbeat, jitter);
    }
  };

  const start = async () => {
    await Promise.allSettled([
      timedFetch("streamer", `${apiBase}/streamers/${encodeURIComponent(slug)}`),
      timedFetch("history", `${apiBase}/chat/${encodeURIComponent(slug)}/messages?limit=50`),
    ]);

    counters.socketAttempts += 1;
    const socketStarted = performance.now();
    socket = io(apiBase, {
      transports: ["websocket", "polling"],
      withCredentials: false,
      reconnection: false,
      timeout: 10_000,
    });
    await new Promise((resolve) => {
      let settled = false;
      const done = (ok) => {
        if (settled) return;
        settled = true;
        measurements.socketConnect.push(performance.now() - socketStarted);
        if (!ok) counters.socketErrors += 1;
        resolve();
      };
      socket.once("connect", () => done(true));
      socket.once("connect_error", () => done(false));
      setTimeout(() => done(false), 11_000);
    });

    if (socket.connected) {
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
    void heartbeat();
  };

  const stop = () => {
    active = false;
    if (heartbeatTimer) clearTimeout(heartbeatTimer);
    if (socket) socket.disconnect();
  };

  return { start, stop };
}

function snapshotBaseline() {
  return {
    counters: { ...counters },
    lengths: Object.fromEntries(
      Object.entries(measurements).map(([key, values]) => [key, values.length])
    ),
  };
}

function currentSummary(stage, baseline = null) {
  const baseCounters = baseline?.counters || {
    requests: 0,
    requestErrors: 0,
    socketAttempts: 0,
    socketErrors: 0,
  };
  const stageCounters = Object.fromEntries(
    Object.entries(counters).map(([key, value]) => [key, value - (baseCounters[key] || 0)])
  );
  const totalFailures = stageCounters.requestErrors + stageCounters.socketErrors;
  const totalAttempts = stageCounters.requests + stageCounters.socketAttempts;
  return {
    runId,
    stage,
    activeUsers: users.length,
    errorRate: totalAttempts ? totalFailures / totalAttempts : 0,
    counters: stageCounters,
    totalCounters: { ...counters },
    errorKinds: { ...errorKinds },
    latencyMs: Object.fromEntries(
      Object.entries(measurements).map(([key, values]) => [
        key,
        metricSummary(values.slice(baseline?.lengths?.[key] || 0)),
      ])
    ),
  };
}

async function rampTo(target) {
  const missing = target - users.length;
  if (missing <= 0) return;
  const delayMs = Math.max(15, Math.floor((rampSeconds * 1_000) / missing));
  for (let index = 0; index < missing; index += 1) {
    const viewer = createViewer(users.length + 1);
    users.push(viewer);
    void viewer.start();
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

async function main() {
  console.log(JSON.stringify({ event: "start", runId, apiBase, slug, stages, heartbeatMs, rampSeconds }));
  await prepareFixture();
  try {
    for (const stage of stages) {
      if (stopping) break;
      const stageBaseline = snapshotBaseline();
      await rampTo(stage.users);
      const stageStarted = Date.now();
      console.log(JSON.stringify({ event: "stage_started", users: stage.users, seconds: stage.seconds, at: new Date().toISOString() }));
      while (!stopping && Date.now() - stageStarted < stage.seconds * 1_000) {
        await new Promise((resolve) => setTimeout(resolve, 10_000));
        const summary = currentSummary(stage, stageBaseline);
        console.log(JSON.stringify({ event: "sample", at: new Date().toISOString(), ...summary }));
        const heartbeat = summary.latencyMs.heartbeat;
        if (
          summary.counters.requests > 30 &&
          (summary.errorRate > maxErrorRate || (heartbeat.count > 20 && heartbeat.p95 > maxP95Ms))
        ) {
          stopping = true;
          console.error(JSON.stringify({
            event: "threshold_exceeded",
            maxErrorRate,
            maxP95Ms,
            ...summary,
          }));
        }
      }
      console.log(JSON.stringify({ event: "stage_finished", at: new Date().toISOString(), ...currentSummary(stage, stageBaseline) }));
    }
  } finally {
    for (const viewer of users) viewer.stop();
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    await cleanupFixture();
    await httpDispatcher.close();
    await pool.end();
  }
  console.log(JSON.stringify({ event: "finished", at: new Date().toISOString(), ...currentSummary(null) }));
}

process.once("SIGINT", () => {
  stopping = true;
});
process.once("SIGTERM", () => {
  stopping = true;
});

await main();
