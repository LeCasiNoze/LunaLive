import { loadToken } from "./storage";
export type ApiUser = {
  id: number;
  username: string;
  rubis: number;
  role: string;
  emailVerified?: boolean;

  // ✅ NEW (optionnel) : coupons/tickets renvoyés par /me
  coupons?: Record<string, number>; // ex: { sub_ticket: 3 }
  tokens?: Record<string, number>;  // déjà utilisé ailleurs (daily bonus)
  breakdown?: Record<string, any>;  // déjà utilisé ailleurs
};

export type ContentMinRole = "viewer" | "moderator" | "streamer";

export type AdminContentUpsertPayload = {
  title?: string;
  html?: string;
  min_role?: ContentMinRole;
};

export type AdminUserDetails = {
  ok: true;
  userId: number;
  createdAt: string | null;
  lastLoginAt: string | null;
  messagesCount: number | null;
  rubisSpent: number | null;
  siteSpentEur: number | null;
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

  // ✅ NEW
  updatedAt?: string;
  discord?: string | null;
  channelUrl?: string | null;
  hasChannel?: boolean;
  hasDlive?: boolean;
  dliveDisplayname?: string | null;
  rulesAccepted?: boolean;
};

export type ApplyStreamerPayload = {
  discord?: string | null;
  channelUrl?: string | null;
  hasChannel?: boolean;
  hasDlive?: boolean;
  dliveDisplayname?: string | null;
  rulesAccepted?: boolean;
};

export async function applyStreamer(token: string, payload?: ApplyStreamerPayload) {
  // compat: si tu appelles encore applyStreamer(token) sans payload, ça marche pareil (ça remet juste pending)
  const hasBody = payload && Object.keys(payload).length > 0;

  return j<{ ok: true; request: ApiStreamerRequest }>("/streamer/apply", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
    },
    body: hasBody ? JSON.stringify(payload) : undefined,
  });
}

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

export async function cosmeticsCatalog(token?: string | null): Promise<{ ok: true; items: CosmeticItem[] }> {
  return j<{ ok: true; items: CosmeticItem[] }>("/cosmetics/catalog", {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
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
  payload: { provider?: string; channelSlug: string; rtmpUrl?: string; streamKey: string }
) {
  return j<{ ok: true }>(`/admin/provider-accounts`, {
    method: "POST",
    headers: { "x-admin-key": adminKey, "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, rtmpUrl: payload.rtmpUrl ?? DLIVE_RTMP_URL }),
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
export const DLIVE_RTMP_URL = "rtmp://stream.dlive.tv/live";

async function j<T>(path: string, init: RequestInit = {}): Promise<T> {
  const usedAuth =
    typeof init.headers === "object" && init.headers
      ? (init.headers as any)?.Authorization
      : null;

  const usedToken =
    typeof usedAuth === "string" && usedAuth.startsWith("Bearer ")
      ? usedAuth.slice(7)
      : null;

  const r = await fetch(`${BASE}${path}`, init);

  // ✅ IMPORTANT: on ignore la logique "logout user" sur les endpoints admin
  if (r.status === 401 && !path.startsWith("/admin/")) {
    const currentToken = loadToken();

    // logout UNIQUEMENT si le token utilisé est encore le token courant
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
  return j<MyCosmeticsResp>("/me/cosmetics", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function equipCosmetic(
  token: string,
  kind: "username" | "badge" | "title" | "frame" | "hat",
  code: string | null
): Promise<{ ok: boolean; equipped?: any; error?: string }> {
  return j<{ ok: boolean; equipped?: any; error?: string }>("/me/cosmetics/equip", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ kind, code }),
  });
}

export type ApiUserSub = {
  plan_code: "viewer" | "streamer";
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  provider: string;
  provider_subscription_id: string;
};

export type ApiStreamerPage = {
  id: string;
  slug: string;
  displayName: string;
  title: string;
  viewers: number;
  isLive: boolean;

  ownerUserId?: number; // <= utile
  user?: {
    id: number;
    username: string;
    role: string;
    user_subscriptions: ApiUserSub[];
  };

  channelSlug?: string | null;
  channelUsername?: string | null;

  // ✅ follows
  followsCount?: number;
  isFollowing?: boolean;

  // ✅ notif bell (si user connecté + follow)
  notifyEnabled?: boolean;
};

export type ApiContentItem = {
  key: string;
  title: string | null;
  html: string;
  min_role?: ContentMinRole | null; // ✅ NEW
  updatedAt?: string | null;
};

export type ApiAdminListContent = { ok: true; items: ApiContentItem[] };
export type ApiAdminGetContent = { ok: true; item: ApiContentItem | null };
export type ApiPublicGetContent = { ok: true; item: ApiContentItem | null };

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

export async function adminGetUserDetails(adminKey: string, userId: number) {
  return j<AdminUserDetails>(`/admin/users/${encodeURIComponent(String(userId))}/details`, {
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
  payload: { userId: number; amount: number; origin: string; note?: string | null }
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

// ──────────────────────────────────────────
// ✅ Account actions (rename / password / forgot)
// ──────────────────────────────────────────

export async function requestRenameCode(token: string) {
  return j<{ ok: true; devCode?: string }>("/me/rename/request-code", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function confirmRename(
  token: string,
  payload: { newUsername: string; code: string; payIfNeeded?: boolean }
) {
  return j<
    | { ok: true; token: string; user: ApiUser; paid?: number }
    | { ok: false; error: string; remainingDays?: number; price?: number }
  >("/me/rename/confirm", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function requestPasswordCode(token: string) {
  return j<{ ok: true; devCode?: string }>("/me/password/request-code", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function confirmPasswordChange(token: string, payload: { code: string; newPassword: string }) {
  return j<{ ok: true }>("/me/password/confirm", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function forgotPasswordRequestCode(email: string) {
  return j<{ ok: true; devCode?: string }>("/auth/forgot/request-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

export async function forgotPasswordConfirm(payload: {
  email: string;
  code: string;
  newPassword: string;
}) {
  return j<{ ok: true; token: string; user: ApiUser }>("/auth/forgot/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
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

// ──────────────────────────────────────────
// 🎁 Daily Bonus (API v2)
// ──────────────────────────────────────────

export type ApiDailyBonusWeekDay = {
  isodow: number;
  label: string;
  date: string;
  reward:
    | { type: "rubis"; amount: number; origin: string; weight_bp: number }
    | { type: "token"; token: "wheel_ticket"; amount: number };
  status: "future" | "missed" | "claimed" | "today_claimable" | "today_claimed";
};

export type ApiDailyBonusMilestone = {
  milestone: 5 | 10 | 20 | 30;
  status: "locked" | "claimable" | "claimed";
};

export type ApiDailyBonusGranted =
  | { type: "rubis"; amount: number; origin: string; weight_bp: number; tx_id?: number }
  | { type: "token"; token: "wheel_ticket" | "prestige_token"; amount: number }
  | { type: "entitlement"; kind: "skin" | "title"; code: string; fallback?: boolean };

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

export async function getDailyBonusState(token: string) {
  return j<ApiDailyBonusState>("/me/daily-bonus/state", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function claimDailyBonusToday(token: string) {
  return j<{
    ok: true;
    alreadyClaimed: boolean;
    granted: ApiDailyBonusGranted[];
    state: ApiDailyBonusState;
  }>("/me/daily-bonus/claim", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ✅ alias rétro-compat si tu as déjà du code qui appelle claimDailyBonus()
export const claimDailyBonus = claimDailyBonusToday;

export async function claimDailyBonusMilestone(token: string, milestone: 5 | 10 | 20 | 30) {
  return j<{
    ok: true;
    milestone: 5 | 10 | 20 | 30;
    granted: ApiDailyBonusGranted[];
    state: ApiDailyBonusState;
  }>("/me/daily-bonus/claim-milestone", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ milestone }),
  });
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

export type ShopCosmeticItem = {
  kind: "username" | "badge" | "title" | "frame" | "hat";
  code: string;
  name: string;
  rarity: string;
  unlock: "shop" | "achievement" | "role" | "event" | "system";
  priceRubis: number | null;
  active: boolean;
  meta?: any;
};

export type ShopCosmeticsResp = {
  ok: true;
  availableRubis: number;
  owned: Record<string, string[]>;
  equipped: {
    username: string | null;
    badge: string | null;
    title: string | null;
    frame: string | null;
    hat: string | null;
  };
  items: ShopCosmeticItem[];
};

export async function shopCosmetics(token: string): Promise<ShopCosmeticsResp> {
  return j<ShopCosmeticsResp>("/shop/cosmetics", {
    headers: { Authorization: `Bearer ${token}` },
  });
}
export type BuyShopCosmeticResp = {
  ok: true;
  alreadyOwned: boolean;
  availableRubis: number;
  owned: Record<string, string[]>;
  user: { id: number; username: string; rubis: number } | null;
  item?: ShopCosmeticItem;
};

export async function buyShopCosmetic(token: string, kind: string, code: string): Promise<BuyShopCosmeticResp> {
  return j<BuyShopCosmeticResp>("/shop/cosmetics/buy", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ kind, code }),
  });
}

export type ApiDliveLinkMe = {
  ok: true;
  useLinked: boolean;

  linkedDisplayname: string | null;
  linkedUsername?: string | null; // ✅ NEW: renvoyé par l’API
  linkedAt: string | null;

  pending: null | {
    id: number;
    requestedDisplayname: string;
    requestedUsername?: string | null; // ✅ NEW: renvoyé par l’API
    code: string;
    createdAt: string;
    expiresAt: string;
  };
};

export async function dliveLinkMe(token: string) {
  return j<ApiDliveLinkMe>("/streamer/me/dlive-link", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function dliveLinkRequest(token: string, channel: string) {
  return j<{ ok: true; code: string; requestedDisplayname: string; expiresAt: string }>(
    "/streamer/me/dlive-link/request",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ channel }),
    }
  );
}

export async function dliveLinkVerify(token: string) {
  return j<{ ok: true }>("/streamer/me/dlive-link/verify", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  });
}

export async function dliveLinkToggle(token: string, useLinked: boolean) {
  return j<{ ok: true }>("/streamer/me/dlive-link/toggle", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ useLinked }),
  });
}

export async function dliveLinkUnlink(token: string) {
  return j<{ ok: true }>("/streamer/me/dlive-link/unlink", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  });
}

// ──────────────────────────────────────────
// 🤖 LunaBot (dashboard)
// ──────────────────────────────────────────

export type ApiBotOverview = {
  ok: true;
  streamer: { id: string; slug: string };
  counts: { commands: number; autoposts: number; logs: number };
};

export type ApiBotCommand = {
  id: string;
  trigger: string;
  response: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ApiBotAutopost = {
  id: string;
  message: string;
  everySec: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ApiBotLogRow = {
  id: string;
  level: string;
  message: string;
  meta: any;
  createdAt: string;
};

export async function getMyBotOverview(token: string) {
  return j<ApiBotOverview>("/me/bot/overview", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// Commands
export async function getMyBotCommands(token: string) {
  return j<{ ok: true; commands: ApiBotCommand[] }>("/me/bot/commands", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function createMyBotCommand(token: string, payload: { trigger: string; response: string; enabled?: boolean }) {
  return j<{ ok: true; command: ApiBotCommand }>("/me/bot/commands", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateMyBotCommand(
  token: string,
  id: string,
  patch: Partial<{ trigger: string; response: string; enabled: boolean }>
) {
  return j<{ ok: true; command: ApiBotCommand }>(`/me/bot/commands/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function deleteMyBotCommand(token: string, id: string) {
  return j<{ ok: true; deleted: boolean }>(`/me/bot/commands/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// Autoposts
export async function getMyBotAutoposts(token: string) {
  return j<{ ok: true; autoposts: ApiBotAutopost[] }>("/me/bot/autoposts", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function createMyBotAutopost(
  token: string,
  payload: { message: string; everySec: number; enabled?: boolean }
) {
  return j<{ ok: true; autopost: ApiBotAutopost }>("/me/bot/autoposts", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateMyBotAutopost(
  token: string,
  id: string,
  patch: Partial<{ message: string; everySec: number; enabled: boolean }>
) {
  return j<{ ok: true; autopost: ApiBotAutopost }>(`/me/bot/autoposts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function deleteMyBotAutopost(token: string, id: string) {
  return j<{ ok: true; deleted: boolean }>(`/me/bot/autoposts/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// Logs
export async function getMyBotLogs(token: string, limit = 50) {
  return j<{ ok: true; logs: ApiBotLogRow[] }>(`/me/bot/logs?limit=${encodeURIComponent(String(limit))}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function clearMyBotLogs(token: string) {
  return j<{ ok: true }>("/me/bot/logs/clear", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// Test send
export async function botTestSend(token: string, body?: string) {
  return j<{ ok: true; id: number }>("/me/bot/test-send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ body: body ?? "Test LunaBot ✅" }),
  });
}

// ──────────────────────────────────────────
// 🎰 Admin — Slots updater manual
// ──────────────────────────────────────────
export type AdminSlotsUpdateResp = {
  ok: true;
  fetched: number;
  added: number;
  byProvider: Record<string, { name: string; slotKey?: string | null }[]>;
};

export async function adminSlotsUpdate(adminKey: string) {
  return j<AdminSlotsUpdateResp>(`/admin/slots/update`, {
    method: "POST",
    headers: { "x-admin-key": adminKey },
  });
}
// ──────────────────────────────────────────
// 🎯 Calls (dashboard)
// ──────────────────────────────────────────

export type ApiCallsConfig = {
  enabled: boolean;
  showCmdInChat: boolean;
  showAcceptPublic: boolean;
  allowListec: boolean;
  listecMax: number;
  perUserLimit: number;
};

export type ApiCallQueueItem = {
  id: string;
  slotName: string;
  provider: string | null;
  username: string;
  pos: number;
  imageUrl: string | null;
};

export type ApiCallBanRow = {
  id: string;
  kind: "user" | "slot" | "provider";
  banKey: string;
  label: string | null;
  createdAt: string;
};

export type ApiProviderPolicy = {
  ok: true;
  mode: "allow_all" | "allow_only";
  allowed: string[];
};

export async function getCallsConfig(streamerSlug: string, token: string) {
  return j<{ ok: true; config: ApiCallsConfig }>(`/calls/${encodeURIComponent(streamerSlug)}/config`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function patchCallsConfig(streamerSlug: string, token: string, patch: Partial<ApiCallsConfig>) {
  return j<{ ok: true; config: ApiCallsConfig }>(`/calls/${encodeURIComponent(streamerSlug)}/config`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function getCallsQueue(streamerSlug: string, token: string, limit = 60, offset = 0) {
  return j<{ ok: true; items: ApiCallQueueItem[] }>(
    `/calls/${encodeURIComponent(streamerSlug)}/list?limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(
      String(offset)
    )}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

export async function resetCallsQueue(streamerSlug: string, token: string) {
  return j<{ ok: true }>(`/calls/${encodeURIComponent(streamerSlug)}/reset`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function deleteCallQueueItem(streamerSlug: string, token: string, id: string) {
  return j<{ ok: true; deleted: boolean }>(`/calls/${encodeURIComponent(streamerSlug)}/item/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function getCallsBans(streamerSlug: string, token: string, kind: "user" | "slot" | "provider") {
  const resp: any = await j<any>(`/calls/${encodeURIComponent(streamerSlug)}/bans`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  // ✅ si l'API renvoie items (mix), on filtre par kind ici
  if (Array.isArray(resp?.items)) {
    const filtered = (resp.items as ApiCallBanRow[]).filter((it) => it && it.kind === kind);
    return { ok: true as const, items: filtered };
  }

  const bans = resp?.bans || {};
  const nowIso = new Date().toISOString();

  let items: ApiCallBanRow[] = [];

  if (kind === "slot") {
    const list = Array.isArray(bans?.slots) ? bans.slots : [];
    items = list.map((s: any) => ({
      id: `slot:${String(s.slotKey ?? s.name ?? "").trim() || Math.random()}`,
      kind: "slot",
      banKey: String(s.slotKey ?? "").trim() || String(s.name ?? "").trim(),
      label: String(s.name ?? s.slotKey ?? "").trim() || null,
      createdAt: nowIso,
    }));
  } else if (kind === "provider") {
    const list = Array.isArray(bans?.providers) ? bans.providers : [];
    items = list.map((p: any) => {
      const key = String(p.provider ?? "").trim();
      return {
        id: `provider:${key || Math.random()}`,
        kind: "provider",
        banKey: key,
        label: key || null,
        createdAt: nowIso,
      };
    });
  } else {
    const list = Array.isArray(bans?.users) ? bans.users : [];
    items = list.map((u: any) => {
      const key = String(u.username ?? "").trim();
      return {
        id: `user:${key || Math.random()}`,
        kind: "user",
        banKey: key,
        label: key || null,
        createdAt: nowIso,
      };
    });
  }

  return { ok: true as const, items };
}

export type ApiBanPayload =
  | { kind: "user"; username?: string; userId?: number; label?: string }
  | { kind: "provider"; provider?: string; providerKey?: string; label?: string }
  | { kind: "slot"; slot?: string; slotName?: string; slotKey?: string; provider?: string | null; label?: string };

export async function banCalls(streamerSlug: string, token: string, payload: ApiBanPayload) {
  const body: any = { kind: payload.kind };

  if (payload.kind === "slot") {
    const slotName = String(payload.slotName ?? payload.slot ?? payload.label ?? "").trim();
    if (slotName) body.value = slotName;

    const slotKey = String(payload.slotKey ?? "").trim();
    if (slotKey) body.slotKey = slotKey;
  } else if (payload.kind === "provider") {
    const prov = String(payload.provider ?? payload.providerKey ?? payload.label ?? "").trim();
    if (prov) body.value = prov;
  } else if (payload.kind === "user") {
    const username = String(payload.username ?? payload.label ?? "").trim();
    if (username) body.value = username;
  }

  return j<{ ok: boolean; error?: string }>(`/calls/${encodeURIComponent(streamerSlug)}/ban`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function unbanCalls(streamerSlug: string, token: string, kind: "user" | "slot" | "provider", keys: string[]) {
  return j<{ ok: true; changed?: boolean }>(`/calls/${encodeURIComponent(streamerSlug)}/unban`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ kind, values: keys }),
  });
}

export async function getCallsProviderPolicy(streamerSlug: string, token: string) {
  return j<ApiProviderPolicy>(`/calls/${encodeURIComponent(streamerSlug)}/provider-policy`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function setCallsProviderPolicy(streamerSlug: string, token: string, mode: "allow_all" | "allow_only") {
  return j<{ ok: true }>(`/calls/${encodeURIComponent(streamerSlug)}/provider-policy`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ mode }),
  });
}

export async function allowCallsProviders(streamerSlug: string, token: string, providers: string[]) {
  return j<{ ok: true }>(`/calls/${encodeURIComponent(streamerSlug)}/provider-allow`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ providers }),
  });
}

export async function unallowCallsProviders(streamerSlug: string, token: string, providers: string[]) {
  return j<{ ok: true; changed: boolean }>(`/calls/${encodeURIComponent(streamerSlug)}/provider-unallow`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ providers }),
  });
}

export async function allowOnlyCallsProvider(streamerSlug: string, token: string, provider: string) {
  return j<{ ok: true }>(`/calls/${encodeURIComponent(streamerSlug)}/provider-allow-only`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ provider }),
  });
}

// Suggestions slots (déjà côté API)
export type ApiSlotSuggestion = { name: string; provider: string | null; imageUrl: string | null };

export async function searchSlots(q: string, limit = 10) {
  return j<ApiSlotSuggestion[]>(`/slots/search?q=${encodeURIComponent(q)}&limit=${encodeURIComponent(String(limit))}`);
}
// ──────────────────────────────────────────
// 🧩 Calls Hunt (dashboard)
// ──────────────────────────────────────────

export type ApiHuntMode = "farm" | "open";

export type ApiHuntQueueItem = {
  id?: string;
  slotName?: string;
  provider?: string | null;
  username?: string | null;
  pos?: number;
  imageUrl?: string | null;
  betEur?: number | null; // si ton backend renvoie bet sur la queue
};

export type ApiHuntBonusDrop = {
  id?: string;
  slotName?: string;
  provider?: string | null;
  username?: string | null;
  imageUrl?: string | null;
  betEur?: number | null;
  payEur?: number | null;
};

export type ApiCallsHuntState = {
  ok: true;

  // infos hunt
  mode?: ApiHuntMode;          // "farm" | "open"
  opening?: boolean;           // fallback
  startEur?: number | null;

  // queue calls (ordre chrono)
  queue?: ApiHuntQueueItem[];  // idéal
  calls?: ApiHuntQueueItem[];  // fallback
  items?: ApiHuntQueueItem[];  // fallback

  // bonus drops list (calls avec bet)
  bonusDrops?: ApiHuntBonusDrop[];
  bonus?: ApiHuntBonusDrop[];  // fallback
};

export async function getCallsHuntState(streamerSlug: string, token?: string | null) {
  return j<ApiCallsHuntState>(`/calls/${encodeURIComponent(streamerSlug)}/hunt/state`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

// ✅ maintenant les endpoints renvoient l'état complet (même payload que getCallsHuntState)
export async function callsHuntPass(streamerSlug: string, token: string) {
  return j<ApiCallsHuntState>(`/calls/${encodeURIComponent(streamerSlug)}/hunt/pass`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function callsHuntBonusDrop(streamerSlug: string, token: string) {
  return j<ApiCallsHuntState>(`/calls/${encodeURIComponent(streamerSlug)}/hunt/bonus`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function callsHuntOpen(streamerSlug: string, token: string) {
  return j<ApiCallsHuntState>(`/calls/${encodeURIComponent(streamerSlug)}/hunt/open`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function callsHuntSetStart(streamerSlug: string, token: string, startEur: number) {
  return j<ApiCallsHuntState>(`/calls/${encodeURIComponent(streamerSlug)}/hunt/start`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ startEur }),
  });
}

export async function callsHuntSetBet(streamerSlug: string, token: string, betEur: number) {
  return j<ApiCallsHuntState>(`/calls/${encodeURIComponent(streamerSlug)}/hunt/bet`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ betEur }),
  });
}

export async function callsHuntPay(streamerSlug: string, token: string, payEur: number) {
  return j<ApiCallsHuntState>(`/calls/${encodeURIComponent(streamerSlug)}/hunt/pay`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ payEur }),
  });
}

export async function callsHuntReset(streamerSlug: string, token: string) {
  return j<ApiCallsHuntState>(`/calls/${encodeURIComponent(streamerSlug)}/hunt/reset`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ──────────────────────────────────────────
// 🧠 Shop Talents
// ──────────────────────────────────────────

export type ApiTalentItem = {
  code: string;
  level: number;
  maxLevel: number;
  nextLevel: number | null;
  nextPrice: number | null;
};

export type ShopTalentsResp = {
  ok: true;
  availableRubis: number;
  talents: ApiTalentItem[];
};

export async function shopTalents(token: string): Promise<ShopTalentsResp> {
  return j<ShopTalentsResp>("/shop/talents", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function buyTalent(token: string, code: string) {
  return j<any>("/shop/talents/buy", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
}

// ──────────────────────────────────────────
// ✅ Admin — Casino comments moderation
// ──────────────────────────────────────────
export type AdminCasinoCommentRow = {
  id: string; // comment id (uuid ou text)
  casinoId: string; // bigint -> text côté API
  casinoSlug: string;
  casinoName: string;

  userId: number;
  username: string;

  body: string;
  status: "pending" | "published" | "rejected";

  createdAt: string;
  updatedAt: string;

  // pour afficher "a des images"
  hasImages: boolean;

  // si l'auteur a aussi noté le casino au moment de poster
  authorRating: number | null;

  // images associées (peut être [])
  images: Array<{
    url: string;
    w: number | null;
    h: number | null;
    sizeBytes: number | null;
  }>;
};

export async function adminListCasinoComments(
  adminKey: string,
  statusOrParams?:
    | "pending"
    | { status?: "pending"; limit?: number; cursor?: string | null; q?: string; casinoId?: string | number | null },
  limitMaybe?: number
) {
  // compat: adminListCasinoComments(key, "pending", 80)
  const params =
    typeof statusOrParams === "string"
      ? { status: statusOrParams, limit: limitMaybe }
      : (statusOrParams ?? {});

  // backend actuel: uniquement "pending"
  const status = (params.status ?? "pending") as "pending";

  const q = new URLSearchParams();
  if (params.limit) q.set("limit", String(params.limit));
  if (params.cursor) q.set("cursor", String(params.cursor));
  if (params.q) q.set("q", String(params.q));
  if (params.casinoId != null && String(params.casinoId).trim() !== "") q.set("casinoId", String(params.casinoId));

  const qs = q.toString();

  // ✅ IMPORTANT: endpoint backend réel
  // selon ton montage Express, c’est très probablement /admin/casinos + router("/comments/pending")
  return j<{ ok: true; items: AdminCasinoCommentRow[]; nextCursor: string | null }>(
    `/admin/casinos/comments/${status}${qs ? `?${qs}` : ""}`,
    { headers: { "x-admin-key": adminKey } }
  );
}

export async function adminApproveCasinoComment(adminKey: string, commentId: string) {
  // backend réel: PATCH /admin/casinos/comments/:commentId  { action:"approve" }
  return j<{ ok: true; id: string; status: string }>(`/admin/casinos/comments/${encodeURIComponent(commentId)}`, {
    method: "PATCH",
    headers: { "x-admin-key": adminKey, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "approve" }),
  });
}

export async function adminRejectCasinoComment(adminKey: string, commentId: string) {
  return j<{ ok: true; id: string; status: string }>(`/admin/casinos/comments/${encodeURIComponent(commentId)}`, {
    method: "PATCH",
    headers: { "x-admin-key": adminKey, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "reject" }),
  });
}

export type AdminAdjustRubisMode = "add" | "remove" | "set";

export async function adminAdjustUserRubis(
  adminKey: string,
  payload: { userId: number; mode: AdminAdjustRubisMode; amount: number; origin?: string; weightBp?: number; note?: string | null }
) {
  return j<{ ok: true; txId?: string; user?: { id: number; username: string; rubis: number } }>(`/admin/rubis/adjust`, {
    method: "POST",
    headers: { "x-admin-key": adminKey, "Content-Type": "application/json" },
    body: JSON.stringify({
  userId: payload.userId,
  mode: payload.mode,
  amount: Math.floor(Number(payload.amount || 0)),
  origin: payload.origin,
  weightBp: payload.weightBp ?? 10000,
  note: payload.note ?? null,
}),
  });
}

export async function adminImpersonateUser(adminKey: string, userId: number): Promise<{ ok: true; token: string }> {
  const BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

  const res = await fetch(`${BASE}/admin/users/${userId}/impersonate`, {
    method: "GET",
    headers: {
      "content-type": "application/json",
      "x-admin-key": adminKey,
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) throw new Error(data?.error || `HTTP ${res.status}`);
  return data as { ok: true; token: string };
}
export type AdminSubscriptionRow = {
  id: number;
  userId: number;
  username: string;
  planCode: "viewer" | "streamer";
  provider: string;
  providerSubscriptionId: string;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  updatedAt: string;
};

export async function adminListSubscriptions(
  adminKey: string,
  opts: { status: "active" | "all"; q: string | null; limit?: number; offset?: number }
): Promise<{ ok: true; total: number; items: AdminSubscriptionRow[] }> {
  const params = new URLSearchParams();
  params.set("status", opts.status);
  if (opts.q) params.set("q", opts.q);
  if (opts.limit != null) params.set("limit", String(opts.limit));
  if (opts.offset != null) params.set("offset", String(opts.offset));

  const res = await fetch(`${BASE}/admin/subscriptions?${params.toString()}`, {
    headers: { "x-admin-key": adminKey },
  });
  if (!res.ok) throw new Error(`adminListSubscriptions ${res.status}`);
  return await res.json();
}

export async function adminGrantSubscription(
  adminKey: string,
  userId: number,
  planCode: "viewer" | "streamer",
  days: number
): Promise<{ ok: true; sub: AdminSubscriptionRow | null }> {
  const res = await fetch(`${BASE}/admin/subscriptions/grant`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-key": adminKey },
    body: JSON.stringify({ userId, planCode, days }),
  });
  if (!res.ok) throw new Error(`adminGrantSubscription ${res.status}`);
  return await res.json();
}

export async function adminCancelSubscription(
  adminKey: string,
  userId: number,
  planCode: "viewer" | "streamer"
): Promise<{ ok: true; updated: number }> {
  const res = await fetch(`${BASE}/admin/subscriptions/cancel`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-key": adminKey },
    body: JSON.stringify({ userId, planCode }),
  });
  if (!res.ok) throw new Error(`adminCancelSubscription ${res.status}`);
  return await res.json();
}
// ──────────────────────────────────────────
// 🧩 Content (public + admin)
// ──────────────────────────────────────────

export async function publicGetContent(key: string) {
  return j<ApiPublicGetContent>(`/public/content/${encodeURIComponent(key)}`);
}

export async function adminListContent(adminKey: string) {
  return j<ApiAdminListContent>(`/admin/content`, {
    headers: { "x-admin-key": adminKey },
  });
}

export async function adminGetContent(adminKey: string, key: string) {
  return j<ApiAdminGetContent>(`/admin/content/${encodeURIComponent(key)}`, {
    headers: { "x-admin-key": adminKey },
  });
}

export async function adminUpsertContent(
  adminKey: string,
  key: string,
  payload: AdminContentUpsertPayload & { html: string } // ✅ html requis, min_role possible
) {
  return j<{ ok: true; item?: ApiContentItem }>(`/admin/content/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { "x-admin-key": adminKey, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function adminDeleteContent(adminKey: string, key: string) {
  return j<{ ok: true }>(`/admin/content/${encodeURIComponent(key)}`, {
    method: "DELETE",
    headers: { "x-admin-key": adminKey },
  });
}
