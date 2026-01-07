// api/src/calls/shuffle_fetcher.ts
import { normText } from "./normalize.js";
import { loadShuffleImagesIndex, getShuffleImageUrlFromIndex, type ShuffleImagesIndex } from "./shuffle_images.js";

export type ShuffleProviderRow = {
  id: string;
  name: string;
  slug: string;
  gamesCount: number;
};

export type SlotRow = {
  name: string;
  provider: string | null;
  providerSlug?: string | null;
  imageUrl?: string | null;
};

const GQL_URL = String(process.env.SHUFFLE_GQL_URL || "https://shuffle.com/main-api/graphql/api/graphql").trim();

function headersFor(referer: string) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    Origin: "https://shuffle.com",
    Referer: referer,
    "User-Agent": "Mozilla/5.0 LunaLive (slots-updater)",
  } as Record<string, string>;
}

function shouldRetryTooMany(status: number, bodyText: string) {
  if (status === 429) return true;
  const msg = String(bodyText || "");
  return msg.includes("TOO_MANY_REQUEST") || msg.includes("Too Many") || msg.includes("TooMany");
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function sleepBackoff(attempt: number) {
  const base = 1200 * Math.pow(2, attempt);
  const jitter = base * (0.8 + Math.random() * 0.4);
  await sleep(Math.floor(jitter));
}

type GqlResp = { data?: any; errors?: any[] };

async function postGql(query: string, variables: any, operationName: string, referer: string) {
  const maxRetries = Math.max(0, Number(process.env.SHUFFLE_MAX_RETRIES || 3));
  const timeoutMs = Math.max(2000, Number(process.env.SHUFFLE_TIMEOUT_MS || 15000));

  let attempt = 0;
  while (true) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    let status = 0;
    let text = "";

    try {
      const body = JSON.stringify({ operationName, query, variables });

      const r = await fetch(GQL_URL, {
        method: "POST",
        headers: headersFor(referer),
        body,
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
        throw new Error(`shuffle_http:${status}`);
      }

      const j = (text ? JSON.parse(text) : {}) as GqlResp;

      if (j && Array.isArray(j.errors) && j.errors.length) {
        const code = String((j.errors[0] as any)?.extensions?.code || "").trim();
        const msg = String((j.errors[0] as any)?.message || "").trim();

        if (msg.includes("GAME_PROVIDER_NOT_FOUND")) {
          throw new Error("shuffle_gql:GAME_PROVIDER_NOT_FOUND");
        }

        throw new Error(`shuffle_gql:${code || "ERROR"}:${msg || "Invalid request"}`);
      }

      return j.data;
    } catch (e: any) {
      const msg = String(e?.message || e);

      if ((msg.includes("aborted") || msg.includes("AbortError")) && attempt < maxRetries) {
        attempt++;
        await sleepBackoff(attempt - 1);
        continue;
      }

      if (shouldRetryTooMany(status, text) && attempt < maxRetries) {
        attempt++;
        await sleepBackoff(attempt - 1);
        continue;
      }

      throw e;
    } finally {
      clearTimeout(t);
    }
  }
}

const Q_GET_PROVIDERS = `
query GetGameCountByProvider {
  getGameCountByProvider {
    provider { id name slug }
    gamesCount
  }
}
`;

export async function fetchShuffleProviders(): Promise<ShuffleProviderRow[]> {
  const data = await postGql(
    Q_GET_PROVIDERS,
    {},
    "GetGameCountByProvider",
    "https://shuffle.com/fr/casino/providers/nolimit-city"
  );

  const rows = data?.getGameCountByProvider;
  if (!Array.isArray(rows)) return [];

  return rows
    .map((x: any) => ({
      id: String(x?.provider?.id || "").trim(),
      name: String(x?.provider?.name || "").trim(),
      slug: String(x?.provider?.slug || "").trim(),
      gamesCount: Number(x?.gamesCount || 0) || 0,
    }))
    .filter((x: any) => x.id && x.name && x.slug);
}

// ✅ Requête safe (sans images)
const Q_CACHED_GAMES = `
query CachedGames($providerSlug: String!, $first: Int!, $skip: Int!) {
  cachedGames(providerSlug: $providerSlug, first: $first, skip: $skip) {
    totalCount
    nodes { name slug }
  }
}
`;

let _imagesIdx: ShuffleImagesIndex | null = null;
async function imagesIndex(): Promise<ShuffleImagesIndex> {
  if (_imagesIdx) return _imagesIdx;
  _imagesIdx = await loadShuffleImagesIndex();
  return _imagesIdx;
}

export async function fetchShuffleProviderSlots(
  providerId: string,
  providerSlug: string,
  providerNameHint: string
): Promise<SlotRow[]> {
  const pid = String(providerId || "").trim();
  const slug = String(providerSlug || "").trim();
  if (!slug) return [];

  const idx = await imagesIndex();

  const first = Math.max(1, Math.min(40, Number(process.env.SHUFFLE_BATCH || 40)));
  let skip = 0;
  let total = Number.POSITIVE_INFINITY;

  const out: SlotRow[] = [];

  while (skip < total) {
    const referer = `https://shuffle.com/fr/casino/providers/${encodeURIComponent(slug)}`;

    const data = await postGql(
      Q_CACHED_GAMES,
      { providerSlug: slug, first, skip },
      "CachedGames",
      referer
    );

    const cg = data?.cachedGames;
    const nodes = cg?.nodes;
    const totalCount = Number(cg?.totalCount);

    if (Number.isFinite(totalCount)) total = totalCount;
    if (!Array.isArray(nodes) || nodes.length === 0) break;

    for (const n of nodes) {
      const name = normText(n?.name);
      if (!name) continue;

      const gameSlug = typeof n?.slug === "string" ? n.slug.trim() : "";
      const imageUrl = getShuffleImageUrlFromIndex(idx, {
        slug: gameSlug || null,
        providerId: pid || null,
        name,
      });

      out.push({
        name,
        provider: normText(providerNameHint) || null,
        providerSlug: slug,
        imageUrl: imageUrl || null,
      });
    }

    skip += first;
  }

  return out;
}

export async function fetchShuffleAllSlots(options?: {
  excludeSlugs?: string[];
  excludeIds?: string[];
}): Promise<{ items: SlotRow[]; providers: ShuffleProviderRow[]; skipped: { slug: string; err: string }[] }> {
  const providers = await fetchShuffleProviders();

  const excludeSlugs = new Set(
    (options?.excludeSlugs || ["shuffle-games", "evolution", "pragmatic-play-live"])
      .map((s) => String(s).trim().toLowerCase())
      .filter(Boolean)
  );

  const excludeIds = new Set((options?.excludeIds || []).map((s) => String(s).trim().toLowerCase()).filter(Boolean));

  const interMs = Math.max(0, Number(process.env.SHUFFLE_INTER_PROVIDER_MS || 800));

  const items: SlotRow[] = [];
  const skipped: { slug: string; err: string }[] = [];

  for (const p of providers) {
    const slug = p.slug.toLowerCase();
    const id = p.id.toLowerCase();

    if (p.gamesCount <= 0) continue;
    if (excludeSlugs.has(slug) || excludeIds.has(id)) continue;

    try {
      const rows = await fetchShuffleProviderSlots(p.id, p.slug, p.name);
      items.push(...rows);
    } catch (e: any) {
      const err = String(e?.message || e);
      skipped.push({ slug: p.slug, err });
      console.warn(`[slots-updater] skip provider=${p.id} slug=${p.slug} err=${err}`);
    }

    if (interMs > 0) await sleep(interMs);
  }

  return { items, providers, skipped };
}
