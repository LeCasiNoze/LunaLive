import { loadToken } from "./storage";

export type RumbleOutreachStatus =
  | "new" | "ready" | "drafted" | "contacted" | "replied"
  | "interested" | "onboarded" | "declined" | "do_not_contact" | "skipped";

export type RumbleOutreachChannel =
  | "instagram" | "telegram" | "email" | "discord" | "twitter" | "rumble";

export type RumbleOutreachSource = {
  kind: string;
  value: string;
  url: string;
  confidence: "high" | "medium" | "low" | string;
};

export type RumbleOutreachContact = {
  id: number;
  slug: string;
  displayName: string;
  rumbleUrl: string;
  followers: number;
  instagram: string | null;
  instagramConfidence: string | null;
  telegram: string | null;
  telegramUrl: string | null;
  email: string | null;
  twitter: string | null;
  discord: string | null;
  website: string | null;
  about: string | null;
  sources: RumbleOutreachSource[];
  investigatedAt: string | null;
  status: RumbleOutreachStatus;
  preferredChannel: RumbleOutreachChannel | null;
  draftSubject: string | null;
  draftMessage: string | null;
  notes: string | null;
  contactedAt: string | null;
  nextFollowUpAt: string | null;
  updatedAt: string | null;
};

export type RumbleOutreachStats = {
  total: number;
  instagram: number;
  telegram: number;
  email: number;
  ready: number;
  contacted: number;
};

export type RumbleOutreachPatch = Partial<{
  displayName: string;
  instagram: string | null;
  instagramConfidence: "high" | "medium" | "low" | null;
  telegram: string | null;
  telegramUrl: string | null;
  email: string | null;
  twitter: string | null;
  discord: string | null;
  website: string | null;
  status: RumbleOutreachStatus;
  preferredChannel: RumbleOutreachChannel | null;
  draftSubject: string | null;
  draftMessage: string | null;
  notes: string | null;
  contactedAt: string | null;
  nextFollowUpAt: string | null;
}>;

const BASE = (
  (import.meta.env.VITE_API_BASE ??
    import.meta.env.VITE_API_URL ??
    "https://lunalive-api.onrender.com") as string
).replace(/\/$/, "");

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = loadToken();
  const headers = new Headers(init.headers || {});
  if (init.body != null && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${BASE}${path}`, { ...init, headers });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || data?.message || `API ${response.status}`);
  return data as T;
}

export function listRumbleOutreach() {
  return request<{ ok: true; contacts: RumbleOutreachContact[]; stats: RumbleOutreachStats }>(
    "/api/fsb/rumble-outreach"
  );
}

export function updateRumbleOutreach(id: number, patch: RumbleOutreachPatch) {
  return request<{ ok: true; contact: RumbleOutreachContact }>(
    `/api/fsb/rumble-outreach/${id}`,
    { method: "PATCH", body: JSON.stringify(patch) }
  );
}

export function previewRumbleOutreachEmail(id: number) {
  return request<{ ok: true; html: string }>(
    `/api/fsb/rumble-outreach/${id}/email-preview`
  );
}

export function logRumbleOutreachActivity(
  id: number,
  payload: { kind: "note" | "opened" | "copied" | "contacted" | "reply" | "follow_up"; channel?: RumbleOutreachChannel | null; detail?: string | null }
) {
  return request<{ ok: true; id: number; createdAt: string }>(
    `/api/fsb/rumble-outreach/${id}/activity`,
    { method: "POST", body: JSON.stringify(payload) }
  );
}
