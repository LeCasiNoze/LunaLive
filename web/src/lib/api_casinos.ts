// web/src/lib/api_casinos.ts
const BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");
export const API_BASE = BASE;

async function j<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${BASE}${path}`, init);
  const text = await r.text().catch(() => "");
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!r.ok) throw new Error(String(data?.error || data?.message || text || `API ${r.status}`));
  return data as T;
}

export type CasinoListItem = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  status: string;
  createdAt: string;
  featuredRank: number | null;
  bonusHeadline: string | null;
  watchLevel: "none" | "watch" | "avoid";
  watchReason: string | null;
  avgRating: number;
  ratingsCount: number;
};

export type CasinoListResp = {
  ok: true;
  podium: CasinoListItem[];
  watchlist: CasinoListItem[];
  casinos: CasinoListItem[];
};

export async function listCasinos(opts: { sort: "top" | "newest"; q: string | null }): Promise<CasinoListResp> {
  const qs = new URLSearchParams();
  qs.set("sort", opts.sort);
  if (opts.q) qs.set("q", opts.q);
  return j<CasinoListResp>(`/casinos?${qs.toString()}`);
}
export function absApiUrl(u: string | null): string | null {
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("/")) return `${BASE}${u}`;
  return `${BASE}/${u}`;
}

export type CasinosListResp = {
  ok: true;
  podium: CasinoListItem[];
  casinos: CasinoListItem[];
  watchlist: CasinoListItem[];
};

export async function getCasinos(params: {
  search?: string;
  sort?: "top" | "rating" | "reviews" | "new" | "featured";
}): Promise<CasinosListResp> {
  const q = new URLSearchParams();
  if (params.search) q.set("search", params.search);
  if (params.sort) q.set("sort", params.sort);
  const qs = q.toString();
  return j(`/casinos${qs ? `?${qs}` : ""}`);
}

export type CasinoDetail = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  status: "published" | "hidden" | "disabled";
  createdAt: string;
  featuredRank: number | null;
  bonusHeadline: string | null;
  description: string | null;
  pros: any; // jsonb []
  cons: any; // jsonb []
  teamRating: number | null;
  teamReview: string | null;
  watchLevel: "none" | "watch" | "avoid";
  watchReason: string | null;
  watchUpdatedAt: string | null;
};

export type CasinoLink = {
  id: string;
  ownerUserId: number | null;
  label: string | null;
  pinnedRank: number | null;
  ownerUsername: string | null;
  streamer: null | {
    slug: string;
    displayName: string;
    followsCount: number;
  };
  goUrl: string; // /go/casino/:id/link/:linkId
};

export type CasinoDetailResp = {
  ok: true;
  casino: CasinoDetail;
  stats: { avgRating: number; ratingsCount: number };
  bonusLink: CasinoLink | null;
  links: CasinoLink[];
};

export async function getCasino(slug: string): Promise<CasinoDetailResp> {
  return j(`/casinos/${encodeURIComponent(slug)}`);
}

export type CasinoComment = {
  id: string;
  body: string;
  createdAt: string;
  userId: number;
  username: string;
  hasImages: boolean;
  authorRating: number | null;
  upCount: number;
  downCount: number;
  myReaction: "up" | "down" | null;
  images: Array<{ url: string; w: number | null; h: number | null; sizeBytes: number | null }>;
};

export type CasinoCommentsResp = {
  ok: true;
  items: CasinoComment[];
  nextCursor: string | null;
};

export async function getCasinoComments(slug: string, params: {
  sort?: "new" | "useful";
  limit?: number;
  cursor?: string | null;
}): Promise<CasinoCommentsResp> {
  const q = new URLSearchParams();
  if (params.sort) q.set("sort", params.sort);
  if (params.limit) q.set("limit", String(params.limit));
  if (params.cursor) q.set("cursor", params.cursor);
  const qs = q.toString();
  return j(`/casinos/${encodeURIComponent(slug)}/comments${qs ? `?${qs}` : ""}`);
}

export async function setCasinoRating(casinoId: string, rating: number): Promise<{ ok: true }> {
  return j(`/me/casinos/${casinoId}/rating`, {
    method: "PUT",
    body: JSON.stringify({ rating }),
  });
}

export async function postCasinoComment(casinoId: string, body: string, images: File[]): Promise<{ ok: true; id: string; status: string }> {
  const fd = new FormData();
  fd.set("body", body);
  for (const f of images.slice(0, 3)) fd.append("images", f);

  return j(`/me/casinos/${casinoId}/comments`, {
    method: "POST",
    body: fd,
    // headers auto (pas de content-type ici)
  });
}

export async function reactToCasinoComment(commentId: string, kind: "up" | "down" | null): Promise<{ ok: true }> {
  return j(`/me/casinos/comments/${commentId}/reaction`, {
    method: "POST",
    body: JSON.stringify({ kind }),
  });
}
