// api/src/calls/shuffle_fetcher.ts
import { normText } from "./normalize.js";
function safeJsonParse(s) {
    try {
        return JSON.parse(s);
    }
    catch {
        return null;
    }
}
export function parseShuffleProviders() {
    const raw = String(process.env.SHUFFLE_PROVIDERS_JSON || "").trim();
    if (!raw)
        return [];
    const j = safeJsonParse(raw);
    if (!Array.isArray(j))
        return [];
    return j
        .map((x) => ({
        name: String(x?.name || "").trim(),
        slug: String(x?.slug || "").trim(),
    }))
        .filter((x) => x.name && x.slug);
}
function parseHeaders() {
    const raw = String(process.env.SHUFFLE_HEADERS_JSON || "").trim();
    if (!raw)
        return {};
    const j = safeJsonParse(raw);
    if (!j || typeof j !== "object")
        return {};
    const out = {};
    for (const [k, v] of Object.entries(j)) {
        if (!k)
            continue;
        if (v == null)
            continue;
        out[String(k)] = String(v);
    }
    return out;
}
function shouldRetryTooMany(status, bodyText) {
    if (status === 429)
        return true;
    const msg = String(bodyText || "");
    return msg.includes("TOO_MANY_REQUEST") || msg.includes("Too Many") || msg.includes("TooMany");
}
async function sleep(ms) {
    await new Promise((r) => setTimeout(r, ms));
}
async function sleepBackoff(attempt) {
    // Backoff exponentiel + jitter: 1200ms, 2400ms, 4800ms (±20%)
    const base = 1200 * Math.pow(2, attempt);
    const jitter = base * (0.8 + Math.random() * 0.4);
    await sleep(Math.floor(jitter));
}
function pickItems(data) {
    if (!data)
        return [];
    if (Array.isArray(data))
        return data;
    // formats fréquents
    if (Array.isArray(data.items))
        return data.items;
    if (Array.isArray(data.data))
        return data.data;
    if (Array.isArray(data.games))
        return data.games;
    if (data.result && Array.isArray(data.result.items))
        return data.result.items;
    if (data.payload && Array.isArray(data.payload.items))
        return data.payload.items;
    // fallback: première array trouvée (soft)
    for (const v of Object.values(data)) {
        if (Array.isArray(v))
            return v;
    }
    return [];
}
function extractName(it) {
    if (!it)
        return "";
    if (typeof it === "string")
        return it;
    if (typeof it === "object") {
        return String(it.name || it.title || it.game || it.label || "").trim();
    }
    return "";
}
export async function fetchShuffleBySlug(slug, providerNameHint) {
    const urlTpl = String(process.env.SHUFFLE_PROVIDER_URL_TMPL || "").trim();
    if (!urlTpl)
        throw new Error("SHUFFLE_PROVIDER_URL_TMPL_missing");
    const url = urlTpl.replace(/\{slug\}/g, encodeURIComponent(slug));
    const headers = parseHeaders();
    const maxRetries = Math.max(0, Number(process.env.SHUFFLE_MAX_RETRIES || 3));
    const timeoutMs = Math.max(2000, Number(process.env.SHUFFLE_TIMEOUT_MS || 15000));
    let attempt = 0;
    while (true) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs);
        let status = 0;
        let text = "";
        try {
            const r = await fetch(url, {
                method: "GET",
                headers,
                signal: ctrl.signal,
            });
            status = r.status;
            text = await r.text().catch(() => "");
            if (!r.ok) {
                if (shouldRetryTooMany(status, text) && attempt < maxRetries) {
                    attempt++;
                    await sleepBackoff(attempt - 1);
                    continue;
                }
                throw new Error(`shuffle_fetch_failed:${status}`);
            }
            const data = text ? safeJsonParse(text) : null;
            const items = pickItems(data);
            const provider = normText(providerNameHint || "") || null;
            const out = [];
            for (const it of items) {
                const name = normText(extractName(it));
                if (!name)
                    continue;
                out.push({ name, provider });
            }
            return out;
        }
        catch (e) {
            const msg = String(e?.message || e);
            // abort -> retry (soft)
            if ((msg.includes("aborted") || msg.includes("AbortError")) && attempt < maxRetries) {
                attempt++;
                await sleepBackoff(attempt - 1);
                continue;
            }
            // retry rate-limit
            if (shouldRetryTooMany(status, text) && attempt < maxRetries) {
                attempt++;
                await sleepBackoff(attempt - 1);
                continue;
            }
            throw e;
        }
        finally {
            clearTimeout(t);
        }
    }
}
export async function fetchShuffleAll() {
    const providers = parseShuffleProviders();
    if (!providers.length)
        throw new Error("SHUFFLE_PROVIDERS_JSON_missing_or_empty");
    const interMs = Math.max(0, Number(process.env.SHUFFLE_INTER_PROVIDER_MS || 800));
    const all = [];
    for (const p of providers) {
        console.log(`[shuffle] provider ${p.name} (${p.slug})`);
        try {
            const rows = await fetchShuffleBySlug(p.slug, p.name);
            all.push(...rows);
        }
        catch (e) {
            console.warn(`[shuffle] skip ${p.name} (${p.slug})`, e?.message || e);
        }
        if (interMs > 0)
            await sleep(interMs);
    }
    return all;
}
