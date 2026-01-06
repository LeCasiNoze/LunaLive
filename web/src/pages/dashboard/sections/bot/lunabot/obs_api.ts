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
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!r.ok) {
    const msg =
      data?.error ||
      data?.message ||
      (text && text.length < 200 ? text : null) ||
      `API ${r.status}`;
    throw new Error(String(msg));
  }

  return data as T;
}

export type WidgetsConfig = {
  chat?: any;
  goal?: any;
  viewers?: any;
  alerts?: any;
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
  payload:
    | { event: "follow"; name: string; uid?: number }
    | { event: "donation"; name: string; amount: number; gift: string; uid?: number }
) {
  return authed<{ ok: boolean }>(token, OBS_ALERT_TEST, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function obsUploadAlertFile(
  token: string,
  payload: { kind: "image" | "sound"; event: "follow" | "donation"; file: File }
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
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!r.ok || !data?.ok) {
    throw new Error(String(data?.error || data?.message || "upload_failed"));
  }

  return data as { ok: true; url: string };
}
