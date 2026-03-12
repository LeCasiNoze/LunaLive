// api/src/calls/shuffle_images.ts
import { URL } from "url";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\.(?:jpg|jpeg|png|webp))?$/i;
function imgixBase() {
    const base = String(process.env.IMG_SHUFFLE_IMGIX_BASE || "https://shuffle-com.imgix.net/").trim();
    return base.endsWith("/") ? base : base + "/";
}
function imgixWidth() {
    const w = String(process.env.IMG_SHUFFLE_IMGIX_WIDTH || "256").trim();
    return w || "256";
}
function ensureWidthQs(u) {
    try {
        const url = new URL(u);
        if (!url.searchParams.get("auto"))
            url.searchParams.set("auto", "format");
        url.searchParams.set("width", imgixWidth());
        return url.toString();
    }
    catch {
        return u;
    }
}
/**
 * Accepte:
 *  - https://cdn.shuffle.com/images/<uuid>.jpg
 *  - https://shuffle-com.imgix.net/<uuid>[?...]
 *  - <uuid>.jpg  ou  <uuid>
 * Renvoie une URL imgix valide (avec width), sinon null.
 */
export function rewriteShuffleToImgix(uOrFilename) {
    const raw = String(uOrFilename || "").trim();
    if (!raw)
        return null;
    // Déjà une URL ?
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
        try {
            const url = new URL(raw);
            const host = String(url.hostname || "").toLowerCase();
            // Déjà imgix shuffle => normalise width
            if (host.includes("imgix") && host.includes("shuffle")) {
                return ensureWidthQs(raw);
            }
            // cdn.shuffle.com/images/<uuid>.jpg => imgix/<uuid>?...
            if (host.endsWith("cdn.shuffle.com") || host.endsWith("shuffle.com")) {
                const last = url.pathname.split("/").pop() || "";
                if (UUID_RE.test(last)) {
                    const uuidOnly = last.split(".", 1)[0];
                    return `${imgixBase()}${uuidOnly}?auto=format&width=${encodeURIComponent(imgixWidth())}`;
                }
            }
        }
        catch {
            // ignore
        }
    }
    // Nom de fichier ou uuid brut
    const last = raw.split("/").pop() || "";
    if (UUID_RE.test(last)) {
        const uuidOnly = last.split(".", 1)[0];
        return `${imgixBase()}${uuidOnly}?auto=format&width=${encodeURIComponent(imgixWidth())}`;
    }
    return null;
}
export function pickShuffleImage(images) {
    if (!images || typeof images !== "object")
        return null;
    for (const k of ["list", "thumbnail", "cover"]) {
        const v = images[k];
        if (typeof v === "string" && v.trim())
            return v.trim();
    }
    return null;
}
/**
 * Compat (ancienne méthode GraphQL):
 * Priorité:
 *  1) node.images.{list,thumbnail,cover}
 *  2) node.image.key (uuid) => imgix
 *  3) fallback legacy via SHUFFLE_IMAGE_FMT si défini
 */
export function shuffleImageFromNode(node) {
    if (!node || typeof node !== "object")
        return null;
    // 1) images{...}
    const img = node.images;
    const picked = pickShuffleImage(img);
    if (picked) {
        const rew = rewriteShuffleToImgix(picked);
        return rew || picked;
    }
    // 2) image.key (uuid)
    const img2 = node.image;
    const key = img2 && typeof img2 === "object" ? img2.key : null;
    if (typeof key === "string" && key.trim()) {
        const rew = rewriteShuffleToImgix(key.trim());
        if (rew)
            return rew;
        // 3) fallback legacy
        const fmt = String(process.env.SHUFFLE_IMAGE_FMT || "").trim();
        if (fmt) {
            try {
                const legacy = fmt.replace("{key}", key.trim());
                const rew2 = rewriteShuffleToImgix(legacy);
                return rew2 || legacy;
            }
            catch {
                // ignore
            }
        }
    }
    return null;
}
/**
 * ✅ Utilitaire conservé (pour compat avec ton fetcher)
 */
export function isGqlValidationError(errMsg) {
    const m = String(errMsg || "");
    return (m.includes("GRAPHQL_VALIDATION_FAILED") ||
        m.includes("Cannot query field") ||
        m.includes("Unknown argument") ||
        m.includes("Unknown type") ||
        (m.includes("Field") && m.includes("must not have a selection")) ||
        m.includes("Cannot return null for non-nullable field"));
}
function shuffleGamesJsonUrl() {
    return String(process.env.SHUFFLE_GAMES_JSON_URL || "https://n9assets.com/file/games/games.json").trim();
}
function shuffleGamesJsonTtlMs() {
    return Math.max(60_000, Number(process.env.SHUFFLE_GAMES_JSON_TTL_MS || 6 * 3600_000)); // 6h
}
function shuffleGamesJsonTimeoutMs() {
    return Math.max(2_000, Number(process.env.SHUFFLE_GAMES_JSON_TIMEOUT_MS || 20_000));
}
let _cache = null;
let _inflight = null;
function makeImgixFromKey(key) {
    const k = String(key || "").trim();
    if (!k)
        return null;
    return rewriteShuffleToImgix(k);
}
export async function loadShuffleImagesIndex(force) {
    const now = Date.now();
    const ttl = shuffleGamesJsonTtlMs();
    if (!force && _cache && now - _cache.loadedAtMs < ttl)
        return _cache;
    if (_inflight)
        return _inflight;
    _inflight = (async () => {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), shuffleGamesJsonTimeoutMs());
        try {
            const r = await fetch(shuffleGamesJsonUrl(), {
                method: "GET",
                headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 LunaLive (shuffle-images)" },
                signal: ctrl.signal,
            });
            if (!r.ok)
                throw new Error(`shuffle_games_json_http:${r.status}`);
            const data = (await r.json());
            if (!Array.isArray(data))
                throw new Error("shuffle_games_json_invalid");
            const bySlug = new Map();
            const byExternalId = new Map();
            for (const g of data) {
                if (!g || typeof g !== "object")
                    continue;
                const slug = typeof g.slug === "string" ? g.slug.trim() : "";
                const externalId = typeof g.externalId === "string" ? g.externalId.trim() : "";
                const key = g.image && typeof g.image === "object" ? g.image.key : null;
                const img = typeof key === "string" ? makeImgixFromKey(key) : null;
                if (!img)
                    continue;
                if (slug)
                    bySlug.set(slug, img);
                if (externalId)
                    byExternalId.set(externalId, img);
            }
            _cache = { loadedAtMs: Date.now(), bySlug, byExternalId };
            return _cache;
        }
        finally {
            clearTimeout(t);
            _inflight = null;
        }
    })();
    return _inflight;
}
export function getShuffleImageUrlFromIndex(idx, args) {
    const slug = String(args.slug || "").trim();
    if (slug) {
        const hit = idx.bySlug.get(slug);
        if (hit)
            return hit;
    }
    const providerId = String(args.providerId || "").trim();
    const name = String(args.name || "").trim();
    if (providerId && name) {
        const ext = `${providerId}:${name}`;
        const hit2 = idx.byExternalId.get(ext);
        if (hit2)
            return hit2;
    }
    return null;
}
