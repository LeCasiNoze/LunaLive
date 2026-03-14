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
  (process.env.FFMPEG_PATH || "").trim() || null,
  "ffmpeg",
  ffmpegStatic,
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

function normalizeUrl(u: any): string {
  const s = String(u || "").trim();
  if (!s) return "";
  if (s.startsWith("//")) return `https:${s}`;
  return s;
}

async function fetchImageToBuffer(url: string): Promise<{ ok: boolean; buf: Buffer; ct: string; status: number }> {
  const u = normalizeUrl(url);
  if (!u) return { ok: false, buf: Buffer.alloc(0), ct: "", status: 0 };

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 6500);

  try {
    const r = await fetch(u, {
      method: "GET",
      redirect: "follow",
      signal: ac.signal,
      headers: {
        accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "user-agent": "Mozilla/5.0",
        referer: "https://dlive.tv/",
        origin: "https://dlive.tv",
      },
    });

    clearTimeout(t);

    const ct = r.headers.get("content-type") || "";
    const status = r.status;
    if (!r.ok) return { ok: false, buf: Buffer.alloc(0), ct, status };

    const ab = await r.arrayBuffer();
    const buf = Buffer.from(ab);

    // garde-fous: il faut une vraie image
    const looksImage = ct.startsWith("image/");
    if (!looksImage || buf.length < 1500) return { ok: false, buf, ct, status };

    return { ok: true, buf, ct, status };
  } catch {
    clearTimeout(t);
    return { ok: false, buf: Buffer.alloc(0), ct: "", status: 0 };
  }
}

/**
 * IMPORTANT:
 * - slug (site) != displayname DLive
 * - on récupère channel_slug côté provider_accounts (displayname)
 * - support dlive_use_linked (si tu l’utilises)
 */
async function resolveDliveDisplaynameFromSlug(slug: string): Promise<string> {
  try {
    const { rows } = await pool.query(
      `
      SELECT
        CASE
          WHEN s.dlive_use_linked = TRUE AND s.dlive_link_displayname IS NOT NULL
            THEN s.dlive_link_displayname
          ELSE COALESCE(pa.channel_slug, s.slug)
        END AS displayname
      FROM streamers s
      LEFT JOIN provider_accounts pa
        ON pa.provider='dlive'
       AND pa.assigned_to_streamer_id = s.id
      WHERE s.slug = $1
      LIMIT 1
      `,
      [slug]
    );
    const dn = rows?.[0]?.displayname;
    return String(dn || slug).trim();
  } catch {
    return slug;
  }
}

/* ───────────────────────────────────────────────────────────── */
/* route LIVE : utilise thumbnailUrl (robuste)                    */
/* ───────────────────────────────────────────────────────────── */

thumbsRouter.get("/thumbs/:slug.jpg", async (req: ExRequest, res: ExResponse) => {
  const slug = String(req.params.slug || "").trim();
  if (!slug) return res.status(400).end();

  const key = `live:${slug.toLowerCase()}`;

  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return sendCached(res, hit);

  const displayname = await resolveDliveDisplaynameFromSlug(slug);

  let info: any = null;
  try {
    info = await fetchDliveLiveInfo(displayname);
  } catch (e: any) {
    console.warn(`[thumbs] dlive fetch failed slug=${slug} displayname=${displayname}`, String(e?.message || e));
    return sendSvg(res, svgFallback(slug));
  }

  const thumbUrl = normalizeUrl(info?.thumbnailUrl);

  // si pas live ou pas de thumb => fallback SVG
  if (!thumbUrl) {
    // (optionnel) log léger
    // console.log(`[thumbs] no thumbnailUrl slug=${slug} displayname=${displayname} live=${!!info?.isLive}`);
    return sendSvg(res, svgFallback(slug));
  }

  // récupère l'image DLive
  const img = await fetchImageToBuffer(thumbUrl);

  if (img.ok) {
    cache.set(key, { exp: Date.now() + CACHE_MS, buf: img.buf, contentType: img.ct || "image/jpeg" });
    res.set("Content-Type", img.ct || "image/jpeg");
    res.set("Cache-Control", "public, max-age=300");
    return res.end(img.buf);
  }

  console.warn(
    `[thumbs] thumbnail fetch failed slug=${slug} displayname=${displayname} status=${img.status} ct=${img.ct} url=${thumbUrl}`
  );
  return sendSvg(res, svgFallback(slug));
});

/* ───────────────────────────────────────────────────────────── */
/* route CLIPS : inchangé (mp4 r2 -> vod hls)                     */
/* ───────────────────────────────────────────────────────────── */

thumbsRouter.get("/thumbs/clips/:id.jpg", async (req: ExRequest, res: ExResponse) => {
  const clipId = Number(req.params.id || 0);
  if (!Number.isFinite(clipId) || clipId <= 0) return res.status(400).end();

  // ✅ GARDE-FOU TEMPORAIRE: vérifier thumbnail_url en BDD d'abord
  const { rows } = await pool.query(
    `SELECT thumbnail_url FROM bot_clips WHERE id = $1 AND deleted_ts IS NULL LIMIT 1`,
    [clipId]
  );

  const clip = rows?.[0];
  if (!clip) return res.status(404).end();

  // ✅ Si thumbnail_url existe, rediriger vers l'URL stockée (pas de FFMPEG)
  if (clip.thumbnail_url) {
    try {
      return res.redirect(302, clip.thumbnail_url);
    } catch {
      // Si redirection échoue, continuer vers fallback
    }
  }

  // ✅ GARDE-FOU TEMPORAIRE: désactiver fallback FFMPEG pour éviter les spawns massifs
  // Retourner SVG placeholder au lieu de générer dynamiquement
  console.warn(`[thumbs] Fallback désactivé pour clip ${clipId} - pas de thumbnail_url`);
  return sendSvg(res, svgFallback(`clip ${clipId}`));
});
