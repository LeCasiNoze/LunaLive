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
const HEARTBEAT_TTL_SECONDS = 45;

// Cache in-memory des réponses publiques identiques pour tous les visiteurs.
// La home repoll /lives toutes les 20 s par visiteur : sous charge, sans ce
// cache, chaque visiteur relance l'agrégat complet (COUNT DISTINCT sur les
// sessions actives) → 1 requête DB toutes les 5 s au lieu de N/s.
const PUBLIC_CACHE_TTL_MS = 5_000;
const publicCache = new Map<string, { body: unknown; ts: number }>();

function getPublicCache(key: string): unknown | null {
  const hit = publicCache.get(key);
  if (hit && Date.now() - hit.ts < PUBLIC_CACHE_TTL_MS) return hit.body;
  return null;
}

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

function isModLikeRole(role: any) {
  const r = String(role || "").toLowerCase();
  return ["mod", "moderator", "streamer_mod", "streamer_moderator"].includes(r);
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
    const cached = getPublicCache("lives");
    if (cached) {
      res.set("Cache-Control", "public, max-age=5");
      return res.json(cached);
    }

    const { rows } = await pool.query(
      `
WITH live_streamers AS (
  SELECT
    s.id,
    s.slug,
    s.platform,
    s.display_name AS "displayName",
    s.title,
    -- thumb_url Rumble en priorité (live actuel), fallback sur s.thumb_url
    COALESCE(ri.thumbnail_url, s.thumb_url) AS "thumbUrlDb",
    s.live_started_at AS "liveStartedAt",
    ('/avatars/u/' || s.user_id::text) AS "avatarUrl"
  FROM streamers s
  LEFT JOIN streamer_rumble_info ri ON ri.streamer_id = s.id
  WHERE s.is_live = TRUE
    AND (s.suspended_until IS NULL OR s.suspended_until < NOW())
),
open_ls AS (
  SELECT streamer_id, id AS live_session_id
  FROM live_sessions
  WHERE ended_at IS NULL
),
live_viewers AS (
  SELECT
    vs.streamer_id,
    COUNT(DISTINCT vs.viewer_key)::int AS viewers
  FROM viewer_sessions vs
  JOIN open_ls ls
    ON ls.live_session_id = vs.live_session_id
  WHERE vs.ended_at IS NULL
    AND vs.last_heartbeat_at >= (NOW() - ($1::int * INTERVAL '1 second'))
  GROUP BY vs.streamer_id
)
SELECT
  ls.id::text AS id,
  ls.slug,
  ls.platform,
  ls."displayName",
  ls.title,
  COALESCE(v.viewers, 0)::int AS viewers,
  ls."thumbUrlDb",
  ls."liveStartedAt",
  ls."avatarUrl"
FROM live_streamers ls
LEFT JOIN live_viewers v ON v.streamer_id = ls.id
ORDER BY COALESCE(v.viewers, 0) DESC, ls."liveStartedAt" DESC NULLS LAST
      `,
      [HEARTBEAT_TTL_SECONDS]
    );

    const payload = rows.map((r: any) => {
      const slug = String(r.slug || "").trim();
      const apiThumb = slug ? `/thumbs/${encodeURIComponent(slug)}.jpg` : null;
      const platform = String(r.platform || "").trim().toLowerCase();

      return {
        id: String(r.id),
        slug,
        displayName: String(r.displayName || ""),
        title: String(r.title || ""),
        viewers: Number(r.viewers || 0),
        liveStartedAt: r.liveStartedAt ? String(r.liveStartedAt) : null,
        thumbUrl: platform === "rumble"
          ? (apiThumb || (r.thumbUrlDb ? String(r.thumbUrlDb) : null))
          : (r.thumbUrlDb ? String(r.thumbUrlDb) : apiThumb),
        avatarUrl: r.avatarUrl ? String(r.avatarUrl) : null,
      };
    });

    publicCache.set("lives", { body: payload, ts: Date.now() });
    res.set("Cache-Control", "public, max-age=5");
    res.json(payload);
  })
);

// ✅ LIST public content tabs (for DailyBonus modal)
publicRouter.get(
  "/content-list",
  a(async (_req, res) => {
    const ALLOW_PREFIX = ["guide_", "daily_bonus_", "bonus_"];

    const { rows } = await pool.query(
      `SELECT key, title, COALESCE(min_role,'viewer') as min_role, updated_at
       FROM site_content
       WHERE (${ALLOW_PREFIX.map((_, i) => `key LIKE $${i + 1}`).join(" OR ")})
       ORDER BY key ASC`,
      ALLOW_PREFIX.map((p) => `${p}%`)
    );

    res.json({ ok: true, items: rows });
  })
);

publicRouter.get(
  "/streamers",
  a(async (_req, res) => {
    const cached = getPublicCache("streamers");
    if (cached) {
      res.set("Cache-Control", "public, max-age=5");
      return res.json(cached);
    }

    const { rows } = await pool.query(
      `
WITH base AS (
  SELECT
    s.id,
    s.slug,
    COALESCE(s.display_name, s.slug) AS "displayName",
    s.title,
    s.is_live AS "isLive",
    s.featured,
    s.user_id AS "ownerUserId",
    -- Avatar via endpoint /avatars/u/{id} (gère perso + par défaut comme le header)
    ('/avatars/u/' || s.user_id::text) AS "avatarUrl"
  FROM streamers s
  WHERE (s.suspended_until IS NULL OR s.suspended_until < NOW())
),
rumble_lives AS (
  SELECT 
    s.id AS streamer_id,
    r.is_live,
    r.title AS rumble_title,
    r.viewers_count AS rumble_viewers
  FROM streamers s
  LEFT JOIN rumble_accounts ra ON s.id = ra.assigned_to_streamer_id
  LEFT JOIN streamer_rumble_info r ON s.id = r.streamer_id
  WHERE ra.username IS NOT NULL
    AND r.is_live = true
    AND (s.suspended_until IS NULL OR s.suspended_until < NOW())
),
open_ls AS (
  SELECT streamer_id, id AS live_session_id
  FROM live_sessions
  WHERE ended_at IS NULL
),
live_viewers AS (
  SELECT
    vs.streamer_id,
    COUNT(DISTINCT vs.viewer_key)::int AS viewers
  FROM viewer_sessions vs
  JOIN open_ls ls
    ON ls.live_session_id = vs.live_session_id
  WHERE vs.ended_at IS NULL
    AND vs.last_heartbeat_at >= (NOW() - ($1::int * INTERVAL '1 second'))
  GROUP BY vs.streamer_id
)
SELECT
  b.id::text AS id,
  b.slug,
  b."displayName",
  COALESCE(rl.rumble_title, b.title) AS title,
  COALESCE(rl.rumble_viewers, v.viewers, 0)::int AS viewers,
  COALESCE(b."isLive", rl.is_live) AS "isLive",
  b.featured,
  b."ownerUserId",
  b."avatarUrl"
FROM base b
LEFT JOIN rumble_lives rl ON b.id = rl.streamer_id
LEFT JOIN live_viewers v ON v.streamer_id = b.id
ORDER BY LOWER(b."displayName") ASC
      `,
      [HEARTBEAT_TTL_SECONDS]
    );

    publicCache.set("streamers", { body: rows, ts: Date.now() });
    res.set("Cache-Control", "public, max-age=5");
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
        s.platform,
        s.rumble_embed_url AS "rumbleEmbedUrl",
        s.rumble_username AS "rumbleUsernamePseudo",

        -- USER (source de vérité des subs)
        jsonb_build_object(
          'id', u.id,
          'username', u.username,
          'role', u.role,
          -- Avatar via endpoint /avatars/u/{id} (gère perso + par défaut comme le header)
          'avatarUrl', ('/avatars/u/' || s.user_id::text),
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

        -- DLive linked
        s.dlive_use_linked AS "dliveUseLinked",
        s.dlive_link_displayname AS "dliveLinkedDisplayname",
        s.dlive_link_username AS "dliveLinkedUsername",

        -- provider assigné
        pa.channel_slug AS "providerChannelSlug",
        pa.channel_username AS "providerChannelUsername",

        -- Connexion DLive complète avec enabled
        jsonb_build_object(
          'provider', pa.provider,
          'channelSlug', pa.channel_slug,
          'rtmpUrl', pa.rtmp_url,
          'streamKey', pa.stream_key,
          'enabled', pa.enabled
        ) AS "dliveConnection",

        -- Connexion Rumble
        jsonb_build_object(
          'provider', 'rumble',
          'username', ra.username,
          'rtmpUrl', ra.rtmp_url,
          'streamKey', ra.stream_key,
          'assignedAt', ra.assigned_at
        ) AS "rumbleConnection",

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
       AND pa.provider = 'dlive'

      LEFT JOIN rumble_accounts ra
        ON ra.assigned_to_streamer_id = s.id

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

    // ✅ viewers LunaLive (remplace s.viewers côté UI)
    let viewersNow = 0;
    if (row.isLive) {
      const v = await pool.query(
        `
        SELECT COUNT(DISTINCT vs.viewer_key)::int AS n
        FROM live_sessions ls
        JOIN viewer_sessions vs
          ON vs.live_session_id = ls.id
        WHERE ls.streamer_id = $1
          AND ls.ended_at IS NULL
          AND vs.ended_at IS NULL
          AND vs.last_heartbeat_at >= (NOW() - ($2::int * INTERVAL '1 second'))
        `,
        [Number(row.id), HEARTBEAT_TTL_SECONDS]
      );
      viewersNow = Number(v.rows?.[0]?.n ?? 0);
    }

    row.viewers = viewersNow;

    // ✅ choisir la chaîne DLive effective
    const useLinked = !!row.dliveUseLinked;

    const linkedSlug = useLinked && row.dliveLinkedDisplayname ? String(row.dliveLinkedDisplayname) : null;
    const linkedUsername = useLinked && row.dliveLinkedUsername ? String(row.dliveLinkedUsername) : null;

    const providerSlug = row.providerChannelSlug ? String(row.providerChannelSlug) : null;
    const providerUsername = row.providerChannelUsername ? String(row.providerChannelUsername) : null;

    row.channelSlug = linkedSlug || providerSlug || null;
    row.channelUsername = (useLinked ? linkedUsername : providerUsername) || null;

    // ✅ SPECIAL CASE: LunaLive 24/24
    const slugLc = String(row.slug || "").toLowerCase();
    const isLuna24 = slugLc === "lunalive" || slugLc === "lunalive-2424";

    if (isLuna24) {
      if (useLinked) {
        row.channelUsername = linkedUsername || linkedSlug || row.channelUsername || null;
      }
      row.channelSlug = linkedSlug || row.channelSlug || null;
    }

    // ✅ host actif seulement si target live
    const hostTargetIsLive = !!row.hostTargetIsLive;
    const hostTargetSlug =
      hostTargetIsLive && row.hostTargetSlug ? String(row.hostTargetSlug).trim() : null;
    const hostTargetDisplayName =
      hostTargetIsLive && row.hostTargetDisplayName ? String(row.hostTargetDisplayName).trim() : null;

    // cleanup
    delete row.dliveUseLinked;
    delete row.dliveLinkedDisplayname;
    delete row.dliveLinkedUsername;
    delete row.providerChannelSlug;
    delete row.providerChannelUsername;

    // ====================================================================
    // DÉTECTION DE LIVE RUMBLE
    // Cible: streamers ayant SOIT un rumble_account (api_key flow), SOIT
    // un rumble_username sur streamers (pseudo-only flow).
    // ====================================================================
    const rumbleUsername: string | null = row.rumbleConnection?.username
      ? String(row.rumbleConnection.username)
      : (row.rumbleUsernamePseudo ? String(row.rumbleUsernamePseudo) : null);

    // cleanup champ interne
    delete row.rumbleUsernamePseudo;

    if (rumbleUsername) {
      const slugLog = String(row.slug || "");
      const staticUrl = `https://rumble.com/user/${encodeURIComponent(rumbleUsername)}/live`;

      const rumbleInfo = await pool.query(
        `SELECT is_live, title, viewers_count, hls_url, video_url, thumbnail_url, live_id
         FROM streamer_rumble_info
         WHERE streamer_id = $1
         ORDER BY updated_at DESC
         LIMIT 1`,
        [Number(row.id)]
      );

      if (rumbleInfo.rows[0]) {
        const rumble = rumbleInfo.rows[0];

        row.isLive = !!rumble.is_live;

        (row as any).rumbleStaticVideoUrl = staticUrl;
        (row as any).streamProvider = "rumble";

        if (rumble.is_live) {
          row.title = rumble.title || row.title;
          row.viewers = rumble.viewers_count || row.viewers;

          (row as any).rumbleHlsUrl = rumble.hls_url;
          (row as any).rumbleVideoUrl = rumble.video_url;
          (row as any).rumbleThumbnailUrl = rumble.thumbnail_url;
          (row as any).rumbleLiveId = rumble.live_id;

          console.log(`[public] ${slugLog}: Using Rumble live data - ${rumble.title}`);
        } else {
          console.log(`[public] ${slugLog}: Rumble offline (static URL still exposed)`);
        }
      } else {
        (row as any).rumbleStaticVideoUrl = staticUrl;
        (row as any).streamProvider = "rumble";
        console.log(`[public] ${slugLog}: No Rumble data found (static URL exposed)`);
      }
    }

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
         WHERE streamer_id = $1 AND user_id = $2
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
 * ✅ Edit stream title (admin/mod/owner)
 * POST /streamers/:slug/title
 * Body: { title: string }
 */
publicRouter.post(
  "/streamers/:slug/title",
  requireAuth,
  a(async (req, res) => {
    const slug = String(req.params.slug || "").trim();
    if (!slug) return res.status(400).json({ ok: false, error: "bad_slug" });

    const title = String(req.body?.title ?? "").trim();
    if (!title) return res.status(400).json({ ok: false, error: "title_required" });
    if (title.length > 140) return res.status(400).json({ ok: false, error: "title_too_long" });

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
    const streamer = s.rows?.[0];
    if (!streamer) return res.status(404).json({ ok: false, error: "streamer_not_found" });

    const isOwner = Number(streamer.ownerUserId) === requesterId;
    const isAdmin = requesterRole === "admin";
    const isModLike = isModLikeRole(requesterRole);

    if (!isOwner && !isAdmin && !isModLike) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const upd = await pool.query(
      `UPDATE streamers
       SET title = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id::text AS id, slug, display_name AS "displayName",
                 title, viewers, is_live AS "isLive", featured, user_id AS "ownerUserId"`,
      [title, Number(streamer.id)]
    );

    const out = upd.rows?.[0];
    if (!out) return res.status(404).json({ ok: false, error: "not_found" });

    const io = req.app?.locals?.io;
    if (io) {
      emitChatAndStream(io, String(out.slug), "stream:title", {
        slug: String(out.slug),
        title: String(out.title),
      });
    }

    return res.json({ ok: true, streamer: out });
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

    if (!targetSlug) {
      await pool.query(
        `INSERT INTO streamer_hosts (hoster_streamer_id, target_streamer_id, updated_at)
         VALUES ($1, NULL, now())
         ON CONFLICT (hoster_streamer_id) DO UPDATE
           SET target_streamer_id = NULL, updated_at = now()`,
        [Number(hoster.id)]
      );

      const io = req.app.locals.io;
      if (io) {
        const msg = chatStore.addSystem(String(hoster.slug), `🛑 Host arrêté.`);
        emitChatAll(io, String(hoster.slug), "chat:message", msg);
      }

      return res.json({ ok: true, hostTargetSlug: null, hostTargetDisplayName: null, hostTargetIsLive: false });
    }

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
         SET target_streamer_id = EXCLUDED.target_streamer_id, updated_at = now()`,
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
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [Number(streamer.id), Number(req.user!.id)]
    );

    const c = await pool.query(`SELECT COUNT(*)::int AS n FROM streamer_follows WHERE streamer_id = $1`, [
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
       WHERE streamer_id = $1 AND user_id = $2
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

    await pool.query(`DELETE FROM streamer_follows WHERE streamer_id = $1 AND user_id = $2`, [
      Number(streamer.id),
      Number(req.user!.id),
    ]);

    const c = await pool.query(`SELECT COUNT(*)::int AS n FROM streamer_follows WHERE streamer_id = $1`, [
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
    if (typeof raw !== "boolean") {
      return res.status(400).json({ ok: false, error: "notifyEnabled_required" });
    }
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
