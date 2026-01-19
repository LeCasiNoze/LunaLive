// api/src/routes/clips_public.ts
import express from "express";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";
import { requireAuth, type AuthUser } from "../auth.js";
import { ensureBotClips, markClipDeletedById } from "../bot_clips/store.js";
import { buildPublicUrl, r2Enabled } from "../clips/r2.js";

export const clipsPublicRouter = express.Router();

function nowMs() {
  return Date.now();
}

function apiBaseFromReq(req: express.Request) {
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  const host = req.get("host") || "";
  return `${proto}://${host}`;
}

function decodeCursor(input: string): string {
  const s = String(input || "").trim();
  if (!s) return "";
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  try {
    return Buffer.from(b64 + pad, "base64").toString("utf8");
  } catch {
    return "";
  }
}

function encodeCursor(raw: string): string {
  return Buffer.from(String(raw), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function tryGetAuthUser(req: express.Request): AuthUser | null {
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

// ensure tables
clipsPublicRouter.use(async (_req, _res, next) => {
  try {
    await ensureBotClips();

    await pool.query(`
      CREATE TABLE IF NOT EXISTS clip_likes (
        clip_id BIGINT NOT NULL,
        user_id BIGINT NOT NULL,
        created_ts BIGINT NOT NULL,
        PRIMARY KEY (clip_id, user_id)
      );
    `);

    await pool
      .query(`
      ALTER TABLE clip_likes
      ALTER COLUMN created_ts TYPE BIGINT
      USING created_ts::bigint;
    `)
      .catch(() => {});

    // keep bot_clips timestamps in bigint (safe)
    await pool
      .query(`
      ALTER TABLE bot_clips
      ALTER COLUMN created_ts TYPE BIGINT
      USING created_ts::bigint;
    `)
      .catch(() => {});

    await pool
      .query(`
      ALTER TABLE bot_clips
      ALTER COLUMN deleted_ts TYPE BIGINT
      USING deleted_ts::bigint;
    `)
      .catch(() => {});

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_clip_likes_clip ON clip_likes(clip_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_clip_likes_user ON clip_likes(user_id);`);
  } catch {}
  next();
});

/**
 * ✅ GET /clips/:id/mp4
 * - redirect vers l'URL publique R2 si dispo
 * - sinon 404
 */
clipsPublicRouter.get("/clips/:id/mp4", async (req, res) => {
  const clipId = Number(req.params.id || 0);
  if (!Number.isFinite(clipId) || clipId <= 0) return res.status(400).json({ ok: false, error: "id_required" });

  const r = await pool.query(
    `SELECT mp4_key
     FROM bot_clips
     WHERE id=$1
       AND deleted_ts IS NULL
       AND hidden_by_streamer = false
     LIMIT 1`,
    [clipId]
  );

  const key = String(r.rows?.[0]?.mp4_key || "").trim();
  if (!key) return res.status(404).json({ ok: false, error: "mp4_not_ready" });

  const url = buildPublicUrl(key);
  if (!url) return res.status(404).json({ ok: false, error: "mp4_not_ready" });

  // redirect cacheable
  res.setHeader("Cache-Control", "public, max-age=600");
  return res.redirect(302, url);
});

/**
 * GET /streamers/:slug/clips?cursor=&limit=24&sort=recent|top
 * - auth optionnelle (renvoie myLiked)
 */
clipsPublicRouter.get("/streamers/:slug/clips", async (req, res) => {
  const slug = String(req.params.slug || "").trim();
  if (!slug) return res.status(400).json({ ok: false, error: "slug_required" });

  const sort = String(req.query.sort || "recent") === "top" ? "top" : "recent";
  const limit = Math.max(1, Math.min(50, Number(req.query.limit || 24)));

  const authUser = tryGetAuthUser(req);
  const myUserId = authUser?.id != null ? Number(authUser.id) : null;

  // resolve streamerId
  const s = await pool
    .query(`SELECT id, slug FROM streamers WHERE lower(slug)=lower($1) LIMIT 1`, [slug])
    .catch(() => null);
  const streamerId = Number(s?.rows?.[0]?.id || 0);
  if (!streamerId) return res.json({ ok: true, clips: [], pageInfo: { endCursor: null, hasNextPage: false } });

  // cursor
  const cursorRaw = decodeCursor(String(req.query.cursor || ""));
  let cLikes: number | null = null;
  let cTs: number | null = null;
  let cId: number | null = null;

  if (cursorRaw) {
    const parts = cursorRaw.split(":").map((x) => x.trim());
    if (sort === "recent") {
      if (parts.length >= 2) {
        cTs = Number(parts[0]);
        cId = Number(parts[1]);
      }
    } else {
      if (parts.length >= 3) {
        cLikes = Number(parts[0]);
        cTs = Number(parts[1]);
        cId = Number(parts[2]);
      }
    }
    if (!Number.isFinite(cTs as any)) cTs = null;
    if (!Number.isFinite(cId as any)) cId = null;
    if (!Number.isFinite(cLikes as any)) cLikes = null;
  }

  const where: string[] = [];
  const params: any[] = [];
  let p = 1;

  where.push(`bc.streamer_id = $${p++}`);
  params.push(streamerId);

  where.push(`bc.deleted_ts IS NULL`);
  where.push(`bc.hidden_by_streamer = false`);

  if (sort === "recent" && cTs != null && cId != null) {
    where.push(`(bc.created_ts < $${p} OR (bc.created_ts = $${p} AND bc.id < $${p + 1}))`);
    params.push(cTs, cId);
    p += 2;
  }

  if (sort === "top" && cLikes != null && cTs != null && cId != null) {
    where.push(
      `(
        COALESCE(cnt.cnt,0) < $${p}
        OR (COALESCE(cnt.cnt,0) = $${p} AND bc.created_ts < $${p + 1})
        OR (COALESCE(cnt.cnt,0) = $${p} AND bc.created_ts = $${p + 1} AND bc.id < $${p + 2})
      )`
    );
    params.push(cLikes, cTs, cId);
    p += 3;
  }

  const baseWhere = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const orderBy =
    sort === "top"
      ? `ORDER BY COALESCE(cnt.cnt,0) DESC, bc.created_ts DESC, bc.id DESC`
      : `ORDER BY bc.created_ts DESC, bc.id DESC`;

  const q = `
    SELECT
      bc.id,
      bc.title,
      bc.created_ts,
      bc.vod_url,
      bc.at_sec,
      bc.pre_sec,
      bc.post_sec,
      bc.mp4_key,

      COALESCE(cnt.cnt,0)::int AS likes_count,
      CASE WHEN ul.user_id IS NULL THEN false ELSE true END AS my_liked
    FROM bot_clips bc
    LEFT JOIN (
      SELECT clip_id, COUNT(*)::int AS cnt
      FROM clip_likes
      GROUP BY clip_id
    ) cnt ON cnt.clip_id = bc.id
    LEFT JOIN clip_likes ul
      ON ul.clip_id = bc.id
     AND ul.user_id = $${p++}
    ${baseWhere}
    ${orderBy}
    LIMIT $${p++}
  `;

  params.push(myUserId);
  params.push(limit + 1);

  const r = await pool.query(q, params);
  const rows = Array.isArray(r.rows) ? r.rows : [];
  const sliced = rows.slice(0, limit);

  const base = apiBaseFromReq(req);

  const clips = sliced.map((x: any) => {
    const at = Math.max(0, Number(x.at_sec || 0));
    const pre = Math.max(0, Number(x.pre_sec || 105));
    const post = Math.max(0, Number(x.post_sec || 15));
    const startSec = Math.max(0, at - pre);
    const durationSec = Math.max(1, pre + post);

    const mp4Key = String(x.mp4_key || "").trim();
    const clipUrl = mp4Key && r2Enabled() ? `${base}/clips/${Number(x.id)}/mp4` : null;

    return {
      id: Number(x.id),
      streamerSlug: String(slug),

      title: x.title ?? null,
      createdAtMs: Number(x.created_ts || 0),

      // (legacy) on garde pour debug, mais le front doit lire clipUrl en priorité
      vodUrl: x.vod_url ?? null,
      startSec,
      durationSec,

      // ✅ vrai clip mp4 (2 min) si prêt
      clipUrl,

      thumbUrl: `${base}/thumbs/clips/${Number(x.id)}.jpg`,

      likesCount: Number(x.likes_count || 0),
      myLiked: !!x.my_liked,
    };
  });

  let endCursor: string | null = null;
  const hasNextPage = rows.length > limit;

  if (clips.length) {
    const last = clips[clips.length - 1];
    if (sort === "recent") endCursor = encodeCursor(`${last.createdAtMs}:${last.id}`);
    else endCursor = encodeCursor(`${last.likesCount}:${last.createdAtMs}:${last.id}`);
  }

  return res.json({ ok: true, clips, pageInfo: { endCursor, hasNextPage } });
});

/**
 * POST /clips/:id/like { like:boolean } (auth required)
 */
clipsPublicRouter.post("/clips/:id/like", requireAuth, express.json(), async (req: any, res) => {
  const userId = Number(req.user?.id || 0);
  if (!userId) return res.status(401).json({ ok: false, error: "unauthorized" });

  const clipId = Number(req.params.id || 0);
  if (!Number.isFinite(clipId) || clipId <= 0) return res.status(400).json({ ok: false, error: "id_required" });

  const like = !!req.body?.like;

  const check = await pool.query(
    `SELECT id FROM bot_clips WHERE id=$1 AND deleted_ts IS NULL LIMIT 1`,
    [clipId]
  );
  if (!check.rows?.length) return res.status(404).json({ ok: false, error: "clip_not_found" });

  if (like) {
    await pool.query(
      `INSERT INTO clip_likes(clip_id, user_id, created_ts)
       VALUES($1,$2,$3)
       ON CONFLICT (clip_id, user_id) DO NOTHING`,
      [clipId, userId, nowMs()]
    );
  } else {
    await pool.query(`DELETE FROM clip_likes WHERE clip_id=$1 AND user_id=$2`, [clipId, userId]);
  }

  const cnt = await pool.query(`SELECT COUNT(*)::int AS n FROM clip_likes WHERE clip_id=$1`, [clipId]);
  const likesCount = Number(cnt.rows?.[0]?.n || 0);

  return res.json({ ok: true, likesCount, myLiked: like });
});

/**
 * POST /clips/:id/delete (owner/admin only)
 * => deleted_ts + hidden_by_streamer
 */
clipsPublicRouter.post("/clips/:id/delete", requireAuth, async (req: any, res) => {
  const user: AuthUser = req.user;
  const userId = Number(user?.id || 0);
  const role = String((user as any)?.role || "guest");

  const clipId = Number(req.params.id || 0);
  if (!Number.isFinite(clipId) || clipId <= 0) return res.status(400).json({ ok: false, error: "id_required" });

  const r = await pool.query(
    `SELECT s.user_id AS owner_user_id
     FROM bot_clips bc
     JOIN streamers s ON s.id = bc.streamer_id
     WHERE bc.id=$1 AND bc.deleted_ts IS NULL
     LIMIT 1`,
    [clipId]
  );

  const ownerUserId = Number(r.rows?.[0]?.owner_user_id || 0);
  if (!ownerUserId) return res.status(404).json({ ok: false, error: "clip_not_found" });

  const isAdmin = role === "admin";
  const isOwner = userId && ownerUserId && Number(userId) === Number(ownerUserId);

  if (!isAdmin && !isOwner) return res.status(403).json({ ok: false, error: "forbidden" });

  const n = await markClipDeletedById(clipId, nowMs());
  return res.json({ ok: true, removed: n > 0 });
});

/**
 * GET /clips/top?range=month|30d&limit=24
 * - auth optionnelle (renvoie myLiked)
 * - renvoie { ok:true, total:number, clips: ApiTopClip[] }
 */
clipsPublicRouter.get("/clips/top", async (req, res) => {
  const range = String(req.query.range || "month");
  const limit = Math.max(1, Math.min(50, Number(req.query.limit || 24)));

  const authUser = tryGetAuthUser(req);
  const myUserId = authUser?.id != null ? Number(authUser.id) : null;

  const now = Date.now();
  let startMs = 0;

  if (range === "30d") {
    startMs = now - 30 * 24 * 3600 * 1000;
  } else {
    const d = new Date(now);
    startMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0);
  }

  const totalQ = await pool.query(
    `
    SELECT COUNT(*)::int AS n
    FROM bot_clips bc
    WHERE bc.deleted_ts IS NULL
      AND bc.hidden_by_streamer = false
      AND bc.created_ts >= $1
    `,
    [startMs]
  );
  const total = Number(totalQ.rows?.[0]?.n ?? 0);

  const base = apiBaseFromReq(req);

  const r = await pool.query(
    `
    SELECT
      bc.id,
      bc.title,
      bc.created_ts,
      bc.vod_url,
      bc.at_sec,
      bc.pre_sec,
      bc.post_sec,
      bc.mp4_key,

      s.slug AS streamer_slug,
      s.display_name AS streamer_display_name,
      s.user_id AS owner_user_id,

      COALESCE(cnt.cnt,0)::int AS likes_count,
      CASE WHEN ul.user_id IS NULL THEN false ELSE true END AS my_liked,

      CASE WHEN ua.user_id IS NOT NULL THEN true ELSE false END AS has_avatar

    FROM bot_clips bc
    JOIN streamers s ON s.id = bc.streamer_id

    LEFT JOIN (
      SELECT clip_id, COUNT(*)::int AS cnt
      FROM clip_likes
      GROUP BY clip_id
    ) cnt ON cnt.clip_id = bc.id

    LEFT JOIN clip_likes ul
      ON ul.clip_id = bc.id
     AND ul.user_id = $1

    LEFT JOIN user_avatars ua
      ON ua.user_id = s.user_id

    WHERE bc.deleted_ts IS NULL
      AND bc.hidden_by_streamer = false
      AND bc.created_ts >= $2

    ORDER BY COALESCE(cnt.cnt,0) DESC, bc.created_ts DESC, bc.id DESC
    LIMIT $3
    `,
    [myUserId, startMs, limit]
  );

  const clips = (r.rows || []).map((x: any) => {
    const at = Math.max(0, Number(x.at_sec || 0));
    const pre = Math.max(0, Number(x.pre_sec || 105));
    const post = Math.max(0, Number(x.post_sec || 15));
    const startSec = Math.max(0, at - pre);
    const durationSec = Math.max(1, pre + post);

    const ownerUserId = x.owner_user_id != null ? Number(x.owner_user_id) : null;
    const avatarUrl = ownerUserId && x.has_avatar ? `${base}/avatars/u/${ownerUserId}` : null;

    const mp4Key = String(x.mp4_key || "").trim();
    const clipUrl = mp4Key && r2Enabled() ? `${base}/clips/${Number(x.id)}/mp4` : null;

    return {
      id: Number(x.id),
      streamerSlug: String(x.streamer_slug || ""),
      streamerDisplayName: String(x.streamer_display_name || ""),

      ownerUserId,

      title: x.title ?? null,
      createdAtMs: Number(x.created_ts || 0),

      // (legacy) on garde pour debug
      vodUrl: x.vod_url ?? null,
      startSec,
      durationSec,

      // ✅ vrai clip mp4 (2 min) si prêt
      clipUrl,

      thumbUrl: `${base}/thumbs/clips/${Number(x.id)}.jpg`,

      likesCount: Number(x.likes_count || 0),
      myLiked: !!x.my_liked,

      avatarUrl,
    };
  });

  return res.json({ ok: true, total, clips });
});
