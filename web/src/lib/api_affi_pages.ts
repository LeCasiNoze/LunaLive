const BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

export type FsbAffiPage = {
  id: number;
  slug: string;
  model: number;
  variant: string | null;
  brandName: string;
  title: string;
  // V1 = Record<string,string> | V2 = arbre V2Page (objets imbriqués).
  // On garde le typage permissif côté API ; le consumer cast selon
  // editorVersion.
  config: Record<string, any>;
  editorVersion?: number;
  ownerUserId: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type UpsertAffiPagePayload = {
  slug?: string | null;
  model: number;
  variant?: string | null;
  brandName: string;
  title: string;
  config: Record<string, any>;
  editorVersion?: number;
};

async function request<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${BASE}${path}`, init);
  const text = await response.text().catch(() => "");

  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(String(data?.error || data?.message || `API ${response.status}`));
  }

  return data as T;
}

export function listFsbAffiPages(token: string) {
  return request<{ ok: true; items: FsbAffiPage[] }>("/api/fsb/affi-pages", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function createFsbAffiPage(token: string, payload: UpsertAffiPagePayload) {
  return request<{ ok: true; item: FsbAffiPage }>("/api/fsb/affi-pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export function updateFsbAffiPage(token: string, id: number, payload: UpsertAffiPagePayload) {
  return request<{ ok: true; item: FsbAffiPage }>(`/api/fsb/affi-pages/${encodeURIComponent(String(id))}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export function deleteFsbAffiPage(token: string, id: number) {
  return request<{ ok: true }>(`/api/fsb/affi-pages/${encodeURIComponent(String(id))}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getPublicAffiPage(slug: string) {
  return request<{ ok: true; page: FsbAffiPage }>(`/api/public/affi-pages/${encodeURIComponent(slug)}`);
}
