// web/src/components/CallsToast.tsx
import * as React from "react";
import { createPortal } from "react-dom";

type UiToast = {
  id?: string;
  kind: "success" | "error" | "info";
  title: string;
  message?: string;

  // NEW
  durationMs?: number; // override (default 4000)
  sticky?: boolean; // pas d'auto-hide
  dismissible?: boolean; // affiche une croix

  action?: {
    label: string;
    event: string; // ex "ui:rain_join"
    detail?: any;
    dismissOnClick?: boolean; // default true
  };
};

const SHOW_MS = 4000;

export function CallsToast() {
  const queue = React.useRef<UiToast[]>([]);
  const [current, setCurrent] = React.useState<UiToast | null>(null);

  // refs anti-closures
  const currentRef = React.useRef<UiToast | null>(null);
  React.useEffect(() => {
    currentRef.current = current;
  }, [current]);

  const pump = React.useCallback(() => {
    if (currentRef.current) return;
    const next = queue.current.shift() ?? null;
    if (!next) return;
    setCurrent(next);
  }, []);

  React.useEffect(() => {
    if (!current) pump();
  }, [current, pump]);

  // timer (si pas sticky)
  React.useEffect(() => {
    if (!current) return;
    if (current.sticky) return;

    const ms = Number(current.durationMs ?? SHOW_MS);
    const id = window.setTimeout(() => setCurrent(null), Math.max(250, ms));
    return () => window.clearTimeout(id);
  }, [current]);

  // listener global
  React.useEffect(() => {
    const onToast = (e: any) => {
      const t = e?.detail as UiToast | undefined;
      if (!t?.title) return;
      queue.current.push(t);
      pump();
    };
    window.addEventListener("ui:toast", onToast as any);
    return () => window.removeEventListener("ui:toast", onToast as any);
  }, [pump]);

  // drag dismiss (simple)
  const drag = React.useRef<{
    active: boolean;
    startX: number;
    dx: number;
    pointerId: number | null;
  }>({ active: false, startX: 0, dx: 0, pointerId: null });

  const [, force] = React.useState(0);

  function onPointerDown(e: React.PointerEvent) {
    drag.current.active = true;
    drag.current.startX = e.clientX;
    drag.current.dx = 0;
    drag.current.pointerId = e.pointerId;
    (e.currentTarget as any).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current.active) return;
    drag.current.dx = e.clientX - drag.current.startX;
    force((x) => x + 1);
  }

  function onPointerUp(_e: React.PointerEvent) {
    if (!drag.current.active) return;
    drag.current.active = false;
    const dx = drag.current.dx;
    drag.current.dx = 0;
    drag.current.pointerId = null;
    force((x) => x + 1);

    if (Math.abs(dx) > 120) setCurrent(null);
  }

  if (!current) return null;

  const icon = current.kind === "success" ? "✅" : current.kind === "error" ? "⛔" : "ℹ️";

  const border =
    current.kind === "success"
      ? "rgba(80,255,160,0.22)"
      : current.kind === "error"
      ? "rgba(255,120,150,0.22)"
      : "rgba(140,180,255,0.22)";

  const bg =
    current.kind === "success"
      ? "rgba(10,18,14,0.96)"
      : current.kind === "error"
      ? "rgba(18,10,14,0.96)"
      : "rgba(10,12,18,0.96)";

  const dx = drag.current.dx;

  return createPortal(
    <div
      style={{
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        bottom: `calc(18px + env(safe-area-inset-bottom))`,
        zIndex: 2147483646,
        width: "min(560px, calc(100vw - 36px))",
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          pointerEvents: "auto",
          width: "100%",
          display: "flex",
          gap: 12,
          alignItems: "flex-start",
          padding: "12px 14px",
          borderRadius: 16,
          background: bg,
          border: `1px solid ${border}`,
          boxShadow: "0 18px 60px rgba(0,0,0,0.55)",
          backdropFilter: "blur(10px)",
          transform: `translateX(${dx}px)`,
          transition: drag.current.active ? "none" : "transform 180ms ease",
          touchAction: "pan-y",
        }}
      >
        <div style={{ fontSize: 22, lineHeight: 1 }}>{icon}</div>

        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ fontWeight: 950, letterSpacing: 0.2 }}>{current.title}</div>

            {(current.dismissible || current.sticky) ? (
              <button
                type="button"
                onClick={() => setCurrent(null)}
                style={{
                  marginLeft: "auto",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.06)",
                  color: "white",
                  fontWeight: 900,
                  cursor: "pointer",
                  padding: "6px 8px",
                }}
                aria-label="Fermer"
                title="Fermer"
              >
                ✕
              </button>
            ) : null}
          </div>

          {current.message ? (
            <div style={{ marginTop: 6, fontSize: 13, opacity: 0.92, fontWeight: 700 }}>
              {current.message}
            </div>
          ) : null}

          {current.action ? (
            <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent(current.action!.event, { detail: current.action!.detail }));
                  const dismiss = current.action!.dismissOnClick ?? true;
                  if (dismiss) setCurrent(null);
                }}
                style={{
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(80,255,160,0.25)",
                  background: "rgba(80,255,160,0.14)",
                  color: "white",
                  fontWeight: 950,
                  cursor: "pointer",
                }}
              >
                {current.action.label}
              </button>

              <div style={{ alignSelf: "center", fontSize: 12, opacity: 0.65, fontWeight: 800 }}>
                (glisse pour fermer)
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
