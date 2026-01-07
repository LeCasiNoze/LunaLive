import { upsertSlots } from "./catalog.js";
/**
 * ✅ Source: Shuffle GraphQL
 * - Liste providers via getGameCountByProvider
 * - Liste jeux via cachedGames(providerSlug, first, skip)
 *
 * Exclusions demandées:
 * - original (Shuffle originals)
 * - evolution
 * - pragmaticplaylive
 */
const SHUFFLE_GQL = "https://shuffle.com/main-api/graphql/api/graphql";
const EXCLUDED_PROVIDER_IDS = new Set(["original", "evolution", "pragmaticplaylive"]);
const Q_PROVIDERS = `query GetGameCountByProvider {
  getGameCountByProvider { provider { id name } gamesCount }
}`;
const Q_CACHED_GAMES = `query CachedGames($providerSlug:String!, $first:Int!, $skip:Int!) {
  cachedGames(providerSlug:$providerSlug, first:$first, skip:$skip) {
    totalCount
    nodes { name slug }
  }
}`;
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
async function shufflePost(payload, referer) {
    const r = await fetch(SHUFFLE_GQL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Origin: "https://shuffle.com",
            Referer: referer,
            "User-Agent": "Mozilla/5.0 (LunaLive slots-updater)",
        },
        body: JSON.stringify(payload),
    });
    const txt = await r.text().catch(() => "");
    let data = null;
    try {
        data = txt ? JSON.parse(txt) : null;
    }
    catch {
        data = null;
    }
    if (!r.ok) {
        throw new Error(`shuffle_http_${r.status}:${(txt || "").slice(0, 200)}`);
    }
    if (data?.errors?.length) {
        const msg = String(data.errors?.[0]?.message || "shuffle_graphql_error");
        throw new Error(`shuffle_gql:${msg}`);
    }
    return data;
}
async function fetchProviders() {
    const referer = "https://shuffle.com/fr/casino/providers/nolimit-city";
    const data = await shufflePost({ query: Q_PROVIDERS, variables: {}, operationName: "GetGameCountByProvider" }, referer);
    const arr = data?.data?.getGameCountByProvider;
    if (!Array.isArray(arr))
        return [];
    return arr
        .map((x) => ({
        id: String(x?.provider?.id || "").trim(),
        name: String(x?.provider?.name || "").trim(),
        gamesCount: Number(x?.gamesCount || 0),
    }))
        .filter((x) => x.id && x.name && Number.isFinite(x.gamesCount));
}
async function fetchProviderGames(providerSlug, providerName) {
    const referer = `https://shuffle.com/fr/casino/providers/${providerSlug}`;
    const first = 40; // ✅ safe (comme ton script)
    let skip = 0;
    const out = [];
    const seen = new Set();
    // hard safety
    let guardPages = 0;
    while (true) {
        guardPages++;
        if (guardPages > 300)
            break; // évite boucle infinie si Shuffle bug
        const data = await shufflePost({
            query: Q_CACHED_GAMES,
            variables: { providerSlug, first, skip },
            operationName: "CachedGames",
        }, referer);
        const cg = data?.data?.cachedGames;
        const total = Number(cg?.totalCount || 0);
        const nodes = Array.isArray(cg?.nodes) ? cg.nodes : [];
        for (const n of nodes) {
            const name = String(n?.name || "").trim();
            if (!name)
                continue;
            const k = name.toLowerCase();
            if (seen.has(k))
                continue;
            seen.add(k);
            out.push({ name, provider: providerName });
        }
        skip += first;
        if (!total || skip >= total)
            break;
        // petit throttle (anti-burst)
        await sleep(180);
    }
    return out;
}
export async function runSlotsUpdate(pool) {
    try {
        const providers = await fetchProviders();
        const targets = providers
            .filter((p) => p.gamesCount > 0)
            .filter((p) => !EXCLUDED_PROVIDER_IDS.has(p.id));
        const all = [];
        // ✅ throttle global (comme NozeBot)
        const interProviderMs = Number(process.env.SHUFFLE_INTER_PROVIDER_MS || 650);
        for (const p of targets) {
            // tente / skip si rate limit
            try {
                const rows = await fetchProviderGames(p.id, p.name);
                all.push(...rows);
            }
            catch (e) {
                console.warn(`[slots-updater] skip provider=${p.id} err=${String(e?.message || e)}`);
            }
            if (interProviderMs > 0)
                await sleep(interProviderMs);
        }
        const inserted = await upsertSlots(pool, all);
        return { ok: true, fetched: all.length, inserted };
    }
    catch (e) {
        return { ok: false, error: String(e?.message || "update_failed") };
    }
}
