// api/src/routes/thumbs.ts
import express from "express";
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
const ffmpegStatic = (() => {
    try {
        return require("ffmpeg-static");
    }
    catch {
        return null;
    }
})();
function canRun(bin) {
    try {
        const r = spawnSync(bin, ["-version"], { stdio: "ignore" });
        return r.status === 0;
    }
    catch {
        return false;
    }
}
const candidates = [
    (process.env.FFMPEG_PATH || "").trim() || null,
    "ffmpeg",
    ffmpegStatic,
].filter(Boolean);
const FFMPEG_BIN = (candidates.find(canRun) || candidates[0] || "ffmpeg").trim();
const FFMPEG_OK = canRun(FFMPEG_BIN);
console.log(`[thumbs] ffmpeg selected bin=${FFMPEG_BIN} ok=${FFMPEG_OK}`);
/* ───────────────────────────────────────────────────────────── */
/* cache + fallback                                               */
/* ───────────────────────────────────────────────────────────── */
const CACHE_MS = 300_000; // 5 min
const cache = new Map();
function sendCached(res, hit) {
    res.set("Content-Type", hit.contentType);
    res.set("Cache-Control", "public, max-age=300");
    return res.end(hit.buf);
}
function sendSvg(res, svg) {
    res.set("Content-Type", "image/svg+xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=300");
    return res.end(svg);
}
function svgFallback(label) {
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
function isJpeg(buf) {
    return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}
// parse largeur/hauteur d’un JPEG (SOF0/SOF2)
function jpegSize(buf) {
    try {
        if (!isJpeg(buf))
            return null;
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
                if (w > 0 && h > 0)
                    return { w, h };
                return null;
            }
            const len = buf.readUInt16BE(i + 2);
            if (!len || len < 2)
                break;
            i += 2 + len;
        }
        return null;
    }
    catch {
        return null;
    }
}
function normalizeUrl(u) {
    const s = String(u || "").trim();
    if (!s)
        return "";
    if (s.startsWith("//"))
        return `https:${s}`;
    return s;
}
async function fetchImageToBuffer(url) {
    const u = normalizeUrl(url);
    if (!u)
        return { ok: false, buf: Buffer.alloc(0), ct: "", status: 0 };
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
        if (!r.ok)
            return { ok: false, buf: Buffer.alloc(0), ct, status };
        const ab = await r.arrayBuffer();
        const buf = Buffer.from(ab);
        // garde-fous: il faut une vraie image
        const looksImage = ct.startsWith("image/");
        if (!looksImage || buf.length < 1500)
            return { ok: false, buf, ct, status };
        return { ok: true, buf, ct, status };
    }
    catch {
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
async function resolveDliveDisplaynameFromSlug(slug) {
    try {
        const { rows } = await pool.query(`
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
      `, [slug]);
        const dn = rows?.[0]?.displayname;
        return String(dn || slug).trim();
    }
    catch {
        return slug;
    }
}
/* ───────────────────────────────────────────────────────────── */
/* route LIVE : utilise thumbnailUrl (robuste)                    */
/* ───────────────────────────────────────────────────────────── */
thumbsRouter.get("/thumbs/:slug.jpg", async (req, res) => {
    const slug = String(req.params.slug || "").trim();
    if (!slug)
        return res.status(400).end();
    const key = `live:${slug.toLowerCase()}`;
    const hit = cache.get(key);
    if (hit && hit.exp > Date.now())
        return sendCached(res, hit);
    const displayname = await resolveDliveDisplaynameFromSlug(slug);
    let info = null;
    try {
        info = await fetchDliveLiveInfo(displayname);
    }
    catch (e) {
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
    console.warn(`[thumbs] thumbnail fetch failed slug=${slug} displayname=${displayname} status=${img.status} ct=${img.ct} url=${thumbUrl}`);
    return sendSvg(res, svgFallback(slug));
});
/* ───────────────────────────────────────────────────────────── */
/* route CLIPS : inchangé (mp4 r2 -> vod hls)                     */
/* ───────────────────────────────────────────────────────────── */
thumbsRouter.get("/thumbs/clips/:id.jpg", async (req, res) => {
    const clipId = Number(req.params.id || 0);
    if (!Number.isFinite(clipId) || clipId <= 0)
        return res.status(400).end();
    const key = `clip:${clipId}`;
    const hit = cache.get(key);
    if (hit && hit.exp > Date.now())
        return sendCached(res, hit);
    if (!FFMPEG_OK)
        return sendSvg(res, svgFallback(`clip ${clipId}`));
    const { rows } = await pool.query(`SELECT id, vod_url, at_sec, pre_sec, post_sec, title, mp4_key
     FROM bot_clips
     WHERE id=$1 AND deleted_ts IS NULL
     LIMIT 1`, [clipId]);
    const clip = rows?.[0] || null;
    if (!clip)
        return sendSvg(res, svgFallback(`clip ${clipId}`));
    const title = String(clip.title || `clip ${clipId}`);
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
        const chunks = [];
        let stderr = "";
        const killTimer = setTimeout(() => {
            try {
                p.kill("SIGKILL");
            }
            catch { }
        }, 15_000);
        req.on("close", () => {
            try {
                p.kill("SIGKILL");
            }
            catch { }
        });
        p.stdout.on("data", (d) => chunks.push(Buffer.from(d)));
        p.stderr.on("data", (d) => (stderr += String(d)));
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
            console.warn(`[thumbs] clip(mp4) ffmpeg failed bin=${FFMPEG_BIN} clipId=${clipId} code=${code} signal=${signal} bytes=${buf.length} err=${stderr?.slice(0, 900) || ""}`);
            return sendSvg(res, svgFallback(title));
        });
        return;
    }
    const vodUrl = clip.vod_url ? String(clip.vod_url) : "";
    if (!vodUrl)
        return sendSvg(res, svgFallback(title));
    const at = Math.max(0, Number(clip.at_sec || 0));
    const pre = Math.max(0, Number(clip.pre_sec || 105));
    const post = Math.max(0, Number(clip.post_sec || 15));
    const startSec = Math.max(0, at - pre);
    const durationSec = Math.max(1, pre + post);
    const previewSec = Math.min(startSec + 60, startSec + durationSec - 1);
    const HLS_HEADERS = "Origin: https://dlive.tv\r\n" +
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
    const chunks = [];
    let stderr = "";
    const killTimer = setTimeout(() => {
        try {
            p.kill("SIGKILL");
        }
        catch { }
    }, 15_000);
    req.on("close", () => {
        try {
            p.kill("SIGKILL");
        }
        catch { }
    });
    p.stdout.on("data", (d) => chunks.push(Buffer.from(d)));
    p.stderr.on("data", (d) => (stderr += String(d)));
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
        console.warn(`[thumbs] clip(vod) ffmpeg failed bin=${FFMPEG_BIN} clipId=${clipId} code=${code} signal=${signal} bytes=${buf.length} err=${stderr?.slice(0, 900) || ""}`);
        return sendSvg(res, svgFallback(title));
    });
});
