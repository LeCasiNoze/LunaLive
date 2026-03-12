// api/src/emotes/admin_emotes.router.ts
import { Router } from "express";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import { pool } from "../db.js";
import { a } from "../utils/async.js";
import { r2Enabled, putFileToR2, buildPublicUrl, deleteFromR2 } from "../clips/r2.js";
/**
 * IMPORTANT:
 * - Ce router NE DOIT PAS faire requireAuth.
 * - Il est protégé par requireAdminKey au mount dans app.ts:
 *     app.use("/admin/emotes", requireAdminKey, adminEmotesRouter);
 */
export const adminEmotesRouter = Router();
/* ---------------- utils ---------------- */
function normName(s) {
    return String(s ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 32);
}
function bytesLenFromB64(b64) {
    // approx exact for base64 (padding aware)
    const s = String(b64 || "");
    const pad = s.endsWith("==") ? 2 : s.endsWith("=") ? 1 : 0;
    return Math.floor((s.length * 3) / 4) - pad;
}
function parseDataUrl(dataUrl) {
    const s = String(dataUrl || "");
    const m = s.match(/^data:([^;]+);base64,(.+)$/i);
    if (!m)
        throw new Error("bad_dataurl");
    const mime = String(m[1] || "").trim().toLowerCase();
    const b64 = String(m[2] || "").trim();
    if (!mime || !b64)
        throw new Error("bad_dataurl");
    // hard cap ~ 3MB decoded (tu peux ajuster)
    const n = bytesLenFromB64(b64);
    if (!Number.isFinite(n) || n <= 0)
        throw new Error("bad_dataurl");
    if (n > 3_000_000)
        throw new Error("file_too_large");
    return { mime, buffer: Buffer.from(b64, "base64") };
}
function extFromMime(mime) {
    if (mime === "image/png")
        return "png";
    if (mime === "image/webp")
        return "webp";
    if (mime === "image/gif")
        return "gif";
    return "";
}
function ensureKindMime(kind, mime) {
    if (kind === "gif") {
        if (mime !== "image/gif")
            throw new Error("gif_must_be_gif");
        return;
    }
    // emoji
    if (mime === "image/gif")
        throw new Error("emoji_cannot_be_gif");
    if (mime !== "image/png" && mime !== "image/webp")
        throw new Error("unsupported_mime");
}
function pickStorage(url, assetKey) {
    if (assetKey && r2Enabled())
        return "r2";
    if (url && url.startsWith("/"))
        return "local";
    if (url)
        return "unknown";
    return "unknown";
}
/* ---------------- routes ---------------- */
/**
 * GET /admin/emotes?limit=300&q=&scope=&kind=&status=&streamer=
 * (router est monté sur /admin/emotes)
 */
adminEmotesRouter.get("/", a(async (req, res) => {
    const limit = Math.max(1, Math.min(500, Number(req.query.limit || 300) || 300));
    const q = String(req.query.q || "").trim();
    const scope = String(req.query.scope || "").trim(); // native|global|channel
    const kind = String(req.query.kind || "").trim(); // emoji|gif
    const status = String(req.query.status || "").trim(); // active|disabled|banned|deleted
    const streamer = String(req.query.streamer || "").trim(); // slug ou id
    const where = [];
    const params = [];
    let i = 1;
    if (q) {
        where.push(`(
        e.name ILIKE $${i} OR
        COALESCE(e.label,'') ILIKE $${i} OR
        COALESCE(s.slug,'') ILIKE $${i}
      )`);
        params.push(`%${q}%`);
        i++;
    }
    if (scope) {
        where.push(`e.scope = $${i}`);
        params.push(scope);
        i++;
    }
    if (kind) {
        where.push(`e.kind = $${i}`);
        params.push(kind);
        i++;
    }
    if (status) {
        where.push(`e.status = $${i}`);
        params.push(status);
        i++;
    }
    if (streamer) {
        // accepte slug ou id
        if (/^\d+$/.test(streamer)) {
            where.push(`e.streamer_id = $${i}`);
            params.push(Number(streamer));
            i++;
        }
        else {
            where.push(`LOWER(s.slug) = LOWER($${i})`);
            params.push(streamer);
            i++;
        }
    }
    const sql = `
      SELECT
        e.id,
        e.kind,
        e.scope,
        e.streamer_id,
        s.slug AS streamer_slug,
        e.name,
        e.label,
        e.url,
        e.mime,
        e.size_bytes,
        e.status,
        e.created_at,
        COALESCE(e.asset_key, NULL) AS asset_key
      FROM emotes e
      LEFT JOIN streamers s ON s.id = e.streamer_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY e.created_at DESC
      LIMIT ${limit}
    `;
    const { rows } = await pool.query(sql, params);
    const items = rows.map((r) => {
        const assetKey = r.asset_key ? String(r.asset_key) : null;
        const url = r.url ? String(r.url) : null;
        return {
            id: Number(r.id),
            kind: r.kind,
            scope: r.scope,
            streamer_id: r.streamer_id != null ? Number(r.streamer_id) : null,
            streamer_slug: r.streamer_slug ? String(r.streamer_slug) : null,
            name: String(r.name),
            label: r.label != null ? String(r.label) : null,
            url,
            mime: r.mime != null ? String(r.mime) : null,
            size_bytes: r.size_bytes != null ? Number(r.size_bytes) : null,
            status: r.status,
            created_at: r.created_at,
            storage: pickStorage(url, assetKey),
            // missing_file: (optionnel) on évite de ping des URLs ici (trop lourd)
        };
    });
    res.json({ ok: true, items });
}));
/**
 * POST /admin/emotes
 * body: { scope:"native"|"global", kind:"emoji"|"gif", name, label?, dataUrl }
 */
adminEmotesRouter.post("/", a(async (req, res) => {
    const scopeRaw = String(req.body.scope || "").trim();
    const kindRaw = String(req.body.kind || "").trim();
    const name = normName(req.body.name);
    const scope = (scopeRaw === "native" || scopeRaw === "global") ? scopeRaw : "";
    const kind = (kindRaw === "emoji" || kindRaw === "gif") ? kindRaw : null;
    const label = req.body.label != null ? String(req.body.label).trim().slice(0, 64) : null;
    const dataUrl = String(req.body.dataUrl || "");
    if (!scope)
        return res.status(400).json({ ok: false, error: "bad_scope" });
    if (!kind)
        return res.status(400).json({ ok: false, error: "bad_kind" });
    if (!name)
        return res.status(400).json({ ok: false, error: "bad_name" });
    if (!dataUrl)
        return res.status(400).json({ ok: false, error: "missing_dataurl" });
    if (!r2Enabled())
        return res.status(400).json({ ok: false, error: "r2_required_for_emotes" });
    const { mime, buffer } = parseDataUrl(dataUrl);
    ensureKindMime(kind, mime);
    const ext = extFromMime(mime);
    if (!ext)
        return res.status(400).json({ ok: false, error: "unsupported_mime" });
    // check uniqueness
    {
        const { rows } = await pool.query(`SELECT 1 FROM emotes WHERE scope=$1 AND kind=$2 AND lower(name)=lower($3) LIMIT 1`, [scope, kind, name]);
        if (rows[0])
            return res.status(400).json({ ok: false, error: "already_exists" });
    }
    // temp file
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "ll-emote-"));
    const tmpPath = path.join(tmpDir, `${name}.${ext}`);
    await fsp.writeFile(tmpPath, buffer);
    try {
        const key = `emotes/${scope}/${kind}/${name}-${Date.now()}.${ext}`;
        await putFileToR2({
            key,
            contentType: mime,
            filePath: tmpPath,
        });
        const url = buildPublicUrl(key);
        if (!url)
            throw new Error("r2_public_base_missing");
        const ins = await pool.query(`INSERT INTO emotes (kind, scope, streamer_id, name, label, url, mime, size_bytes, status, asset_key)
         VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,'active',$8)
         RETURNING id, kind, scope, streamer_id, name, label, url, mime, size_bytes, status, created_at`, [kind, scope, name, label, url, mime, buffer.length, key]);
        res.json({ ok: true, item: ins.rows[0] });
    }
    finally {
        try {
            await fsp.rm(tmpDir, { recursive: true, force: true });
        }
        catch { }
        try {
            fs.unlinkSync(tmpPath);
        }
        catch { }
    }
}));
/**
 * POST /admin/emotes/:id/status
 * body: { status:"active"|"disabled"|"banned"|"deleted" }
 */
adminEmotesRouter.post("/:id/status", a(async (req, res) => {
    const id = Number(req.params.id || 0);
    const next = String(req.body.status || "").trim();
    if (!id)
        return res.status(400).json({ ok: false, error: "bad_id" });
    if (!["active", "disabled", "banned", "deleted"].includes(next))
        return res.status(400).json({ ok: false, error: "bad_status" });
    await pool.query(`UPDATE emotes SET status=$1 WHERE id=$2`, [next, id]);
    res.json({ ok: true });
}));
/**
 * POST /admin/emotes/:id/purge
 * - supprime le fichier du storage si on a asset_key
 * - puis met url=NULL / asset_key=NULL (soft purge)
 */
adminEmotesRouter.post("/:id/purge", a(async (req, res) => {
    const id = Number(req.params.id || 0);
    if (!id)
        return res.status(400).json({ ok: false, error: "bad_id" });
    const { rows } = await pool.query(`SELECT id, asset_key FROM emotes WHERE id=$1 LIMIT 1`, [id]);
    const row = rows[0];
    if (!row)
        return res.status(404).json({ ok: false, error: "not_found" });
    const assetKey = row.asset_key ? String(row.asset_key) : "";
    if (assetKey && r2Enabled()) {
        try {
            await deleteFromR2(assetKey);
        }
        catch (e) {
            console.warn("[admin/emotes/purge] deleteFromR2 failed:", e);
            // on continue, car parfois l’objet n’existe déjà plus
        }
    }
    await pool.query(`UPDATE emotes SET url=NULL, asset_key=NULL, status='deleted' WHERE id=$1`, [id]);
    res.json({ ok: true });
}));
