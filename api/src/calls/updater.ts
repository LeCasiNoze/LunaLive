// api/src/calls/updater.ts
import type { Pool } from "pg";
import { upsertSlots, type SlotRow } from "./catalog.js";
import { normText, keyText } from "./normalize.js";
import { fetchShuffleProviders, fetchShuffleProviderSlots } from "./shuffle_fetcher.js";

/**
 * Source active du catalogue : Shuffle GraphQL.
 *
 * Les fonctions Gamba ci-dessous restent exportées uniquement pour les anciens
 * scripts de diagnostic. runSlotsUpdate() ne les utilise plus : la page Gamba
 * ne publie désormais que son provider interne et ne constitue plus un index
 * fiable des machines à sous.
 *
 * Ancienne source Gamba :
 * - Liste providers: page HTML https://gamba.com/casino/providers (regex)
 * - Games: persisted query gameSearch
 *
 * On garde SlotRow {name, provider, imageUrl} et upsertSlots() inchangés.
 */

const GAMBA_BASE = "https://gamba.com";
const GAMBA_API = "https://gamba.com/_api/@";

const GAMBA_GAMESEARCH_SHA = String(
  process.env.GAMBA_GAMESEARCH_SHA || "b717ba5742eb2ab2e75bc1f5ffdd9617d61a8c3ef7612cc6d0bf5c6c2ab26046"
).trim();

const GAMBA_FIRST = Math.max(1, Math.min(60, Number(process.env.GAMBA_FIRST || 39)));
const LOG_NEW_MAX = Math.max(0, Number(process.env.SLOTS_LOG_NEW_MAX || 25));

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  maxDelay: number = 10000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const attempt = async (retryCount: number) => {
      try {
        const result = await fn();
        resolve(result);
      } catch (error: any) {
        if (retryCount >= maxRetries) {
          reject(error);
          return;
        }
        
        const delay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);
        console.warn(`[slots-updater] Retry ${retryCount + 1}/${maxRetries} after ${delay}ms: ${error?.message || error}`);
        await sleep(delay);
        attempt(retryCount + 1);
      }
    };
    attempt(0);
  });
}

function buildGambaUrl(producerSlug: string, first: number, page: number, sha: string) {
  const vars = {
    producerSlug,
    first,
    page,
    orderBy: [{ column: "ORDER_PRODUCER", order: "ASC" }],
  };
  const ext = { persistedQuery: { version: 1, sha256Hash: sha } };

  const varsEnc = encodeURIComponent(JSON.stringify(vars));
  const extEnc = encodeURIComponent(JSON.stringify(ext));

  return `${GAMBA_API}?operationName=gameSearch&variables=${varsEnc}&extensions=${extEnc}`;
}

export async function fetchText(url: string, referer?: string, timeout: number = 10000): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (LunaLive slots-updater)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        ...(referer ? { Referer: referer } : {}),
      },
    });
    clearTimeout(timeoutId);
    
    if (!r.ok) {
      throw new Error(`HTTP ${r.status} ${r.statusText} for ${url}`);
    }
    
    return await r.text();
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Timeout after ${timeout}ms for ${url}`);
    }
    throw error;
  }
}

export async function fetchJson(url: string, referer?: string, timeout: number = 15000): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (LunaLive slots-updater)",
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Content-Type": "application/json",
        ...(referer ? { Referer: referer } : {}),
      },
    });
    clearTimeout(timeoutId);
    
    if (!r.ok) {
      const errorText = await r.text().catch(() => '');
      throw new Error(`HTTP ${r.status} ${r.statusText} for ${url}: ${errorText.substring(0, 200)}`);
    }
    
    const txt = await r.text().catch(() => '');
    if (!txt) {
      throw new Error(`Empty response from ${url}`);
    }
    
    let j: any = null;
    try {
      j = JSON.parse(txt);
    } catch (parseError) {
      throw new Error(`Invalid JSON from ${url}: ${txt.substring(0, 200)}`);
    }
    
    return j;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Timeout after ${timeout}ms for ${url}`);
    }
    throw error;
  }
}

/** Liste les provider slugs depuis /casino/providers */
export async function fetchProviderSlugs(): Promise<string[]> {
  const url = `${GAMBA_BASE}/casino/providers`;
  const html = await fetchText(url, url);

  // 1) provider-logos/<slug>.svg
  const rxLogo = /provider-logos\/([a-z0-9-]+)\.(?:svg|png|webp|jpg|jpeg)/g;
  // 2) /casino/provider/<slug>
  const rxLink = /\/casino\/provider\/([a-z0-9-]+)/g;

  const out = new Set<string>();

  let m: RegExpExecArray | null;
  while ((m = rxLogo.exec(html))) out.add(m[1]);
  while ((m = rxLink.exec(html))) out.add(m[1]);

  // ✅ CORRECTION: Mapper les anciens slugs vers les nouveaux slugs Gamba
  const slugMapping: Record<string, string> = {
    "nolimit-city": "no-limit-city",
    "relax-gaming": "relax", 
    "backseat": "hacksaw-gaming"
  };

  // ✅ MAJ: TOUS les providers sont fonctionnels - plus de filtrage nécessaire
  // L'audit complet a révélé que tous les 34+ providers retournent des jeux
  const mappedProviders = Array.from(out).map(slug => slugMapping[slug] || slug);
  
  return mappedProviders.sort((a, b) => a.localeCompare(b));
}

type GameSearchResp = {
  data?: {
    gameSearch?: {
      data?: any[];
      paginatorInfo?: {
        total?: number;
        hasMorePages?: boolean;
        currentPage?: number;
      };
    };
  };
};

export async function fetchProviderGames(producerSlug: string): Promise<SlotRow[]> {
  const referer = `${GAMBA_BASE}/casino/provider/${producerSlug}`;
  const out: SlotRow[] = [];

  let page = 1;
  let guard = 0;
  let consecutiveErrors = 0;
  const maxConsecutiveErrors = 3;

  while (true) {
    guard++;
    if (guard > 500) {
      console.warn(`[slots-updater] ${producerSlug}: Safety guard reached (500 pages), stopping pagination`);
      break;
    }

    try {
      const url = buildGambaUrl(producerSlug, GAMBA_FIRST, page, GAMBA_GAMESEARCH_SHA);
      console.log(`[slots-updater] ${producerSlug}: Fetching page ${page}...`);
      
      const j = (await fetchJson(url, referer, 15000)) as GameSearchResp;

      // Reset error counter on success
      consecutiveErrors = 0;

      const gs = j?.data?.gameSearch;
      const items = Array.isArray(gs?.data) ? gs!.data! : [];
      const pi = gs?.paginatorInfo;

      if (items.length === 0) {
        console.log(`[slots-updater] ${producerSlug}: No items on page ${page}, stopping pagination`);
        break;
      }

      console.log(`[slots-updater] ${producerSlug}: Page ${page} fetched ${items.length} items`);

      for (const it of items) {
        if (!it) continue;

        const name = String(it.title || it.name || "").trim();
        if (!name) {
          console.warn(`[slots-updater] ${producerSlug}: Skipping item with no name on page ${page}`);
          continue;
        }

        // ✅ Gamba: image / cover sont des strings directes
        let img: string | null = null;
        if (typeof it.image === "string" && it.image.trim()) img = it.image.trim();
        else if (typeof it.cover === "string" && it.cover.trim()) img = it.cover.trim();
        else if (typeof it.thumbnail === "string" && it.thumbnail.trim()) img = it.thumbnail.trim();

        // fallback (au cas où)
        else if (typeof it.thumbnailUrl === "string" && it.thumbnailUrl.trim()) img = it.thumbnailUrl.trim();
        else if (typeof it.coverUrl === "string" && it.coverUrl.trim()) img = it.coverUrl.trim();
        else if (typeof it.imageUrl === "string" && it.imageUrl.trim()) img = it.imageUrl.trim();

        // ✅ provider = slug brut (normalisé ensuite dans upsertSlots via provider_aliases)
        out.push({ name, provider: producerSlug, imageUrl: img });
      }

      if (!pi?.hasMorePages) {
        console.log(`[slots-updater] ${producerSlug}: No more pages after page ${page}`);
        break;
      }

      page++;
      
      // Small delay between pages to be gentle
      await sleep(200);
      
    } catch (e: any) {
      consecutiveErrors++;
      const errorMessage = String(e?.message || e);
      
      console.error(`[slots-updater] ${producerSlug}: Error on page ${page} (${consecutiveErrors}/${maxConsecutiveErrors}): ${errorMessage}`);
      
      if (consecutiveErrors >= maxConsecutiveErrors) {
        console.error(`[slots-updater] ${producerSlug}: Too many consecutive errors (${consecutiveErrors}), stopping pagination`);
        break;
      }
      
      // Wait longer before retrying
      await sleep(1000 * consecutiveErrors);
      continue;
    }
  }

  console.log(`[slots-updater] ${producerSlug}: Completed pagination with ${out.length} total games`);
  return out;
}

export async function countExistingKeys(pool: Pool, keys: string[]): Promise<number> {
  if (!keys.length) return 0;
  const { rowCount } = await pool.query(`SELECT name_key FROM slots_catalog WHERE name_key = ANY($1::text[])`, [keys]);
  return Number(rowCount || 0);
}

function sample<T>(arr: T[], max: number) {
  if (arr.length <= max) return arr;
  return arr.slice(0, max);
}

type ProviderResult = {
  provider: string;
  success: boolean;
  fetched: number;
  inserted: number;
  error?: string;
  details?: string;
};

export async function runSlotsUpdate(
  pool: Pool
): Promise<{
  ok: true;
  totalProviders: number;
  successProviders: number;
  failedProviders: number;
  totalFetched: number;
  totalInserted: number;
  providers: ProviderResult[];
} | {
  ok: false;
  error: string;
  providers: ProviderResult[];
}> {
  console.log(`[slots-updater] Starting Shuffle slots update`);

  const startTime = Date.now();
  const providers: ProviderResult[] = [];

  try {
    const excludedSlugs = new Set(
      String(process.env.SLOTS_EXCLUDED_PROVIDER_SLUGS || "shuffle-games,evolution,pragmatic-play-live")
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    );
    const providerRows = (await fetchShuffleProviders()).filter(
      (provider) => provider.gamesCount > 0 && !excludedSlugs.has(provider.slug.toLowerCase())
    );
    const interProviderMs = Math.max(0, Number(process.env.SHUFFLE_INTER_PROVIDER_MS || 250));

    console.log(`[slots-updater] Found ${providerRows.length} Shuffle providers`);

    let totalFetchedRaw = 0;
    let totalInserted = 0;
    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < providerRows.length; i++) {
      const provider = providerRows[i];
      console.log(`[slots-updater] [${i + 1}/${providerRows.length}] Processing Shuffle provider: ${provider.slug}`);

      const providerResult: ProviderResult = {
        provider: provider.slug,
        success: false,
        fetched: 0,
        inserted: 0,
      };

      try {
        const rows = await retryWithBackoff(
          () => fetchShuffleProviderSlots(provider.id, provider.slug, provider.name),
          2,
          1_000,
          8_000
        );

        providerResult.fetched = rows.length;
        totalFetchedRaw += rows.length;

        if (rows.length === 0) {
          console.log(`[slots-updater] ${provider.slug}: no games fetched`);
          providerResult.success = true;
          providerResult.details = "No games available";
        } else {
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
              const nextImg = r.imageUrl ? String(r.imageUrl) : null;
              const prevImg = prev.imageUrl ? String(prev.imageUrl) : null;
              uniq.set(k, { name: nm, provider: r.provider, imageUrl: prevImg || nextImg || null });
            }
          }

          const dupInBatch = Math.max(0, rows.length - uniq.size);
          const keys = Array.from(uniq.keys());
          const alreadyInDb = await countExistingKeys(pool, keys);

          console.log(
            `[slots-updater] ${provider.slug}: fetched=${rows.length} unique=${uniq.size} dupInBatch=${dupInBatch} alreadyInDb=${alreadyInDb}`
          );

          const inserted = await upsertSlots(pool, Array.from(uniq.values()));
          providerResult.inserted = inserted.length;
          totalInserted += inserted.length;

          if (inserted.length) {
            const names = inserted.map((x) => x.name).sort((a, b) => a.localeCompare(b));
            const show = sample(names, LOG_NEW_MAX);
            console.log(
              `[slots-updater] ${provider.slug}: inserted=${inserted.length} new=[${show.join(" | ")}${names.length > show.length ? " ..." : ""}]`
            );
          } else {
            console.log(`[slots-updater] ${provider.slug}: inserted=0`);
          }

          providerResult.success = true;
          providerResult.details = `fetched=${rows.length}, inserted=${inserted.length}`;
        }

        successCount++;
      } catch (e: any) {
        const errorMessage = String(e?.message || e);
        const stack = e?.stack || 'no stack';

        console.error(`[slots-updater] ${provider.slug}: FAILED`);
        console.error(`[slots-updater] ${provider.slug}: Error: ${errorMessage}`);
        console.error(`[slots-updater] ${provider.slug}: Stack: ${stack}`);
        
        providerResult.success = false;
        providerResult.error = errorMessage;
        providerResult.details = stack.length > 500 ? stack.substring(0, 500) + '...' : stack;
        
        failedCount++;
      }

      providers.push(providerResult);

      if (interProviderMs && i < providerRows.length - 1) {
        await sleep(interProviderMs);
      }
    }

    const duration = Date.now() - startTime;
    const failedProvidersList = providers.filter(p => !p.success).map(p => p.provider);
    
    console.log(`[slots-updater] DONE in ${(duration / 1000).toFixed(1)}s`);
    console.log(`[slots-updater] providers=${providerRows.length} success=${successCount} failed=${failedCount} fetched=${totalFetchedRaw} inserted=${totalInserted}`);

    if (failedProvidersList.length > 0) {
      console.log(`[slots-updater] Failed providers: [${failedProvidersList.join(', ')}]`);
    }

    return {
      ok: true,
      totalProviders: providerRows.length,
      successProviders: successCount,
      failedProviders: failedCount,
      totalFetched: totalFetchedRaw,
      totalInserted,
      providers,
    };
  } catch (e: any) {
    console.error(`[slots-updater] CRITICAL ERROR: ${String(e?.message || e)}`);
    console.error(`[slots-updater] Stack: ${e?.stack || 'no stack'}`);

    return {
      ok: false,
      error: String(e?.message || "critical_update_failed"),
      providers,
    };
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
      console.log(`[slots-updater] tick ok fetched=${r.totalFetched} inserted=${r.totalInserted}`);
    } catch (e: any) {
      console.warn("[slots-updater] tick failed", e?.message || e);
    }
  };

  tick().catch(() => {});
  setInterval(() => tick().catch(() => {}), ms);
}
