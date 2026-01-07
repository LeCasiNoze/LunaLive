// api/src/calls/updater.ts
import type { Pool } from "pg";
import { upsertSlots, type SlotRow } from "./catalog.js";

/**
 * MVP: sources configurables (tu brancheras tes fetchers NozeBot ensuite).
 *
 * Env possible:
 *  - SLOTS_SOURCES_JSON='[{"url":"https://.../slots.json","provider":"Pragmatic"}]'
 *
 * Format attendu: un JSON array d'objets, chacun:
 *  - si array de strings: ["Gates of Olympus", ...]
 *  - ou array d'objets: [{name:"...", provider:"..."}, ...]
 */
function parseSources(): { url: string; provider?: string }[] {
  const raw = String(process.env.SLOTS_SOURCES_JSON || "").trim();
  if (!raw) return [];
  try {
    const j = JSON.parse(raw);
    if (!Array.isArray(j)) return [];
    return j
      .map((x: any) => ({ url: String(x?.url || "").trim(), provider: x?.provider ? String(x.provider) : undefined }))
      .filter((x) => x.url);
  } catch {
    return [];
  }
}

async function fetchJson(url: string) {
  const r = await fetch(url, { method: "GET" });
  if (!r.ok) throw new Error(`fetch_failed:${r.status}`);
  return r.json();
}

export async function runSlotsUpdate(pool: Pool): Promise<{ ok: boolean; added: number; error?: string }> {
  const sources = parseSources();
  if (!sources.length) {
    return { ok: true, added: 0 };
  }

  const all: SlotRow[] = [];

  for (const src of sources) {
    const data = await fetchJson(src.url);

    if (Array.isArray(data)) {
      for (const it of data) {
        if (typeof it === "string") all.push({ name: it, provider: src.provider ?? null });
        else if (it && typeof it === "object") {
          const name = String((it as any).name || (it as any).title || "").trim();
          const provider = (it as any).provider ? String((it as any).provider) : src.provider ?? null;
          if (name) all.push({ name, provider });
        }
      }
    } else if (data && typeof data === "object" && Array.isArray((data as any).items)) {
      for (const it of (data as any).items) {
        const name = String(it?.name || it?.title || "").trim();
        const provider = it?.provider ? String(it.provider) : src.provider ?? null;
        if (name) all.push({ name, provider });
      }
    }
  }

  await upsertSlots(pool, all);
  return { ok: true, added: all.length };
}

export function startSlotsUpdater(pool: Pool, everyHours: number) {
  const ms = Math.max(1, Number(everyHours || 12)) * 3600_000;

  const tick = async () => {
    try {
      const r = await runSlotsUpdate(pool);
      console.log(`[slots-updater] ok added=${r.added}`);
    } catch (e: any) {
      console.warn("[slots-updater] failed", e?.message || e);
    }
  };

  // run once at start (soft)
  tick().catch(() => {});
  setInterval(() => tick().catch(() => {}), ms);
}
