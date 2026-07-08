// web/src/lib/api_events.ts
import { loadToken } from "./storage";

const BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

async function j<T>(path: string, init: RequestInit = {}): Promise<T> {
  const usedAuth =
    typeof init.headers === "object" && init.headers ? (init.headers as any)?.Authorization : null;

  const usedToken =
    typeof usedAuth === "string" && usedAuth.startsWith("Bearer ") ? usedAuth.slice(7) : null;

  const r = await fetch(`${BASE}${path}`, init);

  // même logique que ton api.ts (logout only si token courant)
  if (r.status === 401 && !path.startsWith("/admin/")) {
    const currentToken = loadToken();
    if (currentToken && usedToken && currentToken === usedToken) {
      try {
        window.dispatchEvent(new CustomEvent("auth:unauthorized"));
      } catch {}
    }
  }

  const text = await r.text().catch(() => "");
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!r.ok) {
    const msg =
      data?.error ||
      data?.message ||
      (text && text.length < 200 ? text : null) ||
      `API ${r.status}`;
    throw new Error(String(msg));
  }

  return data as T;
}

export type ApiEventRow = {
  id: number;
  type: string;
  cycle_index: number;
  start_at: string;
  end_at: string;
  state: "scheduled" | "live" | "closed";
  config?: any;
  result?: any;
  created_at: string;
  updated_at: string;
};

export type ApiViewerWeekRules = {
  pointsPerMinute: number;
  topN: number;
  capsPerDay?: Record<string, number>;
  values?: Record<string, number>;
};

export type ApiViewerWeekTopRow = {
  rank: number | null;
  userId: number;
  username: string;
  points: number;
  minutesPoints?: number;
  dayBonusPoints?: number;
  claimPoints?: number;
  wheelPoints?: number;
  callsPoints?: number;
  predJoinPoints?: number;
  predWinPoints?: number;
  chatPoints?: number;
};

export type ApiViewerWeekMe = ApiViewerWeekTopRow | null;

export type ApiViewerWeekResp = {
  ok: true;
  event: ApiEventRow;
  rules: ApiViewerWeekRules;
  top: ApiViewerWeekTopRow[];
  me: ApiViewerWeekMe;
};

export async function getCurrentEvent() {
  return j<{ ok: true; event: ApiEventRow | null }>("/api/events/current");
}

export async function getCurrentViewerWeek(token: string) {
  return j<ApiViewerWeekResp>("/api/events/current/viewer-week", {
    headers: { Authorization: `Bearer ${token}` },
  });
}
