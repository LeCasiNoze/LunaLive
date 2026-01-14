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
  if (!res.ok || (data && (data as any).ok === false)) {
    throw new Error((data as any)?.error || `HTTP ${res.status}`);
  }
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

// ──────────────────────────────────────────
// 🧾 Casinos CRUD
// ──────────────────────────────────────────

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
  // compat: certains back renvoient {id} ou {item:{id}} ou {casino:{id}}
  const id = String(r?.id ?? r?.item?.id ?? r?.casino?.id ?? "");
  return { ok: true as const, id };
}

export async function adminUpdateCasino(adminKey: string, id: string, patch: Partial<AdminCasino>) {
  return jAdmin<{ ok: true }>(`/admin/casinos/${encodeURIComponent(id)}`, adminKey, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

// ──────────────────────────────────────────
// 🔗 Casino links
// ──────────────────────────────────────────

export async function adminListCasinoLinks(adminKey: string, casinoId: string) {
  const r = await jAdmin<any>(`/admin/casinos/${encodeURIComponent(casinoId)}/links`, adminKey);
  const items = pickArray<AdminCasinoLink>(r, ["items", "links"]);
  return { ok: true as const, items };
}

export async function adminCreateCasinoLink(adminKey: string, casinoId: string, data: Partial<AdminCasinoLink>) {
  const r = await jAdmin<any>(`/admin/casinos/${encodeURIComponent(casinoId)}/links`, adminKey, {
    method: "POST",
    body: JSON.stringify(data),
  });
  const id = String(r?.id ?? r?.item?.id ?? "");
  return { ok: true as const, id };
}

export async function adminUpdateCasinoLink(adminKey: string, linkId: string, patch: Partial<AdminCasinoLink>) {
  return jAdmin<{ ok: true }>(`/admin/casinos/links/${encodeURIComponent(linkId)}`, adminKey, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

// ──────────────────────────────────────────
// ✅ Admin — Casino comments moderation
// ──────────────────────────────────────────

export type AdminCasinoCommentRow = {
  id: string;
  casinoId: string;
  casinoSlug: string;
  casinoName: string;

  userId: number;
  username: string;

  body: string;
  status: "pending" | "published" | "rejected";

  createdAt: string;
  updatedAt: string;

  hasImages: boolean;
  authorRating: number | null;

  images: Array<{
    url: string;
    w: number | null;
    h: number | null;
    sizeBytes: number | null;
  }>;
};

// ✅ ALIAS POUR TA PAGE (fix TS: "no exported member AdminCasinoComment")
export type AdminCasinoComment = AdminCasinoCommentRow;

export async function adminListCasinoComments(
  adminKey: string,
  statusOrParams?:
    | "pending"
    | {
        status?: "pending";
        limit?: number;
        cursor?: string | null;
        q?: string;
        casinoId?: string | number | null;
      },
  limitMaybe?: number
) {
  // compat: adminListCasinoComments(key, "pending", 80)
  const params =
    typeof statusOrParams === "string"
      ? { status: statusOrParams, limit: limitMaybe }
      : (statusOrParams ?? {});

  const status = (params.status ?? "pending") as "pending";

  const q = new URLSearchParams();
  if (params.limit) q.set("limit", String(params.limit));
  if (params.cursor) q.set("cursor", String(params.cursor));
  if (params.q) q.set("q", String(params.q));
  if (params.casinoId != null && String(params.casinoId).trim() !== "") q.set("casinoId", String(params.casinoId));

  const qs = q.toString();

  return jAdmin<{ ok: true; items: AdminCasinoCommentRow[]; nextCursor: string | null }>(
    `/admin/casinos/comments/${status}${qs ? `?${qs}` : ""}`,
    adminKey
  );
}

export async function adminApproveCasinoComment(adminKey: string, commentId: string) {
  return jAdmin<{ ok: true; id: string; status: string }>(`/admin/casinos/comments/${encodeURIComponent(commentId)}`, adminKey, {
    method: "PATCH",
    body: JSON.stringify({ action: "approve" }),
  });
}

export async function adminRejectCasinoComment(adminKey: string, commentId: string) {
  return jAdmin<{ ok: true; id: string; status: string }>(`/admin/casinos/comments/${encodeURIComponent(commentId)}`, adminKey, {
    method: "PATCH",
    body: JSON.stringify({ action: "reject" }),
  });
}
// ──────────────────────────────────────────
// ✅ Compat aliases used by UI
// ──────────────────────────────────────────

// Le composant "CasinosAdminSection" attend "published".
// Pour l’instant, on map "published" -> endpoint actuel (pending) si ton backend ne gère pas encore "published".
// Si ton backend supporte /comments/published, remplace juste le status ici.
export async function adminListPublishedCasinoComments(
  adminKey: string,
  params?: { casinoId?: string | number | null; q?: string; cursor?: string | null; limit?: number }
) {
  // Si ton backend a uniquement "pending", mets "pending".
  // Si tu as bien "published", mets "published".
  const status = "published" as any;

  // On réutilise la fonction générique
  return adminListCasinoComments(adminKey, {
    status,
    casinoId: params?.casinoId ?? null,
    q: params?.q,
    cursor: params?.cursor ?? null,
    limit: params?.limit ?? 50,
  } as any);
}

// Le composant envoie { action: "delete" }.
// On route vers approve/reject si besoin, sinon "delete" => reject (ou backend dédié si tu l’as).
export async function adminModerateCasinoComment(
  adminKey: string,
  commentId: string,
  payload: { action: "approve" | "reject" | "delete" }
) {
  const action = payload?.action;

  if (action === "approve") return adminApproveCasinoComment(adminKey, commentId);
  if (action === "reject") return adminRejectCasinoComment(adminKey, commentId);

  // delete : si ton backend a une action delete, utilise-la ici.
  // Sinon fallback -> reject
  return adminRejectCasinoComment(adminKey, commentId);
}
