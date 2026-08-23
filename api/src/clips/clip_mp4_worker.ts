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
import { fetchRecentRumbleVodsForUsername } from "../rumble.js";

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
 * Parse une m3u8 HLS et retourne ses segments avec durées et URIs absolus.
 */
type HlsSegment = { uri: string; duration: number };

async function fetchHlsPlaylist(m3u8Url: string, timeoutMs = 15_000, depth = 0): Promise<{
  segments: HlsSegment[];
  targetDuration: number;
  mediaSequence: number;
  hasEndList: boolean;
  rawText: string;
} | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(m3u8Url, {
      signal: ctrl.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36",
        "accept": "application/vnd.apple.mpegurl,application/x-mpegurl,*/*",
        "origin": "https://rumble.com",
        "referer": "https://rumble.com/",
      },
    }).finally(() => clearTimeout(t));
    if (!r.ok) {
      console.warn(`[clips-mp4] fetchHlsPlaylist HTTP=${r.status} url=${m3u8Url}`);
      return null;
    }
    const text = await r.text();

    // Rumble's stable live-hls-dvr URL is a master playlist. Resolve its
    // highest-bandwidth variant before looking for media segments.
    const lines = text.split(/\r?\n/);
    const variants: Array<{ uri: string; bandwidth: number }> = [];
    let pendingBandwidth: number | null = null;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith("#EXT-X-STREAM-INF:")) {
        const m = line.match(/(?:AVERAGE-)?BANDWIDTH=(\d+)/i);
        pendingBandwidth = m ? Number(m[1]) : 0;
        continue;
      }
      if (!line.startsWith("#") && pendingBandwidth != null) {
        variants.push({ uri: new URL(line, m3u8Url).href, bandwidth: pendingBandwidth });
        pendingBandwidth = null;
      }
    }

    if (variants.length > 0) {
      if (depth >= 3) {
        console.warn(`[clips-mp4] HLS master nesting too deep url=${m3u8Url}`);
        return null;
      }
      variants.sort((a, b) => b.bandwidth - a.bandwidth);
      return fetchHlsPlaylist(variants[0].uri, timeoutMs, depth + 1);
    }

    const segments: HlsSegment[] = [];
    let pendingDuration: number | null = null;
    let targetDuration = 8;
    let mediaSequence = 0;
    let hasEndList = false;

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith("#")) {
        if (line.startsWith("#EXT-X-TARGETDURATION:")) {
          const td = Number(line.slice("#EXT-X-TARGETDURATION:".length));
          if (Number.isFinite(td) && td > 0) targetDuration = td;
        } else if (line.startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
          const ms = Number(line.slice("#EXT-X-MEDIA-SEQUENCE:".length));
          if (Number.isFinite(ms) && ms >= 0) mediaSequence = ms;
        } else if (line === "#EXT-X-ENDLIST") {
          hasEndList = true;
        } else if (line.startsWith("#EXTINF:")) {
          const m = line.match(/#EXTINF:([\d.]+)/);
          const d = m ? Number(m[1]) : NaN;
          pendingDuration = Number.isFinite(d) && d > 0 ? d : null;
        }
        continue;
      }
      // ligne URI segment
      if (pendingDuration != null) {
        const absUri = new URL(line, m3u8Url).href;
        segments.push({ uri: absUri, duration: pendingDuration });
        pendingDuration = null;
      }
    }

    if (segments.length === 0) {
      console.warn(`[clips-mp4] fetchHlsPlaylist parsed 0 segments from ${m3u8Url}`);
      return null;
    }
    return { segments, targetDuration, mediaSequence, hasEndList, rawText: text };
  } catch (e: any) {
    console.warn(`[clips-mp4] fetchHlsPlaylist error url=${m3u8Url} err=${e?.message || e}`);
    return null;
  }
}

/**
 * Pour un clip Rumble live, prépare une m3u8 VOD locale contenant uniquement
 * les segments couvrant la fenêtre cible [target_start..target_end].
 *
 * Retourne le chemin du m3u8 local + l'offset (en secondes) à `-ss` pour
 * trim précis, et la durée de clip à passer à `-t`.
 */
async function prepareRumbleClipPlaylist(p: {
  m3u8Url: string;
  clipMomentSec: number;     // = at_sec (offset depuis live_started_at en DB)
  pre: number;
  post: number;
  liveStartTs: number;        // ms (depuis DB streamer_rumble_info.live_started_at)
  clipCreatedTs: number;      // ms — wall-clock exact du moment !clip
  clipId: number;
}): Promise<{ localM3u8: string; trimStartSec: number; clipDurSec: number; truncatedPre: boolean } | null> {
  const playlist = await fetchHlsPlaylist(p.m3u8Url);
  if (!playlist) return null;

  const playlistDuration = playlist.segments.reduce((a, s) => a + s.duration, 0);
  const nowMsLocal = Date.now();

  // Détermine la position du moment !clip dans la playlist.
  //
  // Stratégie A (live ongoing, !ENDLIST) :
  //   On utilise le wall-clock — la live edge de la playlist ≈ now (quelques
  //   secondes de latence HLS qu'on ignore). Le moment !clip s'est passé à
  //   `clipCreatedTs` wall-clock. Donc :
  //     clipMomentInPlaylist = playlistDuration - (now - clipCreatedTs)
  //   Cette formule ne dépend PAS de live_started_at, qui peut être faux
  //   de plusieurs minutes (le poller n'attrape pas toujours pubDate fiable).
  //
  // Stratégie B (live terminé, ENDLIST présent) :
  //   La playlist est figée, "now" n'est plus le live edge. On utilise
  //   at_sec qui correspond à un offset fixe depuis live_started_at (qui,
  //   même imprécis, devient stable une fois le live commencé). Pour
  //   Rumble, MEDIA-SEQUENCE=1 → la playlist commence au segment 1 (= début
  //   du live), donc clipMomentInPlaylist = at_sec.
  //
  // Stratégie B1 (sliding window finalisé, MEDIA-SEQUENCE > 1) :
  //   Cas rare chez Rumble. Fallback estimation horloge.
  const clipAgeSec = Math.max(0, (nowMsLocal - p.clipCreatedTs) / 1000);
  const wallClockEstimate = playlistDuration - clipAgeSec;

  // Détermine la position du moment !clip dans la playlist.
  //
  // PRIORITÉ : wall-clock chaque fois que possible. C'est la SEULE valeur
  // qui ne dépend pas de live_started_at en DB (potentiellement décalé de
  // plusieurs minutes par le poller) et qui survit au snapshot foiré.
  //
  // Formule wall-clock :
  //   playlist edge en wall-clock ≈ now (pour live ongoing, ou récent ENDLIST)
  //   position du !clip = playlistDuration - (now - clipCreatedTs)
  //
  // at_sec n'est utilisé QUE si wall-clock impossible (live ENDED depuis
  // longtemps + clip rendu en retard).
  let clipMomentInPlaylist: number;
  let strategyUsed: string;

  if (!playlist.hasEndList) {
    // Live ongoing — wall-clock direct, le plus fiable.
    clipMomentInPlaylist = Math.max(0, wallClockEstimate);
    strategyUsed = "wall-clock(live-ongoing)";
  } else if (wallClockEstimate >= 0 && wallClockEstimate <= playlistDuration && clipAgeSec < 600) {
    // Live ENDED mais render rapide (< 10 min après !clip) → wall-clock fiable.
    clipMomentInPlaylist = wallClockEstimate;
    strategyUsed = "wall-clock(live-just-ended)";
  } else if (p.clipMomentSec > 0 && p.clipMomentSec <= playlistDuration) {
    // Live ENDED depuis longtemps, at_sec fiable (snapshot a fonctionné au !clip)
    clipMomentInPlaylist = p.clipMomentSec;
    strategyUsed = "at_sec(snapshot)";
  } else if (playlist.mediaSequence <= 1) {
    // Last resort : at_sec brut, full DVR.
    clipMomentInPlaylist = Math.min(p.clipMomentSec, playlistDuration);
    strategyUsed = "at_sec(raw)";
  } else {
    const liveEdgeOffsetInLive = (nowMsLocal - p.liveStartTs) / 1000;
    const playlistStartInLive = Math.max(0, liveEdgeOffsetInLive - playlistDuration);
    clipMomentInPlaylist = Math.max(0, p.clipMomentSec - playlistStartInLive);
    strategyUsed = "sliding-window-estimate";
  }

  // Pas de compensation HLS live edge : avec +15s, la commande chat apparaissait
  // à 1m dans le clip rendu (pre=75 - 15 = 60s) au lieu de ~1m15. Maintenant
  // la commande est à pre_sec dans le clip (≈ 1m15 pour pre=75 + ~5s de réaction
  // = ressentie comme "1m20" côté utilisateur).
  const HLS_LIVE_EDGE_LAG_SEC = 0;
  const adjustedClipMoment = clipMomentInPlaylist + HLS_LIVE_EDGE_LAG_SEC;

  console.log(
    `[clips-mp4] rumble seek strategy=${strategyUsed} ` +
    `playlistDur=${playlistDuration.toFixed(1)}s clipAge=${clipAgeSec.toFixed(0)}s ` +
    `at_sec=${p.clipMomentSec} wallClock=${wallClockEstimate.toFixed(0)} ` +
    `→ clipMoment=${clipMomentInPlaylist.toFixed(0)} adjusted=${adjustedClipMoment.toFixed(0)}`
  );

  // Fenêtre cible (en position dans la playlist)
  const targetStartInPlaylist = Math.max(0, adjustedClipMoment - p.pre);
  const targetEndInPlaylist   = Math.max(0, adjustedClipMoment + p.post);
  const truncatedPre = (adjustedClipMoment - p.pre) < 0;

  // Sélection des segments qui chevauchent [targetStartInPlaylist..targetEndInPlaylist]
  let acc = 0;
  let startIdx = -1;
  let endIdx = -1;
  let segStartTimeAtStartIdx = 0;

  for (let i = 0; i < playlist.segments.length; i++) {
    const segStart = acc;
    const segEnd = acc + playlist.segments[i].duration;
    if (startIdx === -1 && segEnd > targetStartInPlaylist) {
      startIdx = i;
      segStartTimeAtStartIdx = segStart;
    }
    if (segEnd >= targetEndInPlaylist) {
      endIdx = i;
      break;
    }
    acc = segEnd;
  }

  if (startIdx === -1) return null;
  if (endIdx === -1) endIdx = playlist.segments.length - 1; // pas assez de post → prend tout ce qu'on a

  // Trim précis dans le segment de début
  const trimStartSec = Math.max(0, targetStartInPlaylist - segStartTimeAtStartIdx);

  // Durée totale incluse dans les segments retenus
  const includedDuration = playlist.segments
    .slice(startIdx, endIdx + 1)
    .reduce((a, s) => a + s.duration, 0);

  // Durée demandée = pre + post (cappée par ce qui est réellement dispo après trim)
  const requestedDur = p.pre + p.post;
  const availableDur = includedDuration - trimStartSec;
  const clipDurSec = Math.max(1, Math.min(requestedDur, availableDur));

  // Génère la m3u8 VOD locale avec URIs absolus
  const targetDuration = Math.max(playlist.targetDuration, ...playlist.segments.slice(startIdx, endIdx + 1).map(s => Math.ceil(s.duration)));
  const out: string[] = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-PLAYLIST-TYPE:VOD",
    `#EXT-X-TARGETDURATION:${targetDuration}`,
    "#EXT-X-MEDIA-SEQUENCE:0",
  ];
  for (let i = startIdx; i <= endIdx; i++) {
    out.push(`#EXTINF:${playlist.segments[i].duration.toFixed(3)},`);
    out.push(playlist.segments[i].uri);
  }
  out.push("#EXT-X-ENDLIST");

  const localM3u8 = path.join(os.tmpdir(), `clip-${p.clipId}-${nowMs()}.m3u8`);
  fs.writeFileSync(localM3u8, out.join("\n"), "utf8");

  return { localM3u8, trimStartSec, clipDurSec, truncatedPre };
}

function getFfmpegPath(): string {
  const envPath = process.env.FFMPEG_PATH && String(process.env.FFMPEG_PATH).trim();
  return envPath ? envPath : "ffmpeg";
}

async function runFfmpeg(args: string[], timeoutMs: number): Promise<{ ok: true } | { ok: false; err: string }> {
  // Sérialise via mutex global ffmpeg pour éviter overlap mp4 + thumbnail
  // qui peut pousser le RSS au-delà des 512 MB Render.
  const { withFfmpegSlot } = await import("../utils/ffmpeg_gate.js");
  return withFfmpegSlot("clip-mp4", () => new Promise((resolve) => {
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
  }));
}

function normalizeMatchText(value: unknown) {
  return String(value || "").trim().toLocaleLowerCase("fr").replace(/\s+/g, " ");
}

async function recoverPermanentRumbleVod(clip: BotClipRow): Promise<{ url: string; atSec: number } | null> {
  const streamerId = Number(clip.streamer_id || 0);
  if (!streamerId) return null;

  const account = await pool.query(
    `SELECT COALESCE(ra.username, s.rumble_username) AS username
     FROM streamers s
     LEFT JOIN rumble_accounts ra ON ra.assigned_to_streamer_id = s.id
     WHERE s.id = $1
     LIMIT 1`,
    [streamerId]
  );
  const username = String(account.rows?.[0]?.username || "").trim();
  if (!username) return null;

  const vods = await fetchRecentRumbleVodsForUsername(username, 40).catch(() => []);
  if (!vods.length) return null;

  const liveRef = String(clip.live_permlink || "").replace(/^v/i, "").toLowerCase();
  const clipTitle = normalizeMatchText(clip.title);
  const clipCreatedTs = Number(clip.created_ts || 0);
  const liveStartTs = Number(clip.live_start_ts || 0);

  const ranked = vods
    .map((vod) => {
      const refMatch = !!liveRef && vod.legacyLiveRef.toLowerCase().includes(liveRef);
      const titleMatch = !!clipTitle && normalizeMatchText(vod.title) === clipTitle;
      const anchor = liveStartTs > 0 ? liveStartTs : clipCreatedTs;
      const startDelta = vod.createdAtMs > 0 && anchor > 0 ? Math.abs(vod.createdAtMs - anchor) : Number.POSITIVE_INFINITY;
      const containsClip = vod.createdAtMs > 0 && clipCreatedTs >= vod.createdAtMs - 120_000 &&
        clipCreatedTs <= vod.createdAtMs + (Math.max(1, vod.durationSec) + 900) * 1000;
      const score = refMatch ? 0 : titleMatch && containsClip ? 1 + startDelta / 1e9 : containsClip ? 10 + startDelta / 1e9 : 1000;
      return { vod, score };
    })
    .filter((item) => item.score < 1000)
    .sort((a, b) => a.score - b.score);

  const match = ranked[0]?.vod;
  const url = String(match?.hlsUrl || match?.mp4Url || "").trim();
  if (!match || !url) return null;

  const correctedAtSec = match.createdAtMs > 0 && clipCreatedTs > match.createdAtMs
    ? Math.max(0, Math.floor((clipCreatedTs - match.createdAtMs) / 1000))
    : Math.max(0, Number(clip.at_sec || 0));

  await pool.query(
    `UPDATE bot_clips
     SET vod_url = $2,
         vod_permlink = $3,
         vod_created_ts = $4,
         at_sec = $5,
         thumbnail_url = COALESCE(thumbnail_url, $6)
     WHERE id = $1`,
    [Number(clip.id), url, match.permlink || null, match.createdAtMs || null, correctedAtSec, match.thumbnailUrl]
  );
  console.log(`[clips-mp4] recovered permanent Rumble VOD clip=${clip.id} username=${username} permlink=${match.permlink}`);
  return { url, atSec: correctedAtSec };
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
  let inputUrl = vodUrl;
  let localM3u8ToCleanup: string | null = null;

  // ✅ Rumble live HLS DVR : on génère une m3u8 VOD locale avec uniquement
  // les segments couvrant la fenêtre cible. Indispensable car ffmpeg ne seek
  // PAS proprement dans une m3u8 live (sans EXT-X-ENDLIST/PLAYLIST-TYPE:VOD).
  const isRumbleLiveHls =
    String(clip.platform || "").toLowerCase() === "rumble" &&
    /\.m3u8(\?|$)/i.test(vodUrl);

  if (isRumbleLiveHls) {
    const liveStartTs = Number(clip.live_start_ts || 0);
    if (liveStartTs <= 0) {
      throw new Error("rumble_live_hls_missing_live_start_ts");
    }
    let prepared = await prepareRumbleClipPlaylist({
      m3u8Url: vodUrl,
      clipMomentSec: at,
      pre,
      post,
      liveStartTs,
      clipCreatedTs: Number(clip.created_ts || Date.now()),
      clipId: Number(clip.id),
    });
    if (!prepared) {
      const recovered = await recoverPermanentRumbleVod(clip);
      if (recovered) {
        prepared = await prepareRumbleClipPlaylist({
          m3u8Url: recovered.url,
          clipMomentSec: recovered.atSec,
          pre,
          post,
          liveStartTs,
          clipCreatedTs: Number(clip.created_ts || Date.now()),
          clipId: Number(clip.id),
        });
      }
      if (!prepared) {
        // Never fall back to ffmpeg seeking the raw live DVR: it silently
        // starts at segment one and produces a multi-hour pseudo clip.
        throw new Error("rumble_live_hls_prepare_failed");
      }
    }
    inputUrl = prepared.localM3u8;
    startSec = prepared.trimStartSec;
    durSec = prepared.clipDurSec;
    localM3u8ToCleanup = prepared.localM3u8;
    console.log(
      `[clips-mp4] rumble live HLS clip=${clip.id} ` +
      `→ local m3u8 trim=${startSec.toFixed(2)}s dur=${durSec.toFixed(2)}s ` +
      `${prepared.truncatedPre ? "(pre tronqué — DVR trop court)" : ""}`
    );
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
      "Origin: https://rumble.com\r\n" +
      "Referer: https://rumble.com/\r\n" +
      "User-Agent: Mozilla/5.0\r\n";

    // -headers / -user_agent ne sont valides qu'en mode HTTP. Avec une m3u8
    // locale (file://) le hls demuxer rejette ces options ("Option headers
    // not found"). On les omet quand l'input est un fichier.
    const isHttpInput = /^https?:\/\//i.test(inputUrl);
    const httpInputArgs = isHttpInput
      ? ["-headers", HLS_HEADERS, "-user_agent", "Mozilla/5.0"]
      : [];

    // 1) stream copy (rapide)
    const argsCopy = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-protocol_whitelist",
      "file,http,https,tcp,tls,crypto,data",
      ...httpInputArgs,
      "-ss",
      String(startSec),
      "-i",
      inputUrl,
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
        "file,http,https,tcp,tls,crypto,data",
        ...httpInputArgs,
        "-ss",
        String(startSec),
        "-i",
        inputUrl,
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
    if (localM3u8ToCleanup) {
      try {
        if (fs.existsSync(localM3u8ToCleanup)) fs.unlinkSync(localM3u8ToCleanup);
      } catch {}
    }
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

    // ✅ Réserve un slot AVANT le claim async pour éviter le TOCTOU :
    // sans ça, plusieurs ticks pouvaient passer le check `running < N`
    // pendant que claimOneClipToRenderMp4 était en attente DB → on lançait
    // 4-5 ffmpeg en parallèle au lieu de 1 → OOM.
    running++;
    let claimed = false;
    try {
      const clip = await claimOneClipToRenderMp4({ minCreatedTs, maxAgeMs }).catch(() => null);
      if (!clip) return;
      claimed = true;

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
      }
    } finally {
      running--;
      void claimed;
    }
  };

  ensureBotClips()
    .then(async () => {
      // Retry clips that failed only because the Rumble master playlist was
      // previously mistaken for an empty media playlist.
      await pool.query(
        `UPDATE bot_clips
         SET mp4_error = NULL, mp4_rendering = false
         WHERE mp4_error = 'rumble_live_hls_prepare_failed'
           AND deleted_ts IS NULL
           AND created_ts >= $1`,
        [minCreatedTs]
      );
    })
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
