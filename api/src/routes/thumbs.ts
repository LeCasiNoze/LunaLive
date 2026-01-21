// api/src/routes/thumbs.ts
import express from "express";
import type { Request as ExRequest, Response as ExResponse } from "express";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { pool } from "../db.js";
import { r2Enabled, buildPublicUrl } from "../clips/r2.js";

export const thumbsRouter = express.Router();

/* ───────────────────────────────────────────────────────────── */
/* ffmpeg: préfère le binaire système sur Render (évite SIGSEGV)   */
/* ───────────────────────────────────────────────────────────── */

const require = createRequire(import.meta.url);
const ffmpegStatic: string | null = (() => {
  try {
    return require("ffmpeg-static");
  } catch {
    return null;
  }
})();

function canRun(bin: string) {
  try {
    const r = spawnSync(bin, ["-version"], { stdio: "ignore" });
    return r.status === 0;
  } catch {
    return false;
  }
}

const candidates = [
  (process.env.FFMPEG_PATH || "").trim() || null, // override explicite
  "ffmpeg", // binaire système (Render native)
  ffmpegStatic, // fallback local (Windows/dev)
].filter(Boolean) as string[];

const FFMPEG_BIN = (candidates.find(canRun) || candidates[0] || "ffmpeg").trim();
const FFMPEG_OK = canRun(FFMPEG_BIN);

console.log(`[thumbs] ffmpeg selected bin=${FFMPEG_BIN} ok=${FFMPEG_OK}`);

/* ───────────────────────────────────────────────────────────── */
/* cache + fallback                                                */
/* ───────────────────────────────────────────────────────────── */

const CACHE_MS = 300_000; // ✅ 5 min
const cache = new Map<string, { exp: number; buf: Buffer; contentType: string }>();

function sendCached(res: ExResponse, hit: { buf: Buffer; contentType: string }) {
  res.set("Content-Type", hit.contentType);
  res.set("Cache-Control", "public, max-age=300");
  return res.end(hit.buf);
}

function sendSvg(res: ExResponse, svg: string) {
  res.set("Content-Type", "image/svg+xml; charset=utf-8");
  res.set("Cache-Control", "public, max-age=300");
  return res.end(svg);
}

function svgFallback(label: string) {
  const text = String(label || "live").slice(0, 24);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b0b12"/>
      <stop offset="1" stop-color="#4b2bbd"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#g)"/>
  <text x="60" y="390" fill="rgba(255,255,255,0.92)" font-size="72" font-family="Inter, Arial" font-weight="800">
    ${text}
  </text>
</svg>`;
}

/* ───────────────────────────────────────────────────────────── */
/* helpers JPEG robustesse                                         */
/* ───────────────────────────────────────────────────────────── */

function isJpeg(buf: Buffer) {
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

// parse largeur/hauteur d’un JPEG (SOF0/SOF2)
function jpegSize(buf: Buffer): { w: number; h: number } | null {
  try {
    if (!isJpeg(buf)) return null;
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      // SOF0 (C0) ou SOF2 (C2) = dimensions
      if (marker === 0xc0 || marker === 0xc2) {
        const h = buf.readUInt16BE(i + 5);
        const w = buf.readUInt16BE(i + 7);
        if (w > 0 && h > 0) return { w, h };
        return null;
      }
      // skip segment
      const len = buf.readUInt16BE(i + 2);
      if (!len || len < 2) break;
      i += 2 + len;
    }
    return null;
  } catch {
    return null;
  }
}

/* ───────────────────────────────────────────────────────────── */
/* DLive / HLS                                                     */
/* ───────────────────────────────────────────────────────────── */

/**
 * IMPORTANT:
 * - slug (site) != username DLive (HLS)
 * - on récupère channel_username si dispo (provider_accounts), sinon slug.
 */
async function resolveDliveUsernameFromSlug(slug: string): Promise<string> {
  try {
    const { rows } = await pool.query(
      `
      SELECT
        COALESCE(pa.channel_username, pa.channel_slug, s.slug) AS u
      FROM streamers s
      LEFT JOIN provider_accounts pa
        ON pa.assigned_to_streamer_id = s.id
       AND pa.provider = 'dlive'
      WHERE s.slug = $1
      LIMIT 1
      `,
      [slug]
    );
    const u = rows[0]?.u;
    return String(u || slug).trim();
  } catch {
    return slug;
  }
}

function proxiedHlsUrl(dliveUsername: string) {
  const proxyBase = (process.env.HLS_PROXY_BASE || "https://lunalive-hls.lunalive.workers.dev/hls").replace(/\/$/, "");
  const manifest = `https://live.prd.dlive.tv/hls/live/${encodeURIComponent(dliveUsername)}.m3u8?mobileweb`;
  const u = encodeURIComponent(manifest);
  return proxyBase.includes("?") ? `${proxyBase}&u=${u}` : `${proxyBase}?u=${u}`;
}

// headers “browser-like” (DLive renvoie parfois 400 sans ça)
const HLS_HEADERS =
  "Origin: https://dlive.tv\r\n" +
  "Referer: https://dlive.tv/\r\n" +
  "User-Agent: Mozilla/5.0\r\n" +
  "Accept: */*\r\n";

/* ───────────────────────────────────────────────────────────── */
/* route LIVE: /thumbs/:slug.jpg                                   */
/* ───────────────────────────────────────────────────────────── */

thumbsRouter.get("/thumbs/:slug.jpg", async (req: ExRequest, res: ExResponse) => {
  const slug = String(req.params.slug || "").trim();
  if (!slug) return res.status(400).end();

  const key = slug.toLowerCase();

  // cache
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return sendCached(res, hit);

  // pas de ffmpeg => SVG
  if (!FFMPEG_OK) return sendSvg(res, svgFallback(slug));

  const dliveUser = await resolveDliveUsernameFromSlug(slug);

  // ✅ TOUJOURS via proxy (robuste + évite les 400 / CORS / host changes)
  const hlsUrl = proxiedHlsUrl(dliveUser);

  // debug utile
  // console.log(`[thumbs] live input slug=${slug} dliveUser=${dliveUser} hlsUrl=${hlsUrl}`);

  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-nostdin",

    // ✅ requis pour HLS + certains builds ffmpeg
    "-protocol_whitelist",
    "file,http,https,tcp,tls",

    // ✅ headers / UA (DLive sinon 400 aléatoire)
    "-headers",
    HLS_HEADERS,
    "-user_agent",
    "Mozilla/5.0",

    // ✅ meilleure résilience réseau
    "-rw_timeout",
    "15000000",
    "-reconnect",
    "1",
    "-reconnect_streamed",
    "1",
    "-reconnect_delay_max",
    "2",

    "-i",
    hlsUrl,

    "-an",
    "-frames:v",
    "1",
    "-vf",
    "scale=640:-1",
    "-q:v",
    "5",
    "-f",
    "image2pipe",
    "-vcodec",
    "mjpeg",
    "pipe:1",
  ];

  const p = spawn(FFMPEG_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });

  const chunks: Buffer[] = [];
  let stderr = "";

  const killTimer = setTimeout(() => {
    try {
      p.kill("SIGKILL");
    } catch {}
  }, 12_000);

  req.on("close", () => {
    try {
      p.kill("SIGKILL");
    } catch {}
  });

  p.stdout.on("data", (d: Buffer) => chunks.push(Buffer.from(d)));
  p.stderr.on("data", (d: Buffer) => (stderr += String(d)));

  p.on("error", (e) => {
    clearTimeout(killTimer);
    console.warn(`[thumbs] ffmpeg spawn error bin=${FFMPEG_BIN} slug=${slug} user=${dliveUser}`, e);
    return sendSvg(res, svgFallback(slug));
  });

  p.on("close", (code, signal) => {
    clearTimeout(killTimer);

    const buf = Buffer.concat(chunks);
    const dim = jpegSize(buf);

    // ✅ on accepte seulement si c’est un vrai jpeg + dimensions cohérentes
    const ok =
      code === 0 &&
      isJpeg(buf) &&
      dim != null &&
      dim.w >= 320 &&
      dim.h >= 180 &&
      buf.length > 1500;

    if (ok) {
      cache.set(key, { exp: Date.now() + CACHE_MS, buf, contentType: "image/jpeg" });
      res.set("Content-Type", "image/jpeg");
      res.set("Cache-Control", "public, max-age=300");
      return res.end(buf);
    }

    console.warn(
      `[thumbs] ffmpeg failed bin=${FFMPEG_BIN} slug=${slug} user=${dliveUser} code=${code} signal=${signal} bytes=${buf.length} err=${stderr?.slice(0, 1200) || ""}`
    );
    return sendSvg(res, svgFallback(slug));
  });
});

/* ───────────────────────────────────────────────────────────── */
/* route CLIP: /thumbs/clips/:id.jpg                                */
/* ───────────────────────────────────────────────────────────── */

thumbsRouter.get("/thumbs/clips/:id.jpg", async (req: ExRequest, res: ExResponse) => {
  const clipId = Number(req.params.id || 0);
  if (!Number.isFinite(clipId) || clipId <= 0) return res.status(400).end();

  const key = `clip:${clipId}`;

  // cache
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return sendCached(res, hit);

  // pas de ffmpeg => SVG
  if (!FFMPEG_OK) return sendSvg(res, svgFallback(`clip ${clipId}`));

  // charge clip
  const { rows } = await pool.query(
    `SELECT id, vod_url, at_sec, pre_sec, post_sec, title, mp4_key
     FROM bot_clips
     WHERE id=$1 AND deleted_ts IS NULL
     LIMIT 1`,
    [clipId]
  );

  const clip = rows?.[0] || null;
  if (!clip) return sendSvg(res, svgFallback(`clip ${clipId}`));

  const title = String(clip.title || `clip ${clipId}`);

  // ✅ priorité MP4 (R2) si dispo -> thumb fiable + rapide
  const mp4Key = clip.mp4_key ? String(clip.mp4_key).trim() : "";
  const mp4Url = mp4Key && r2Enabled() ? String(buildPublicUrl(mp4Key) || "").trim() : "";

  if (mp4Url) {
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-nostdin",
      "-rw_timeout",
      "15000000",
      "-ss",
      "1",
      "-i",
      mp4Url,
      "-an",
      "-frames:v",
      "1",
      "-vf",
      "scale=640:-1",
      "-q:v",
      "5",
      "-f",
      "image2pipe",
      "-vcodec",
      "mjpeg",
      "pipe:1",
    ];

    const p = spawn(FFMPEG_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });

    const chunks: Buffer[] = [];
    let stderr = "";

    const killTimer = setTimeout(() => {
      try {
        p.kill("SIGKILL");
      } catch {}
    }, 15_000);

    req.on("close", () => {
      try {
        p.kill("SIGKILL");
      } catch {}
    });

    p.stdout.on("data", (d: Buffer) => chunks.push(Buffer.from(d)));
    p.stderr.on("data", (d: Buffer) => (stderr += String(d)));

    p.on("error", (e) => {
      clearTimeout(killTimer);
      console.warn(`[thumbs] clip(mp4) ffmpeg spawn error bin=${FFMPEG_BIN} clipId=${clipId}`, e);
      return sendSvg(res, svgFallback(title));
    });

    p.on("close", (code, signal) => {
      clearTimeout(killTimer);

      const buf = Buffer.concat(chunks);
      const ok = code === 0 && buf.length > 5_000;

      if (ok) {
        cache.set(key, { exp: Date.now() + CACHE_MS, buf, contentType: "image/jpeg" });
        res.set("Content-Type", "image/jpeg");
        res.set("Cache-Control", "public, max-age=300");
        return res.end(buf);
      }

      console.warn(
        `[thumbs] clip(mp4) ffmpeg failed bin=${FFMPEG_BIN} clipId=${clipId} code=${code} signal=${signal} bytes=${buf.length} err=${stderr?.slice(0, 1200) || ""}`
      );
      return sendSvg(res, svgFallback(title));
    });

    return;
  }

  // fallback VOD HLS
  const vodUrl = clip.vod_url ? String(clip.vod_url) : "";
  if (!vodUrl) return sendSvg(res, svgFallback(title));

  const at = Math.max(0, Number(clip.at_sec || 0));
  const pre = Math.max(0, Number(clip.pre_sec || 105));
  const post = Math.max(0, Number(clip.post_sec || 15));

  const startSec = Math.max(0, at - pre);
  const durationSec = Math.max(1, pre + post);
  const previewSec = Math.min(startSec + 60, startSec + durationSec - 1);

  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-nostdin",
    "-protocol_whitelist",
    "file,http,https,tcp,tls",
    "-headers",
    HLS_HEADERS,
    "-user_agent",
    "Mozilla/5.0",
    "-rw_timeout",
    "15000000",
    "-ss",
    String(previewSec),
    "-i",
    vodUrl,
    "-an",
    "-frames:v",
    "1",
    "-vf",
    "scale=640:-1",
    "-q:v",
    "5",
    "-f",
    "image2pipe",
    "-vcodec",
    "mjpeg",
    "pipe:1",
  ];

  const p = spawn(FFMPEG_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });

  const chunks: Buffer[] = [];
  let stderr = "";

  const killTimer = setTimeout(() => {
    try {
      p.kill("SIGKILL");
    } catch {}
  }, 15_000);

  req.on("close", () => {
    try {
      p.kill("SIGKILL");
    } catch {}
  });

  p.stdout.on("data", (d: Buffer) => chunks.push(Buffer.from(d)));
  p.stderr.on("data", (d: Buffer) => (stderr += String(d)));

  p.on("error", (e) => {
    clearTimeout(killTimer);
    console.warn(`[thumbs] clip(vod) ffmpeg spawn error bin=${FFMPEG_BIN} clipId=${clipId}`, e);
    return sendSvg(res, svgFallback(title));
  });

  p.on("close", (code, signal) => {
    clearTimeout(killTimer);

    const buf = Buffer.concat(chunks);
    const ok = code === 0 && buf.length > 5_000;

    if (ok) {
      cache.set(key, { exp: Date.now() + CACHE_MS, buf, contentType: "image/jpeg" });
      res.set("Content-Type", "image/jpeg");
      res.set("Cache-Control", "public, max-age=300");
      return res.end(buf);
    }

    console.warn(
      `[thumbs] clip(vod) ffmpeg failed bin=${FFMPEG_BIN} clipId=${clipId} code=${code} signal=${signal} bytes=${buf.length} err=${stderr?.slice(0, 1200) || ""}`
    );
    return sendSvg(res, svgFallback(title));
  });
});
