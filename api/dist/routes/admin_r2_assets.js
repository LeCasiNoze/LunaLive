// api/src/routes/admin_r2_assets.ts
// One-shot admin endpoint: migre les assets de landing pages affiliées vers R2
// pour décharger le bandwidth du static site Render.
//
// Usage :
//   curl -X POST https://lunalive-api.onrender.com/admin/r2/upload-affi \
//        -H "x-admin-key: $ADMIN_KEY"
//
// Renvoie la liste des URLs publiques R2 à utiliser dans le HTML/React.
import { Router } from "express";
import { requireAdminKey } from "../auth.js";
import { r2Enabled, getR2PublicBase, putR2Buffer } from "../clips/r2.js";
export const adminR2AssetsRouter = Router();
const STATIC_ORIGIN = (process.env.PUBLIC_WEB_BASE || "https://lunalive.onrender.com").replace(/\/$/, "");
// Liste des assets à migrer (chemins relatifs au static site)
const VARIANTS = ["amethyst", "emerald", "gold", "jade", "obsidian", "rose", "ruby", "sapphire"];
const PER_VARIANT_FILES = ["background.webp", "chest.webp"];
const EMERALD_EXTRAS = ["jeux.webp", "970f1ea2-d616-48e7-acc4-96853cb9b14a.webp"];
function buildAssetList() {
    const list = [];
    for (const v of VARIANTS) {
        for (const f of PER_VARIANT_FILES) {
            list.push(`affi_templates/golden_chance_chest/variants/${v}/${f}`);
        }
    }
    for (const f of EMERALD_EXTRAS) {
        list.push(`affi_templates/golden_chance_chest/variants/emerald/${f}`);
    }
    return list;
}
function contentTypeFor(path) {
    if (path.endsWith(".webp"))
        return "image/webp";
    if (path.endsWith(".png"))
        return "image/png";
    if (path.endsWith(".jpg") || path.endsWith(".jpeg"))
        return "image/jpeg";
    return "application/octet-stream";
}
adminR2AssetsRouter.post("/admin/r2/upload-affi", requireAdminKey, async (_req, res) => {
    if (!r2Enabled()) {
        return res.status(503).json({ ok: false, error: "r2_not_configured" });
    }
    const publicBase = getR2PublicBase();
    if (!publicBase) {
        return res.status(503).json({ ok: false, error: "r2_public_base_missing" });
    }
    const assets = buildAssetList();
    const results = [];
    for (const relPath of assets) {
        const sourceUrl = `${STATIC_ORIGIN}/${relPath}`;
        const r2Key = `static/${relPath}`;
        try {
            const r = await fetch(sourceUrl);
            if (!r.ok) {
                results.push({ path: relPath, key: r2Key, url: "", bytes: 0, ok: false, err: `fetch_${r.status}` });
                continue;
            }
            const buf = Buffer.from(await r.arrayBuffer());
            const ok = await putR2Buffer({ key: r2Key, contentType: contentTypeFor(relPath), buffer: buf });
            results.push({
                path: relPath,
                key: r2Key,
                url: ok ? `${publicBase}/${r2Key}` : "",
                bytes: buf.length,
                ok,
            });
        }
        catch (e) {
            results.push({ path: relPath, key: r2Key, url: "", bytes: 0, ok: false, err: String(e?.message || e) });
        }
    }
    const totalBytes = results.reduce((s, r) => s + r.bytes, 0);
    const successCount = results.filter((r) => r.ok).length;
    res.json({
        ok: successCount === results.length,
        publicBase,
        totalBytes,
        totalMB: (totalBytes / 1024 / 1024).toFixed(2),
        count: results.length,
        success: successCount,
        results,
    });
});
