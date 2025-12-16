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
  if (!r.ok) throw new Error(`API ${r.status}`);
  return (await r.json()) as T;
}

/* Public */
export const getLives = () => j<ApiLive[]>("/lives");
export const getStreamer = (slug: string) => j<ApiLive>(`/streamers/${encodeURIComponent(slug)}`);
export const getStreamers = () => j<ApiStreamer[]>("/streamers");

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
