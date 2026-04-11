const BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");
const SESSION_KEY = "ll_feature_session_id";

export type FeatureEventKind =
  | "page_visit"
  | "streamer_tab"
  | "bot_tab"
  | "clip_open"
  | "profile_style_action";

export type TrackFeatureEventInput = {
  kind: FeatureEventKind;
  subject?: string;
  meta?: Record<string, unknown> | null;
};

function randomSessionId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {}
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getFeatureSessionId() {
  if (typeof window === "undefined") return "";
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const next = randomSessionId();
    sessionStorage.setItem(SESSION_KEY, next);
    return next;
  } catch {
    return "";
  }
}

export async function trackFeatureEvent(token: string | null | undefined, input: TrackFeatureEventInput) {
  if (!token) return;

  const kind = String(input.kind || "").trim();
  if (!kind) return;

  try {
    await fetch(`${BASE}/me/feature-events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        kind,
        subject: String(input.subject || "").trim(),
        sessionId: getFeatureSessionId(),
        meta: input.meta ?? undefined,
      }),
      keepalive: true,
    });
  } catch {}
}
