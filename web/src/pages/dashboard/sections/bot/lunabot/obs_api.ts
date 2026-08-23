// web/src/pages/dashboard/sections/bot/lunabot/obs_api.ts

export const API_BASE = String(
  import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com"
).replace(/\/+$/, "");

// Overlays HTML (iframe OBS) — par défaut sur le même host que l'API.
// Override possible si un jour tu sers /overlay ailleurs.
export const OBS_OVERLAY_BASE = String(
  import.meta.env.VITE_OBS_BASE_URL ?? API_BASE
).replace(/\/+$/, "");

// 👉 Endpoints (centralisés ici si tu veux les renommer côté backend)
const OBS_CFG = "/me/overlay/widgets-config";
const OBS_VIEW_CFG = "/me/overlay/view-config";
const OBS_ALERT_TEST = "/me/overlay/alert";
const OBS_ALERT_UPLOAD = "/me/overlay/alerts/upload";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

async function authed<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });

  const text = await r.text().catch(() => "");
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!r.ok) {
    const payload = record(data);
    const msg =
      payload.error ||
      payload.message ||
      (text && text.length < 200 ? text : null) ||
      `API ${r.status}`;
    throw new Error(String(msg));
  }

  return data as T;
}

export type WidgetsConfig = {
  chat?: { maxw?: number; [key: string]: unknown };
  goal?: {
    fg?: string;
    bg?: string;
    txt?: string;
    target?: number;
    anim_passive?: string;
    anim_special?: string;
    anim_enabled?: boolean | number;
    [key: string]: unknown;
  };
  viewers?: Record<string, unknown>;
  alerts?: {
    follow_img?: string | null;
    follow_sound?: string | null;
    follow_tpl?: string;
    sound_vol?: number;
    [key: string]: unknown;
  };
};

export async function obsGetWidgetsConfig(token: string) {
  return authed<{ ok: boolean; config: WidgetsConfig }>(token, OBS_CFG);
}

export async function obsSaveWidgetsConfig(token: string, patch: Partial<WidgetsConfig>) {
  return authed<{ ok: boolean }>(token, OBS_CFG, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function obsSaveViewConfig(
  token: string,
  payload: { scale: number; font: number; line: number; maxw: number }
) {
  return authed<{ ok: boolean }>(token, OBS_VIEW_CFG, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function obsSendTestAlert(
  token: string,
  payload: { event: "follow"; name: string; uid?: number }
) {
  return authed<{ ok: boolean }>(token, OBS_ALERT_TEST, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function obsUploadAlertFile(
  token: string,
  payload: { kind: "image" | "sound"; event: "follow"; file: File }
) {
  const fd = new FormData();
  fd.set("kind", payload.kind);
  fd.set("event", payload.event);
  fd.set("file", payload.file);

  const r = await fetch(`${API_BASE}${OBS_ALERT_UPLOAD}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });

  const text = await r.text().catch(() => "");
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  const payloadData = record(data);
  if (!r.ok || payloadData.ok !== true) {
    throw new Error(String(payloadData.error || payloadData.message || "upload_failed"));
  }

  return payloadData as { ok: true; url: string };
}
