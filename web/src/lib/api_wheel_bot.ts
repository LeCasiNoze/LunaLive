// web/src/lib/api_wheel_bot.ts
const BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

async function j<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${BASE}${path}`, init);

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

export type ApiBotWheelEntry = { username: string };

export type ApiBotWheelState = {
  ok: true;
  cfg: { enroll_open: boolean };
  entries: ApiBotWheelEntry[];
};

export type ApiBotWheelDraw = {
  ok: true;
  winner: string | null;
  index: number | null;
};

export async function getBotWheelState(token: string) {
  return j<ApiBotWheelState>("/me/bot/bot_wheel/state", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function setBotWheelEnroll(token: string, open: boolean) {
  return j<{ ok: true }>("/me/bot/bot_wheel/enroll", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ open }),
  });
}

export async function addBotWheelEntry(token: string, username: string) {
  return j<{ ok: true }>("/me/bot/bot_wheel/add", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
}

export async function removeBotWheelEntry(token: string, username: string) {
  return j<{ ok: true }>("/me/bot/bot_wheel/remove", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
}

export async function clearBotWheel(token: string) {
  return j<{ ok: true }>("/me/bot/bot_wheel/clear", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function drawBotWheel(token: string) {
  return j<ApiBotWheelDraw>("/me/bot/bot_wheel/draw", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}
