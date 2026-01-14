// web/src/lib/api_admin_casino_comments.ts
const BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

async function j<T>(path: string, adminKey: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      "x-admin-key": adminKey,
    },
  });

  const text = await res.text().catch(() => "");
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {}

  if (!res.ok || data?.ok === false) {
    throw new Error(String(data?.error || data?.message || text || `HTTP ${res.status}`));
  }
  return data as T;
}

export type AdminPendingCasinoComment = {
  id: string;
  casinoId: string;
  casinoSlug: string;
  casinoName: string;
  casinoLogoUrl: string | null;

  userId: number;
  username: string;

  body: string;
  createdAt: string;
  hasImages: boolean;
  status: "pending" | "published" | "rejected" | "deleted";

  images: Array<{ url: string; w: number | null; h: number | null; sizeBytes: number | null }>;
};

export async function adminListPendingCasinoComments(
  adminKey: string,
  params?: { limit?: number; cursor?: string | null; q?: string; casinoId?: string | number | null }
) {
  const q = new URLSearchParams();
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.cursor) q.set("cursor", String(params.cursor));
  if (params?.q) q.set("q", String(params.q));
  if (params?.casinoId != null && String(params.casinoId).trim() !== "") q.set("casinoId", String(params.casinoId));

  const qs = q.toString();
  return j<{ ok: true; items: AdminPendingCasinoComment[]; nextCursor: string | null }>(
    `/admin/casinos/comments/pending${qs ? `?${qs}` : ""}`,
    adminKey
  );
}

export async function adminModerateCasinoComment(
  adminKey: string,
  commentId: string,
  action: "approve" | "reject" | "delete",
  note?: string | null
) {
  return j<{ ok: true; id: string; status: string }>(`/admin/casinos/comments/${encodeURIComponent(commentId)}`, adminKey, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, note: note ?? null }),
  });
}
