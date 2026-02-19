// api/src/lunaclip/routes.ts
//
// Routes /admin/lunaclip/* — protégées par requireAdminKey dans app.ts
//
// Le scheduler tourne automatiquement (scheduler.ts).
// Ces routes exposent l'état en temps réel et permettent un override manuel.

import { Router } from "express";
import { pool } from "../db.js";
import { activeWorkers } from "./scheduler.js";
import { addLunaClip } from "./clips.js";

export const lunaclipRouter = Router();

const ALERT_MULTI = parseFloat(process.env.LUNACLIP_ALERT_MULTI ?? "300");


// ─────────────────────────────────────────────
// GET /admin/lunaclip/status
// État global du scheduler + tous les workers actifs
// ─────────────────────────────────────────────
lunaclipRouter.get("/status", (_req, res) => {
  const workers = [...activeWorkers.values()].map(w => ({
    streamer_id:   w.streamerId,
    streamer_slug: w.streamerSlug,
    dlive_slug:    w.dliveSlug,
    session_id:    w.sessionId.toString(),
    status:        w.status,
    started_at:    w.startedAt,
    hls_url:       w.hlsUrl,
    provider:      w.provider,
    last_frame:    w.lastFrame,
  }));

  res.json({
    ok:           true,
    active_count: workers.length,
    alert_multi:  ALERT_MULTI,
    workers,
  });
});


// ─────────────────────────────────────────────
// GET /admin/lunaclip/status/:streamerId
// État d'un worker spécifique (pour polling dashboard par streamer)
// ─────────────────────────────────────────────
lunaclipRouter.get("/status/:streamerId", (req, res) => {
  const sid = parseInt(req.params.streamerId, 10);
  const w   = activeWorkers.get(sid);
  if (!w) {
    return res.json({ ok: true, status: "idle", last_frame: null });
  }
  res.json({
    ok:          true,
    streamer_id: w.streamerId,
    session_id:  w.sessionId.toString(),
    status:      w.status,
    started_at:  w.startedAt,
    provider:    w.provider,
    last_frame:  w.lastFrame,
  });
});


// ─────────────────────────────────────────────
// GET /admin/lunaclip/sessions
// Historique des 50 dernières sessions (tous streamers)
// ─────────────────────────────────────────────
lunaclipRouter.get("/sessions", async (_req, res) => {
  const r = await pool.query(
    `SELECT
       ls.id, ls.hls_url, ls.provider, ls.status,
       ls.alert_multi, ls.interval_sec,
       ls.started_at, ls.stopped_at, ls.created_at,
       ls.streamer_id,
       s.slug AS streamer_slug,
       s.display_name AS streamer_name
     FROM lunaclip_sessions ls
     LEFT JOIN streamers s ON s.id = ls.streamer_id
     ORDER BY ls.created_at DESC
     LIMIT 50`
  );
  res.json({ ok: true, sessions: r.rows });
});


// ─────────────────────────────────────────────
// GET /admin/lunaclip/sessions/:id/events
// ─────────────────────────────────────────────
lunaclipRouter.get("/sessions/:id/events", async (req, res) => {
  const r = await pool.query(
    `SELECT * FROM lunaclip_events
     WHERE session_id = $1
     ORDER BY triggered_at ASC`,
    [req.params.id]
  );
  res.json({ ok: true, events: r.rows });
});


// ─────────────────────────────────────────────
// GET /admin/lunaclip/sessions/:id/frames
// Pour le graphe multiplicateur
// ─────────────────────────────────────────────
lunaclipRouter.get("/sessions/:id/frames", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 500), 2000);
  const r = await pool.query(
    `SELECT ts_sec, multiplier, multiplier_source, in_bonus,
            win_numeric, win_total_numeric, bet_numeric, free_spins
     FROM lunaclip_frames
     WHERE session_id = $1 AND multiplier IS NOT NULL
     ORDER BY captured_at ASC
     LIMIT $2`,
    [req.params.id, limit]
  );
  res.json({ ok: true, frames: r.rows });
});


// ─────────────────────────────────────────────
// GET /admin/lunaclip/clips
// Tous les clips créés par LunaClip (tous streamers)
// ─────────────────────────────────────────────
lunaclipRouter.get("/clips", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 100), 500);
  const r = await pool.query(
    `SELECT
       bc.id, bc.title, bc.author, bc.at_sec,
       bc.pre_sec, bc.post_sec, bc.created_ts, bc.vod_url,
       bc.streamer_id,
       s.slug AS streamer_slug,
       s.display_name AS streamer_name
     FROM bot_clips bc
     LEFT JOIN streamers s ON s.id = bc.streamer_id
     WHERE bc.author = 'lunaclip'
     ORDER BY bc.created_ts DESC
     LIMIT $1`,
    [limit]
  );
  res.json({ ok: true, clips: r.rows });
});


// ─────────────────────────────────────────────
// POST /admin/lunaclip/clips/manual
// Clip manuel sur le frame actuel d'un streamer donné
// ─────────────────────────────────────────────
lunaclipRouter.post("/clips/manual", async (req, res) => {
  const { streamer_id } = req.body as { streamer_id?: number };
  if (!streamer_id) return res.status(400).json({ ok: false, error: "missing_streamer_id" });

  const w = activeWorkers.get(streamer_id);
  if (!w || !w.lastFrame) {
    return res.status(409).json({ ok: false, error: "no_frame_available" });
  }

  const f        = w.lastFrame;
  const winLabel = f.win_total_value ?? f.win_value ?? "?";
  const title    = `🎰 [MANUEL] x${f.multiplier} — ${(f.provider ?? "").toUpperCase()} — WIN ${winLabel}`;
  const result   = await addLunaClip(pool, streamer_id, title, f.ts_sec);
  res.json({ ok: result.ok, reason: (result as any).reason ?? null });
});


// ─────────────────────────────────────────────
// GET /admin/lunaclip/events/recent
// Derniers EVENTs toutes sessions confondues (pour la vue globale)
// ─────────────────────────────────────────────
lunaclipRouter.get("/events/recent", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  const r = await pool.query(
    `SELECT
       le.*,
       ls.streamer_id,
       s.slug AS streamer_slug,
       s.display_name AS streamer_name
     FROM lunaclip_events le
     JOIN lunaclip_sessions ls ON ls.id = le.session_id
     LEFT JOIN streamers s ON s.id = ls.streamer_id
     ORDER BY le.triggered_at DESC
     LIMIT $1`,
    [limit]
  );
  res.json({ ok: true, events: r.rows });
});