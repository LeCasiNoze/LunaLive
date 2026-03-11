// api/src/clips/clip_mp4_worker.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pool } from "../db.js";
import { ensureBotClips, claimOneClipToRenderMp4, setClipMp4Error, setClipMp4Success, listMp4KeysToCleanup, clearMp4Key, } from "../bot_clips/store.js";
import { r2Enabled, putFileToR2, deleteFromR2 } from "./r2.js";
/* ─────────────────────────────────────────────
   Config
───────────────────────────────────────────── */
function envNum(name, def) {
    const v = Number(process.env[name]);
    return Number.isFinite(v) ? v : def;
}
function nowMs() {
    return Date.now();
}
const TTL_DAYS = envNum("CLIPS_TTL_DAYS", 15);
const RENDER_INTERVAL_SEC = envNum("CLIPS_RENDER_INTERVAL_SEC", 10);
const RENDER_CONCURRENCY = Math.max(1, Math.floor(envNum("CLIPS_RENDER_CONCURRENCY", 1)));
const CLEANUP_INTERVAL_MIN = Math.max(5, Math.floor(envNum("CLIPS_CLEANUP_INTERVAL_MIN", 60)));
const CRF = Math.max(18, Math.min(35, Math.floor(envNum("CLIPS_CRF", 28))));
const AAC_K = Math.max(64, Math.min(256, Math.floor(envNum("CLIPS_AAC_K", 128))));
function ttlMs() {
    return TTL_DAYS * 24 * 3600 * 1000;
}
/* ─────────────────────────────────────────────
   ffmpeg helpers
───────────────────────────────────────────── */
function safeName(s) {
    return String(s || "no-title").replace(/[^a-z0-9-_]+/gi, "_").slice(0, 80);
}
function getFfmpegPath() {
    const envPath = process.env.FFMPEG_PATH && String(process.env.FFMPEG_PATH).trim();
    return envPath ? envPath : "ffmpeg";
}
function runFfmpeg(args, timeoutMs) {
    return new Promise((resolve) => {
        const ffmpegPath = getFfmpegPath();
        const proc = spawn(ffmpegPath, args, { windowsHide: true });
        let stderr = "";
        const killTimer = setTimeout(() => {
            try {
                proc.kill("SIGKILL");
            }
            catch { }
        }, timeoutMs);
        proc.stderr.setEncoding("utf8");
        proc.stderr.on("data", (c) => {
            stderr += c;
            if (stderr.length > 30_000)
                stderr = stderr.slice(-30_000);
        });
        proc.on("error", (e) => {
            clearTimeout(killTimer);
            resolve({ ok: false, err: String(e?.message || e || "ffmpeg_error") });
        });
        proc.on("close", (code) => {
            clearTimeout(killTimer);
            if (code === 0)
                return resolve({ ok: true });
            resolve({ ok: false, err: `ffmpeg_exit_${code}\n${stderr}`.slice(0, 30_000) });
        });
    });
}
/* ─────────────────────────────────────────────
   Render + upload one clip
───────────────────────────────────────────── */
async function renderAndUploadClip(clip) {
    const vodUrl = String(clip.vod_url || "").trim();
    if (!vodUrl)
        throw new Error("vod_missing");
    const at = Math.max(0, Math.floor(Number(clip.at_sec || 0)));
    const pre = Math.max(0, Math.floor(Number(clip.pre_sec || 105)));
    const post = Math.max(0, Math.floor(Number(clip.post_sec || 15)));
    const startSec = Math.max(0, at - pre);
    const durSec = Math.max(1, pre + post);
    // marge large (HLS)
    const timeoutMs = Math.max(90_000, durSec * 3000);
    const key = `clips/${Number(clip.id)}.mp4`;
    const tmpName = `clip-${clip.id}-${safeName(clip.title || "")}-${startSec}-${durSec}-${nowMs()}.mp4`;
    const outPath = path.join(os.tmpdir(), tmpName);
    try {
        try {
            fs.unlinkSync(outPath);
        }
        catch { }
        const HLS_HEADERS = "Origin: https://dlive.tv\r\n" +
            "Referer: https://dlive.tv/\r\n" +
            "User-Agent: Mozilla/5.0\r\n";
        // 1) stream copy (rapide)
        const argsCopy = [
            "-hide_banner",
            "-loglevel",
            "error",
            "-nostdin",
            "-protocol_whitelist",
            "file,http,https,tcp,tls",
            "-headers",
            HLS_HEADERS,
            "-user_agent",
            "Mozilla/5.0",
            "-ss",
            String(startSec),
            "-i",
            vodUrl,
            "-t",
            String(durSec),
            "-map",
            "0:v:0",
            "-map",
            "0:a:0?",
            "-c",
            "copy",
            "-bsf:a",
            "aac_adtstoasc",
            "-movflags",
            "+faststart",
            "-avoid_negative_ts",
            "make_zero",
            "-y",
            outPath,
        ];
        let r = await runFfmpeg(argsCopy, timeoutMs);
        // 2) fallback re-encode (plus robuste)
        if (!r.ok) {
            const argsRe = [
                "-hide_banner",
                "-loglevel",
                "error",
                "-nostdin",
                "-protocol_whitelist",
                "file,http,https,tcp,tls",
                "-headers",
                HLS_HEADERS,
                "-user_agent",
                "Mozilla/5.0",
                "-ss",
                String(startSec),
                "-i",
                vodUrl,
                "-t",
                String(durSec),
                "-map",
                "0:v:0",
                "-map",
                "0:a:0?",
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                String(CRF),
                "-c:a",
                "aac",
                "-b:a",
                `${AAC_K}k`,
                "-movflags",
                "+faststart",
                "-avoid_negative_ts",
                "make_zero",
                "-y",
                outPath,
            ];
            r = await runFfmpeg(argsRe, Math.max(timeoutMs, durSec * 4000));
            if (!r.ok)
                throw new Error(r.err || "ffmpeg_failed");
        }
        const stat = fs.statSync(outPath);
        const size = stat.size;
        await putFileToR2({
            key,
            contentType: "video/mp4",
            filePath: outPath,
        });
        await setClipMp4Success(Number(clip.id), { mp4_key: key, mp4_size: size });
    }
    finally {
        try {
            if (fs.existsSync(outPath))
                fs.unlinkSync(outPath);
        }
        catch { }
    }
}
/* ─────────────────────────────────────────────
   Renderer loop
───────────────────────────────────────────── */
let renderStarted = false;
export function startClipsMp4Renderer() {
    if (renderStarted)
        return;
    renderStarted = true;
    if (!r2Enabled()) {
        console.warn("[clips-mp4] R2 not enabled (R2_BUCKET missing) => renderer disabled");
        return;
    }
    const maxAgeMs = ttlMs();
    const minCreatedTs = nowMs() - maxAgeMs;
    let running = 0;
    const tick = async () => {
        if (running >= RENDER_CONCURRENCY)
            return;
        const clip = await claimOneClipToRenderMp4({ minCreatedTs, maxAgeMs }).catch(() => null);
        if (!clip)
            return;
        running++;
        (async () => {
            try {
                if (!clip.vod_url) {
                    await setClipMp4Error(Number(clip.id), "vod_missing").catch(() => { });
                    return;
                }
                await renderAndUploadClip(clip);
                console.log(`[clips-mp4] rendered clip=${clip.id} ok`);
            }
            catch (e) {
                const msg = String(e?.message || e || "render_failed").slice(0, 500);
                console.warn(`[clips-mp4] rendered clip=${clip?.id} error`, msg);
                await setClipMp4Error(Number(clip?.id || 0), msg).catch(() => { });
            }
            finally {
                running--;
            }
        })().catch(() => {
            running--;
        });
    };
    ensureBotClips()
        .catch(() => { })
        .finally(() => {
        setInterval(() => void tick(), Math.max(2, RENDER_INTERVAL_SEC) * 1000);
        setTimeout(() => void tick(), 1500);
        setTimeout(() => void tick(), 3500);
    });
    console.log(`[clips-mp4] renderer started ttlDays=${TTL_DAYS} intervalSec=${RENDER_INTERVAL_SEC} concurrency=${RENDER_CONCURRENCY}`);
}
/* ─────────────────────────────────────────────
   Cleanup TTL (delete R2 + clear DB)
───────────────────────────────────────────── */
let cleanupStarted = false;
export function startClipsMp4Cleanup() {
    if (cleanupStarted)
        return;
    cleanupStarted = true;
    if (!r2Enabled()) {
        console.warn("[clips-cleanup] R2 not enabled => cleanup disabled");
        return;
    }
    const run = async () => {
        await ensureBotClips().catch(() => { });
        const cutoff = nowMs() - ttlMs();
        // mark expired clips deleted + hide
        await pool
            .query(`
        UPDATE bot_clips
        SET deleted_ts = $2,
            hidden_by_streamer = true
        WHERE deleted_ts IS NULL
          AND created_ts < $1
        `, [cutoff, nowMs()])
            .catch(() => { });
        // delete mp4 keys for expired/deleted rows
        const keys = await listMp4KeysToCleanup(cutoff, 500).catch(() => []);
        for (const it of keys) {
            const id = Number(it?.id || 0);
            const key = String(it?.mp4_key || "").trim();
            if (!id || !key)
                continue;
            try {
                await deleteFromR2(key);
            }
            catch { }
            await clearMp4Key(id).catch(() => { });
        }
        console.log(`[clips-cleanup] done cutoff=${new Date(cutoff).toISOString()} keys=${keys.length}`);
    };
    run().catch((e) => console.warn("[clips-cleanup] first run failed", e?.message || e));
    setInterval(() => run().catch((e) => console.warn("[clips-cleanup] run failed", e?.message || e)), CLEANUP_INTERVAL_MIN * 60_000);
    console.log(`[clips-cleanup] cleanup started ttlDays=${TTL_DAYS} everyMin=${CLEANUP_INTERVAL_MIN}`);
}
