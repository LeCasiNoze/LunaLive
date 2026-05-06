#!/usr/bin/env node
// scripts/rumble-backfill-vods.js
// Enrichit chaque ligne rumble_vods (title/thumbnail/duration/vod_hls_url) en
// rejouant un appel embedJS Rumble. À lancer manuellement quand on veut backfiller
// les VODs déjà archivés mais incomplets.
//
// Usage:
//   node scripts/rumble-backfill-vods.js                # tous les streamers
//   node scripts/rumble-backfill-vods.js --slug lamise  # un seul streamer
//   node scripts/rumble-backfill-vods.js --dry          # n'écrit pas en DB

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const apiDir = resolve(__dir, "../api");

function loadEnv() {
  const raw = readFileSync(resolve(apiDir, ".env"), "utf-8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();

const args = process.argv.slice(2);
const slugIdx = args.indexOf("--slug");
const onlySlug = slugIdx >= 0 ? args[slugIdx + 1] : null;
const dryRun = args.includes("--dry");

const pgUrl = pathToFileURL(resolve(apiDir, "node_modules/pg/lib/index.js")).href;
const { default: pg } = await import(pgUrl).catch(() => import("pg"));
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function fetchEmbedJs(videoIdWithV) {
  const url = `https://rumble.com/embedJS/u3/?ifr=0&dref=&request=video&ver=2&v=${videoIdWithV}&ad_wt=0`;
  const r = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      accept: "application/json",
      referer: "https://rumble.com/",
      origin: "https://rumble.com",
    },
  });
  if (!r.ok) return { ok: false, status: r.status };
  const j = await r.json().catch(() => null);
  if (!j) return { ok: false, status: r.status, parseError: true };
  return { ok: true, data: j };
}

function pickHlsVod(d) {
  // Format VOD permanent (ENDLIST) : `rumble.com/hls-vod/{vid}/playlist.m3u8`
  // Format live DVR (rewatch live) : `rumble.com/live-hls-dvr/{vid}/playlist.m3u8`
  const url = d?.u?.hls?.url || d?.ua?.hls?.auto?.url || null;
  if (!url || typeof url !== "string") return null;
  if (url.includes("/hls-vod/") || url.includes("/live-hls-dvr/")) return url;
  return url; // sinon on accepte tel quel
}

function pickMp4(d) {
  // Rumble ne renvoie quasi plus de MP4 simple — on garde le pickup au cas où.
  return d?.ua?.mp4?.auto?.url
    || d?.ua?.mp4?.["1080"]?.url
    || d?.ua?.mp4?.["720"]?.url
    || d?.ua?.mp4?.["480"]?.url
    || d?.u?.mp4?.url
    || null;
}

async function main() {
  const params = [];
  let where = `WHERE 1=1`;
  if (onlySlug) {
    const s = await pool.query(`SELECT id FROM streamers WHERE LOWER(slug)=LOWER($1) LIMIT 1`, [onlySlug]);
    if (!s.rows[0]) {
      console.error(`Streamer slug="${onlySlug}" introuvable.`);
      process.exit(1);
    }
    params.push(s.rows[0].id);
    where += ` AND streamer_id = $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT id, streamer_id, video_id, video_id_numeric, title, thumbnail_url,
            duration_sec, vod_mp4_url, vod_hls_url, started_at, ended_at
     FROM rumble_vods
     ${where}
     ORDER BY ended_at DESC`,
    params
  );

  console.log(`[backfill] ${rows.length} VOD(s) à traiter${onlySlug ? ` (slug=${onlySlug})` : ""}${dryRun ? " [DRY-RUN]" : ""}`);

  let enriched = 0, skipped = 0, errored = 0;

  for (const r of rows) {
    const vid = String(r.video_id);
    const r2 = await fetchEmbedJs(vid);
    if (!r2.ok) {
      console.warn(`  ${vid}: embedJS http=${r2.status}${r2.parseError ? " (parse)" : ""}`);
      errored++;
      await new Promise(res => setTimeout(res, 400));
      continue;
    }
    const d = r2.data;

    // VOD prêt si live=0 (sinon DVR pendant live ou placeholder)
    const isLive = !!d?.live;
    const title = d?.title ? String(d.title) : null;
    const thumb = d?.i ? String(d.i) : null;
    const duration = Number(d?.duration) || null;
    const hlsVod = pickHlsVod(d);
    const mp4 = pickMp4(d);
    const vidNum = d?.vid != null ? String(d.vid) : null;

    // On accepte un HLS VOD permanent (hls-vod/) comme résolu.
    const isHlsPermanent = !!(hlsVod && hlsVod.includes("/hls-vod/"));
    const isResolved = isHlsPermanent || !!mp4;

    const upd = {
      title: r.title ?? title,
      thumbnail_url: r.thumbnail_url ?? thumb,
      duration_sec: r.duration_sec ?? duration,
      video_id_numeric: r.video_id_numeric ?? vidNum,
      vod_mp4_url: r.vod_mp4_url ?? mp4,
      vod_hls_url: r.vod_hls_url ?? hlsVod,
    };

    const changed =
      (upd.title && upd.title !== r.title) ||
      (upd.thumbnail_url && upd.thumbnail_url !== r.thumbnail_url) ||
      (upd.duration_sec && upd.duration_sec !== r.duration_sec) ||
      (upd.video_id_numeric && upd.video_id_numeric !== r.video_id_numeric) ||
      (upd.vod_mp4_url && upd.vod_mp4_url !== r.vod_mp4_url) ||
      (upd.vod_hls_url && upd.vod_hls_url !== r.vod_hls_url);

    if (!changed) {
      skipped++;
      console.log(`  ${vid}: déjà complet, skip`);
    } else {
      console.log(`  ${vid}: live=${isLive ? "1" : "0"} title="${(title || "").slice(0, 60)}" hls=${isHlsPermanent ? "VOD" : (hlsVod ? "live-dvr" : "—")} mp4=${mp4 ? "yes" : "no"} dur=${duration}s`);
      if (!dryRun) {
        await pool.query(
          `UPDATE rumble_vods SET
             title = $2, thumbnail_url = $3, duration_sec = $4, video_id_numeric = $5,
             vod_mp4_url = $6, vod_hls_url = $7,
             vod_resolved_at = CASE WHEN $8::boolean AND vod_resolved_at IS NULL THEN NOW() ELSE vod_resolved_at END
           WHERE id = $1`,
          [r.id, upd.title, upd.thumbnail_url, upd.duration_sec, upd.video_id_numeric, upd.vod_mp4_url, upd.vod_hls_url, isResolved]
        );
      }
      enriched++;
    }

    // Throttle pour ne pas spammer Rumble
    await new Promise(res => setTimeout(res, 350));
  }

  console.log(`[backfill] terminé. enriched=${enriched} skipped=${skipped} errored=${errored}`);
  await pool.end();
}

main().catch(async (e) => {
  console.error("FATAL", e);
  await pool.end().catch(() => {});
  process.exit(1);
});
