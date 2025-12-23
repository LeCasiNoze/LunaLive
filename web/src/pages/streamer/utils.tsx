// web/src/pages/streamer/utils.tsx
import * as React from "react";

export function getAnonId(): string {
  const key = "ll_anon_id";
  const existing = localStorage.getItem(key);
  if (existing && existing.trim()) return existing;

  const anyCrypto: any = (globalThis as any).crypto;
  const created: string =
    typeof anyCrypto?.randomUUID === "function"
      ? anyCrypto.randomUUID()
      : `a_${Math.random().toString(16).slice(2)}_${Date.now()}`;

  localStorage.setItem(key, created);
  return created;
}

export function formatDurationFrom(startedAtMs: number, nowMs: number) {
  const diffMs = Math.max(0, nowMs - startedAtMs);
  const totalMin = Math.floor(diffMs / 60_000);

  if (totalMin < 60) return `${totalMin} min`;

  const totalH = Math.floor(totalMin / 60);
  const min = totalMin % 60;

  if (totalH < 24) return min > 0 ? `${totalH} h ${min} min` : `${totalH} h`;

  const days = Math.floor(totalH / 24);
  const h = totalH % 24;

  if (h > 0) return `${days} j ${h} h`;
  return `${days} j`;
}

export function LiveDurationText({ isLive, startedAtMs }: { isLive: boolean; startedAtMs: number | null }) {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!isLive || !startedAtMs) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [isLive, startedAtMs]);

  if (!isLive || !startedAtMs) return <>—</>;
  return <>{formatDurationFrom(startedAtMs, now)}</>;
}

export function isFullscreen() {
  const d: any = document;
  return !!(document.fullscreenElement || d.webkitFullscreenElement);
}

export function requestFullscreenSafe(el?: HTMLElement) {
  try {
    const target: any = el || document.documentElement;
    const req = target.requestFullscreen || target.webkitRequestFullscreen;
    if (typeof req !== "function") return;

    try {
      const p = req.call(target, { navigationUI: "hide" as any });
      if (p?.catch) p.catch(() => {});
    } catch {
      const p = req.call(target);
      if (p?.catch) p.catch(() => {});
    }
  } catch {}
}

export function exitFullscreenSafe() {
  try {
    const d: any = document;
    const exit = document.exitFullscreen || d.webkitExitFullscreen;
    if (typeof exit !== "function") return;
    const p = exit.call(document);
    if (p?.catch) p.catch(() => {});
  } catch {}
}
