// web/src/lib/api_casinos.ts
const BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");
export const API_BASE = BASE;

function findJwtInStorage(): string | null {
  const rx = /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/; // JWT-like

  const storages: Storage[] = [];
  try {
    if (typeof localStorage !== "undefined") storages.push(localStorage);
  } catch {}
  try {
    if (typeof sessionStorage !== "undefined") storages.push(sessionStorage);
  } catch {}

  for (const st of storages) {
    try {
      for (let i = 0; i < st.length; i++) {
        const k = st.key(i);
        if (!k) continue;
        const v = st.getItem(k);
        if (v && rx.test(v)) return v;
      }
    } catch {}
  }
  return null;
}

function withAuth(init: RequestInit = {}, requireToken = false): RequestInit {
  const token = findJwtInStorage();
  if (requireToken && !token) {
    // ça évite de spam des 401 si l’utilisateur n’est pas connecté
    throw new Error("unauthorized");
  }

  const headers = new Headers(init.headers as any);
  if (token) headers.set("authorization", `Bearer ${token}`);

  return { ...init, headers };
}

async function j<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${BASE}${path}`, init);
  const text = await r.text().catch(() => "");
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {}
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
  kind?: "bonus" | "streamer";
  ownerUserId: number | null;
  label: string | null;
  pinnedRank: number | null;
  ownerUsername: string | null;
  streamer: null | {
    slug: string;
    displayName: string;
    followsCount: number;
    avatarUrl?: string | null;
  };
  goUrl: string; // maintenant ABSOLU côté API
  targetUrl?: string; // optionnel (fallback)
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

export async function getCasinoComments(
  slug: string,
  params: { sort?: "new" | "useful"; limit?: number; cursor?: string | null }
): Promise<CasinoCommentsResp> {
  const q = new URLSearchParams();
  if (params.sort) q.set("sort", params.sort);
  if (params.limit) q.set("limit", String(params.limit));
  if (params.cursor) q.set("cursor", params.cursor);
  const qs = q.toString();
  return j(`/casinos/${encodeURIComponent(slug)}/comments${qs ? `?${qs}` : ""}`);
}

export async function setCasinoRating(casinoId: string, rating: number): Promise<{ ok: true }> {
  const init = withAuth(
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rating }),
    },
    true
  );
  return j(`/me/casinos/${casinoId}/rating`, init);
}

export async function postCasinoComment(
  casinoId: string,
  body: string,
  images: File[]
): Promise<{ ok: true; id: string; status: string }> {
  const trimmed = String(body ?? "").trim();
  if (!trimmed && (!images || images.length === 0)) {
    throw new Error("empty_body");
  }

  const fd = new FormData();
  fd.set("body", trimmed);
  for (const f of (images || []).slice(0, 3)) fd.append("images", f);

  const init = withAuth(
    {
      method: "POST",
      body: fd, // ⚠️ surtout pas de content-type ici
    },
    true
  );

  return j(`/me/casinos/${casinoId}/comments`, init);
}

export async function reactToCasinoComment(commentId: string, kind: "up" | "down" | null): Promise<{ ok: true }> {
  const init = withAuth(
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind }),
    },
    true
  );
  return j(`/me/casinos/comments/${commentId}/reaction`, init);
}
