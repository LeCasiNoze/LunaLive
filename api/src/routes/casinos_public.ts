// api/src/routes/casinos_public.ts
import { Router, type Request } from "express";
import { pool } from "../db.js";
import { a } from "../utils/async.js";
import { tryGetAuthUser } from "../auth.js";

export const casinosPublicRouter = Router();

function topScore(R: number, v: number, C: number, m = 25) {
  return (v / (v + m)) * R + (m / (v + m)) * C;
}

// GET /casinos?search=&sort=top|rating|reviews|new|featured
casinosPublicRouter.get(
  "/casinos",
  a(async (req, res) => {
    const search = String(req.query.search ?? "").trim().toLowerCase();
    const sort = String(req.query.sort ?? "top");

    const params: any[] = [];
    let where = `WHERE c.status='published'`;

    if (search) {
      params.push(`%${search}%`);
      where += ` AND LOWER(c.name) LIKE $${params.length}`;
    }

    const { rows } = await pool.query(
      `
      SELECT
        c.id::text AS id,
        c.slug,
        c.name,
        c.logo_url AS "logoUrl",
        c.created_at AS "createdAt",
        c.featured_rank AS "featuredRank",
        c.bonus_headline AS "bonusHeadline",
        c.watch_level AS "watchLevel",
        c.watch_reason AS "watchReason",
        c.watch_updated_at AS "watchUpdatedAt",
        COALESCE(s.avg_rating, 0)::float AS "avgRating",
        COALESCE(s.ratings_count, 0)::int AS "ratingsCount"
      FROM casino_listings c
      LEFT JOIN (
        SELECT casino_id, AVG(rating)::numeric(10,2) AS avg_rating, COUNT(*)::int AS ratings_count
        FROM casino_user_ratings
        GROUP BY casino_id
      ) s ON s.casino_id = c.id
      ${where}
      `,
      params
    );

    const C =
      rows.length > 0
        ? rows.reduce((acc: number, x: any) => acc + (Number(x.avgRating) || 0), 0) / rows.length
        : 0;

    const podium = [...rows]
      .sort((a: any, b: any) => topScore(b.avgRating, b.ratingsCount, C) - topScore(a.avgRating, a.ratingsCount, C))
      .slice(0, 3);

    const watchlist = rows
      .filter((x: any) => x.watchLevel === "watch" || x.watchLevel === "avoid")
      .sort((a: any, b: any) => {
        const aw = a.watchLevel === "avoid" ? 0 : 1;
        const bw = b.watchLevel === "avoid" ? 0 : 1;
        return aw - bw;
      })
      .slice(0, 6);

    const casinos = [...rows].sort((a: any, b: any) => {
      if (sort === "new") return +new Date(b.createdAt) - +new Date(a.createdAt);
      if (sort === "rating") return (b.avgRating - a.avgRating) || (b.ratingsCount - a.ratingsCount);
      if (sort === "reviews") return (b.ratingsCount - a.ratingsCount) || (b.avgRating - a.avgRating);
      if (sort === "featured") {
        const ar = a.featuredRank ?? 999999;
        const br = b.featuredRank ?? 999999;
        return ar - br;
      }
      // top
      return topScore(b.avgRating, b.ratingsCount, C) - topScore(a.avgRating, a.ratingsCount, C);
    });

    res.json({ ok: true, podium, casinos, watchlist });
  })
);

// GET /casinos/:slug
casinosPublicRouter.get(
  "/casinos/:slug",
  a(async (req, res) => {
    const slug = String(req.params.slug || "").trim();

    const c = await pool.query(
      `SELECT
        id::text AS id,
        slug,
        name,
        logo_url AS "logoUrl",
        status,
        created_at AS "createdAt",
        featured_rank AS "featuredRank",
        bonus_headline AS "bonusHeadline",
        description,
        pros,
        cons,
        team_rating AS "teamRating",
        team_review AS "teamReview",
        watch_level AS "watchLevel",
        watch_reason AS "watchReason",
        watch_updated_at AS "watchUpdatedAt"
       FROM casino_listings
       WHERE lower(slug)=lower($1)
         AND status IN ('published','hidden')
       LIMIT 1`,
      [slug]
    );

    const casino = c.rows?.[0];
    if (!casino) return res.status(404).json({ ok: false, error: "not_found" });

    const stats = await pool.query(
      `
      SELECT
        COALESCE(AVG(r.rating)::numeric(10,2), 0)::float AS "avgRating",
        COUNT(r.*)::int AS "ratingsCount"
      FROM casino_user_ratings r
      WHERE r.casino_id = $1
      `,
      [Number(casino.id)]
    );

    // Liens (owner_user_id null = bonus/platform)
    // + join streamers via streamers.user_id = owner_user_id pour afficher slug/displayName + followsCount
    const linksRows = await pool.query(
      `
      SELECT
        l.id::text AS id,
        l.owner_user_id AS "ownerUserId",
        l.label,
        l.pinned_rank AS "pinnedRank",
        l.enabled,
        l.casino_id::text AS "casinoId",
        u.username AS "ownerUsername",
        s.slug AS "streamerSlug",
        s.display_name AS "streamerDisplayName",
        (SELECT COUNT(*)::int FROM streamer_follows sf WHERE sf.streamer_id = s.id) AS "streamerFollows"
      FROM casino_affiliate_links l
      LEFT JOIN users u ON u.id = l.owner_user_id
      LEFT JOIN streamers s ON s.user_id = l.owner_user_id
      WHERE l.casino_id = $1 AND l.enabled = TRUE
      `,
      [Number(casino.id)]
    );

    const links = linksRows.rows.map((l: any) => ({
      id: String(l.id),
      ownerUserId: l.ownerUserId == null ? null : Number(l.ownerUserId),
      label: l.label ? String(l.label) : null,
      pinnedRank: l.pinnedRank == null ? null : Number(l.pinnedRank),
      ownerUsername: l.ownerUsername ? String(l.ownerUsername) : null,
      streamer: l.streamerSlug
        ? {
            slug: String(l.streamerSlug),
            displayName: String(l.streamerDisplayName || l.streamerSlug),
            followsCount: Number(l.streamerFollows || 0),
          }
        : null,
      goUrl: `/go/casino/${casino.id}/link/${l.id}`,
    }));

    const bonusLink =
      links.find((x: any) => x.ownerUserId == null) ??
      [...links].sort((a: any, b: any) => (a.pinnedRank ?? 999999) - (b.pinnedRank ?? 999999))[0] ??
      null;

    res.json({
      ok: true,
      casino,
      stats: stats.rows?.[0] ?? { avgRating: 0, ratingsCount: 0 },
      bonusLink,
      links,
    });
  })
);

// GET /casinos/:slug/comments?sort=new|useful&limit=30&cursor=ISO
casinosPublicRouter.get(
  "/casinos/:slug/comments",
  a(async (req: Request, res) => {
    const slug = String(req.params.slug || "").trim();
    const sort = String(req.query.sort ?? "new");
    const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 30)));
    const cursor = req.query.cursor ? String(req.query.cursor) : null;

    const casinoRow = await pool.query(`SELECT id FROM casino_listings WHERE lower(slug)=lower($1) LIMIT 1`, [slug]);
    const casino = casinoRow.rows?.[0];
    if (!casino) return res.status(404).json({ ok: false, error: "not_found" });

    const me = tryGetAuthUser(req);
    const params: any[] = [Number(casino.id), limit];
    let cursorSql = "";

    if (cursor) {
      params.push(cursor);
      cursorSql = ` AND c.created_at < $${params.length}`;
    }

    const order =
      sort === "useful"
        ? `ORDER BY (COALESCE(up.cnt,0) - COALESCE(down.cnt,0)) DESC, c.created_at DESC`
        : `ORDER BY c.created_at DESC`;

    const { rows } = await pool.query(
      `
      SELECT
        c.id::text AS id,
        c.body,
        c.created_at AS "createdAt",
        c.user_id AS "userId",
        u.username,
        c.has_images AS "hasImages",
        r.rating AS "authorRating",
        COALESCE(up.cnt,0)::int AS "upCount",
        COALESCE(down.cnt,0)::int AS "downCount"
      FROM casino_comments c
      JOIN users u ON u.id = c.user_id
      LEFT JOIN casino_user_ratings r
        ON r.casino_id = c.casino_id AND r.user_id = c.user_id
      LEFT JOIN (
        SELECT comment_id, COUNT(*) cnt FROM casino_comment_reactions WHERE kind='up' GROUP BY comment_id
      ) up ON up.comment_id = c.id
      LEFT JOIN (
        SELECT comment_id, COUNT(*) cnt FROM casino_comment_reactions WHERE kind='down' GROUP BY comment_id
      ) down ON down.comment_id = c.id
      WHERE c.casino_id = $1 AND c.status='published' ${cursorSql}
      ${order}
      LIMIT $2
      `,
      params
    );

    const ids = rows.map((x: any) => x.id);
    const imagesBy: Record<string, any[]> = {};
    if (ids.length) {
      const imgs = await pool.query(
        `SELECT comment_id::text AS "commentId", url, w, h, size_bytes AS "sizeBytes"
         FROM casino_comment_images
         WHERE comment_id = ANY($1::bigint[])`,
        [ids.map((x: string) => Number(x))]
      );
      for (const im of imgs.rows) {
        imagesBy[im.commentId] = imagesBy[im.commentId] ?? [];
        imagesBy[im.commentId].push(im);
      }
    }

    // myReaction (si connecté)
    const myBy: Record<string, "up" | "down"> = {};
    if (me?.id && ids.length) {
      const r = await pool.query(
        `SELECT comment_id::text AS "commentId", kind
         FROM casino_comment_reactions
         WHERE user_id=$1 AND comment_id = ANY($2::bigint[])`,
        [Number(me.id), ids.map((x: string) => Number(x))]
      );
      for (const rr of r.rows) myBy[rr.commentId] = rr.kind;
    }

    const items = rows.map((x: any) => ({
      ...x,
      images: imagesBy[x.id] ?? [],
      myReaction: me?.id ? (myBy[x.id] ?? null) : null,
    }));

    const nextCursor = items.length ? items[items.length - 1].createdAt : null;
    res.json({ ok: true, items, nextCursor });
  })
);

// GET /go/casino/:casinoId/link/:linkId
casinosPublicRouter.get(
  "/go/casino/:casinoId/link/:linkId",
  a(async (req, res) => {
    const casinoId = Number(req.params.casinoId);
    const linkId = Number(req.params.linkId);

    const link = await pool.query(
      `SELECT id, casino_id, target_url, enabled
       FROM casino_affiliate_links
       WHERE id=$1 AND casino_id=$2
       LIMIT 1`,
      [linkId, casinoId]
    );

    const row = link.rows?.[0];
    if (!row || !row.enabled) return res.status(404).send("Not found");

    const me = tryGetAuthUser(req);

    await pool.query(
      `INSERT INTO casino_affiliate_clicks (casino_id, link_id, visitor_user_id, ref)
       VALUES ($1,$2,$3,$4)`,
      [casinoId, linkId, me?.id ?? null, req.get("referer") ?? null]
    );

    res.redirect(302, String(row.target_url));
  })
);
