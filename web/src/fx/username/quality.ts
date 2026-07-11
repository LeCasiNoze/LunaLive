// Niveaux de qualité — même heuristique que BossStage.detectQuality().
import type { FxQuality } from "./types";

export function detectQuality(): FxQuality {
  try {
    const coarse = window.matchMedia?.("(pointer: coarse)")?.matches;
    const narrow = typeof window !== "undefined" && window.innerWidth < 768;
    const cores = navigator.hardwareConcurrency || 8;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mem = (navigator as any).deviceMemory as number | undefined;
    if (coarse || narrow || cores <= 4 || (mem != null && mem <= 4)) return "low";
  } catch {
    /* SSR/vieux navigateurs : prudence */
    return "low";
  }
  return "high";
}

export function prefersReducedMotion(): boolean {
  try {
    return !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  } catch {
    return false;
  }
}

export function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Plafonds par niveau (particules simultanées par instance, dpr).
    dpr = 2 partout : les canvases sont petits (un pseudo), le surcoût est
    négligeable, et dpr 1 rendait le TEXTE flou sur mobile (retour Lucas).
    L'économie mobile passe par les particules et le FPS, pas la netteté. */
export const QUALITY_CAPS: Record<FxQuality, { particles: number; dpr: number }> = {
  low: { particles: 40, dpr: 2 },
  medium: { particles: 120, dpr: 2 },
  high: { particles: 250, dpr: 2 },
};

/** FPS du ticker global par niveau (économie batterie mobile). */
export const QUALITY_FPS: Record<FxQuality, number> = {
  low: 30,
  medium: 45,
  high: 60,
};
