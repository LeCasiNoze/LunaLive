// server/scheduler.ts
// LunaClip Local Scheduler — adapté de bot/src/lunaclip/scheduler.ts
// Tourne localement, écrit dans la même DB Render, spawn worker Python local
import path from "path";
const DLIVE_GQL = process.env.DLIVE_GRAPHQL_ENDPOINT ?? "https://graphigo.prd.dlive.tv/";
const HLS_PROXY_BASE = String(process.env.HLS_PROXY_BASE ?? "https://lunalive-hls.lunalive.workers.dev").replace(/\/$/, "");
function proxifyHls(raw) {
    return `${HLS_PROXY_BASE}/hls?u=${encodeURIComponent(raw)}`;
}
// ─── Config runtime (modifiable à chaud) ────────────────────────
export let cfg = {
    alertMulti: parseFloat(process.env.LUNACLIP_ALERT_MULTI ?? "300"),
    intervalS: parseFloat(process.env.LUNACLIP_INTERVAL ?? "2.0"),
    minWatchSec: parseFloat(process.env.LUNACLIP_MIN_WATCH_SEC ?? "1200"),
    maxWorkers: parseInt(process.env.LUNACLIP_MAX_WORKERS ?? "1", 10),
    pollSec: 60,
    // Paramètres perf worker
    frameW: 960,
    frameH: 540,
    imgsz: 640,
    cropScale: 4,
    psm: 7,
    postSleep: 0.15,
};
// ─── Log ring buffer ─────────────────────────────────────────────
const LOG_BUFFER_SIZE = 500;
const logBuffer = [];
const logListeners = new Set();
export function pushLog(slug, source, msg) {
    const entry = { ts: Date.now(), slug, source, msg };
    logBuffer.push(entry);
    if (logBuffer.length > LOG_BUFFER_SIZE)
        logBuffer.shift();
    logListeners.forEach(fn => fn(entry));
}
export function onLog(fn) { logListeners.add(fn); }
export function offLog(fn) { logListeners.delete(fn); }
export function getLogs(limit = 200, slug, source) {
    let buf = logBuffer;
    if (slug)
        buf = buf.filter(e => e.slug === slug);
    if (source)
        buf = buf.filter(e => e.source === source);
    return buf.slice(-limit);
}
export const activeWorkers = new Map();
export const skippedWorkers = new Set();
export const waitingWorkers = new Set();
const priorityQueue = new Set();
const lastWatchedAt = new Map();
const stateListeners = new Set();
const previewListeners = new Set();
export function onPreview(fn) { previewListeners.add(fn); }
export function offPreview(fn) { previewListeners.delete(fn); }
// ─── Lock ────────────────────────────────────────────────────────
let LOCKED_STREAMER_ID = null;
let LOCKED_UNTIL_MS = null;
export function getLockState() {
    return {
        locked_streamer_id: LOCKED_STREAMER_ID,
        locked_until_ms: LOCKED_UNTIL_MS,
        locked: LOCKED_STREAMER_ID != null,
    };
}
export function setLock(streamerId, durationSec) {
    if (!streamerId) {
        LOCKED_STREAMER_ID = null;
        LOCKED_UNTIL_MS = null;
        pushLog("scheduler", "node", "lock cleared");
    }
    else {
        LOCKED_STREAMER_ID = streamerId;
        LOCKED_UNTIL_MS = durationSec == null
            ? null
            : Date.now() + Math.max(60, durationSec) * 1000;
        pushLog("scheduler", "node", `lock → #${streamerId} (${durationSec == null ? "unlimited" : durationSec + "s"})`);
        priorityQueue.add(streamerId);
    }
    broadcastState();
    tick().catch(console.error);
}
function isLockActive() {
    if (!LOCKED_STREAMER_ID)
        return false;
    if (!LOCKED_UNTIL_MS)
        return true;
    if (Date.now() <= LOCKED_UNTIL_MS)
        return true;
    pushLog("scheduler", "node", "lock expired");
    LOCKED_STREAMER_ID = null;
    LOCKED_UNTIL_MS = null;
    return false;
}
// ─── Contrôles publics ───────────────────────────────────────────
export function forceSwitch(streamerId) {
    priorityQueue.add(streamerId);
    pushLog("scheduler", "node", `forceSwitch #${streamerId}`);
    tick().catch(console.error);
}
export function setMaxWorkers(n) {
    cfg.maxWorkers = Math.max(1, Math.min(4, n));
    pushLog("scheduler", "node", `maxWorkers → ${cfg.maxWorkers}`);
    broadcastState();
    tick().catch(console.error);
}
export function setMinWatchSec(sec) {
    cfg.minWatchSec = Math.max(60, Math.min(7200, sec));
    pushLog("scheduler", "node", `minWatchSec → ${cfg.minWatchSec}s`);
}
export function setAlertMulti(n) {
    cfg.alertMulti = Math.max(10, n);
    pushLog("scheduler", "node", `alertMulti → x${cfg.alertMulti} (restarting workers)`);
    for (const [sid, w] of activeWorkers) {
        if (w.status === "running")
            killWorker(w, "alert_multi changed");
        activeWorkers.delete(sid);
    }
    broadcastState();
    tick().catch(console.error);
}
export function setConfig(patch) {
    const needsRestart = patch.frameW !== undefined || patch.frameH !== undefined
        || patch.imgsz !== undefined || patch.cropScale !== undefined
        || patch.postSleep !== undefined
        || patch.intervalS !== undefined;
    Object.assign(cfg, patch);
    pushLog("scheduler", "node", `config updated: ${JSON.stringify(patch)}`);
    if (needsRestart) {
        pushLog("scheduler", "node", "restarting workers for config change");
        for (const [sid, w] of activeWorkers) {
            if (w.status === "running")
                killWorker(w, "config changed");
            activeWorkers.delete(sid);
        }
        tick().catch(console.error);
    }
    broadcastState();
}
export function skipStreamer(streamerId) {
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
export function restartWorker(streamerId) {
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
        if (w.status === "running")
            killWorker(w, reason);
        activeWorkers.delete(sid);
    }
    broadcastState();
}
export function getSchedulerState() {
    return {
        enabled: !!schedulerInterval,
        cfg,
        ...getLockState(),
        waiting: [...waitingWorkers],
        skipped: [...skippedWorkers],
        priority: [...priorityQueue],
        workers: [...activeWorkers.values()].map(w => ({
            streamerId: w.streamerId,
            streamerSlug: w.streamerSlug,
            dliveSlug: w.dliveSlug,
            status: w.status,
            startedAt: w.startedAt.toISOString(),
            provider: w.provider,
            hlsUrl: w.hlsUrl,
            lastFrame: w.lastFrame,
            workerStats: w.workerStats,
            pid: w.pid,
        })),
    };
}
// ─── State broadcast ─────────────────────────────────────────────
export function onStateChange(fn) { stateListeners.add(fn); }
export function offStateChange(fn) { stateListeners.delete(fn); }
function broadcastState() { stateListeners.forEach(fn => fn()); }
// ─── DLive GQL ───────────────────────────────────────────────────
async function dliveGql(query, variables) {
    const r = await fetch(DLIVE_GQL, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            accept: "application/json",
            origin: "https://dlive.tv",
            referer: "https://dlive.tv/",
        },
        body: JSON.stringify({ query, variables }),
    });
    if (!r.ok)
        throw new Error(`dlive_gql_http_${r.status}`);
    return r.json();
}
async function getDliveHlsUrl(displayname) {
    try {
        const q = `query GetHls($name:String!){
      userByDisplayName(displayname:$name){
        username livestream { createdAt }
      }
    }`;
        const j = await dliveGql(q, { name: displayname });
        const ls = j?.data?.userByDisplayName;
        if (!ls?.livestream?.createdAt)
            return null;
        return {
            hls: `https://live.prd.dlive.tv/hls/live/${ls.username}.m3u8`,
            liveCreatedAtMs: Number(ls.livestream.createdAt),
        };
    }
    catch {
        return null;
    }
}
// ─── DB helpers ──────────────────────────────────────────────────
async function getLunaLiveStreamers(pool) {
    const r = await pool.query(`
    SELECT s.id, s.slug, s.display_name,
           s.dlive_use_linked, s.dlive_link_displayname,
           pa.channel_slug AS provider_channel_slug
    FROM streamers s
    LEFT JOIN provider_accounts pa
      ON pa.provider = 'dlive' AND pa.assigned_to_streamer_id = s.id
    WHERE s.id IS NOT NULL ORDER BY s.id
  `);
    return r.rows;
}
function getDisplayName(s) {
    if (s.dlive_use_linked && s.dlive_link_displayname)
        return s.dlive_link_displayname;
    if (s.provider_channel_slug)
        return s.provider_channel_slug;
    return null;
}
async function createSession(pool, streamerId, hlsUrl) {
    const r = await pool.query(`INSERT INTO lunaclip_sessions (hls_url, status, alert_multi, interval_sec, started_at)
     VALUES ($1, 'running', $2, $3, NOW()) RETURNING id`, [hlsUrl, cfg.alertMulti, cfg.intervalS]);
    const id = r.rows[0].id;
    await pool.query(`UPDATE lunaclip_sessions SET streamer_id=$1 WHERE id=$2`, [streamerId, id]).catch(() => { });
    return id;
}
async function stopSession(pool, sessionId, status) {
    await pool.query(`UPDATE lunaclip_sessions SET status=$1, stopped_at=NOW() WHERE id=$2`, [status, sessionId]).catch(() => { });
}
async function saveFrame(pool, sessionId, f) {
    await pool.query(`INSERT INTO lunaclip_frames
       (session_id, ts_sec, provider, in_bonus,
        bet_value, bet_numeric, win_value, win_numeric,
        win_total_value, win_total_numeric,
        free_spins, multiplier, multiplier_source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [sessionId, f.ts_sec, f.provider, f.in_bonus,
        f.bet_value, f.bet_numeric, f.win_value, f.win_numeric,
        f.win_total_value, f.win_total_numeric,
        f.free_spins, f.multiplier, f.multiplier_source]).catch(() => { });
}
async function saveEvent(pool, sessionId, f, screenshot) {
    await pool.query(`INSERT INTO lunaclip_events
       (session_id, ts_sec, provider, in_bonus,
        multiplier, multiplier_source,
        bet_value, win_value, win_total_value, screenshot_path)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [sessionId, f.ts_sec, f.provider, f.in_bonus,
        f.multiplier, f.multiplier_source,
        f.bet_value, f.win_value, f.win_total_value, screenshot]).catch(() => { });
    if (f.provider && f.provider !== "unknown") {
        await pool.query(`UPDATE lunaclip_sessions SET provider=$1 WHERE id=$2`, [f.provider, sessionId]).catch(() => { });
    }
}
function pickNextBatch(candidates) {
    const result = [];
    if (isLockActive() && LOCKED_STREAMER_ID != null) {
        const locked = candidates.find(c => c.streamer.id === LOCKED_STREAMER_ID);
        if (locked)
            result.push(locked);
        return result.slice(0, 1);
    }
    // keep active workers if not exceeded minWatchSec
    for (const [id, w] of activeWorkers) {
        if (result.length >= cfg.maxWorkers)
            break;
        if (w.status !== "running")
            continue;
        const still = candidates.find(c => c.streamer.id === id);
        if (!still)
            continue;
        const elapsed = (Date.now() - w.startedAt.getTime()) / 1000;
        if (elapsed < cfg.minWatchSec && !priorityQueue.has(id)) {
            if (!result.find(r => r.streamer.id === id))
                result.push(still);
        }
    }
    // priority queue
    for (const pid of [...priorityQueue]) {
        if (result.length >= cfg.maxWorkers)
            break;
        const c = candidates.find(c => c.streamer.id === pid);
        if (c && !result.find(r => r.streamer.id === pid)) {
            result.push(c);
            priorityQueue.delete(pid);
        }
    }
    // never watched
    for (const c of candidates.filter(c => c.lastWatched === 0 && !result.find(r => r.streamer.id === c.streamer.id))) {
        if (result.length >= cfg.maxWorkers)
            break;
        result.push(c);
    }
    // oldest first
    for (const c of [...candidates]
        .filter(c => !result.find(r => r.streamer.id === c.streamer.id))
        .sort((a, b) => a.lastWatched - b.lastWatched)) {
        if (result.length >= cfg.maxWorkers)
            break;
        result.push(c);
    }
    return result.slice(0, cfg.maxWorkers);
}
// ─── Worker Python (DÉSACTIVÉ pour Render) ───────────────────────────
// NOTE: Le worker IA (YOLO + OCR) tourne désormais dans un service séparé
// Ce bot Render ne doit plus lancer de worker Python local
const WORKER_PATH = process.env.WORKER_PATH
    ?? path.resolve(process.cwd(), "worker", "worker.py");
const PYTHON_BIN = process.env.PYTHON_BIN ?? "python";
function defaultWorkerStats() {
    return { mode: "ACTIVE", consecutive_unknown: 0, frames_total: 0, frames_with_value: 0, last_value_secs_ago: 0 };
}
function spawnWorker(pool, w) {
    // DÉSACTIVÉ: Le worker IA ne tourne plus dans ce service Render
    pushLog(w.streamerSlug, "node", `Worker IA désactivé - tourne dans un service séparé`);
    w.status = "stopped"; // Garder un status valide pour le type
    stopSession(pool, w.sessionId, "stopped").catch(() => { });
    broadcastState();
    return;
}
// Fonctions worker conservées pour compatibilité mais non utilisées
function handleMessage(pool, w, msg) {
    // DÉSACTIVÉ: Plus de messages Python à traiter
    pushLog(w.streamerSlug, "node", `Worker IA désactivé - message ignoré: ${msg.type}`);
}
function killWorker(w, reason) {
    // DÉSACTIVÉ: Plus de process Python à tuer
    pushLog(w.streamerSlug, "node", `Worker IA déjà désactivé (${reason})`);
    w.status = "stopped"; // Garder un status valide pour le type
    w.pid = null;
}
// ─── Tick ────────────────────────────────────────────────────────
async function tick() {
    if (!_pool)
        return;
    let streamers;
    try {
        streamers = await getLunaLiveStreamers(_pool);
    }
    catch (e) {
        pushLog("scheduler", "node", `DB error: ${e}`);
        return;
    }
    skippedWorkers.clear();
    waitingWorkers.clear();
    // cleanup dead workers
    for (const [sid, w] of activeWorkers) {
        if (w.status !== "running" || !streamers.some(s => s.id === sid)) {
            if (w.status === "running")
                killWorker(w, "streamer removed");
            activeWorkers.delete(sid);
        }
    }
    // build candidates (parallel DLive checks)
    const checks = streamers.map(async (s) => {
        const dliveSlug = getDisplayName(s);
        if (!dliveSlug)
            return null;
        let info = null;
        try {
            info = await getDliveHlsUrl(dliveSlug);
        }
        catch { }
        if (!info) {
            const w = activeWorkers.get(s.id);
            if (w) {
                killWorker(w, "stream ended");
                activeWorkers.delete(s.id);
            }
            return null;
        }
        return { streamer: s, dliveSlug, rawHls: info.hls, liveCreatedAtMs: info.liveCreatedAtMs, lastWatched: lastWatchedAt.get(s.id) ?? 0 };
    });
    const results = await Promise.all(checks);
    const candidates = results.filter(Boolean);
    if (candidates.length === 0) {
        pushLog("scheduler", "node", "aucun streamer en live");
        broadcastState();
        return;
    }
    const chosen = pickNextBatch(candidates);
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
        if (activeWorkers.has(c.streamer.id))
            continue;
        pushLog("scheduler", "node", `START ${c.streamer.slug} (${c.dliveSlug}) | waiting: ${[...waitingWorkers].join(", ") || "—"}`);
        try {
            const sessionId = await createSession(_pool, c.streamer.id, c.rawHls);
            const proxiedHls = proxifyHls(c.rawHls);
            const w = {
                streamerId: c.streamer.id, streamerSlug: c.streamer.slug, dliveSlug: c.dliveSlug,
                sessionId, liveCreatedAtMs: c.liveCreatedAtMs,
                process: null,
                status: "running", startedAt: new Date(),
                lastFrame: null, lastPreview: null, provider: null, hlsUrl: proxiedHls,
                workerStats: defaultWorkerStats(), pid: null, ffmpegPid: null,
            };
            spawnWorker(_pool, w);
            activeWorkers.set(c.streamer.id, w);
        }
        catch (e) {
            pushLog("scheduler", "node", `Failed to start ${c.streamer.slug}: ${e}`);
        }
    }
    broadcastState();
}
// ─── Lifecycle ───────────────────────────────────────────────────
let schedulerInterval = null;
let _pool;
export function startScheduler(pool) {
    if (schedulerInterval)
        return;
    _pool = pool;
    pushLog("scheduler", "node", `started — maxWorkers=${cfg.maxWorkers} poll=${cfg.pollSec}s minWatch=${cfg.minWatchSec}s alert=x${cfg.alertMulti}`);
    tick().catch(console.error);
    schedulerInterval = setInterval(() => tick().catch(console.error), cfg.pollSec * 1000);
    broadcastState();
}
export function stopScheduler() {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
    }
    killAllWorkers("scheduler stopped");
    broadcastState();
}
export function isRunning() { return !!schedulerInterval; }
