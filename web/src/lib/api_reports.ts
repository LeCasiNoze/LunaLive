const BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

async function j<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `http_${res.status}`);
  return data as T;
}

export type ReportKind = "report" | "feedback";
export type ReportCategory =
  | "spam"
  | "harassment"
  | "scam"
  | "cheating"
  | "underage"
  | "other"
  | "bug"
  | "suggestion"
  | "uiux"
  | "performance";

export type ReportTarget = {
  type?: "user" | "streamer" | "clip" | "message" | "other";
  userId?: number | null;
  username?: string | null;
  slug?: string | null;
  url?: string | null;
};

export type ReportAttachment = { name: string; dataUrl: string; mime: string; size: number };

export async function createReport(token: string, payload: {
  kind: ReportKind;
  category: string;
  subject: string;
  description: string;
  allowContact?: boolean; // ✅ optionnel
  target?: ReportTarget;
  attachments?: ReportAttachment[];
}) {
  return j<{ ok: true; id: number; created_at: string }>(`/reports`, token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function adminListReports(token: string, status?: "open" | "triaged" | "closed") {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return j<{ ok: true; items: any[] }>(`/reports/admin/list${qs}`, token);
}

export async function adminUpdateReport(token: string, id: number, patch: { status?: string; admin_notes?: string }) {
  return j<{ ok: true; item: any }>(`/reports/admin/${id}`, token, {
    method: "POST",
    body: JSON.stringify(patch),
  });
}
