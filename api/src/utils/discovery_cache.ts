export function createDiscoveryCache<T>(ttlMs: number, capacity = 500, now = Date.now) {
  const entries = new Map<string, { expires: number; result: Promise<T> }>();
  return (key: string, discover: () => Promise<T>): Promise<T> => {
    const hit = entries.get(key);
    if (hit && hit.expires > now()) return hit.result;
    entries.delete(key);
    while (entries.size >= capacity) entries.delete(entries.keys().next().value!);
    const entry = { expires: now() + ttlMs, result: Promise.resolve().then(discover) };
    entries.set(key, entry);
    // Cache null/offline results too, but never retain rejected requests.
    void entry.result.catch(() => { if (entries.get(key) === entry) entries.delete(key); });
    return entry.result;
  };
}
