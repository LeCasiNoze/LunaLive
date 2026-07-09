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

export type ApiViewerStreamer = {
  rank: number;
  streamerId: number;
  slug: string;
  displayName: string;
  userId: number | null;
  points: number;
  viewers: number;
};

export type ApiViewerPalier = { index: number; threshold: number; label: string };

export type ApiViewerWeekResp = {
  ok: true;
  event: ApiEventRow;
  rules: ApiViewerWeekRules;
  top: ApiViewerWeekTopRow[];
  me: ApiViewerWeekMe;
  topStreamers: ApiViewerStreamer[];
  myStreamer: { streamerId: number; slug: string; displayName: string } | null;
  paliers: ApiViewerPalier[];
  myPaliers: { points: number; claimed: number[] } | null;
  myBoost: { active: boolean; bought: number; cost: number; capPerEvent: number; canBuy: boolean; durationHours: number } | null;
  quests: { daily: ApiViewerQuest[]; weekly: ApiViewerQuest[] } | null;
};

export type ApiViewerQuest = { key: string; label: string; goal: number; progress: number; done: boolean; claimed: boolean; reward: string };

export async function postViewerWeekQuestClaim(token: string, key: string) {
  return j<{ ok: true; reward: string }>("/api/events/viewer-week/quest/claim", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  });
}

export async function postViewerWeekBoostBuy(token: string) {
  return j<{ ok: true; rubis: number; bought: number }>(
    "/api/events/viewer-week/boost/buy",
    { method: "POST", headers: { Authorization: `Bearer ${token}` } }
  );
}

export async function postViewerWeekPalierClaim(token: string) {
  return j<{ ok: true; claimed: { index: number; label: string }[]; count: number }>(
    "/api/events/viewer-week/palier/claim",
    { method: "POST", headers: { Authorization: `Bearer ${token}` } }
  );
}

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

// ── wheel_week (roue d'event : tickets, paliers, boutique, quêtes) ───
export type ApiWheelSegment = { proba: number; points: number; lotLabel?: string | null };

export type ApiWheelPalier = { index: number; threshold: number; rewardLabel: string };

export type ApiWheelMe = {
  tickets: number;
  points: number;
  rank: number | null;
  paliersClaimed: number[];
  nextPalier: { index: number; threshold: number; remaining: number } | null;
  freeSpinAvailable: boolean;
};

export type ApiWheelLeaderboardRow = { rank: number; userId: number; username: string; points: number };

export type ApiWheelShopItem = {
  code: string;
  label: string;
  nextPrice: number | null; // null quand l'item est épuisé (cap atteint)
  capPerDay: number;
  boughtToday: number;
  soldOut: boolean;
};

export type ApiWheelQuest = {
  key: string;
  label: string;
  goal: number;
  progress: number;
  done: boolean;
  claimed: boolean;
};

export type ApiWheelQuests = { daily: ApiWheelQuest[]; weekly: ApiWheelQuest[] };

export type ApiWheelPageResp =
  | { ok: true; event: null }
  | {
      ok: true;
      event: ApiEventRow;
      wheel: ApiWheelSegment[];
      paliers: ApiWheelPalier[];
      me: ApiWheelMe | null;
      leaderboard: ApiWheelLeaderboardRow[];
      shop: ApiWheelShopItem[];
      quests: ApiWheelQuests;
    };

// Auth optionnelle : la roue/paliers/leaderboard/boutique sont publics,
// "me" et les quêtes personnelles n'apparaissent que si connecté.
export async function getCurrentWheel(token?: string | null) {
  return j<ApiWheelPageResp>("/api/events/current/wheel", {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

export type ApiWheelSpinResp = {
  ok: true;
  segment: { index: number; points: number; xp: number; lotLabel?: string | null };
  tickets: number;
  points: number;
};

export async function postWheelSpin(token: string) {
  return j<ApiWheelSpinResp>("/api/events/wheel/spin", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export type ApiWheelShopBuyResp = {
  ok: true;
  spentRubis: number;
  rubis: number;
  // objet d'effet : pour 'reroll' => { segment: { index, points, xp, lotLabel } }
  granted: Record<string, any>;
  boughtToday: number;
  nextPrice: number | null;
};

export async function postWheelShopBuy(token: string, code: string) {
  return j<ApiWheelShopBuyResp>("/api/events/wheel/shop/buy", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
}

export type ApiWheelPalierClaimResp = {
  ok: true;
  claimed: { index: number; threshold: number; rewardLabel: string }[];
  count: number;
};

export async function postWheelPalierClaim(token: string) {
  return j<ApiWheelPalierClaimResp>("/api/events/wheel/palier/claim", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export type ApiWheelQuestClaimResp = { ok: true; ticketsAwarded: number; tickets: number };

export async function postWheelQuestClaim(token: string, key: string) {
  return j<ApiWheelQuestClaimResp>("/api/events/wheel/quest/claim", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
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
  mp4Url: string | null;
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
      myVotedClipIds?: number[];
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
