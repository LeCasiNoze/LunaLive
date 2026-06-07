const BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");
const SNAPSHOT_BASE = (
  import.meta.env.VITE_AFFI_SNAPSHOT_BASE ??
  "https://pub-8163baf5847b4f8999b7c2c6af9c0350.r2.dev/static/affi_pages"
).replace(/\/$/, "");
const PUBLIC_PAGE_CACHE_PREFIX = "affi_page_cache_v1:";
const PUBLIC_PAGE_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type FsbAffiPage = {
  id: number;
  slug: string;
  model: number;
  variant: string | null;
  brandName: string;
  title: string;
  // V1 = Record<string,string> | V2 = arbre V2Page (objets imbriqués).
  // On garde le typage permissif côté API ; le consumer cast selon
  // editorVersion.
  config: Record<string, any>;
  editorVersion?: number;
  publishDomain?: "lunalive" | "landaurax";
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
  publishDomain?: "lunalive" | "landaurax";
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

function publicPageKey(slug: string) {
  return String(slug || "").trim().toLowerCase();
}

function normalizePublicPageData(data: any): { ok: true; page: FsbAffiPage } | null {
  return data && data.ok === true && data.page ? (data as { ok: true; page: FsbAffiPage }) : null;
}

function cachePublicPage(slug: string, data: { ok: true; page: FsbAffiPage }) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      PUBLIC_PAGE_CACHE_PREFIX + publicPageKey(slug),
      JSON.stringify({ t: Date.now(), data })
    );
  } catch {
    // Best effort only: private browsing / quota errors must not block the page.
  }
}

function readCachedPublicPage(slug: string) {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(PUBLIC_PAGE_CACHE_PREFIX + publicPageKey(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || Date.now() - Number(parsed.t || 0) > PUBLIC_PAGE_CACHE_MAX_AGE_MS) return null;
    return normalizePublicPageData(parsed.data);
  } catch {
    return null;
  }
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      credentials: "omit",
      mode: "cors",
      signal: controller.signal,
    });
    const text = await response.text().catch(() => "");
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!response.ok) {
      const error = new Error(String(data?.error || data?.message || `API ${response.status}`));
      (error as any).status = response.status;
      throw error;
    }
    return data;
  } finally {
    window.clearTimeout(timer);
  }
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
  // Hint prefetch depuis index.html : reuse la promesse deja en cours plutot
  // que relancer un fetch (kill ~300ms de TLS handshake + cold-start API).
  const cache = (typeof window !== "undefined" ? (window as any).__affiPrefetch : null) as Record<string, Promise<any>> | null;
  const key = publicPageKey(slug);
  const prefetched = cache ? cache[key] : null;
  if (prefetched) {
    try {
      const data = await prefetched;
      const pageData = normalizePublicPageData(data);
      if (pageData) {
        cachePublicPage(key, pageData);
        return pageData;
      }
    } catch { /* fallback */ }
  }

  let lastError: any = null;
  try {
    const data = await fetchJsonWithTimeout(`${BASE}/api/public/affi-pages/${encodeURIComponent(slug)}`, 2500);
    const pageData = normalizePublicPageData(data);
    if (pageData) {
      cachePublicPage(key, pageData);
      return pageData;
    }
  } catch (e: any) {
    lastError = e;
    if (e?.status === 404 || e?.message === "not_found") throw e;
  }

  try {
    const data = await fetchJsonWithTimeout(`${SNAPSHOT_BASE}/${encodeURIComponent(key)}.json`, 1800);
    const pageData = normalizePublicPageData(data);
    if (pageData) {
      cachePublicPage(key, pageData);
      return pageData;
    }
  } catch (e) {
    lastError = lastError || e;
  }

  const cached = readCachedPublicPage(key);
  if (cached) return cached;
  throw lastError || new Error("landing_unavailable");
}

// V3 analytics
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
