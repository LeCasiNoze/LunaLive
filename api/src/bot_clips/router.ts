// api/src/bot_clips/router.ts
import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import EventEmitter from "node:events";

import type { Request, Response, NextFunction } from "express";
import { pool } from "../db.js";
import { requireAuth, type AuthUser } from "../auth.js";
import {
  ensureBotClips,
  getClipForStreamer,
  listClipsForStreamer,
  removeClipForStreamer,
  type BotClipRow,
} from "./store.js";

/* ---------------- util ---------------- */

function safeName(s: string) {
  return String(s || "no-title").replace(/[^a-z0-9-_]+/gi, "_");
}
function nowMs() {
  return Date.now();
}
function parseHMS(s: string): number {
  const m = /^(\d+):(\d+):(\d+(?:\.\d+)?)$/.exec(String(s || "").trim());
  if (!m) return 0;
  const h = +m[1],
    mi = +m[2],
    se = +m[3];
  return Math.max(0, Math.floor(h * 3600 + mi * 60 + se));
}
function hhmmss(t: number) {
  t = Math.max(0, Math.floor(t));
  const h = Math.floor(t / 3600),
    m = Math.floor((t % 3600) / 60),
    s = t % 60;
  return h > 0
    ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/* ---------------- auth: streamer ---------------- */

type AuthedReq = Request & { user?: AuthUser; streamerId?: number };

async function requireStreamer(req: AuthedReq, res: Response, next: NextFunction) {
  const uid = req.user?.id;
  if (!uid) return res.status(401).json({ ok: false, reason: "unauthorized" });

  const r = await pool.query(`SELECT id FROM streamers WHERE user_id=$1 LIMIT 1`, [uid]);
  const streamerId = Number(r.rows?.[0]?.id || 0);
  if (!streamerId) return res.status(403).json({ ok: false, reason: "not_streamer" });

  req.streamerId = streamerId;
  return next();
}

/* ---------------- jobs en mémoire ---------------- */

type JobStatus = "queued" | "running" | "done" | "error";
type Job = {
  id: string;
  streamerId: number;
  clipId: number;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  status: JobStatus;
  message?: string;
  error?: string | null;

  percent: number;
  secondsDone: number;
  secondsTotal: number;
  etaSec?: number;

  outPath?: string;
  outSize?: number;
  stderrTail?: string;

  _proc?: any;
  _events: EventEmitter;
};

const JOBS = new Map<string, Job>();

function snapshot(job: Job) {
  return {
    id: job.id,
    status: job.status,
    message: job.message || null,
    error: job.error || null,
    percent: Math.max(0, Math.min(100, Math.floor(job.percent))),
    secondsDone: job.secondsDone,
    secondsTotal: job.secondsTotal,
    etaSec: typeof job.etaSec === "number" ? Math.max(0, Math.floor(job.etaSec)) : null,
    outReady: !!(job.outPath && fs.existsSync(job.outPath)),
    outPath: job.outPath || null,
    outSize: job.outSize || null,
    clipId: job.clipId,
    streamerId: job.streamerId,
    startedAt: job.startedAt || null,
    finishedAt: job.finishedAt || null,
    stderrTail: job.stderrTail || null,
  };
}

function newJob(streamerId: number, clipId: number, secondsTotal: number): Job {
  const id = `${streamerId}_${clipId}_${nowMs()}`;
  const job: Job = {
    id,
    streamerId,
    clipId,
    createdAt: nowMs(),
    status: "queued",
    message: "En file",
    percent: 0,
    secondsDone: 0,
    secondsTotal,
    _events: new EventEmitter(),
  };
  JOBS.set(id, job);
  return job;
}

function updateJob(job: Job, patch: Partial<Job>) {
  Object.assign(job, patch);
  try {
    job._events.emit("tick", snapshot(job));
  } catch {}
}

function removeJob(job: Job) {
  try {
    job._events.removeAllListeners();
  } catch {}
  JOBS.delete(job.id);
}

function getFfmpegPath(): string {
  const envPath = process.env.FFMPEG_PATH && String(process.env.FFMPEG_PATH).trim();
  if (envPath) return envPath;
  // ⚠️ si tu veux ffmpeg-static: installe-le et remplace ici
  return "ffmpeg";
}

function startFfmpeg(job: Job, vodUrl: string, startSec: number, durSec: number, title: string) {
  const tmpName = `clip-${job.clipId}-${safeName(title)}-${startSec}-${durSec}-${job.id}.mp4`;
  const outPath = path.join(os.tmpdir(), tmpName);
  try {
    fs.unlinkSync(outPath);
  } catch {}

  const ffmpegPath = getFfmpegPath();
  const HLS_HEADERS =
    "Origin: https://dlive.tv\r\n" +
    "Referer: https://dlive.tv/\r\n" +
    "User-Agent: Mozilla/5.0\r\n";

  const args: string[] = [];
  const add = (k: string, v?: string | number) => {
    args.push(k);
    if (typeof v !== "undefined") args.push(String(v));
  };

  add("-hide_banner");
  add("-loglevel", "error");
  add("-nostdin");
  add("-progress", "pipe:2");
  add("-nostats");

  add("-protocol_whitelist", "file,http,https,tcp,tls");
  add("-headers", HLS_HEADERS);
  add("-user_agent", "Mozilla/5.0");

  // ✅ FAST: input-seek
  add("-ss", startSec);
  add("-i", vodUrl);

  add("-t", durSec);

  add("-map", "0:v:0");
  add("-map", "0:a:0?");
  add("-c", "copy");
  add("-bsf:a", "aac_adtstoasc");
  add("-movflags", "+faststart");
  add("-avoid_negative_ts", "make_zero");

  add("-y");
  args.push(outPath);

  const startedAt = nowMs();
  updateJob(job, { status: "running", message: "Démarrage ffmpeg", startedAt, outPath });

  const proc = spawn(ffmpegPath, args, { windowsHide: true });
  job._proc = proc;

  let lastOutSec = 0;
  let stderrTail = "";

  proc.stderr.setEncoding("utf8");
  proc.stderr.on("data", (chunk: string) => {
    stderrTail += chunk;
    if (stderrTail.length > 20_000) stderrTail = stderrTail.slice(-20_000);

    let outMs: number | null = null;
    let outTimeText: string | null = null;
    let progressFlag: string | null = null;

    for (const line of chunk.split(/\r?\n/)) {
      const i = line.indexOf("=");
      const k = i >= 0 ? line.slice(0, i) : line;
      const v = i >= 0 ? line.slice(i + 1).trim() : "";
      if (k === "out_time_ms") outMs = Number(v);
      else if (k === "out_time") outTimeText = v;
      else if (k === "progress") progressFlag = v;
    }

    let done = lastOutSec;
    if (Number.isFinite(outMs as number) && (outMs as number) > 0) {
      done = Math.floor((outMs as number) / 1_000_000);
    } else if (outTimeText) {
      done = parseHMS(outTimeText);
    }

    if (done >= 0) {
      lastOutSec = Math.max(lastOutSec, Math.min(durSec, done));
      const pct = (lastOutSec / durSec) * 100;
      const elapsed = Math.max(1, Math.floor((nowMs() - (job.startedAt || startedAt)) / 1000));
      const rate = lastOutSec / elapsed;
      const eta = rate > 0 ? Math.max(0, Math.ceil((durSec - lastOutSec) / rate)) : null;

      updateJob(job, {
        message: progressFlag === "end" ? "Finalisation…" : "Extraction",
        secondsDone: lastOutSec,
        percent: pct,
        etaSec: eta ?? undefined,
        stderrTail,
      });
    }
  });

  proc.on("error", (e) => {
    updateJob(job, {
      status: "error",
      message: `ffmpeg error: ${e?.message || e}`,
      error: String(e?.message || e),
      stderrTail,
    });
  });

  proc.on("close", (code: number) => {
    if (code === 0 && job.outPath && fs.existsSync(job.outPath)) {
      const size = fs.statSync(job.outPath).size;
      updateJob(job, {
        status: "done",
        message: "Terminé",
        percent: 100,
        secondsDone: durSec,
        etaSec: 0,
        outSize: size,
        finishedAt: nowMs(),
        stderrTail,
      });
      try {
        job._events.emit("tick", { ...snapshot(job), done: true });
      } catch {}
    } else {
      updateJob(job, { status: "error", message: `ffmpeg exit ${code}`, error: `ffmpeg exit ${code}`, stderrTail });
      try {
        job._events.emit("tick", snapshot(job));
      } catch {}
    }
  });
}

/* ---------------- router ---------------- */

export const botClipsRouter = express.Router();

// safety (si index.ts n’a pas encore appelé ensure)
botClipsRouter.use(async (_req, _res, next) => {
  try {
    await ensureBotClips();
  } catch {}
  next();
});

// Toutes les routes ici = streamer dashboard
botClipsRouter.use(requireAuth, requireStreamer);

/* (1) LIST */
botClipsRouter.get("/list", async (req: AuthedReq, res) => {
  const streamerId = Number(req.streamerId || 0);
  const limit = Math.min(1000, Math.max(1, Number(req.query?.limit || 200)));

  const rows = await listClipsForStreamer(streamerId, limit);

  const items = rows.map((r: BotClipRow) => {
    const t = Math.max(0, Number(r.at_sec || 0));
    const base = r.vod_url ? String(r.vod_url) : null;
    const sep = base && base.includes("?") ? "&" : "?";
    const vod_link = base ? `${base}${sep}t=${t}s` : null;

    return {
      id: Number(r.id),
      streamer_id: Number(r.streamer_id),
      title: r.title ?? null,
      author: r.author ?? null,
      at_sec: Number(r.at_sec || 0),
      pre_sec: Number(r.pre_sec || 105),
      post_sec: Number(r.post_sec || 15),
      created_ts: Number(r.created_ts || 0),
      vod_url: r.vod_url ?? null,
      vod_permlink: r.vod_permlink ?? null,
      vod_created_ts: r.vod_created_ts ?? null,
      vod_link,
      timecode_str: hhmmss(t),
    };
  });

  return res.json({ ok: true, items });
});

/* (2) DELETE */
botClipsRouter.post("/delete", express.json(), async (req: AuthedReq, res) => {
  const streamerId = Number(req.streamerId || 0);
  const id = Number(req.body?.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, reason: "id_required" });

  const n = await removeClipForStreamer(streamerId, id);
  return res.json({ ok: true, removed: n });
});

/* (3) DOWNLOAD START */
botClipsRouter.post("/download/start", express.json(), async (req: AuthedReq, res) => {
  try {
    const streamerId = Number(req.streamerId || 0);
    const clipId = Number(req.body?.id);
    if (!Number.isFinite(clipId) || clipId <= 0) return res.status(400).json({ ok: false, reason: "id_required" });

    const clip = await getClipForStreamer(streamerId, clipId);
    if (!clip) return res.status(404).json({ ok: false, reason: "clip_not_found" });
    if (!clip.vod_url) return res.status(409).json({ ok: false, reason: "vod_not_ready" });

    const pre = Math.max(0, Number(clip.pre_sec || 105));
    const post = Math.max(0, Number(clip.post_sec || 15));
    const dur = Math.max(1, pre + post);

    const start = Math.max(0, Number(clip.at_sec || 0) - pre);

    const job = newJob(streamerId, clipId, dur);
    updateJob(job, { status: "running", message: "Préparation…", percent: 3 });

    const head = await fetch(clip.vod_url, {
      method: "GET",
      headers: {
        Origin: "https://dlive.tv",
        Referer: "https://dlive.tv/",
        "User-Agent": "Mozilla/5.0",
      },
    }).catch(() => null);

    if (!head || !head.ok) {
      updateJob(job, { status: "error", message: `VOD inaccessible (HTTP ${head?.status || 0})`, error: "vod_unreachable" });
      return res.json({ ok: true, job: job.id, started: false });
    }

    startFfmpeg(job, clip.vod_url, start, dur, clip.title || "");
    return res.json({ ok: true, job: job.id, started: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, reason: String(e?.message || e) });
  }
});

/* (4) DOWNLOAD PROGRESS (SSE) */
botClipsRouter.get("/download/progress", async (req, res) => {
  const id = String(req.query?.job || "");
  const job = JOBS.get(id);
  if (!job) return res.status(404).json({ ok: false, reason: "job_not_found" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const send = (event: string, data: any) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  send("tick", snapshot(job));

  const onTick = (payload: any) => send("tick", payload);
  job._events.on("tick", onTick);

  const hb = setInterval(() => {
    try {
      res.write(": hb\n\n");
    } catch {}
  }, 15000);

  req.on("close", () => {
    clearInterval(hb);
    job._events.off("tick", onTick);
    try {
      res.end();
    } catch {}
  });
});

/* (5) DOWNLOAD FILE */
botClipsRouter.get("/download/file", async (req: AuthedReq, res) => {
  try {
    const id = String(req.query?.job || "");
    const job = JOBS.get(id);
    if (!job) return res.status(404).json({ ok: false, reason: "job_not_found" });

    const deadline = Date.now() + 2000;
    while (job.status === "done" && job.outPath && !fs.existsSync(job.outPath) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }

    if (job.status !== "done" || !job.outPath || !fs.existsSync(job.outPath)) {
      return res.status(409).json({ ok: false, reason: "not_ready", job: snapshot(job) });
    }

    const stat = fs.statSync(job.outPath);

    const rawName = String(req.query?.dlname || "").trim();
    const safe = rawName.replace(/[^\w.\-]+/g, "_").replace(/^_+|_+$/g, "") || path.basename(job.outPath);

    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Length", String(stat.size));
    res.setHeader("Content-Disposition", `attachment; filename="${safe}"`);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Accel-Buffering", "no");

    const rs = fs.createReadStream(job.outPath);
    rs.on("close", () => {
      try {
        fs.unlinkSync(job.outPath!);
      } catch {}
      removeJob(job);
    });
    rs.pipe(res);
  } catch (e: any) {
    return res.status(500).json({ ok: false, reason: String(e?.message || "send_failed") });
  }
});
