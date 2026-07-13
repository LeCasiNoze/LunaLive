import { loadToken } from "./storage";

export type TwitchScoutStreamer = {
  login: string;
  name: string;
  country: string | null;
  language: string | null;
  partner: boolean;
  followers: number;
  live: boolean;
  viewers: number;
  viewersAvg: number;
  viewersPeak: number;
  viewersSamples: number;
  game: string | null;
  title: string | null;
  contactType: string | null;
  contactValue: string | null;
  telegram: string | null;
  email: string | null;
  discord: string | null;
  instagram: string | null;
  hasContact: boolean;
  botStatus: string | null;
  verdictLabel: string | null;
  verdictScore: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
  seenCount: number;
  contacted: boolean;
  contactedAt: string | null;
  contactedChannel: string | null;
};

export type TwitchScoutResponse = {
  ok: true;
  updatedAt: string | null;
  streamers: TwitchScoutStreamer[];
};

const BASE = (
  (import.meta.env.VITE_API_BASE ??
    import.meta.env.VITE_API_URL ??
    "https://lunalive-api.onrender.com") as string
).replace(/\/$/, "");

async function request<T>(path: string, init: RequestInit = {}) {
  const token = loadToken();
  const headers = new Headers(init.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${BASE}${path}`, { ...init, headers });
  if (response.status === 401 && token && token === loadToken()) {
    try {
      window.dispatchEvent(new CustomEvent("auth:unauthorized"));
    } catch {
      // noop
    }
  }
  const text = await response.text().catch(() => "");
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    throw new Error(
      data?.error || data?.message || (text && text.length < 200 ? text : null) || `API ${response.status}`
    );
  }
  return data as T;
}

export function getFsbTwitchScout() {
  return request<TwitchScoutResponse>(`/api/fsb/twitch-scout`);
}

export function markScoutContacted(login: string, channel: string, contacted: boolean) {
  return request<{ ok: true }>(`/api/fsb/twitch-scout/contacted`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login, channel, contacted }),
  });
}
