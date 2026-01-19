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
  setClipMp4Error,
  setClipMp4Success,
  type BotClipRow,
} from "./store.js";

import { r2Enabled, buildPublicUrl, putFileToR2 } from "../clips/r2.js";

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

function getFfmpegPath(): string {
  const envPath = process.env.FFMPEG_PATH && String(process.env.FFMPEG_PATH).trim();
  if (envPath) return envPath;
  return "ffmpeg";
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

  r2Key?: string | null;
  publicUrl?: string | null;

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

    r2Key: job.r2Key || null,
    publicUrl: job.publicUrl || null,

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

/* ---------------- ffmpeg render -> upload R2 ---------------- */

function startFfmpegToMp4(job: Job, vodUrl: string, startSec: number, durSec: number, title: string, r2Key: string) {
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

  // ✅ FAST: input-seek (HLS)
  add("-ss", startSec);
  add("-i", vodUrl);

  // ✅ only the clip duration
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
  updateJob(job, {
    status: "running",
    message: "Extraction (ffmpeg)",
    startedAt,
    outPath,
    r2Key,
    publicUrl: null,
  });

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
      const pct = (lastOutSec / durSec) * 88; // 0..88% (upload gardé pour fin)
      const elapsed = Math.max(1, Math.floor((nowMs() - (job.startedAt || startedAt)) / 1000));
      const rate = lastOutSec / elapsed;
      const eta = rate > 0 ? Math.max(0, Math.ceil((durSec - lastOutSec) / rate)) : null;

      updateJob(job, {
        message: progressFlag === "end" ? "Finalisation…" : "Extraction (ffmpeg)",
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
    void (async () => {
      if (code !== 0 || !job.outPath || !fs.existsSync(job.outPath)) {
        const err = `ffmpeg exit ${code}`;
        updateJob(job, { status: "error", message: err, error: err, stderrTail });
        await setClipMp4Error(job.clipId, err).catch(() => {});
        return;
      }

      // upload R2
      let size = 0;
      try {
        size = fs.statSync(job.outPath).size;
      } catch {}

      updateJob(job, {
        message: "Upload R2…",
        percent: 92,
        outSize: size || undefined,
        etaSec: null as any,
      });

      try {
        await putFileToR2({
          key: r2Key,
          contentType: "video/mp4",
          filePath: job.outPath,
        });

        const pub = buildPublicUrl(r2Key) || null;

        await setClipMp4Success(job.clipId, { mp4_key: r2Key, mp4_size: size }).catch(() => {});
        updateJob(job, {
          status: "done",
          message: "Terminé (R2)",
          percent: 100,
          finishedAt: nowMs(),
          r2Key,
          publicUrl: pub,
          outSize: size,
          secondsDone: durSec,
          etaSec: 0,
        });

        try {
          job._events.emit("tick", { ...snapshot(job), done: true });
        } catch {}
      } catch (e: any) {
        const msg = String(e?.message || e || "upload_failed");
        await setClipMp4Error(job.clipId, msg).catch(() => {});
        updateJob(job, { status: "error", message: "Upload R2 échoué", error: msg, stderrTail });
      } finally {
        try {
          if (job.outPath && fs.existsSync(job.outPath)) fs.unlinkSync(job.outPath);
        } catch {}
      }
    })();
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

botClipsRouter.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
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
    const at = Math.max(0, Number(r.at_sec || 0));
    const pre = Math.max(0, Number(r.pre_sec || 105));
    const startSec = Math.max(0, at - pre);

    const base = r.vod_url ? String(r.vod_url) : null;
    const sep = base && base.includes("?") ? "&" : "?";
    const vod_link = base ? `${base}${sep}t=${startSec}s` : null;

    const mp4_key = (r.mp4_key ? String(r.mp4_key) : "").trim() || null;
    const mp4_url = mp4_key ? buildPublicUrl(mp4_key) : null;

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
      timecode_str: hhmmss(startSec),

      mp4_key,
      mp4_url,
      mp4_ready_ts: (r.mp4_ready_ts as any) ?? null,
      mp4_size: (r.mp4_size as any) ?? null,
      mp4_error: (r.mp4_error as any) ?? null,
      mp4_rendering: !!(r.mp4_rendering as any),
    };
  });

  return res.json({ ok: true, items });
});

/* (2) DELETE (hide) */
botClipsRouter.post("/delete", express.json(), async (req: AuthedReq, res) => {
  const streamerId = Number(req.streamerId || 0);
  const id = Number(req.body?.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, reason: "id_required" });

  const n = await removeClipForStreamer(streamerId, id);
  return res.json({ ok: true, hidden: n });
});

/**
 * (3) RENDER START (compat: endpoint inchangé)
 * - extrait uniquement le clip (pre+post) depuis la VOD
 * - upload MP4 sur R2
 * - écrit mp4_key/mp4_ready_ts/mp4_size dans bot_clips
 */
botClipsRouter.post("/download/start", express.json(), async (req: AuthedReq, res) => {
  try {
    if (!r2Enabled()) return res.status(409).json({ ok: false, reason: "r2_not_configured" });

    const streamerId = Number(req.streamerId || 0);
    const clipId = Number(req.body?.id);
    if (!Number.isFinite(clipId) || clipId <= 0) return res.status(400).json({ ok: false, reason: "id_required" });

    const clip = await getClipForStreamer(streamerId, clipId);
    if (!clip) return res.status(404).json({ ok: false, reason: "clip_not_found" });
    if (!clip.vod_url) return res.status(409).json({ ok: false, reason: "vod_not_ready" });

    const existingKey = (clip.mp4_key ? String(clip.mp4_key) : "").trim();
    if (existingKey) {
      return res.json({
        ok: true,
        already: true,
        mp4_key: existingKey,
        mp4_url: buildPublicUrl(existingKey),
      });
    }

    const pre = Math.max(0, Number(clip.pre_sec || 105));
    const post = Math.max(0, Number(clip.post_sec || 15));
    const dur = Math.max(1, pre + post);
    const start = Math.max(0, Number(clip.at_sec || 0) - pre);

    const job = newJob(streamerId, clipId, dur);
    updateJob(job, { status: "running", message: "Préparation…", percent: 2 });

    // check vod reachable
    const head = await fetch(clip.vod_url, {
      method: "GET",
      headers: {
        Origin: "https://dlive.tv",
        Referer: "https://dlive.tv/",
        "User-Agent": "Mozilla/5.0",
      },
    }).catch(() => null);

    if (!head || !head.ok) {
      const msg = `VOD inaccessible (HTTP ${head?.status || 0})`;
      updateJob(job, { status: "error", message: msg, error: "vod_unreachable" });
      await setClipMp4Error(clipId, "vod_unreachable").catch(() => {});
      return res.json({ ok: true, job: job.id, started: false });
    }

    const r2Key = `clips/${clipId}.mp4`;
    startFfmpegToMp4(job, clip.vod_url, start, dur, clip.title || "", r2Key);

    return res.json({ ok: true, job: job.id, started: true });
  } catch (e: any) {
    return res.status(500).json({ ok: false, reason: String(e?.message || e) });
  }
});

/* (4) PROGRESS (SSE) */
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

/**
 * (5) DOWNLOAD FILE (compatible)
 * - maintenant le fichier est sur R2 => redirect URL public
 */
botClipsRouter.get("/download/file", async (req: AuthedReq, res) => {
  try {
    const id = String(req.query?.job || "");
    const job = JOBS.get(id);
    if (!job) return res.status(404).json({ ok: false, reason: "job_not_found" });

    if (job.status !== "done" || !job.r2Key) {
      return res.status(409).json({ ok: false, reason: "not_ready", job: snapshot(job) });
    }

    const url = buildPublicUrl(job.r2Key);
    if (!url) return res.status(409).json({ ok: false, reason: "r2_not_ready", job: snapshot(job) });

    res.setHeader("Cache-Control", "no-store");
    return res.redirect(302, url);
  } catch (e: any) {
    return res.status(500).json({ ok: false, reason: String(e?.message || "send_failed") });
  }
});
