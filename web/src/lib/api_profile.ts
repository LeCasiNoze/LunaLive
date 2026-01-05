// web/src/lib/api_profile.ts
const BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

function apiUrl(path: string) {
  return `${BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}

function safeJson(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const text = await res.text();
  const data = text ? safeJson(text) : null;

  if (!res.ok) {
    const msg =
      (data && (data.error || data.message)) ||
      `${res.status} ${res.statusText}` ||
      "Request failed";
    throw new Error(msg);
  }
  return data as T;
}

export type ApiFollowing = {
  id?: string | null;
  slug: string;
  displayName?: string | null;
  isLive?: boolean | null;
  notifyEnabled?: boolean | null;
  followedAt?: string | null;
};

export async function myFollowing(
  token: string,
  opts: { q?: string; limit?: number } = {}
): Promise<{ ok: true; items: ApiFollowing[] }> {
  const q = (opts.q ?? "").trim();
  const limit = Math.max(1, Math.min(200, opts.limit ?? 80));
  const url = new URL(apiUrl("/me/following"));
  if (q) url.searchParams.set("q", q);
  url.searchParams.set("limit", String(limit));

  return fetchJson(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export type ApiProfileStats = {
  ok: true;

  // Account
  accountAgeDays?: number | null;

  // Social
  followingCount?: number | null;

  // Chat
  chatMessagesTotal?: number | null;
  mostActiveChatHour?: number | null; // 0..23
  mostActiveChatDow?: number | null; // 0..6 (dimanche..samedi)
  topStreamersByMessages?: Array<{ slug: string; displayName: string; messages: number }>;

  // Watch
  watchSecondsTotal?: number | null;
  topStreamerByWatch?: null | { slug: string; displayName: string; seconds: number };
  topStreamersByWatch?: Array<{ slug: string; displayName: string; seconds: number }>;

  // Economy
  rubisEarnedTotal?: number | null;
  rubisSpentTotal?: number | null;
  rubisSupportTotal?: number | null;
  rubisBurnTotal?: number | null;

  // Fun extras
  dailyWheelSpinsTotal?: number | null;
  dailyWheelRubisTotal?: number | null;
  dailyBonusClaimsTotal?: number | null;
  achievementsUnlockedTotal?: number | null;
  entitlementsTotal?: number | null;
  chestRubisWonTotal?: number | null;
  subGiftsClaimedTotal?: number | null;
};

export async function myProfileStats(token: string): Promise<ApiProfileStats> {
  return fetchJson(apiUrl("/me/stats"), {
    headers: { Authorization: `Bearer ${token}` },
  });
}
