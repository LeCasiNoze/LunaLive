// api/src/calls/updater.ts
import type { Pool } from "pg";
import { upsertSlots, type SlotRow, type InsertedSlotRow } from "./catalog.js";
import { normText, keyText } from "./normalize.js";
import { shuffleImageFromNode, isGqlValidationError } from "./shuffle_images.js";

/**
 * Source: Shuffle GraphQL
 * - Providers: getGameCountByProvider { provider { id name slug } gamesCount }
 * - Games: cachedGames(providerSlug, first, skip)
 *
 * Exclusions:
 * - original (Shuffle originals)
 * - evolution
 * - pragmaticplaylive
 */

const SHUFFLE_GQL = "https://shuffle.com/main-api/graphql/api/graphql";
const EXCLUDED_PROVIDER_IDS = new Set<string>(["original", "evolution", "pragmaticplaylive"]);

const Q_PROVIDERS = `query GetGameCountByProvider {
  getGameCountByProvider { provider { id name slug } gamesCount }
}`;

const Q_CACHED_GAMES = `query CachedGames($providerSlug:String!, $first:Int!, $skip:Int!) {
  cachedGames(providerSlug:$providerSlug, first:$first, skip:$skip) {
    totalCount
    nodes { name slug }
  }
}`;

const Q_CACHED_GAMES_WITH_IMAGES = `query CachedGames($providerSlug:String!, $first:Int!, $skip:Int!) {
  cachedGames(providerSlug:$providerSlug, first:$first, skip:$skip) {
    totalCount
    nodes {
      name
      slug
      images { list thumbnail cover }
      image { key }
    }
  }
}`;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function shouldRetryTooMany(msg: string) {
  return msg.includes("TOO_MANY_REQUEST") || msg.includes("Too Many") || msg.includes("TooMany");
}

async function sleepBackoff(attempt: number) {
  // 1200ms, 2400ms, 4800ms ... (+ jitter)
  const base = 1200 * Math.pow(2, attempt);
  const jitter = base * (0.8 + Math.random() * 0.4);
  await sleep(Math.floor(jitter));
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
    const code = String(data.errors?.[0]?.extensions?.code || "");
    throw new Error(`shuffle_gql:${code}:${msg}`);
  }
  return data;
}

async function shufflePostWithRetry(payload: any, referer: string) {
  const maxRetries = Math.max(0, Number(process.env.SHUFFLE_MAX_RETRIES || 3));

  for (let attempt = 0; ; attempt++) {
    try {
      return await shufflePost(payload, referer);
    } catch (e: any) {
      const msg = String(e?.message || e);

      // retry only on rate limit
      if (attempt < maxRetries && shouldRetryTooMany(msg)) {
        console.warn(`[slots-updater] rate-limit → retry ${attempt + 1}/${maxRetries}`);
        await sleepBackoff(attempt);
        continue;
      }

      throw e;
    }
  }
}

type ProviderRow = { id: string; name: string; slug: string; gamesCount: number };

async function fetchProviders(): Promise<ProviderRow[]> {
  const referer = "https://shuffle.com/fr/casino/providers/nolimit-city";
  const data = await shufflePostWithRetry(
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
    .filter((x) => x.id && x.name && x.slug && Number.isFinite(x.gamesCount));
}

async function fetchProviderGames(providerSlug: string, providerName: string): Promise<SlotRow[]> {
  const referer = `https://shuffle.com/fr/casino/providers/${providerSlug}`;
  const first = 40; // ✅ safe
  let skip = 0;

  const out: SlotRow[] = [];

  // safety anti-boucle infinie
  let guardPages = 0;

  while (true) {
    guardPages++;
    if (guardPages > 400) break;

    // 1) try with images
    let data: any = null;
    try {
      data = await shufflePostWithRetry(
        {
          query: Q_CACHED_GAMES_WITH_IMAGES,
          variables: { providerSlug, first, skip },
          operationName: "CachedGames",
        },
        referer
      );
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (isGqlValidationError(msg)) {
        data = await shufflePostWithRetry(
          {
            query: Q_CACHED_GAMES,
            variables: { providerSlug, first, skip },
            operationName: "CachedGames",
          },
          referer
        );
      } else {
        throw e;
      }
    }

    const cg = data?.data?.cachedGames;
    const total = Number(cg?.totalCount || 0);
    const nodes = Array.isArray(cg?.nodes) ? cg.nodes : [];

    for (const n of nodes) {
      const name = String(n?.name || "").trim();
      if (!name) continue;

      const imageUrl = shuffleImageFromNode(n);

      out.push({ name, provider: providerName, imageUrl: imageUrl || null });
    }

    skip += first;
    if (!total || skip >= total) break;

    // petit throttle intra-provider (anti burst)
    await sleep(160);
  }

  return out;
}

async function countExistingKeys(pool: Pool, keys: string[]): Promise<number> {
  if (!keys.length) return 0;
  const { rowCount } = await pool.query(
    `SELECT name_key FROM slots_catalog WHERE name_key = ANY($1::text[])`,
    [keys]
  );
  return Number(rowCount || 0);
}

function sample<T>(arr: T[], max: number) {
  if (arr.length <= max) return arr;
  return arr.slice(0, max);
}

export async function runSlotsUpdate(
  pool: Pool
): Promise<{ ok: true; fetched: number; inserted: InsertedSlotRow[] } | { ok: false; error: string }> {
  try {
    const providers = await fetchProviders();

    const targets = providers
      .filter((p) => p.gamesCount > 0)
      .filter((p) => !EXCLUDED_PROVIDER_IDS.has(p.id));

    const interProviderMs = Number(process.env.SHUFFLE_INTER_PROVIDER_MS || 650);
    const logNamesMax = Math.max(0, Number(process.env.SLOTS_LOG_NEW_MAX || 25));

    let totalFetchedRaw = 0;
    const allInserted: InsertedSlotRow[] = [];

    console.log(`[slots-updater] providers=${targets.length} excluded=${EXCLUDED_PROVIDER_IDS.size}`);

    for (const p of targets) {
      console.log(
        `[slots-updater] ▶ provider start id=${p.id} slug=${p.slug} name="${p.name}" gamesCount=${p.gamesCount}`
      );

      let rows: SlotRow[] = [];
      try {
        rows = await fetchProviderGames(p.slug, p.name);
      } catch (e: any) {
        console.warn(
          `[slots-updater] skip providerId=${p.id} slug=${p.slug} err=${String(e?.message || e)}`
        );
        if (interProviderMs > 0) await sleep(interProviderMs);
        continue;
      }

      totalFetchedRaw += rows.length;

      // ✅ dedupe côté updater aussi
      const uniq = new Map<string, SlotRow>();
      for (const r of rows) {
        const nm = normText(r.name);
        if (!nm) continue;
        const k = keyText(nm);
        if (!k) continue;

        const prev = uniq.get(k);
        if (!prev) {
          uniq.set(k, { name: nm, provider: r.provider, imageUrl: r.imageUrl ?? null });
        } else {
          // merge: si on a une image sur le nouveau et pas l'ancien, on la garde
          const nextImg = r.imageUrl ? String(r.imageUrl) : null;
          const prevImg = prev.imageUrl ? String(prev.imageUrl) : null;
          uniq.set(k, {
            name: nm,
            provider: r.provider,
            imageUrl: prevImg || nextImg || null,
          });
        }
      }

      const dupInBatch = Math.max(0, rows.length - uniq.size);
      const keys = Array.from(uniq.keys());
      const alreadyInDb = await countExistingKeys(pool, keys);

      console.log(
        `[slots-updater]   fetched=${rows.length} unique=${uniq.size} dupInBatch=${dupInBatch} alreadyInDb=${alreadyInDb}`
      );

      // upsert (stocke image_url si présent)
      const inserted = await upsertSlots(pool, Array.from(uniq.values()));
      allInserted.push(...inserted);

      if (inserted.length) {
        const names = inserted.map((x) => x.name).sort((a, b) => a.localeCompare(b));
        const show = sample(names, logNamesMax);
        console.log(
          `[slots-updater]   ✅ inserted=${inserted.length} new=[${show.join(" • ")}${
            names.length > show.length ? " …" : ""
          }]`
        );
      } else {
        console.log(`[slots-updater]   ✅ inserted=0`);
      }

      console.log(`[slots-updater] ◀ provider done id=${p.id} slug=${p.slug}`);

      if (interProviderMs > 0) await sleep(interProviderMs);
    }

    console.log(`[slots-updater] DONE fetchedRaw=${totalFetchedRaw} inserted=${allInserted.length}`);

    return { ok: true, fetched: totalFetchedRaw, inserted: allInserted };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || "update_failed") };
  }
}

export function startSlotsUpdater(pool: Pool, everyHours: number) {
  const ms = Math.max(1, Number(everyHours || 12)) * 3600_000;

  const tick = async () => {
    try {
      const r = await runSlotsUpdate(pool);
      if (!r.ok) {
        console.warn(`[slots-updater] failed`, r.error);
        return;
      }
      console.log(`[slots-updater] tick ok fetched=${r.fetched} inserted=${r.inserted.length}`);
    } catch (e: any) {
      console.warn("[slots-updater] tick failed", e?.message || e);
    }
  };

  tick().catch(() => {});
  setInterval(() => tick().catch(() => {}), ms);
}
