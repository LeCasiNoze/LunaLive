// web/src/lib/api_quests.ts
import { loadToken } from "./storage";

export type QuestType = "daily" | "weekly" | "monthly";

export type Quest = {
  code: string;
  type: QuestType;
  title: string;
  description: string | null;
  metric: string;
  target: number;
  rewardRubis: number;
  rewardOrigin: string;
  rewardMeta: any;
  sortOrder: number;
  periodKey: string;
  progress: number;
  completed: boolean;
  claimedAt: string | null;
  claimable: boolean;
  expiresAt: string;
};

export type QuestsResponse = {
  ok: true;
  quests: Quest[];
  claimableCount: number;
};

const BASE = (
  (import.meta.env.VITE_API_BASE ??
    import.meta.env.VITE_API_URL ??
    "https://lunalive-api.onrender.com") as string
).replace(/\/$/, "");

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = loadToken();
  const headers = new Headers(init.headers || {});
  if (init.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await res.text().catch(() => "");
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {}
  if (!res.ok) {
    throw new Error(
      data?.error ||
        data?.message ||
        (text && text.length < 200 ? text : null) ||
        `API ${res.status}`
    );
  }
  return data as T;
}

export function getQuests() {
  return request<QuestsResponse>(`/api/me/quests`);
}

export function claimQuest(code: string) {
  return request<{ ok: true; rewardRubis: number; rewardMeta: any }>(
    `/api/me/quests/${encodeURIComponent(code)}/claim`,
    { method: "POST" }
  );
}
