// web/src/lib/api_streamer_tabs.ts
export type AboutBlock = {
  id?: number;
  imageUrl?: string | null;
  linkUrl?: string | null;
  description?: string | null;
};

export type AgendaRuleKind = "regular" | "event";

export type AgendaRule = {
  id?: number;
  kind: AgendaRuleKind;
  title: string;
  color: string;
  dayOfWeek?: number | null; // 0..6 ou -1 = tous les jours
  date?: string | null; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
};

const BASE = (import.meta as any).env?.VITE_API_BASE ?? "https://lunalive-api.onrender.com";
const API = String(BASE).replace(/\/$/, "");

async function j<T>(url: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(url, init);
  const txt = await r.text();
  try {
    return JSON.parse(txt) as T;
  } catch {
    // @ts-ignore
    return { ok: false, error: "BAD_JSON", raw: txt } as T;
  }
}

export function absFromApiMaybe(u: string) {
  const s = String(u || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("/")) return `${API}${s}`;
  return s;
}

export async function getStreamerAbout(
  slug: string
): Promise<{ ok: true; blocks: AboutBlock[] } | { ok: false; error: string }> {
  return j(`${API}/streamers/${encodeURIComponent(slug)}/about`);
}

export async function putStreamerAbout(
  slug: string,
  token: string,
  blocks: AboutBlock[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  return j(`${API}/streamers/${encodeURIComponent(slug)}/about`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ blocks }),
  });
}

export async function uploadStreamerAboutImage(
  slug: string,
  token: string,
  file: File
): Promise<
  | { ok: true; imageUrl: string; kind?: "square"; width?: number | null; height?: number | null }
  | { ok: false; error: string }
> {
  const fd = new FormData();
  fd.append("file", file);

  return j(`${API}/streamers/${encodeURIComponent(slug)}/about/upload-image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
}

export async function getStreamerAgenda(
  slug: string
): Promise<{ ok: true; rules: AgendaRule[] } | { ok: false; error: string }> {
  return j(`${API}/streamers/${encodeURIComponent(slug)}/agenda`);
}

export async function putStreamerAgenda(
  slug: string,
  token: string,
  rules: AgendaRule[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  return j(`${API}/streamers/${encodeURIComponent(slug)}/agenda`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ rules }),
  });
}

export type ApiVod = {
  permlink: string;
  title: string;
  thumbnailUrl: string | null;
  lengthSec: number;
  createdAtMs: number;
  viewCount: number;
  bestHlsUrl: string | null;
};

export async function getStreamerVods(slug: string, cursor?: string | null, limit = 24): Promise<any> {
  const qs = new URLSearchParams();
  if (cursor) qs.set("cursor", cursor);
  qs.set("limit", String(limit));
  return j(`${API}/streamers/${encodeURIComponent(slug)}/vods?${qs.toString()}`);
}

export async function getStreamerAgendaMySubs(
  slug: string,
  token: string
): Promise<{ ok: true; ruleIds: number[] } | { ok: false; error: string }> {
  return j(`${API}/streamers/${encodeURIComponent(slug)}/agenda/subs/me`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function subscribeStreamerAgenda(
  slug: string,
  token: string,
  ruleId: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  return j(`${API}/streamers/${encodeURIComponent(slug)}/agenda/subs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ruleId }),
  });
}

export async function unsubscribeStreamerAgenda(
  slug: string,
  token: string,
  ruleId: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  return j(`${API}/streamers/${encodeURIComponent(slug)}/agenda/subs`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ruleId }),
  });
}
