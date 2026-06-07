// Verification periodique des landings: taap.it -> notre landing -> DB.
// Tourne toutes les 2h. Sequentiel (1.5s entre chaque entree) pour ne
// pas spam taap.it.
//
// Pipeline par ref:
//   1. GET taap_url, suit les redirections (fetch redirect: follow par defaut)
//   2. URL finale = response.url ; extraire le slug (last path segment)
//   3. Lookup affi_landing_pages WHERE slug=$1 (et secondairement WHERE
//      config::jsonb ->> 'affiLink' = expected_celsius_url)
//   4. Statuts possibles:
//      - 'ok'              : taap redirige vers notre landing + DB.affiLink == expected
//      - 'taap_unreachable': taap.it KO (network / 5xx)
//      - 'taap_off_domain' : taap redirige hors lunalive.win
//      - 'landing_missing' : slug absent en DB
//      - 'celsius_changed' : DB.affiLink ≠ expected_celsius_url
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, } from "discord.js";
import * as cfg from "./config.js";
import { all, kvGet, kvSet, one, query } from "./db.js";
const log = (...a) => console.log("[aurix.landings_verif]", ...a);
const VERIF_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2h
const DELAY_BETWEEN_ENTRIES_MS = 1500;
const LIVE_EDIT_THROTTLE_MS = 1200;
const PUBLIC_API_BASE = String(process.env.PUBLIC_API_BASE || process.env.RENDER_EXTERNAL_URL || "https://lunalive-api.onrender.com").replace(/\/$/, "");
// Hosts ou nos landings peuvent etre publiees (LunaLive + Landaurax).
const LANDING_HOSTS = [
    "lunalive.win",
    "www.lunalive.win",
    "lunalive.onrender.com",
    "landaurax.com",
    "www.landaurax.com",
    "landaurax.onrender.com",
];
function domainFromHost(host) {
    return host.toLowerCase().includes("landaurax") ? "landaurax" : "lunalive";
}
export const LANDING_VERIF_REFRESH_CID = "landing-verif:refresh";
const LANDING_VERIF_ALLOWED_USERS = new Set(["fabiozsis", "samyzsis", "lecasinoze"]);
const LANDING_VERIF_ALLOWED_USER_IDS = new Set([
    "682472610868887567",
    "406965568755728395",
    "992099046472831066",
]);
let activeRunPromise = null;
let liveRunState = null;
let lastBoardEditAt = 0;
let pendingBoardRefreshClient = null;
let pendingBoardRefreshTimer = null;
// Source de verite: Google Sheet publiee en CSV.
// URL override-able via env var AURIX_LANDINGS_SHEET_URL.
const DEFAULT_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQq-1sqseX8RluzBT1xAAGiosPZnu-BPoGJwuRQtEobvBLPc7ZCpYKGzkeIKYBrKw/pub?gid=1280662854&single=true&output=csv";
function sheetUrl() {
    return (process.env.AURIX_LANDINGS_SHEET_URL || "").trim() || DEFAULT_SHEET_URL;
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
function emptyCounts() {
    return {
        ok: 0,
        sheet_missing: 0,
        page_unreachable: 0,
        taap_unreachable: 0,
        taap_off_domain: 0,
        taap_mismatch: 0,
        landing_missing: 0,
        celsius_changed: 0,
    };
}
function stepBadge(step) {
    if (step === "ok")
        return "✅";
    if (step === "error")
        return "❌";
    if (step === "skipped")
        return "N/A";
    if (step === "running")
        return "*en cours*";
    return "—";
}
// CSV parser robuste : gere les quoted fields, les newlines dans les quotes
// et les escaped quotes ("").
function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                }
                else {
                    inQuotes = false;
                }
            }
            else {
                field += c;
            }
        }
        else {
            if (c === '"') {
                inQuotes = true;
            }
            else if (c === ",") {
                row.push(field);
                field = "";
            }
            else if (c === "\n" || c === "\r") {
                if (c === "\r" && text[i + 1] === "\n")
                    i++;
                row.push(field);
                rows.push(row);
                row = [];
                field = "";
            }
            else {
                field += c;
            }
        }
    }
    if (field !== "" || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    return rows;
}
const RE_CELSIUS = /^https?:\/\/celsius\.games\/[A-Za-z0-9_-]+\/?$/i;
const RE_TAAP = /^https?:\/\/taap\.it\/[A-Za-z0-9_-]+\/?$/i;
const BAD_MARKERS = /(pas\s*actif|prison|inactif|inactive)/i;
function normalizePageSlug(slug) {
    const value = String(slug || "").trim().toLowerCase();
    return value || null;
}
function normalizeCelsiusUrl(url) {
    const raw = String(url || "").trim();
    if (!raw || !RE_CELSIUS.test(raw))
        return null;
    try {
        const u = new URL(raw);
        const parts = u.pathname.split("/").filter(Boolean);
        if (parts.length === 0)
            return null;
        return `https://celsius.games/${parts[parts.length - 1].toLowerCase()}`;
    }
    catch {
        return null;
    }
}
function normalizeTaapUrl(url) {
    const raw = String(url || "").trim();
    if (!raw || !RE_TAAP.test(raw))
        return null;
    try {
        const u = new URL(raw);
        const parts = u.pathname.split("/").filter(Boolean);
        if (parts.length === 0)
            return null;
        return `https://taap.it/${parts[parts.length - 1]}`;
    }
    catch {
        return null;
    }
}
function hasInactiveMarker(row) {
    return row.some((cell, idx) => {
        const text = String(cell || "").trim();
        if (!text)
            return false;
        if (idx === 2 && normalizeCelsiusUrl(text))
            return false;
        if (idx === 3 && normalizeTaapUrl(text))
            return false;
        return BAD_MARKERS.test(text);
    });
}
function extractAffiLinkFromConfig(config) {
    if (!config || typeof config !== "object")
        return null;
    const cfg = config;
    const direct = typeof cfg.affiLink === "string" ? cfg.affiLink.trim() : "";
    if (direct)
        return direct;
    const rawInputs = cfg.__v3Inputs;
    if (!rawInputs || typeof rawInputs !== "object")
        return null;
    const nested = rawInputs.affiLink;
    return typeof nested === "string" && nested.trim().length > 0 ? nested.trim() : null;
}
function extractRefsFromCsv(text) {
    const rows = parseCsv(text);
    if (rows.length === 0)
        return [];
    const refs = [];
    for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const pseudo = (r[1] ?? "").trim();
        const celsiusUrl = normalizeCelsiusUrl(r[2] ?? "");
        const taapUrl = normalizeTaapUrl(r[3] ?? "");
        if (!pseudo || !celsiusUrl)
            continue;
        if (hasInactiveMarker(r))
            continue;
        refs.push({ pseudo, celsiusUrl, taapUrl });
    }
    return refs;
}
export async function fetchSheetRefs() {
    const url = sheetUrl();
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 15_000);
    try {
        const r = await fetch(url, { redirect: "follow", signal: ctrl.signal });
        if (!r.ok)
            throw new Error(`HTTP ${r.status}`);
        const text = await r.text();
        return extractRefsFromCsv(text);
    }
    finally {
        clearTimeout(to);
    }
}
/**
 * Synchronise aurix_landing_verif_refs avec les pages V3 corrélées à la sheet:
 *  - source = pages marquées V3 en base
 *  - corrélation = affiLink de la page <-> lien Celsius de la sheet
 *  - taap.it est optionnel et n'est plus la clef
 *  - Retourne {added, updated, deleted, total}
 */
export async function syncRefsFromSheet() {
    let sheetRefs;
    try {
        sheetRefs = await fetchSheetRefs();
    }
    catch (e) {
        log("syncRefsFromSheet fetch failed:", e);
        return { added: 0, updated: 0, deleted: 0, total: 0 };
    }
    const pages = await all(`SELECT slug,
            COALESCE(config::jsonb -> '__v3Inputs' ->> 'pseudo', brand_name, title, slug) AS pseudo,
            COALESCE(config::jsonb ->> 'affiLink', config::jsonb -> '__v3Inputs' ->> 'affiLink') AS affi_link,
            publish_domain
       FROM affi_landing_pages
      WHERE config::jsonb ? '__v3'
      ORDER BY updated_at DESC NULLS LAST, id DESC`);
    const v3Pages = [];
    const seenSlugs = new Set();
    for (const page of pages) {
        const slug = normalizePageSlug(page.slug);
        const normalizedCelsiusUrl = normalizeCelsiusUrl(page.affi_link);
        if (!slug || !normalizedCelsiusUrl || seenSlugs.has(slug))
            continue;
        seenSlugs.add(slug);
        v3Pages.push({
            pseudo: String(page.pseudo || slug).trim() || slug,
            slug,
            publishDomain: page.publish_domain === "landaurax" ? "landaurax" : "lunalive",
            affiLink: String(page.affi_link || "").trim(),
            normalizedCelsiusUrl,
        });
    }
    const sheetByCelsius = new Map();
    for (const ref of sheetRefs) {
        const bucket = sheetByCelsius.get(ref.celsiusUrl) ?? [];
        bucket.push(ref);
        sheetByCelsius.set(ref.celsiusUrl, bucket);
    }
    const desiredRefs = v3Pages.map((page) => {
        const sheetMatch = sheetByCelsius.get(page.normalizedCelsiusUrl)?.[0] ?? null;
        return {
            pseudo: sheetMatch?.pseudo || page.pseudo,
            taapUrl: sheetMatch?.taapUrl ?? null,
            expectedCelsiusUrl: sheetMatch?.celsiusUrl || page.normalizedCelsiusUrl,
            pageSlug: page.slug,
            pagePublishDomain: page.publishDomain,
            sheetMatched: Boolean(sheetMatch),
        };
    });
    const existing = await all(`SELECT id, page_slug, pseudo, taap_url, expected_celsius_url, page_publish_domain, sheet_matched
       FROM aurix_landing_verif_refs`);
    const existingBySlug = new Map(existing
        .map((ref) => {
        const slug = normalizePageSlug(ref.page_slug);
        return slug ? [slug, ref] : null;
    })
        .filter((entry) => entry !== null));
    const desiredSlugs = new Set(desiredRefs.map((ref) => ref.pageSlug));
    let added = 0;
    let updated = 0;
    for (const ref of desiredRefs) {
        const e = existingBySlug.get(ref.pageSlug);
        if (!e) {
            await query(`INSERT INTO aurix_landing_verif_refs(
            pseudo, taap_url, expected_celsius_url, page_slug, page_publish_domain, sheet_matched
          )
         VALUES($1,$2,$3,$4,$5,$6)`, [ref.pseudo, ref.taapUrl, ref.expectedCelsiusUrl, ref.pageSlug, ref.pagePublishDomain, ref.sheetMatched]);
            added++;
        }
        else if (e.pseudo !== ref.pseudo ||
            (e.taap_url ?? null) !== ref.taapUrl ||
            e.expected_celsius_url !== ref.expectedCelsiusUrl ||
            (e.page_publish_domain === "landaurax" ? "landaurax" : "lunalive") !== ref.pagePublishDomain ||
            Boolean(e.sheet_matched) !== ref.sheetMatched) {
            await query(`UPDATE aurix_landing_verif_refs
            SET pseudo=$1,
                taap_url=$2,
                expected_celsius_url=$3,
                page_publish_domain=$4,
                sheet_matched=$5
          WHERE id=$6`, [ref.pseudo, ref.taapUrl, ref.expectedCelsiusUrl, ref.pagePublishDomain, ref.sheetMatched, e.id]);
            updated++;
        }
    }
    const orphans = existing.filter((ref) => {
        const slug = normalizePageSlug(ref.page_slug);
        return !slug || !desiredSlugs.has(slug);
    });
    let deleted = 0;
    for (const o of orphans) {
        await query("DELETE FROM aurix_landing_verif_refs WHERE id=$1", [o.id]);
        deleted++;
    }
    log(`Landing sync: pages=${v3Pages.length} matched=${desiredRefs.filter((ref) => ref.sheetMatched).length} added=${added} updated=${updated} deleted=${deleted}`);
    return { added, updated, deleted, total: desiredRefs.length };
}
/** Compat: ancien nom, redirige vers syncRefsFromSheet. */
export async function seedRefsIfEmpty() {
    await syncRefsFromSheet();
}
function extractSlugFromUrl(url) {
    try {
        const u = new URL(url);
        // Strip trailing slash, take last non-empty segment.
        const parts = u.pathname.split("/").filter(Boolean);
        return parts.length ? parts[parts.length - 1] : null;
    }
    catch {
        return null;
    }
}
function hostMatchesLanding(url) {
    try {
        const h = new URL(url).hostname.toLowerCase();
        return LANDING_HOSTS.includes(h);
    }
    catch {
        return false;
    }
}
async function resolveTaap(taapUrl) {
    try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 10_000);
        const r = await fetch(taapUrl, {
            redirect: "follow",
            signal: ctrl.signal,
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
        }).finally(() => clearTimeout(to));
        if (!r.ok)
            return { ok: false, reason: `taap.it HTTP ${r.status} (lien cassé / inexistant ?)` };
        // Si redirect HTTP a quitte taap.it, on a deja la final URL.
        try {
            const u = new URL(r.url);
            if (!u.hostname.toLowerCase().includes("taap.it")) {
                return { ok: true, finalUrl: r.url };
            }
        }
        catch {
            /* ignore */
        }
        // Sinon, taap.it sert un HTML avec redirect JS. On parse `var finalLink = "..."`
        // (et fallback sur `fallbackUrl` si finalLink absent).
        const body = await r.text();
        const finalMatch = body.match(/(?:var\s+finalLink|finalLink)\s*=\s*["']([^"']+)["']/);
        if (finalMatch && finalMatch[1]) {
            return { ok: true, finalUrl: finalMatch[1] };
        }
        const fbMatch = body.match(/(?:var\s+fallbackUrl|fallbackUrl)\s*=\s*["']([^"']+)["']/);
        if (fbMatch && fbMatch[1]) {
            return { ok: true, finalUrl: fbMatch[1] };
        }
        // Meta-refresh classique en backup.
        const metaMatch = body.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]+url=([^"'>\s]+)/i);
        if (metaMatch && metaMatch[1]) {
            return { ok: true, finalUrl: metaMatch[1] };
        }
        return { ok: false, reason: "taap.it: finalLink introuvable dans le HTML" };
    }
    catch (e) {
        return { ok: false, reason: `network: ${String(e).slice(0, 100)}` };
    }
}
async function findLandingBySlug(slug) {
    const row = await one(`SELECT slug,
            config::jsonb ->> 'affiLink' AS "affiLink",
            publish_domain
       FROM affi_landing_pages WHERE slug=$1 LIMIT 1`, [slug]);
    if (!row)
        return null;
    const pd = row.publish_domain === "landaurax" ? "landaurax" : "lunalive";
    return { slug: row.slug, affiLink: row.affiLink, publishDomain: pd };
}
async function verifyOneRef(ref, onProgress) {
    // 1. Resolve taap.it
    const taap = await resolveTaap(ref.taap_url || "");
    if (!taap.ok) {
        onProgress?.({ type: "taap_error", reason: taap.reason ?? "taap.it injoignable" });
        return {
            status: "taap_unreachable",
            details: taap.reason ?? "taap.it injoignable",
            taapDest: null,
            landingSlug: null,
            dbAffiLink: null,
            publishDomain: null,
        };
    }
    const finalUrl = taap.finalUrl;
    onProgress?.({ type: "taap_ok" });
    // 2. Check domain
    if (!hostMatchesLanding(finalUrl)) {
        onProgress?.({
            type: "landing_error",
            reason: `redirige vers ${new URL(finalUrl).hostname} (hors hosts autorises)`,
        });
        return {
            status: "taap_off_domain",
            details: `redirige vers ${new URL(finalUrl).hostname} (hors hosts autorises)`,
            taapDest: finalUrl,
            landingSlug: null,
            dbAffiLink: null,
            publishDomain: null,
        };
    }
    // Domaine deduit du host taap final (utile en cas de landing manquante en DB).
    const taapDomain = (() => {
        try {
            return domainFromHost(new URL(finalUrl).hostname);
        }
        catch {
            return "lunalive";
        }
    })();
    // 3. Extract slug, lookup DB
    const slug = extractSlugFromUrl(finalUrl);
    if (!slug) {
        onProgress?.({
            type: "landing_error",
            reason: `slug introuvable dans l'URL finale (${finalUrl})`,
        });
        return {
            status: "landing_missing",
            details: `slug introuvable dans l'URL finale (${finalUrl})`,
            taapDest: finalUrl,
            landingSlug: null,
            dbAffiLink: null,
            publishDomain: taapDomain,
        };
    }
    const landing = await findLandingBySlug(slug);
    if (!landing) {
        onProgress?.({
            type: "landing_error",
            reason: `landing absente en DB (slug=${slug})`,
        });
        return {
            status: "landing_missing",
            details: `landing absente en DB (slug=${slug})`,
            taapDest: finalUrl,
            landingSlug: slug,
            dbAffiLink: null,
            publishDomain: taapDomain,
        };
    }
    onProgress?.({ type: "landing_ok" });
    // 4. Compare DB.affiLink vs expected_celsius_url
    const dbAffi = landing.affiLink ?? "";
    const expected = ref.expected_celsius_url;
    // Comparaison case-insensitive sur le slug celsius (le slug peut etre
    // mixed-case, on tolere les variations).
    if (dbAffi && dbAffi.toLowerCase() === expected.toLowerCase()) {
        onProgress?.({ type: "affi_ok" });
        return {
            status: "ok",
            details: "taap → landing OK · DB.affiLink == attendu",
            taapDest: finalUrl,
            landingSlug: slug,
            dbAffiLink: dbAffi,
            publishDomain: landing.publishDomain,
        };
    }
    onProgress?.({
        type: "affi_error",
        reason: `DB.affiLink = "${dbAffi}" ≠ attendu "${expected}"`,
    });
    return {
        status: "celsius_changed",
        details: `DB.affiLink = "${dbAffi}" ≠ attendu "${expected}"`,
        taapDest: finalUrl,
        landingSlug: slug,
        dbAffiLink: dbAffi,
        publishDomain: landing.publishDomain,
    };
}
async function fetchLandingPublicStatus(url) {
    try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 10_000);
        const r = await fetch(url, {
            redirect: "follow",
            signal: ctrl.signal,
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
        }).finally(() => clearTimeout(to));
        if (!r.ok) {
            const contentType = (r.headers.get("content-type") || "").toLowerCase();
            if (contentType.includes("text/html")) {
                const html = await r.text().catch(() => "");
                // Render peut servir la SPA de landing avec un status 404 tout en
                // laissant le navigateur afficher correctement la page publiee.
                // Dans ce cas, on laisse l'etape API publique trancher sur l'existence
                // reelle du slug au lieu de classer la landing en faux negatif ici.
                if (html.includes("/api/public/affi-pages/"))
                    return { ok: true };
            }
            return { ok: false, reason: `landing HTTP ${r.status}` };
        }
        return { ok: true };
    }
    catch (e) {
        return { ok: false, reason: `landing network: ${String(e).slice(0, 120)}` };
    }
}
async function fetchPublicLandingPage(slug) {
    try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 10_000);
        const r = await fetch(`${PUBLIC_API_BASE}/api/public/affi-pages/${encodeURIComponent(slug)}`, {
            redirect: "follow",
            signal: ctrl.signal,
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
        }).finally(() => clearTimeout(to));
        if (!r.ok)
            return { ok: false, reason: `API landing HTTP ${r.status}` };
        const data = await r.json().catch(() => null);
        if (!data?.ok || !data.page)
            return { ok: false, reason: "API landing: page absente ou payload invalide" };
        return {
            ok: true,
            affiLink: extractAffiLinkFromConfig(data.page.config),
            publishDomain: data.page.publishDomain === "landaurax" ? "landaurax" : "lunalive",
        };
    }
    catch (e) {
        return { ok: false, reason: `API landing network: ${String(e).slice(0, 120)}` };
    }
}
function taapTargetsExpectedLanding(finalUrl, expectedSlug, expectedDomain) {
    try {
        const slug = normalizePageSlug(extractSlugFromUrl(finalUrl));
        if (!slug || slug !== expectedSlug)
            return false;
        return domainFromHost(new URL(finalUrl).hostname) === expectedDomain;
    }
    catch {
        return false;
    }
}
async function verifyOneRefV2(ref, onProgress) {
    const pageSlug = normalizePageSlug(ref.page_slug);
    const pageDomain = ref.page_publish_domain === "landaurax" ? "landaurax" : ref.page_publish_domain === "lunalive" ? "lunalive" : null;
    const expected = normalizeCelsiusUrl(ref.expected_celsius_url) || ref.expected_celsius_url.trim();
    if (!pageSlug || !pageDomain) {
        const reason = "page V3 invalide en DB (slug ou domaine manquant)";
        onProgress?.({ type: "skip_all", reason });
        return {
            status: "page_unreachable",
            details: reason,
            taapDest: null,
            landingSlug: pageSlug,
            dbAffiLink: null,
            publishDomain: pageDomain,
        };
    }
    if (!ref.sheet_matched) {
        const reason = "aucune ligne Google Sheet ne correspond au lien Celsius de cette page";
        onProgress?.({ type: "skip_all", reason });
        return {
            status: "sheet_missing",
            details: reason,
            taapDest: null,
            landingSlug: pageSlug,
            dbAffiLink: ref.expected_celsius_url,
            publishDomain: pageDomain,
        };
    }
    let taapDest = null;
    if (ref.taap_url) {
        const taap = await resolveTaap(ref.taap_url);
        if (!taap.ok) {
            onProgress?.({ type: "taap_error", reason: taap.reason ?? "taap.it injoignable" });
            return {
                status: "taap_unreachable",
                details: taap.reason ?? "taap.it injoignable",
                taapDest: null,
                landingSlug: pageSlug,
                dbAffiLink: null,
                publishDomain: pageDomain,
            };
        }
        taapDest = taap.finalUrl ?? null;
        onProgress?.({ type: "taap_ok" });
        if (!taapDest || !hostMatchesLanding(taapDest)) {
            const host = taapDest ? new URL(taapDest).hostname : "inconnu";
            const reason = `taap.it redirige vers ${host} (hors hosts autorises)`;
            onProgress?.({ type: "landing_error", reason });
            return {
                status: "taap_off_domain",
                details: reason,
                taapDest,
                landingSlug: pageSlug,
                dbAffiLink: null,
                publishDomain: pageDomain,
            };
        }
        if (!taapTargetsExpectedLanding(taapDest, pageSlug, pageDomain)) {
            const expectedUrl = landingUrl(pageSlug, pageDomain);
            const reason = `taap.it redirige vers ${taapDest} au lieu de ${expectedUrl}`;
            onProgress?.({ type: "landing_error", reason });
            return {
                status: "taap_mismatch",
                details: reason,
                taapDest,
                landingSlug: pageSlug,
                dbAffiLink: null,
                publishDomain: pageDomain,
            };
        }
    }
    else {
        onProgress?.({ type: "taap_skipped" });
    }
    const publicUrl = landingUrl(pageSlug, pageDomain);
    if (!publicUrl) {
        const reason = "URL publique introuvable pour cette landing";
        onProgress?.({ type: "landing_error", reason });
        return {
            status: "page_unreachable",
            details: reason,
            taapDest,
            landingSlug: pageSlug,
            dbAffiLink: null,
            publishDomain: pageDomain,
        };
    }
    const landingStatus = await fetchLandingPublicStatus(publicUrl);
    if (!landingStatus.ok) {
        const reason = landingStatus.reason ?? "landing publique injoignable";
        onProgress?.({ type: "landing_error", reason });
        return {
            status: "page_unreachable",
            details: reason,
            taapDest,
            landingSlug: pageSlug,
            dbAffiLink: null,
            publishDomain: pageDomain,
        };
    }
    const publicPage = await fetchPublicLandingPage(pageSlug);
    if (!publicPage.ok) {
        const reason = publicPage.reason ?? "API publique de landing injoignable";
        onProgress?.({ type: "landing_error", reason });
        return {
            status: "page_unreachable",
            details: reason,
            taapDest,
            landingSlug: pageSlug,
            dbAffiLink: null,
            publishDomain: pageDomain,
        };
    }
    if (publicPage.publishDomain !== pageDomain) {
        const reason = `publishDomain public = "${publicPage.publishDomain}" au lieu de "${pageDomain}"`;
        onProgress?.({ type: "landing_error", reason });
        return {
            status: "page_unreachable",
            details: reason,
            taapDest,
            landingSlug: pageSlug,
            dbAffiLink: publicPage.affiLink ?? null,
            publishDomain: publicPage.publishDomain ?? pageDomain,
        };
    }
    onProgress?.({ type: "landing_ok" });
    const publicAffi = publicPage.affiLink ?? "";
    const normalizedPublicAffi = normalizeCelsiusUrl(publicAffi);
    if (normalizedPublicAffi && normalizedPublicAffi === expected) {
        onProgress?.({ type: "affi_ok" });
        return {
            status: "ok",
            details: ref.taap_url ? "taap.it, landing et affi OK" : "landing et affi OK (taap non renseigne)",
            taapDest,
            landingSlug: pageSlug,
            dbAffiLink: publicAffi,
            publishDomain: pageDomain,
        };
    }
    const reason = publicAffi
        ? `page.affiLink = "${publicAffi}" ≠ attendu "${ref.expected_celsius_url}"`
        : "page publique sans affiLink exploitable";
    onProgress?.({ type: "affi_error", reason });
    return {
        status: "celsius_changed",
        details: reason,
        taapDest,
        landingSlug: pageSlug,
        dbAffiLink: publicAffi || null,
        publishDomain: pageDomain,
    };
}
function updateLiveRunState(mutator) {
    if (!liveRunState)
        return;
    mutator(liveRunState);
}
async function flushBoardRefresh(client) {
    lastBoardEditAt = Date.now();
    pendingBoardRefreshClient = null;
    pendingBoardRefreshTimer = null;
    const guild = await resolveVerifGuild(client);
    if (!guild)
        return;
    await ensureVerifBoard(guild);
}
function queueBoardRefresh(client, force = false) {
    pendingBoardRefreshClient = client;
    if (force) {
        if (pendingBoardRefreshTimer) {
            clearTimeout(pendingBoardRefreshTimer);
            pendingBoardRefreshTimer = null;
        }
        void flushBoardRefresh(client);
        return;
    }
    const elapsed = Date.now() - lastBoardEditAt;
    if (elapsed >= LIVE_EDIT_THROTTLE_MS) {
        void flushBoardRefresh(client);
        return;
    }
    if (pendingBoardRefreshTimer)
        return;
    pendingBoardRefreshTimer = setTimeout(() => {
        const nextClient = pendingBoardRefreshClient;
        if (!nextClient) {
            pendingBoardRefreshTimer = null;
            return;
        }
        void flushBoardRefresh(nextClient);
    }, LIVE_EDIT_THROTTLE_MS - elapsed);
}
function applyLiveProgress(event) {
    updateLiveRunState((state) => {
        if (event.type === "taap_ok") {
            state.taap = "ok";
            state.landing = "running";
            state.note = null;
            return;
        }
        if (event.type === "taap_skipped") {
            state.taap = "skipped";
            state.landing = "running";
            state.note = null;
            return;
        }
        if (event.type === "taap_error") {
            state.taap = "error";
            state.landing = "idle";
            state.affi = "idle";
            state.note = event.reason;
            return;
        }
        if (event.type === "landing_ok") {
            state.landing = "ok";
            state.affi = "running";
            state.note = null;
            return;
        }
        if (event.type === "landing_error") {
            state.landing = "error";
            state.affi = "idle";
            state.note = event.reason;
            return;
        }
        if (event.type === "affi_ok") {
            state.affi = "ok";
            state.note = null;
            return;
        }
        if (event.type === "skip_all") {
            state.taap = "skipped";
            state.landing = "skipped";
            state.affi = "skipped";
            state.note = event.reason;
            return;
        }
        state.affi = "error";
        state.note = event.reason;
    });
}
export async function verifyAllRefs(client) {
    const refs = await all("SELECT * FROM aurix_landing_verif_refs ORDER BY id ASC");
    const counts = emptyCounts();
    updateLiveRunState((state) => {
        state.phase = "verifying";
        state.total = refs.length;
        state.processed = 0;
        state.counts = emptyCounts();
        state.currentPseudo = null;
        state.taap = "idle";
        state.landing = "idle";
        state.affi = "idle";
        state.note = refs.length === 0 ? "Aucune landing référencée." : "Préparation de la passe…";
    });
    if (client)
        queueBoardRefresh(client, true);
    for (const ref of refs) {
        updateLiveRunState((state) => {
            state.currentPseudo = ref.pseudo;
            state.taap = "running";
            state.landing = "idle";
            state.affi = "idle";
            state.note = null;
        });
        if (client)
            queueBoardRefresh(client);
        try {
            const r = await verifyOneRefV2(ref, (event) => {
                applyLiveProgress(event);
                if (client)
                    queueBoardRefresh(client);
            });
            counts[r.status]++;
            await query(`UPDATE aurix_landing_verif_refs
           SET last_check_at=NOW(), last_status=$1, last_details=$2,
               last_taap_destination=$3, last_landing_slug=$4, last_db_affi_link=$5,
               last_publish_domain=$6
         WHERE id=$7`, [r.status, r.details, r.taapDest, r.landingSlug, r.dbAffiLink, r.publishDomain, ref.id]);
            updateLiveRunState((state) => {
                state.processed++;
                state.counts[r.status]++;
                state.note = r.details;
            });
        }
        catch (e) {
            const message = String(e);
            log(`verify ref #${ref.id} (${ref.pseudo}) failed:`, e);
            updateLiveRunState((state) => {
                state.processed++;
                state.note = message.slice(0, 180);
            });
        }
        if (client)
            queueBoardRefresh(client);
        await sleep(DELAY_BETWEEN_ENTRIES_MS);
    }
    updateLiveRunState((state) => {
        state.phase = "done";
        state.currentPseudo = null;
        state.taap = "idle";
        state.landing = "idle";
        state.affi = "idle";
        state.note = null;
    });
    if (client)
        queueBoardRefresh(client, true);
    return { total: refs.length, counts };
}
// ─────────── Discord channel + sticky embed ───────────
async function getVerifChannel(guild) {
    const id = await kvGet("channel_landing_verif_id");
    if (!id)
        return null;
    const ch = guild.channels.cache.get(id);
    if (!ch || ch.type !== ChannelType.GuildText)
        return null;
    return ch;
}
function statusBadge(s) {
    if (s === "ok")
        return "✅";
    if (s === "celsius_changed")
        return "🟡";
    if (s === "landing_missing")
        return "🔴";
    if (s === "taap_off_domain")
        return "🔴";
    if (s === "taap_unreachable")
        return "⚠️";
    return "⚪";
}
function fmtTime(d) {
    if (!d)
        return "—";
    const t = new Date(d);
    return (String(t.getHours()).padStart(2, "0") +
        ":" +
        String(t.getMinutes()).padStart(2, "0"));
}
function fmtDate(d) {
    if (!d)
        return "—";
    const t = new Date(d);
    return (String(t.getDate()).padStart(2, "0") +
        "/" +
        String(t.getMonth() + 1).padStart(2, "0") +
        " " +
        fmtTime(d));
}
function landingUrl(slug, domain) {
    if (!slug)
        return null;
    if (domain === "landaurax")
        return `https://landaurax.onrender.com/${slug}`;
    return `https://lunalive.win/r/${slug}`;
}
function domainBadge(domain) {
    if (domain === "landaurax")
        return "🌹";
    if (domain === "lunalive")
        return "🟣";
    return "·";
}
function buildEmbed(refs, live) {
    const counts = {
        ok: 0,
        celsius_changed: 0,
        landing_missing: 0,
        taap_off_domain: 0,
        taap_unreachable: 0,
        unchecked: 0,
    };
    for (const r of refs) {
        const key = r.last_status ?? "unchecked";
        counts[key] = (counts[key] ?? 0) + 1;
    }
    const lastCheck = refs.reduce((acc, r) => {
        if (!r.last_check_at)
            return acc;
        const d = new Date(r.last_check_at);
        return acc && acc > d ? acc : d;
    }, null);
    const domLuna = refs.filter((r) => r.last_publish_domain === "lunalive").length;
    const domLandaurax = refs.filter((r) => r.last_publish_domain === "landaurax").length;
    const summaryLines = [
        `**${refs.length}** landings suivies · *dernière passe : ${fmtDate(lastCheck)}*`,
        `✅ \`${counts.ok}\`  ·  🟡 \`${counts.celsius_changed}\`  ·  🔴 \`${counts.landing_missing + counts.taap_off_domain}\`  ·  ⚠️ \`${counts.taap_unreachable}\`  ·  ⚪ \`${counts.unchecked}\``,
        `🟣 LunaLive \`${domLuna}\`  ·  🌹 Landaurax \`${domLandaurax}\``,
    ];
    const liveLines = [];
    if (live) {
        if (live.phase === "syncing_sheet") {
            liveLines.push(`🔄 Vérification ${live.source === "manual" ? "manuelle" : "auto"} en cours · synchronisation de la sheet Google…`);
        }
        else if (live.phase === "verifying") {
            const totalLabel = live.total > 0 ? `${live.processed}/${live.total}` : "0/0";
            liveLines.push(`🔄 Vérification ${live.source === "manual" ? "manuelle" : "auto"} en cours · \`${totalLabel}\` traitées`);
            if (live.currentPseudo) {
                liveLines.push(`**${live.currentPseudo}** en cours : Taap.it : ${stepBadge(live.taap)} / Landing : ${stepBadge(live.landing)} / Affi : ${stepBadge(live.affi)}`);
            }
            liveLines.push(`Passe actuelle : ✅ \`${live.counts.ok}\` · 🟡 \`${live.counts.celsius_changed}\` · 🔴 \`${live.counts.landing_missing + live.counts.taap_off_domain}\` · ⚠️ \`${live.counts.taap_unreachable}\``);
        }
        if (live.note) {
            liveLines.push(`*${live.note}*`);
        }
    }
    const summary = [...liveLines, ...summaryLines].join("\n");
    const embed = new EmbedBuilder()
        .setTitle("🔎  Landing Verif")
        .setDescription(summary)
        .setColor(cfg.COLOR.PRIMARY)
        .setFooter({
        text: live
            ? `${cfg.BRAND.NAME} • Vérification automatique toutes les 2h • mise à jour en direct`
            : `${cfg.BRAND.NAME} • Vérification automatique toutes les 2h`,
    });
    // Lignes compactes, regroupees par section status.
    const order = [
        { key: "issues", label: "Problèmes (à traiter)", rows: refs.filter((r) => r.last_status && r.last_status !== "ok") },
        { key: "ok", label: `Tout OK (${counts.ok})`, rows: refs.filter((r) => r.last_status === "ok") },
        { key: "unchecked", label: "Pas encore vérifiées", rows: refs.filter((r) => !r.last_status) },
    ];
    for (const sec of order) {
        if (sec.rows.length === 0)
            continue;
        const lines = sec.rows.map((r) => {
            const badge = statusBadge(r.last_status);
            const dom = domainBadge(r.last_publish_domain);
            const lUrl = landingUrl(r.last_landing_slug, r.last_publish_domain);
            const linksParts = [];
            linksParts.push(`[taap](${r.taap_url})`);
            if (lUrl)
                linksParts.push(`[landing](${lUrl})`);
            linksParts.push(`[affi](${r.expected_celsius_url})`);
            const issueSuffix = r.last_status && r.last_status !== "ok" && r.last_details ? ` — *${r.last_details}*` : "";
            return `${badge}${dom} **${r.pseudo}** · ${fmtTime(r.last_check_at)} · ${linksParts.join(" · ")}${issueSuffix}`;
        });
        // Split en sous-fields de <=1024 chars.
        const chunks = [];
        let cur = "";
        for (const ln of lines) {
            const next = cur ? `${cur}\n${ln}` : ln;
            if (next.length > 1000) {
                chunks.push(cur);
                cur = ln;
            }
            else {
                cur = next;
            }
        }
        if (cur)
            chunks.push(cur);
        chunks.forEach((c, i) => {
            embed.addFields({
                name: i === 0 ? sec.label : "​",
                value: c,
            });
        });
    }
    if (refs.length === 0) {
        embed.addFields({ name: "​", value: "*Aucune landing référencée.*" });
    }
    return embed;
}
function statusBadgeV2(status) {
    if (status === "ok")
        return "✅";
    if (status === "celsius_changed")
        return "🟡";
    if (status === "sheet_missing")
        return "🟠";
    if (status === "page_unreachable")
        return "🔴";
    if (status === "taap_off_domain")
        return "🔴";
    if (status === "taap_mismatch")
        return "🔴";
    if (status === "taap_unreachable")
        return "⚠️";
    return "⚪";
}
const DISCORD_EMBED_SAFE_LIMIT = 5600;
const DISCORD_FIELD_SAFE_LIMIT = 900;
function truncateText(value, max) {
    if (value.length <= max)
        return value;
    return `${value.slice(0, Math.max(0, max - 1))}…`;
}
function buildEmbedV2(refs, live) {
    const counts = {
        ok: 0,
        celsius_changed: 0,
        sheet_missing: 0,
        page_unreachable: 0,
        taap_off_domain: 0,
        taap_mismatch: 0,
        taap_unreachable: 0,
        landing_missing: 0,
        unchecked: 0,
    };
    for (const ref of refs) {
        const key = ref.last_status ?? "unchecked";
        counts[key] = (counts[key] ?? 0) + 1;
    }
    const lastCheck = refs.reduce((acc, ref) => {
        if (!ref.last_check_at)
            return acc;
        const d = new Date(ref.last_check_at);
        return acc && acc > d ? acc : d;
    }, null);
    const domLuna = refs.filter((ref) => (ref.page_publish_domain ?? ref.last_publish_domain) === "lunalive").length;
    const domLandaurax = refs.filter((ref) => (ref.page_publish_domain ?? ref.last_publish_domain) === "landaurax").length;
    const redCount = counts.sheet_missing + counts.page_unreachable + counts.taap_off_domain + counts.taap_mismatch + counts.landing_missing;
    const summaryLines = [
        `**${refs.length}** landings suivies · *dernière passe : ${fmtDate(lastCheck)}*`,
        `✅ \`${counts.ok}\`  ·  🟡 \`${counts.celsius_changed}\`  ·  🔴 \`${redCount}\`  ·  ⚠️ \`${counts.taap_unreachable}\`  ·  ⚪ \`${counts.unchecked}\``,
        `🟣 LunaLive \`${domLuna}\`  ·  🌹 Landaurax \`${domLandaurax}\``,
    ];
    const liveLines = [];
    if (live) {
        if (live.phase === "syncing_sheet") {
            liveLines.push(`🔄 Vérification ${live.source === "manual" ? "manuelle" : "auto"} en cours · synchronisation V3 + sheet…`);
        }
        else if (live.phase === "verifying") {
            const totalLabel = live.total > 0 ? `${live.processed}/${live.total}` : "0/0";
            liveLines.push(`🔄 Vérification ${live.source === "manual" ? "manuelle" : "auto"} en cours · \`${totalLabel}\` traitées`);
            if (live.currentPseudo) {
                liveLines.push(`**${live.currentPseudo}** en cours : Taap.it : ${stepBadge(live.taap)} / Landing : ${stepBadge(live.landing)} / Affi : ${stepBadge(live.affi)}`);
            }
            liveLines.push(`Passe actuelle : ✅ \`${live.counts.ok}\` · 🟡 \`${live.counts.celsius_changed}\` · 🔴 \`${live.counts.sheet_missing + live.counts.page_unreachable + live.counts.taap_off_domain + live.counts.taap_mismatch + live.counts.landing_missing}\` · ⚠️ \`${live.counts.taap_unreachable}\``);
        }
        if (live.note)
            liveLines.push(`*${live.note}*`);
    }
    const embed = new EmbedBuilder()
        .setTitle("🔎  Landing Verif")
        .setDescription([...liveLines, ...summaryLines].join("\n"))
        .setColor(cfg.COLOR.PRIMARY)
        .setFooter({
        text: live
            ? `${cfg.BRAND.NAME} • vérification automatique toutes les 2h • mise à jour en direct`
            : `${cfg.BRAND.NAME} • vérification automatique toutes les 2h`,
    });
    let embedChars = "🔎  Landing Verif".length +
        [...liveLines, ...summaryLines].join("\n").length +
        (live
            ? `${cfg.BRAND.NAME} • vérification automatique toutes les 2h • mise à jour en direct`
            : `${cfg.BRAND.NAME} • vérification automatique toutes les 2h`).length;
    const sections = [
        { label: "Problèmes (à traiter)", rows: refs.filter((ref) => ref.last_status && ref.last_status !== "ok") },
        { label: `Tout OK (${counts.ok})`, rows: refs.filter((ref) => ref.last_status === "ok") },
        { label: "Pas encore vérifiées", rows: refs.filter((ref) => !ref.last_status) },
    ];
    let omittedRows = 0;
    for (const section of sections) {
        if (section.rows.length === 0)
            continue;
        const lines = section.rows.map((ref) => {
            const badge = statusBadgeV2(ref.last_status);
            const dom = domainBadge(ref.page_publish_domain ?? ref.last_publish_domain);
            const landing = landingUrl(ref.page_slug ?? ref.last_landing_slug, ref.page_publish_domain ?? ref.last_publish_domain);
            const links = [];
            if (ref.taap_url)
                links.push(`[taap](${ref.taap_url})`);
            if (landing)
                links.push(`[landing](${landing})`);
            links.push(`[affi](${ref.expected_celsius_url})`);
            const issueSuffix = ref.last_status && ref.last_status !== "ok" && ref.last_details
                ? ` — *${truncateText(ref.last_details, 140)}*`
                : "";
            return `${badge}${dom} **${ref.pseudo}** · ${fmtTime(ref.last_check_at)} · ${links.join(" · ")}${issueSuffix}`;
        });
        const chunks = [];
        let current = "";
        for (const line of lines) {
            const next = current ? `${current}\n${line}` : line;
            if (next.length > DISCORD_FIELD_SAFE_LIMIT) {
                chunks.push(current);
                current = line;
            }
            else {
                current = next;
            }
        }
        if (current)
            chunks.push(current);
        chunks.forEach((value, index) => {
            if (omittedRows > 0)
                return;
            const name = index === 0 ? section.label : "​";
            const nextCost = name.length + value.length;
            if (embedChars + nextCost > DISCORD_EMBED_SAFE_LIMIT) {
                omittedRows = chunks.slice(index).join("\n").split("\n").filter(Boolean).length;
                return;
            }
            embed.addFields({ name, value });
            embedChars += nextCost;
        });
    }
    if (omittedRows > 0) {
        const name = "Liste tronquée";
        const value = `Affichage compact pour rester sous la limite Discord. ${omittedRows} ligne(s) masquée(s) — relance la vérif ou consulte la DB pour le détail complet.`;
        if (embedChars + name.length + value.length <= DISCORD_EMBED_SAFE_LIMIT) {
            embed.addFields({ name, value });
        }
    }
    if (refs.length === 0) {
        embed.addFields({ name: "​", value: "*Aucune landing référencée.*" });
    }
    return embed;
}
function buildVerifBoardComponents(isRunning) {
    const btn = new ButtonBuilder()
        .setCustomId(LANDING_VERIF_REFRESH_CID)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🔄")
        .setLabel(isRunning ? "Vérif en cours…" : "Relancer la vérif");
    if (isRunning)
        btn.setDisabled(true);
    return [new ActionRowBuilder().addComponents(btn)];
}
export async function ensureVerifBoard(guild) {
    const ch = await getVerifChannel(guild);
    if (!ch)
        return;
    const me = guild.members.me;
    if (!me)
        return;
    const refs = await all("SELECT * FROM aurix_landing_verif_refs ORDER BY pseudo ASC");
    const embed = buildEmbedV2(refs, liveRunState);
    const components = buildVerifBoardComponents(Boolean(liveRunState));
    const existingId = await kvGet("landing_verif_message_id");
    if (existingId) {
        try {
            const m = await ch.messages.fetch(existingId);
            if (m.author.id === me.id) {
                await m.edit({ embeds: [embed], components });
                return;
            }
        }
        catch {
            /* deleted, fall through */
        }
    }
    const m = await ch.send({ embeds: [embed], components });
    await kvSet("landing_verif_message_id", m.id);
}
// ─────────── Cron ───────────
let cronTimer = null;
export function startLandingVerifCron(client) {
    if (cronTimer)
        return;
    log("Cron landing verif démarré (toutes les 2h).");
    // Première passe au boot, après 30s pour laisser le bot finir d'init.
    setTimeout(() => {
        void runOnePass(client).catch((e) => log("first pass error:", e));
    }, 30_000);
    cronTimer = setInterval(() => {
        void runOnePass(client).catch((e) => log("cron pass error:", e));
    }, VERIF_INTERVAL_MS);
}
async function resolveVerifGuild(client) {
    // 1) kv 'landing_verif_guild_id' (= guild hote du salon, set par
    //    ensureLandingVerifChannelInGuild apres migration)
    // 2) fallback: AURIX_GUILD_ID puis premier guild du client
    const kvGuildId = (await kvGet("landing_verif_guild_id"))?.trim();
    if (kvGuildId) {
        const g = client.guilds.cache.get(kvGuildId);
        if (g)
            return g;
    }
    const envGuildId = process.env.AURIX_GUILD_ID;
    if (envGuildId) {
        const g = client.guilds.cache.get(envGuildId);
        if (g)
            return g;
    }
    return client.guilds.cache.first();
}
async function runOnePass(client) {
    const r = await ensureLandingCheckRun(client, "auto", true);
    log(`Pass done: ${r.total} refs, counts=${JSON.stringify(r.counts)}`);
}
/**
 * Compare l'etat des problemes courants avec la baseline stockee en kv.
 * Si de nouvelles refs sont passees en non-ok depuis la derniere passe,
 * post un ping @here dans le salon landing-verif avec la liste.
 * Au premier appel (kv vide), pas de ping - on enregistre juste la
 * baseline pour eviter de pinger pour des problemes deja connus.
 */
async function detectAndNotifyNewProblems(guild) {
    const current = await all(`SELECT pseudo, taap_url, last_status, last_details
       FROM aurix_landing_verif_refs
      WHERE last_status IS NOT NULL AND last_status <> 'ok'`);
    const currentTaaps = current.map((c) => c.taap_url).sort();
    const currentJson = JSON.stringify(currentTaaps);
    const previousRaw = await kvGet("landing_verif_known_problems");
    // 1er appel: on baseline, pas de ping (evite de spammer pour des
    // anomalies deja connues).
    if (previousRaw === null) {
        await kvSet("landing_verif_known_problems", currentJson);
        log(`Baseline anomalies enregistree (${currentTaaps.length} entrees).`);
        return;
    }
    let previousSet;
    try {
        const parsed = JSON.parse(previousRaw);
        previousSet = new Set(Array.isArray(parsed) ? parsed : []);
    }
    catch {
        previousSet = new Set();
    }
    const newOnes = current.filter((c) => !previousSet.has(c.taap_url));
    await kvSet("landing_verif_known_problems", currentJson);
    if (newOnes.length === 0)
        return;
    // Post le ping dans le salon.
    const chId = await kvGet("channel_landing_verif_id");
    if (!chId)
        return;
    const ch = guild.channels.cache.get(chId);
    if (!ch || ch.type !== ChannelType.GuildText)
        return;
    const lines = newOnes.map((n) => {
        const tag = n.last_status === "celsius_changed"
            ? "🟡 celsius URL modifiée"
            : n.last_status === "landing_missing"
                ? "🔴 landing manquante"
                : n.last_status === "taap_off_domain"
                    ? "🔴 taap.it détourné"
                    : n.last_status === "taap_unreachable"
                        ? "⚠️ taap.it injoignable / cassé"
                        : `🔴 ${n.last_status}`;
        return `• **${n.pseudo}** — ${tag}${n.last_details ? ` · *${n.last_details}*` : ""}`;
    });
    const plural = newOnes.length > 1 ? "s" : "";
    const content = [
        `@here 🚨 **Nouvelle${plural} anomalie${plural} détectée${plural} sur les landings**`,
        "",
        ...lines,
    ].join("\n");
    try {
        await ch.send({
            content,
            allowedMentions: { parse: ["everyone"] },
        });
        log(`Ping anomalie poste pour ${newOnes.length} ref(s) nouvelle(s).`);
    }
    catch (e) {
        log("Ping anomalie failed:", e);
    }
}
async function detectAndNotifyNewProblemsV2(guild) {
    const current = await all(`SELECT pseudo, page_slug, last_status, last_details
       FROM aurix_landing_verif_refs
      WHERE last_status IS NOT NULL AND last_status <> 'ok'`);
    const currentKeys = current
        .map((entry) => normalizePageSlug(entry.page_slug))
        .filter((entry) => Boolean(entry))
        .sort();
    const currentJson = JSON.stringify(currentKeys);
    const previousRaw = await kvGet("landing_verif_known_problems");
    if (previousRaw === null) {
        await kvSet("landing_verif_known_problems", currentJson);
        log(`Baseline anomalies enregistree (${currentKeys.length} entrees).`);
        return;
    }
    let previousSet;
    try {
        const parsed = JSON.parse(previousRaw);
        previousSet = new Set(Array.isArray(parsed) ? parsed : []);
    }
    catch {
        previousSet = new Set();
    }
    const newOnes = current.filter((entry) => {
        const slug = normalizePageSlug(entry.page_slug);
        return slug ? !previousSet.has(slug) : false;
    });
    await kvSet("landing_verif_known_problems", currentJson);
    if (newOnes.length === 0)
        return;
    const chId = await kvGet("channel_landing_verif_id");
    if (!chId)
        return;
    const ch = guild.channels.cache.get(chId);
    if (!ch || ch.type !== ChannelType.GuildText)
        return;
    const lines = newOnes.map((entry) => {
        const tag = entry.last_status === "celsius_changed"
            ? "🟡 affiLink Celsius modifié"
            : entry.last_status === "sheet_missing"
                ? "🟠 aucune ligne correspondante dans la sheet"
                : entry.last_status === "page_unreachable"
                    ? "🔴 landing publique injoignable"
                    : entry.last_status === "taap_off_domain"
                        ? "🔴 taap.it redirige hors des domaines attendus"
                        : entry.last_status === "taap_mismatch"
                            ? "🔴 taap.it pointe vers la mauvaise landing"
                            : entry.last_status === "taap_unreachable"
                                ? "⚠️ taap.it injoignable / cassé"
                                : `🔴 ${entry.last_status}`;
        return `• **${entry.pseudo}** — ${tag}${entry.last_details ? ` · *${entry.last_details}*` : ""}`;
    });
    const plural = newOnes.length > 1 ? "s" : "";
    const content = [
        `@here 🚨 **Nouvelle${plural} anomalie${plural} détectée${plural} sur les landings**`,
        "",
        ...lines,
    ].join("\n");
    try {
        await ch.send({
            content,
            allowedMentions: { parse: ["everyone"] },
        });
        log(`Ping anomalie poste pour ${newOnes.length} ref(s) nouvelle(s).`);
    }
    catch (e) {
        log("Ping anomalie failed:", e);
    }
}
async function ensureLandingCheckRun(client, source, notifyNewProblems) {
    if (activeRunPromise)
        return activeRunPromise;
    activeRunPromise = (async () => {
        log(`Verification pass started (${source}).`);
        liveRunState = {
            source,
            phase: "syncing_sheet",
            startedAt: new Date(),
            total: 0,
            processed: 0,
            currentPseudo: null,
            taap: "idle",
            landing: "idle",
            affi: "idle",
            note: null,
            counts: emptyCounts(),
        };
        queueBoardRefresh(client, true);
        try {
            await syncRefsFromSheet();
            const result = await verifyAllRefs(client);
            const guild = await resolveVerifGuild(client);
            liveRunState = null;
            if (guild) {
                await ensureVerifBoard(guild);
                if (notifyNewProblems)
                    await detectAndNotifyNewProblemsV2(guild);
            }
            return result;
        }
        finally {
            liveRunState = null;
            activeRunPromise = null;
            queueBoardRefresh(client, true);
        }
    })();
    return activeRunPromise;
}
export function isLandingVerifRunning() {
    return activeRunPromise !== null;
}
function isLandingVerifAllowedUser(interaction) {
    if (LANDING_VERIF_ALLOWED_USER_IDS.has(interaction.user.id))
        return true;
    const member = interaction.member;
    const candidates = [
        interaction.user.username,
        interaction.user.globalName,
        member?.displayName,
    ]
        .filter((v) => typeof v === "string" && v.trim().length > 0)
        .map((v) => v.trim().toLowerCase());
    return candidates.some((v) => LANDING_VERIF_ALLOWED_USERS.has(v));
}
export async function triggerManualCheck(client) {
    return ensureLandingCheckRun(client, "manual", false);
}
export async function handleLandingVerifRefreshButton(interaction) {
    if (!isLandingVerifAllowedUser(interaction)) {
        await interaction.reply({ content: "Commande réservée à Fabiozsis, Samyzsis et LeCasinoze.", ephemeral: true });
        return;
    }
    if (isLandingVerifRunning()) {
        await interaction.reply({
            content: "Une vérification des landings est déjà en cours sur ce salon.",
            ephemeral: true,
        });
        return;
    }
    await interaction.deferUpdate();
    void ensureLandingCheckRun(interaction.client, "manual", false).catch((e) => {
        log("manual landing refresh failed:", e);
    });
}
/**
 * Cree (ou retrouve) le salon landing-verif dans le guild specifie,
 * sous la categorie 'AGENCE' (lookup case-insensitive). Stocke en kv:
 *  - channel_landing_verif_id = id du salon
 *  - landing_verif_guild_id   = guildId
 * Appele depuis le bot du guild hote (ex: LunaLive bot ClientReady).
 */
export async function ensureLandingVerifChannelInGuild(client, guildId) {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild)
        return { ok: false, reason: `guild ${guildId} introuvable` };
    // Recharge tous les channels en cache.
    const channels = await guild.channels.fetch();
    // Cherche la categorie AGENCE (substring match, case-insensitive).
    const category = Array.from(channels.values()).find((c) => !!c && c.type === ChannelType.GuildCategory && /agence/i.test(c.name));
    if (!category) {
        return { ok: false, reason: "categorie 'AGENCE' introuvable" };
    }
    // Cherche un salon 'landing-verif' deja present dans cette categorie.
    let chan = Array.from(channels.values()).find((c) => !!c &&
        c.type === ChannelType.GuildText &&
        c.parentId === category.id &&
        /landing-verif/i.test(c.name));
    if (!chan) {
        chan = (await guild.channels.create({
            name: "🔎-landing-verif",
            type: ChannelType.GuildText,
            parent: category.id,
            topic: "🔎 Vérification automatique des landings (taap.it → page → celsius URL).",
            reason: "Aurix Landing Verif - salon de suivi.",
        }));
        log(`Salon landing-verif cree dans ${guild.name} (categorie ${category.name}).`);
    }
    await kvSet("channel_landing_verif_id", chan.id);
    await kvSet("landing_verif_guild_id", guildId);
    return { ok: true, channelId: chan.id };
}
