// bot/src/lunaclip/scheduler.ts
import { spawn, ChildProcess } from "child_process";
import path from "path";
import type { Pool } from "pg";
import { addLunaClip } from "./clips.js";
import fs from "node:fs";

const DLIVE_GQL      = process.env.DLIVE_GRAPHQL_ENDPOINT ?? "https://graphigo.prd.dlive.tv/";
const HLS_PROXY_BASE = String(
  process.env.HLS_PROXY_BASE || "https://lunalive-hls.lunalive.workers.dev"
).replace(/\/$/, "");

function proxifyHls(rawM3u8: string) {
  return `${HLS_PROXY_BASE}/hls?u=${encodeURIComponent(rawM3u8)}`;
}

const POLL_SEC    = 60;
let   ALERT_MULTI = parseFloat(process.env.LUNACLIP_ALERT_MULTI ?? "300");
const INTERVAL_S  = parseFloat(process.env.LUNACLIP_INTERVAL ?? "2.0");
const WORKER_PATH = path.resolve(process.cwd(), "dist/lunaclip-worker/worker.py");
const RAM_LIMIT_MB = parseFloat(process.env.LUNACLIP_RAM_LIMIT_MB ?? "420");

// ✅ min 20min, max 1h
let MIN_WATCH_SEC  = parseFloat(process.env.LUNACLIP_MIN_WATCH_SEC ?? "1200");
let MAX_WORKERS    = parseInt(process.env.LUNACLIP_MAX_WORKERS ?? "1", 10);

// ─────────────────────────────────────────────
// Log ring buffer
// ─────────────────────────────────────────────
const LOG_BUFFER_SIZE = 200;

interface LogEntry {
  ts: number;
  slug: string;
  source: string; // "node" | "py" | "pyerr"
  msg: string;
}
const logBuffer: LogEntry[] = [];

function pushLog(slug: string, source: string, msg: string) {
  logBuffer.push({ ts: Date.now(), slug, source, msg });
  if (logBuffer.length > LOG_BUFFER_SIZE) logBuffer.shift();
}
export function getLogs(limit = 100): LogEntry[] {
  return logBuffer.slice(-limit);
}

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface StreamerRow {
  id:                     number;
  slug:                   string;
  display_name:           string;
  dlive_use_linked:       boolean;
  dlive_link_displayname: string | null;
  provider_channel_slug:  string | null;
}

interface FrameData {
  provider:          string;
  in_bonus:          boolean;
  bet_value:         string | null;
  bet_numeric:       number | null;
  win_value:         string | null;
  win_numeric:       number | null;
  win_total_value:   string | null;
  win_total_numeric: number | null;
  free_spins:        number | null;
  multiplier:        number | null;
  multiplier_source: string | null;
  ts_sec:            number;
  has_value:         boolean;
  raw_ocr:           string | null;
  parse_debug:       Record<string, any> | null;
}

interface WorkerStats {
  mode:                string;
  consecutive_unknown: number;
  frames_total:        number;
  frames_with_value:   number;
  last_value_secs_ago: number;
}

interface ActiveWorker {
  streamerId:   number;
  streamerSlug: string;
  dliveSlug:    string;
  sessionId:    bigint;
  process:      ChildProcess;
  status:       "running" | "stopped" | "error";
  startedAt:    Date;
  lastFrame:    FrameData | null;
  provider:     string | null;
  hlsUrl:       string;
  workerStats:  WorkerStats;
}

export const activeWorkers  = new Map<number, ActiveWorker>();
export const skippedRam     = new Set<string>();
export const waitingWorkers = new Set<string>();

// Force-priority
const priorityQueue = new Set<number>();

// Historique rotation
const lastWatchedAt = new Map<number, number>();

let _pool: Pool;

// ─────────────────────────────────────────────
// LOCK cible
// ─────────────────────────────────────────────
let LOCKED_STREAMER_ID: number | null = null;
let LOCKED_UNTIL_MS: number | null = null;

export function getLockState() {
  return {
    locked_streamer_id: LOCKED_STREAMER_ID,
    locked_until_ms: LOCKED_UNTIL_MS,
    locked: LOCKED_STREAMER_ID != null,
  };
}

export function setLock(streamerId: number | null, durationSec?: number | null) {
  if (!streamerId) {
    LOCKED_STREAMER_ID = null;
    LOCKED_UNTIL_MS = null;
    pushLog("scheduler", "node", "lock cleared");
    tick().catch(console.error);
    return;
  }
  LOCKED_STREAMER_ID = streamerId;
  if (durationSec == null) {
    LOCKED_UNTIL_MS = null;
    pushLog("scheduler", "node", `lock set to #${streamerId} (unlimited)`);
  } else {
    const ms = Math.max(60, Number(durationSec) || 60) * 1000;
    LOCKED_UNTIL_MS = Date.now() + ms;
    pushLog("scheduler", "node", `lock set to #${streamerId} (${durationSec}s)`);
  }
  priorityQueue.add(streamerId);
  tick().catch(console.error);
}

function isLockActiveNow(): boolean {
  if (LOCKED_STREAMER_ID == null) return false;
  if (LOCKED_UNTIL_MS == null) return true;
  if (Date.now() <= LOCKED_UNTIL_MS) return true;
  pushLog("scheduler", "node", "lock expired, clearing");
  LOCKED_STREAMER_ID = null;
  LOCKED_UNTIL_MS = null;
  return false;
}

// ─────────────────────────────────────────────
// Contrôles publics
// ─────────────────────────────────────────────
export function forceSwitch(streamerId: number) {
  priorityQueue.add(streamerId);
  pushLog("scheduler", "node", `forceSwitch requested for streamer #${streamerId}`);
  tick().catch(console.error);
}

export function setMaxWorkers(n: number) {
  MAX_WORKERS = Math.max(1, Math.min(4, n));
  pushLog("scheduler", "node", `maxWorkers set to ${MAX_WORKERS}`);
  tick().catch(console.error);
}

export function setMinWatchSec(sec: number) {
  const v = Math.max(1200, Math.min(3600, Number(sec) || 1200));
  MIN_WATCH_SEC = v;
  pushLog("scheduler", "node", `minWatchSec set to ${MIN_WATCH_SEC}s`);
}

export function getAlertMulti() {
  return ALERT_MULTI;
}

export function setAlertMulti(n: number) {
  const v = Math.max(10, Math.min(100000, Number(n) || 300));
  ALERT_MULTI = v;
  pushLog("scheduler", "node", `alert_multi set to x${ALERT_MULTI} (restart workers)`);

  // restart workers pour appliquer au python
  for (const [sid, w] of activeWorkers) {
    if (w.status === "running") killWorker(w, "alert_multi changed");
    activeWorkers.delete(sid);
  }
  tick().catch(console.error);
}

/** ✅ "Passer" : stop le worker courant et relance tick -> rotation immédiate */
export function skipStreamer(streamerId: number) {
  const w = activeWorkers.get(streamerId);
  if (w && w.status === "running") {
    killWorker(w, "skip requested");
    activeWorkers.delete(streamerId);
  }
  // Marquer comme “vient d’être vu” pour qu’il passe derrière
  lastWatchedAt.set(streamerId, Date.now());
  pushLog("scheduler", "node", `skip requested for streamer #${streamerId}`);
  tick().catch(console.error);
}

export function getSchedulerState() {
  const lock = getLockState();
  return {
    max_workers:    MAX_WORKERS,
    min_watch_sec:  MIN_WATCH_SEC,
    ram_limit_mb:   RAM_LIMIT_MB,
    priority_queue: [...priorityQueue],
    waiting:        [...waitingWorkers],
    skipped_ram:    [...skippedRam],
    alert_multi:    ALERT_MULTI,
    ...lock,
  };
}

// ─────────────────────────────────────────────
// DLive GraphQL
// ─────────────────────────────────────────────
async function dliveGql(query: string, variables: any) {
  const r = await fetch(DLIVE_GQL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept:         "application/json",
      origin:         "https://dlive.tv",
      referer:        "https://dlive.tv/",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!r.ok) throw new Error(`dlive_gql_http_${r.status}`);
  return r.json() as Promise<any>;
}

async function getDliveHlsUrl(dliveDisplayname: string): Promise<string | null> {
  try {
    const q = `query GetHls($name:String!){
      userByDisplayName(displayname:$name){
        username livestream { createdAt }
      }
    }`;
    const j  = await dliveGql(q, { name: dliveDisplayname });
    const ls = j?.data?.userByDisplayName;
    if (!ls?.livestream?.createdAt) return null;
    const username = ls.username as string;
    if (!username) return null;
    return `https://live.prd.dlive.tv/hls/live/${username}.m3u8`;
  } catch { return null; }
}

// ─────────────────────────────────────────────
// DB helpers
// ─────────────────────────────────────────────
async function getLunaLiveStreamers(): Promise<StreamerRow[]> {
  const r = await _pool.query(`
    SELECT s.id, s.slug, s.display_name,
           s.dlive_use_linked, s.dlive_link_displayname,
           pa.channel_slug AS provider_channel_slug
    FROM streamers s
    LEFT JOIN provider_accounts pa
      ON pa.provider = 'dlive' AND pa.assigned_to_streamer_id = s.id
    WHERE s.id IS NOT NULL ORDER BY s.id
  `);
  return r.rows as StreamerRow[];
}

function getDisplayName(s: StreamerRow): string | null {
  if (s.dlive_use_linked && s.dlive_link_displayname) return s.dlive_link_displayname;
  if (s.provider_channel_slug) return s.provider_channel_slug;
  return null;
}

async function createSession(streamerId: number, hlsUrl: string, alertMulti: number, intervalSec: number): Promise<bigint> {
  const r = await _pool.query(
    `INSERT INTO lunaclip_sessions (hls_url, status, alert_multi, interval_sec, started_at)
     VALUES ($1, 'running', $2, $3, NOW()) RETURNING id`,
    [hlsUrl, alertMulti, intervalSec]
  );
  const sessionId = r.rows[0].id as bigint;
  await _pool.query(`UPDATE lunaclip_sessions SET streamer_id=$1 WHERE id=$2`, [streamerId, sessionId]).catch(() => {});
  return sessionId;
}

async function stopSession(sessionId: bigint, status: "stopped" | "error") {
  await _pool.query(`UPDATE lunaclip_sessions SET status=$1, stopped_at=NOW() WHERE id=$2`, [status, sessionId]);
}

async function saveFrame(sessionId: bigint, f: FrameData) {
  await _pool.query(
    `INSERT INTO lunaclip_frames
       (session_id, ts_sec, provider, in_bonus,
        bet_value, bet_numeric, win_value, win_numeric,
        win_total_value, win_total_numeric,
        free_spins, multiplier, multiplier_source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [sessionId, f.ts_sec, f.provider, f.in_bonus,
     f.bet_value, f.bet_numeric, f.win_value, f.win_numeric,
     f.win_total_value, f.win_total_numeric,
     f.free_spins, f.multiplier, f.multiplier_source]
  );
}

async function saveEvent(sessionId: bigint, f: FrameData, screenshot: string | null) {
  await _pool.query(
    `INSERT INTO lunaclip_events
       (session_id, ts_sec, provider, in_bonus,
        multiplier, multiplier_source,
        bet_value, win_value, win_total_value, screenshot_path)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [sessionId, f.ts_sec, f.provider, f.in_bonus,
     f.multiplier, f.multiplier_source,
     f.bet_value, f.win_value, f.win_total_value, screenshot]
  );
  if (f.provider && f.provider !== "unknown") {
    await _pool.query(`UPDATE lunaclip_sessions SET provider=$1 WHERE id=$2`, [f.provider, sessionId]);
  }
}

// ─────────────────────────────────────────────
// Round-robin pick
// ─────────────────────────────────────────────
interface Candidate {
  streamer:    StreamerRow;
  dliveSlug:   string;
  rawHls:      string;
  lastWatched: number;
}

function pickNextBatch(candidates: Candidate[]): Candidate[] {
  const result: Candidate[] = [];

  // 0) lock
  if (isLockActiveNow() && LOCKED_STREAMER_ID != null) {
    const locked = candidates.find(c => c.streamer.id === LOCKED_STREAMER_ID);
    if (locked) result.push(locked);
  }

  // 1) keep active if not exceeded MIN_WATCH_SEC
  for (const [id, w] of activeWorkers) {
    if (result.length >= MAX_WORKERS) break;
    if (w.status !== "running") continue;
    const still = candidates.find(c => c.streamer.id === id);
    if (!still) continue;

    if (isLockActiveNow() && LOCKED_STREAMER_ID != null && id !== LOCKED_STREAMER_ID) continue;

    const elapsed = (Date.now() - w.startedAt.getTime()) / 1000;
    if (elapsed < MIN_WATCH_SEC && !priorityQueue.has(id)) {
      if (!result.find(r => r.streamer.id === id)) result.push(still);
    }
  }

  // 2) priority queue
  for (const pid of [...priorityQueue]) {
    if (result.length >= MAX_WORKERS) break;
    const c = candidates.find(c => c.streamer.id === pid);
    if (c && !result.find(r => r.streamer.id === pid)) {
      result.push(c);
      priorityQueue.delete(pid);
    }
  }

  if (isLockActiveNow() && LOCKED_STREAMER_ID != null) {
    return result.slice(0, 1);
  }

  // 3) never watched
  const neverWatched = candidates.filter(c => c.lastWatched === 0 && !result.find(r => r.streamer.id === c.streamer.id));
  for (const c of neverWatched) {
    if (result.length >= MAX_WORKERS) break;
    result.push(c);
  }

  // 4) oldest first
  const remaining = candidates
    .filter(c => !result.find(r => r.streamer.id === c.streamer.id))
    .sort((a, b) => a.lastWatched - b.lastWatched);

  for (const c of remaining) {
    if (result.length >= MAX_WORKERS) break;
    result.push(c);
  }

  return result.slice(0, MAX_WORKERS);
}

// ─────────────────────────────────────────────
// Worker Python
// ─────────────────────────────────────────────
function defaultWorkerStats(): WorkerStats {
  return { mode: "ACTIVE", consecutive_unknown: 0, frames_total: 0, frames_with_value: 0, last_value_secs_ago: 0 };
}

function spawnWorker(w: ActiveWorker) {
  const PYTHON_BIN = process.env.LUNACLIP_PYTHON ?? "python3";
  if (!fs.existsSync(WORKER_PATH)) {
    pushLog(w.streamerSlug, "node", `WORKER_PATH not found: ${WORKER_PATH}`);
    w.status = "error";
    stopSession(w.sessionId, "error").catch(console.error);
    return;
  }
  pushLog(w.streamerSlug, "node", `spawn worker hls=${w.hlsUrl}`);

  const proc = spawn(PYTHON_BIN, [
    WORKER_PATH,
    "--hls-url",     w.hlsUrl,
    "--alert-multi", String(ALERT_MULTI),
    "--interval",    String(INTERVAL_S),
    "--mode",        "stream",
  ], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  });

  proc.on("error", (err) => {
    pushLog(w.streamerSlug, "node", `spawn error: ${err.message}`);
    w.status = "error";
    stopSession(w.sessionId, "error").catch(console.error);
  });

  let buf = "";
  proc.stdout?.on("data", (chunk: Buffer) => {
    buf += chunk.toString();
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      if (t.startsWith("{") && t.endsWith("}")) {
        try { void handleMessage(w, JSON.parse(t)); continue; } catch {}
      }
      pushLog(w.streamerSlug, "py", t);
    }
  });

  proc.stderr?.on("data", (c: Buffer) => {
    const s = c.toString().trim();
    if (s) pushLog(w.streamerSlug, "pyerr", s);
  });

  proc.on("exit", (code, signal) => {
    pushLog(w.streamerSlug, "node", `worker exit code=${code} signal=${signal}`);
    lastWatchedAt.set(w.streamerId, Date.now());
    w.status = code === 0 ? "stopped" : "error";
    stopSession(w.sessionId, w.status as "stopped" | "error").catch(console.error);
  });

  w.process = proc;
  w.status  = "running";
}

async function handleMessage(w: ActiveWorker, msg: { type: string; data: any }) {
  switch (msg.type) {
    case "log":
      pushLog(w.streamerSlug, "py", String(msg.data));
      return;

    case "frame": {
      const f = msg.data as FrameData;
      w.lastFrame = f;
      if (f.provider && f.provider !== "unknown") w.provider = f.provider;
      if (f.has_value) saveFrame(w.sessionId, f).catch(console.error);
      return;
    }

    case "event": {
      const { frame: f, screenshot_path } = msg.data as { frame: FrameData; screenshot_path: string | null };
      w.lastFrame = f;
      await saveEvent(w.sessionId, f, screenshot_path ?? null).catch(console.error);
      const winLabel = f.win_total_value ?? f.win_value ?? "?";
      const title    = `🎰 x${f.multiplier} — ${(f.provider ?? "").toUpperCase()} — WIN ${winLabel}`;
      addLunaClip(_pool, w.streamerId, title, f.ts_sec).catch(console.error);
      pushLog(w.streamerSlug, "node", `EVENT x${f.multiplier} provider=${f.provider}`);
      return;
    }

    case "stats":
      w.workerStats = msg.data as WorkerStats;
      return;

    case "mode": {
      const { mode, reason } = msg.data as { mode: string; reason: string };
      pushLog(w.streamerSlug, "node", `mode → ${mode} (${reason})`);
      w.workerStats = { ...w.workerStats, mode };
      return;
    }

    default:
      pushLog(w.streamerSlug, "node", `unknown msg type: ${msg.type}`);
  }
}

function killWorker(w: ActiveWorker, reason: string) {
  pushLog(w.streamerSlug, "node", `stopping worker (${reason})`);
  lastWatchedAt.set(w.streamerId, Date.now());
  try { w.process.kill("SIGTERM"); } catch {}
  w.status = "stopped";
  stopSession(w.sessionId, "stopped").catch(console.error);
}

// ─────────────────────────────────────────────
// Tick
// ─────────────────────────────────────────────
async function tick() {
  let streamers: StreamerRow[];
  try {
    streamers = await getLunaLiveStreamers();
  } catch (e) {
    pushLog("scheduler", "node", `DB error: ${e}`);
    return;
  }

  skippedRam.clear();
  waitingWorkers.clear();

  // cleanup
  for (const [sid, w] of activeWorkers) {
    if (w.status !== "running" || !streamers.some(s => s.id === sid)) {
      if (w.status === "running") killWorker(w, "streamer removed");
      activeWorkers.delete(sid);
    }
  }

  // candidates live
  const candidates: Candidate[] = [];

  for (const s of streamers) {
    const dliveSlug = getDisplayName(s);
    if (!dliveSlug) continue;

    let rawHls: string | null = null;
    try { rawHls = await getDliveHlsUrl(dliveSlug); } catch {}

    if (!rawHls) {
      const w = activeWorkers.get(s.id);
      if (w) { killWorker(w, "stream ended"); activeWorkers.delete(s.id); }
      continue;
    }

    candidates.push({
      streamer:    s,
      dliveSlug,
      rawHls,
      lastWatched: lastWatchedAt.get(s.id) ?? 0,
    });
  }

  if (candidates.length === 0) {
    pushLog("scheduler", "node", "aucun streamer en live");
    return;
  }

  const chosen    = pickNextBatch(candidates);
  const chosenIds = new Set(chosen.map(c => c.streamer.id));

  // kill out-of-batch
  for (const [sid, w] of activeWorkers) {
    if (!chosenIds.has(sid) && w.status === "running") {
      killWorker(w, `rotation out — batch changed`);
      activeWorkers.delete(sid);
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  // waiting
  candidates
    .filter(c => !chosenIds.has(c.streamer.id))
    .forEach(c => waitingWorkers.add(c.streamer.slug));

  // start missing
  for (const c of chosen) {
    if (activeWorkers.has(c.streamer.id)) continue;

    pushLog("scheduler", "node",
      `START ${c.streamer.slug} (${c.dliveSlug}) | max=${MAX_WORKERS} | waiting: ${[...waitingWorkers].join(", ") || "—"}`
    );

    try {
      const sessionId  = await createSession(c.streamer.id, c.rawHls, ALERT_MULTI, INTERVAL_S);
      const proxiedHls = proxifyHls(c.rawHls);

      const w: ActiveWorker = {
        streamerId:   c.streamer.id,
        streamerSlug: c.streamer.slug,
        dliveSlug:    c.dliveSlug,
        sessionId,
        process:      null as any,
        status:       "running",
        startedAt:    new Date(),
        lastFrame:    null,
        provider:     null,
        hlsUrl:       proxiedHls,
        workerStats:  defaultWorkerStats(),
      };
      spawnWorker(w);
      activeWorkers.set(c.streamer.id, w);
    } catch (e) {
      pushLog("scheduler", "node", `Failed to start ${c.streamer.slug}: ${e}`);
    }
  }
}

// ─────────────────────────────────────────────
// Export public
// ─────────────────────────────────────────────
let schedulerInterval: ReturnType<typeof setInterval> | null = null;

export function startLunaClipScheduler(pool: Pool) {
  if (schedulerInterval) return;
  _pool = pool;

  pushLog("scheduler", "node",
    `started — round-robin max=${MAX_WORKERS} poll=${POLL_SEC}s min_watch=${MIN_WATCH_SEC}s alert=x${ALERT_MULTI} ram_limit=${RAM_LIMIT_MB}MB`
  );

  tick().catch(console.error);
  schedulerInterval = setInterval(() => tick().catch(console.error), POLL_SEC * 1000);
}

export function stopLunaClipScheduler() {
  if (schedulerInterval) { clearInterval(schedulerInterval); schedulerInterval = null; }
  for (const [sid, w] of activeWorkers) {
    killWorker(w, "scheduler stopped");
    activeWorkers.delete(sid);
  }
}