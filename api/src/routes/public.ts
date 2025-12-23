// api/src/routes/public.ts
import { Router, type Request } from "express";
import jwt from "jsonwebtoken";

import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import type { AuthUser } from "../auth.js";
import { a } from "../utils/async.js";
import { chatStore } from "../chat_store.js";
import normalizeAppearance from "../appearance.js";

export const publicRouter = Router();

function tryGetAuthUser(req: Request): AuthUser | null {
  const h = String(req.headers.authorization || "");
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return null;
    return jwt.verify(m[1], secret) as AuthUser;
  } catch {
    return null;
  }
}

/* Health */
publicRouter.get("/health", (_req, res) => res.json({ ok: true }));

/* Public */
publicRouter.get(
  "/lives",
  a(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT
        s.id::text AS id,
        s.slug,
        s.display_name AS "displayName",
        s.title,
        s.viewers,
        s.thumb_url AS "thumbUrlDb",
        s.live_started_at AS "liveStartedAt"
      FROM streamers s
      WHERE s.is_live = TRUE
        AND (s.suspended_until IS NULL OR s.suspended_until < NOW())
      ORDER BY s.viewers DESC`
    );

    res.json(
      rows.map((r: any) => {
        const slug = String(r.slug || "").trim();
        const apiThumb = slug ? `/thumbs/${encodeURIComponent(slug)}.jpg` : null;

        return {
          id: String(r.id),
          slug,
          displayName: String(r.displayName || ""),
          title: String(r.title || ""),
          viewers: Number(r.viewers || 0),
          liveStartedAt: r.liveStartedAt ? String(r.liveStartedAt) : null,
          thumbUrl: r.thumbUrlDb ? String(r.thumbUrlDb) : apiThumb,
        };
      })
    );
  })
);

publicRouter.get(
  "/streamers",
  a(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT id::text AS id, slug, display_name AS "displayName", title, viewers, is_live AS "isLive", featured
       FROM streamers
       WHERE (suspended_until IS NULL OR suspended_until < NOW())
       ORDER BY LOWER(display_name) ASC`
    );
    res.json(rows);
  })
);

publicRouter.get(
  "/streamers/:slug",
  a(async (req, res) => {
    const slug = String(req.params.slug || "");

    const { rows } = await pool.query(
      `SELECT
         s.id::text AS id,
         s.slug,
         s.display_name AS "displayName",
         s.title,
         s.viewers,
         s.is_live AS "isLive",
         s.live_started_at AS "liveStartedAt",
         s.appearance AS "appearance",
         s.offline_bg_path AS "offlineBgPath",
         s.user_id AS "ownerUserId",
         pa.channel_slug AS "channelSlug",
         pa.channel_username AS "channelUsername"
       FROM streamers s
       LEFT JOIN provider_accounts pa
         ON pa.assigned_to_streamer_id = s.id
        AND pa.provider='dlive'
       WHERE s.slug = $1
         AND (s.suspended_until IS NULL OR s.suspended_until < NOW())
       LIMIT 1`,
      [slug]
    );

    if (!rows[0]) return res.status(404).json({ ok: false, error: "not_found" });

    const row = rows[0];
    row.appearance = normalizeAppearance(row.appearance || {});

    const c = await pool.query(`SELECT COUNT(*)::int AS n FROM streamer_follows WHERE streamer_id = $1`, [
      Number(row.id),
    ]);
    const followsCount = Number(c.rows?.[0]?.n ?? 0);

    const me = tryGetAuthUser(req);
    let isFollowing = false;
    let notifyEnabled = true;

    if (me?.id) {
      const f = await pool.query(
        `SELECT notify_enabled
         FROM streamer_follows
         WHERE streamer_id=$1 AND user_id=$2
         LIMIT 1`,
        [Number(row.id), Number(me.id)]
      );

      if (f.rows?.[0]) {
        isFollowing = true;
        notifyEnabled = !!f.rows[0].notify_enabled;
      }
    }

    const base = (process.env.PUBLIC_API_BASE || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
    const offlineBgUrl = row.offlineBgPath
      ? `${base}/uploads/streamers/${encodeURIComponent(row.offlineBgPath)}`
      : null;

    res.json({
      ...row,
      offlineBgUrl,
      followsCount,
      isFollowing,
      ...(me?.id ? { notifyEnabled: isFollowing ? notifyEnabled : false } : {}),
    });
  })
);

publicRouter.post(
  "/streamers/:slug/follow",
  requireAuth,
  a(async (req, res) => {
    const slug = String(req.params.slug || "").trim();
    if (!slug) return res.status(400).json({ ok: false, error: "bad_slug" });

    const s = await pool.query(
      `SELECT id, slug, display_name AS "displayName", user_id AS "ownerUserId", appearance
       FROM streamers
       WHERE lower(slug)=lower($1)
         AND (suspended_until IS NULL OR suspended_until < NOW())
       LIMIT 1`,
      [slug]
    );

    const streamer = s.rows?.[0];
    if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    if (streamer.ownerUserId != null && Number(streamer.ownerUserId) === Number(req.user!.id)) {
      return res.status(400).json({ ok: false, error: "cannot_self_follow" });
    }

    const ins = await pool.query(
      `INSERT INTO streamer_follows (streamer_id, user_id)
       VALUES ($1,$2)
       ON CONFLICT DO NOTHING`,
      [Number(streamer.id), Number(req.user!.id)]
    );

    const c = await pool.query(`SELECT COUNT(*)::int AS n FROM streamer_follows WHERE streamer_id=$1`, [
      Number(streamer.id),
    ]);
    const followsCount = Number(c.rows?.[0]?.n ?? 0);

    const io = req.app.locals.io;
    if (io) {
      io.to(`chat:${streamer.slug}`).emit("stream:follows", { slug: streamer.slug, followsCount });
    }

    if ((ins.rowCount ?? 0) > 0) {
      const tpl =
        (streamer.appearance?.chat?.followMessageTemplate &&
          String(streamer.appearance.chat.followMessageTemplate)) ||
        "💜 {user} suit {streamer} !";

      const body = tpl
        .replaceAll("{user}", String(req.user!.username))
        .replaceAll("{streamer}", String(streamer.displayName || streamer.slug));

      if (io) {
        const msg = chatStore.addSystem(String(streamer.slug), body);
        io.to(`chat:${streamer.slug}`).emit("chat:message", msg);
      }
    }

    const nf = await pool.query(
      `SELECT notify_enabled
       FROM streamer_follows
       WHERE streamer_id=$1 AND user_id=$2
       LIMIT 1`,
      [Number(streamer.id), Number(req.user!.id)]
    );
    const notifyEnabled = nf.rows?.[0] ? !!nf.rows[0].notify_enabled : true;

    return res.json({ ok: true, following: true, followsCount, notifyEnabled });
  })
);

publicRouter.delete(
  "/streamers/:slug/follow",
  requireAuth,
  a(async (req, res) => {
    const slug = String(req.params.slug || "").trim();
    if (!slug) return res.status(400).json({ ok: false, error: "bad_slug" });

    const s = await pool.query(
      `SELECT id, slug
       FROM streamers
       WHERE lower(slug)=lower($1)
         AND (suspended_until IS NULL OR suspended_until < NOW())
       LIMIT 1`,
      [slug]
    );

    const streamer = s.rows?.[0];
    if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    await pool.query(`DELETE FROM streamer_follows WHERE streamer_id=$1 AND user_id=$2`, [
      Number(streamer.id),
      Number(req.user!.id),
    ]);

    const c = await pool.query(`SELECT COUNT(*)::int AS n FROM streamer_follows WHERE streamer_id=$1`, [
      Number(streamer.id),
    ]);
    const followsCount = Number(c.rows?.[0]?.n ?? 0);

    const io = req.app.locals.io;
    if (io) {
      io.to(`chat:${streamer.slug}`).emit("stream:follows", { slug: streamer.slug, followsCount });
    }

    return res.json({ ok: true, following: false, followsCount, notifyEnabled: false });
  })
);

publicRouter.patch(
  "/streamers/:slug/follow/notify",
  requireAuth,
  a(async (req, res) => {
    const slug = String(req.params.slug || "").trim();
    if (!slug) return res.status(400).json({ ok: false, error: "bad_slug" });

    const raw = req.body?.notifyEnabled;
    if (typeof raw !== "boolean") return res.status(400).json({ ok: false, error: "notifyEnabled_required" });
    const notifyEnabled = raw;

    const s = await pool.query(
      `SELECT id, slug
       FROM streamers
       WHERE lower(slug)=lower($1)
         AND (suspended_until IS NULL OR suspended_until < NOW())
       LIMIT 1`,
      [slug]
    );

    const streamer = s.rows?.[0];
    if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const upd = await pool.query(
      `UPDATE streamer_follows
       SET notify_enabled = $3
       WHERE streamer_id = $1 AND user_id = $2
       RETURNING notify_enabled`,
      [Number(streamer.id), Number(req.user!.id), notifyEnabled]
    );

    if (!upd.rows?.[0]) return res.status(404).json({ ok: false, error: "not_following" });

    return res.json({ ok: true, notifyEnabled: !!upd.rows[0].notify_enabled });
  })
);
