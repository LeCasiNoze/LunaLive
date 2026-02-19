// api/src/lunaclip/scheduler.ts
//
// Tourne en arrière-plan dans Node.
// Toutes les 60s :
//   1. Interroge DLive GraphQL pour chaque streamer LunaLive
//   2. Démarre un worker Python pour chaque stream en live sans worker actif
//   3. Arrête les workers dont le stream s'est terminé
//
// Démarre via startLunaClipScheduler() appelé dans server.ts / app startup.

import { spawn, ChildProcess } from "child_process";
import path from "path";
import { pool } from "../db.js";
import { addLunaClip } from "./clips.js";

const DLIVE_GQL   = process.env.DLIVE_GRAPHQL_ENDPOINT ?? "https://graphigo.prd.dlive.tv/";
const API_BASE    = String(
  process.env.API_BASE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  "http://localhost:3000"
).replace(/\/$/, "");
const POLL_SEC    = 60;
const ALERT_MULTI = parseFloat(process.env.LUNACLIP_ALERT_MULTI ?? "300");
const INTERVAL_S  = parseFloat(process.env.LUNACLIP_INTERVAL ?? "1.0");
const WORKER_PATH = path.resolve(process.cwd(), "./lunaclip-worker/worker.py");

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface StreamerRow {
  id:                    number;
  slug:                  string;
  display_name:          string;
  dlive_use_linked:      boolean;
  dlive_link_displayname: string | null;
  provider_channel_slug: string | null;
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
}

// Un worker actif par streamerId
interface ActiveWorker {
  streamerId:  number;
  streamerSlug: string;
  dliveSlug:   string;
  sessionId:   bigint;
  process:     ChildProcess;
  status:      "running" | "stopped" | "error";
  startedAt:   Date;
  lastFrame:   FrameData | null;
  provider:    string | null;
  hlsUrl:      string;
}

// Map streamerId -> worker
export const activeWorkers = new Map<number, ActiveWorker>();


// ─────────────────────────────────────────────
// DLive GraphQL
// ─────────────────────────────────────────────
async function dliveGql(query: string, variables: any) {
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
  return r.json() as Promise<any>;
}

async function isStreamerLive(dliveDisplayname: string): Promise<boolean> {
  try {
    const q = `query IsLive($name:String!){
      userByDisplayName(displayname:$name){
        livestream { createdAt }
      }
    }`;
    const j = await dliveGql(q, { name: dliveDisplayname });
    return !!j?.data?.userByDisplayName?.livestream?.createdAt;
  } catch {
    return false;
  }
}

// Construit l'URL HLS directe DLive pour un displayname
// Pattern validé : https://live.prd.dlive.tv/hls/live/<username>.m3u8
// On utilise le username (pas le displayname) — récupéré via GraphQL
async function getDliveHlsUrl(dliveDisplayname: string): Promise<string | null> {
  try {
    const q = `query GetHls($name:String!){
      userByDisplayName(displayname:$name){
        username
        livestream { createdAt }
      }
    }`;
    const j = await dliveGql(q, { name: dliveDisplayname });
    const ls = j?.data?.userByDisplayName;
    if (!ls?.livestream?.createdAt) return null; // pas en live

    const username = ls.username as string;
    if (!username) return null;

    const rawHls = `https://live.prd.dlive.tv/hls/live/${username}.m3u8`;

    // Passer par le proxy interne /hls (accepte *.dlive.tv)
    const proxied = `${API_BASE}/hls?u=${encodeURIComponent(rawHls)}`;
    return proxied;
  } catch {
    return null;
  }
}


// ─────────────────────────────────────────────
// DB helpers
// ─────────────────────────────────────────────
async function getLunaLiveStreamers(): Promise<StreamerRow[]> {
  const r = await pool.query(`
    SELECT
      s.id,
      s.slug,
      s.display_name,
      s.dlive_use_linked,
      s.dlive_link_displayname,
      pa.channel_slug AS provider_channel_slug
    FROM streamers s
    LEFT JOIN provider_accounts pa
      ON pa.provider = 'dlive'
     AND pa.assigned_to_streamer_id = s.id
    WHERE s.id IS NOT NULL
    ORDER BY s.id
  `);
  return r.rows as StreamerRow[];
}

function getDisplayName(s: StreamerRow): string | null {
  if (s.dlive_use_linked && s.dlive_link_displayname) return s.dlive_link_displayname;
  if (s.provider_channel_slug) return s.provider_channel_slug;
  return null;
}

async function createSession(
  streamerId: number,
  hlsUrl: string,
  alertMulti: number,
  intervalSec: number
): Promise<bigint> {
  const r = await pool.query(
    `INSERT INTO lunaclip_sessions
       (hls_url, status, alert_multi, interval_sec, started_at)
     VALUES ($1, 'running', $2, $3, NOW())
     RETURNING id`,
    [hlsUrl, alertMulti, intervalSec]
  );
  // Stocker le lien session <-> streamer
  const sessionId = r.rows[0].id as bigint;
  await pool.query(
    `UPDATE lunaclip_sessions SET streamer_id = $1 WHERE id = $2`,
    [streamerId, sessionId]
  ).catch(() => {/* colonne pas encore dispo — migration à faire */});
  return sessionId;
}

async function stopSession(sessionId: bigint, status: "stopped" | "error") {
  await pool.query(
    `UPDATE lunaclip_sessions SET status=$1, stopped_at=NOW() WHERE id=$2`,
    [status, sessionId]
  );
}

async function saveFrame(sessionId: bigint, f: FrameData) {
  await pool.query(
    `INSERT INTO lunaclip_frames
       (session_id, ts_sec, provider, in_bonus,
        bet_value, bet_numeric, win_value, win_numeric,
        win_total_value, win_total_numeric,
        free_spins, multiplier, multiplier_source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      sessionId, f.ts_sec, f.provider, f.in_bonus,
      f.bet_value, f.bet_numeric, f.win_value, f.win_numeric,
      f.win_total_value, f.win_total_numeric,
      f.free_spins, f.multiplier, f.multiplier_source,
    ]
  );
}

async function saveEvent(sessionId: bigint, f: FrameData, screenshot: string | null) {
  await pool.query(
    `INSERT INTO lunaclip_events
       (session_id, ts_sec, provider, in_bonus,
        multiplier, multiplier_source,
        bet_value, win_value, win_total_value, screenshot_path)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      sessionId, f.ts_sec, f.provider, f.in_bonus,
      f.multiplier, f.multiplier_source,
      f.bet_value, f.win_value, f.win_total_value, screenshot,
    ]
  );
  if (f.provider && f.provider !== "unknown") {
    await pool.query(
      `UPDATE lunaclip_sessions SET provider=$1 WHERE id=$2`,
      [f.provider, sessionId]
    );
  }
}


// ─────────────────────────────────────────────
// Worker Python — spawn / stop
// ─────────────────────────────────────────────
function spawnWorker(w: ActiveWorker) {
  const proc = spawn("python3", [
    WORKER_PATH,
    "--hls-url",     w.hlsUrl,
    "--alert-multi", String(ALERT_MULTI),
    "--interval",    String(INTERVAL_S),
    "--mode",        "stream",
  ], { stdio: ["ignore", "pipe", "pipe"] });

  let buf = "";
  proc.stdout?.on("data", (chunk: Buffer) => {
    buf += chunk.toString();
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      try { handleMessage(w, JSON.parse(t)); }
      catch { /* logs Python non-JSON */ }
    }
  });

  proc.stderr?.on("data", (c: Buffer) =>
    console.error(`[lunaclip][${w.streamerSlug}]`, c.toString().trim())
  );

  proc.on("exit", (code) => {
    console.log(`[lunaclip][${w.streamerSlug}] worker exit code=${code}`);
    w.status = code === 0 ? "stopped" : "error";
    w.process = proc;
    stopSession(w.sessionId, w.status as "stopped" | "error").catch(console.error);
    // Ne pas supprimer de activeWorkers ici — le scheduler le fera au prochain tick
    // si le stream n'est plus en live
  });

  w.process = proc;
  w.status  = "running";
}

async function handleMessage(w: ActiveWorker, msg: { type: string; data: any }) {
  if (msg.type === "frame") {
    const f = msg.data as FrameData;
    w.lastFrame = f;
    if (f.provider && f.provider !== "unknown") w.provider = f.provider;
    if (f.bet_numeric || f.win_numeric || f.win_total_numeric) {
      saveFrame(w.sessionId, f).catch(console.error);
    }
    return;
  }

  if (msg.type === "event") {
    const { frame: f, screenshot_path } = msg.data as {
      frame: FrameData;
      screenshot_path: string | null;
    };
    w.lastFrame = f;
    await saveEvent(w.sessionId, f, screenshot_path ?? null).catch(console.error);

    // Clip auto rattaché au BON streamer (option A)
    const winLabel = f.win_total_value ?? f.win_value ?? "?";
    const title    = `🎰 x${f.multiplier} — ${(f.provider ?? "").toUpperCase()} — WIN ${winLabel}`;
    addLunaClip(pool, w.streamerId, title, f.ts_sec).catch(console.error);

    console.log(`[lunaclip][${w.streamerSlug}] EVENT x${f.multiplier} provider=${f.provider}`);
  }
}

function killWorker(w: ActiveWorker, reason: string) {
  console.log(`[lunaclip][${w.streamerSlug}] stopping worker (${reason})`);
  try { w.process.kill("SIGTERM"); } catch { /* déjà mort */ }
  w.status = "stopped";
  stopSession(w.sessionId, "stopped").catch(console.error);
}


// ─────────────────────────────────────────────
// Tick principal du scheduler
// ─────────────────────────────────────────────
async function tick() {
  let streamers: StreamerRow[];
  try {
    streamers = await getLunaLiveStreamers();
  } catch (e) {
    console.error("[lunaclip-scheduler] DB error:", e);
    return;
  }

  // Pour chaque streamer : vérifier si en live
  for (const s of streamers) {
    const dliveSlug = getDisplayName(s);
    if (!dliveSlug) continue; // pas de compte DLive configuré

    const existing = activeWorkers.get(s.id);

    // Worker actif mais process mort → nettoyer
    if (existing && existing.status !== "running") {
      activeWorkers.delete(s.id);
    }

    const alreadyRunning = activeWorkers.has(s.id);

    let hlsUrl: string | null = null;
    try {
      hlsUrl = await getDliveHlsUrl(dliveSlug);
    } catch {
      hlsUrl = null;
    }

    const isLive = hlsUrl !== null;

    if (isLive && !alreadyRunning) {
      // → Démarrer un nouveau worker
      console.log(`[lunaclip-scheduler] START worker for ${s.slug} (${dliveSlug})`);
      try {
        const sessionId = await createSession(s.id, hlsUrl!, ALERT_MULTI, INTERVAL_S);
        const w: ActiveWorker = {
          streamerId:   s.id,
          streamerSlug: s.slug,
          dliveSlug,
          sessionId,
          process:      null as any, // rempli par spawnWorker
          status:       "running",
          startedAt:    new Date(),
          lastFrame:    null,
          provider:     null,
          hlsUrl:       hlsUrl!,
        };
        spawnWorker(w);
        activeWorkers.set(s.id, w);
      } catch (e) {
        console.error(`[lunaclip-scheduler] Failed to start for ${s.slug}:`, e);
      }
    }

    if (!isLive && alreadyRunning) {
      // → Stream terminé, arrêter le worker
      const w = activeWorkers.get(s.id)!;
      killWorker(w, "stream ended");
      activeWorkers.delete(s.id);
    }
  }

  // Arrêter les workers dont le streamerId n'est plus dans la liste
  for (const [sid, w] of activeWorkers) {
    const stillExists = streamers.some(s => s.id === sid);
    if (!stillExists) {
      killWorker(w, "streamer removed");
      activeWorkers.delete(sid);
    }
  }
}


// ─────────────────────────────────────────────
// Export public
// ─────────────────────────────────────────────
let schedulerInterval: ReturnType<typeof setInterval> | null = null;

export function startLunaClipScheduler() {
  if (schedulerInterval) return; // déjà démarré
  console.log(`[lunaclip-scheduler] started (poll every ${POLL_SEC}s, alert x${ALERT_MULTI})`);

  // Premier tick immédiat
  tick().catch(console.error);

  schedulerInterval = setInterval(() => {
    tick().catch(console.error);
  }, POLL_SEC * 1000);
}

export function stopLunaClipScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  for (const [sid, w] of activeWorkers) {
    killWorker(w, "scheduler stopped");
    activeWorkers.delete(sid);
  }
}