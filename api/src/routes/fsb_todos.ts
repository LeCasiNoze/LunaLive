// api/src/routes/fsb_todos.ts
//
// CRUD minimal pour les todos FSB. Affichés sur la page d'accueil du FSB Board.
// Création principalement via la commande Discord `/todo`, mais on expose aussi
// POST pour créer depuis l'UI.

import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { a } from "../utils/async.js";
import { requireFsbAccess } from "./fsb_guard.js";

export const fsbTodosRouter = Router();
fsbTodosRouter.use("/fsb/todos", requireAuth, requireFsbAccess);

function rowToJson(row: any) {
  return {
    id: Number(row.id),
    message: String(row.message || ""),
    attachmentUrl: row.attachment_url ? String(row.attachment_url) : null,
    attachmentName: row.attachment_name ? String(row.attachment_name) : null,
    createdByName: row.created_by_name ? String(row.created_by_name) : null,
    status: String(row.status || "pending"),
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

// GET /fsb/todos?status=pending|done|all (default: pending)
fsbTodosRouter.get("/fsb/todos", a(async (req, res) => {
  const status = String((req as any).query?.status || "pending").toLowerCase();
  const where = status === "all" ? "" : "WHERE status = $1";
  const params = status === "all" ? [] : [status === "done" ? "done" : "pending"];
  const r = await pool.query(
    `SELECT id, message, attachment_url, attachment_name, created_by_name,
            status, created_at, completed_at
     FROM fsb_todos
     ${where}
     ORDER BY status ASC, created_at DESC
     LIMIT 100`,
    params
  );
  res.json({ ok: true, items: r.rows.map(rowToJson) });
}));

// POST /fsb/todos { message, attachmentUrl?, attachmentName? }
fsbTodosRouter.post("/fsb/todos", a(async (req, res) => {
  const body: any = (req as any).body || {};
  const message = String(body.message || "").trim();
  if (!message) return res.status(400).json({ ok: false, error: "message_required" });
  const attachmentUrl = body.attachmentUrl ? String(body.attachmentUrl) : null;
  const attachmentName = body.attachmentName ? String(body.attachmentName) : null;
  const userId = (req as any).user?.id ?? null;
  const userName = (req as any).user?.username || (req as any).user?.email || null;
  const r = await pool.query(
    `INSERT INTO fsb_todos (message, attachment_url, attachment_name, created_by_user_id, created_by_name)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, message, attachment_url, attachment_name, created_by_name, status, created_at, completed_at`,
    [message, attachmentUrl, attachmentName, userId, userName]
  );
  res.json({ ok: true, item: rowToJson(r.rows[0]) });
}));

// PATCH /fsb/todos/:id { status: "done" | "pending" }
fsbTodosRouter.patch("/fsb/todos/:id", a(async (req, res) => {
  const id = Number((req as any).params?.id);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "bad_id" });
  const next = String((req as any).body?.status || "").toLowerCase();
  if (next !== "done" && next !== "pending") {
    return res.status(400).json({ ok: false, error: "bad_status" });
  }
  const r = await pool.query(
    `UPDATE fsb_todos
     SET status = $1,
         completed_at = CASE WHEN $1 = 'done' THEN NOW() ELSE NULL END
     WHERE id = $2
     RETURNING id, message, attachment_url, attachment_name, created_by_name, status, created_at, completed_at`,
    [next, id]
  );
  if (r.rowCount === 0) return res.status(404).json({ ok: false, error: "not_found" });
  res.json({ ok: true, item: rowToJson(r.rows[0]) });
}));

// DELETE /fsb/todos/:id
fsbTodosRouter.delete("/fsb/todos/:id", a(async (req, res) => {
  const id = Number((req as any).params?.id);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "bad_id" });
  const r = await pool.query(`DELETE FROM fsb_todos WHERE id = $1`, [id]);
  if (r.rowCount === 0) return res.status(404).json({ ok: false, error: "not_found" });
  res.json({ ok: true });
}));
