// api/src/routes/admin_casinos.ts
import { Router } from "express";
import { pool } from "../db.js";
import { a } from "../utils/async.js";
import { requireAuth } from "../auth.js";

export const adminCasinosRouter = Router();

function mustAdmin(req: any) {
  if (!req.user?.id) throw new Error("unauthorized");
  if (req.user.role !== "admin") throw new Error("forbidden");
}

adminCasinosRouter.get(
  "/admin/casinos/moderation",
  requireAuth,
  a(async (req, res) => {
    mustAdmin(req);
    const status = String(req.query.status ?? "pending");

    const { rows } = await pool.query(
      `
      SELECT
        c.id::text AS id,
        c.casino_id::text AS "casinoId",
        c.user_id AS "userId",
        u.username,
        c.body,
        c.created_at AS "createdAt",
        c.status
      FROM casino_comments c
      JOIN users u ON u.id = c.user_id
      WHERE c.status=$1
      ORDER BY c.created_at ASC
      LIMIT 200
      `,
      [status]
    );

    res.json({ ok: true, items: rows });
  })
);

adminCasinosRouter.post(
  "/admin/casinos/comments/:id/approve",
  requireAuth,
  a(async (req, res) => {
    mustAdmin(req);
    const id = Number(req.params.id);

    await pool.query(
      `UPDATE casino_comments
       SET status='published', moderated_by=$2, moderated_at=NOW(), moderation_note=NULL
       WHERE id=$1`,
      [id, Number(req.user!.id)]
    );

    res.json({ ok: true });
  })
);

adminCasinosRouter.post(
  "/admin/casinos/comments/:id/reject",
  requireAuth,
  a(async (req, res) => {
    mustAdmin(req);
    const id = Number(req.params.id);
    const note = req.body?.note ? String(req.body.note).slice(0, 500) : null;

    await pool.query(
      `UPDATE casino_comments
       SET status='rejected', moderated_by=$2, moderated_at=NOW(), moderation_note=$3
       WHERE id=$1`,
      [id, Number(req.user!.id), note]
    );

    res.json({ ok: true });
  })
);
