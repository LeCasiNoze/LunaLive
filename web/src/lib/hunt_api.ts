// web/src/lib/hunt_api.ts
import type { HuntState, SuggestItem, SavedHunt } from "./hunt_types";

function apiBase() {
  return (import.meta as any).env?.VITE_API_BASE || "https://lunalive-api.onrender.com";
}

function getAuthToken(): string | null {
  try {
    return localStorage.getItem("token") || localStorage.getItem("auth_token") || null;
  } catch {
    return null;
  }
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init?.headers as any),
  };

  if (token) headers.Authorization = `Bearer ${token}`;
  if (init?.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

  const r = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers,
  });

  if (r.status === 401) throw new Error("unauthorized");
  if (!r.ok) throw new Error(`HTTP ${r.status}`);

  return r.json().catch(() => ({} as any));
}

export async function huntGetState() {
  return apiJson<{ ok: boolean; state: HuntState }>("/api/hunt2/state");
}
export async function huntSuggest(q: string, limit = 12) {
  const qs = new URLSearchParams({ q, limit: String(limit) });
  return apiJson<{ ok: boolean; items: SuggestItem[] }>(`/api/hunt2/suggest?${qs.toString()}`);
}
export async function huntSetStart(start: number) {
  return apiJson<{ ok: boolean; state: HuntState }>("/api/hunt2/set-start", {
    method: "POST",
    body: JSON.stringify({ start }),
  });
}
export async function huntAdd(name: string) {
  return apiJson<{ ok: boolean; id: string }>("/api/hunt2/add", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}
export async function huntRemove(id: string) {
  return apiJson<{ ok: boolean }>("/api/hunt2/remove", {
    method: "POST",
    body: JSON.stringify({ id }),
  });
}
export async function huntSetBet(id: string, bet: number) {
  return apiJson<{ ok: boolean }>("/api/hunt2/set-bet", {
    method: "POST",
    body: JSON.stringify({ id, bet }),
  });
}
export async function huntSetPay(id: string, pay: number) {
  return apiJson<{ ok: boolean }>("/api/hunt2/set-pay", {
    method: "POST",
    body: JSON.stringify({ id, pay }),
  });
}
export async function huntOpen() {
  return apiJson<{ ok: boolean; state: HuntState }>("/api/hunt2/open", { method: "POST" });
}
export async function huntRevert() {
  return apiJson<{ ok: boolean; state: HuntState }>("/api/hunt2/revert", { method: "POST" });
}
export async function huntClose() {
  return apiJson<{ ok: boolean; state: HuntState }>("/api/hunt2/close", { method: "POST" });
}
export async function huntNew() {
  return apiJson<{ ok: boolean; state: HuntState }>("/api/hunt2/new", { method: "POST" });
}
export async function huntMyHunts() {
  return apiJson<{ ok: boolean; items: SavedHunt[] }>("/api/hunt2/my-hunts");
}
export async function huntLoad(id: number) {
  return apiJson<{ ok: boolean; state: HuntState }>("/api/hunt2/load", {
    method: "POST",
    body: JSON.stringify({ id }),
  });
}
export async function huntDelete(id: number) {
  return apiJson<{ ok: boolean }>("/api/hunt2/delete", {
    method: "POST",
    body: JSON.stringify({ id }),
  });
}
export async function huntDeleteAll() {
  return apiJson<{ ok: boolean }>("/api/hunt2/delete-all", { method: "POST" });
}
export async function huntSave(title?: string) {
  return apiJson<{ ok: boolean; id: number }>("/api/hunt2/save", {
    method: "POST",
    body: JSON.stringify(title ? { title } : {}),
  });
}
export async function huntShareCreate(expiresInSec = 0) {
  return apiJson<{ ok: boolean; token: string; url: string }>("/api/hunt2/share/create", {
    method: "POST",
    body: JSON.stringify({ expiresInSec }),
  });
}
export async function huntShareRevoke(token: string) {
  return apiJson<{ ok: boolean }>("/api/hunt2/share/revoke", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}
export async function huntShareState(token: string) {
  const qs = new URLSearchParams({ token });
  return apiJson<{ ok: boolean; state: HuntState }>(`/api/hunt2/share/state?${qs.toString()}`);
}
