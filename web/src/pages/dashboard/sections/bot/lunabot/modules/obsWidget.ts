// web/src/pages/dashboard/sections/bot/lunabot/modules/obsWidget.ts
export function buildObsChatUrl(
  slug: string,
  secret: string,
  opts?: {
    max?: number;
    compact?: 0 | 1;
    bg?: 0 | 1;          // 0 transparent, 1 opaque
    refreshSec?: number; // reconnect soft
  }
) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const s = String(slug || "").trim();
  const k = String(secret || "").trim();

  const u = new URL(`${origin}/obs/chat/${encodeURIComponent(s)}`);
  u.searchParams.set("k", k);

  u.searchParams.set("max", String(opts?.max ?? 40));
  u.searchParams.set("compact", String(opts?.compact ?? 0));
  u.searchParams.set("bg", String(opts?.bg ?? 0));
  u.searchParams.set("r", String(opts?.refreshSec ?? 45)); // 45s par défaut

  return u.toString();
}
