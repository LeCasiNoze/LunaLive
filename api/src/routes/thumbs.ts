// api/src/routes/thumbs.ts
import express from "express";
import type { Request as ExRequest, Response as ExResponse } from "express";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";

import { pool } from "../db.js";
import { r2Enabled, buildPublicUrl } from "../clips/r2.js";
import { fetchDliveLiveInfo } from "../dlive.js";

export const thumbsRouter = express.Router();

/* ───────────────────────────────────────────────────────────── */
/* ffmpeg: préfère le binaire système sur Render (évite SIGSEGV)  */
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
/* cache + fallback                                               */
/* ───────────────────────────────────────────────────────────── */

const CACHE_MS = 300_000; // 5 min
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
      if (marker === 0xc0 || marker === 0xc2) {
        const h = buf.readUInt16BE(i + 5);
        const w = buf.readUInt16BE(i + 7);
        if (w > 0 && h > 0) return { w, h };
        return null;
      }
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
/* DLive resolve + manifest discovery                              */
/* ───────────────────────────────────────────────────────────── */

type LiveResolve = {
  channelSlug: string; // ce qu'on donne à fetchDliveLiveInfo()
  username?: string | null; // optionnel
};

/**
 * - respecte le mode "dlive_use_linked"
 * - sinon utilise provider_accounts.channel_slug (ce que tu as en DB)
 */
async function resolveDliveFromStreamerSlug(slug: string): Promise<LiveResolve> {
  try {
    const { rows } = await pool.query(
      `
      SELECT
        s.slug,
        s.dlive_use_linked AS "useLinked",
        s.dlive_link_displayname AS "linkedDisplayname",
        s.dlive_link_username AS "linkedUsername",
        pa.channel_slug AS "providerChannelSlug",
        pa.channel_username AS "providerChannelUsername"
      FROM streamers s
      LEFT JOIN provider_accounts pa
        ON pa.provider='dlive'
       AND pa.assigned_to_streamer_id = s.id
      WHERE s.slug = $1
      LIMIT 1
      `,
      [slug]
    );

    const r = rows?.[0];
    if (!r) return { channelSlug: slug };

    const useLinked = !!r.useLinked;
    const channelSlug = String(
      (useLinked && r.linkedDisplayname) ? r.linkedDisplayname : (r.providerChannelSlug || slug)
    ).trim();

    const username = String(
      (useLinked && r.linkedUsername) ? r.linkedUsername : (r.providerChannelUsername || "")
    ).trim();

    return { channelSlug: channelSlug || slug, username: username || null };
  } catch {
    return { channelSlug: slug };
  }
}

function normalizeUrl(u: string): string {
  const s = String(u || "").trim();
  if (!s) return "";
  if (s.startsWith("//")) return `https:${s}`;
  return s;
}

/**
 * Extraction ultra robuste : récupère toutes les strings contenant ".m3u8"
 * dans l'objet info (y compris nested).
 */
function extractM3u8UrlsDeep(obj: any, out: Set<string>) {
  if (!obj) return;

  if (typeof obj === "string") {
    const s = normalizeUrl(obj);
    if (s.includes(".m3u8")) out.add(s);
    return;
  }

  if (Array.isArray(obj)) {
    for (const x of obj) extractM3u8UrlsDeep(x, out);
    return;
  }

  if (typeof obj === "object") {
    for (const k of Object.keys(obj)) extractM3u8UrlsDeep(obj[k], out);
  }
}

async function quickProbeUrl(url: string): Promise<{ ok: boolean; status: number; ct: string; err?: string }> {
  const u = normalizeUrl(url);
  if (!u) return { ok: false, status: 0, ct: "", err: "empty" };

  const headers: Record<string, string> = {
    "user-agent": "Mozilla/5.0",
    "referer": "https://dlive.tv/",
    "origin": "https://dlive.tv",
    "accept": "*/*",
  };

  // HEAD parfois refusé → on tente HEAD puis GET court
  const tries: Array<"HEAD" | "GET"> = ["HEAD", "GET"];

  for (const method of tries) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 2500);

    try {
      const res = await fetch(u, {
        method,
        headers,
        redirect: "follow",
        signal: ac.signal,
      });

      clearTimeout(t);

      const ct = res.headers.get("content-type") || "";
      // si 200 et ressemble à m3u8 -> ok
      const isPlaylist = ct.includes("mpegurl") || u.includes(".m3u8");

      if (res.ok && isPlaylist) return { ok: true, status: res.status, ct };
      // 403/400/404 => on laisse tomber cette candidate
      if (!res.ok) return { ok: false, status: res.status, ct, err: `http_${res.status}` };

      // ok mais ct bizarre → on accepte quand même si .m3u8
      if (res.ok && u.includes(".m3u8")) return { ok: true, status: res.status, ct };

      return { ok: false, status: res.status, ct, err: "not_playlist" };
    } catch (e: any) {
      clearTimeout(t);
      const msg = String(e?.name === "AbortError" ? "timeout" : (e?.message || "fetch_error"));
      // continue sur l'autre méthode
      if (method === "HEAD") continue;
      return { ok: false, status: 0, ct: "", err: msg };
    }
  }

  return { ok: false, status: 0, ct: "", err: "probe_failed" };
}

async function resolveBestLiveManifest(slug: string): Promise<{ url: string; debug: string }> {
  const r = await resolveDliveFromStreamerSlug(slug);

  // 1) API DLive : récupère une URL de playback signée si dispo
  let info: any = null;
  try {
    info = await fetchDliveLiveInfo(r.channelSlug);
  } catch (e: any) {
    return { url: "", debug: `dlive_api_failed:${String(e?.message || e)}` };
  }

  const set = new Set<string>();

  // tout ce qui ressemble à une m3u8 dans l'objet
  extractM3u8UrlsDeep(info, set);

  // 2) Fallbacks (en dernier) — peuvent marcher si DLive re-ouvre l’endpoint
  // (on met sans mobileweb aussi)
  const userCandidates = [
    r.username ? `https://live.prd.dlive.tv/hls/live/${encodeURIComponent(r.username)}.m3u8?mobileweb` : "",
    r.username ? `https://live.prd.dlive.tv/hls/live/${encodeURIComponent(r.username)}.m3u8` : "",
    r.channelSlug ? `https://live.prd.dlive.tv/hls/live/${encodeURIComponent(r.channelSlug)}.m3u8?mobileweb` : "",
    r.channelSlug ? `https://live.prd.dlive.tv/hls/live/${encodeURIComponent(r.channelSlug)}.m3u8` : "",
  ].map(normalizeUrl).filter(Boolean);

  for (const u of userCandidates) set.add(u);

  const candidates = Array.from(set);

  // si rien trouvé via API → on log
  if (!candidates.length) {
    return { url: "", debug: `no_m3u8_in_info channelSlug=${r.channelSlug} username=${r.username || ""}` };
  }

  // 3) Probe candidates, prend le premier OK
  const attempts: string[] = [];
  for (const u of candidates.slice(0, 12)) {
    const p = await quickProbeUrl(u);
    attempts.push(`${u} :: ${p.ok ? "ok" : (p.err || "bad")}`);
    if (p.ok) return { url: u, debug: attempts.join(" | ") };
  }

  return { url: "", debug: attempts.join(" | ") };
}

/* ───────────────────────────────────────────────────────────── */
/* Route: live thumb                                               */
/* ───────────────────────────────────────────────────────────── */

thumbsRouter.get("/thumbs/:slug.jpg", async (req: ExRequest, res: ExResponse) => {
  const slug = String(req.params.slug || "").trim();
  if (!slug) return res.status(400).end();

  const key = `live:${slug.toLowerCase()}`;

  // cache
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return sendCached(res, hit);

  // pas de ffmpeg => SVG
  if (!FFMPEG_OK) return sendSvg(res, svgFallback(slug));

  const { url: hlsUrl, debug } = await resolveBestLiveManifest(slug);

  if (!hlsUrl) {
    console.warn(`[thumbs] live manifest not usable slug=${slug} tried=${debug}`);
    return sendSvg(res, svgFallback(slug));
  }

  // headers HLS
  const HLS_HEADERS =
    "Origin: https://dlive.tv\r\n" +
    "Referer: https://dlive.tv/\r\n" +
    "User-Agent: Mozilla/5.0\r\n";

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
    console.warn(`[thumbs] ffmpeg spawn error bin=${FFMPEG_BIN} slug=${slug} url=${hlsUrl}`, e);
    return sendSvg(res, svgFallback(slug));
  });

  p.on("close", (code, signal) => {
    clearTimeout(killTimer);

    const buf = Buffer.concat(chunks);
    const dim = jpegSize(buf);

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
      `[thumbs] ffmpeg failed bin=${FFMPEG_BIN} slug=${slug} code=${code} signal=${signal} bytes=${buf.length} url=${hlsUrl} err=${stderr?.slice(0, 900) || ""}`
    );
    return sendSvg(res, svgFallback(slug));
  });
});

/* ───────────────────────────────────────────────────────────── */
/* Route: clip thumb                                               */
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

  // priorité MP4 (R2)
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
        `[thumbs] clip(mp4) ffmpeg failed bin=${FFMPEG_BIN} clipId=${clipId} code=${code} signal=${signal} bytes=${buf.length} err=${stderr?.slice(0, 900) || ""}`
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

  const HLS_HEADERS =
    "Origin: https://dlive.tv\r\n" +
    "Referer: https://dlive.tv/\r\n" +
    "User-Agent: Mozilla/5.0\r\n";

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
      `[thumbs] clip(vod) ffmpeg failed bin=${FFMPEG_BIN} clipId=${clipId} code=${code} signal=${signal} bytes=${buf.length} err=${stderr?.slice(0, 900) || ""}`
    );
    return sendSvg(res, svgFallback(title));
  });
});
