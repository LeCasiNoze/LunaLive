// web/src/lib/api_admin_reports.ts
export type AdminReportKind = "report" | "feedback";

export type AdminReportRow = {
  id: number;
  kind: AdminReportKind;
  status: "open" | "closed" | "deleted" | string;
  category: string;
  subject: string;
  description: string;
  createdAt: string;

  userId?: number;
  username?: string;

  target?: {
    username?: string | null;
    slug?: string | null;
    url?: string | null;
  } | null;

  attachments?: Array<{
    name: string;
    mime: string;
    size: number;
    dataUrl?: string; // si backend renvoie dataUrl direct
    url?: string;     // si backend stocke et renvoie une URL
  }>;
};

const BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

async function j<T>(path: string, adminKey: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      // ✅ convention la plus courante côté admin (si ton backend utilise un autre header, dis-moi et je te le swap)
      "x-admin-key": adminKey,
      ...(init.headers || {}),
    },
  });

  const txt = await res.text().catch(() => "");
  let data: any = null;
  try {
    data = txt ? JSON.parse(txt) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const msg = data?.error || data?.message || `http_${res.status}`;
    throw new Error(msg);
  }

  return data as T;
}

/**
 * GET /admin/reports?status=open|closed|all&limit=...
 * -> { ok:true, items:[...], counts?: { open:number, closed:number } }
 */
export async function adminListReports(
  adminKey: string,
  status: "open" | "closed" | "all" = "open",
  limit = 120
): Promise<{ ok: true; items: AdminReportRow[]; counts?: { open: number; closed: number } }> {
  const qs = new URLSearchParams();
  qs.set("status", status);
  qs.set("limit", String(limit));
  return j(`/admin/reports?${qs.toString()}`, adminKey);
}

/**
 * GET /admin/reports/:id
 */
export async function adminGetReport(
  adminKey: string,
  id: number
): Promise<{ ok: true; item: AdminReportRow }> {
  return j(`/admin/reports/${encodeURIComponent(String(id))}`, adminKey);
}

/**
 * POST /admin/reports/:id/status { status: "open"|"closed"|"deleted" }
 */
export async function adminSetReportStatus(
  adminKey: string,
  id: number,
  status: "open" | "closed" | "deleted"
): Promise<{ ok: true }> {
  return j(`/admin/reports/${encodeURIComponent(String(id))}/status`, adminKey, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}

/**
 * DELETE /admin/reports/:id
 */
export async function adminDeleteReport(adminKey: string, id: number): Promise<{ ok: true }> {
  return j(`/admin/reports/${encodeURIComponent(String(id))}`, adminKey, { method: "DELETE" });
}
