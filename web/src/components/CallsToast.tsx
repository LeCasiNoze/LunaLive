// web/src/components/CallsToast.tsx
import * as React from "react";
import { createPortal } from "react-dom";

type ToastSlot = "top" | "bottom";
type ToastSound = "achievement" | "golive" | "error" | "chest";

type ToastKind = "success" | "error" | "info" | "achievement" | "stream" | "chest";

type UiToast = {
  id?: string;

  // kind (élargi)
  kind: ToastKind | (string & {});

  // positioning
  slot?: ToastSlot; // top/bottom

  // audio
  sound?: ToastSound | null; // null => pas de son (ex: dailybonus)

  // timing / behavior
  durationMs?: number; // override (default 5000 / chest 10000)
  sticky?: boolean; // pas d'auto-hide
  dismissible?: boolean; // affiche une croix

  title: string;
  message?: string;

  action?: {
    label: string;
    event: string; // ex "ui:chest_join" / "ui:navigate" / "ui:achievements_open" / "ui:daily_bonus_agenda_open"
    detail?: any;
    dismissOnClick?: boolean; // default true
  };
};

const DEFAULT_SHOW_MS = 5000;
const CHEST_SHOW_MS = 10_000;

// ⚠️ important: pas de window au top-level (SSR / build safe)
let _toastAudioCtx: AudioContext | null = null;

function getToastAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;

  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;

  try {
    if (_toastAudioCtx && _toastAudioCtx.state !== "closed") return _toastAudioCtx;
    _toastAudioCtx = new AC();
    return _toastAudioCtx;
  } catch {
    return null;
  }
}

/** Sons placeholder (sans asset). */
function playPlaceholderSound(kind: ToastSound) {
  if (typeof window === "undefined") return;
  if (document.visibilityState !== "visible") return;

  const ctx = getToastAudioCtx();
  if (!ctx) return;

  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();

    let freq = 440;
    let ms = 140;

    if (kind === "achievement") {
      freq = 880;
      ms = 180;
    } else if (kind === "golive") {
      freq = 660;
      ms = 160;
    } else if (kind === "error") {
      freq = 220;
      ms = 220;
    } else if (kind === "chest") {
      freq = 520;
      ms = 160;
    }

    o.type = "sine";
    o.frequency.value = freq;

    g.gain.value = 0.0001;
    o.connect(g);
    g.connect(ctx.destination);

    const t0 = ctx.currentTime;
    const t1 = t0 + ms / 1000;

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t1);

    o.start(t0);
    o.stop(t1);
  } catch {}
}

function normalizeKind(k: any): ToastKind {
  const s = String(k || "info").toLowerCase();
  if (s === "error") return "error";
  if (s === "success") return "success";
  if (s === "info") return "info";
  if (s === "achievement") return "achievement";
  if (s === "stream" || s === "golive" || s === "go_live") return "stream";
  if (s === "chest") return "chest";
  return "info";
}

function defaultSlot(kind: ToastKind): ToastSlot {
  if (kind === "achievement" || kind === "stream") return "top";
  return "bottom";
}

function defaultSound(kind: ToastKind): ToastSound | null {
  if (kind === "achievement") return "achievement";
  if (kind === "stream") return "golive";
  if (kind === "error") return "error";
  if (kind === "chest") return "chest";
  return null; // success/info => silencieux par défaut
}

function defaultDuration(kind: ToastKind): number {
  if (kind === "chest") return CHEST_SHOW_MS;
  return DEFAULT_SHOW_MS;
}

function styleFor(kind: ToastKind) {
  if (kind === "error") {
    return {
      icon: "⛔",
      border: "rgba(255,120,150,0.22)",
      bg: "rgba(18,10,14,0.96)",
      actionBorder: "1px solid rgba(255,120,150,0.28)",
      actionBg: "rgba(255,120,150,0.14)",
    };
  }
  if (kind === "achievement") {
    return {
      icon: "🏆",
      border: "rgba(180,140,255,0.22)",
      bg: "rgba(16,10,22,0.96)",
      actionBorder: "1px solid rgba(180,140,255,0.30)",
      actionBg: "rgba(180,140,255,0.14)",
    };
  }
  if (kind === "stream") {
    return {
      icon: "🔴",
      border: "rgba(140,180,255,0.22)",
      bg: "rgba(10,12,18,0.96)",
      actionBorder: "1px solid rgba(140,180,255,0.28)",
      actionBg: "rgba(140,180,255,0.14)",
    };
  }
  if (kind === "chest") {
    return {
      icon: "🎁",
      border: "rgba(80,255,160,0.22)",
      bg: "rgba(10,18,14,0.96)",
      actionBorder: "1px solid rgba(80,255,160,0.28)",
      actionBg: "rgba(80,255,160,0.14)",
    };
  }
  if (kind === "success") {
    return {
      icon: "✅",
      border: "rgba(80,255,160,0.22)",
      bg: "rgba(10,18,14,0.96)",
      actionBorder: "1px solid rgba(80,255,160,0.28)",
      actionBg: "rgba(80,255,160,0.14)",
    };
  }
  return {
    icon: "ℹ️",
    border: "rgba(140,180,255,0.22)",
    bg: "rgba(10,12,18,0.96)",
    actionBorder: "1px solid rgba(140,180,255,0.28)",
    actionBg: "rgba(140,180,255,0.14)",
  };
}

type DragState = {
  active: boolean;
  startX: number;
  dx: number;
  pointerId: number | null;
};

function useToastLane() {
  const queue = React.useRef<UiToast[]>([]);
  const [current, setCurrent] = React.useState<UiToast | null>(null);

  const currentRef = React.useRef<UiToast | null>(null);
  React.useEffect(() => {
    currentRef.current = current;
  }, [current]);

  const pump = React.useCallback(() => {
    if (currentRef.current) return;
    const next = queue.current.shift() ?? null;
    if (!next) return;

    setCurrent(next);

    const k = normalizeKind(next.kind);
    const s = next.sound === undefined ? defaultSound(k) : next.sound;
    if (s) playPlaceholderSound(s);
  }, []);

  React.useEffect(() => {
    if (!current) pump();
  }, [current, pump]);

  React.useEffect(() => {
    if (!current) return;
    if (current.sticky) return;

    const k = normalizeKind(current.kind);
    const ms = Number(current.durationMs ?? defaultDuration(k));
    const id = window.setTimeout(() => setCurrent(null), Math.max(250, ms));
    return () => window.clearTimeout(id);
  }, [current]);

  return { queue, current, setCurrent, pump };
}

export function CallsToast() {
  const top = useToastLane();
  const bottom = useToastLane();

  // ✅ refs pour éviter de ré-attacher le listener à chaque render
  const topRef = React.useRef(top);
  const bottomRef = React.useRef(bottom);
  React.useEffect(() => {
    topRef.current = top;
    bottomRef.current = bottom;
  });

  // 🔊 Unlock audio au premier geste utilisateur (sinon WebAudio est muet)
  React.useEffect(() => {
    const unlock = () => {
      const ctx = getToastAudioCtx();
      if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    };
    window.addEventListener("pointerdown", unlock, { once: true, passive: true } as any);
    window.addEventListener("keydown", unlock, { once: true } as any);
    return () => {
      window.removeEventListener("pointerdown", unlock as any);
      window.removeEventListener("keydown", unlock as any);
    };
  }, []);

  // drag states (un par lane)
  const topDrag = React.useRef<DragState>({ active: false, startX: 0, dx: 0, pointerId: null });
  const botDrag = React.useRef<DragState>({ active: false, startX: 0, dx: 0, pointerId: null });
  const [, force] = React.useState(0);

  function onPointerDownFactory(drag: React.MutableRefObject<DragState>) {
    return (e: React.PointerEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("button,[data-toast-nodrag='1']")) return;

      drag.current.active = true;
      drag.current.startX = e.clientX;
      drag.current.dx = 0;
      drag.current.pointerId = e.pointerId;
      (e.currentTarget as any).setPointerCapture?.(e.pointerId);
    };
  }

  function onPointerMoveFactory(drag: React.MutableRefObject<DragState>) {
    return (e: React.PointerEvent) => {
      if (!drag.current.active) return;
      drag.current.dx = e.clientX - drag.current.startX;
      force((x) => x + 1);
    };
  }

  function onPointerUpFactory(drag: React.MutableRefObject<DragState>, dismiss: () => void) {
    return (_e: React.PointerEvent) => {
      if (!drag.current.active) return;
      drag.current.active = false;
      const dx = drag.current.dx;
      drag.current.dx = 0;
      drag.current.pointerId = null;
      force((x) => x + 1);

      if (Math.abs(dx) > 120) dismiss();
    };
  }

  // ✅ listener global (UNE SEULE FOIS)
  React.useEffect(() => {
    const onToast = (e: any) => {
      const t = e?.detail as UiToast | undefined;
      if (!t?.title) return;

      const kind = normalizeKind(t.kind);
      const slot = (t.slot ?? defaultSlot(kind)) as ToastSlot;

      const normalized: UiToast = {
        ...t,
        kind,
        slot,
        dismissible: t.dismissible ?? true,
        durationMs: t.durationMs ?? defaultDuration(kind),
        sound: t.sound ?? undefined, // undefined => defaultSound(kind), null => silencieux
      };

      const T = topRef.current;
      const B = bottomRef.current;

      if (slot === "top") {
        T.queue.current.push(normalized);
        T.pump();
      } else {
        B.queue.current.push(normalized);
        B.pump();
      }
    };

    window.addEventListener("ui:toast", onToast as any);
    return () => window.removeEventListener("ui:toast", onToast as any);
  }, []);

  function RenderLane(p: {
    current: UiToast | null;
    setCurrent: (v: UiToast | null) => void;
    drag: React.MutableRefObject<DragState>;
    slot: ToastSlot;
  }) {
    const { current, setCurrent, drag, slot } = p;
    if (!current) return null;

    const k = normalizeKind(current.kind);
    const st = styleFor(k);
    const dx = drag.current.dx;

    const wrapperPosStyle =
      slot === "top"
        ? { top: `calc(14px + env(safe-area-inset-top))`, bottom: "auto" as const }
        : { bottom: `calc(18px + env(safe-area-inset-bottom))`, top: "auto" as const };

    return (
      <div
        style={{
          position: "fixed",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 2147483646,
          width: "min(560px, calc(100vw - 36px))",
          display: "flex",
          justifyContent: "center",
          pointerEvents: "none",
          ...wrapperPosStyle,
        }}
      >
        <div
          onPointerDown={onPointerDownFactory(drag)}
          onPointerMove={onPointerMoveFactory(drag)}
          onPointerUp={onPointerUpFactory(drag, () => setCurrent(null))}
          onPointerCancel={onPointerUpFactory(drag, () => setCurrent(null))}
          style={{
            pointerEvents: "auto",
            width: "100%",
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
            padding: "12px 14px",
            borderRadius: 16,
            background: st.bg,
            border: `1px solid ${st.border}`,
            boxShadow: "0 18px 60px rgba(0,0,0,0.55)",
            backdropFilter: "blur(10px)",
            transform: `translateX(${dx}px)`,
            transition: drag.current.active ? "none" : "transform 180ms ease",
            touchAction: "pan-y",
          }}
        >
          <div style={{ fontSize: 22, lineHeight: 1 }}>{st.icon}</div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ fontWeight: 950, letterSpacing: 0.2 }}>{current.title}</div>

              {(current.dismissible || current.sticky) ? (
                <button
                  data-toast-nodrag="1"
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrent(null);
                  }}
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
              <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  data-toast-nodrag="1"
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    window.dispatchEvent(
                      new CustomEvent(current.action!.event, {
                        detail: current.action!.detail,
                      })
                    );
                    const dismiss = current.action!.dismissOnClick ?? true;
                    if (dismiss) setCurrent(null);
                  }}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 14,
                    border: st.actionBorder,
                    background: st.actionBg,
                    color: "white",
                    fontWeight: 950,
                    cursor: "pointer",
                  }}
                >
                  {current.action.label}
                </button>

                <div style={{ fontSize: 12, opacity: 0.65, fontWeight: 800 }}>(glisse pour fermer)</div>
              </div>
            ) : (
              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.65, fontWeight: 800 }}>(glisse pour fermer)</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!top.current && !bottom.current) return null;

  return createPortal(
    <>
      <RenderLane current={top.current} setCurrent={top.setCurrent} drag={topDrag} slot="top" />
      <RenderLane current={bottom.current} setCurrent={bottom.setCurrent} drag={botDrag} slot="bottom" />
    </>,
    document.body
  );
}
