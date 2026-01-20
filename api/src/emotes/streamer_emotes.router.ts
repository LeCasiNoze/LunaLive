// api/src/emotes/streamer_emotes.router.ts
import express from "express";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { promises as fsp } from "node:fs";

import { pool } from "../db.js";
import { requireAuth } from "../auth.js";
import { r2Enabled, putFileToR2, buildPublicUrl } from "../clips/r2.js";

export const streamerEmotesRouter = express.Router();
streamerEmotesRouter.use(requireAuth);

function normName(s: any) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

async function getMyStreamerId(userId: number): Promise<number | null> {
  const r = await pool.query(`SELECT id FROM streamers WHERE user_id=$1 LIMIT 1`, [userId]);
  return r.rows?.[0]?.id ? Number(r.rows[0].id) : null;
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

// List mes emotes (dashboard streamer)
streamerEmotesRouter.get("/me/streamer/emotes", async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const streamerId = await getMyStreamerId(userId);
    if (!streamerId) return res.status(404).json({ ok: false, error: "no_streamer" });

    const r = await pool.query(
      `SELECT id, kind, scope, streamer_id, name, label, url, mime, size_bytes, status, created_at
       FROM emotes
       WHERE scope='channel' AND streamer_id=$1 AND status <> 'deleted'
       ORDER BY kind ASC, name ASC`,
      [streamerId]
    );

    res.json({ ok: true, items: r.rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Upload (emoji/gif) scope=channel
streamerEmotesRouter.post(
  "/me/streamer/emotes",
  // ⚠️ le global JSON limit peut bloquer si trop bas => mets 3mb globalement dans app.ts
  express.json({ limit: "3mb" }),
  async (req, res) => {
    let tmpPath: string | null = null;

    try {
      const userId = (req as any).user.id;
      const streamerId = await getMyStreamerId(userId);
      if (!streamerId) return res.status(404).json({ ok: false, error: "no_streamer" });

      const kind = String(req.body?.kind || "");
      if (kind !== "emoji" && kind !== "gif") return res.status(400).json({ ok: false, error: "bad_kind" });

      const name = normName(req.body?.name);
      if (!name) return res.status(400).json({ ok: false, error: "bad_name" });

      const label = req.body?.label != null ? String(req.body.label).slice(0, 64) : null;

      const dataUrl = String(req.body?.dataUrl || "");
      const { mime, buf } = parseDataUrl(dataUrl);

      const ext = extFromMime(mime);
      if (!ext) return res.status(400).json({ ok: false, error: "unsupported_mime" });

      // caps light
      const max = kind === "gif" ? 600_000 : 160_000; // 600kb gif, 160kb emoji
      if (buf.length > max) return res.status(400).json({ ok: false, error: "file_too_large" });

      if (kind === "emoji" && mime === "image/gif") {
        return res.status(400).json({ ok: false, error: "emoji_cannot_be_gif" });
      }
      if (kind === "gif" && mime !== "image/gif") {
        return res.status(400).json({ ok: false, error: "gif_must_be_gif" });
      }

      const assetKey = `emotes/channel/${streamerId}/${kind}/${name}.${ext}`;

      let url: string | null = null;

      if (r2Enabled()) {
        // ✅ putFileToR2 attend un filePath => on écrit un tmp file
        tmpPath = tmpFilePath(ext);
        await fsp.writeFile(tmpPath, buf);

        await putFileToR2({
          key: assetKey,
          contentType: mime,
          filePath: tmpPath,
        });

        url = buildPublicUrl(assetKey);
        if (!url) throw new Error("r2_public_base_missing");
      } else {
        // sinon tu vas perdre les fichiers au redeploy Render
        return res.status(400).json({ ok: false, error: "r2_required_for_emotes" });
      }


    const up = await pool.query(
    `
    INSERT INTO emotes(kind, scope, streamer_id, name, label, asset_key, url, mime, size_bytes, status, created_by)
    VALUES($1,'channel',$2,$3,$4,$5,$6,$7,$8,'active',$9)
    ON CONFLICT (scope, kind, streamer_id, name)
    WHERE (scope='channel' AND status <> 'deleted')
    DO UPDATE SET label=EXCLUDED.label,
                    asset_key=EXCLUDED.asset_key,
                    url=EXCLUDED.url,
                    mime=EXCLUDED.mime,
                    size_bytes=EXCLUDED.size_bytes,
                    status='active',
                    updated_at=now()
    RETURNING id, kind, scope, streamer_id, name, label, url, mime, size_bytes, status
    `,
    [kind, streamerId, name, label, assetKey, url, mime, buf.length, userId]
    );
    
      res.json({ ok: true, item: up.rows[0] });
    } catch (e: any) {
      res.status(400).json({ ok: false, error: String(e?.message || e) });
    } finally {
      // cleanup tmp file
      if (tmpPath) {
        try {
          await fsp.unlink(tmpPath);
        } catch {}
      }
    }
  }
);

// Delete (soft delete)
streamerEmotesRouter.delete("/me/streamer/emotes/:id", async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const streamerId = await getMyStreamerId(userId);
    if (!streamerId) return res.status(404).json({ ok: false, error: "no_streamer" });

    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "bad_id" });

    await pool.query(
      `UPDATE emotes SET status='deleted', updated_at=now()
       WHERE id=$1 AND scope='channel' AND streamer_id=$2`,
      [id, streamerId]
    );

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});
