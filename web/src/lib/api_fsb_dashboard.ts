import { loadToken } from "./storage";

export type FsbInstagramStatus = "scheduled" | "uploading" | "done" | "error" | string;

export type FsbInstagramSummary = {
  totalInRange: number;
  scheduledInRange: number;
  publishedInRange: number;
  errorsInRange: number;
  uploadingInRange: number;
  publishedAllTime: number;
  upcomingAllTime: number;
};

export type FsbInstagramItem = {
  id: number;
  clipId: number | null;
  title: string;
  description: string | null;
  status: FsbInstagramStatus;
  scheduledAt: string | null;
  scheduledDay: string | null;
  scheduledTime: string | null;
  platformUrl: string | null;
  errorMessage: string | null;
  createdAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  outputUrl: string | null;
  thumbnailUrl: string | null;
  streamerSlug: string | null;
  streamerName: string | null;
};

export type FsbRecentPublishedItem = {
  id: number;
  clipId: number | null;
  title: string;
  platformUrl: string | null;
  finishedAt: string | null;
  thumbnailUrl: string | null;
};

export type FsbInstagramTimelinePoint = {
  day: string;
  totalCount: number;
  scheduledCount: number;
  publishedCount: number;
  errorCount: number;
  uploadingCount: number;
};

export type FsbInstagramTopStreamer = {
  streamerSlug: string | null;
  streamerName: string | null;
  totalCount: number;
  scheduledCount: number;
  publishedCount: number;
  errorCount: number;
  uploadingCount: number;
};

export type FsbInstagramErrorItem = {
  id: number;
  clipId: number | null;
  title: string;
  scheduledAt: string | null;
  errorMessage: string | null;
  platformUrl: string | null;
  outputUrl: string | null;
  thumbnailUrl: string | null;
  streamerSlug: string | null;
  streamerName: string | null;
};

export type FsbInstagramDashboardResponse = {
  ok: true;
  range: { from: string; to: string };
  summary: FsbInstagramSummary;
  items: FsbInstagramItem[];
  recentPublished: FsbRecentPublishedItem[];
  timeline: FsbInstagramTimelinePoint[];
  topStreamers: FsbInstagramTopStreamer[];
  recentErrors: FsbInstagramErrorItem[];
};

const BASE = (
  (import.meta.env.VITE_API_BASE ??
    import.meta.env.VITE_API_URL ??
    "https://lunalive-api.onrender.com") as string
).replace(/\/$/, "");

async function request<T>(path: string, init: RequestInit = {}) {
  const token = loadToken();
  const headers = new Headers(init.headers || {});

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

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
      data?.error ||
        data?.message ||
        (text && text.length < 200 ? text : null) ||
        `API ${response.status}`
    );
  }

  return data as T;
}

export function getFsbInstagramDashboard(range: { from: string; to: string }) {
  const params = new URLSearchParams();
  params.set("from", range.from);
  params.set("to", range.to);
  return request<FsbInstagramDashboardResponse>(`/api/fsb/dashboard/instagram?${params.toString()}`);
}
