import { normText, keyText } from "./normalize.js";
import { normalizeProvider } from "./provider_aliases.js";
export async function upsertSlots(pool, items) {
    if (!items.length)
        return [];
    const values = [];
    const chunks = [];
    let i = 1;
    // de-dup en mémoire (évite gros doublons)
    const seen = new Set();
    for (const it of items) {
        const name = normText(it.name);
        if (!name)
            continue;
        const slotKey = keyText(name);
        if (!slotKey)
            continue;
        const providerRaw = it.provider ? normText(it.provider) : null;
        const providerNorm = providerRaw ? normalizeProvider(providerRaw) : null;
        const dedupKey = `${slotKey}::${providerNorm ?? ""}`;
        if (seen.has(dedupKey))
            continue;
        seen.add(dedupKey);
        values.push(name, slotKey, providerRaw, providerNorm);
        chunks.push(`($${i++}, $${i++}, $${i++}, $${i++})`);
    }
    if (!chunks.length)
        return [];
    // ✅ IMPORTANT: "ajoute seulement si pas déjà en DB"
    // On ne touche pas aux existants -> ON CONFLICT DO NOTHING
    const r = await pool.query(`
    INSERT INTO slots_catalog (name, name_key, provider, provider_norm)
    VALUES ${chunks.join(",")}
    ON CONFLICT (name_key) DO NOTHING
    RETURNING
      name,
      name_key AS "slotKey",
      provider_norm AS "provider"
    `, values);
    return (r.rows || []).map((x) => ({
        name: String(x.name),
        slotKey: String(x.slotKey),
        provider: x.provider ? String(x.provider) : null,
    }));
}
function tokenize(s) {
    return keyText(s)
        .split(/[^a-z0-9']+/g)
        .map((x) => x.trim())
        .filter(Boolean);
}
// scoring simple sans extension
function scoreCandidate(qKey, qToks, nameKey) {
    if (!nameKey)
        return 0;
    if (nameKey === qKey)
        return 1000;
    if (nameKey.startsWith(qKey))
        return 700;
    if (nameKey.includes(qKey))
        return 520;
    const toks = tokenize(nameKey);
    let hit = 0;
    for (const t of qToks) {
        if (!t)
            continue;
        if (toks.includes(t))
            hit += 2;
        else if (toks.some((x) => x.startsWith(t)))
            hit += 1;
    }
    const lenPenalty = Math.max(0, Math.min(20, Math.floor(Math.abs(nameKey.length - qKey.length) / 3)));
    return hit * 60 - lenPenalty;
}
export async function searchSlots(pool, qRaw, limit) {
    const q = normText(qRaw);
    const qKey = keyText(q);
    if (!qKey)
        return [];
    const like = `%${qKey}%`;
    const r = await pool.query(`
    SELECT name, name_key AS "nameKey", provider_norm AS "provider"
    FROM slots_catalog
    WHERE name_key ILIKE $1
    ORDER BY updated_at DESC
    LIMIT 80
    `, [like]);
    const qToks = tokenize(qKey);
    const scored = r.rows
        .map((row) => ({
        name: String(row.name),
        nameKey: String(row.nameKey),
        provider: row.provider ? String(row.provider) : null,
        s: scoreCandidate(qKey, qToks, String(row.nameKey)),
    }))
        .sort((a, b) => b.s - a.s)
        .slice(0, limit);
    return scored.map((x) => ({ name: x.name, provider: x.provider }));
}
export async function resolveSlot(pool, input) {
    const q = normText(input);
    const qKey = keyText(q);
    if (!qKey)
        return null;
    const exact = await pool.query(`SELECT name, provider_norm AS provider FROM slots_catalog WHERE name_key=$1 LIMIT 1`, [qKey]);
    if (exact.rows?.[0]) {
        return {
            name: String(exact.rows[0].name),
            provider: exact.rows[0].provider ? String(exact.rows[0].provider) : null,
        };
    }
    const cand = await searchSlots(pool, q, 10);
    if (!cand.length)
        return null;
    if (qKey.length < 3)
        return null;
    return { name: cand[0].name, provider: cand[0].provider };
}
