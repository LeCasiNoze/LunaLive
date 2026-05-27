import type * as React from "react";

export type V3PseudoAnimation = "none" | "pulse" | "float" | "shimmer" | "glow-breath" | "bounce";
export type V3PseudoEffect = "plain" | "shadow" | "outline" | "chrome" | "neon" | "metal" | "sticker" | "pop3d" | "stamp";

export type V3LineStyleLike = {
  font?: string;
  color?: string;
  size?: "xs" | "s" | "m" | "l" | "xl" | "xxl";
  weight?: "regular" | "bold" | "black";
  glow?: boolean;
  animation?: V3PseudoAnimation;
  effect?: V3PseudoEffect;
};

const SIZE_MAP: Record<string, string> = {
  xs:  "0.95rem",
  s:   "1.15rem",
  m:   "1.45rem",
  l:   "1.85rem",
  xl:  "clamp(2.2rem, 6vw, 2.8rem)",
  xxl: "clamp(2.8rem, 9vw, 4rem)",
};
const WEIGHT_MAP: Record<string, number> = {
  regular: 500,
  bold:    700,
  black:   900,
};

const ANIM_CLASS: Record<V3PseudoAnimation, string> = {
  "none":         "",
  "pulse":        "v3p-anim-pulse",
  "float":        "v3p-anim-float",
  "shimmer":      "v3p-anim-shimmer",
  "glow-breath":  "v3p-anim-glow",
  "bounce":       "v3p-anim-bounce",
};

export function pseudoTextStyle(s: V3LineStyleLike | undefined, defaultColor: string): React.CSSProperties {
  const size = SIZE_MAP[s?.size || "l"] || "1.55rem";
  const weight = WEIGHT_MAP[s?.weight || "bold"] || 700;
  const color = s?.color || defaultColor;
  const effect = s?.effect || "plain";

  const rawFont = s?.font || "Playfair Display";
  const fontFamilyCss = /[",]/.test(rawFont) ? rawFont : `"${rawFont}", "Inter", system-ui, sans-serif`;

  const takesOverBackground = effect === "chrome" || effect === "metal" || effect === "sticker";
  const base: React.CSSProperties = {
    fontFamily: fontFamilyCss,
    fontSize: size,
    fontWeight: weight,
    letterSpacing: ".01em",
    lineHeight: 1.1,
    color,
  };
  if (!takesOverBackground) {
    (base as any).WebkitTextFillColor = color;
    base.color = color;
    base.filter = "none";
  }

  const shadows: string[] = [];
  const hasBgEffect = effect === "chrome" || effect === "metal" || effect === "sticker";
  if (!hasBgEffect) {
    shadows.push("0 2px 8px rgba(0,0,0,.55)");
  }

  if (s?.glow) {
    shadows.push(`0 0 16px ${color}aa, 0 0 32px ${color}66`);
  }

  if (effect === "shadow") {
    shadows.push("0 3px 0 rgba(0,0,0,.55)", "0 6px 14px rgba(0,0,0,.45)");
  }

  if (effect === "outline") {
    shadows.push(
      "-1.5px -1.5px 0 #000",
      " 1.5px -1.5px 0 #000",
      "-1.5px  1.5px 0 #000",
      " 1.5px  1.5px 0 #000",
      "0 3px 6px rgba(0,0,0,.55)"
    );
  }

  if (effect === "chrome") {
    base.background = `linear-gradient(180deg,#ffffff 0%,#fff7d6 20%,${color} 45%,#5a4015 65%,${color} 80%,#ffffff 100%)`;
    (base as any).backgroundSize = "100% 100%";
    base.backgroundClip = "text" as any;
    (base as any).WebkitBackgroundClip = "text";
    (base as any).WebkitTextFillColor = "transparent";
    base.color = "transparent";
    base.filter = `drop-shadow(0 3px 8px rgba(0,0,0,.5)) drop-shadow(0 0 24px ${color}66)`;
    base.animation = "none";
  }

  if (effect === "metal") {
    base.background = `linear-gradient(180deg,#f0f0f0 0%,#ffffff 18%,#9a9a9a 38%,#ffffff 50%,#a8a8a8 60%,#4a4a4a 78%,#cfcfcf 100%)`;
    (base as any).backgroundSize = "100% 100%";
    base.backgroundClip = "text" as any;
    (base as any).WebkitBackgroundClip = "text";
    (base as any).WebkitTextFillColor = "transparent";
    base.color = "transparent";
    base.filter = "drop-shadow(0 3px 6px rgba(0,0,0,.55))";
    base.animation = "none";
  }

  if (effect === "neon") {
    shadows.push(
      `0 0 6px #fff`,
      `0 0 12px ${color}`,
      `0 0 24px ${color}`,
      `0 0 42px ${color}aa`,
      `0 0 70px ${color}55`
    );
  }

  if (effect === "pop3d") {
    const darker = `${color}`;
    shadows.push(
      `1px 1px 0 ${darker}`,
      `2px 2px 0 ${darker}`,
      `3px 3px 0 ${darker}`,
      `4px 4px 0 ${darker}`,
      `5px 5px 0 ${darker}`,
      `6px 6px 0 rgba(0,0,0,.6)`,
      `7px 7px 12px rgba(0,0,0,.55)`
    );
  }

  if (effect === "stamp") {
    shadows.push(
      "-2px -2px 0 rgba(0,0,0,.85)",
      " 2px -2px 0 rgba(0,0,0,.85)",
      "-2px  2px 0 rgba(0,0,0,.85)",
      " 2px  2px 0 rgba(0,0,0,.85)",
      "0 6px 12px rgba(0,0,0,.4)"
    );
    base.transform = "rotate(-5deg)";
    base.display = "inline-block";
    base.opacity = 0.92;
  }

  if (effect === "sticker") {
    base.background = `linear-gradient(180deg,${color},${shade(color, -0.12)})`;
    (base as any).backgroundSize = "100% 100%";
    base.color = "#1a0f08";
    (base as any).WebkitTextFillColor = "#1a0f08";
    base.backgroundClip = "border-box" as any;
    (base as any).WebkitBackgroundClip = "border-box";
    base.padding = ".15em .45em";
    base.borderRadius = ".22em";
    base.border = ".08em solid #fff";
    base.boxShadow = `0 .25em .7em rgba(0,0,0,.4), 0 0 .9em ${color}66, inset 0 .05em 0 rgba(255,255,255,.55)`;
    base.display = "inline-block";
    base.filter = "none";
    base.animation = "none";
  }

  base.textShadow = shadows.length ? shadows.join(", ") : "none";
  return base;
}

function shade(hex: string, pct: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = pct < 0 ? 0 : 255;
  const p = Math.abs(pct);
  const nr = Math.round((f - r) * p + r);
  const ng = Math.round((f - g) * p + g);
  const nb = Math.round((f - b) * p + b);
  return `#${[nr, ng, nb].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function pseudoAnimationClass(s: V3LineStyleLike | undefined): string {
  return ANIM_CLASS[s?.animation || "none"] || "";
}

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
