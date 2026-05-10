// ─────────────────────────────────────────────────────────────────────────────
// V3 Pseudo style helper — partagé entre M3/M4/M5/M6.
//
// Transforme la V3LineStyle (saved dans inputs.pseudoStyle) en CSS style
// object pour le rendu pill du pseudo dans les modèles mini-jeux.
// ─────────────────────────────────────────────────────────────────────────────

import type * as React from "react";

export type V3LineStyleLike = {
  font?: string;
  color?: string;
  size?: "xs" | "s" | "m" | "l" | "xl" | "xxl";
  weight?: "regular" | "bold" | "black";
  glow?: boolean;
};

const SIZE_MAP: Record<string, string> = {
  xs:  "0.95rem",
  s:   "1.1rem",
  m:   "1.3rem",
  l:   "1.55rem",
  xl:  "1.85rem",
  xxl: "2.2rem",
};
const WEIGHT_MAP: Record<string, number> = {
  regular: 500,
  bold:    700,
  black:   900,
};

/** Style CSS pour le texte du pseudo (font/size/color/weight/glow). */
export function pseudoTextStyle(s: V3LineStyleLike | undefined, defaultColor: string): React.CSSProperties {
  const size = SIZE_MAP[s?.size || "l"] || "1.55rem";
  const weight = WEIGHT_MAP[s?.weight || "bold"] || 700;
  const color = s?.color || defaultColor;
  return {
    fontFamily: `"${s?.font || "Playfair Display"}", "Inter", serif`,
    fontSize: size,
    fontWeight: weight,
    color,
    letterSpacing: ".01em",
    lineHeight: 1.1,
    textShadow: s?.glow ? `0 0 14px ${color}66` : undefined,
  };
}

/** Style CSS du conteneur "pill" autour du pseudo (frame + bg + border). */
export function pseudoPillStyle(accent: string): React.CSSProperties {
  return {
    display: "inline-block",
    padding: "8px 22px",
    background: "rgba(0,0,0,.45)",
    border: `1px solid ${accent}55`,
    borderRadius: "999px",
    boxShadow: `0 4px 14px rgba(0,0,0,.4), inset 0 1px 0 ${accent}22`,
    backdropFilter: "blur(6px)",
  };
}
