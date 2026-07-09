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

export type EventAccessStepKey = "follow_streamer" | "link_discord" | "follow_insta" | "daily_claim" | "watch_30";

export type EventAccessStep = { key: EventAccessStepKey; label: string; done: boolean };

export type ApiEventAccessStatus = {
  ok: true;
  eligible: boolean;
  steps: EventAccessStep[];
};

export async function getCurrentEvent() {
  return j<{ ok: true; event: ApiEventRow | null }>("/api/events/current");
}

// Auth optionnelle : le top est public, "me" n'apparaît que si un token est fourni.
export async function getCurrentViewerWeek(token?: string | null) {
  return j<ApiViewerWeekResp>("/api/events/current/viewer-week", {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

export async function getEventAccessStatus(token: string) {
  return j<ApiEventAccessStatus>("/api/events/access-status", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function declareInstaFollow(token: string) {
  return j<ApiEventAccessStatus>("/api/events/insta-declared", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── wheel_week ──────────────────────────────────────────────────────
export type ApiWheelWeekTopRow = {
  rank: number | null;
  userId: number;
  username: string;
  points: number;
  detail?: Record<string, any>;
};

export type ApiWheelWeekResp =
  | { ok: true; event: null }
  | {
      ok: true;
      event: ApiEventRow;
      top: ApiWheelWeekTopRow[];
      me: ApiWheelWeekTopRow | null;
    };

// Auth optionnelle : le top est public, "me" n'apparaît que si connecté.
export async function getCurrentWheelWeek(token?: string | null) {
  return j<ApiWheelWeekResp>("/api/events/current/wheel-week", {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

// ── global_chest ────────────────────────────────────────────────────
export type ApiChestContributor = { userId: number; username: string; points: number };

export type ApiChestResp =
  | { ok: true; event: null }
  | {
      ok: true;
      event: ApiEventRow;
      goal: number;
      communityTotal: number;
      reached: boolean;
      myContribution?: number;
      topContributors: ApiChestContributor[];
    };

export type ApiChestDepositResp = { ok: true; deposited: number; communityTotal: number };

// Auth optionnelle : la barre et le top sont publics, "myContribution" n'apparaît que si connecté.
export async function getCurrentChest(token?: string | null) {
  return j<ApiChestResp>("/api/events/current/chest", {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

export async function postChestDeposit(token: string, amount: number) {
  return j<ApiChestDepositResp>("/api/events/chest/deposit", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ amount }),
  });
}

// ── clip_race ───────────────────────────────────────────────────────
export type ApiRankedClip = {
  rank: number;
  clipId: number;
  streamerId: number;
  streamerSlug: string;
  streamerDisplayName: string;
  votes: number;
  title: string | null;
  author: string | null;
};

export type ApiRankedStreamer = {
  rank: number;
  streamerId: number;
  slug: string;
  displayName: string;
  userId: number | null;
  votes: number;
};

export type ApiClipRaceResp =
  | { ok: true; event: null }
  | {
      ok: true;
      event: ApiEventRow;
      topClips: ApiRankedClip[];
      topStreamers: ApiRankedStreamer[];
      myVotesLeft?: number;
    };

export type ApiClipRaceVoteResp = { ok: true; votesLeft: number };

// Auth optionnelle : les deux classements sont publics, "myVotesLeft" n'apparaît que si connecté.
export async function getCurrentClipRace(token?: string | null) {
  return j<ApiClipRaceResp>("/api/events/current/clip-race", {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

export async function postClipRaceVote(token: string, clipId: number) {
  return j<ApiClipRaceVoteResp>("/api/events/clip-race/vote", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ clipId }),
  });
}

// ── burn_boss ───────────────────────────────────────────────────────
export type ApiBossDamager = { rank: number; userId: number; username: string; damage: number };

export type ApiBossResp =
  | { ok: true; event: null }
  | {
      ok: true;
      event: ApiEventRow;
      hp: number;
      totalDamage: number;
      killed: boolean;
      myDamage?: number;
      topDamagers: ApiBossDamager[];
    };

export type ApiBossBurnResp = { ok: true; burned: number; totalDamage: number; hp: number; killed: boolean };

// Auth optionnelle : la jauge et le top sont publics, "myDamage" n'apparaît que si connecté.
export async function getCurrentBoss(token?: string | null) {
  return j<ApiBossResp>("/api/events/current/boss", {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

export async function postBossBurn(token: string, amount: number) {
  return j<ApiBossBurnResp>("/api/events/boss/burn", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ amount }),
  });
}
