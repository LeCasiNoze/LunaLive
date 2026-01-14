// api/src/routes/admin_casino_comments.ts
import { Router } from "express";
import { pool } from "../db.js";
import { a } from "../utils/async.js";
import { requireAdminKey } from "../auth.js";

export const adminCasinoCommentsRouter = Router();

adminCasinoCommentsRouter.use((req, _res, next) => {
  console.error("[ADMIN_COMMENTS_ROUTER] HIT", req.method, req.originalUrl);
  next();
});

// -----------------------------------------------------------------------------
// Mounted in app.ts with:
//   app.use("/admin/casinos/comments", adminCasinoCommentsRouter);
// So paths here are:
//   GET    /admin/casinos/comments/pending
//   GET    /admin/casinos/comments/published?casinoId=123
//   PATCH  /admin/casinos/comments/:commentId
// -----------------------------------------------------------------------------

function parseLimit(v: any, def = 50) {
  const n = Number(v ?? def);
  return Math.min(200, Math.max(1, Number.isFinite(n) ? n : def));
}

function baseSelectSql(where: string, limitParamIndex: number) {
  return `
    SELECT
      c.id::text AS id,
      c.casino_id::text AS "casinoId",
      cl.slug AS "casinoSlug",
      cl.name AS "casinoName",
      cl.logo_url AS "casinoLogoUrl",
      c.user_id AS "userId",
      u.username,
      c.body,
      c.created_at AS "createdAt",
      c.has_images AS "hasImages",
      c.status,

      COALESCE((
        SELECT json_agg(json_build_object(
          'url', i.url,
          'w', i.w,
          'h', i.h,
          'sizeBytes', i.size_bytes
        ) ORDER BY i.id ASC)
        FROM casino_comment_images i
        WHERE i.comment_id = c.id
      ), '[]'::json) AS images
    FROM casino_comments c
    JOIN users u ON u.id = c.user_id
    JOIN casino_listings cl ON cl.id = c.casino_id
    ${where}
    ORDER BY c.created_at DESC
    LIMIT $${limitParamIndex}
  `;
}

/**
 * GET /admin/casinos/comments/pending
 * query: limit?, cursor?, q?, casinoId?
 */
adminCasinoCommentsRouter.get(
  "/pending",
  requireAdminKey,
  a(async (req, res) => {
    const limit = parseLimit(req.query.limit, 50);
    const cursor = req.query.cursor ? String(req.query.cursor) : null;
    const q = String(req.query.q ?? "").trim().toLowerCase();
    const casinoId = req.query.casinoId ? Number(req.query.casinoId) : null;

    const params: any[] = [];
    let where = `WHERE c.status='pending'`;

    if (casinoId && Number.isFinite(casinoId)) {
      params.push(casinoId);
      where += ` AND c.casino_id = $${params.length}`;
    }

    if (q) {
      params.push(`%${q}%`);
      where += ` AND (LOWER(u.username) LIKE $${params.length} OR LOWER(cl.name) LIKE $${params.length} OR LOWER(c.body) LIKE $${params.length})`;
    }

    if (cursor) {
      params.push(cursor);
      where += ` AND c.created_at < $${params.length}`;
    }

    params.push(limit);

    const { rows } = await pool.query(baseSelectSql(where, params.length), params);

    const nextCursor = rows.length ? rows[rows.length - 1].createdAt : null;
    res.json({ ok: true, items: rows, nextCursor });
  })
);

/**
 * ✅ GET /admin/casinos/comments/published?casinoId=123
 * query: casinoId (required), limit?, cursor?, q?
 *
 * -> pour afficher les avis publiés sur la page admin d’un casino (Trustpilot-like)
 */
adminCasinoCommentsRouter.get(
  "/published",
  requireAdminKey,
  a(async (req, res) => {
    const limit = parseLimit(req.query.limit, 50);
    const cursor = req.query.cursor ? String(req.query.cursor) : null;
    const q = String(req.query.q ?? "").trim().toLowerCase();
    const casinoId = req.query.casinoId ? Number(req.query.casinoId) : null;

    if (!casinoId || !Number.isFinite(casinoId)) {
      return res.status(400).json({ ok: false, error: "casinoId_required" });
    }

    const params: any[] = [];
    let where = `WHERE c.status='published'`;

    params.push(casinoId);
    where += ` AND c.casino_id = $${params.length}`;

    if (q) {
      params.push(`%${q}%`);
      where += ` AND (LOWER(u.username) LIKE $${params.length} OR LOWER(cl.name) LIKE $${params.length} OR LOWER(c.body) LIKE $${params.length})`;
    }

    if (cursor) {
      params.push(cursor);
      where += ` AND c.created_at < $${params.length}`;
    }

    params.push(limit);

    const { rows } = await pool.query(baseSelectSql(where, params.length), params);

    const nextCursor = rows.length ? rows[rows.length - 1].createdAt : null;
    res.json({ ok: true, items: rows, nextCursor });
  })
);

/**
 * PATCH /admin/casinos/comments/:commentId
 * body: { action: "approve"|"reject"|"delete", note?: string }
 *
 * -> pour supprimer depuis l’admin: action="delete" (soft delete via status)
 */
adminCasinoCommentsRouter.patch(
  "/:commentId",
  requireAdminKey,
  a(async (req, res) => {
    const id = String(req.params.commentId || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "bad_comment_id" });

    const action = String(req.body?.action ?? "").trim();
    const note = req.body?.note == null ? null : String(req.body.note).slice(0, 2000);

    let status: string | null = null;
    if (action === "approve") status = "published";
    if (action === "reject") status = "rejected";
    if (action === "delete") status = "deleted";
    if (!status) return res.status(400).json({ ok: false, error: "bad_action" });

    const r = await pool.query(
      `
      UPDATE casino_comments
      SET status=$2,
          moderated_at=NOW(),
          moderation_note=$3
      WHERE id::text = $1
      RETURNING id::text AS id, status
      `,
      [id, status, note]
    );

    if (!r.rowCount) return res.status(404).json({ ok: false, error: "not_found" });

    res.json({ ok: true, id: r.rows[0].id, status: r.rows[0].status });
  })
);
