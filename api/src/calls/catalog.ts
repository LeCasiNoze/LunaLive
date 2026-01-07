// api/src/calls/catalog.ts
import type { Pool } from "pg";
import { normText, keyText } from "./normalize.js";
import { normalizeProvider } from "./provider_aliases.js";

export type SlotRow = {
  name: string;
  provider: string | null;
};

export type InsertedSlotRow = {
  name: string;
  provider: string | null; // provider_norm canonique si dispo
  slotKey: string; // name_key
};

export async function upsertSlots(pool: Pool, items: SlotRow[]): Promise<InsertedSlotRow[]> {
  if (!items.length) return [];

  // ✅ dédup obligatoire: évite "ON CONFLICT DO UPDATE command cannot affect row a second time"
  const byKey = new Map<
    string,
    { name: string; nameKey: string; providerRaw: string | null; providerNorm: string | null }
  >();

  for (const it of items) {
    const name = normText(it.name);
    if (!name) continue;

    const nameKey = keyText(name);
    if (!nameKey) continue;

    const providerRaw = it.provider ? normText(it.provider) : null;
    const providerNorm = providerRaw ? normalizeProvider(providerRaw) : null;

    // Si doublon dans le batch, on garde le 1er (ou le dernier, au choix).
    if (!byKey.has(nameKey)) {
      byKey.set(nameKey, { name, nameKey, providerRaw, providerNorm });
    }
  }

  if (!byKey.size) return [];

  const values: any[] = [];
  const chunks: string[] = [];
  let i = 1;

  for (const v of byKey.values()) {
    values.push(v.name, v.nameKey, v.providerRaw, v.providerNorm);
    chunks.push(`($${i++}, $${i++}, $${i++}, $${i++})`);
  }

  /**
   * ✅ Trick Postgres:
   * RETURNING (xmax = 0) => ligne réellement insérée
   */
  const { rows } = await pool.query(
    `
    WITH upserted AS (
      INSERT INTO slots_catalog (name, name_key, provider, provider_norm)
      VALUES ${chunks.join(",")}
      ON CONFLICT (name_key) DO UPDATE
        SET name = EXCLUDED.name,
            provider = EXCLUDED.provider,
            provider_norm = EXCLUDED.provider_norm,
            updated_at = NOW()
      RETURNING
        name,
        name_key AS "slotKey",
        provider_norm AS "providerNorm",
        (xmax = 0) AS "wasInserted"
    )
    SELECT name, "slotKey", "providerNorm"
    FROM upserted
    WHERE "wasInserted" = TRUE
    `,
    values
  );

  return (rows || []).map((r: any) => ({
    name: String(r.name),
    slotKey: String(r.slotKey),
    provider: r.providerNorm ? String(r.providerNorm) : null,
  }));
}

function tokenize(s: string) {
  return keyText(s)
    .split(/[^a-z0-9']+/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function scoreCandidate(qKey: string, qToks: string[], nameKey: string) {
  if (!nameKey) return 0;

  if (nameKey === qKey) return 1000;
  if (nameKey.startsWith(qKey)) return 700;
  if (nameKey.includes(qKey)) return 520;

  const toks = tokenize(nameKey);
  let hit = 0;
  for (const t of qToks) {
    if (!t) continue;
    if (toks.includes(t)) hit += 2;
    else if (toks.some((x) => x.startsWith(t))) hit += 1;
  }

  const lenPenalty = Math.max(0, Math.min(20, Math.floor(Math.abs(nameKey.length - qKey.length) / 3)));
  return hit * 60 - lenPenalty;
}

export async function searchSlots(pool: Pool, qRaw: string, limit: number) {
  const q = normText(qRaw);
  const qKey = keyText(q);
  if (!qKey) return [];

  const like = `%${qKey}%`;
  const r = await pool.query(
    `
    SELECT name, name_key AS "nameKey", provider_norm AS "provider"
    FROM slots_catalog
    WHERE name_key ILIKE $1
    ORDER BY updated_at DESC
    LIMIT 80
    `,
    [like]
  );

  const qToks = tokenize(qKey);

  const scored = r.rows
    .map((row: any) => ({
      name: String(row.name),
      nameKey: String(row.nameKey),
      provider: row.provider ? String(row.provider) : null,
      s: scoreCandidate(qKey, qToks, String(row.nameKey)),
    }))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit);

  return scored.map((x) => ({ name: x.name, provider: x.provider }));
}

export async function resolveSlot(
  pool: Pool,
  input: string
): Promise<{ name: string; provider: string | null } | null> {
  const q = normText(input);
  const qKey = keyText(q);
  if (!qKey) return null;

  const exact = await pool.query(
    `SELECT name, provider_norm AS provider FROM slots_catalog WHERE name_key=$1 LIMIT 1`,
    [qKey]
  );
  if (exact.rows?.[0]) {
    return {
      name: String(exact.rows[0].name),
      provider: exact.rows[0].provider ? String(exact.rows[0].provider) : null,
    };
  }

  const cand = await searchSlots(pool, q, 10);
  if (!cand.length) return null;
  if (qKey.length < 3) return null;

  return { name: cand[0].name, provider: cand[0].provider };
}
