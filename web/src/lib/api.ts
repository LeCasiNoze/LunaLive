export type ApiLive = {
  id: string;
  slug: string;
  displayName: string;
  title: string;
  viewers: number;
};

const BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

export async function getLives(): Promise<ApiLive[]> {
  const r = await fetch(`${BASE}/lives`);
  if (!r.ok) throw new Error(`API ${r.status}`);
  return (await r.json()) as ApiLive[];
}

export async function getStreamer(slug: string): Promise<ApiLive> {
  const r = await fetch(`${BASE}/streamers/${encodeURIComponent(slug)}`);
  if (!r.ok) throw new Error(`API ${r.status}`);
  return (await r.json()) as ApiLive;
}
