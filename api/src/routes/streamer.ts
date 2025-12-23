// api/src/routes/streamer.ts
import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { a } from "../utils/async.js";
import normalizeAppearance, { mergeAppearance, PRESET_COLORS } from "../appearance.js";

export const streamerRouter = Router();

/* Streamer request */
streamerRouter.post(
  "/streamer/apply",
  requireAuth,
  a(async (req, res) => {
    const userId = req.user!.id;

    const { rows } = await pool.query(
      `INSERT INTO streamer_requests (user_id, status)
       VALUES ($1, 'pending')
       ON CONFLICT (user_id) DO UPDATE
         SET status='pending', updated_at = NOW()
       RETURNING id, status, created_at AS "createdAt"`,
      [userId]
    );

    res.json({ ok: true, request: rows[0] });
  })
);

streamerRouter.get(
  "/streamer/request",
  requireAuth,
  a(async (req, res) => {
    const userId = req.user!.id;
    const { rows } = await pool.query(
      `SELECT id, status, created_at AS "createdAt"
       FROM streamer_requests
       WHERE user_id = $1
       LIMIT 1`,
      [userId]
    );
    res.json({ ok: true, request: rows[0] || null });
  })
);

/* Streamer (dashboard) */
streamerRouter.get(
  "/streamer/me",
  requireAuth,
  a(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id::text AS id, slug, display_name AS "displayName",
              title, viewers, is_live AS "isLive", featured,
              appearance
       FROM streamers
       WHERE user_id = $1
       LIMIT 1`,
      [req.user!.id]
    );

    const s = rows[0] || null;
    if (!s) return res.json({ ok: true, streamer: null });

    s.appearance = normalizeAppearance(s.appearance || {});
    res.json({ ok: true, streamer: s });
  })
);

streamerRouter.patch(
  "/streamer/me",
  requireAuth,
  a(async (req, res) => {
    if (req.user!.role !== "streamer" && req.user!.role !== "admin") {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const title = String(req.body.title ?? "").trim();
    if (title.length > 140) return res.status(400).json({ ok: false, error: "title_too_long" });

    const { rows } = await pool.query(
      `UPDATE streamers
       SET title = $1, updated_at = NOW()
       WHERE user_id = $2
       RETURNING id::text AS id, slug, display_name AS "displayName",
                 title, viewers, is_live AS "isLive", featured, appearance`,
      [title, req.user!.id]
    );

    if (!rows[0]) return res.status(404).json({ ok: false, error: "not_found" });

    rows[0].appearance = normalizeAppearance(rows[0].appearance || {});
    res.json({ ok: true, streamer: rows[0] });
  })
);

streamerRouter.get(
  "/streamer/me/appearance",
  requireAuth,
  a(async (req, res) => {
    if (req.user!.role !== "streamer" && req.user!.role !== "admin") {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const cur = await pool.query(
      `SELECT slug, appearance, offline_bg_path
       FROM streamers WHERE user_id=$1 LIMIT 1`,
      [req.user!.id]
    );
    if (!cur.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });

    const base = (process.env.PUBLIC_API_BASE || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
    const offlineBgUrl = cur.rows[0].offline_bg_path
      ? `${base}/uploads/streamers/${encodeURIComponent(cur.rows[0].offline_bg_path)}`
      : null;

    res.json({
      ok: true,
      appearance: normalizeAppearance(cur.rows[0].appearance || {}),
      presets: PRESET_COLORS,
      offlineBgUrl,
    });
  })
);

streamerRouter.patch(
  "/streamer/me/appearance",
  requireAuth,
  a(async (req, res) => {
    if (req.user!.role !== "streamer" && req.user!.role !== "admin") {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const appearancePatch = req.body?.appearance ?? req.body;
    if (!appearancePatch || typeof appearancePatch !== "object") {
      return res.status(400).json({ ok: false, error: "bad_appearance" });
    }

    const cur = await pool.query(`SELECT slug, appearance FROM streamers WHERE user_id=$1 LIMIT 1`, [req.user!.id]);
    if (!cur.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });

    const curSlug = String(cur.rows[0].slug || "");
    const curAppearance = cur.rows[0].appearance || {};
    const merged = mergeAppearance(curAppearance, appearancePatch);

    const upd = await pool.query(
      `UPDATE streamers
       SET appearance = $1, updated_at = NOW()
       WHERE user_id = $2
       RETURNING id::text AS id, slug, display_name AS "displayName",
                 title, viewers, is_live AS "isLive", featured, appearance`,
      [merged, req.user!.id]
    );

    const out = upd.rows[0];
    if (!out) return res.status(404).json({ ok: false, error: "not_found" });

    out.appearance = normalizeAppearance(out.appearance || {});

    const io = req.app?.locals?.io;
    if (io && curSlug) {
      io.to(`chat:${curSlug}`).emit("chat:appearance", { ok: true, appearance: out.appearance });
    }

    res.json({ ok: true, appearance: out.appearance, streamer: out });
  })
);

streamerRouter.get(
  "/streamer/me/connection",
  requireAuth,
  a(async (req, res) => {
    if (req.user!.role !== "streamer" && req.user!.role !== "admin") {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const { rows } = await pool.query(
      `SELECT pa.provider,
              pa.channel_slug AS "channelSlug",
              pa.rtmp_url AS "rtmpUrl",
              pa.stream_key AS "streamKey"
       FROM provider_accounts pa
       JOIN streamers s ON s.id = pa.assigned_to_streamer_id
       WHERE s.user_id = $1
       LIMIT 1`,
      [req.user!.id]
    );

    res.json({ ok: true, connection: rows[0] || null });
  })
);
