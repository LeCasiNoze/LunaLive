// api/src/lunaclip/routes.ts
// Routes /admin/lunaclip/* — protégées par requireAdminKey dans app.ts
// Le scheduler tourne dans le bot (bot/lunaclip/scheduler.ts).
// Ces routes lisent l'état via l'API interne du bot.

import { Router } from "express";
import { pool } from "../db.js";
import { addLunaClip } from "./clips.js";

export const lunaclipRouter = Router();

const ALERT_MULTI = parseFloat(process.env.LUNACLIP_ALERT_MULTI ?? "300");

// URL interne du bot (health server) pour lire l'état des workers
const BOT_INTERNAL_URL = String(
  process.env.BOT_INTERNAL_URL || "http://localhost:4000"
).replace(/\/$/, "");

async function getBotStatus() {
  try {
    const r = await fetch(`${BOT_INTERNAL_URL}/lunaclip/status`);
    if (!r.ok) return null;
    return r.json() as Promise<any>;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// GET /admin/lunaclip/status
// ─────────────────────────────────────────────
lunaclipRouter.get("/status", async (_req, res) => {
  const botStatus = await getBotStatus();
  if (!botStatus) {
    return res.json({ ok: true, active_count: 0, alert_multi: ALERT_MULTI, workers: [], bot_unreachable: true });
  }
  res.json({ ok: true, alert_multi: ALERT_MULTI, ...botStatus });
});

// ─────────────────────────────────────────────
// GET /admin/lunaclip/sessions
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
    `SELECT * FROM lunaclip_events WHERE session_id=$1 ORDER BY triggered_at ASC`,
    [req.params.id]
  );
  res.json({ ok: true, events: r.rows });
});

// ─────────────────────────────────────────────
// GET /admin/lunaclip/sessions/:id/frames
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// GET /admin/lunaclip/clips
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
     ORDER BY bc.created_ts DESC LIMIT $1`,
    [limit]
  );
  res.json({ ok: true, clips: r.rows });
});

// ─────────────────────────────────────────────
// POST /admin/lunaclip/clips/manual
// ─────────────────────────────────────────────
lunaclipRouter.post("/clips/manual", async (req, res) => {
  const { streamer_id } = req.body as { streamer_id?: number };
  if (!streamer_id) return res.status(400).json({ ok: false, error: "missing_streamer_id" });

  // Récupérer le last_frame depuis le bot
  const botStatus = await getBotStatus();
  const worker = botStatus?.workers?.find((w: any) => w.streamer_id === streamer_id);
  if (!worker?.last_frame) return res.status(409).json({ ok: false, error: "no_frame_available" });

  const f        = worker.last_frame;
  const winLabel = f.win_total_value ?? f.win_value ?? "?";
  const title    = `🎰 [MANUEL] x${f.multiplier} — ${(f.provider ?? "").toUpperCase()} — WIN ${winLabel}`;
  const result   = await addLunaClip(pool, streamer_id, title, f.ts_sec);
  res.json({ ok: result.ok, reason: (result as any).reason ?? null });
});

// ─────────────────────────────────────────────
// GET /admin/lunaclip/events/recent
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
     ORDER BY le.triggered_at DESC LIMIT $1`,
    [limit]
  );
  res.json({ ok: true, events: r.rows });
});