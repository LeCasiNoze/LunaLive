// api/src/routes/public.ts
import { Router, type Request } from "express";
import jwt from "jsonwebtoken";

import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import type { AuthUser } from "../auth.js";
import { a } from "../utils/async.js";
import { chatStore } from "../chat_store.js";
import normalizeAppearance from "../appearance.js";
import { emitChatAll, emitChatAndStream } from "../socket_emit.js";

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

publicRouter.get(
  "/content/:key",
  a(async (req, res) => {
    const key = String(req.params.key || "").trim();
    if (!key) return res.status(400).json({ ok: false, error: "missing_key" });

    const { rows } = await pool.query(
      `SELECT key, title, html, updated_at
       FROM site_content
       WHERE key = $1`,
      [key]
    );

    const row = rows[0] || null;
    return res.json({ ok: true, item: row });
  })
);

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
      `SELECT
         s.id::text AS id,
         s.slug,
         s.display_name AS "displayName",
         s.title,
         s.viewers,
         s.is_live AS "isLive",
         s.featured,
         s.user_id AS "ownerUserId",

         -- optionnel mais pratique: URL directe si avatar existe
         CASE
           WHEN ua.user_id IS NOT NULL THEN ('/avatars/u/' || s.user_id::text)
           ELSE NULL
         END AS "avatarUrl"

       FROM streamers s
       LEFT JOIN user_avatars ua
         ON ua.user_id = s.user_id

       WHERE (s.suspended_until IS NULL OR s.suspended_until < NOW())
       ORDER BY LOWER(s.display_name) ASC`
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

      -- ✅ USER (source de vérité des subs)
      jsonb_build_object(
        'id', u.id,
        'username', u.username,
        'role', u.role,
        'user_subscriptions', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'plan_code', us.plan_code,
              'status', us.status,
              'current_period_start', us.current_period_start,
              'current_period_end', us.current_period_end,
              'cancel_at_period_end', us.cancel_at_period_end,
              'provider', us.provider,
              'provider_subscription_id', us.provider_subscription_id
            )
            ORDER BY us.plan_code
          )
          FROM user_subscriptions us
          WHERE us.user_id = u.id
        ), '[]'::jsonb)
      ) AS "user",

      -- ✅ DLive linked
      s.dlive_use_linked AS "dliveUseLinked",
      s.dlive_link_displayname AS "dliveLinkedDisplayname",
      s.dlive_link_username AS "dliveLinkedUsername",

      -- provider assigné
      pa.channel_slug AS "providerChannelSlug",
      pa.channel_username AS "providerChannelUsername",

      -- ✅ HOST
      hs.slug AS "hostTargetSlug",
      hs.display_name AS "hostTargetDisplayName",
      hs.is_live AS "hostTargetIsLive"

    FROM streamers s

    -- ✅ join user (compte streamer)
    LEFT JOIN users u
      ON u.id = s.user_id

    LEFT JOIN provider_accounts pa
      ON pa.assigned_to_streamer_id = s.id
    AND pa.provider='dlive'

    LEFT JOIN streamer_hosts h
      ON h.hoster_streamer_id = s.id
    LEFT JOIN streamers hs
      ON hs.id = h.target_streamer_id
    AND (hs.suspended_until IS NULL OR hs.suspended_until < NOW())

    WHERE s.slug = $1
      AND (s.suspended_until IS NULL OR s.suspended_until < NOW())
    LIMIT 1
    `,
    [slug]
  );

    if (!rows[0]) return res.status(404).json({ ok: false, error: "not_found" });

    const row = rows[0];
    row.appearance = normalizeAppearance(row.appearance || {});

    // ✅ choisir la chaîne DLive effective
    const useLinked = !!row.dliveUseLinked;

    const linkedSlug = useLinked && row.dliveLinkedDisplayname ? String(row.dliveLinkedDisplayname) : null;
    const linkedUsername = useLinked && row.dliveLinkedUsername ? String(row.dliveLinkedUsername) : null;

    const providerSlug = row.providerChannelSlug ? String(row.providerChannelSlug) : null;
    const providerUsername = row.providerChannelUsername ? String(row.providerChannelUsername) : null;

    row.channelSlug = linkedSlug || providerSlug || null;
    row.channelUsername = (useLinked ? linkedUsername : providerUsername) || null;

    // ✅ host actif seulement si target live
    const hostTargetIsLive = !!row.hostTargetIsLive;
    const hostTargetSlug =
      hostTargetIsLive && row.hostTargetSlug ? String(row.hostTargetSlug).trim() : null;
    const hostTargetDisplayName =
      hostTargetIsLive && row.hostTargetDisplayName ? String(row.hostTargetDisplayName).trim() : null;

    // cleanup (ne pas leak les champs internes)
    delete row.dliveUseLinked;
    delete row.dliveLinkedDisplayname;
    delete row.dliveLinkedUsername;
    delete row.providerChannelSlug;
    delete row.providerChannelUsername;

    // (optionnel) tu peux delete aussi hostTargetIsLive si tu veux
    // delete row.hostTargetIsLive;

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

      // ✅ HOST exposed
      hostTargetSlug,
      hostTargetDisplayName,
      hostTargetIsLive: hostTargetIsLive && !!hostTargetSlug,
    });
  })
);

/**
 * ✅ HOST (owner/admin)
 * POST /streamers/:slug/host
 * Body: { targetSlug: string | null }
 */
publicRouter.post(
  "/streamers/:slug/host",
  requireAuth,
  a(async (req, res) => {
    const slug = String(req.params.slug || "").trim();
    if (!slug) return res.status(400).json({ ok: false, error: "bad_slug" });

    const requesterId = Number(req.user!.id);
    const requesterRole = String((req.user as any)?.role || "viewer");

    const s = await pool.query(
      `SELECT id, slug, display_name AS "displayName", user_id AS "ownerUserId"
       FROM streamers
       WHERE lower(slug)=lower($1)
         AND (suspended_until IS NULL OR suspended_until < NOW())
       LIMIT 1`,
      [slug]
    );
    const hoster = s.rows?.[0];
    if (!hoster) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const isOwner = Number(hoster.ownerUserId) === requesterId;
    const isAdmin = requesterRole === "admin";
    if (!isOwner && !isAdmin) return res.status(403).json({ ok: false, error: "forbidden" });

    const targetSlugRaw = (req.body as any)?.targetSlug;
    const targetSlug = targetSlugRaw == null ? "" : String(targetSlugRaw).trim();

    // ✅ STOP host
    if (!targetSlug) {
      await pool.query(
        `INSERT INTO streamer_hosts (hoster_streamer_id, target_streamer_id, updated_at)
         VALUES ($1, NULL, now())
         ON CONFLICT (hoster_streamer_id) DO UPDATE
           SET target_streamer_id=NULL, updated_at=now()`,
        [Number(hoster.id)]
      );

      const io = req.app.locals.io;
      if (io) {
        const msg = chatStore.addSystem(String(hoster.slug), `🛑 Host arrêté.`);
        emitChatAll(io, String(hoster.slug), "chat:message", msg);
      }

      return res.json({ ok: true, hostTargetSlug: null, hostTargetDisplayName: null, hostTargetIsLive: false });
    }

    // ✅ TARGET must exist + live
    const t = await pool.query(
      `SELECT id, slug, display_name AS "displayName", is_live AS "isLive"
       FROM streamers
       WHERE lower(slug)=lower($1)
         AND (suspended_until IS NULL OR suspended_until < NOW())
       LIMIT 1`,
      [targetSlug]
    );
    const target = t.rows?.[0];
    if (!target) return res.status(404).json({ ok: false, error: "target_not_found" });
    if (!target.isLive) return res.status(400).json({ ok: false, error: "target_not_live" });

    if (String(target.slug).toLowerCase() === String(hoster.slug).toLowerCase()) {
      return res.status(400).json({ ok: false, error: "cannot_host_self" });
    }

    await pool.query(
      `INSERT INTO streamer_hosts (hoster_streamer_id, target_streamer_id, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (hoster_streamer_id) DO UPDATE
         SET target_streamer_id=EXCLUDED.target_streamer_id, updated_at=now()`,
      [Number(hoster.id), Number(target.id)]
    );

    const io = req.app.locals.io;
    if (io) {
      const msg = chatStore.addSystem(
        String(hoster.slug),
        `📺 ${String(hoster.displayName || hoster.slug)} host ${String(target.displayName || target.slug)} !`
      );
      emitChatAll(io, String(hoster.slug), "chat:message", msg);
    }

    return res.json({
      ok: true,
      hostTargetSlug: String(target.slug),
      hostTargetDisplayName: String(target.displayName || target.slug),
      hostTargetIsLive: true,
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
      emitChatAndStream(io, streamer.slug, "stream:follows", {
        slug: streamer.slug,
        followsCount,
      });
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
        emitChatAll(io, String(streamer.slug), "chat:message", msg);
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
      emitChatAndStream(io, streamer.slug, "stream:follows", {
        slug: streamer.slug,
        followsCount,
      });
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
