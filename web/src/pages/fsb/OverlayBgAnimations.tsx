import * as React from "react";

// ─── Preset list ──────────────────────────────────────────────────────────────

export const BG_PRESETS: Array<{ id: string; label: string }> = [
  { id: "none",               label: "— Aucun fond animé —" },
  // ── Couleurs pures (palette restreinte)
  { id: "hex_neon",           label: "Néon · Cyan" },
  { id: "hex_neon_blue",      label: "Néon · Bleu électrique" },
  { id: "hex_neon_purple",    label: "Néon · Violet" },
  { id: "hex_neon_magenta",   label: "Néon · Magenta / rose" },
  { id: "hex_neon_gold",      label: "Néon · Doré / ambre" },
  { id: "hex_neon_red",       label: "Néon · Rouge / orange" },
  { id: "hex_neon_rainbow",   label: "Néon · Arc-en-ciel" },
  // ── Mouvements spéciaux
  { id: "hex_neon_pulse",     label: "Néon · Pulsation globale" },
  { id: "hex_neon_wave",      label: "Néon · Vague diagonale" },
  { id: "hex_neon_scan",      label: "Néon · Scan horizontal" },
  { id: "hex_neon_radial",    label: "Néon · Radial (anneaux)" },
  { id: "hex_neon_ripple",    label: "Néon · Interférence (2 sources)" },
  { id: "hex_neon_cols",      label: "Néon · Colonnes verticales" },
  // ── Tailles / styles
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
  lineWidth?: number;
  size?: number;
  // Palette
  hueRange?: number;   // oscille ±hueRange autour de hueBase (undefined = rotation complète)
  rainbowMode?: boolean;
  dualHue?: number;
  // Modes de déplacement (exclusifs)
  pulseMode?: boolean;   // tout en sync, pas de variation spatiale
  waveMode?: boolean;    // vague diagonale
  scanMode?: boolean;    // faisceau horizontal descendant
  radialMode?: boolean;  // anneaux depuis le centre
  rippleMode?: boolean;  // interférence 2 sources
  colMode?: boolean;     // colonnes verticales
};

function drawHexGrid(
  ctx: CanvasRenderingContext2D,
  w: number, h: number, t: number,
  opts: HexOpts,
) {
  const ref     = Math.min(w, h);
  const sz      = opts.size !== undefined ? opts.size * (ref / 1080) : ref / 14.7;
  const colStep = sz * Math.sqrt(3);
  const rowStep = sz * 1.5;
  const lw      = (opts.lineWidth ?? 1.5) * (ref / 1080);

  // Fond sombre
  ctx.fillStyle = `hsl(${opts.hueBase},55%,3%)`;
  ctx.fillRect(0, 0, w, h);

  // Centre normalisé (pour radial) — w/2/ref ≈ 0.89 en 16:9
  const cnx = w / 2 / ref;
  const cny = h / 2 / ref;

  for (let row = -1; row < h / rowStep + 2; row++) {
    for (let col = -1; col < w / colStep + 2; col++) {
      const x = col * colStep + (row % 2 === 0 ? 0 : colStep / 2);
      const y = row * rowStep;

      const nx = x / ref;
      const ny = y / ref;

      // ── Phase selon le mode de déplacement
      let phase: number;
      if (opts.pulseMode) {
        phase = (Math.sin(t * opts.speed * Math.PI) + 1) / 2;
      } else if (opts.waveMode) {
        phase = (Math.sin((nx + ny) * 10 - t * opts.speed * 1.4) + 1) / 2;
      } else if (opts.scanMode) {
        // faisceau horizontal qui descend lentement
        phase = (Math.sin(ny * 5 - t * opts.speed) + 1) / 2;
      } else if (opts.radialMode) {
        // anneaux depuis le centre
        const dist = Math.sqrt((nx - cnx) ** 2 + (ny - cny) ** 2);
        phase = (Math.sin(dist * 14 - t * opts.speed) + 1) / 2;
      } else if (opts.rippleMode) {
        // interférence entre 2 sources décalées
        const d1 = Math.sqrt((nx - cnx * 0.45) ** 2 + (ny - cny * 0.9) ** 2);
        const d2 = Math.sqrt((nx - cnx * 1.55) ** 2 + (ny - cny * 1.1) ** 2);
        phase = (Math.sin(d1 * 16 - t * opts.speed) + Math.sin(d2 * 16 - t * opts.speed * 0.85) + 2) / 4;
      } else if (opts.colMode) {
        // colonnes verticales : phase dépend uniquement de nx
        phase = (Math.sin(nx * 10 - t * opts.speed) + 1) / 2;
      } else {
        // défaut : shimmer diagonal
        phase = (Math.sin(nx * 8.5 + ny * 6 + t * opts.speed) + 1) / 2;
      }

      // ── Hue selon le mode couleur
      let hue: number;
      if (opts.rainbowMode) {
        hue = (nx * 130 + ny * 90 + t * 18) % 360;
      } else if (opts.dualHue !== undefined) {
        hue = row % 2 === 0 ? opts.hueBase : opts.dualHue;
      } else if (opts.hueRange !== undefined) {
        // palette restreinte : oscillation lente autour de hueBase
        hue = ((opts.hueBase + Math.sin(t * 0.22) * opts.hueRange) % 360 + 360) % 360;
      } else {
        // rotation complète (rainbow, storm, etc.)
        hue = (opts.hueBase + t * 5) % 360;
      }

      // ── Hexagone
      ctx.beginPath();
      for (let a = 0; a < 6; a++) {
        const ang = (Math.PI / 3) * a - Math.PI / 6;
        const px  = x + sz * Math.cos(ang) * 0.91;
        const py  = y + sz * Math.sin(ang) * 0.91;
        a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();

      // ── Fill : corps coloré, jamais blanc (neon vient du stroke)
      const fillLight = 4 + phase * 42;
      const fillSat   = 60 + phase * 40;
      ctx.fillStyle = `hsl(${hue},${fillSat}%,${fillLight}%)`;
      ctx.fill();

      // ── Stroke : toute la brillance / blanc est ici
      if (phase > 0.35) {
        const strokeA = (phase - 0.35) / 0.65;
        const strokeL = 62 + phase * 33;
        ctx.strokeStyle = `hsl(${hue},100%,${strokeL}%)`;
        ctx.lineWidth   = lw * (0.5 + phase * 1.6);
        ctx.globalAlpha = strokeA * 0.9;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }
}

// ─── Variants ─────────────────────────────────────────────────────────────────

// 1. Cyan — palette restreinte (±22°)
function makeHexNeon(): Anim {
  return { draw(ctx, w, h, t) {
    drawHexGrid(ctx, w, h, t, { hueBase: 170, hueSat: 100, speed: 0.45, hueRange: 22 });
  }};
}

// 2. Bleu électrique — palette restreinte (±25°, reste dans le bleu)
function makeHexNeonBlue(): Anim {
  return { draw(ctx, w, h, t) {
    drawHexGrid(ctx, w, h, t, { hueBase: 215, hueSat: 100, speed: 0.45, hueRange: 25 });
  }};
}

// 3. Violet — palette restreinte (±22°)
function makeHexNeonPurple(): Anim {
  return { draw(ctx, w, h, t) {
    drawHexGrid(ctx, w, h, t, { hueBase: 270, hueSat: 100, speed: 0.45, hueRange: 22 });
  }};
}

// 4. Magenta / rose — palette restreinte (±22°)
function makeHexNeonMagenta(): Anim {
  return { draw(ctx, w, h, t) {
    drawHexGrid(ctx, w, h, t, { hueBase: 315, hueSat: 100, speed: 0.45, hueRange: 22 });
  }};
}

// 5. Doré / ambre — palette restreinte (±15°)
function makeHexNeonGold(): Anim {
  return { draw(ctx, w, h, t) {
    drawHexGrid(ctx, w, h, t, { hueBase: 42, hueSat: 100, speed: 0.45, hueRange: 15 });
  }};
}

// 6. Rouge / orange — palette restreinte (±18°)
function makeHexNeonRed(): Anim {
  return { draw(ctx, w, h, t) {
    drawHexGrid(ctx, w, h, t, { hueBase: 8, hueSat: 100, speed: 0.45, hueRange: 18 });
  }};
}

// 7. Arc-en-ciel — spectre complet intentionnel
function makeHexNeonRainbow(): Anim {
  return { draw(ctx, w, h, t) {
    drawHexGrid(ctx, w, h, t, { hueBase: 0, hueSat: 100, speed: 0.45, rainbowMode: true });
  }};
}

// 8. Pulsation globale
function makeHexNeonPulse(): Anim {
  return { draw(ctx, w, h, t) {
    drawHexGrid(ctx, w, h, t, { hueBase: 170, hueSat: 100, speed: 0.6, hueRange: 22, pulseMode: true });
  }};
}

// 9. Vague diagonale
function makeHexNeonWave(): Anim {
  return { draw(ctx, w, h, t) {
    drawHexGrid(ctx, w, h, t, { hueBase: 185, hueSat: 100, speed: 0.55, hueRange: 22, waveMode: true });
  }};
}

// 10. Scan horizontal — faisceau qui descend lentement (cyan)
function makeHexNeonScan(): Anim {
  return { draw(ctx, w, h, t) {
    drawHexGrid(ctx, w, h, t, { hueBase: 170, hueSat: 100, speed: 0.7, hueRange: 22, scanMode: true });
  }};
}

// 11. Radial — anneaux depuis le centre (violet)
function makeHexNeonRadial(): Anim {
  return { draw(ctx, w, h, t) {
    drawHexGrid(ctx, w, h, t, { hueBase: 270, hueSat: 100, speed: 0.9, hueRange: 22, radialMode: true });
  }};
}

// 12. Interférence — 2 sources (bleu)
function makeHexNeonRipple(): Anim {
  return { draw(ctx, w, h, t) {
    drawHexGrid(ctx, w, h, t, { hueBase: 215, hueSat: 100, speed: 1.1, hueRange: 25, rippleMode: true });
  }};
}

// 13. Colonnes verticales (magenta)
function makeHexNeonCols(): Anim {
  return { draw(ctx, w, h, t) {
    drawHexGrid(ctx, w, h, t, { hueBase: 315, hueSat: 100, speed: 0.65, hueRange: 22, colMode: true });
  }};
}

// 14. Deep — grands hex
function makeHexNeonDeep(): Anim {
  return { draw(ctx, w, h, t) {
    drawHexGrid(ctx, w, h, t, { hueBase: 170, hueSat: 100, speed: 0.4, hueRange: 22, lineWidth: 2, size: 154 });
  }};
}

// 15. Dense — petits hex serrés
function makeHexNeonDense(): Anim {
  return { draw(ctx, w, h, t) {
    drawHexGrid(ctx, w, h, t, { hueBase: 170, hueSat: 100, speed: 0.5, hueRange: 22, lineWidth: 1, size: 34 });
  }};
}

// 16. Bicolore — rangées paires cyan, rangées impaires violet
function makeHexNeonDual(): Anim {
  return { draw(ctx, w, h, t) {
    drawHexGrid(ctx, w, h, t, { hueBase: 175, hueSat: 100, speed: 0.45, dualHue: 270 });
  }};
}

// 17. Respiration douce
function makeHexNeonBreathe(): Anim {
  return { draw(ctx, w, h, t) {
    drawHexGrid(ctx, w, h, t, { hueBase: 170, hueSat: 95, speed: 0.18, hueRange: 22 });
  }};
}

// 18. Tempête — rapide, rotation complète intentionnelle
function makeHexNeonStorm(): Anim {
  return { draw(ctx, w, h, t) {
    drawHexGrid(ctx, w, h, t, { hueBase: 160, hueSat: 100, speed: 2.2 });
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
  hex_neon_scan:    makeHexNeonScan,
  hex_neon_radial:  makeHexNeonRadial,
  hex_neon_ripple:  makeHexNeonRipple,
  hex_neon_cols:    makeHexNeonCols,
  hex_neon_deep:    makeHexNeonDeep,
  hex_neon_dense:   makeHexNeonDense,
  hex_neon_dual:    makeHexNeonDual,
  hex_neon_breathe: makeHexNeonBreathe,
  hex_neon_storm:   makeHexNeonStorm,
};

// ─── React component ──────────────────────────────────────────────────────────

export function OverlayBgAnimation({ preset, opacity = 100 }: { preset: string; opacity?: number }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const animRef   = React.useRef<Anim | null>(null);
  const rafRef    = React.useRef<number>(0);

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
