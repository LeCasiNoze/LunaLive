export type ApiUser = { id: number; username: string; rubis: number; role: string };

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
export async function register(username: string, password: string) {
  return j<{ ok: true; token: string; user: ApiUser }>("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
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
