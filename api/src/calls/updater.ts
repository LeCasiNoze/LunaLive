// api/src/calls/updater.ts
import type { Pool } from "pg";
import { upsertSlots, type SlotRow, type InsertedSlotRow } from "./catalog.js";
import { normText, keyText } from "./normalize.js";

/**
 * Source: Gamba
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
const INTER_PROVIDER_MS = Math.max(0, Number(process.env.GAMBA_INTER_PROVIDER_MS || 120));
const LOG_NEW_MAX = Math.max(0, Number(process.env.SLOTS_LOG_NEW_MAX || 25));

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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

async function fetchText(url: string, referer?: string) {
  const r = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (LunaLive slots-updater)",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      ...(referer ? { Referer: referer } : {}),
    },
  });
  if (!r.ok) throw new Error(`gamba_http_${r.status}`);
  return await r.text();
}

async function fetchJson(url: string, referer?: string) {
  const r = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (LunaLive slots-updater)",
      Accept: "application/json",
      ...(referer ? { Referer: referer } : {}),
    },
  });
  const txt = await r.text().catch(() => "");
  let j: any = null;
  try {
    j = txt ? JSON.parse(txt) : null;
  } catch {
    j = null;
  }
  if (!r.ok) throw new Error(`gamba_http_${r.status}:${(txt || "").slice(0, 120)}`);
  return j;
}

/** Liste les provider slugs depuis /casino/providers */
async function fetchProviderSlugs(): Promise<string[]> {
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

  return Array.from(out).sort((a, b) => a.localeCompare(b));
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

async function fetchProviderGames(producerSlug: string): Promise<SlotRow[]> {
  const referer = `${GAMBA_BASE}/casino/provider/${producerSlug}`;
  const out: SlotRow[] = [];

  let page = 1;
  let guard = 0;

  while (true) {
    guard++;
    if (guard > 500) break;

    const url = buildGambaUrl(producerSlug, GAMBA_FIRST, page, GAMBA_GAMESEARCH_SHA);
    const j = (await fetchJson(url, referer)) as GameSearchResp;

    const gs = j?.data?.gameSearch;
    const items = Array.isArray(gs?.data) ? gs!.data! : [];
    const pi = gs?.paginatorInfo;

    for (const it of items) {
      if (!it) continue;

      const name = String(it.title || it.name || "").trim();
      if (!name) continue;

      // image: on tente plusieurs clés
      let img: string | null = null;
      if (typeof it.thumbnailUrl === "string" && it.thumbnailUrl.trim()) img = it.thumbnailUrl.trim();
      else if (typeof it.coverUrl === "string" && it.coverUrl.trim()) img = it.coverUrl.trim();
      else if (typeof it.imageUrl === "string" && it.imageUrl.trim()) img = it.imageUrl.trim();

      // ✅ provider = slug brut (normalisé ensuite dans upsertSlots via provider_aliases)
      out.push({ name, provider: producerSlug, imageUrl: img });
    }

    if (!pi?.hasMorePages) break;
    page++;
    await sleep(120);
  }

  return out;
}

async function countExistingKeys(pool: Pool, keys: string[]): Promise<number> {
  if (!keys.length) return 0;
  const { rowCount } = await pool.query(`SELECT name_key FROM slots_catalog WHERE name_key = ANY($1::text[])`, [keys]);
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
    const providers = await fetchProviderSlugs();

    console.log(`[slots-updater] gamba providers=${providers.length} first=${GAMBA_FIRST}`);

    let totalFetchedRaw = 0;
    const allInserted: InsertedSlotRow[] = [];

    for (const producerSlug of providers) {
      console.log(`[slots-updater] ▶ provider ${producerSlug}`);

      let rows: SlotRow[] = [];
      try {
        rows = await fetchProviderGames(producerSlug);
      } catch (e: any) {
        console.warn(`[slots-updater] skip provider=${producerSlug} err=${String(e?.message || e)}`);
        if (INTER_PROVIDER_MS) await sleep(INTER_PROVIDER_MS);
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
          const nextImg = r.imageUrl ? String(r.imageUrl) : null;
          const prevImg = prev.imageUrl ? String(prev.imageUrl) : null;
          uniq.set(k, { name: nm, provider: r.provider, imageUrl: prevImg || nextImg || null });
        }
      }

      const dupInBatch = Math.max(0, rows.length - uniq.size);
      const keys = Array.from(uniq.keys());
      const alreadyInDb = await countExistingKeys(pool, keys);

      console.log(
        `[slots-updater]   fetched=${rows.length} unique=${uniq.size} dupInBatch=${dupInBatch} alreadyInDb=${alreadyInDb}`
      );

      const inserted = await upsertSlots(pool, Array.from(uniq.values()));
      allInserted.push(...inserted);

      if (inserted.length) {
        const names = inserted.map((x) => x.name).sort((a, b) => a.localeCompare(b));
        const show = sample(names, LOG_NEW_MAX);
        console.log(
          `[slots-updater]   ✅ inserted=${inserted.length} new=[${show.join(" • ")}${names.length > show.length ? " …" : ""}]`
        );
      } else {
        console.log(`[slots-updater]   ✅ inserted=0`);
      }

      console.log(`[slots-updater] ◀ provider done ${producerSlug}`);

      if (INTER_PROVIDER_MS) await sleep(INTER_PROVIDER_MS);
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
