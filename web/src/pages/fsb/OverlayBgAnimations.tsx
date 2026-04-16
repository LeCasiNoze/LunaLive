import * as React from "react";

// ─── Preset list ──────────────────────────────────────────────────────────────

export const BG_PRESETS: Array<{ id: string; label: string }> = [
  { id: "none",               label: "— Aucun fond animé —" },
  { id: "hex_neon",           label: "Néon · Cyan (base)" },
  { id: "hex_neon_blue",      label: "Néon · Bleu électrique" },
  { id: "hex_neon_purple",    label: "Néon · Violet" },
  { id: "hex_neon_magenta",   label: "Néon · Magenta / rose" },
  { id: "hex_neon_gold",      label: "Néon · Doré / ambre" },
  { id: "hex_neon_red",       label: "Néon · Rouge / orange" },
  { id: "hex_neon_rainbow",   label: "Néon · Arc-en-ciel" },
  { id: "hex_neon_pulse",     label: "Néon · Pulsation globale" },
  { id: "hex_neon_wave",      label: "Néon · Vague diagonale" },
  { id: "hex_neon_deep",      label: "Néon · Deep (grands hex)" },
  { id: "hex_neon_dense",     label: "Néon · Dense (petits hex)" },
  { id: "hex_neon_dual",      label: "Néon · Bicolore cyan/violet" },
  { id: "hex_neon_breathe",   label: "Néon · Respiration douce" },
  { id: "hex_neon_storm",     label: "Néon · Tempête (rapide)" },
];

// ─── Animation engine ─────────────────────────────────────────────────────────

interface Anim {
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void;
}

// ─── Core hex renderer ────────────────────────────────────────────────────────

type HexOpts = {
  hueBase: number;
  hueSat: number;
  speed: number;
  strokeAlphaMin: number;
  strokeAlphaMax: number;
  fillAlpha: number;          // 0 = no fill
  glowBlur?: number;          // shadowBlur, 0 = off
  lineWidth?: number;
  size?: number;              // override auto size
  // Animation modes (exclusive)
  waveMode?: boolean;         // diagonal wave crossing the grid
  pulseMode?: boolean;        // all hexes in sync (no spatial variation)
  rainbowMode?: boolean;      // full spectrum across space + time
  dualHue?: number;           // second hue, alternates by row
};

function drawHexGrid(
  ctx: CanvasRenderingContext2D,
  w: number, h: number, t: number,
  opts: HexOpts,
) {
  // ── Dimension de référence : côté court du canvas.
  //    Cela rend l'animation strictement identique à toute résolution et tout
  //    ratio (preview 900px, OBS 1920×1080, ultrawide, etc.).
  const ref = Math.min(w, h);

  // ── Taille : ~16 colonnes visibles sur un 16:9, peu importe la résolution
  const sz = opts.size !== undefined ? opts.size * (ref / 1080) : ref / 14.7;
  const colStep = sz * Math.sqrt(3);
  const rowStep = sz * 1.5;
  const blur = opts.glowBlur ?? 8;
  const lw = opts.lineWidth ?? 1.5;

  for (let row = -1; row < h / rowStep + 2; row++) {
    for (let col = -1; col < w / colStep + 2; col++) {
      const x = col * colStep + (row % 2 === 0 ? 0 : colStep / 2);
      const y = row * rowStep;

      // ── Phase normalisée par ref (= côté court) → même nb de cycles partout
      const nx = x / ref;
      const ny = y / ref;
      let phase: number;
      if (opts.pulseMode) {
        phase = (Math.sin(t * opts.speed * Math.PI) + 1) / 2;
      } else if (opts.waveMode) {
        phase = (Math.sin((nx + ny) * 10 - t * opts.speed * 1.4) + 1) / 2;
      } else {
        phase = (Math.sin(nx * 8.5 + ny * 6 + t * opts.speed) + 1) / 2;
      }

      // ── Hue
      let hue: number;
      if (opts.rainbowMode) {
        hue = (nx * 130 + ny * 90 + t * 18) % 360;
      } else if (opts.dualHue !== undefined) {
        hue = row % 2 === 0 ? opts.hueBase : opts.dualHue;
      } else {
        hue = (opts.hueBase + t * 5) % 360;
      }

      const strokeA = opts.strokeAlphaMin + phase * (opts.strokeAlphaMax - opts.strokeAlphaMin);

      // ── Draw hex
      ctx.beginPath();
      for (let a = 0; a < 6; a++) {
        const ang = (Math.PI / 3) * a - Math.PI / 6;
        const px = x + sz * Math.cos(ang) * 0.91;
        const py = y + sz * Math.sin(ang) * 0.91;
        a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();

      if (blur > 0) {
        ctx.shadowBlur = blur * phase;
        ctx.shadowColor = `hsla(${hue},100%,70%,0.7)`;
      }
      ctx.strokeStyle = `hsla(${hue},${opts.hueSat}%,60%,${strokeA})`;
      ctx.lineWidth = lw;
      ctx.stroke();

      if (opts.fillAlpha > 0 && phase > 0.55) {
        ctx.fillStyle = `hsla(${hue},${opts.hueSat}%,45%,${(phase - 0.55) * opts.fillAlpha * 2.2})`;
        ctx.fill();
      }
      if (blur > 0) ctx.shadowBlur = 0;
    }
  }
}

// ─── 14 variants ──────────────────────────────────────────────────────────────

// 1. Base — cyan / vert néon, légèrement ralenti
function makeHexNeon(): Anim {
  return { draw(ctx, w, h, t) {
    ctx.fillStyle = "rgba(1,3,12,0.15)"; ctx.fillRect(0, 0, w, h);
    drawHexGrid(ctx, w, h, t, {
      hueBase: 170, hueSat: 100, speed: 0.45,
      strokeAlphaMin: 0.06, strokeAlphaMax: 0.85,
      fillAlpha: 0.18, glowBlur: 8,
    });
  }};
}

// 2. Bleu électrique
function makeHexNeonBlue(): Anim {
  return { draw(ctx, w, h, t) {
    ctx.fillStyle = "rgba(0,2,14,0.15)"; ctx.fillRect(0, 0, w, h);
    drawHexGrid(ctx, w, h, t, {
      hueBase: 215, hueSat: 100, speed: 0.45,
      strokeAlphaMin: 0.06, strokeAlphaMax: 0.88,
      fillAlpha: 0.18, glowBlur: 9,
    });
  }};
}

// 3. Violet
function makeHexNeonPurple(): Anim {
  return { draw(ctx, w, h, t) {
    ctx.fillStyle = "rgba(3,1,14,0.15)"; ctx.fillRect(0, 0, w, h);
    drawHexGrid(ctx, w, h, t, {
      hueBase: 270, hueSat: 100, speed: 0.45,
      strokeAlphaMin: 0.06, strokeAlphaMax: 0.85,
      fillAlpha: 0.18, glowBlur: 9,
    });
  }};
}

// 4. Magenta / rose
function makeHexNeonMagenta(): Anim {
  return { draw(ctx, w, h, t) {
    ctx.fillStyle = "rgba(8,1,8,0.15)"; ctx.fillRect(0, 0, w, h);
    drawHexGrid(ctx, w, h, t, {
      hueBase: 315, hueSat: 100, speed: 0.45,
      strokeAlphaMin: 0.06, strokeAlphaMax: 0.88,
      fillAlpha: 0.20, glowBlur: 9,
    });
  }};
}

// 5. Doré / ambre
function makeHexNeonGold(): Anim {
  return { draw(ctx, w, h, t) {
    ctx.fillStyle = "rgba(8,5,0,0.15)"; ctx.fillRect(0, 0, w, h);
    drawHexGrid(ctx, w, h, t, {
      hueBase: 42, hueSat: 100, speed: 0.45,
      strokeAlphaMin: 0.06, strokeAlphaMax: 0.88,
      fillAlpha: 0.20, glowBlur: 10,
    });
  }};
}

// 6. Rouge / orange
function makeHexNeonRed(): Anim {
  return { draw(ctx, w, h, t) {
    ctx.fillStyle = "rgba(10,2,0,0.15)"; ctx.fillRect(0, 0, w, h);
    drawHexGrid(ctx, w, h, t, {
      hueBase: 8, hueSat: 100, speed: 0.45,
      strokeAlphaMin: 0.06, strokeAlphaMax: 0.88,
      fillAlpha: 0.18, glowBlur: 9,
    });
  }};
}

// 7. Arc-en-ciel — spectre complet glissant
function makeHexNeonRainbow(): Anim {
  return { draw(ctx, w, h, t) {
    ctx.fillStyle = "rgba(2,2,12,0.15)"; ctx.fillRect(0, 0, w, h);
    drawHexGrid(ctx, w, h, t, {
      hueBase: 0, hueSat: 100, speed: 0.45,
      strokeAlphaMin: 0.08, strokeAlphaMax: 0.82,
      fillAlpha: 0.16, glowBlur: 7,
      rainbowMode: true,
    });
  }};
}

// 8. Pulsation globale — tous les hex clignotent ensemble
function makeHexNeonPulse(): Anim {
  return { draw(ctx, w, h, t) {
    ctx.fillStyle = "rgba(1,3,12,0.16)"; ctx.fillRect(0, 0, w, h);
    drawHexGrid(ctx, w, h, t, {
      hueBase: 170, hueSat: 100, speed: 0.6,
      strokeAlphaMin: 0.02, strokeAlphaMax: 0.9,
      fillAlpha: 0.28, glowBlur: 12,
      pulseMode: true,
    });
  }};
}

// 9. Vague diagonale — une lumière traverse la grille
function makeHexNeonWave(): Anim {
  return { draw(ctx, w, h, t) {
    ctx.fillStyle = "rgba(0,3,14,0.15)"; ctx.fillRect(0, 0, w, h);
    drawHexGrid(ctx, w, h, t, {
      hueBase: 185, hueSat: 100, speed: 0.55,
      strokeAlphaMin: 0.02, strokeAlphaMax: 0.92,
      fillAlpha: 0.22, glowBlur: 10,
      waveMode: true,
    });
  }};
}

// 10. Deep — grands hex, fort contraste, dramatique
function makeHexNeonDeep(): Anim {
  return { draw(ctx, w, h, t) {
    ctx.fillStyle = "rgba(0,2,10,0.2)"; ctx.fillRect(0, 0, w, h);
    drawHexGrid(ctx, w, h, t, {
      hueBase: 170, hueSat: 100, speed: 0.4,
      strokeAlphaMin: 0.04, strokeAlphaMax: 0.95,
      fillAlpha: 0.30, glowBlur: 16, lineWidth: 2,
      size: 154,
    });
  }};
}

// 11. Dense — très petits hex serrés
function makeHexNeonDense(): Anim {
  return { draw(ctx, w, h, t) {
    ctx.fillStyle = "rgba(1,3,12,0.14)"; ctx.fillRect(0, 0, w, h);
    drawHexGrid(ctx, w, h, t, {
      hueBase: 170, hueSat: 100, speed: 0.5,
      strokeAlphaMin: 0.05, strokeAlphaMax: 0.75,
      fillAlpha: 0.12, glowBlur: 5, lineWidth: 1,
      size: 34,
    });
  }};
}

// 12. Bicolore — rangées paires cyan, rangées impaires violet
function makeHexNeonDual(): Anim {
  return { draw(ctx, w, h, t) {
    ctx.fillStyle = "rgba(2,2,14,0.15)"; ctx.fillRect(0, 0, w, h);
    drawHexGrid(ctx, w, h, t, {
      hueBase: 175, hueSat: 100, speed: 0.45,
      strokeAlphaMin: 0.06, strokeAlphaMax: 0.85,
      fillAlpha: 0.18, glowBlur: 8,
      dualHue: 270,
    });
  }};
}

// 13. Respiration douce — très lent, apaisant
function makeHexNeonBreathe(): Anim {
  return { draw(ctx, w, h, t) {
    ctx.fillStyle = "rgba(0,3,12,0.12)"; ctx.fillRect(0, 0, w, h);
    drawHexGrid(ctx, w, h, t, {
      hueBase: 170, hueSat: 95, speed: 0.18,
      strokeAlphaMin: 0.04, strokeAlphaMax: 0.80,
      fillAlpha: 0.22, glowBlur: 14,
    });
  }};
}

// 14. Tempête — rapide, frénétique, intense
function makeHexNeonStorm(): Anim {
  return { draw(ctx, w, h, t) {
    ctx.fillStyle = "rgba(0,2,10,0.18)"; ctx.fillRect(0, 0, w, h);
    drawHexGrid(ctx, w, h, t, {
      hueBase: 160, hueSat: 100, speed: 2.2,
      strokeAlphaMin: 0.04, strokeAlphaMax: 0.95,
      fillAlpha: 0.25, glowBlur: 11,
    });
  }};
}

// ─── Preset map ───────────────────────────────────────────────────────────────

const ANIM_MAP: Record<string, () => Anim> = {
  hex_neon:         makeHexNeon,
  hex_neon_blue:    makeHexNeonBlue,
  hex_neon_purple:  makeHexNeonPurple,
  hex_neon_magenta: makeHexNeonMagenta,
  hex_neon_gold:    makeHexNeonGold,
  hex_neon_red:     makeHexNeonRed,
  hex_neon_rainbow: makeHexNeonRainbow,
  hex_neon_pulse:   makeHexNeonPulse,
  hex_neon_wave:    makeHexNeonWave,
  hex_neon_deep:    makeHexNeonDeep,
  hex_neon_dense:   makeHexNeonDense,
  hex_neon_dual:    makeHexNeonDual,
  hex_neon_breathe: makeHexNeonBreathe,
  hex_neon_storm:   makeHexNeonStorm,
};

// ─── React component ──────────────────────────────────────────────────────────

export function OverlayBgAnimation({ preset, opacity = 100 }: { preset: string; opacity?: number }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const animRef = React.useRef<Anim | null>(null);
  const rafRef = React.useRef<number>(0);

  React.useEffect(() => {
    if (!preset || preset === "none") return;
    const factory = ANIM_MAP[preset];
    if (!factory) return;
    animRef.current = factory();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const startTime = performance.now();

    function resize() {
      const parent = canvas!.parentElement;
      if (!parent) return;
      canvas!.width  = parent.offsetWidth  || 1;
      canvas!.height = parent.offsetHeight || 1;
    }

    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    resize();

    function frame(now: number) {
      const t = (now - startTime) / 1000;
      const cw = canvas!.width, ch = canvas!.height;
      if (cw > 0 && ch > 0) animRef.current?.draw(ctx!, cw, ch, t);
      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      animRef.current = null;
    };
  }, [preset]);

  if (!preset || preset === "none") return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        opacity: opacity / 100,
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
}
