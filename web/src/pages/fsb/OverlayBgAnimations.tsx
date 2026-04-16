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
  // ── Ref = côté court du canvas → même rendu à toute résolution / ratio
  const ref = Math.min(w, h);
  const sz  = opts.size !== undefined ? opts.size * (ref / 1080) : ref / 14.7;
  const colStep = sz * Math.sqrt(3);
  const rowStep = sz * 1.5;
  const lw = opts.lineWidth ?? 1.5;

  // Fond sombre (clearRect chaque frame → pas de trail, pas de dérive de couleur)
  ctx.fillStyle = `hsl(${opts.hueBase},55%,3%)`;
  ctx.fillRect(0, 0, w, h);

  for (let row = -1; row < h / rowStep + 2; row++) {
    for (let col = -1; col < w / colStep + 2; col++) {
      const x = col * colStep + (row % 2 === 0 ? 0 : colStep / 2);
      const y = row * rowStep;

      // ── Phase normalisée par ref → identique à toute résolution
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

      // ── Hexagone (gap de 9% entre les cellules via 0.91)
      ctx.beginPath();
      for (let a = 0; a < 6; a++) {
        const ang = (Math.PI / 3) * a - Math.PI / 6;
        const px = x + sz * Math.cos(ang) * 0.91;
        const py = y + sz * Math.sin(ang) * 0.91;
        a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();

      // ── Fill : le corps de l'hexagone reste coloré (jamais blanc)
      //    L'effet neon vient UNIQUEMENT du stroke lumineux, pas du fill
      const fillLight = 4 + phase * 42;          // 4% → 46% : foncé → vif saturé, jamais blanc
      const fillSat   = 60 + phase * 40;         // 60% → 100%
      ctx.fillStyle = `hsl(${hue},${fillSat}%,${fillLight}%)`;
      ctx.fill();

      // ── Contour : toute la brillance/blanc est ici — c'est lui qui fait le neon
      if (phase > 0.35) {
        const strokeA = (phase - 0.35) / 0.65;   // 0→1
        const strokeL = 62 + phase * 33;         // 62% → 95% (blanc sur les plus brillants)
        ctx.strokeStyle = `hsl(${hue},100%,${strokeL}%)`;
        ctx.lineWidth = lw * (0.5 + phase * 1.6); // trait épais sur les hexes brillants
        ctx.globalAlpha = strokeA * 0.9;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }
}

// ─── 14 variants ──────────────────────────────────────────────────────────────
// Note: le fond sombre est géré DANS drawHexGrid (clearRect + fill via hueBase).
// Les variants n'ont besoin que de passer hueBase, hueSat, speed.

// 1. Base — cyan / vert
function makeHexNeon(): Anim {
  return { draw(ctx, w, h, t) {
    drawHexGrid(ctx, w, h, t, { hueBase: 170, hueSat: 100, speed: 0.45,
      strokeAlphaMin: 0, strokeAlphaMax: 0, fillAlpha: 0 });
  }};
}

// 2. Bleu électrique
function makeHexNeonBlue(): Anim {
  return { draw(ctx, w, h, t) {
    drawHexGrid(ctx, w, h, t, { hueBase: 215, hueSat: 100, speed: 0.45,
      strokeAlphaMin: 0, strokeAlphaMax: 0, fillAlpha: 0 });
  }};
}

// 3. Violet
function makeHexNeonPurple(): Anim {
  return { draw(ctx, w, h, t) {
    drawHexGrid(ctx, w, h, t, { hueBase: 270, hueSat: 100, speed: 0.45,
      strokeAlphaMin: 0, strokeAlphaMax: 0, fillAlpha: 0 });
  }};
}

// 4. Magenta / rose
function makeHexNeonMagenta(): Anim {
  return { draw(ctx, w, h, t) {
    drawHexGrid(ctx, w, h, t, { hueBase: 315, hueSat: 100, speed: 0.45,
      strokeAlphaMin: 0, strokeAlphaMax: 0, fillAlpha: 0 });
  }};
}

// 5. Doré / ambre
function makeHexNeonGold(): Anim {
  return { draw(ctx, w, h, t) {
    drawHexGrid(ctx, w, h, t, { hueBase: 42, hueSat: 100, speed: 0.45,
      strokeAlphaMin: 0, strokeAlphaMax: 0, fillAlpha: 0 });
  }};
}

// 6. Rouge / orange
function makeHexNeonRed(): Anim {
  return { draw(ctx, w, h, t) {
    drawHexGrid(ctx, w, h, t, { hueBase: 8, hueSat: 100, speed: 0.45,
      strokeAlphaMin: 0, strokeAlphaMax: 0, fillAlpha: 0 });
  }};
}

// 7. Arc-en-ciel
function makeHexNeonRainbow(): Anim {
  return { draw(ctx, w, h, t) {
    drawHexGrid(ctx, w, h, t, { hueBase: 0, hueSat: 100, speed: 0.45,
      strokeAlphaMin: 0, strokeAlphaMax: 0, fillAlpha: 0, rainbowMode: true });
  }};
}

// 8. Pulsation globale
function makeHexNeonPulse(): Anim {
  return { draw(ctx, w, h, t) {
    drawHexGrid(ctx, w, h, t, { hueBase: 170, hueSat: 100, speed: 0.6,
      strokeAlphaMin: 0, strokeAlphaMax: 0, fillAlpha: 0, pulseMode: true });
  }};
}

// 9. Vague diagonale
function makeHexNeonWave(): Anim {
  return { draw(ctx, w, h, t) {
    drawHexGrid(ctx, w, h, t, { hueBase: 185, hueSat: 100, speed: 0.55,
      strokeAlphaMin: 0, strokeAlphaMax: 0, fillAlpha: 0, waveMode: true });
  }};
}

// 10. Deep — grands hex
function makeHexNeonDeep(): Anim {
  return { draw(ctx, w, h, t) {
    drawHexGrid(ctx, w, h, t, { hueBase: 170, hueSat: 100, speed: 0.4,
      strokeAlphaMin: 0, strokeAlphaMax: 0, fillAlpha: 0, lineWidth: 2, size: 154 });
  }};
}

// 11. Dense — petits hex serrés
function makeHexNeonDense(): Anim {
  return { draw(ctx, w, h, t) {
    drawHexGrid(ctx, w, h, t, { hueBase: 170, hueSat: 100, speed: 0.5,
      strokeAlphaMin: 0, strokeAlphaMax: 0, fillAlpha: 0, lineWidth: 1, size: 34 });
  }};
}

// 12. Bicolore — rangées paires cyan, rangées impaires violet
function makeHexNeonDual(): Anim {
  return { draw(ctx, w, h, t) {
    drawHexGrid(ctx, w, h, t, { hueBase: 175, hueSat: 100, speed: 0.45,
      strokeAlphaMin: 0, strokeAlphaMax: 0, fillAlpha: 0, dualHue: 270 });
  }};
}

// 13. Respiration douce
function makeHexNeonBreathe(): Anim {
  return { draw(ctx, w, h, t) {
    drawHexGrid(ctx, w, h, t, { hueBase: 170, hueSat: 95, speed: 0.18,
      strokeAlphaMin: 0, strokeAlphaMax: 0, fillAlpha: 0 });
  }};
}

// 14. Tempête — rapide, intense
function makeHexNeonStorm(): Anim {
  return { draw(ctx, w, h, t) {
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

    function resize() {
      const parent = canvas!.parentElement;
      if (!parent) return;
      canvas!.width  = parent.offsetWidth  || 1;
      canvas!.height = parent.offsetHeight || 1;
    }

    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    resize();

    // Date.now() = horloge murale → preview et OBS synchronisés à tout moment
    function frame() {
      const t = Date.now() / 1000;
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
