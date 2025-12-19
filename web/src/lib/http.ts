// web/src/lib/http.ts
const DEFAULT_API = "http://localhost:3001";

export function apiBase() {
  const v = (import.meta as any).env?.VITE_API_URL;
  return String(v || DEFAULT_API).replace(/\/$/, "");
}

export function getToken() {
  try {
    return localStorage.getItem("token") || "";
  } catch {
    return "";
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const base = apiBase();
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`;

  const token = getToken();
  const headers = new Headers(init?.headers || {});
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(url, { ...init, headers });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // ignore
  }

  if (!res.ok) {
    const err = new Error(json?.error || `HTTP_${res.status}`);
    (err as any).status = res.status;
    (err as any).body = json;
    throw err;
  }
  return json as T;
}

export function getJSON<T>(path: string) {
  return req<T>(path, { method: "GET" });
}

export function patchJSON<T>(path: string, body: any) {
  return req<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}
