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
  dayOfWeek?: number | null; // 0=dim ... 6=sam
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
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ blocks }),
  });
}

export async function uploadStreamerAboutImage(
  slug: string,
  token: string,
  file: File
): Promise<{ ok: true; imageUrl: string } | { ok: false; error: string }> {
  const fd = new FormData();
  fd.append("file", file);

  return j(`${API}/streamers/${encodeURIComponent(slug)}/about/upload-image`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
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
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ rules }),
  });
}
