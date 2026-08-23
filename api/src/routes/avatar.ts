// api/src/routes/avatar.ts
import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../auth.js";

export const avatarRouter = Router();

const PUBLIC_API_BASE = String(
  process.env.PUBLIC_API_BASE || process.env.RENDER_EXTERNAL_URL || "https://lunalive-api.onrender.com"
).replace(/\/$/, "");
const PUBLIC_WEB_BASE = String(process.env.PUBLIC_WEB_BASE || "https://lunalive.win").replace(/\/$/, "");

const ALLOWED_MIME = new Set(["image/webp", "image/png", "image/jpeg"]);
const MAX_BYTES = 120 * 1024; // ✅ limite stricte (on compresse côté front)

function toInt(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

// Public: GET /avatars/u/:id
avatarRouter.get("/avatars/u/:id", async (req, res) => {
  res.setHeader("x-router-hit", "avatar_public");
  try {
    const userId = toInt(req.params.id);
    if (!userId) return res.status(400).end();

    const r = await pool.query(
      `SELECT ua.mime, ua.bytes, ua.updated_at, u.avatar_path
       FROM users u
       LEFT JOIN user_avatars ua ON ua.user_id = u.id
       WHERE u.id=$1
       LIMIT 1`,
      [userId]
    );

    const row = r.rows?.[0];
    if (!row) return res.status(404).end();

    // Imported/seeded accounts use one of the public default avatars until
    // the owner uploads a custom picture. Keep the stable API URL for both.
    if (!row.bytes) {
      const rawPath = String(row.avatar_path || "").trim();
      if (!/^\/Avatar\/avatar_[a-z0-9_-]+\.(?:png|webp|jpe?g)$/i.test(rawPath)) {
        return res.status(404).end();
      }
      const optimizedPath = rawPath.replace(/\.png$/i, ".webp");
      res.setHeader("Cache-Control", "public, max-age=3600");
      return res.redirect(302, `${PUBLIC_WEB_BASE}${optimizedPath}`);
    }

    res.setHeader("Content-Type", String(row.mime));
    res.setHeader("Last-Modified", new Date(row.updated_at).toUTCString());

    // ✅ cache OK, et on bust avec ?v=... côté front
    res.setHeader("Cache-Control", "public, max-age=86400");

    return res.status(200).send(row.bytes);
  } catch {
    return res.status(500).end();
  }
});

// Auth: PUT /me/avatar
avatarRouter.put("/me/avatar", requireAuth, async (req: any, res) => {
  const userId = toInt(req.user?.id);
  if (!userId) return res.status(401).json({ ok: false, error: "auth_required" });

  const mime = String(req.body?.mime || "").trim().toLowerCase();
  const data = String(req.body?.data || "").trim();

  if (!ALLOWED_MIME.has(mime)) {
    return res.status(400).json({ ok: false, error: "bad_mime" });
  }
  if (!data) return res.status(400).json({ ok: false, error: "missing_data" });

  let buf: Buffer;
  try {
    buf = Buffer.from(data, "base64");
  } catch {
    return res.status(400).json({ ok: false, error: "bad_base64" });
  }

  if (!buf.length) return res.status(400).json({ ok: false, error: "empty" });
  if (buf.length > MAX_BYTES) {
    return res.status(413).json({ ok: false, error: "too_large" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ✅ remplace l’avatar
    await client.query(`DELETE FROM user_avatars WHERE user_id=$1`, [userId]);
    await client.query(
      `INSERT INTO user_avatars (user_id, mime, bytes, updated_at)
       VALUES ($1,$2,$3,NOW())`,
      [userId, mime, buf]
    );

    const v = Date.now(); // cache-bust immédiat
    await client.query("COMMIT");

    return res.json({
      ok: true,
      avatarUrl: `${PUBLIC_API_BASE}/avatars/u/${userId}?v=${v}`,
    });
  } catch {
    try {
      await client.query("ROLLBACK");
    } catch {}
    return res.status(500).json({ ok: false, error: "avatar_save_failed" });
  } finally {
    client.release();
  }
});

// Auth: DELETE /me/avatar
avatarRouter.delete("/me/avatar", requireAuth, async (req: any, res) => {
  const userId = toInt(req.user?.id);
  if (!userId) return res.status(401).json({ ok: false, error: "auth_required" });

  await pool.query(`DELETE FROM user_avatars WHERE user_id=$1`, [userId]);
  return res.json({ ok: true });
});
