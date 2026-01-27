// api/src/routes/streamer_tabs.ts
import { Router } from "express";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import multer from "multer";
import os from "node:os";

import { pool } from "../db.js";
import { a } from "../utils/async.js";
import { requireAuth, type AuthUser } from "../auth.js";

// ✅ on réutilise votre impl R2
import { r2Enabled, buildPublicUrl, deleteFromR2, putFileToR2, getR2PublicBase } from "../clips/r2.js";

export const streamerTabsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3_000_000 }, // 3MB
});

// lazy import sharp (évite de casser le boot si sharp manque)
let sharpMod: any = null;
async function getSharp() {
  if (sharpMod) return sharpMod;
  try {
    const mod = await import("sharp");
    sharpMod = (mod as any).default ?? mod;
    return sharpMod;
  } catch {
    return null;
  }
}

async function getStreamerCore(slug: string) {
  const { rows } = await pool.query(
    `SELECT id, user_id AS owner_user_id
     FROM streamers
     WHERE lower(slug)=lower($1)
     LIMIT 1`,
    [slug]
  );

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

/** uniquement nos anciens uploads about locaux (legacy) */
function isLocalAboutUploadUrl(url: string, streamerId: number) {
  const u = String(url || "").trim();
  return u.startsWith(`/uploads/streamer_about/${streamerId}/`);
}

function aboutUploadAbsPath(url: string) {
  const rel = url.replace(/^\/uploads\//, ""); // streamer_about/<id>/<file>
  return path.resolve(process.cwd(), "uploads", rel);
}

async function deleteFileSafe(absPath: string) {
  try {
    await fs.unlink(absPath);
  } catch {}
}

/** R2: extraire key depuis URL publique */
function r2KeyFromPublicUrl(url: string): string | null {
  const u = String(url || "").trim();
  if (!u) return null;

  const base = getR2PublicBase();
  if (!base) return null;

  const baseNoSlash = String(base).replace(/\/+$/, "");
  if (!u.startsWith(baseNoSlash + "/")) return null;

  const rest = u.slice((baseNoSlash + "/").length);
  if (!rest) return null;

  // buildPublicUrl encode chaque segment => ici on décode chaque segment
  try {
    const key = rest
      .split("/")
      .filter(Boolean)
      .map((seg) => decodeURIComponent(seg))
      .join("/");
    return key || null;
  } catch {
    // si URL bizarre, on skip le delete
    return null;
  }
}

function makeAboutR2Key(streamerId: number) {
  return `streamer_about/${streamerId}/about_${crypto.randomUUID()}.webp`;
}

/* =========================
 *  ABOUT: upload image (R2 + square 800x800)
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

    if (!r2Enabled()) {
      return res.status(500).json({ ok: false, error: "r2_disabled" });
    }

    const file = (req as any).file as undefined | { buffer: Buffer; mimetype: string };
    if (!file?.buffer) return res.status(400).json({ ok: false, error: "NO_FILE" });

    const mt = String(file.mimetype || "").toLowerCase();
    if (!["image/jpeg", "image/png", "image/webp"].includes(mt)) {
      return res.status(400).json({ ok: false, error: "BAD_FILE_TYPE" });
    }

    const sharp = await getSharp();
    if (!sharp) return res.status(500).json({ ok: false, error: "sharp_not_installed" });

    // meta source (info)
    const meta = await sharp(file.buffer).metadata();
    const srcW = Number(meta.width || 0) || null;
    const srcH = Number(meta.height || 0) || null;

    // ✅ 1 type : carré 800×800 uniformisé
    const out = await sharp(file.buffer)
      .rotate()
      .resize({
        width: 800,
        height: 800,
        fit: "cover",
        position: "centre",
      })
      .webp({ quality: 82 })
      .toBuffer();

    // on réutilise votre helper putFileToR2(filePath)
    const key = makeAboutR2Key(core.id);
    const tmp = path.join(os.tmpdir(), `ll_about_${core.id}_${crypto.randomUUID()}.webp`);
    try {
      await fs.writeFile(tmp, out);

      await putFileToR2({
        key,
        contentType: "image/webp",
        filePath: tmp,
      });
    } catch (e) {
      console.error("[streamer_tabs/about] r2 upload error", e);
      return res.status(500).json({ ok: false, error: "UPLOAD_FAILED" });
    } finally {
      try {
        await fs.unlink(tmp);
      } catch {}
    }

    const imageUrl = buildPublicUrl(key);
    if (!imageUrl) return res.status(500).json({ ok: false, error: "R2_PUBLIC_BASE_MISSING" });

    return res.json({
      ok: true,
      imageUrl,
      width: srcW,
      height: srcH,
      kind: "square",
    });
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

    // images présentes avant (pour cleanup)
    const before = await pool.query(`SELECT image_url FROM streamer_about_blocks WHERE streamer_id=$1`, [core.id]);

    const prevLocal = new Set<string>();
    const prevR2Keys = new Set<string>();

    for (const r of before.rows) {
      const u = String(r.image_url || "").trim();
      if (!u) continue;

      if (isLocalAboutUploadUrl(u, core.id)) {
        prevLocal.add(u);
      } else {
        const k = r2KeyFromPublicUrl(u);
        if (k) prevR2Keys.add(k);
      }
    }

    const nextLocal = new Set<string>();
    const nextR2Keys = new Set<string>();

    const payload = blocks.map((b: any) => {
      const imageUrl = String(b.imageUrl || "").trim() || null;
      const linkUrl = String(b.linkUrl || "").trim() || null;
      const description = String(b.description || "").trim() || null;

      if (imageUrl) {
        if (isLocalAboutUploadUrl(imageUrl, core.id)) nextLocal.add(imageUrl);
        const k = r2KeyFromPublicUrl(imageUrl);
        if (k) nextR2Keys.add(k);
      }

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
      try {
        await client.query("ROLLBACK");
      } catch {}
      console.error("[streamer_tabs/about] db error", e);
      return res.status(500).json({ ok: false, error: "DB_ERROR" });
    } finally {
      client.release();
    }

    // cleanup local legacy
    for (const oldUrl of prevLocal) {
      if (nextLocal.has(oldUrl)) continue;

      const abs = aboutUploadAbsPath(oldUrl);
      const allowedRoot = path.resolve(process.cwd(), "uploads", "streamer_about", String(core.id));
      if (!abs.startsWith(allowedRoot)) continue;

      await deleteFileSafe(abs);
    }

    // cleanup R2
    for (const oldKey of prevR2Keys) {
      if (nextR2Keys.has(oldKey)) continue;
      try {
        await deleteFromR2(oldKey);
      } catch {}
    }

    return res.json({ ok: true });
  })
);

/* =========================
 *  AGENDA (inchangé ici)
 * ========================= */

streamerTabsRouter.get(
  "/:slug/agenda",
  a(async (req, res) => {
    const slug = String(req.params.slug || "").trim();
    if (!slug) return res.status(400).json({ ok: false, error: "BAD_SLUG" });

    const core = await getStreamerCore(slug);
    if (!core) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    await pool.query(
      `DELETE FROM streamer_agenda_rules
      WHERE streamer_id=$1
        AND kind='event'
        AND date_ymd IS NOT NULL
        AND date_ymd < to_char((now() AT TIME ZONE 'Europe/Paris')::date, 'YYYY-MM-DD')`,
      [core.id]
    );

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

        let dateYmd: string | null = null;
        if (kind === "event") {
          const d = String(r.date || "").trim();
          dateYmd = d || null;
          if (!dateYmd) {
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
      try {
        await client.query("ROLLBACK");
      } catch {}
      console.error("[streamer_tabs/agenda] db error", e);
      return res.status(500).json({ ok: false, error: "DB_ERROR" });
    } finally {
      client.release();
    }
  })
);

/* =========================
 *  AGENDA SUBS (NEW)
 * ========================= */

streamerTabsRouter.get(
  "/:slug/agenda/subs/me",
  requireAuth,
  a(async (req, res) => {
    const slug = String(req.params.slug || "").trim();
    if (!slug) return res.status(400).json({ ok: false, error: "BAD_SLUG" });

    const core = await getStreamerCore(slug);
    if (!core) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

    const uid = Number(req.user!.id);

    const { rows } = await pool.query(
      `SELECT rule_id
       FROM agenda_subscriptions
       WHERE streamer_id=$1 AND user_id=$2
       ORDER BY rule_id ASC`,
      [core.id, uid]
    );

    return res.json({ ok: true, ruleIds: rows.map((r: any) => Number(r.rule_id)) });
  })
);

streamerTabsRouter.post(
  "/:slug/agenda/subs",
  requireAuth,
  a(async (req, res) => {
    const slug = String(req.params.slug || "").trim();
    if (!slug) return res.status(400).json({ ok: false, error: "BAD_SLUG" });

    const core = await getStreamerCore(slug);
    if (!core) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

    const uid = Number(req.user!.id);
    const ruleId = Number(req.body?.ruleId);
    if (!Number.isFinite(ruleId) || ruleId <= 0) return res.status(400).json({ ok: false, error: "BAD_RULE_ID" });

    const own = await pool.query(
      `SELECT id FROM streamer_agenda_rules WHERE id=$1 AND streamer_id=$2 LIMIT 1`,
      [ruleId, core.id]
    );
    if (!own.rows?.length) return res.status(404).json({ ok: false, error: "RULE_NOT_FOUND" });

    await pool.query(
      `INSERT INTO agenda_subscriptions(streamer_id, rule_id, user_id)
       VALUES ($1,$2,$3)
       ON CONFLICT (streamer_id, rule_id, user_id) DO NOTHING`,
      [core.id, ruleId, uid]
    );

    return res.json({ ok: true });
  })
);

streamerTabsRouter.delete(
  "/:slug/agenda/subs",
  requireAuth,
  a(async (req, res) => {
    const slug = String(req.params.slug || "").trim();
    if (!slug) return res.status(400).json({ ok: false, error: "BAD_SLUG" });

    const core = await getStreamerCore(slug);
    if (!core) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

    const uid = Number(req.user!.id);
    const ruleId = Number(req.body?.ruleId);
    if (!Number.isFinite(ruleId) || ruleId <= 0) return res.status(400).json({ ok: false, error: "BAD_RULE_ID" });

    await pool.query(
      `DELETE FROM agenda_subscriptions WHERE streamer_id=$1 AND rule_id=$2 AND user_id=$3`,
      [core.id, ruleId, uid]
    );

    return res.json({ ok: true });
  })
);
