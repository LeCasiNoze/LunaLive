// api/src/calls/updater.ts
import type { Pool } from "pg";
import { upsertSlots, type SlotRow, type InsertedSlotRow } from "./catalog.js";

/**
 * ✅ Source: Shuffle GraphQL
 * - Liste providers via getGameCountByProvider (id + name + slug)
 * - Liste jeux via cachedGames(providerSlug, first, skip)
 *
 * Exclusions demandées (par SLUG Shuffle, pas par id):
 * - shuffle-games (Shuffle originals)
 * - evolution
 * - pragmatic-play-live
 */

const SHUFFLE_GQL = "https://shuffle.com/main-api/graphql/api/graphql";

// ⚠️ IMPORTANT: exclusions par slug (pas par id)
const EXCLUDED_PROVIDER_SLUGS = new Set<string>(["shuffle-games", "evolution", "pragmatic-play-live"]);

const Q_PROVIDERS = `query GetGameCountByProvider {
  getGameCountByProvider { provider { id name slug } gamesCount }
}`;

const Q_CACHED_GAMES = `query CachedGames($providerSlug:String!, $first:Int!, $skip:Int!) {
  cachedGames(providerSlug:$providerSlug, first:$first, skip:$skip) {
    totalCount
    nodes { name slug }
  }
}`;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function shufflePost(payload: any, referer: string) {
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
  let data: any = null;
  try {
    data = txt ? JSON.parse(txt) : null;
  } catch {
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

type ProviderRow = { id: string; name: string; slug: string; gamesCount: number };

async function fetchProviders(): Promise<ProviderRow[]> {
  const referer = "https://shuffle.com/fr/casino/providers/nolimit-city";
  const data = await shufflePost(
    { query: Q_PROVIDERS, variables: {}, operationName: "GetGameCountByProvider" },
    referer
  );

  const arr = data?.data?.getGameCountByProvider;
  if (!Array.isArray(arr)) return [];

  return arr
    .map((x: any) => ({
      id: String(x?.provider?.id || "").trim(),
      name: String(x?.provider?.name || "").trim(),
      slug: String(x?.provider?.slug || "").trim(),
      gamesCount: Number(x?.gamesCount || 0),
    }))
    .filter(
      (x) => x.id && x.name && x.slug && Number.isFinite(x.gamesCount)
    );
}

async function fetchProviderGames(providerSlug: string, providerName: string): Promise<SlotRow[]> {
  const referer = `https://shuffle.com/fr/casino/providers/${providerSlug}`;
  const first = 40; // ✅ safe (comme ton script)
  let skip = 0;

  const out: SlotRow[] = [];
  const seen = new Set<string>();

  // hard safety
  let guardPages = 0;

  while (true) {
    guardPages++;
    if (guardPages > 300) break; // évite boucle infinie si Shuffle bug

    const data = await shufflePost(
      {
        query: Q_CACHED_GAMES,
        variables: { providerSlug, first, skip },
        operationName: "CachedGames",
      },
      referer
    );

    const cg = data?.data?.cachedGames;
    const total = Number(cg?.totalCount || 0);
    const nodes = Array.isArray(cg?.nodes) ? cg.nodes : [];

    for (const n of nodes) {
      const name = String(n?.name || "").trim();
      if (!name) continue;

      const k = name.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);

      out.push({ name, provider: providerName });
    }

    skip += first;
    if (!total || skip >= total) break;

    // petit throttle (anti-burst)
    await sleep(180);
  }

  return out;
}

export async function runSlotsUpdate(
  pool: Pool
): Promise<
  | { ok: true; fetched: number; inserted: InsertedSlotRow[] }
  | { ok: false; error: string }
> {
  try {
    const providers = await fetchProviders();

    // ✅ targets = ceux qui ont des jeux, et pas dans exclusions
    const targets = providers
      .filter((p) => p.gamesCount > 0)
      .filter((p) => !EXCLUDED_PROVIDER_SLUGS.has(p.slug));

    const all: SlotRow[] = [];

    // ✅ throttle global (comme NozeBot)
    const interProviderMs = Number(process.env.SHUFFLE_INTER_PROVIDER_MS || 650);

    for (const p of targets) {
      // ✅ ICI LE FIX IMPORTANT:
      // on passe p.slug à cachedGames, pas p.id
      try {
        const rows = await fetchProviderGames(p.slug, p.name);
        all.push(...rows);
      } catch (e: any) {
        console.warn(
          `[slots-updater] skip providerId=${p.id} slug=${p.slug} err=${String(e?.message || e)}`
        );
      }

      if (interProviderMs > 0) await sleep(interProviderMs);
    }

    const inserted = await upsertSlots(pool, all);
    return { ok: true, fetched: all.length, inserted };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || "update_failed") };
  }
}
