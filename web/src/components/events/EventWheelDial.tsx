// web/src/components/events/EventWheelDial.tsx
import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { ApiWheelSegment } from "../../lib/api_events";
import { EventAvatar } from "./EventAvatar";

// Durée d'un tour de roue (partagée avec le parent pour caler le timeout du
// résultat). Longue exprès : plus de suspens.
export const WHEEL_SPIN_MS = 4800;

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

// Roue SVG + pointeur fixe. Le pivot (rotationDeg) est piloté par le parent.
// Les LABELS ne sont pas dans le SVG tournant : ils vivent dans une couche qui
// tourne avec la roue MAIS contre-tourne chaque libellé (−rotationDeg, même
// transition) → les textes restent TOUJOURS droits, quelle que soit la position
// de la roue (fini les textes à l'envers). L'avatar de l'utilisateur (perso ou
// défaut) est au moyeu central.
export function EventWheelDial({
  wheel,
  rotationDeg,
  spinning,
  avatarUserId,
  avatarName,
}: {
  wheel: ApiWheelSegment[];
  rotationDeg: number;
  spinning: boolean;
  avatarUserId?: number | null;
  avatarName?: string;
}) {
  const reduceMotion = useReducedMotion();
  const segMeta = React.useMemo(() => computeWheelSegments(wheel), [wheel]);
  const spinTransition = !spinning || reduceMotion ? { duration: 0 } : { duration: WHEEL_SPIN_MS / 1000, ease: [0.12, 0.9, 0.16, 1] as const };

  return (
    <div className="evWheelStage">
      <div className="evWheelGlow" />
      <div className="evWheelPointer"><span /></div>

      <motion.div className="evWheelDial" animate={{ rotate: rotationDeg }} transition={spinTransition}>
        <svg className="evWheelSvg" viewBox="0 0 100 100" role="img" aria-label="Roue des gains">
          <circle cx="50" cy="50" r="49" className="evWheelSvgBack" />
          {wheel.map((_segment, index) => {
            const meta = segMeta[index];
            return (
              <g key={index} className="evWheelSlice">
                <path d={wedgePath(meta.startDeg, meta.endDeg)} fill={meta.color} />
              </g>
            );
          })}
          <circle cx="50" cy="50" r="47" className="evWheelSvgInnerRim" fill="none" />
        </svg>
        <div className="evWheelRimLights" aria-hidden="true" />

        {/* Labels : positionnés dans la roue tournante, mais chacun contre-tourne
            pour rester droit. */}
        <div className="evWheelLabelLayer">
          {segMeta.map((meta, index) => {
            const p = polarPoint(meta.midDeg, 32);
            return (
              <motion.div
                key={index}
                className="evWheelLabelItem"
                style={{ left: `${p.x}%`, top: `${p.y}%`, x: "-50%", y: "-50%" }}
                animate={{ rotate: -rotationDeg }}
                transition={spinTransition}
              >
                {shortWheelLabel(wheel[index])}
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      <div className="evWheelHub">
        {avatarUserId ? (
          <EventAvatar userId={avatarUserId} username={avatarName || ""} size={58} className="evWheelHubAvatar" />
        ) : (
          <><span>LL</span><small>SPIN</small></>
        )}
      </div>
    </div>
  );
}
