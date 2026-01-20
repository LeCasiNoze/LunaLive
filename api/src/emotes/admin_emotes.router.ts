// api/src/emotes/admin_emotes.router.ts
import express from "express";
import path from "node:path";
import os from "node:os";
import { promises as fsp } from "node:fs";

import { pool } from "../db.js";
import { r2Enabled, putFileToR2, buildPublicUrl } from "../clips/r2.js";

export const adminEmotesRouter = express.Router();

function normName(s: any) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

function parseDataUrl(dataUrl: string) {
  const m = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error("bad_dataurl");
  const mime = m[1];
  const b64 = m[2];
  const buf = Buffer.from(b64, "base64");
  return { mime, buf };
}

function extFromMime(mime: string) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return null;
}

function tmpFilePath(ext: string) {
  const name = `ll_emote_${Date.now()}_${Math.random().toString(16).slice(2)}.${ext}`;
  return path.join(os.tmpdir(), name);
}

function asText(v: any) {
  return String(v ?? "").trim();
}

function clampInt(n: any, a: number, b: number, def: number) {
  const x = Math.floor(Number(n));
  if (!Number.isFinite(x)) return def;
  return Math.max(a, Math.min(b, x));
}

/**
 * GET /admin/emotes?limit=300&q=&scope=&kind=&status=&streamer=
 * - streamer peut être un id numérique ou un slug
 */
adminEmotesRouter.get("/admin/emotes", async (req, res) => {
  try {
    const limit = clampInt(req.query.limit, 1, 500, 300);
    const q = asText(req.query.q);
    const scope = asText(req.query.scope);
    const kind = asText(req.query.kind);
    const status = asText(req.query.status);
    const streamer = asText(req.query.streamer);

    const where: string[] = [];
    const args: any[] = [];
    let i = 1;

    if (scope) {
      where.push(`e.scope = $${i++}`);
      args.push(scope);
    }
    if (kind) {
      where.push(`e.kind = $${i++}`);
      args.push(kind);
    }
    if (status) {
      where.push(`e.status = $${i++}`);
      args.push(status);
    }
    if (q) {
      where.push(`(e.name ILIKE $${i} OR COALESCE(e.label,'') ILIKE $${i} OR COALESCE(s.slug,'') ILIKE $${i})`);
      args.push(`%${q}%`);
      i++;
    }

    // streamer filter (id ou slug)
    if (streamer) {
      const isId = /^\d+$/.test(streamer);
      if (isId) {
        where.push(`e.streamer_id = $${i++}`);
        args.push(Number(streamer));
      } else {
        where.push(`s.slug = $${i++}`);
        args.push(streamer);
      }
    }

    const sql = `
      SELECT
        e.id, e.kind, e.scope, e.streamer_id,
        s.slug AS streamer_slug,
        e.name, e.label, e.asset_key, e.url, e.mime, e.size_bytes, e.status, e.created_at
      FROM emotes e
      LEFT JOIN streamers s ON s.id = e.streamer_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY e.scope ASC, e.kind ASC, e.name ASC
      LIMIT ${limit}
    `;

    const r = await pool.query(sql, args);
    res.json({ ok: true, items: r.rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

/**
 * POST /admin/emotes
 * body: { scope:"native"|"global", kind:"emoji"|"gif", name, label?, dataUrl }
 */
adminEmotesRouter.post("/admin/emotes", express.json({ limit: "3mb" }), async (req, res) => {
  let tmpPath: string | null = null;

  try {
    const scope = String(req.body?.scope || "");
    if (scope !== "native" && scope !== "global") {
      return res.status(400).json({ ok: false, error: "bad_scope" });
    }

    const kind = String(req.body?.kind || "");
    if (kind !== "emoji" && kind !== "gif") {
      return res.status(400).json({ ok: false, error: "bad_kind" });
    }

    const name = normName(req.body?.name);
    if (!name) return res.status(400).json({ ok: false, error: "bad_name" });

    const label = req.body?.label != null ? String(req.body.label).slice(0, 64) : null;

    const dataUrl = String(req.body?.dataUrl || "");
    const { mime, buf } = parseDataUrl(dataUrl);

    const ext = extFromMime(mime);
    if (!ext) return res.status(400).json({ ok: false, error: "unsupported_mime" });

    const max = kind === "gif" ? 600_000 : 160_000;
    if (buf.length > max) return res.status(400).json({ ok: false, error: "file_too_large" });

    if (kind === "emoji" && mime === "image/gif") return res.status(400).json({ ok: false, error: "emoji_cannot_be_gif" });
    if (kind === "gif" && mime !== "image/gif") return res.status(400).json({ ok: false, error: "gif_must_be_gif" });

    // 🔑 assetKey natif/global
    const assetKey = `emotes/${scope}/${kind}/${name}.${ext}`;

    // 👉 on force R2 (sinon tu vas retomber dans ton souci “redeploy => file perdu”)
    if (!r2Enabled()) {
      return res.status(400).json({ ok: false, error: "r2_required_for_emotes" });
    }

    tmpPath = tmpFilePath(ext);
    await fsp.writeFile(tmpPath, buf);

    await putFileToR2({
      key: assetKey,
      contentType: mime,
      filePath: tmpPath,
    });

    const url = buildPublicUrl(assetKey);
    if (!url) throw new Error("r2_public_base_missing");

    const up = await pool.query(
      `
      INSERT INTO emotes(kind, scope, streamer_id, name, label, asset_key, url, mime, size_bytes, status, created_by)
      VALUES($1,$2,NULL,$3,$4,$5,$6,$7,$8,'active',NULL)
      ON CONFLICT (scope, kind, name)
      WHERE (scope IN ('native','global') AND status <> 'deleted')
      DO UPDATE SET
        label=EXCLUDED.label,
        asset_key=EXCLUDED.asset_key,
        url=EXCLUDED.url,
        mime=EXCLUDED.mime,
        size_bytes=EXCLUDED.size_bytes,
        status='active',
        updated_at=now()
      RETURNING id, kind, scope, streamer_id, name, label, url, mime, size_bytes, status, created_at
      `,
      [kind, scope, name, label, assetKey, url, mime, buf.length]
    );

    res.json({ ok: true, item: up.rows[0] });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: String(e?.message || e) });
  } finally {
    if (tmpPath) {
      try {
        await fsp.unlink(tmpPath);
      } catch {}
    }
  }
});

/**
 * POST /admin/emotes/:id/status  body:{status}
 */
adminEmotesRouter.post("/admin/emotes/:id/status", express.json(), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "bad_id" });

    const status = String(req.body?.status || "");
    if (!["active", "disabled", "banned", "deleted"].includes(status)) {
      return res.status(400).json({ ok: false, error: "bad_status" });
    }

    await pool.query(`UPDATE emotes SET status=$2, updated_at=now() WHERE id=$1`, [id, status]);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

/**
 * POST /admin/emotes/:id/purge
 * Base version: on “décroche” le fichier (url=null, asset_key=null) + on met deleted.
 * (Si tu veux la suppression réelle sur R2, il faudra une fonction deleteObjectR2.)
 */
adminEmotesRouter.post("/admin/emotes/:id/purge", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "bad_id" });

    await pool.query(
      `UPDATE emotes
       SET status='deleted', url=NULL, asset_key=NULL, updated_at=now()
       WHERE id=$1`,
      [id]
    );

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});
