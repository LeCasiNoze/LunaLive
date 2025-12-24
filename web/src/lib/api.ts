export type ApiUser = {
  id: number;
  username: string;
  rubis: number;
  role: string;
  emailVerified?: boolean;
};

export type ApiLive = {
  id: string;
  slug: string;
  displayName: string;
  title: string;
  viewers: number;
  thumbUrl?: string | null;
  liveStartedAt?: string | null;
};

export type ApiStreamer = ApiLive & { isLive: boolean; featured: boolean };

export type ApiStreamerRequest = {
  id: number;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

export type AdminRequestRow = {
  id: number;
  status: string;
  createdAt: string;
  userId: number;
  username: string;
};

export type ApiMyStreamer = {
  id: string;
  slug: string;
  displayName: string;
  title: string;
  viewers: number;
  isLive: boolean;
  featured: boolean;
};

export type ApiStreamConnection = {
  provider: "dlive";
  channelSlug: string;
  rtmpUrl: string;
  streamKey: string;
};

export type CosmeticItem = {
  kind: "username" | "badge" | "title" | "frame" | "hat";
  code: string;
  name: string;
  rarity: string;
  unlock: string;
  priceRubis: number | null;
  active: boolean;
  meta?: any;
};

export async function cosmeticsCatalog(): Promise<{ ok: true; items: CosmeticItem[] }> {
  return j<{ ok: true; items: CosmeticItem[] }>("/cosmetics/catalog");
}

export async function getMyStreamer(token: string) {
  return j<{ ok: true; streamer: ApiMyStreamer | null }>("/streamer/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function updateMyStreamerTitle(token: string, title: string) {
  return j<{ ok: true; streamer: ApiMyStreamer }>("/streamer/me", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
}

export async function getMyStreamConnection(token: string) {
  return j<{ ok: true; connection: ApiStreamConnection | null }>("/streamer/me/connection", {
    headers: { Authorization: `Bearer ${token}` },
  });
}
export type AdminProviderAccountRow = {
  id: number;
  provider: string;
  channelSlug: string;
  rtmpUrl: string;
  assignedAt: string | null;
  releasedAt: string | null;
  assignedStreamerId: string | null;
  assignedStreamerSlug: string | null;
  assignedStreamerName: string | null;
  assignedUsername: string | null;
};

export type ApiPublicStreamer = {
  id: string;
  slug: string;
  displayName: string;
  title: string;
  viewers: number;
  isLive: boolean;
  provider?: string | null;
  providerChannelSlug?: string | null;
};

export async function adminListProviderAccounts(adminKey: string) {
  return j<{ ok: true; accounts: AdminProviderAccountRow[] }>("/admin/provider-accounts", {
    headers: { "x-admin-key": adminKey },
  });
}

export async function adminCreateProviderAccount(
  adminKey: string,
  payload: { provider?: string; channelSlug: string; rtmpUrl: string; streamKey: string }
) {
  return j<{ ok: true }>(`/admin/provider-accounts`, {
    method: "POST",
    headers: { "x-admin-key": adminKey, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function adminDeleteProviderAccount(adminKey: string, id: number) {
  return j<{ ok: true }>(`/admin/provider-accounts/${id}`, {
    method: "DELETE",
    headers: { "x-admin-key": adminKey },
  });
}

export async function adminAssignProviderAccount(adminKey: string, id: number, streamerId: string) {
  return j<{ ok: true }>(`/admin/provider-accounts/${id}/assign`, {
    method: "POST",
    headers: { "x-admin-key": adminKey, "Content-Type": "application/json" },
    body: JSON.stringify({ streamerId: Number(streamerId) }),
  });
}

export async function adminReleaseProviderAccount(adminKey: string, id: number) {
  return j<{ ok: true }>(`/admin/provider-accounts/${id}/release`, {
    method: "POST",
    headers: { "x-admin-key": adminKey },
  });
}

const BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

async function j<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${BASE}${path}`, init);

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

export type MyCosmeticsResp = {
  ok: true;
  owned: Record<string, string[]>;
  equipped: {
    username: string | null;
    badge: string | null;
    title: string | null;
    frame: string | null;
    hat: string | null;
  };
  free?: Record<string, string[]>;
};

export async function myCosmetics(token: string): Promise<MyCosmeticsResp> {
  const r = await fetch(`${BASE}/me/cosmetics`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return await r.json();
}

export async function equipCosmetic(
  token: string,
  kind: "username" | "badge" | "title" | "frame" | "hat",
  code: string | null
): Promise<{ ok: boolean; equipped?: any; error?: string }> {
  const r = await fetch(`${BASE}/me/cosmetics/equip`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ kind, code }),
  });
  return await r.json();
}

export type ApiStreamerPage = {
  id: string;
  slug: string;
  displayName: string;
  title: string;
  viewers: number;
  isLive: boolean;

  channelSlug?: string | null;
  channelUsername?: string | null;

  // ✅ follows
  followsCount?: number;
  isFollowing?: boolean;

  // ✅ notif bell (si user connecté + follow)
  notifyEnabled?: boolean;
};

/* Public */
export const getLives = () => j<ApiLive[]>("/lives");
export const getStreamer = (slug: string, token?: string | null) =>
  j<ApiStreamerPage>(`/streamers/${encodeURIComponent(slug)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

export const getStreamers = () => j<ApiStreamer[]>("/streamers");

export async function followStreamer(slug: string, token: string) {
  return j<{ ok: true; following: boolean; followsCount: number; notifyEnabled?: boolean }>(
    `/streamers/${encodeURIComponent(slug)}/follow`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` } }
  );
}

export async function unfollowStreamer(slug: string, token: string) {
  return j<{ ok: true; following: boolean; followsCount: number; notifyEnabled?: boolean }>(
    `/streamers/${encodeURIComponent(slug)}/follow`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
  );
}

export async function setFollowNotify(slug: string, notifyEnabled: boolean, token: string) {
  return j<{ ok: true; notifyEnabled: boolean }>(
    `/streamers/${encodeURIComponent(slug)}/follow/notify`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ notifyEnabled }),
    }
  );
}

/* Auth */
export async function register(username: string, email: string, password: string) {
  return j<{ ok: true; needsVerify: true }>("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email, password }),
  });
}

export async function registerVerify(username: string, code: string) {
  return j<{ ok: true; token: string; user: ApiUser }>("/auth/register/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, code }),
  });
}

export async function login(username: string, password: string) {
  return j<{ ok: true; token: string; user: ApiUser }>("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
}

export async function me(token: string) {
  return j<{ ok: true; user: ApiUser }>("/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function applyStreamer(token: string) {
  return j<{ ok: true; request: ApiStreamerRequest }>("/streamer/apply", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function myStreamerRequest(token: string) {
  return j<{ ok: true; request: ApiStreamerRequest | null }>("/streamer/request", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/* Admin */
export async function adminListRequests(adminKey: string) {
  return j<{ ok: true; requests: AdminRequestRow[] }>("/admin/requests", {
    headers: { "x-admin-key": adminKey },
  });
}

export async function adminApproveRequest(adminKey: string, id: number) {
  return j<{ ok: true }>(`/admin/requests/${id}/approve`, {
    method: "POST",
    headers: { "x-admin-key": adminKey },
  });
}

export async function adminRejectRequest(adminKey: string, id: number) {
  return j<{ ok: true }>(`/admin/requests/${id}/reject`, {
    method: "POST",
    headers: { "x-admin-key": adminKey },
  });
}

export async function adminCreateStreamer(adminKey: string, slug: string, displayName: string) {
  return j<{ ok: true }>(`/admin/streamers`, {
    method: "POST",
    headers: { "x-admin-key": adminKey, "Content-Type": "application/json" },
    body: JSON.stringify({ slug, displayName }),
  });
}

export async function adminDeleteStreamer(adminKey: string, slug: string) {
  return j<{ ok: true }>(`/admin/streamers/${encodeURIComponent(slug)}`, {
    method: "DELETE",
    headers: { "x-admin-key": adminKey },
  });
}

export type AdminUserRow = {
  id: number;
  username: string;
  role: "viewer" | "streamer" | "admin";
  rubis: number;
  createdAt: string;
  requestStatus: string | null;
  streamerSlug: string | null;
};

export async function adminListUsers(adminKey: string) {
  return j<{ ok: true; users: AdminUserRow[] }>("/admin/users", {
    headers: { "x-admin-key": adminKey },
  });
}

export async function adminSetUserRole(adminKey: string, id: number, role: AdminUserRow["role"]) {
  return j<{ ok: true }>(`/admin/users/${id}`, {
    method: "PATCH",
    headers: { "x-admin-key": adminKey, "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
}

export async function registerResend(username: string) {
  return j<{ ok: boolean; needsVerify?: boolean; devCode?: string; error?: string }>(
    "/auth/register/resend",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    }
  );
}
export type ApiModeratorRow = { id: number; username: string; createdAt: string };
export type ApiUserSearchRow = { id: number; username: string };

export type ApiModerationEventRow = {
  id: string;
  type: string;
  createdAt: string;
  actorUsername: string | null;
  targetUsername: string | null;
  messagePreview: string | null;
};

export type ApiModerationEventDetail = {
  id: string;
  type: string;
  createdAt: string;
  actorUsername: string | null;
  targetUsername: string | null;
  messageId: string | null;
  messageContent: string | null;
  meta: any;
};

export async function getMyModerators(token: string) {
  return j<{ ok: true; moderators: ApiModeratorRow[] }>("/streamer/me/moderators", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function searchUsersForModerator(token: string, q: string) {
  return j<{ ok: true; users: ApiUserSearchRow[] }>(
    `/streamer/me/moderators/search?q=${encodeURIComponent(q)}&limit=8`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

export async function addModerator(token: string, userId: number) {
  return j<{ ok: true }>(`/streamer/me/moderators`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
}

export async function removeModerator(token: string, userId: number) {
  return j<{ ok: true }>(`/streamer/me/moderators/${userId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function getModerationEvents(token: string, limit = 40) {
  return j<{ ok: true; events: ApiModerationEventRow[] }>(
    `/streamer/me/moderation-events?limit=${limit}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

export async function getModerationEventDetail(token: string, id: string) {
  return j<{ ok: true; event: ApiModerationEventDetail }>(
    `/streamer/me/moderation-events/${encodeURIComponent(id)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

export async function unbanUserFromDashboard(token: string, userId: number) {
  return j<{ ok: true; changed: boolean }>(`/streamer/me/moderation-actions/unban`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
}

export async function unmuteTimeoutFromDashboard(token: string, timeoutId: number) {
  return j<{ ok: true; changed: boolean }>(`/streamer/me/moderation-actions/unmute`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ timeoutId }),
  });
}
export type ApiBannedRow = { id: number; username: string; createdAt: string; reason: string | null };

export async function getMyBans(token: string) {
  return j<{ ok: true; bans: ApiBannedRow[] }>("/streamer/me/bans", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function searchUsersForBan(token: string, q: string) {
  return j<{ ok: true; users: ApiUserSearchRow[] }>(
    `/streamer/me/bans/search?q=${encodeURIComponent(q)}&limit=8`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

export async function banUserFromDashboard(token: string, userId: number, reason?: string) {
  return j<{ ok: true; changed: boolean }>(`/streamer/me/moderation-actions/ban`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ userId, reason: reason ?? null }),
  });
}

export type StatsPeriod = "daily" | "weekly" | "monthly";
export type StatsMetric = "viewers_avg" | "viewers_peak" | "messages" | "watch_time";

export type ApiMetric = { value: number; prev: number; growthPct: number | null };

export type ApiStatsSummary = {
  ok: true;
  period: StatsPeriod;
  cursor: string;
  rangeStart: string;
  rangeEnd: string;
  metrics: {
    peakViewers: ApiMetric;
    avgViewers: ApiMetric;

    streamHours: ApiMetric;
    streamDays: ApiMetric;

    viewersUnique: ApiMetric;

    watchHours: ApiMetric;
    avgWatchMinutes: ApiMetric;

    messages: ApiMetric;
    messagesPerHour: ApiMetric;

    chattersUnique: ApiMetric;
    engagementRate: ApiMetric;
  };
};

export type ApiStatsSeries = {
  ok: true;
  period: StatsPeriod;
  cursor: string;
  metric: StatsMetric;
  points: { t: string; v: number }[];
};

export async function watchHeartbeat(
  payload: { slug: string; anonId: string; isLive?: boolean },
  token?: string | null
) {
  return j<{ ok: true; isLive: boolean; viewersNow?: number; self?: boolean }>(
    "/watch/heartbeat",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    }
  );
}

export async function getMyStatsSummary(token: string, period: StatsPeriod, cursor: string) {
  return j<ApiStatsSummary>(
    `/streamer/me/stats/summary?period=${encodeURIComponent(period)}&cursor=${encodeURIComponent(cursor)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

export async function getMyStatsSeries(token: string, period: StatsPeriod, cursor: string, metric: StatsMetric) {
  return j<ApiStatsSeries>(
    `/streamer/me/stats/timeseries?period=${encodeURIComponent(period)}&cursor=${encodeURIComponent(cursor)}&metric=${encodeURIComponent(metric)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

export async function getVapidPublicKey() {
  return j<{ ok: true; publicKey: string }>("/push/vapid-public-key");
}

export async function pushSubscribe(token: string, subscription: any) {
  return j<{ ok: true }>("/push/subscribe", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ subscription }),
  });
}

export async function pushUnsubscribe(token: string, endpoint: string) {
  return j<{ ok: true }>("/push/unsubscribe", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
}

export async function subscribeStreamer(slug: string, token: string) {
  return j<{ ok: true; newBalance?: number }>(`/streamers/${encodeURIComponent(slug)}/subscribe`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}
export type AdminUserSearchRow = {
  id: number;
  username: string;
  role: string;
  rubis: number;
};

export async function adminSearchUsers(adminKey: string, q: string, limit = 8) {
  return j<{ ok: true; users: AdminUserSearchRow[] }>(
    `/admin/users/search?q=${encodeURIComponent(q)}&limit=${encodeURIComponent(String(limit))}`,
    { headers: { "x-admin-key": adminKey } }
  );
}

export async function adminMintRubis(
  adminKey: string,
  payload: { userId: number; amount: number; weightBp: number; note?: string | null }
) {
  return j<{ ok: true; txId: string; lotId: string; user: { id: number; username: string; rubis: number } }>(
    `/admin/rubis/mint`,
    {
      method: "POST",
      headers: { "x-admin-key": adminKey, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
}

export type ApiWheelState = {
  ok: true;
  day: string;
  canSpin: boolean;
  lastSpin: null | {
    day: string;
    spun_at: string;
    raw_reward: number;
    minted_total: number;
    minted_normal: number;
    minted_low: number;
    dropped: number;
  };
  cap: { freeAwarded: number; freeLowAwarded: number; capNormal: number; capLow: number };
};

export type ApiWheelSpin = {
  ok: true;
  day: string;
  txId: string;
  reward: {
    raw: number;
    mintedTotal: number;
    mintedNormal: number;
    mintedLow: number;
    dropped: number;
  };
  user: { id: number; rubis: number };
  cap: { capNormal: number; capLow: number };
};

// ──────────────────────────────────────────
// 🎡 DAILY WHEEL (API v1)
// ──────────────────────────────────────────
export type ApiWheelMe = {
  ok: true;
  day: string; // "YYYY-MM-DD"
  canSpin: boolean;
  usedToday: boolean;
  segments: { label: string; amount: number }[];
};

export type ApiWheelSpinResult = {
  ok: true;
  day: string;
  segmentIndex: number;
  reward: number;
  label: string;
  txId: string;
  user: { id: string; username: string; rubis: number };
};

export async function getMyWheel(token: string) {
  return j<ApiWheelMe>("/wheel/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function spinWheel(token: string) {
  // si déjà utilisé, ton backend renvoie 409 + { error:"already_used" }
  // j() va throw Error("already_used") -> on gère côté UI via message.
  return j<ApiWheelSpinResult>("/wheel/spin", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// (optionnel) alias si tu as déjà du code qui appelle getWheelState()
export const getWheelState = getMyWheel;

export type ApiChest = {
  ok: true;
  streamerId: number;
  capOutWeightBp: number;
  balance: number;
  breakdown: Record<string, number>;
  opening: null | {
    id: string;
    status: "open" | "closed" | "canceled";
    opensAt: string;
    closesAt: string;
    minWatchMinutes: number;
    participantsCount: number;
    joined: boolean;
  };
};

export async function getStreamerChest(slug: string) {
  return j<ApiChest>(`/streamers/${encodeURIComponent(slug)}/chest`);
}

export async function chestDeposit(slug: string, token: string, amount: number, note?: string | null) {
  return j<{ ok: true; txId: string; balance: number }>(
    `/streamers/${encodeURIComponent(slug)}/chest/deposit`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ amount, note: note ?? null }),
    }
  );
}

export async function chestOpen(slug: string, token: string, durationSec = 30, minWatchMinutes = 5) {
  return j<{ ok: true; opening: { id: string; opensAt: string; closesAt: string; minWatchMinutes: number } }>(
    `/streamers/${encodeURIComponent(slug)}/chest/open`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ durationSec, minWatchMinutes }),
    }
  );
}

export async function chestJoin(slug: string, token: string) {
  return j<{ ok: true; openingId: string }>(`/streamers/${encodeURIComponent(slug)}/chest/join`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function chestClose(slug: string, token: string) {
  return j<{ ok: true; openingId: string; payouts?: any[] }>(`/streamers/${encodeURIComponent(slug)}/chest/close`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export type ApiDailyBonusClaim = {
  ok: true;
  alreadyClaimed: boolean;
  day: string;        // "YYYY-MM-DD" (Europe/Paris)
  monthStart: string; // "YYYY-MM-DD"
  claimedDays: number;
  granted: ApiDailyBonusGranted[];
};

export async function claimDailyBonus(token: string) {
  return j<ApiDailyBonusClaim>("/me/daily-bonus/claim", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export type ApiDailyBonusWeekDay = {
  isodow: number;
  label: string;
  date: string;
  reward: { type: "rubis"; amount: number; origin: string; weight_bp: number } | { type: "token"; token: "wheel_ticket"; amount: number };
  status: "future" | "missed" | "claimed" | "today_claimable" | "today_claimed";
};

export type ApiDailyBonusMilestone = { milestone: 5 | 10 | 20 | 30; status: "locked" | "claimable" | "claimed" };

export type ApiDailyBonusState = {
  ok: true;
  day: string;
  isodow: number;
  weekStart: string;
  monthStart: string;
  monthClaimedDays: number;
  todayClaimed: boolean;
  week: ApiDailyBonusWeekDay[];
  milestones: ApiDailyBonusMilestone[];
  tokens: { wheel_ticket: number; prestige_token: number };
};

export type ApiDailyBonusGranted =
  | { type: "rubis"; amount: number; origin: string; weight_bp: number; tx_id?: number }
  | { type: "token"; token: "wheel_ticket" | "prestige_token"; amount: number }
  | { type: "entitlement"; kind: "skin" | "title"; code: string; fallback?: boolean };

export async function getDailyBonusState(token: string) {
  return j<ApiDailyBonusState>("/me/daily-bonus/state", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function claimDailyBonusToday(token: string) {
  return j<{ ok: true; alreadyClaimed: boolean; granted: ApiDailyBonusGranted[]; state: ApiDailyBonusState }>(
    "/me/daily-bonus/claim",
    { method: "POST", headers: { Authorization: `Bearer ${token}` } }
  );
}

export async function claimDailyBonusMilestone(token: string, milestone: 5 | 10 | 20 | 30) {
  return j<{ ok: true; milestone: 5 | 10 | 20 | 30; granted: ApiDailyBonusGranted[]; state: ApiDailyBonusState }>(
    "/me/daily-bonus/claim-milestone",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ milestone }),
    }
  );
}

// web/src/lib/api.ts

export type ApiAchievement = {
  id: string;
  tier: "bronze" | "silver" | "gold" | "master";
  category: string;
  icon: string;
  name: string;

  desc: string | null;
  hint: string | null;
  rewardPreview: string | null;

  unlocked: boolean;
  progress: null | { current: number; target: number };
};

export type ApiMyAchievementsResp = {
  ok: true;
  generatedAt: string;
  monthStart: string;
  monthEnd: string;
  achievements: ApiAchievement[];
};

export async function getMyAchievements(token: string) {
  return j<ApiMyAchievementsResp>("/me/achievements", {
    headers: { Authorization: `Bearer ${token}` },
  });
}
