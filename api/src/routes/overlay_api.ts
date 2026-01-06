// api/src/routes/overlay_api.ts
import { Router } from "express";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";

export const overlayApiRouter = Router();

function getAuthUserFromReq(req: any): { id: number; role?: string } | null {
  const h = String(req.headers?.authorization || "");
  const m = h.match(/^Bearer\s+(.+)$/i);
  const token = m?.[1] || String(req.query?.token || "");

  if (!token) return null;

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return null;
    const u = jwt.verify(token, secret) as any;
    const id = Number(u?.id);
    if (!Number.isFinite(id) || id <= 0) return null;
    return { id, role: u?.role };
  } catch {
    return null;
  }
}

// GET /overlay/api/followers?slug=lecasinoze
overlayApiRouter.get("/followers", async (req, res) => {
  const me = getAuthUserFromReq(req);
  if (!me) return res.status(401).json({ ok: false, error: "unauthorized" });

  const slug = String(req.query?.slug || "").trim();
  if (!slug) return res.status(400).json({ ok: false, error: "bad_request" });

  const s = await pool.query(
    `SELECT id, user_id
     FROM streamers
     WHERE slug=$1
     LIMIT 1`,
    [slug]
  );

  const row = s.rows?.[0];
  if (!row) return res.status(404).json({ ok: false, error: "not_found" });

  const ownerId = Number(row.user_id);
  if (me.role !== "admin" && ownerId !== me.id) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }

  const q = await pool.query(
    `SELECT
        COUNT(*)::int AS count,
        MAX(created_at) AS "lastFollowAt"
     FROM streamer_follows
     WHERE streamer_id=$1`,
    [row.id]
  );

  return res.json({
    ok: true,
    count: Number(q.rows?.[0]?.count ?? 0),
    lastFollowAt: q.rows?.[0]?.lastFollowAt ?? null,
  });
});
