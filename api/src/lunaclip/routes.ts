// api/src/lunaclip/routes.ts
import { Router } from "express";
import { pool } from "../db.js";
import { addLunaClip } from "./clips.js";
import { spawn } from "child_process";
import { r2Enabled, buildPublicUrl, putR2Buffer } from "../clips/r2.js";
import { FFMPEG_BIN, FFMPEG_OK } from "../routes/thumbs.js";

export const lunaclipRouter = Router();

/**
 * POST /admin/lunaclip/clips/:id/regen-thumb
 * Régénère le thumbnail d'un clip à partir du mp4 R2 existant.
 * Utile quand le thumb a foiré pendant un crash mémoire (mp4 OK mais
 * pas de jpg). Mutex global pour éviter rafale ffmpeg.
 */
let thumbRegenBusy = false;
lunaclipRouter.post("/clips/:id/regen-thumb", async (req, res) => {
  const clipId = Number(req.params.id || 0);
  if (!Number.isFinite(clipId) || clipId <= 0) {
    return res.status(400).json({ ok: false, error: "id_required" });
  }
  if (!FFMPEG_OK || !r2Enabled()) {
    return res.status(503).json({ ok: false, error: "ffmpeg_or_r2_unavailable" });
  }
  if (thumbRegenBusy) {
    return res.status(429).json({ ok: false, error: "another_regen_in_progress" });
  }
  thumbRegenBusy = true;
  try {
    const r = await pool.query(
      `SELECT mp4_key FROM bot_clips WHERE id=$1 AND deleted_ts IS NULL LIMIT 1`,
      [clipId]
    );
    const mp4Key = String(r.rows?.[0]?.mp4_key || "").trim();
    if (!mp4Key) return res.status(404).json({ ok: false, error: "mp4_not_ready" });
    const mp4Url = buildPublicUrl(mp4Key);
    if (!mp4Url) return res.status(500).json({ ok: false, error: "build_url_failed" });

    const args = [
      "-hide_banner", "-loglevel", "error", "-y", "-nostdin", "-rw_timeout", "10000000",
      "-ss", "1", "-i", mp4Url,
      "-an", "-frames:v", "1", "-vf", "scale=640:-1", "-q:v", "5",
      "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1"
    ];
    const buf: Buffer = await new Promise((resolve, reject) => {
      const p = spawn(FFMPEG_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
      const chunks: Buffer[] = [];
      let stderr = "";
      const killTimer = setTimeout(() => { try { p.kill("SIGKILL"); } catch {} }, 15_000);
      p.stdout.on("data", (d: Buffer) => chunks.push(Buffer.from(d)));
      p.stderr.on("data", (d: Buffer) => { stderr += String(d); });
      p.on("error", (e) => { clearTimeout(killTimer); reject(e); });
      p.on("close", (code) => {
        clearTimeout(killTimer);
        const out = Buffer.concat(chunks);
        if (code !== 0 || out.length < 1000) {
          return reject(new Error(`ffmpeg exit ${code} bytes=${out.length} stderr=${stderr.slice(0, 200)}`));
        }
        resolve(out);
      });
    });

    const r2Key = `clips/thumbnails/${clipId}.jpg`;
    const ok = await putR2Buffer({ key: r2Key, contentType: "image/jpeg", buffer: buf });
    if (!ok) return res.status(500).json({ ok: false, error: "r2_upload_failed" });
    const publicUrl = buildPublicUrl(r2Key);
    if (!publicUrl) return res.status(500).json({ ok: false, error: "build_thumb_url_failed" });

    await pool.query(`UPDATE bot_clips SET thumbnail_url=$1 WHERE id=$2`, [publicUrl, clipId]);
    return res.json({ ok: true, clipId, thumbnailUrl: publicUrl, bytes: buf.length });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  } finally {
    thumbRegenBusy = false;
  }
});

const ALERT_MULTI = parseFloat(process.env.LUNACLIP_ALERT_MULTI ?? "300");

// GET /admin/lunaclip/status
lunaclipRouter.get("/status", async (_req, res) => {
  const r = await pool.query(`SELECT payload, updated_at FROM lunaclip_admin_state WHERE id=1`);

  if (r.rowCount === 0) {
    return res.json({
      ok: true,
      active_count: 0,
      alert_multi: ALERT_MULTI,
      workers: [],
      bot_unreachable: true,
      bot_error: "no_snapshot_yet",
      memory_mb: 0,
      ram_limit_mb: 420,
      cpu_pct: 0,
      cpu_limit_cores: null,
      skipped_ram: [],
      waiting_slugs: [],
      ignored_ids: [],
      scheduler: {
        max_workers: 1, min_watch_sec: 1200, ram_limit_mb: 420,
        ignored: [], priority_queue: [], waiting: [], skipped_ram: [],
        alert_multi: ALERT_MULTI,
        locked: false, locked_streamer_id: null, locked_until_ms: null,
      },
    });
  }

  const row = r.rows[0];
  const payload = row.payload ?? {};
  const ageSec = Math.floor((Date.now() - new Date(row.updated_at).getTime()) / 1000);
  const stale = ageSec > 10;

  res.json({
    ok: true,
    alert_multi: ALERT_MULTI,
    ...payload,
    bot_unreachable: stale,
    bot_error: stale ? `stale_${ageSec}s` : null,
  });
});

// GET /admin/lunaclip/logs
lunaclipRouter.get("/logs", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 100), 200);
  const slug  = (req.query.slug as string | undefined) ?? null;

  const args: any[] = [];
  let where = "1=1";
  if (slug) {
    args.push(slug);
    where = `(slug = $1 OR slug='scheduler')`;
  }

  const r = await pool.query(
    `SELECT ts, slug, source, msg
     FROM lunaclip_admin_logs
     WHERE ${where}
     ORDER BY id DESC
     LIMIT ${limit}`,
    args
  );

  const logs = r.rows.reverse().map((x: any) => ({
    ts: new Date(x.ts).getTime(),
    slug: x.slug,
    source: x.source,
    msg: x.msg,
  }));

  res.json({ ok: true, logs });
});

// POST /admin/lunaclip/control
lunaclipRouter.post("/control", async (req, res) => {
  const { action, streamer_id, value, duration_sec } = req.body ?? {};

  const payload: any = {};
  if (streamer_id != null) payload.streamer_id = streamer_id;
  if (value != null) payload.value = value;
  if (duration_sec != null) payload.duration_sec = duration_sec;

  await pool.query(
    `INSERT INTO lunaclip_admin_commands (action, payload)
     VALUES ($1, $2::jsonb)`,
    [String(action), JSON.stringify(payload)]
  );

  res.json({ ok: true });
});

// Historique DB (inchangé)
lunaclipRouter.get("/sessions", async (_req, res) => {
  const r = await pool.query(
    `SELECT ls.id, ls.hls_url, ls.provider, ls.status,
            ls.alert_multi, ls.interval_sec,
            ls.started_at, ls.stopped_at, ls.created_at, ls.streamer_id,
            s.slug AS streamer_slug, s.display_name AS streamer_name
     FROM lunaclip_sessions ls
     LEFT JOIN streamers s ON s.id = ls.streamer_id
     ORDER BY ls.created_at DESC LIMIT 50`
  );
  res.json({ ok: true, sessions: r.rows });
});

lunaclipRouter.get("/sessions/:id/events", async (req, res) => {
  const r = await pool.query(
    `SELECT * FROM lunaclip_events WHERE session_id=$1 ORDER BY triggered_at ASC`,
    [req.params.id]
  );
  res.json({ ok: true, events: r.rows });
});

lunaclipRouter.get("/sessions/:id/frames", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 500), 2000);
  const r = await pool.query(
    `SELECT ts_sec, multiplier, multiplier_source, in_bonus,
            win_numeric, win_total_numeric, bet_numeric, free_spins
     FROM lunaclip_frames
     WHERE session_id=$1 AND multiplier IS NOT NULL
     ORDER BY captured_at ASC LIMIT $2`,
    [req.params.id, limit]
  );
  res.json({ ok: true, frames: r.rows });
});

lunaclipRouter.get("/clips", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 100), 500);
  const r = await pool.query(
    `SELECT bc.id, bc.title, bc.author, bc.at_sec,
            bc.pre_sec, bc.post_sec, bc.created_ts, bc.vod_url, bc.streamer_id,
            s.slug AS streamer_slug, s.display_name AS streamer_name
     FROM bot_clips bc
     LEFT JOIN streamers s ON s.id = bc.streamer_id
     WHERE bc.author = 'lunaclip'
     ORDER BY bc.created_ts DESC LIMIT $1`,
    [limit]
  );
  res.json({ ok: true, clips: r.rows });
});

lunaclipRouter.post("/clips/manual", async (req, res) => {
  const { streamer_id } = req.body as { streamer_id?: number };
  if (!streamer_id) return res.status(400).json({ ok: false, error: "missing_streamer_id" });

  const sr = await pool.query(`SELECT payload FROM lunaclip_admin_state WHERE id=1`);
  const payload = sr.rows[0]?.payload ?? {};
  const worker = (payload.workers ?? []).find((w: any) => w.streamer_id === streamer_id);

  if (!worker?.last_frame) return res.status(409).json({ ok: false, error: "no_frame_available" });

  const f = worker.last_frame;
  const sessionStartedAt = new Date(worker.started_at).getTime() / 1000;
  const LATENCY_PAD_SEC = 15;
  const atSec = Math.max(0, f.ts_sec - sessionStartedAt + LATENCY_PAD_SEC);

  const winLabel = f.win_total_value ?? f.win_value ?? "?";
  const title = `🎰 [MANUEL] x${f.multiplier} — ${(f.provider ?? "").toUpperCase()} — WIN ${winLabel}`;
  const result = await addLunaClip(pool, streamer_id, title, atSec);
  res.json({ ok: result.ok, reason: (result as any).reason ?? null });
});

lunaclipRouter.get("/events/recent", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  const r = await pool.query(
    `SELECT le.*, ls.streamer_id,
            s.slug AS streamer_slug, s.display_name AS streamer_name
     FROM lunaclip_events le
     JOIN lunaclip_sessions ls ON ls.id = le.session_id
     LEFT JOIN streamers s ON s.id = ls.streamer_id
     ORDER BY le.triggered_at DESC LIMIT $1`,
    [limit]
  );
  res.json({ ok: true, events: r.rows });
});