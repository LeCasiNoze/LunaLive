// web/src/components/events/EventWheelDial.tsx
import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { ApiWheelSegment } from "../../lib/api_events";

const SEGMENT_COLORS = ["#5b21b6", "#d97706", "#3730a3", "#be185d", "#047857", "#7c3aed", "#b45309", "#4338ca"];

export type WheelSegmentMeta = { startDeg: number; endDeg: number; midDeg: number; color: string };

function polarPoint(angleDeg: number, radius: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: 50 + Math.cos(a) * radius, y: 50 + Math.sin(a) * radius };
}

function wedgePath(startDeg: number, endDeg: number) {
  const start = polarPoint(startDeg, 47);
  const end = polarPoint(endDeg, 47);
  return `M 50 50 L ${start.x} ${start.y} A 47 47 0 ${endDeg - startDeg > 180 ? 1 : 0} 1 ${end.x} ${end.y} Z`;
}

function shortWheelLabel(segment: ApiWheelSegment) {
  const raw = segment.lotLabel && segment.lotLabel !== "—" ? segment.lotLabel : `${segment.points} pts`;
  if (/jackpot/i.test(raw)) return "JACKPOT";
  if (/cosm/i.test(raw)) return "COSMÉTIQUE";
  if (/ticket.*sub/i.test(raw)) return "TICKET SUB";
  return raw.length > 15 ? `${raw.slice(0, 13)}…` : raw;
}

// Parts ÉGALES visuellement (chaque section = même angle) — la vraie chance de
// tomber sur une section est portée par sa proba (tirage pondéré côté serveur),
// PAS par la taille de la part. Une roue "casino" lisible : les probas réelles
// restent consultables via la popup Chances.
export function computeWheelSegments(wheel: ApiWheelSegment[]): WheelSegmentMeta[] {
  const n = wheel.length || 1;
  const step = 360 / n;
  return wheel.map((_seg, i) => {
    const startDeg = i * step;
    const endDeg = (i + 1) * step;
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
      <div className="evWheelPointer"><span /></div>
      <motion.div
        className="evWheelDial"
        style={{ background: gradient }}
        animate={{ rotate: rotationDeg }}
        transition={!spinning || reduceMotion ? { duration: 0 } : { duration: 2.6, ease: [0.13, 0.85, 0.22, 1] }}
      >
        <svg className="evWheelSvg" viewBox="0 0 100 100" role="img" aria-label="Roue des gains">
          <circle cx="50" cy="50" r="49" className="evWheelSvgBack" />
          {wheel.map((segment, index) => {
            const meta = segMeta[index];
            const pos = polarPoint(meta.midDeg, 34);
            const label = shortWheelLabel(segment);
            const textRotation = meta.midDeg > 90 && meta.midDeg < 270 ? meta.midDeg + 180 : meta.midDeg;
            return (
              <g key={`${index}-${label}`} className="evWheelSlice">
                <path d={wedgePath(meta.startDeg, meta.endDeg)} fill={meta.color} />
                <text
                  x={pos.x}
                  y={pos.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={`rotate(${textRotation} ${pos.x} ${pos.y})`}
                >
                  {label}
                </text>
              </g>
            );
          })}
          <circle cx="50" cy="50" r="47" className="evWheelSvgInnerRim" />
        </svg>
        <div className="evWheelRimLights" aria-hidden="true" />
      </motion.div>
      <div className="evWheelHub"><span>LL</span><small>SPIN</small></div>
    </div>
  );
}
