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

export type TikTokExtensionProfile = {
  handle: string;
  displayName?: string | null;
  bio?: string | null;
  bioEmail?: string | null;
  verified?: boolean;
  region?: string | null;
  avatarUrl?: string | null;
  followerCount?: number | null;
  followingCount?: number | null;
  heartCount?: number | null;
  videoCount?: number | null;
};

export type TikTokImportBulkPayload = {
  handles?: string[];
  profiles?: TikTokExtensionProfile[];
  source?: string;
  requireEmail?: boolean;
  minFollowers?: number;
  maxFollowers?: number;
  countries?: string[];
};

export function preflightTikTokHandles(handles: string[]) {
  return request<{ ok: true; fresh: string[]; known: string[] }>(
    `/api/fsb/tiktok/preflight`,
    {
      method: "POST",
      body: JSON.stringify({ handles }),
    }
  );
}

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

// ─── Réseau / seeds ────────────────────────────────────────────────────────

export type TikTokSeed = {
  id: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  notes: string | null;
  isActive: boolean;
  lastNetworkFetchAt: string | null;
  lastNetworkStatus: string | null;
  lastNetworkError: string | null;
  linksCount: number;
  createdAt: string | null;
};

export type TikTokNetworkSignalType =
  | "comment"
  | "mention"
  | "duet"
  | "affil_comment"
  | "affil_mention"
  | "following";

export type TikTokCandidateProfile = {
  displayName: string | null;
  avatarUrl: string | null;
  followerCount: number | null;
  videoCount: number | null;
  heartCount: number | null;
  verified: boolean;
  region: string | null;
  bio: string | null;
  bioEmail: string | null;
  enrichedAt: string | null;
};

export type TikTokNetworkCandidate = {
  handle: string;
  seedCount: number;
  signalSum: number;
  weightedSignal: number;
  hasAffil: boolean;
  hasFollowing: boolean;
  followOverlap: number;
  mutualCount: number;
  nicheVerdict:
    | "celebrity"
    | "off_niche"
    | "peer_confirmed"
    | "peer_likely"
    | "fan"
    | "unknown";
  decay: number;
  antiFanFactor: number;
  score: number;
  signalTypes: TikTokNetworkSignalType[];
  seedHandles: string[];
  sourceVideos: string[];
  lastSeenAt: string | null;
  profile: TikTokCandidateProfile;
  influencer: {
    id: string;
    status: TikTokInfluencerStatus;
    email: string | null;
    followerCount: number | null;
    displayName: string | null;
    avatarUrl: string | null;
  } | null;
};

export function listTikTokSeeds() {
  return request<{ ok: true; seeds: TikTokSeed[] }>(`/api/fsb/tiktok/seeds`);
}

export function addTikTokSeed(handle: string, notes?: string) {
  return request<{ ok: true; seed: TikTokSeed }>(`/api/fsb/tiktok/seeds`, {
    method: "POST",
    body: JSON.stringify({ handle, notes }),
  });
}

export function deleteTikTokSeed(id: string) {
  return request<{ ok: true }>(`/api/fsb/tiktok/seeds/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function refreshTikTokSeed(id: string) {
  return request<{ ok: true; added: number; signals?: number; diag?: any }>(
    `/api/fsb/tiktok/seeds/${encodeURIComponent(id)}/refresh`,
    { method: "POST" }
  );
}

export function listTikTokNetworkCandidates(opts?: {
  limit?: number;
  excludeImported?: boolean;
  affilOnly?: boolean;
}) {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.excludeImported) params.set("excludeImported", "1");
  if (opts?.affilOnly) params.set("affilOnly", "1");
  const qs = params.toString() ? `?${params.toString()}` : "";
  return request<{ ok: true; candidates: TikTokNetworkCandidate[] }>(
    `/api/fsb/tiktok/network/candidates${qs}`
  );
}

export type TikTokAffilPattern = {
  id: string;
  pattern: string;
  label: string | null;
  landingId: string | null;
  createdAt: string | null;
};

export function listTikTokAffilPatterns() {
  return request<{ ok: true; patterns: TikTokAffilPattern[] }>(
    `/api/fsb/tiktok/affil-patterns`
  );
}

export function addTikTokAffilPattern(pattern: string, label?: string) {
  return request<{ ok: true; pattern: TikTokAffilPattern }>(
    `/api/fsb/tiktok/affil-patterns`,
    {
      method: "POST",
      body: JSON.stringify({ pattern, label }),
    }
  );
}

export function deleteTikTokAffilPattern(id: string) {
  return request<{ ok: true }>(`/api/fsb/tiktok/affil-patterns/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}


export function importSeedNetworkSignals(
  seedId: string,
  signals: Array<{
    handle: string;
    type: TikTokNetworkSignalType;
    sourceVideoUrl?: string | null;
  }>,
  scannedVideoUrls?: string[]
) {
  return request<{
    ok: true;
    added: number;
    received: number;
    scannedRecorded?: number;
  }>(`/api/fsb/tiktok/seeds/${encodeURIComponent(seedId)}/import-signals`, {
    method: "POST",
    body: JSON.stringify({
      signals,
      scannedVideoUrls: scannedVideoUrls || [],
    }),
  });
}

export function listSeedScannedVideos(seedId: string) {
  return request<{ ok: true; videos: Array<{ url: string; scrapedAt: string | null }> }>(
    `/api/fsb/tiktok/seeds/${encodeURIComponent(seedId)}/scanned-videos`
  );
}

export function postSeedFollows(seedHandle: string, follows: string[]) {
  return request<{ ok: true; seedHandle: string; count: number }>(
    `/api/fsb/tiktok/network/seed-follows`,
    {
      method: "POST",
      body: JSON.stringify({ seedHandle, follows }),
    }
  );
}

export function postCandidateFollows(candidateHandle: string, follows: string[]) {
  return request<{ ok: true; candidateHandle: string; count: number }>(
    `/api/fsb/tiktok/network/candidate-follows`,
    {
      method: "POST",
      body: JSON.stringify({ candidateHandle, follows }),
    }
  );
}

export function autoDismissTikTokCelebrities(dryRun = false) {
  return request<{
    ok: true;
    dryRun: boolean;
    candidatesAnalyzed: number;
    dismissed: number;
    preview: Array<{ handle: string; reason: string }>;
  }>(`/api/fsb/tiktok/network/auto-dismiss`, {
    method: "POST",
    body: JSON.stringify({ dryRun }),
  });
}

export function dismissTikTokCandidate(handle: string, reason?: string) {
  return request<{ ok: true }>(`/api/fsb/tiktok/network/dismiss`, {
    method: "POST",
    body: JSON.stringify({ handle, reason }),
  });
}

export function enrichTikTokCandidatesBulk(profiles: any[]) {
  return request<{ ok: true; upserted: number; total: number }>(
    `/api/fsb/tiktok/network/enrich-bulk`,
    {
      method: "POST",
      body: JSON.stringify({ profiles }),
    }
  );
}

export function enrichTikTokTopCandidates(limit: number, force = false) {
  return request<{ ok: true; enriched: number; failed: number; total: number }>(
    `/api/fsb/tiktok/network/enrich`,
    {
      method: "POST",
      body: JSON.stringify({ limit, force }),
    }
  );
}

export function importTikTokNetworkHandle(handle: string) {
  return request<{
    ok: true;
    id: string;
    handle: string;
    hasEmail: boolean;
    alreadyContacted: boolean;
  }>(`/api/fsb/tiktok/network/import`, {
    method: "POST",
    body: JSON.stringify({ handle }),
  });
}
