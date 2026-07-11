// Conteneur pinch-zoom (mobile) : zoome UNIQUEMENT son contenu (le stream),
// le layout autour ne bouge pas. 2 doigts = zoom + déplacement, double-tap
// = reset. Transform appliqué en direct sur le DOM (pas de re-render React
// à chaque frame). 1 doigt = scroll de page normal (touchAction pan-y).
import * as React from "react";

const MAX_SCALE = 4;

export function PinchZoomBox({ children }: { children: React.ReactNode }) {
  const innerRef = React.useRef<HTMLDivElement>(null);
  const st = React.useRef({
    scale: 1,
    tx: 0,
    ty: 0,
    pointers: new Map<number, { x: number; y: number }>(),
    start: null as null | { dist: number; cx: number; cy: number; scale: number; tx: number; ty: number },
    lastTap: 0,
  });

  const apply = () => {
    const el = innerRef.current;
    if (!el) return;
    const s = st.current;
    el.style.transform = s.scale === 1 ? "" : `translate(${s.tx}px, ${s.ty}px) scale(${s.scale})`;
  };

  const clampPan = () => {
    const el = innerRef.current;
    if (!el) return;
    const s = st.current;
    // le contenu zoomé ne doit jamais laisser apparaître le fond
    const maxX = ((s.scale - 1) * el.clientWidth) / 2;
    const maxY = ((s.scale - 1) * el.clientHeight) / 2;
    s.tx = Math.max(-maxX, Math.min(maxX, s.tx));
    s.ty = Math.max(-maxY, Math.min(maxY, s.ty));
  };

  const reset = () => {
    const s = st.current;
    s.scale = 1;
    s.tx = 0;
    s.ty = 0;
    apply();
  };

  const geom = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
    dist: Math.hypot(b.x - a.x, b.y - a.y),
    cx: (a.x + b.x) / 2,
    cy: (a.y + b.y) / 2,
  });

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    const s = st.current;
    s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (s.pointers.size === 2) {
      const [a, b] = [...s.pointers.values()];
      const g = geom(a, b);
      s.start = { dist: g.dist, cx: g.cx, cy: g.cy, scale: s.scale, tx: s.tx, ty: s.ty };
    } else if (s.pointers.size === 1) {
      // double-tap = reset zoom
      const now = Date.now();
      if (now - s.lastTap < 300 && s.scale > 1) reset();
      s.lastTap = now;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    const s = st.current;
    if (!s.pointers.has(e.pointerId)) return;
    s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (s.pointers.size !== 2 || !s.start) return;

    const [a, b] = [...s.pointers.values()];
    const g = geom(a, b);
    s.scale = Math.max(1, Math.min(MAX_SCALE, (s.start.scale * g.dist) / Math.max(1, s.start.dist)));
    s.tx = s.start.tx + (g.cx - s.start.cx);
    s.ty = s.start.ty + (g.cy - s.start.cy);
    clampPan();
    apply();
    e.preventDefault();
  };

  const onPointerEnd = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    const s = st.current;
    s.pointers.delete(e.pointerId);
    if (s.pointers.size < 2) s.start = null;
    // presque dézoomé → snap propre à 1
    if (s.scale < 1.06) reset();
  };

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      style={{ overflow: "hidden", position: "relative", touchAction: "pan-y", width: "100%" }}
    >
      <div ref={innerRef} style={{ transformOrigin: "center center", willChange: "transform" }}>
        {children}
      </div>
    </div>
  );
}
