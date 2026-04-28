// api/src/clips/clip_mp4_worker.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { pool } from "../db.js";
import {
  ensureBotClips,
  claimOneClipToRenderMp4,
  setClipMp4Error,
  setClipMp4Success,
  listMp4KeysToCleanup,
  clearMp4Key,
  type BotClipRow,
} from "../bot_clips/store.js";

import { r2Enabled, putFileToR2, deleteFromR2 } from "./r2.js";

/* ─────────────────────────────────────────────
   Config
───────────────────────────────────────────── */

function envNum(name: string, def: number) {
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

function safeName(s: string) {
  return String(s || "no-title").replace(/[^a-z0-9-_]+/gi, "_").slice(0, 80);
}

/**
 * Récupère la durée totale (en secondes) couverte par une m3u8 HLS live DVR
 * en sommant les EXTINF des segments.
 *
 * Nécessaire pour les clips Rumble live : la playlist DVR est une fenêtre
 * glissante (les N dernières minutes seulement). Le `-ss` ffmpeg est relatif
 * au DÉBUT de cette fenêtre, pas au début du live → il faut convertir.
 */
async function fetchHlsPlaylistDuration(m3u8Url: string, timeoutMs = 8_000): Promise<number | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(m3u8Url, { signal: ctrl.signal }).finally(() => clearTimeout(t));
    if (!r.ok) return null;
    const text = await r.text();
    let total = 0;
    // EXTINF lines: "#EXTINF:6.000,..." ou "#EXTINF:6,..."
    const re = /#EXTINF:([\d.]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const d = Number(m[1]);
      if (Number.isFinite(d) && d > 0) total += d;
    }
    return total > 0 ? total : null;
  } catch {
    return null;
  }
}

/**
 * Pour un clip Rumble live (vod_url = HLS live DVR), calcule la position
 * `-ss` correcte en tenant compte de la fenêtre DVR courante.
 *
 *   playlistDuration  = durée totale couverte par la m3u8 actuelle
 *   clipAgeSec        = secondes écoulées depuis le moment !clip
 *   pre               = secondes voulues AVANT le !clip (75 par défaut)
 *
 * Position du !clip dans la playlist (depuis le début) = playlistDuration - clipAgeSec
 * Position cible (75s avant)                            = playlistDuration - clipAgeSec - pre
 *
 * Si négatif (le pre-window n'est plus dans le DVR) → on démarre au début de
 * la playlist et on accepte un clip raccourci côté pre.
 */
function computeLiveHlsSeek(p: {
  playlistDuration: number;
  clipAgeSec: number;
  pre: number;
}): { startSec: number; durSec: number; truncatedPre: boolean } {
  const idealStart = p.playlistDuration - p.clipAgeSec - p.pre;
  const startSec = Math.max(0, Math.floor(idealStart));
  const truncatedPre = idealStart < 0;
  // durée demandée = pre + post, mais cappée par la fenêtre dispo (de startSec à fin)
  return { startSec, durSec: 0, truncatedPre };
}

function getFfmpegPath(): string {
  const envPath = process.env.FFMPEG_PATH && String(process.env.FFMPEG_PATH).trim();
  return envPath ? envPath : "ffmpeg";
}

function runFfmpeg(args: string[], timeoutMs: number): Promise<{ ok: true } | { ok: false; err: string }> {
  return new Promise((resolve) => {
    const ffmpegPath = getFfmpegPath();
    const proc = spawn(ffmpegPath, args, { windowsHide: true });

    let stderr = "";
    const killTimer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {}
    }, timeoutMs);

    proc.stderr.setEncoding("utf8");
    proc.stderr.on("data", (c: string) => {
      stderr += c;
      if (stderr.length > 30_000) stderr = stderr.slice(-30_000);
    });

    proc.on("error", (e: any) => {
      clearTimeout(killTimer);
      resolve({ ok: false, err: String(e?.message || e || "ffmpeg_error") });
    });

    proc.on("close", (code: number) => {
      clearTimeout(killTimer);
      if (code === 0) return resolve({ ok: true });
      resolve({ ok: false, err: `ffmpeg_exit_${code}\n${stderr}`.slice(0, 30_000) });
    });
  });
}

/* ─────────────────────────────────────────────
   Render + upload one clip
───────────────────────────────────────────── */

async function renderAndUploadClip(clip: BotClipRow) {
  const vodUrl = String(clip.vod_url || "").trim();
  if (!vodUrl) throw new Error("vod_missing");

  const at = Math.max(0, Math.floor(Number(clip.at_sec || 0)));
  const pre = Math.max(0, Math.floor(Number(clip.pre_sec || 105)));
  const post = Math.max(0, Math.floor(Number(clip.post_sec || 15)));

  // Par défaut (DLive VOD, etc.) : timeline absolue → at = offset depuis début du stream.
  let startSec = Math.max(0, at - pre);
  let durSec = Math.max(1, pre + post);

  // ✅ Correction Rumble live HLS DVR : la playlist est une fenêtre glissante.
  // `-ss` est relatif au début de cette fenêtre, pas au début du live, donc
  // on doit reconvertir à partir de la durée réelle de la m3u8 et de l'âge
  // du clip (temps écoulé depuis !clip).
  const isRumbleLiveHls =
    String(clip.platform || "").toLowerCase() === "rumble" &&
    /\.m3u8(\?|$)/i.test(vodUrl);

  if (isRumbleLiveHls) {
    const playlistDuration = await fetchHlsPlaylistDuration(vodUrl);
    const clipMomentMs = Number(clip.live_start_ts || 0) + at * 1000;
    const clipAgeSec = clipMomentMs > 0
      ? Math.max(0, Math.floor((nowMs() - clipMomentMs) / 1000))
      : 0;

    if (playlistDuration && playlistDuration > 0) {
      const r = computeLiveHlsSeek({ playlistDuration, clipAgeSec, pre });
      // pre effectif = ce qu'il y a entre startSec et la position du !clip
      const clipPosInPlaylist = Math.max(0, playlistDuration - clipAgeSec);
      const effectivePre = Math.max(0, clipPosInPlaylist - r.startSec);
      startSec = r.startSec;
      durSec = Math.max(1, effectivePre + post);
      console.log(
        `[clips-mp4] rumble live HLS clip=${clip.id} ` +
        `playlistDur=${playlistDuration.toFixed(1)}s clipAge=${clipAgeSec}s ` +
        `→ -ss=${startSec}s -t=${durSec}s ` +
        `${r.truncatedPre ? "(pre tronqué — DVR trop court)" : ""}`
      );
    } else {
      console.warn(
        `[clips-mp4] rumble live HLS clip=${clip.id} ` +
        `m3u8 unreachable, fallback to naive -ss (clip likely shifted)`
      );
    }
  }

  // marge large (HLS)
  const timeoutMs = Math.max(90_000, durSec * 3000);

  const key = `clips/${Number(clip.id)}.mp4`;

  const tmpName = `clip-${clip.id}-${safeName(clip.title || "")}-${startSec}-${durSec}-${nowMs()}.mp4`;
  const outPath = path.join(os.tmpdir(), tmpName);

  try {
    try {
      fs.unlinkSync(outPath);
    } catch {}

    const HLS_HEADERS =
      "Origin: https://dlive.tv\r\n" +
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
      if (!r.ok) throw new Error(r.err || "ffmpeg_failed");
    }

    const stat = fs.statSync(outPath);
    const size = stat.size;

    await putFileToR2({
      key,
      contentType: "video/mp4",
      filePath: outPath,
    });

    await setClipMp4Success(Number(clip.id), { mp4_key: key, mp4_size: size });
  } finally {
    try {
      if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
    } catch {}
  }
}

/* ─────────────────────────────────────────────
   Renderer loop
───────────────────────────────────────────── */

let renderStarted = false;

export function startClipsMp4Renderer() {
  if (renderStarted) return;
  renderStarted = true;

  if (!r2Enabled()) {
    console.warn("[clips-mp4] R2 not enabled (R2_BUCKET missing) => renderer disabled");
    return;
  }

  const maxAgeMs = ttlMs();
  const minCreatedTs = nowMs() - maxAgeMs;

  let running = 0;

  const tick = async () => {
    if (running >= RENDER_CONCURRENCY) return;

    const clip = await claimOneClipToRenderMp4({ minCreatedTs, maxAgeMs }).catch(() => null);
    if (!clip) return;

    running++;

    (async () => {
      try {
        if (!clip.vod_url) {
          await setClipMp4Error(Number(clip.id), "vod_missing").catch(() => {});
          return;
        }

        await renderAndUploadClip(clip);
        console.log(`[clips-mp4] rendered clip=${clip.id} ok`);
      } catch (e: any) {
        const msg = String(e?.message || e || "render_failed").slice(0, 500);
        console.warn(`[clips-mp4] rendered clip=${clip?.id} error`, msg);
        await setClipMp4Error(Number(clip?.id || 0), msg).catch(() => {});
      } finally {
        running--;
      }
    })().catch(() => {
      running--;
    });
  };

  ensureBotClips()
    .catch(() => {})
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
  if (cleanupStarted) return;
  cleanupStarted = true;

  if (!r2Enabled()) {
    console.warn("[clips-cleanup] R2 not enabled => cleanup disabled");
    return;
  }

  const run = async () => {
    await ensureBotClips().catch(() => {});

    const cutoff = nowMs() - ttlMs();

    // mark expired clips deleted + hide
    await pool
      .query(
        `
        UPDATE bot_clips
        SET deleted_ts = $2,
            hidden_by_streamer = true
        WHERE deleted_ts IS NULL
          AND created_ts < $1
        `,
        [cutoff, nowMs()]
      )
      .catch(() => {});

    // delete mp4 keys for expired/deleted rows
    const keys = await listMp4KeysToCleanup(cutoff, 500).catch(() => []);
    for (const it of keys as any[]) {
      const id = Number(it?.id || 0);
      const key = String(it?.mp4_key || "").trim();
      if (!id || !key) continue;

      try {
        await deleteFromR2(key);
      } catch {}

      await clearMp4Key(id).catch(() => {});
    }

    console.log(`[clips-cleanup] done cutoff=${new Date(cutoff).toISOString()} keys=${(keys as any[]).length}`);
  };

  run().catch((e) => console.warn("[clips-cleanup] first run failed", e?.message || e));
  setInterval(() => run().catch((e) => console.warn("[clips-cleanup] run failed", e?.message || e)), CLEANUP_INTERVAL_MIN * 60_000);

  console.log(`[clips-cleanup] cleanup started ttlDays=${TTL_DAYS} everyMin=${CLEANUP_INTERVAL_MIN}`);
}
