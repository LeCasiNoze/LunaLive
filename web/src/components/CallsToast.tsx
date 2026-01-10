// web/src/components/CallsToast.tsx
import * as React from "react";
import { createPortal } from "react-dom";

type UiToast = {
  kind: "success" | "error" | "info";
  title: string;
  message?: string;
};

const SHOW_MS = 4000;

export function CallsToast() {
  const queue = React.useRef<UiToast[]>([]);
  const [current, setCurrent] = React.useState<UiToast | null>(null);

  // refs pour éviter les closures foireuses
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

  // auto-advance quand current devient null
  React.useEffect(() => {
    if (!current) pump();
  }, [current, pump]);

  // timer d’auto-hide (4s)
  React.useEffect(() => {
    if (!current) return;
    const id = window.setTimeout(() => setCurrent(null), SHOW_MS);
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

  return createPortal(
    <div
      style={{
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        bottom: `calc(18px + env(safe-area-inset-bottom))`,
        zIndex: 2147483646,
        width: "min(520px, calc(100vw - 36px))",
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
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
        }}
      >
        <div style={{ fontSize: 22, lineHeight: 1 }}>{icon}</div>

        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 950, letterSpacing: 0.2 }}>{current.title}</div>
          {current.message ? (
            <div style={{ marginTop: 6, fontSize: 13, opacity: 0.92, fontWeight: 700 }}>{current.message}</div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
