import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";

export const reportsRouter = express.Router();
reportsRouter.use(requireAuth);

/** Mini helper admin */
function isAdmin(u: any) {
  return String(u?.role || "").toLowerCase() === "admin";
}

function normText(v: any, max = 3000) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.slice(0, max);
}

function safeCategory(kind: "report" | "feedback", v: any) {
  const s = String(v ?? "").trim().toLowerCase();
  const report = ["spam", "harassment", "scam", "cheating", "underage", "other"];
  const feedback = ["bug", "suggestion", "uiux", "performance", "other"];
  const allowed = kind === "report" ? report : feedback;
  return allowed.includes(s) ? s : "other";
}

type Attachment = { name: string; dataUrl: string; mime: string; size: number };

function validateAttachments(arr: any): Attachment[] {
  if (!Array.isArray(arr)) return [];
  const out: Attachment[] = [];
  for (const it of arr.slice(0, 3)) {
    const name = normText(it?.name, 120) || "screenshot";
    const dataUrl = String(it?.dataUrl ?? "");
    const mime = normText(it?.mime, 80) || "image/png";
    const size = Number(it?.size ?? 0) || 0;

    // data URL basique
    if (!dataUrl.startsWith("data:image/")) continue;

    // limite ~1.8MB par image (base64 gonfle)
    if (dataUrl.length > 2_600_000) continue;

    out.push({ name, dataUrl, mime, size });
  }
  return out;
}

/** Create report/feedback */
reportsRouter.post("/", async (req: any, res) => {
  try {
    const me = req.user; // requireAuth devrait set req.user
    const authorUserId = Number(me?.id || 0) || 0;
    if (!authorUserId) return res.status(401).json({ ok: false, error: "unauthorized" });

    const kindRaw = String(req.body?.kind || "").toLowerCase();
    const kind: "report" | "feedback" = kindRaw === "feedback" ? "feedback" : "report";

    const category = safeCategory(kind, req.body?.category);
    const subject = normText(req.body?.subject, 140);
    const description = normText(req.body?.description, 4000);
    if (!subject || !description) {
      return res.status(400).json({ ok: false, error: "missing_subject_or_description" });
    }

    const target_type = normText(req.body?.target?.type, 40) || null;
    const target_user_id = req.body?.target?.userId != null ? Number(req.body.target.userId) : null;
    const target_username = normText(req.body?.target?.username, 80) || null;
    const target_slug = normText(req.body?.target?.slug, 80) || null;
    const target_url = normText(req.body?.target?.url, 600) || null;

    const allow_contact = req.body?.allowContact === false ? false : true;

    const attachments = validateAttachments(req.body?.attachments);

    const author_username = normText(me?.username, 80) || null;

    const q = await pool.query(
      `INSERT INTO reports(
         author_user_id, author_username,
         kind, category, subject, description,
         target_type, target_user_id, target_username, target_slug, target_url,
         attachments, allow_contact
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)
       RETURNING id, created_at`,
      [
        authorUserId,
        author_username,
        kind,
        category,
        subject,
        description,
        target_type,
        target_user_id,
        target_username,
        target_slug,
        target_url,
        JSON.stringify(attachments),
        allow_contact,
      ]
    );

    return res.json({ ok: true, id: q.rows[0].id, created_at: q.rows[0].created_at });
  } catch (e: any) {
    console.error("[reports] create failed", e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

/** Admin list */
reportsRouter.get("/admin/list", async (req: any, res) => {
  try {
    const me = req.user;
    if (!isAdmin(me)) return res.status(403).json({ ok: false, error: "forbidden" });

    const status = normText(req.query?.status, 20) || "";
    const where = status && ["open", "triaged", "closed"].includes(status) ? `WHERE status=$1` : "";
    const args = where ? [status] : [];

    const q = await pool.query(
      `
      SELECT id, created_at, author_user_id, author_username,
             kind, category, subject, description,
             target_type, target_user_id, target_username, target_slug, target_url,
             attachments, allow_contact,
             status, admin_notes, handled_by, handled_at
      FROM reports
      ${where}
      ORDER BY created_at DESC
      LIMIT 200
      `,
      args
    );

    return res.json({ ok: true, items: q.rows });
  } catch (e: any) {
    console.error("[reports] admin list failed", e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

/** Admin update status / notes */
reportsRouter.post("/admin/:id", async (req: any, res) => {
  try {
    const me = req.user;
    if (!isAdmin(me)) return res.status(403).json({ ok: false, error: "forbidden" });

    const id = Number(req.params?.id || 0) || 0;
    if (!id) return res.status(400).json({ ok: false, error: "bad_id" });

    const status = normText(req.body?.status, 20);
    const admin_notes = req.body?.admin_notes != null ? normText(req.body.admin_notes, 2000) : null;

    const nextStatus = ["open", "triaged", "closed"].includes(status) ? status : null;

    const q = await pool.query(
      `UPDATE reports
       SET status = COALESCE($2, status),
           admin_notes = COALESCE($3, admin_notes),
           handled_by = $4,
           handled_at = now()
       WHERE id=$1
       RETURNING id, status, admin_notes, handled_by, handled_at`,
      [id, nextStatus, admin_notes, Number(me?.id || 0) || null]
    );

    return res.json({ ok: true, item: q.rows[0] ?? null });
  } catch (e: any) {
    console.error("[reports] admin update failed", e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});
