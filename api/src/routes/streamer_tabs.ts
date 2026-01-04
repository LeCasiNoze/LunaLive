// api/src/routes/streamer_tabs.ts
import { Router } from "express";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import multer from "multer";
import sharp from "sharp";

import { pool } from "../db.js";
import { a } from "../utils/async.js";
import { requireAuth, type AuthUser } from "../auth.js";

export const streamerTabsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 3_000_000, // 3MB max
  },
});

let cachedOwnerCol: string | null | undefined;

async function resolveOwnerCol(): Promise<string | null> {
  if (cachedOwnerCol !== undefined) return cachedOwnerCol;

  const { rows } = await pool.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='streamers'
      AND column_name IN ('owner_user_id','owneruserid','owner_id')
    `
  );

  const set = new Set(rows.map((r: any) => String(r.column_name)));

  if (set.has("owner_user_id")) cachedOwnerCol = "owner_user_id";
  else if (set.has("owneruserid")) cachedOwnerCol = "owneruserid";
  else if (set.has("owner_id")) cachedOwnerCol = "owner_id";
  else cachedOwnerCol = null;

  return cachedOwnerCol;
}

async function getStreamerCore(slug: string) {
  const ownerCol = await resolveOwnerCol();

  const sql = ownerCol
    ? `SELECT id, ${ownerCol} AS owner_user_id
       FROM streamers
       WHERE lower(slug) = lower($1)
       LIMIT 1`
    : `SELECT id, NULL::int AS owner_user_id
       FROM streamers
       WHERE lower(slug) = lower($1)
       LIMIT 1`;

  const { rows } = await pool.query(sql, [slug]);
  const r = rows[0];
  if (!r) return null;

  return {
    id: Number(r.id),
    owner_user_id: r.owner_user_id == null ? null : Number(r.owner_user_id),
  };
}

function canEdit(user: AuthUser, ownerUserId: number | null) {
  if (!user) return false;
  if (String((user as any).role) === "admin") return true;
  const uid = Number((user as any).id);
  return ownerUserId != null && Number(ownerUserId) === uid;
}

/** uniquement nos uploads about */
function isLocalAboutUploadUrl(url: string, streamerId: number) {
  const u = String(url || "").trim();
  return u.startsWith(`/uploads/streamer_about/${streamerId}/`);
}

function aboutUploadAbsPath(url: string) {
  // url: /uploads/streamer_about/<id>/<file>
  const rel = url.replace(/^\/uploads\//, ""); // streamer_about/<id>/<file>
  return path.resolve(process.cwd(), "uploads", rel);
}

async function deleteFileSafe(absPath: string) {
  try {
    await fs.unlink(absPath);
  } catch {
    // ignore missing / already deleted
  }
}

/* =========================
 *  ABOUT: upload image
 * ========================= */

streamerTabsRouter.post(
  "/:slug/about/upload-image",
  requireAuth,
  upload.single("file"),
  a(async (req, res) => {
    const slug = String(req.params.slug || "").trim();
    if (!slug) return res.status(400).json({ ok: false, error: "BAD_SLUG" });

    const user = (req as any).user as AuthUser;
    const core = await getStreamerCore(slug);
    if (!core) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    if (!canEdit(user, core.owner_user_id)) return res.status(403).json({ ok: false, error: "FORBIDDEN" });

    const file = (req as any).file as undefined | { buffer: Buffer; mimetype: string; originalname: string };
    if (!file?.buffer) return res.status(400).json({ ok: false, error: "NO_FILE" });

    const mt = String(file.mimetype || "").toLowerCase();
    if (!["image/jpeg", "image/png", "image/webp"].includes(mt)) {
      return res.status(400).json({ ok: false, error: "BAD_FILE_TYPE" });
    }

    // ✅ optimisation: rotate (EXIF), resize inside 1280, convert webp
    const out = await sharp(file.buffer)
      .rotate()
      .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();

    const dir = path.resolve(process.cwd(), "uploads", "streamer_about", String(core.id));
    await fs.mkdir(dir, { recursive: true });

    const name = `about_${crypto.randomUUID()}.webp`;
    const abs = path.resolve(dir, name);
    await fs.writeFile(abs, out);

    const imageUrl = `/uploads/streamer_about/${core.id}/${name}`;
    return res.json({ ok: true, imageUrl });
  })
);

/* =========================
 *  ABOUT: read
 * ========================= */

streamerTabsRouter.get(
  "/:slug/about",
  a(async (req, res) => {
    const slug = String(req.params.slug || "").trim();
    if (!slug) return res.status(400).json({ ok: false, error: "BAD_SLUG" });

    const core = await getStreamerCore(slug);
    if (!core) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

    const { rows } = await pool.query(
      `SELECT id, position, image_url, link_url, description
       FROM streamer_about_blocks
       WHERE streamer_id = $1
       ORDER BY position ASC`,
      [core.id]
    );

    return res.json({
      ok: true,
      blocks: rows.map((r: any) => ({
        id: Number(r.id),
        imageUrl: r.image_url,
        linkUrl: r.link_url,
        description: r.description,
      })),
    });
  })
);

/* =========================
 *  ABOUT: save + cleanup old images
 * ========================= */

streamerTabsRouter.put(
  "/:slug/about",
  requireAuth,
  a(async (req, res) => {
    const slug = String(req.params.slug || "").trim();
    if (!slug) return res.status(400).json({ ok: false, error: "BAD_SLUG" });

    const user = (req as any).user as AuthUser;
    const core = await getStreamerCore(slug);
    if (!core) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    if (!canEdit(user, core.owner_user_id)) return res.status(403).json({ ok: false, error: "FORBIDDEN" });

    const blocks = Array.isArray((req.body as any)?.blocks) ? (req.body as any).blocks : null;
    if (!blocks) return res.status(400).json({ ok: false, error: "BAD_BODY" });
    if (blocks.length > 30) return res.status(400).json({ ok: false, error: "TOO_MANY_BLOCKS" });

    // avant: récupérer les images locales actuellement en DB (pour cleanup)
    const before = await pool.query(
      `SELECT image_url FROM streamer_about_blocks WHERE streamer_id=$1`,
      [core.id]
    );
    const prevLocal = new Set<string>();
    for (const r of before.rows) {
      const u = String(r.image_url || "").trim();
      if (u && isLocalAboutUploadUrl(u, core.id)) prevLocal.add(u);
    }

    const nextLocal = new Set<string>();
    const payload = blocks.map((b: any) => {
      const imageUrl = String(b.imageUrl || "").trim() || null;
      const linkUrl = String(b.linkUrl || "").trim() || null;
      const description = String(b.description || "").trim() || null;
      if (imageUrl && isLocalAboutUploadUrl(imageUrl, core.id)) nextLocal.add(imageUrl);
      return { imageUrl, linkUrl, description };
    });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(`DELETE FROM streamer_about_blocks WHERE streamer_id=$1`, [core.id]);

      for (let i = 0; i < payload.length; i++) {
        const b = payload[i];
        await client.query(
          `INSERT INTO streamer_about_blocks (streamer_id, position, image_url, link_url, description)
           VALUES ($1,$2,$3,$4,$5)`,
          [core.id, i, b.imageUrl, b.linkUrl, b.description]
        );
      }

      await client.query("COMMIT");
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("[streamer_tabs/about] db error", e);
      return res.status(500).json({ ok: false, error: "DB_ERROR" });
    } finally {
      client.release();
    }

    // ✅ cleanup: tout ce qui était en DB avant et n'est plus utilisé
    for (const oldUrl of prevLocal) {
      if (nextLocal.has(oldUrl)) continue;
      const abs = aboutUploadAbsPath(oldUrl);

      // sécurité : on n'efface que dans le dossier du streamer
      const allowedRoot = path.resolve(process.cwd(), "uploads", "streamer_about", String(core.id));
      if (!abs.startsWith(allowedRoot)) continue;

      await deleteFileSafe(abs);
    }

    return res.json({ ok: true });
  })
);

/* =========================
 *  AGENDA
 * ========================= */

streamerTabsRouter.get(
  "/:slug/agenda",
  a(async (req, res) => {
    const slug = String(req.params.slug || "").trim();
    if (!slug) return res.status(400).json({ ok: false, error: "BAD_SLUG" });

    const core = await getStreamerCore(slug);
    if (!core) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

    const { rows } = await pool.query(
      `SELECT id, kind, title, color, day_of_week, date_ymd, start_time, end_time
       FROM streamer_agenda_rules
       WHERE streamer_id = $1
       ORDER BY kind ASC, coalesce(date_ymd, '9999-99-99') ASC, coalesce(day_of_week, 0) ASC, start_time ASC`,
      [core.id]
    );

    return res.json({
      ok: true,
      rules: rows.map((r: any) => ({
        id: Number(r.id),
        kind: r.kind,
        title: r.title,
        color: r.color,
        dayOfWeek: r.day_of_week,
        date: r.date_ymd,
        startTime: r.start_time,
        endTime: r.end_time,
      })),
    });
  })
);

streamerTabsRouter.put(
  "/:slug/agenda",
  requireAuth,
  a(async (req, res) => {
    const slug = String(req.params.slug || "").trim();
    if (!slug) return res.status(400).json({ ok: false, error: "BAD_SLUG" });

    const user = (req as any).user as AuthUser;
    const core = await getStreamerCore(slug);
    if (!core) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    if (!canEdit(user, core.owner_user_id)) return res.status(403).json({ ok: false, error: "FORBIDDEN" });

    const rules = Array.isArray((req.body as any)?.rules) ? (req.body as any).rules : null;
    if (!rules) return res.status(400).json({ ok: false, error: "BAD_BODY" });
    if (rules.length > 80) return res.status(400).json({ ok: false, error: "TOO_MANY_RULES" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM streamer_agenda_rules WHERE streamer_id=$1`, [core.id]);

      for (const raw of rules) {
        const r = raw || {};
        const kind = String(r.kind || "").trim();
        if (kind !== "regular" && kind !== "event") continue;

        const title = String(r.title || "").trim().slice(0, 80) || "Stream";
        const color = String(r.color || "").trim() || "#8b5cf6";
        const startTime = String(r.startTime || "00:00").trim();
        const endTime = String(r.endTime || "00:00").trim();

        const dayOfWeek = kind === "regular" ? Number(r.dayOfWeek ?? 0) : null;

        // ✅ important: event DOIT avoir une date
        let dateYmd: string | null = null;
        if (kind === "event") {
          const d = String(r.date || "").trim();
          dateYmd = d || null;
          if (!dateYmd) {
            // fallback "aujourd'hui" pour éviter DB_ERROR si UI laisse vide
            const now = new Date();
            const y = now.getFullYear();
            const m = String(now.getMonth() + 1).padStart(2, "0");
            const dd = String(now.getDate()).padStart(2, "0");
            dateYmd = `${y}-${m}-${dd}`;
          }
        }

        await client.query(
          `INSERT INTO streamer_agenda_rules
            (streamer_id, kind, title, color, day_of_week, date_ymd, start_time, end_time)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [core.id, kind, title, color, dayOfWeek, dateYmd, startTime, endTime]
        );
      }

      await client.query("COMMIT");
      return res.json({ ok: true });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error("[streamer_tabs/agenda] db error", e);
      return res.status(500).json({ ok: false, error: "DB_ERROR" });
    } finally {
      client.release();
    }
  })
);
