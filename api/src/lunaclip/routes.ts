// api/src/lunaclip/routes.ts
import { Router } from "express";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import { pool } from "../db.js";
import { addLunaClip } from "./clips.js";

export const lunaclipRouter = Router();

// ─────────────────────────────────────────────
// État du worker Python (en mémoire)
// ─────────────────────────────────────────────
interface WorkerState {
  process:    ChildProcess | null;
  sessionId:  bigint | null;
  status:     "idle" | "running" | "stopped" | "error";
  lastFrame:  FrameData | null;
  provider:   string | null;
  startedAt:  Date | null;
  hlsUrl:     string | null;
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

const worker: WorkerState = {
  process:   null,
  sessionId: null,
  status:    "idle",
  lastFrame: null,
  provider:  null,
  startedAt: null,
  hlsUrl:    null,
};


// ─────────────────────────────────────────────
// DB helpers
// ─────────────────────────────────────────────
async function createSession(hlsUrl: string, alertMulti: number, intervalSec: number) {
  const r = await pool.query(
    `INSERT INTO lunaclip_sessions (hls_url, status, alert_multi, interval_sec, started_at)
     VALUES ($1, 'running', $2, $3, NOW()) RETURNING id`,
    [hlsUrl, alertMulti, intervalSec]
  );
  return r.rows[0].id as bigint;
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

async function saveEvent(sessionId: bigint, f: FrameData, screenshotPath: string | null) {
  await pool.query(
    `INSERT INTO lunaclip_events
       (session_id, ts_sec, provider, in_bonus,
        multiplier, multiplier_source,
        bet_value, win_value, win_total_value, screenshot_path)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      sessionId, f.ts_sec, f.provider, f.in_bonus,
      f.multiplier, f.multiplier_source,
      f.bet_value, f.win_value, f.win_total_value, screenshotPath,
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
// Handler messages worker Python (stdout JSON)
// ─────────────────────────────────────────────
async function handleWorkerMessage(msg: { type: string; data: any }) {
  if (!worker.sessionId) return;

  if (msg.type === "frame") {
    const f = msg.data as FrameData;
    worker.lastFrame = f;
    if (f.provider && f.provider !== "unknown") worker.provider = f.provider;
    if (f.bet_numeric || f.win_numeric || f.win_total_numeric) {
      saveFrame(worker.sessionId, f).catch(console.error);
    }
    return;
  }

  if (msg.type === "event") {
    const { frame: f, screenshot_path } = msg.data as {
      frame: FrameData;
      screenshot_path: string | null;
    };
    worker.lastFrame = f;

    // 1. Persister l'event
    await saveEvent(worker.sessionId, f, screenshot_path ?? null).catch(console.error);

    // 2. Clip automatique rattaché à LUNACLIP_STREAMER_ID
    const streamerId = parseInt(process.env.LUNACLIP_STREAMER_ID ?? "0", 10);
    if (streamerId > 0) {
      const winLabel = f.win_total_value ?? f.win_value ?? "?";
      const title    = `🎰 x${f.multiplier} — ${(f.provider ?? "").toUpperCase()} — WIN ${winLabel}`;
      addLunaClip(pool, streamerId, title, f.ts_sec).catch(console.error);
    }

    console.log(`[lunaclip] EVENT x${f.multiplier} provider=${f.provider}`);
  }
}


// ─────────────────────────────────────────────
// Spawn worker Python
// ─────────────────────────────────────────────
function spawnWorker(hlsUrl: string, alertMulti: number, intervalSec: number) {
  // lunaclip-worker/ est à la racine du repo, process.cwd() = api/
  const workerPath = path.resolve(process.cwd(), "../lunaclip-worker/worker.py");

  const proc = spawn("python3", [
    workerPath,
    "--hls-url",     hlsUrl,
    "--alert-multi", String(alertMulti),
    "--interval",    String(intervalSec),
    "--mode",        "stream",
  ], { stdio: ["ignore", "pipe", "pipe"] });

  let buf = "";
  proc.stdout?.on("data", (chunk: Buffer) => {
    buf += chunk.toString();
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        handleWorkerMessage(JSON.parse(trimmed));
      } catch { /* logs debug Python non-JSON */ }
    }
  });

  proc.stderr?.on("data", (c: Buffer) =>
    console.error("[lunaclip-worker]", c.toString().trim())
  );

  proc.on("exit", (code) => {
    console.log(`[lunaclip-worker] exit code=${code}`);
    worker.process = null;
    worker.status  = code === 0 ? "stopped" : "error";
    if (worker.sessionId) {
      stopSession(worker.sessionId, code === 0 ? "stopped" : "error").catch(console.error);
    }
  });

  return proc;
}


// ─────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────

// POST /admin/lunaclip/start
lunaclipRouter.post("/start", async (req, res) => {
  if (worker.status === "running") {
    return res.status(409).json({ ok: false, error: "already_running" });
  }
  const { hls_url, alert_multi = 300, interval_sec = 1.0 } = req.body as {
    hls_url: string; alert_multi?: number; interval_sec?: number;
  };
  if (!hls_url) return res.status(400).json({ ok: false, error: "missing_hls_url" });

  try {
    const sessionId  = await createSession(hls_url, alert_multi, interval_sec);
    worker.sessionId = sessionId;
    worker.status    = "running";
    worker.lastFrame = null;
    worker.provider  = null;
    worker.startedAt = new Date();
    worker.hlsUrl    = hls_url;
    worker.process   = spawnWorker(hls_url, alert_multi, interval_sec);
    return res.json({ ok: true, session_id: sessionId.toString() });
  } catch (e) {
    console.error("[lunaclip/start]", e);
    return res.status(500).json({ ok: false, error: "start_failed" });
  }
});

// POST /admin/lunaclip/stop
lunaclipRouter.post("/stop", async (_req, res) => {
  if (worker.status !== "running" || !worker.process) {
    return res.status(409).json({ ok: false, error: "not_running" });
  }
  worker.process.kill("SIGTERM");
  worker.status = "stopped";
  if (worker.sessionId) await stopSession(worker.sessionId, "stopped").catch(console.error);
  return res.json({ ok: true });
});

// GET /admin/lunaclip/status  — polling toutes les 3s depuis le dashboard
lunaclipRouter.get("/status", (_req, res) => {
  res.json({
    ok:         true,
    status:     worker.status,
    session_id: worker.sessionId?.toString() ?? null,
    provider:   worker.provider,
    started_at: worker.startedAt,
    hls_url:    worker.hlsUrl,
    last_frame: worker.lastFrame,
  });
});

// GET /admin/lunaclip/sessions
lunaclipRouter.get("/sessions", async (_req, res) => {
  const r = await pool.query(
    `SELECT id, hls_url, provider, status, alert_multi, interval_sec,
            started_at, stopped_at, created_at
     FROM lunaclip_sessions ORDER BY created_at DESC LIMIT 50`
  );
  res.json({ ok: true, sessions: r.rows });
});

// GET /admin/lunaclip/sessions/:id/events
lunaclipRouter.get("/sessions/:id/events", async (req, res) => {
  const r = await pool.query(
    `SELECT * FROM lunaclip_events WHERE session_id=$1 ORDER BY triggered_at ASC`,
    [req.params.id]
  );
  res.json({ ok: true, events: r.rows });
});

// GET /admin/lunaclip/sessions/:id/frames  — pour le graphe multi
lunaclipRouter.get("/sessions/:id/frames", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 500), 2000);
  const r = await pool.query(
    `SELECT ts_sec, multiplier, multiplier_source, in_bonus,
            win_numeric, win_total_numeric, bet_numeric, free_spins
     FROM lunaclip_frames
     WHERE session_id=$1 AND multiplier IS NOT NULL
     ORDER BY captured_at ASC LIMIT $2`,
    [req.params.id, limit]
  );
  res.json({ ok: true, frames: r.rows });
});

// GET /admin/lunaclip/clips  — tous les clips créés par LunaClip
lunaclipRouter.get("/clips", async (req, res) => {
  const streamerId = parseInt(process.env.LUNACLIP_STREAMER_ID ?? "0", 10);
  if (!streamerId) return res.json({ ok: true, clips: [] });
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const r = await pool.query(
    `SELECT id, title, author, at_sec, pre_sec, post_sec, created_ts, vod_url
     FROM bot_clips
     WHERE streamer_id=$1 AND author='lunaclip'
     ORDER BY created_ts DESC LIMIT $2`,
    [streamerId, limit]
  );
  res.json({ ok: true, clips: r.rows });
});

// POST /admin/lunaclip/clips/manual  — clip manuel depuis le dashboard
lunaclipRouter.post("/clips/manual", async (_req, res) => {
  const streamerId = parseInt(process.env.LUNACLIP_STREAMER_ID ?? "0", 10);
  if (!streamerId) return res.status(400).json({ ok: false, error: "LUNACLIP_STREAMER_ID not set" });

  const f = worker.lastFrame;
  if (!f) return res.status(409).json({ ok: false, error: "no_frame_available" });

  const winLabel = f.win_total_value ?? f.win_value ?? "?";
  const title    = `🎰 [MANUEL] x${f.multiplier} — ${(f.provider ?? "").toUpperCase()} — WIN ${winLabel}`;
  const result   = await addLunaClip(pool, streamerId, title, f.ts_sec);
  res.json({ ok: result.ok, reason: (result as any).reason ?? null });
});

// PATCH /admin/lunaclip/config
lunaclipRouter.patch("/config", async (req, res) => {
  if (!worker.sessionId) return res.status(409).json({ ok: false, error: "no_active_session" });
  const { alert_multi } = req.body as { alert_multi?: number };
  if (alert_multi) {
    await pool.query(
      `UPDATE lunaclip_sessions SET alert_multi=$1 WHERE id=$2`,
      [alert_multi, worker.sessionId]
    );
  }
  res.json({ ok: true });
});