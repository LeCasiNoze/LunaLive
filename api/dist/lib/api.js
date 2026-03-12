const BASE = import.meta.env.VITE_API_BASE || "";
export async function getLives() {
    const r = await fetch(`${BASE}/lives`);
    if (!r.ok)
        throw new Error(`API ${r.status}`);
    return (await r.json());
}
