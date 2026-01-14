// web/src/lib/api_admin_casinos.ts
const BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

async function jAdmin<T>(path: string, adminKey: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-admin-key": adminKey,
      ...(init.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data && data.ok === false)) throw new Error(data?.error || `HTTP ${res.status}`);
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

function pickArray<T>(obj: any, keys: string[]): T[] {
  for (const k of keys) {
    const v = obj?.[k];
    if (Array.isArray(v)) return v as T[];
  }
  return [];
}

export async function adminListCasinos(adminKey: string, opts?: { q?: string }) {
  const q = (opts?.q || "").trim();
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  const r = await jAdmin<any>(`/admin/casinos${qs}`, adminKey);
  const items = pickArray<AdminCasino>(r, ["items", "listings", "casinos"]);
  return { ok: true as const, items };
}

export async function adminCreateCasino(adminKey: string, slug: string, name: string) {
  const r = await jAdmin<any>(`/admin/casinos`, adminKey, {
    method: "POST",
    body: JSON.stringify({ slug, name }),
  });
  // compat: certains back renvoient {id} ou {item:{id}}
  const id = String(r?.id ?? r?.item?.id ?? r?.casino?.id ?? "");
  return { ok: true as const, id };
}

export async function adminUpdateCasino(adminKey: string, id: string, patch: Partial<AdminCasino>) {
  return jAdmin<{ ok: true }>(`/admin/casinos/${encodeURIComponent(id)}`, adminKey, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function adminListCasinoLinks(adminKey: string, casinoId: string) {
  const r = await jAdmin<any>(`/admin/casinos/${encodeURIComponent(casinoId)}/links`, adminKey);
  const items = pickArray<AdminCasinoLink>(r, ["items", "links"]);
  return { ok: true as const, items };
}

export async function adminCreateCasinoLink(
  adminKey: string,
  casinoId: string,
  data: Partial<AdminCasinoLink>
) {
  const r = await jAdmin<any>(`/admin/casinos/${encodeURIComponent(casinoId)}/links`, adminKey, {
    method: "POST",
    body: JSON.stringify(data),
  });
  const id = String(r?.id ?? "");
  return { ok: true as const, id };
}

export async function adminUpdateCasinoLink(adminKey: string, linkId: string, patch: Partial<AdminCasinoLink>) {
  return jAdmin<{ ok: true }>(`/admin/casinos/links/${encodeURIComponent(linkId)}`, adminKey, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}
