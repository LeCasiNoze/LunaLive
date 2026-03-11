// api/src/routes/admin_reports.ts
import express from "express";
import { pool } from "../db.js";
export const adminReportsRouter = express.Router();
function normText(v, max = 200) {
    const s = String(v ?? "").trim();
    return s ? s.slice(0, max) : "";
}
function clampInt(n, a, b) {
    const x = Math.floor(Number(n || 0));
    if (!Number.isFinite(x))
        return a;
    return Math.max(a, Math.min(b, x));
}
function mapRow(r) {
    return {
        id: Number(r.id),
        kind: String(r.kind || "report"),
        status: String(r.status || "open"),
        category: String(r.category || ""),
        subject: String(r.subject || ""),
        description: String(r.description || ""),
        createdAt: r.created_at,
        userId: r.author_user_id != null ? Number(r.author_user_id) : undefined,
        username: r.author_username ?? undefined,
        target: r.target_username || r.target_slug || r.target_url
            ? {
                username: r.target_username ?? null,
                slug: r.target_slug ?? null,
                url: r.target_url ?? null,
            }
            : null,
        attachments: Array.isArray(r.attachments) ? r.attachments : [],
    };
}
/**
 * GET /admin/reports?status=open|closed|all&limit=...
 * -> { ok:true, items:[...], counts?: { open:number, closed:number } }
 */
adminReportsRouter.get("/", async (req, res) => {
    try {
        const status = normText(req.query?.status, 20).toLowerCase();
        const limit = clampInt(req.query?.limit, 1, 300);
        const where = status && status !== "all" ? "WHERE status = $1" : "";
        const args = status && status !== "all" ? [status, limit] : [limit];
        const q = await pool.query(`
      SELECT
        id, created_at,
        author_user_id, author_username,
        kind, status, category, subject, description,
        target_username, target_slug, target_url,
        attachments
      FROM reports
      ${where}
      ORDER BY created_at DESC
      LIMIT $${args.length}
      `, args);
        // counts (optionnel mais pratique pour l’UI)
        const c = await pool.query(`
      SELECT status, COUNT(*)::int AS n
      FROM reports
      WHERE status IN ('open','closed')
      GROUP BY status
      `);
        const counts = { open: 0, closed: 0 };
        for (const row of c.rows) {
            const st = String(row.status);
            if (st === "open")
                counts.open = Number(row.n || 0);
            if (st === "closed")
                counts.closed = Number(row.n || 0);
        }
        return res.json({ ok: true, items: q.rows.map(mapRow), counts });
    }
    catch (e) {
        console.error("[admin_reports] list failed", e);
        return res.status(500).json({ ok: false, error: "server_error" });
    }
});
/**
 * GET /admin/reports/:id
 */
adminReportsRouter.get("/:id", async (req, res) => {
    try {
        const id = Number(req.params?.id || 0) || 0;
        if (!id)
            return res.status(400).json({ ok: false, error: "bad_id" });
        const q = await pool.query(`
      SELECT
        id, created_at,
        author_user_id, author_username,
        kind, status, category, subject, description,
        target_username, target_slug, target_url,
        attachments
      FROM reports
      WHERE id=$1
      LIMIT 1
      `, [id]);
        const item = q.rows[0] ? mapRow(q.rows[0]) : null;
        return res.json({ ok: true, item });
    }
    catch (e) {
        console.error("[admin_reports] get failed", e);
        return res.status(500).json({ ok: false, error: "server_error" });
    }
});
/**
 * POST /admin/reports/:id/status { status: "open"|"closed"|"deleted" }
 */
adminReportsRouter.post("/:id/status", async (req, res) => {
    try {
        const id = Number(req.params?.id || 0) || 0;
        if (!id)
            return res.status(400).json({ ok: false, error: "bad_id" });
        const status = normText(req.body?.status, 20).toLowerCase();
        const allowed = ["open", "closed", "deleted", "triaged"];
        const next = allowed.includes(status) ? status : null;
        if (!next)
            return res.status(400).json({ ok: false, error: "bad_status" });
        await pool.query(`
      UPDATE reports
      SET status=$2,
          handled_at=NOW()
      WHERE id=$1
      `, [id, next]);
        return res.json({ ok: true });
    }
    catch (e) {
        console.error("[admin_reports] set status failed", e);
        return res.status(500).json({ ok: false, error: "server_error" });
    }
});
/**
 * DELETE /admin/reports/:id
 * -> fait un soft delete (status=deleted)
 */
adminReportsRouter.delete("/:id", async (req, res) => {
    try {
        const id = Number(req.params?.id || 0) || 0;
        if (!id)
            return res.status(400).json({ ok: false, error: "bad_id" });
        await pool.query(`UPDATE reports SET status='deleted', handled_at=NOW() WHERE id=$1`, [id]);
        return res.json({ ok: true });
    }
    catch (e) {
        console.error("[admin_reports] delete failed", e);
        return res.status(500).json({ ok: false, error: "server_error" });
    }
});
