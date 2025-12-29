// api/src/routes/admin_casinos.ts
import { Router } from "express";
import { pool } from "../db.js";

export const adminCasinosRouter = Router();

function getAdminKeyFromReq(req: any) {
  const h = String(req.headers["x-admin-key"] || "");
  if (h) return h;
  const auth = String(req.headers.authorization || "");
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m) return m[1];
  return "";
}

function requireAdminKey(req: any, res: any, next: any) {
  const provided = getAdminKeyFromReq(req);

  // ✅ fallback multi-env
  const expected =
    process.env.ADMIN_KEY ||
    process.env.ADMIN_PASSWORD ||
    process.env.ADMIN_SECRET ||
    process.env.ADMIN_PASS ||
    process.env.ADMIN ||
    "";

  if (!expected) {
    return res.status(500).json({ ok: false, error: "ADMIN_KEY not configured" });
  }
  if (!provided || provided !== expected) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  return next();
}

adminCasinosRouter.use(requireAdminKey);

// Helpers
function normStatus(v: any) {
  const s = String(v || "").trim();
  if (s === "published" || s === "hidden" || s === "disabled") return s;
  return null;
}
function normWatch(v: any) {
  const s = String(v || "").trim();
  if (s === "none" || s === "watch" || s === "avoid") return s;
  return null;
}

// GET /admin/casinos?q=
adminCasinosRouter.get("/", async (req, res) => {
  const q = String(req.query.q || "").trim();
  const like = q ? `%${q}%` : null;

  const { rows } = await pool.query(
    `
    SELECT
      id::text AS id,
      slug,
      name,
      logo_url AS "logoUrl",
      status,
      featured_rank AS "featuredRank",
      bonus_headline AS "bonusHeadline",
      description,
      pros,
      cons,
      sections,
      team_rating AS "teamRating",
      team_review AS "teamReview",
      watch_level AS "watchLevel",
      watch_reason AS "watchReason",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM casino_listings
    WHERE ($1::text IS NULL OR slug ILIKE $1 OR name ILIKE $1)
    ORDER BY
      (CASE WHEN featured_rank IS NULL THEN 1 ELSE 0 END) ASC,
      featured_rank ASC NULLS LAST,
      created_at DESC
    LIMIT 300
  `,
    [like]
  );

  res.json({ ok: true, items: rows });
});

// POST /admin/casinos
adminCasinosRouter.post("/", async (req, res) => {
  const slug = String(req.body?.slug || "").trim().toLowerCase();
  const name = String(req.body?.name || "").trim();

  if (!slug || !name) {
    return res.status(400).json({ ok: false, error: "slug+name required" });
  }

  try {
    const { rows } = await pool.query(
      `
      INSERT INTO casino_listings (slug, name, status)
      VALUES ($1, $2, 'published')
      RETURNING id::text AS id
    `,
      [slug, name]
    );
    return res.json({ ok: true, id: rows[0]?.id });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: e?.message || "insert_failed" });
  }
});

// PATCH /admin/casinos/:id
adminCasinosRouter.patch("/:id", async (req, res) => {
  const id = String(req.params.id);
  const patch = req.body || {};
  const fields: Array<{ col: string; val: any }> = [];

  if ("name" in patch) fields.push({ col: "name", val: String(patch.name || "").trim() });
  if ("slug" in patch) fields.push({ col: "slug", val: String(patch.slug || "").trim().toLowerCase() });

  if ("logoUrl" in patch) fields.push({ col: "logo_url", val: patch.logoUrl ? String(patch.logoUrl) : null });
  if ("bonusHeadline" in patch) fields.push({ col: "bonus_headline", val: patch.bonusHeadline ? String(patch.bonusHeadline) : null });
  if ("description" in patch) fields.push({ col: "description", val: patch.description ? String(patch.description) : null });

  if ("pros" in patch) fields.push({ col: "pros", val: Array.isArray(patch.pros) ? JSON.stringify(patch.pros) : JSON.stringify([]) });
  if ("cons" in patch) fields.push({ col: "cons", val: Array.isArray(patch.cons) ? JSON.stringify(patch.cons) : JSON.stringify([]) });
  if ("sections" in patch) fields.push({ col: "sections", val: Array.isArray(patch.sections) ? JSON.stringify(patch.sections) : JSON.stringify([]) });

  if ("teamRating" in patch) fields.push({ col: "team_rating", val: patch.teamRating === null || patch.teamRating === "" ? null : Number(patch.teamRating) });
  if ("teamReview" in patch) fields.push({ col: "team_review", val: patch.teamReview ? String(patch.teamReview) : null });

  if ("featuredRank" in patch) fields.push({ col: "featured_rank", val: patch.featuredRank === null || patch.featuredRank === "" ? null : Number(patch.featuredRank) });

  if ("watchLevel" in patch) {
    const wl = normWatch(patch.watchLevel);
    if (!wl) return res.status(400).json({ ok: false, error: "bad watchLevel" });
    fields.push({ col: "watch_level", val: wl });
  }
  if ("watchReason" in patch) fields.push({ col: "watch_reason", val: patch.watchReason ? String(patch.watchReason) : null });

  if ("status" in patch) {
    const st = normStatus(patch.status);
    if (!st) return res.status(400).json({ ok: false, error: "bad status" });
    fields.push({ col: "status", val: st });
  }

  if (fields.length === 0) return res.json({ ok: true });

  const sets = fields.map((f, i) => `${f.col} = $${i + 2}${f.col === "pros" || f.col === "cons" || f.col === "sections" ? "::jsonb" : ""}`);
  const values = fields.map((f) => f.val);

  try {
    await pool.query(
      `
      UPDATE casino_listings
      SET ${sets.join(", ")}
      WHERE id = $1::bigint
    `,
      [id, ...values]
    );
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: e?.message || "update_failed" });
  }
});

// GET /admin/casinos/:id/links
adminCasinosRouter.get("/:id/links", async (req, res) => {
  const casinoId = String(req.params.id);
  const { rows } = await pool.query(
    `
    SELECT
      id::text AS id,
      casino_id::text AS "casinoId",
      kind,
      owner_user_id AS "ownerUserId",
      streamer_id AS "streamerId",
      label,
      target_url AS "targetUrl",
      enabled,
      pinned_rank AS "pinnedRank",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM casino_affiliate_links
    WHERE casino_id = $1::bigint
    ORDER BY
      (CASE WHEN pinned_rank IS NULL THEN 1 ELSE 0 END) ASC,
      pinned_rank ASC NULLS LAST,
      created_at DESC
  `,
    [casinoId]
  );
  res.json({ ok: true, items: rows });
});

// POST /admin/casinos/:id/links
adminCasinosRouter.post("/:id/links", async (req, res) => {
  const casinoId = String(req.params.id);
  const kind = String(req.body?.kind || "").trim();
  const targetUrl = String(req.body?.targetUrl || "").trim();
  const label = req.body?.label != null ? String(req.body.label) : null;

  const enabled = req.body?.enabled == null ? true : Boolean(req.body.enabled);
  const pinnedRank = req.body?.pinnedRank == null || req.body.pinnedRank === "" ? null : Number(req.body.pinnedRank);

  const ownerUserId = req.body?.ownerUserId == null || req.body.ownerUserId === "" ? null : Number(req.body.ownerUserId);
  const streamerId = req.body?.streamerId == null || req.body.streamerId === "" ? null : Number(req.body.streamerId);

  if (!(kind === "bonus" || kind === "streamer")) return res.status(400).json({ ok: false, error: "bad kind" });
  if (!targetUrl) return res.status(400).json({ ok: false, error: "targetUrl required" });

  const { rows } = await pool.query(
    `
    INSERT INTO casino_affiliate_links
      (casino_id, kind, owner_user_id, streamer_id, label, target_url, enabled, pinned_rank)
    VALUES
      ($1::bigint, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id::text AS id
  `,
    [casinoId, kind, ownerUserId, streamerId, label, targetUrl, enabled, pinnedRank]
  );

  res.json({ ok: true, id: rows[0]?.id });
});

// PATCH /admin/casinos/links/:linkId
adminCasinosRouter.patch("/links/:linkId", async (req, res) => {
  const linkId = String(req.params.linkId);
  const patch = req.body || {};
  const fields: Array<{ col: string; val: any }> = [];

  if ("kind" in patch) {
    const k = String(patch.kind || "");
    if (!(k === "bonus" || k === "streamer")) return res.status(400).json({ ok: false, error: "bad kind" });
    fields.push({ col: "kind", val: k });
  }

  if ("label" in patch) fields.push({ col: "label", val: patch.label ? String(patch.label) : null });
  if ("targetUrl" in patch) fields.push({ col: "target_url", val: patch.targetUrl ? String(patch.targetUrl) : "" });
  if ("enabled" in patch) fields.push({ col: "enabled", val: Boolean(patch.enabled) });
  if ("pinnedRank" in patch) fields.push({ col: "pinned_rank", val: patch.pinnedRank === null || patch.pinnedRank === "" ? null : Number(patch.pinnedRank) });

  if ("ownerUserId" in patch) fields.push({ col: "owner_user_id", val: patch.ownerUserId === null || patch.ownerUserId === "" ? null : Number(patch.ownerUserId) });
  if ("streamerId" in patch) fields.push({ col: "streamer_id", val: patch.streamerId === null || patch.streamerId === "" ? null : Number(patch.streamerId) });

  if (fields.length === 0) return res.json({ ok: true });

  const sets = fields.map((f, i) => `${f.col} = $${i + 2}`);
  const values = fields.map((f) => f.val);

  await pool.query(
    `
    UPDATE casino_affiliate_links
    SET ${sets.join(", ")}
    WHERE id = $1::bigint
  `,
    [linkId, ...values]
  );

  res.json({ ok: true });
});
