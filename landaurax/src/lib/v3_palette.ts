export type V3ExtendedPalette = {
  accent: string;
  accentLight: string;
  accentAlt: string;
  accentHot: string;
  glow: string;
  bgPage: string;
  bgCard: string;
};

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
      case g: h = ((b - r) / d + 2) * 60; break;
      case b: h = ((r - g) / d + 4) * 60; break;
    }
  }
  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60)        [r, g, b] = [c, x, 0];
  else if (h < 120)  [r, g, b] = [x, c, 0];
  else if (h < 180)  [r, g, b] = [0, c, x];
  else if (h < 240)  [r, g, b] = [0, x, c];
  else if (h < 300)  [r, g, b] = [x, 0, c];
  else               [r, g, b] = [c, 0, x];
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export function extendPalette(theme: {
  accent?: string;
  accentLight?: string;
  accentGlow?: string;
  bgPage?: string;
  bgCard?: string;
} | undefined, fallbackAccent = "#FFD700"): V3ExtendedPalette {
  const accent = theme?.accent || fallbackAccent;
  const accentLight = theme?.accentLight || accent;
  const hsl = hexToHsl(accent);
  const accentAlt = hsl ? hslToHex(hsl.h + 55, Math.min(1, hsl.s + 0.05), Math.min(0.7, hsl.l + 0.05)) : accent;
  const accentHot = hsl ? hslToHex(hsl.h + 15, Math.min(1, hsl.s + 0.2), Math.min(0.7, hsl.l + 0.08)) : accentLight;
  return {
    accent,
    accentLight,
    accentAlt,
    accentHot,
    glow: theme?.accentGlow || hexToRgba(accent, 0.55),
    bgPage: theme?.bgPage || "#080212",
    bgCard: theme?.bgCard || "#150821",
  };
}
