// web/src/lib/api_admin_casinos.ts
const BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

async function j<T>(path: string, adminKey: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-admin-key": adminKey,
      // ✅ compat (au cas où tu check Bearer ailleurs)
      authorization: `Bearer ${adminKey}`,
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data && (data as any).ok === false)) throw new Error((data as any)?.error || `HTTP ${res.status}`);
  return data as T;
}

export type AdminCasino = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  status: "published" | "hidden" | "disabled";
  featuredRank: number | null;
  bonusHeadline: string | null;
  description: string | null;
  pros: string[];
  cons: string[];
  sections: any[];
  teamRating: number | null;
  teamReview: string | null;
  watchLevel: "none" | "watch" | "avoid";
  watchReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminCasinoLink = {
  id: string;
  casinoId: string;
  kind: "bonus" | "streamer";
  ownerUserId: number | null;
  streamerId: number | null;
  label: string | null;
  targetUrl: string;
  enabled: boolean;
  pinnedRank: number | null;
  createdAt: string;
  updatedAt: string;
};

export async function adminListCasinos(adminKey: string, opts?: { q?: string }) {
  const q = (opts?.q || "").trim();
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  return j<{ ok: true; items: AdminCasino[] }>(`/admin/casinos${qs}`, adminKey);
}

export async function adminCreateCasino(adminKey: string, slug: string, name: string) {
  return j<{ ok: true; id: string }>(`/admin/casinos`, adminKey, {
    method: "POST",
    body: JSON.stringify({ slug, name }),
  });
}

export async function adminUpdateCasino(adminKey: string, id: string, patch: Partial<AdminCasino>) {
  return j<{ ok: true }>(`/admin/casinos/${encodeURIComponent(id)}`, adminKey, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function adminListCasinoLinks(adminKey: string, casinoId: string) {
  return j<{ ok: true; items: AdminCasinoLink[] }>(`/admin/casinos/${encodeURIComponent(casinoId)}/links`, adminKey);
}

export async function adminCreateCasinoLink(adminKey: string, casinoId: string, data: Partial<AdminCasinoLink>) {
  return j<{ ok: true; id: string }>(`/admin/casinos/${encodeURIComponent(casinoId)}/links`, adminKey, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function adminUpdateCasinoLink(adminKey: string, linkId: string, patch: Partial<AdminCasinoLink>) {
  return j<{ ok: true }>(`/admin/casinos/links/${encodeURIComponent(linkId)}`, adminKey, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}
