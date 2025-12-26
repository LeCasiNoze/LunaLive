// web/src/lib/api_admin_casinos.ts
const BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

async function j<T>(path: string, adminKey: string, init: RequestInit = {}): Promise<T> {
  const url = `${BASE}${path.startsWith("/") ? "" : "/"}${path}`;
  const headers = new Headers(init.headers || {});
  headers.set("x-admin-key", adminKey);
  if (!headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) throw new Error(data?.error || `http_${res.status}`);
  return data as T;
}

export type AdminCasino = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  status: "published" | "hidden" | "disabled";
  featuredRank: number | null;
  bonusHeadline: string | null;
  description: string | null;
  pros: any;
  cons: any;
  teamRating: number | null;
  teamReview: string | null;
  watchLevel: "none" | "watch" | "avoid";
  watchReason: string | null;
  avgRating: number;
  ratingsCount: number;
};

export type AdminCasinoLink = {
  id: string;
  casinoId: string;
  ownerUserId: number | null;
  ownerUsername: string | null;
  streamerSlug: string | null;
  streamerDisplayName: string | null;
  label: string | null;
  targetUrl: string;
  enabled: boolean;
  pinnedRank: number | null;
};

export async function adminCasinosList(adminKey: string) {
  return j<{ ok: true; casinos: AdminCasino[] }>("/admin/casinos/listings", adminKey);
}

export async function adminCasinosCreate(adminKey: string, payload: any) {
  return j<{ ok: true; id: string }>("/admin/casinos/listings", adminKey, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function adminCasinosUpdate(adminKey: string, id: string, patch: any) {
  return j<{ ok: true }>(`/admin/casinos/listings/${id}`, adminKey, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function adminCasinoLinksList(adminKey: string, casinoId: string) {
  return j<{ ok: true; links: AdminCasinoLink[] }>(`/admin/casinos/listings/${casinoId}/links`, adminKey);
}

export async function adminCasinoLinksCreate(adminKey: string, casinoId: string, payload: any) {
  return j<{ ok: true; id: string }>(`/admin/casinos/listings/${casinoId}/links`, adminKey, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function adminCasinoLinksUpdate(adminKey: string, linkId: string, patch: any) {
  return j<{ ok: true }>(`/admin/casinos/links/${linkId}`, adminKey, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}
