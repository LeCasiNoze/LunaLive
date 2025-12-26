// api/src/routes/admin_casinos_setup.ts
import { Router } from "express";
import { pool } from "../db.js";
import { a } from "../utils/async.js";
import { requireAdminKey } from "../auth.js";

export const adminCasinosSetupRouter = Router();

function normalizeStringArray(v: any): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  const s = String(v);
  if (!s.trim()) return [];
  // accepte "ligne par ligne" OU "a, b, c"
  if (s.includes("\n")) return s.split("\n").map((x) => x.trim()).filter(Boolean);
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

function buildUpdate(body: any, allowed: string[]) {
  const sets: string[] = [];
  const vals: any[] = [];
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, k)) {
      vals.push(body[k]);
      sets.push(`${k} = $${vals.length}`);
    }
  }
  return { sets, vals };
}

/* ===== Casinos listings ===== */

// GET /admin/casinos/listings
adminCasinosSetupRouter.get(
  "/admin/casinos/listings",
  requireAdminKey,
  a(async (_req, res) => {
    const { rows } = await pool.query(`
      SELECT
        c.id::text AS id,
        c.slug,
        c.name,
        c.logo_url AS "logoUrl",
        c.status,
        c.created_at AS "createdAt",
        c.featured_rank AS "featuredRank",
        c.bonus_headline AS "bonusHeadline",
        c.description,
        c.pros,
        c.cons,
        c.team_rating AS "teamRating",
        c.team_review AS "teamReview",
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
      ORDER BY
        (c.featured_rank IS NULL) ASC,
        c.featured_rank ASC,
        c.created_at DESC
    `);

    res.json({ ok: true, casinos: rows });
  })
);

// POST /admin/casinos/listings  (create)
adminCasinosSetupRouter.post(
  "/admin/casinos/listings",
  requireAdminKey,
  a(async (req, res) => {
    const slug = String(req.body?.slug ?? "").trim().toLowerCase();
    const name = String(req.body?.name ?? "").trim();
    if (!slug || !name) return res.status(400).json({ ok: false, error: "slug_name_required" });

    const pros = normalizeStringArray(req.body?.pros);
    const cons = normalizeStringArray(req.body?.cons);

    const { rows } = await pool.query(
      `
      INSERT INTO casino_listings
        (slug, name, logo_url, status, featured_rank, bonus_headline, description, pros, cons, team_rating, team_review, watch_level, watch_reason, watch_updated_at)
      VALUES
        ($1,$2,$3,COALESCE($4,'published'),$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,COALESCE($12,'none'),$13, CASE WHEN $12 IS NULL THEN watch_updated_at ELSE NOW() END)
      ON CONFLICT (slug) DO UPDATE SET
        name=EXCLUDED.name
      RETURNING id::text AS id
      `,
      [
        slug,
        name,
        req.body?.logoUrl ?? null,
        req.body?.status ?? "published",
        req.body?.featuredRank ?? null,
        req.body?.bonusHeadline ?? null,
        req.body?.description ?? null,
        JSON.stringify(pros),
        JSON.stringify(cons),
        req.body?.teamRating ?? null,
        req.body?.teamReview ?? null,
        req.body?.watchLevel ?? "none",
        req.body?.watchReason ?? null,
      ]
    );

    res.json({ ok: true, id: rows[0].id });
  })
);

// PATCH /admin/casinos/listings/:id  (update)
adminCasinosSetupRouter.patch(
  "/admin/casinos/listings/:id",
  requireAdminKey,
  a(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "bad_id" });

    // pros/cons transform (si présents)
    const body = { ...req.body };
    if (Object.prototype.hasOwnProperty.call(body, "pros")) body.pros = JSON.stringify(normalizeStringArray(body.pros));
    if (Object.prototype.hasOwnProperty.call(body, "cons")) body.cons = JSON.stringify(normalizeStringArray(body.cons));

    // si watch_level/raison bouge, on update watch_updated_at
    const touchWatch =
      Object.prototype.hasOwnProperty.call(body, "watch_level") ||
      Object.prototype.hasOwnProperty.call(body, "watch_reason");

    const allowed = [
      "slug",
      "name",
      "logo_url",
      "status",
      "featured_rank",
      "bonus_headline",
      "description",
      "pros",
      "cons",
      "team_rating",
      "team_review",
      "watch_level",
      "watch_reason",
    ];

    // map keys front -> DB
    const mapped: any = {};
    if ("slug" in body) mapped.slug = body.slug ? String(body.slug).trim().toLowerCase() : null;
    if ("name" in body) mapped.name = body.name;
    if ("logoUrl" in body) mapped.logo_url = body.logoUrl;
    if ("status" in body) mapped.status = body.status;
    if ("featuredRank" in body) mapped.featured_rank = body.featuredRank === "" ? null : body.featuredRank;
    if ("bonusHeadline" in body) mapped.bonus_headline = body.bonusHeadline;
    if ("description" in body) mapped.description = body.description;
    if ("pros" in body) mapped.pros = body.pros; // json string
    if ("cons" in body) mapped.cons = body.cons; // json string
    if ("teamRating" in body) mapped.team_rating = body.teamRating === "" ? null : body.teamRating;
    if ("teamReview" in body) mapped.team_review = body.teamReview;
    if ("watchLevel" in body) mapped.watch_level = body.watchLevel;
    if ("watchReason" in body) mapped.watch_reason = body.watchReason;

    const { sets, vals } = buildUpdate(mapped, allowed);
    if (!sets.length) return res.json({ ok: true });

    // watch_updated_at
    if (touchWatch) {
      sets.push(`watch_updated_at = NOW()`);
    }

    vals.push(id);
    await pool.query(`UPDATE casino_listings SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);

    res.json({ ok: true });
  })
);

/* ===== Affiliate links ===== */

// GET /admin/casinos/listings/:id/links
adminCasinosSetupRouter.get(
  "/admin/casinos/listings/:id/links",
  requireAdminKey,
  a(async (req, res) => {
    const casinoId = Number(req.params.id);
    const { rows } = await pool.query(
      `
      SELECT
        l.id::text AS id,
        l.casino_id::text AS "casinoId",
        l.owner_user_id AS "ownerUserId",
        l.label,
        l.target_url AS "targetUrl",
        l.enabled,
        l.pinned_rank AS "pinnedRank",
        u.username AS "ownerUsername",
        s.slug AS "streamerSlug",
        s.display_name AS "streamerDisplayName"
      FROM casino_affiliate_links l
      LEFT JOIN users u ON u.id = l.owner_user_id
      LEFT JOIN streamers s ON s.user_id = l.owner_user_id
      WHERE l.casino_id = $1
      ORDER BY (l.pinned_rank IS NULL) ASC, l.pinned_rank ASC, l.created_at ASC
      `,
      [casinoId]
    );

    res.json({ ok: true, links: rows });
  })
);

// POST /admin/casinos/listings/:id/links
// body: { kind:"bonus"|"streamer", targetUrl, label?, pinnedRank?, enabled?, streamerSlug? }
adminCasinosSetupRouter.post(
  "/admin/casinos/listings/:id/links",
  requireAdminKey,
  a(async (req, res) => {
    const casinoId = Number(req.params.id);
    const kind = String(req.body?.kind ?? "bonus");
    const targetUrl = String(req.body?.targetUrl ?? "").trim();
    if (!targetUrl) return res.status(400).json({ ok: false, error: "targetUrl_required" });

    let ownerUserId: number | null = null;

    if (kind === "streamer") {
      const streamerSlug = String(req.body?.streamerSlug ?? "").trim();
      if (!streamerSlug) return res.status(400).json({ ok: false, error: "streamerSlug_required" });

      const s = await pool.query(`SELECT user_id FROM streamers WHERE lower(slug)=lower($1) LIMIT 1`, [streamerSlug]);
      const uid = s.rows?.[0]?.user_id;
      if (!uid) return res.status(400).json({ ok: false, error: "streamer_has_no_owner" });
      ownerUserId = Number(uid);
    }

    const { rows } = await pool.query(
      `
      INSERT INTO casino_affiliate_links (casino_id, owner_user_id, label, target_url, enabled, pinned_rank)
      VALUES ($1,$2,$3,$4,COALESCE($5,TRUE),$6)
      RETURNING id::text AS id
      `,
      [
        casinoId,
        ownerUserId,
        req.body?.label ?? null,
        targetUrl,
        req.body?.enabled ?? true,
        req.body?.pinnedRank ?? null,
      ]
    );

    res.json({ ok: true, id: rows[0].id });
  })
);

// PATCH /admin/casinos/links/:linkId
adminCasinosSetupRouter.patch(
  "/admin/casinos/links/:linkId",
  requireAdminKey,
  a(async (req, res) => {
    const linkId = Number(req.params.linkId);
    const mapped: any = {};
    if ("label" in req.body) mapped.label = req.body.label;
    if ("targetUrl" in req.body) mapped.target_url = req.body.targetUrl;
    if ("enabled" in req.body) mapped.enabled = req.body.enabled;
    if ("pinnedRank" in req.body) mapped.pinned_rank = req.body.pinnedRank === "" ? null : req.body.pinnedRank;

    const allowed = ["label", "target_url", "enabled", "pinned_rank"];
    const { sets, vals } = buildUpdate(mapped, allowed);
    if (!sets.length) return res.json({ ok: true });

    vals.push(linkId);
    await pool.query(`UPDATE casino_affiliate_links SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);
    res.json({ ok: true });
  })
);
