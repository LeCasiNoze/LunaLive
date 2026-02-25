// server/scheduler.ts
// LunaClip Local Scheduler — adapté de bot/src/lunaclip/scheduler.ts
// Tourne localement, écrit dans la même DB Render, spawn worker Python local

import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import type { Pool } from "pg";
import { addLunaClip } from "./clips.js";

const DLIVE_GQL      = process.env.DLIVE_GRAPHQL_ENDPOINT ?? "https://graphigo.prd.dlive.tv/";
const HLS_PROXY_BASE = String(process.env.HLS_PROXY_BASE ?? "https://lunalive-hls.lunalive.workers.dev").replace(/\/$/, "");

function proxifyHls(raw: string) {
  return `${HLS_PROXY_BASE}/hls?u=${encodeURIComponent(raw)}`;
}

// ─── Config runtime (modifiable à chaud) ────────────────────────
export let cfg = {
  alertMulti:   parseFloat(process.env.LUNACLIP_ALERT_MULTI ?? "300"),
  intervalS:    parseFloat(process.env.LUNACLIP_INTERVAL ?? "2.0"),
  minWatchSec:  parseFloat(process.env.LUNACLIP_MIN_WATCH_SEC ?? "1200"),
  maxWorkers:   parseInt(process.env.LUNACLIP_MAX_WORKERS ?? "1", 10),
  pollSec:      60,
  // Paramètres perf worker
  frameW:       960,
  frameH:       540,
  imgsz:        640,
  cropScale:    4,
  psm:          7,
  postSleep:    0.15,
};

// ─── Log ring buffer ─────────────────────────────────────────────
const LOG_BUFFER_SIZE = 500;

export interface LogEntry {
  ts:     number;
  slug:   string;
  source: string;
  msg:    string;
}
const logBuffer: LogEntry[] = [];
const logListeners = new Set<(e: LogEntry) => void>();

export function pushLog(slug: string, source: string, msg: string) {
  const entry: LogEntry = { ts: Date.now(), slug, source, msg };
  logBuffer.push(entry);
  if (logBuffer.length > LOG_BUFFER_SIZE) logBuffer.shift();
  logListeners.forEach(fn => fn(entry));
}

export function onLog(fn: (e: LogEntry) => void) { logListeners.add(fn); }
export function offLog(fn: (e: LogEntry) => void) { logListeners.delete(fn); }

export function getLogs(limit = 200, slug?: string, source?: string): LogEntry[] {
  let buf = logBuffer;
  if (slug)   buf = buf.filter(e => e.slug === slug);
  if (source) buf = buf.filter(e => e.source === source);
  return buf.slice(-limit);
}

// ─── Types ───────────────────────────────────────────────────────
export interface StreamerRow {
  id:                     number;
  slug:                   string;
  display_name:           string;
  dlive_use_linked:       boolean;
  dlive_link_displayname: string | null;
  provider_channel_slug:  string | null;
}

export interface FrameData {
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
  filtered_ocr:      string | null;
  parse_debug:       Record<string, unknown> | null;
}

export interface WorkerStats {
  mode:                string;
  consecutive_unknown: number;
  frames_total:        number;
  frames_with_value:   number;
  last_value_secs_ago: number;
}

export interface ActiveWorker {
  streamerId:      number;
  streamerSlug:    string;
  dliveSlug:       string;
  sessionId:       bigint;
  liveCreatedAtMs: number;
  process:         ChildProcess;
  status:          "running" | "stopped" | "error";
  startedAt:       Date;
  lastFrame:       FrameData | null;
  lastPreview:     string | null;   // base64 JPEG annoté
  provider:        string | null;
  hlsUrl:          string;
  workerStats:     WorkerStats;
  pid:             number | null;
  ffmpegPid:       number | null;
}

export const activeWorkers  = new Map<number, ActiveWorker>();
export const skippedWorkers = new Set<string>();
export const waitingWorkers = new Set<string>();

const priorityQueue  = new Set<number>();
const lastWatchedAt  = new Map<number, number>();
const stateListeners = new Set<() => void>();
const previewListeners = new Set<(streamerId: number, jpeg_b64: string) => void>();
export function onPreview(fn: (streamerId: number, jpeg_b64: string) => void) { previewListeners.add(fn); }
export function offPreview(fn: (streamerId: number, jpeg_b64: string) => void) { previewListeners.delete(fn); }

// ─── Lock ────────────────────────────────────────────────────────
let LOCKED_STREAMER_ID: number | null = null;
let LOCKED_UNTIL_MS:   number | null = null;

export function getLockState() {
  return {
    locked_streamer_id: LOCKED_STREAMER_ID,
    locked_until_ms:    LOCKED_UNTIL_MS,
    locked:             LOCKED_STREAMER_ID != null,
  };
}

export function setLock(streamerId: number | null, durationSec?: number | null) {
  if (!streamerId) {
    LOCKED_STREAMER_ID = null;
    LOCKED_UNTIL_MS    = null;
    pushLog("scheduler", "node", "lock cleared");
  } else {
    LOCKED_STREAMER_ID = streamerId;
    LOCKED_UNTIL_MS    = durationSec == null
      ? null
      : Date.now() + Math.max(60, durationSec) * 1000;
    pushLog("scheduler", "node",
      `lock → #${streamerId} (${durationSec == null ? "unlimited" : durationSec + "s"})`);
    priorityQueue.add(streamerId);
  }
  broadcastState();
  tick().catch(console.error);
}

function isLockActive(): boolean {
  if (!LOCKED_STREAMER_ID) return false;
  if (!LOCKED_UNTIL_MS)    return true;
  if (Date.now() <= LOCKED_UNTIL_MS) return true;
  pushLog("scheduler", "node", "lock expired");
  LOCKED_STREAMER_ID = null;
  LOCKED_UNTIL_MS    = null;
  return false;
}

// ─── Contrôles publics ───────────────────────────────────────────
export function forceSwitch(streamerId: number) {
  priorityQueue.add(streamerId);
  pushLog("scheduler", "node", `forceSwitch #${streamerId}`);
  tick().catch(console.error);
}

export function setMaxWorkers(n: number) {
  cfg.maxWorkers = Math.max(1, Math.min(4, n));
  pushLog("scheduler", "node", `maxWorkers → ${cfg.maxWorkers}`);
  broadcastState();
  tick().catch(console.error);
}

export function setMinWatchSec(sec: number) {
  cfg.minWatchSec = Math.max(60, Math.min(7200, sec));
  pushLog("scheduler", "node", `minWatchSec → ${cfg.minWatchSec}s`);
}

export function setAlertMulti(n: number) {
  cfg.alertMulti = Math.max(10, n);
  pushLog("scheduler", "node", `alertMulti → x${cfg.alertMulti} (restarting workers)`);
  for (const [sid, w] of activeWorkers) {
    if (w.status === "running") killWorker(w, "alert_multi changed");
    activeWorkers.delete(sid);
  }
  broadcastState();
  tick().catch(console.error);
}

export function setConfig(patch: Partial<typeof cfg>) {
  const needsRestart = patch.frameW !== undefined || patch.frameH !== undefined
    || patch.imgsz !== undefined || patch.cropScale !== undefined
    || patch.postSleep !== undefined
    || patch.intervalS !== undefined;

  Object.assign(cfg, patch);
  pushLog("scheduler", "node", `config updated: ${JSON.stringify(patch)}`);

  if (needsRestart) {
    pushLog("scheduler", "node", "restarting workers for config change");
    for (const [sid, w] of activeWorkers) {
      if (w.status === "running") killWorker(w, "config changed");
      activeWorkers.delete(sid);
    }
    tick().catch(console.error);
  }
  broadcastState();
}

export function skipStreamer(streamerId: number) {
  const w = activeWorkers.get(streamerId);
  if (w?.status === "running") {
    killWorker(w, "skip requested");
    activeWorkers.delete(streamerId);
  }
  lastWatchedAt.set(streamerId, Date.now());
  pushLog("scheduler", "node", `skip #${streamerId}`);
  broadcastState();
  tick().catch(console.error);
}

export function restartWorker(streamerId: number) {
  const w = activeWorkers.get(streamerId);
  if (w?.status === "running") {
    killWorker(w, "manual restart");
    activeWorkers.delete(streamerId);
  }
  pushLog("scheduler", "node", `restart worker #${streamerId}`);
  tick().catch(console.error);
}

export function killAllWorkers(reason = "manual kill") {
  for (const [sid, w] of activeWorkers) {
    if (w.status === "running") killWorker(w, reason);
    activeWorkers.delete(sid);
  }
  broadcastState();
}

export function getSchedulerState() {
  return {
    enabled:     !!schedulerInterval,
    cfg,
    ...getLockState(),
    waiting:     [...waitingWorkers],
    skipped:     [...skippedWorkers],
    priority:    [...priorityQueue],
    workers:     [...activeWorkers.values()].map(w => ({
      streamerId:      w.streamerId,
      streamerSlug:    w.streamerSlug,
      dliveSlug:       w.dliveSlug,
      status:          w.status,
      startedAt:       w.startedAt.toISOString(),
      provider:        w.provider,
      hlsUrl:          w.hlsUrl,
      lastFrame:       w.lastFrame,
      workerStats:     w.workerStats,
      pid:             w.pid,
    })),
  };
}

// ─── State broadcast ─────────────────────────────────────────────
export function onStateChange(fn: () => void) { stateListeners.add(fn); }
export function offStateChange(fn: () => void) { stateListeners.delete(fn); }
function broadcastState() { stateListeners.forEach(fn => fn()); }

// ─── DLive GQL ───────────────────────────────────────────────────
async function dliveGql(query: string, variables: Record<string, unknown>) {
  const r = await fetch(DLIVE_GQL, {
    method:  "POST",
    headers: {
      "content-type": "application/json",
      accept:         "application/json",
      origin:         "https://dlive.tv",
      referer:        "https://dlive.tv/",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!r.ok) throw new Error(`dlive_gql_http_${r.status}`);
  return r.json() as Promise<Record<string, unknown>>;
}

async function getDliveHlsUrl(displayname: string): Promise<{ hls: string; liveCreatedAtMs: number } | null> {
  try {
    const q = `query GetHls($name:String!){
      userByDisplayName(displayname:$name){
        username livestream { createdAt }
      }
    }`;
    const j  = await dliveGql(q, { name: displayname }) as any;
    const ls = j?.data?.userByDisplayName;
    if (!ls?.livestream?.createdAt) return null;
    return {
      hls: `https://live.prd.dlive.tv/hls/live/${ls.username}.m3u8`,
      liveCreatedAtMs: Number(ls.livestream.createdAt),
    };
  } catch { return null; }
}

// ─── DB helpers ──────────────────────────────────────────────────
async function getLunaLiveStreamers(pool: Pool): Promise<StreamerRow[]> {
  const r = await pool.query(`
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

async function createSession(pool: Pool, streamerId: number, hlsUrl: string): Promise<bigint> {
  const r = await pool.query(
    `INSERT INTO lunaclip_sessions (hls_url, status, alert_multi, interval_sec, started_at)
     VALUES ($1, 'running', $2, $3, NOW()) RETURNING id`,
    [hlsUrl, cfg.alertMulti, cfg.intervalS]
  );
  const id = r.rows[0].id as bigint;
  await pool.query(`UPDATE lunaclip_sessions SET streamer_id=$1 WHERE id=$2`, [streamerId, id]).catch(() => {});
  return id;
}

async function stopSession(pool: Pool, sessionId: bigint, status: "stopped" | "error") {
  await pool.query(
    `UPDATE lunaclip_sessions SET status=$1, stopped_at=NOW() WHERE id=$2`,
    [status, sessionId]
  ).catch(() => {});
}

async function saveFrame(pool: Pool, sessionId: bigint, f: FrameData) {
  await pool.query(
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
  ).catch(() => {});
}

async function saveEvent(pool: Pool, sessionId: bigint, f: FrameData, screenshot: string | null) {
  await pool.query(
    `INSERT INTO lunaclip_events
       (session_id, ts_sec, provider, in_bonus,
        multiplier, multiplier_source,
        bet_value, win_value, win_total_value, screenshot_path)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [sessionId, f.ts_sec, f.provider, f.in_bonus,
     f.multiplier, f.multiplier_source,
     f.bet_value, f.win_value, f.win_total_value, screenshot]
  ).catch(() => {});
  if (f.provider && f.provider !== "unknown") {
    await pool.query(`UPDATE lunaclip_sessions SET provider=$1 WHERE id=$2`, [f.provider, sessionId]).catch(() => {});
  }
}

// ─── Round-robin ─────────────────────────────────────────────────
interface Candidate {
  streamer:        StreamerRow;
  dliveSlug:       string;
  rawHls:          string;
  liveCreatedAtMs: number;
  lastWatched:     number;
}

function pickNextBatch(candidates: Candidate[]): Candidate[] {
  const result: Candidate[] = [];

  if (isLockActive() && LOCKED_STREAMER_ID != null) {
    const locked = candidates.find(c => c.streamer.id === LOCKED_STREAMER_ID);
    if (locked) result.push(locked);
    return result.slice(0, 1);
  }

  // keep active workers if not exceeded minWatchSec
  for (const [id, w] of activeWorkers) {
    if (result.length >= cfg.maxWorkers) break;
    if (w.status !== "running") continue;
    const still = candidates.find(c => c.streamer.id === id);
    if (!still) continue;
    const elapsed = (Date.now() - w.startedAt.getTime()) / 1000;
    if (elapsed < cfg.minWatchSec && !priorityQueue.has(id)) {
      if (!result.find(r => r.streamer.id === id)) result.push(still);
    }
  }

  // priority queue
  for (const pid of [...priorityQueue]) {
    if (result.length >= cfg.maxWorkers) break;
    const c = candidates.find(c => c.streamer.id === pid);
    if (c && !result.find(r => r.streamer.id === pid)) {
      result.push(c);
      priorityQueue.delete(pid);
    }
  }

  // never watched
  for (const c of candidates.filter(c => c.lastWatched === 0 && !result.find(r => r.streamer.id === c.streamer.id))) {
    if (result.length >= cfg.maxWorkers) break;
    result.push(c);
  }

  // oldest first
  for (const c of [...candidates]
    .filter(c => !result.find(r => r.streamer.id === c.streamer.id))
    .sort((a, b) => a.lastWatched - b.lastWatched)
  ) {
    if (result.length >= cfg.maxWorkers) break;
    result.push(c);
  }

  return result.slice(0, cfg.maxWorkers);
}

// ─── Worker Python ───────────────────────────────────────────────
const WORKER_PATH = process.env.WORKER_PATH
  ?? path.resolve(process.cwd(), "worker", "worker.py");
const PYTHON_BIN  = process.env.PYTHON_BIN ?? "python";

function defaultWorkerStats(): WorkerStats {
  return { mode: "ACTIVE", consecutive_unknown: 0, frames_total: 0, frames_with_value: 0, last_value_secs_ago: 0 };
}

function spawnWorker(pool: Pool, w: ActiveWorker) {
  if (!fs.existsSync(WORKER_PATH)) {
    pushLog(w.streamerSlug, "node", `FATAL: WORKER_PATH not found: ${WORKER_PATH}`);
    w.status = "error";
    stopSession(pool, w.sessionId, "error").catch(() => {});
    broadcastState();
    return;
  }
  pushLog(w.streamerSlug, "node", `spawn worker → ${w.hlsUrl}`);

  const proc = spawn(PYTHON_BIN, [
    WORKER_PATH,
    "--hls-url",     w.hlsUrl,
    "--alert-multi", String(cfg.alertMulti),
    "--interval",    String(cfg.intervalS),
    "--frame-w",     String(cfg.frameW),
    "--frame-h",     String(cfg.frameH),
    "--imgsz",       String(cfg.imgsz),
    "--crop-scale",  String(cfg.cropScale),
    "--post-sleep",  String(cfg.postSleep),
  ], {
    stdio: ["ignore", "pipe", "pipe"],
    env:   { ...process.env, PYTHONUNBUFFERED: "1" },
  });

  w.pid = proc.pid ?? null;
  w.process = proc;
  w.status  = "running";
  broadcastState();

  proc.on("error", err => {
    pushLog(w.streamerSlug, "node", `spawn error: ${err.message}`);
    w.status = "error";
    stopSession(pool, w.sessionId, "error").catch(() => {});
    broadcastState();
  });

  let buf = "";
  proc.stdout?.on("data", (chunk: Buffer) => {
    buf += chunk.toString();
    // Découper par newlines — chaque message JSON est sur une seule ligne
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      if (line.startsWith("{")) {
        try {
          const msg = JSON.parse(line) as { type: string; data: unknown };
          handleMessage(pool, w, msg);
          continue;
        } catch {
          // JSON invalide — log pour debug
          pushLog(w.streamerSlug, "pyerr", `JSON parse error: ${line.slice(0, 80)}`);
          continue;
        }
      }
      pushLog(w.streamerSlug, "py", line);
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
    w.pid    = null;
    stopSession(pool, w.sessionId, w.status as "stopped" | "error").catch(() => {});
    broadcastState();
  });
}

function handleMessage(pool: Pool, w: ActiveWorker, msg: { type: string; data: unknown }) {
  switch (msg.type) {
    case "log":
      pushLog(w.streamerSlug, "py", String(msg.data));
      return;

    case "frame": {
      const f = msg.data as FrameData;
      w.lastFrame = f;
      if (f.provider && f.provider !== "unknown") w.provider = f.provider;
      if (f.has_value) saveFrame(pool, w.sessionId, f).catch(() => {});
      broadcastState();
      return;
    }

    case "event": {
      const { frame: f, screenshot_path } = msg.data as { frame: FrameData; screenshot_path: string | null };
      w.lastFrame = f;
      saveEvent(pool, w.sessionId, f, screenshot_path ?? null).catch(() => {});
      const LATENCY_PAD_SEC = 15;
      const atSec = Math.max(0, f.ts_sec - w.startedAt.getTime() / 1000 + LATENCY_PAD_SEC);
      const winLabel = f.win_total_value ?? f.win_value ?? "?";
      const title = `🎰 x${f.multiplier} — ${(f.provider ?? "").toUpperCase()} — WIN ${winLabel}`;
      addLunaClip(pool, w.streamerId, title, atSec, w.liveCreatedAtMs).catch(() => {});
      pushLog(w.streamerSlug, "node", `EVENT x${f.multiplier} provider=${f.provider} atSec=${Math.floor(atSec)}`);
      broadcastState();
      return;
    }

    case "stats":
      w.workerStats = msg.data as WorkerStats;
      broadcastState();
      return;

    case "mode": {
      const { mode, reason } = msg.data as { mode: string; reason: string };
      pushLog(w.streamerSlug, "node", `mode → ${mode} (${reason})`);
      w.workerStats = { ...w.workerStats, mode };
      broadcastState();
      return;
    }

    case "preview": {
      const p = msg.data as { jpeg_b64: string };
      w.lastPreview = p.jpeg_b64;
      previewListeners.forEach(fn => fn(w.streamerId, p.jpeg_b64));
      return;
    }

    default:
      pushLog(w.streamerSlug, "node", `unknown msg: ${msg.type}`);
  }
}

function killWorker(w: ActiveWorker, reason: string) {
  pushLog(w.streamerSlug, "node", `kill worker (${reason})`);
  lastWatchedAt.set(w.streamerId, Date.now());
  try { w.process.kill("SIGTERM"); } catch {}
  setTimeout(() => {
    try { w.process.kill("SIGKILL"); } catch {}
  }, 3000);
  w.status = "stopped";
  w.pid    = null;
}

// ─── Tick ────────────────────────────────────────────────────────
async function tick() {
  if (!_pool) return;

  let streamers: StreamerRow[];
  try { streamers = await getLunaLiveStreamers(_pool); }
  catch (e) { pushLog("scheduler", "node", `DB error: ${e}`); return; }

  skippedWorkers.clear();
  waitingWorkers.clear();

  // cleanup dead workers
  for (const [sid, w] of activeWorkers) {
    if (w.status !== "running" || !streamers.some(s => s.id === sid)) {
      if (w.status === "running") killWorker(w, "streamer removed");
      activeWorkers.delete(sid);
    }
  }

  // build candidates (parallel DLive checks)
  const checks = streamers.map(async s => {
    const dliveSlug = getDisplayName(s);
    if (!dliveSlug) return null;
    let info: { hls: string; liveCreatedAtMs: number } | null = null;
    try { info = await getDliveHlsUrl(dliveSlug); } catch {}
    if (!info) {
      const w = activeWorkers.get(s.id);
      if (w) { killWorker(w, "stream ended"); activeWorkers.delete(s.id); }
      return null;
    }
    return { streamer: s, dliveSlug, rawHls: info.hls, liveCreatedAtMs: info.liveCreatedAtMs, lastWatched: lastWatchedAt.get(s.id) ?? 0 } as Candidate;
  });

  const results   = await Promise.all(checks);
  const candidates = results.filter(Boolean) as Candidate[];

  if (candidates.length === 0) {
    pushLog("scheduler", "node", "aucun streamer en live");
    broadcastState();
    return;
  }

  const chosen    = pickNextBatch(candidates);
  const chosenIds = new Set(chosen.map(c => c.streamer.id));

  // kill out-of-batch
  for (const [sid, w] of activeWorkers) {
    if (!chosenIds.has(sid) && w.status === "running") {
      killWorker(w, "rotation");
      activeWorkers.delete(sid);
    }
  }

  // waiting list
  candidates
    .filter(c => !chosenIds.has(c.streamer.id))
    .forEach(c => waitingWorkers.add(c.streamer.slug));

  // start missing
  for (const c of chosen) {
    if (activeWorkers.has(c.streamer.id)) continue;
    pushLog("scheduler", "node",
      `START ${c.streamer.slug} (${c.dliveSlug}) | waiting: ${[...waitingWorkers].join(", ") || "—"}`);
    try {
      const sessionId  = await createSession(_pool, c.streamer.id, c.rawHls);
      const proxiedHls = proxifyHls(c.rawHls);
      const w: ActiveWorker = {
        streamerId: c.streamer.id, streamerSlug: c.streamer.slug, dliveSlug: c.dliveSlug,
        sessionId, liveCreatedAtMs: c.liveCreatedAtMs,
        process: null as unknown as ChildProcess,
        status: "running", startedAt: new Date(),
        lastFrame: null, lastPreview: null, provider: null, hlsUrl: proxiedHls,
        workerStats: defaultWorkerStats(), pid: null, ffmpegPid: null,
      };
      spawnWorker(_pool, w);
      activeWorkers.set(c.streamer.id, w);
    } catch (e) {
      pushLog("scheduler", "node", `Failed to start ${c.streamer.slug}: ${e}`);
    }
  }
  broadcastState();
}

// ─── Lifecycle ───────────────────────────────────────────────────
let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let _pool: Pool;

export function startScheduler(pool: Pool) {
  if (schedulerInterval) return;
  _pool = pool;
  pushLog("scheduler", "node",
    `started — maxWorkers=${cfg.maxWorkers} poll=${cfg.pollSec}s minWatch=${cfg.minWatchSec}s alert=x${cfg.alertMulti}`);
  tick().catch(console.error);
  schedulerInterval = setInterval(() => tick().catch(console.error), cfg.pollSec * 1000);
  broadcastState();
}

export function stopScheduler() {
  if (schedulerInterval) { clearInterval(schedulerInterval); schedulerInterval = null; }
  killAllWorkers("scheduler stopped");
  broadcastState();
}

export function isRunning() { return !!schedulerInterval; }