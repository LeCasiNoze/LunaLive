const BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

export type FsbAffiPage = {
  id: number;
  slug: string;
  model: number;
  variant: string | null;
  brandName: string;
  title: string;
  config: Record<string, any>;
  editorVersion?: number;
  ownerUserId: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type UpsertAffiPagePayload = {
  slug?: string | null;
  model: number;
  variant?: string | null;
  brandName: string;
  title: string;
  config: Record<string, any>;
  editorVersion?: number;
};

async function request<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${BASE}${path}`, init);
  const text = await response.text().catch(() => "");

  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(String(data?.error || data?.message || `API ${response.status}`));
  }

  return data as T;
}

export function listFsbAffiPages(token: string) {
  return request<{ ok: true; items: FsbAffiPage[] }>("/api/fsb/affi-pages", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function createFsbAffiPage(token: string, payload: UpsertAffiPagePayload) {
  return request<{ ok: true; item: FsbAffiPage }>("/api/fsb/affi-pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export function updateFsbAffiPage(token: string, id: number, payload: UpsertAffiPagePayload) {
  return request<{ ok: true; item: FsbAffiPage }>(`/api/fsb/affi-pages/${encodeURIComponent(String(id))}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export function deleteFsbAffiPage(token: string, id: number) {
  return request<{ ok: true }>(`/api/fsb/affi-pages/${encodeURIComponent(String(id))}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function getPublicAffiPage(slug: string) {
  // Prefetch hint injecte par index.html : si le fetch a deja demarre avant
  // que React ne boot, on attend simplement la promesse au lieu de relancer.
  const cache = (typeof window !== "undefined" ? (window as any).__affiPrefetch : null) as Record<string, Promise<any>> | null;
  const key = String(slug || "").toLowerCase();
  const prefetched = cache ? cache[key] : null;
  if (prefetched) {
    try {
      const data = await prefetched;
      if (data && data.ok && data.page) return data as { ok: true; page: FsbAffiPage };
    } catch { /* fallback ci-dessous */ }
  }
  return request<{ ok: true; page: FsbAffiPage }>(`/api/public/affi-pages/${encodeURIComponent(slug)}`);
}

export type AffiPageStats = {
  views: number;
  uniqueViews: number;
  clicks: number;
  uniqueClicks: number;
  ctr: number;
  uniqueCtr: number;
  periodDays: number;
};

export function getFsbAffiPageStats(token: string, id: number, days = 30) {
  return request<{ ok: true; stats: AffiPageStats }>(
    `/api/fsb/affi-pages/${encodeURIComponent(String(id))}/stats?days=${days}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

export function getFsbAffiStatsSummary(token: string, days = 30) {
  return request<{ ok: true; byPage: Record<string, AffiPageStats>; periodDays: number }>(
    `/api/fsb/affi-pages/stats-summary?days=${days}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

export type AffiDailyPoint = {
  date: string;
  views: number;
  clicks: number;
  uniqueViews: number;
  uniqueClicks: number;
};

export function getFsbAffiDailyStats(token: string, id: number, days = 30) {
  return request<{ ok: true; series: AffiDailyPoint[]; periodDays: number }>(
    `/api/fsb/affi-pages/${encodeURIComponent(String(id))}/daily-stats?days=${days}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

export type SocialProfileResponse = {
  ok: true;
  network: "tiktok" | "instagram" | null;
  handle: string;
  displayName: string | null;
  followers: number | null;
  followersLabel: string;
  socialHandle: string;
};

export function fetchSocialProfile(token: string, url: string) {
  return request<SocialProfileResponse>(`/api/fsb/social-profile`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
}
