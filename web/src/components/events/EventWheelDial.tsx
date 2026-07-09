// web/src/components/events/EventWheelDial.tsx
import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { ApiWheelSegment } from "../../lib/api_events";

const SEGMENT_COLORS = ["#a78bfa", "#7c5cf0", "#c4b5fd", "#5b8ef8", "#fbbf24", "#f472b6", "#34d399", "#f59e0b"];

export type WheelSegmentMeta = { startDeg: number; endDeg: number; midDeg: number; color: string };

// Angles proportionnels aux probas réelles (pas des tranches égales) — la
// table de taux est publiée, la roue doit refléter honnêtement les chances.
export function computeWheelSegments(wheel: ApiWheelSegment[]): WheelSegmentMeta[] {
  const total = wheel.reduce((s, w) => s + (Number(w.proba) || 0), 0) || 1;
  let acc = 0;
  return wheel.map((seg, i) => {
    const startDeg = (acc / total) * 360;
    acc += Number(seg.proba) || 0;
    const endDeg = (acc / total) * 360;
    return { startDeg, endDeg, midDeg: (startDeg + endDeg) / 2, color: SEGMENT_COLORS[i % SEGMENT_COLORS.length] };
  });
}

// Roue CSS conic-gradient + pointeur fixe. Le pivot (rotationDeg) est piloté
// par le parent, qui calcule la cible d'alignement à partir de la réponse du
// spin — ce composant ne connaît que l'angle final à atteindre.
export function EventWheelDial({
  wheel,
  rotationDeg,
  spinning,
}: {
  wheel: ApiWheelSegment[];
  rotationDeg: number;
  spinning: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const segMeta = React.useMemo(() => computeWheelSegments(wheel), [wheel]);
  const gradient = React.useMemo(
    () => (segMeta.length > 0 ? `conic-gradient(${segMeta.map((m) => `${m.color} ${m.startDeg}deg ${m.endDeg}deg`).join(", ")})` : undefined),
    [segMeta]
  );

  return (
    <div className="evWheelStage">
      <div className="evWheelGlow" />
      <div className="evWheelPointer" />
      <motion.div
        className="evWheelDial"
        style={{ background: gradient }}
        animate={{ rotate: rotationDeg }}
        transition={!spinning || reduceMotion ? { duration: 0 } : { duration: 2.6, ease: [0.13, 0.85, 0.22, 1] }}
      />
      <div className="evWheelHub">🎡</div>
    </div>
  );
}
