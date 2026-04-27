import { loadToken } from "./storage";

export type TikTokInfluencerStatus =
  | "new"
  | "no_email"
  | "queued"
  | "contacted"
  | "replied"
  | "interested"
  | "declined"
  | "blacklisted";

export type TikTokInfluencer = {
  id: string;
  handle: string;
  profileUrl: string;
  displayName: string | null;
  bio: string | null;
  email: string | null;
  followerCount: number | null;
  followingCount: number | null;
  heartCount: number | null;
  videoCount: number | null;
  verified: boolean;
  country: string | null;
  avatarUrl: string | null;
  status: TikTokInfluencerStatus;
  notes: string | null;
  lastEmailSentAt: string | null;
  replyReceivedAt: string | null;
  replyExcerpt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type TikTokOutreachStats = {
  total: number;
  withEmail: number;
  contacted: number;
  replied: number;
  interested: number;
  declined: number;
  noEmail: number;
  pending: number;
};

export type TikTokListResponse = {
  ok: true;
  mailReady: boolean;
  stats: TikTokOutreachStats;
  influencers: TikTokInfluencer[];
};

export type TikTokOutreachMessage = {
  id: string;
  direction: "out" | "in";
  subject: string | null;
  body: string;
  sentAt: string | null;
  success: boolean;
  errorMessage: string | null;
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

  const response = await fetch(`${BASE}${path}`, { ...init, headers });

  if (response.status === 401 && token && token === loadToken()) {
    try {
      window.dispatchEvent(new CustomEvent("auth:unauthorized"));
    } catch {}
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

export function listTikTokInfluencers(status?: TikTokInfluencerStatus | "all") {
  const suffix = status && status !== "all" ? `?status=${encodeURIComponent(status)}` : "";
  return request<TikTokListResponse>(`/api/fsb/tiktok/list${suffix}`);
}

export function scanTikTokProfile(input: string) {
  return request<{ ok: true; influencer: TikTokInfluencer }>(`/api/fsb/tiktok/scan`, {
    method: "POST",
    body: JSON.stringify({ input }),
  });
}

export function contactTikTokInfluencer(id: string, payload?: { subject?: string; body?: string }) {
  return request<{ ok: true; influencer: TikTokInfluencer }>(
    `/api/fsb/tiktok/${encodeURIComponent(id)}/contact`,
    {
      method: "POST",
      body: JSON.stringify(payload || {}),
    }
  );
}

export function setTikTokInfluencerStatus(id: string, status: TikTokInfluencerStatus, notes?: string) {
  return request<{ ok: true; influencer: TikTokInfluencer }>(
    `/api/fsb/tiktok/${encodeURIComponent(id)}/status`,
    {
      method: "POST",
      body: JSON.stringify({ status, notes }),
    }
  );
}

export function logTikTokReply(id: string, excerpt: string, interested: boolean) {
  return request<{ ok: true; influencer: TikTokInfluencer }>(
    `/api/fsb/tiktok/${encodeURIComponent(id)}/reply`,
    {
      method: "POST",
      body: JSON.stringify({ excerpt, interested }),
    }
  );
}

export function deleteTikTokInfluencer(id: string) {
  return request<{ ok: true; id: string }>(`/api/fsb/tiktok/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function listTikTokMessages(id: string) {
  return request<{ ok: true; messages: TikTokOutreachMessage[] }>(
    `/api/fsb/tiktok/${encodeURIComponent(id)}/messages`
  );
}

// ─── Discovery ─────────────────────────────────────────────────────────────

export type TikTokDiscoverCriteria = {
  hashtags: string[];
  searchQueries?: string[];
  minFollowers?: number;
  maxFollowers?: number;
  countries?: string[];
  requireEmail?: boolean;
  maxProfiles?: number;
};

export type TikTokRunLogEntry = {
  handle?: string;
  tag?: string;
  query?: string;
  reason: string;
  followers?: number | null;
  country?: string | null;
};

export type TikTokOutreachRun = {
  id: string;
  criteria: TikTokDiscoverCriteria;
  status: "running" | "done" | "error" | "canceled";
  candidatesCount: number;
  scannedCount: number;
  keptCount: number;
  droppedCount: number;
  message: string | null;
  log: TikTokRunLogEntry[];
  startedAt: string | null;
  finishedAt: string | null;
};

export function startDiscoveryRun(criteria: TikTokDiscoverCriteria) {
  return request<{ ok: true; runId: string }>(`/api/fsb/tiktok/discover`, {
    method: "POST",
    body: JSON.stringify(criteria),
  });
}

export function getActiveRun() {
  return request<{ ok: true; run: TikTokOutreachRun | null }>(`/api/fsb/tiktok/runs/active`);
}

export function getRun(id: string) {
  return request<{ ok: true; run: TikTokOutreachRun }>(
    `/api/fsb/tiktok/runs/${encodeURIComponent(id)}`
  );
}

export function listRuns() {
  return request<{ ok: true; runs: TikTokOutreachRun[] }>(`/api/fsb/tiktok/runs`);
}

export function cancelRun(id: string) {
  return request<{ ok: true }>(`/api/fsb/tiktok/runs/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
  });
}

export function deleteRun(id: string) {
  return request<{ ok: true; id: string }>(`/api/fsb/tiktok/runs/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function clearRuns() {
  return request<{ ok: true; deleted: number }>(`/api/fsb/tiktok/runs/clear`, {
    method: "POST",
  });
}

export type TikTokImportResult = {
  handle: string;
  status: string;
  email: string | null;
};

export type TikTokImportBulkResponse = {
  ok: true;
  received: number;
  alreadyKnown: number;
  scanned: number;
  withEmail: number;
  failed: number;
  results: TikTokImportResult[];
};

export type TikTokImportBulkPayload = {
  handles: string[];
  source?: string;
  requireEmail?: boolean;
  minFollowers?: number;
  maxFollowers?: number;
  countries?: string[];
};

export function importTikTokBulk(payload: TikTokImportBulkPayload) {
  return request<
    TikTokImportBulkResponse & {
      kept: number;
      droppedNoEmail: number;
      droppedFollowers: number;
      droppedCountry: number;
    }
  >(`/api/fsb/tiktok/import-bulk`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type TikTokEmailTemplate = {
  subject: string;
  body: string;
  replyDomain: string;
};

export function getTikTokTemplate() {
  return request<{ ok: true; template: TikTokEmailTemplate }>(`/api/fsb/tiktok/template`);
}

export function saveTikTokTemplate(template: TikTokEmailTemplate) {
  return request<{ ok: true; template: TikTokEmailTemplate }>(`/api/fsb/tiktok/template`, {
    method: "PUT",
    body: JSON.stringify(template),
  });
}
