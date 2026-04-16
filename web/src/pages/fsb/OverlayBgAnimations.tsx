import * as React from "react";

// ─── Preset list ──────────────────────────────────────────────────────────────

export const BG_PRESETS: Array<{ id: string; label: string }> = [
  { id: "none",              label: "— Aucun fond animé —" },
  // ── Hexagones (6)
  { id: "hex_blue",          label: "Hex · Bleu froid" },
  { id: "hex_gold",          label: "Hex · Doré ambré" },
  { id: "hex_neon",          label: "Hex · Néon intense" },
  { id: "hex_dark",          label: "Hex · Sombre subtil" },
  { id: "hex_filled",        label: "Hex · Remplissage pulsé" },
  { id: "hex_wave",          label: "Hex · Vague lumineuse" },
  // ── Triangles (5)
  { id: "tri_blue",          label: "Tri · Bleu / violet" },
  { id: "tri_gold",          label: "Tri · Doré / orange" },
  { id: "tri_spin",          label: "Tri · Rotation rapide" },
  { id: "tri_burst",         label: "Tri · Explosion centrale" },
  { id: "tri_grid",          label: "Tri · Grille ordonnée" },
  // ── Particules (6)
  { id: "part_violet",       label: "Part · Violet / rose" },
  { id: "part_comet",        label: "Part · Comètes traînantes" },
  { id: "part_burst",        label: "Part · Burst central" },
  { id: "part_slow",         label: "Part · Grandes lentes" },
  { id: "part_rain",         label: "Part · Pluie douce" },
  { id: "part_orbit",        label: "Part · Orbites" },
  // ── Circuit (4)
  { id: "circuit_gold",      label: "Circuit · Doré" },
  { id: "circuit_dense",     label: "Circuit · Dense" },
  { id: "circuit_pulse",     label: "Circuit · Impulsions colorées" },
  { id: "circuit_blue",      label: "Circuit · Bleu froid" },
  // ── Réseau mesh (4)
  { id: "mesh_tight",        label: "Mesh · Serré" },
  { id: "mesh_colored",      label: "Mesh · Multicolore" },
  { id: "mesh_slow",         label: "Mesh · Lent & élégant" },
  { id: "mesh_glow",         label: "Mesh · Noeuds brillants" },
  // ── Mix (5)
  { id: "mix_hex_particles", label: "Mix · Hex + Particules" },
  { id: "mix_hex_circuit",   label: "Mix · Hex + Circuit" },
  { id: "mix_tri_mesh",      label: "Mix · Tri + Réseau" },
  { id: "mix_circuit_part",  label: "Mix · Circuit + Particules" },
  { id: "mix_mesh_hex",      label: "Mix · Mesh + Grille hex" },
];

// ─── Animation engine ─────────────────────────────────────────────────────────

interface Anim {
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// HEXAGONS helpers
// ─────────────────────────────────────────────────────────────────────────────

function drawHexGrid(
  ctx: CanvasRenderingContext2D,
  w: number, h: number, t: number,
  opts: {
    hueBase: number;   // teinte de base
    hueSat: number;    // saturation
    speed: number;     // vitesse de l'animation de phase
    strokeAlphaMin: number;
    strokeAlphaMax: number;
    fillAlpha: number; // 0 = pas de remplissage
    size?: number;     // forcer une taille
    waveMode?: boolean; // vague qui traverse la grille
    glow?: boolean;
  }
) {
  const sz = opts.size ?? Math.max(28, w / 24);
  const colStep = sz * Math.sqrt(3);
  const rowStep = sz * 1.5;
  for (let row = -1; row < h / rowStep + 2; row++) {
    for (let col = -1; col < w / colStep + 2; col++) {
      const x = col * colStep + (row % 2 === 0 ? 0 : colStep / 2);
      const y = row * rowStep;
      let phase: number;
      if (opts.waveMode) {
        // vague diagonale
        phase = Math.sin(x * 0.018 - t * opts.speed) * 0.5 + 0.5;
      } else {
        phase = (Math.sin(x * 0.014 + y * 0.009 + t * opts.speed) + 1) / 2;
      }
      const hue = opts.waveMode
        ? opts.hueBase + phase * 60
        : (opts.hueBase + x * 0.08 + y * 0.06 + t * 8) % 360;
      const strokeA = opts.strokeAlphaMin + phase * (opts.strokeAlphaMax - opts.strokeAlphaMin);
      ctx.beginPath();
      for (let a = 0; a < 6; a++) {
        const ang = (Math.PI / 3) * a - Math.PI / 6;
        const px = x + sz * Math.cos(ang) * 0.91;
        const py = y + sz * Math.sin(ang) * 0.91;
        a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.strokeStyle = `hsla(${hue},${opts.hueSat}%,60%,${strokeA})`;
      ctx.lineWidth = opts.glow ? 1.5 : 1;
      if (opts.glow) {
        ctx.shadowBlur = 6; ctx.shadowColor = `hsla(${hue},90%,70%,0.5)`;
      }
      ctx.stroke();
      if (opts.fillAlpha > 0 && phase > 0.6) {
        ctx.fillStyle = `hsla(${hue},${opts.hueSat}%,45%,${(phase - 0.6) * opts.fillAlpha * 2.5})`;
        ctx.fill();
      }
      if (opts.glow) ctx.shadowBlur = 0;
    }
  }
}

function makeHexBlue(): Anim {
  return { draw(ctx, w, h, t) {
    ctx.fillStyle = "rgba(2,8,22,0.18)"; ctx.fillRect(0, 0, w, h);
    drawHexGrid(ctx, w, h, t, { hueBase: 210, hueSat: 80, speed: 0.5, strokeAlphaMin: 0.04, strokeAlphaMax: 0.55, fillAlpha: 0 });
  }};
}

function makeHexGold(): Anim {
  return { draw(ctx, w, h, t) {
    ctx.fillStyle = "rgba(8,5,2,0.18)"; ctx.fillRect(0, 0, w, h);
    drawHexGrid(ctx, w, h, t, { hueBase: 35, hueSat: 85, speed: 0.45, strokeAlphaMin: 0.05, strokeAlphaMax: 0.6, fillAlpha: 0.12 });
  }};
}

function makeHexNeon(): Anim {
  return { draw(ctx, w, h, t) {
    ctx.fillStyle = "rgba(1,3,12,0.15)"; ctx.fillRect(0, 0, w, h);
    drawHexGrid(ctx, w, h, t, { hueBase: 170, hueSat: 100, speed: 0.8, strokeAlphaMin: 0.08, strokeAlphaMax: 0.85, fillAlpha: 0.18, glow: true });
  }};
}

function makeHexDark(): Anim {
  return { draw(ctx, w, h, t) {
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = "#03080f"; ctx.fillRect(0, 0, w, h);
    drawHexGrid(ctx, w, h, t, { hueBase: 220, hueSat: 40, speed: 0.25, strokeAlphaMin: 0.04, strokeAlphaMax: 0.22, fillAlpha: 0 });
  }};
}

function makeHexFilled(): Anim {
  return { draw(ctx, w, h, t) {
    ctx.fillStyle = "rgba(2,5,18,0.18)"; ctx.fillRect(0, 0, w, h);
    drawHexGrid(ctx, w, h, t, { hueBase: 250, hueSat: 75, speed: 0.55, strokeAlphaMin: 0.06, strokeAlphaMax: 0.45, fillAlpha: 0.4 });
  }};
}

function makeHexWave(): Anim {
  return { draw(ctx, w, h, t) {
    ctx.fillStyle = "rgba(2,6,20,0.18)"; ctx.fillRect(0, 0, w, h);
    drawHexGrid(ctx, w, h, t, { hueBase: 190, hueSat: 90, speed: 0.7, strokeAlphaMin: 0.02, strokeAlphaMax: 0.8, fillAlpha: 0.3, waveMode: true });
  }};
}

// ─────────────────────────────────────────────────────────────────────────────
// TRIANGLES helpers
// ─────────────────────────────────────────────────────────────────────────────

type TriState = { x: number; y: number; size: number; angle: number; angSpeed: number; hue: number; alpha: number; alphaDir: number; vx: number; vy: number };

function makeTris(n: number, w: number, h: number, hueBase: number, hueRange: number): TriState[] {
  return Array.from({ length: n }, () => ({
    x: Math.random() * w, y: Math.random() * h,
    size: Math.random() * 80 + 15, angle: Math.random() * Math.PI * 2,
    angSpeed: (Math.random() - 0.5) * 0.015,
    hue: hueBase + Math.random() * hueRange,
    alpha: Math.random() * 0.25 + 0.04, alphaDir: Math.random() > 0.5 ? 1 : -1,
    vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
  }));
}

function drawTris(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  tris: TriState[], hueShift: number, speedMult: number
) {
  for (const tri of tris) {
    tri.x = (tri.x + tri.vx * speedMult + w) % w;
    tri.y = (tri.y + tri.vy * speedMult + h) % h;
    tri.angle += tri.angSpeed * speedMult;
    tri.alpha += tri.alphaDir * 0.0015;
    if (tri.alpha > 0.35 || tri.alpha < 0.03) tri.alphaDir *= -1;
    const hue = tri.hue + hueShift;
    ctx.save(); ctx.translate(tri.x, tri.y); ctx.rotate(tri.angle);
    ctx.beginPath();
    ctx.moveTo(0, -tri.size * 0.55);
    ctx.lineTo(tri.size * 0.48, tri.size * 0.45);
    ctx.lineTo(-tri.size * 0.48, tri.size * 0.45);
    ctx.closePath();
    ctx.strokeStyle = `hsla(${hue},75%,65%,${tri.alpha * 1.8})`;
    ctx.fillStyle   = `hsla(${hue},70%,50%,${tri.alpha})`;
    ctx.lineWidth = 1; ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}

function makeTriBlue(): Anim {
  let tris: TriState[] = [], pw = 0, ph = 0;
  return { draw(ctx, w, h, t) {
    if (pw !== w || ph !== h) { pw = w; ph = h; tris = makeTris(32, w, h, 210, 60); }
    ctx.fillStyle = "rgba(3,7,22,0.1)"; ctx.fillRect(0, 0, w, h);
    drawTris(ctx, w, h, tris, t * 5, 1);
  }};
}

function makeTriGold(): Anim {
  let tris: TriState[] = [], pw = 0, ph = 0;
  return { draw(ctx, w, h, t) {
    if (pw !== w || ph !== h) { pw = w; ph = h; tris = makeTris(28, w, h, 25, 40); }
    ctx.fillStyle = "rgba(8,5,2,0.1)"; ctx.fillRect(0, 0, w, h);
    drawTris(ctx, w, h, tris, t * 3, 1);
  }};
}

function makeTriSpin(): Anim {
  let tris: TriState[] = [], pw = 0, ph = 0;
  return { draw(ctx, w, h, t) {
    if (pw !== w || ph !== h) {
      pw = w; ph = h;
      tris = makeTris(22, w, h, 220, 140).map(tr => ({ ...tr, angSpeed: (Math.random() > 0.5 ? 1 : -1) * (Math.random() * 0.05 + 0.03) }));
    }
    ctx.fillStyle = "rgba(2,5,18,0.12)"; ctx.fillRect(0, 0, w, h);
    drawTris(ctx, w, h, tris, t * 8, 1);
  }};
}

function makeTriBurst(): Anim {
  return { draw(ctx, w, h, t) {
    ctx.fillStyle = "rgba(2,5,18,0.14)"; ctx.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const N = 18;
    for (let i = 0; i < N; i++) {
      const phase = ((t * 0.4 + i / N) % 1);
      const r = phase * Math.min(w, h) * 0.55;
      const angle = (i / N) * Math.PI * 2 + t * 0.3;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r * 0.6;
      const sz = 30 * (1 - phase) + 5;
      const alpha = Math.sin(phase * Math.PI) * 0.6;
      const hue = (i / N) * 120 + 200 + t * 15;
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle + t * 0.5);
      ctx.beginPath();
      ctx.moveTo(0, -sz * 0.55); ctx.lineTo(sz * 0.48, sz * 0.45); ctx.lineTo(-sz * 0.48, sz * 0.45);
      ctx.closePath();
      ctx.fillStyle = `hsla(${hue},80%,60%,${alpha})`; ctx.fill();
      ctx.strokeStyle = `hsla(${hue},90%,75%,${alpha * 0.8})`; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    }
  }};
}

function makeTriGrid(): Anim {
  return { draw(ctx, w, h, t) {
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = "#020810"; ctx.fillRect(0, 0, w, h);
    const step = Math.max(40, w / 18);
    for (let row = -1; row < h / step + 2; row++) {
      for (let col = -1; col < w / step + 2; col++) {
        const x = col * step + step / 2;
        const y = row * step + step / 2;
        const phase = (Math.sin(x * 0.02 + y * 0.015 + t * 0.6) + 1) / 2;
        const hue = (x * 0.12 + y * 0.08 + t * 10) % 360;
        const sz = step * 0.38 * (0.5 + phase * 0.5);
        const alpha = 0.06 + phase * 0.35;
        const flipped = (row + col) % 2 === 0;
        ctx.save(); ctx.translate(x, y); ctx.rotate(flipped ? Math.PI : 0);
        ctx.beginPath();
        ctx.moveTo(0, -sz); ctx.lineTo(sz * 0.87, sz * 0.5); ctx.lineTo(-sz * 0.87, sz * 0.5);
        ctx.closePath();
        ctx.strokeStyle = `hsla(${hue},75%,62%,${alpha * 2})`;
        ctx.fillStyle   = `hsla(${hue},70%,45%,${alpha})`;
        ctx.lineWidth = 1; ctx.fill(); ctx.stroke();
        ctx.restore();
      }
    }
  }};
}

// ─────────────────────────────────────────────────────────────────────────────
// PARTICLES helpers
// ─────────────────────────────────────────────────────────────────────────────

type Part = { x: number; y: number; vx: number; vy: number; r: number; hue: number };

function makePartsArr(n: number, w: number, h: number, hueBase: number, hueRange: number): Part[] {
  return Array.from({ length: n }, () => ({
    x: Math.random() * w, y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.55, vy: (Math.random() - 0.5) * 0.55,
    r: Math.random() * 3 + 0.8, hue: hueBase + Math.random() * hueRange,
  }));
}

function makePartViolet(): Anim {
  let pts: Part[] = [], pw = 0, ph = 0;
  return { draw(ctx, w, h, t) {
    if (pw !== w || ph !== h) { pw = w; ph = h; pts = makePartsArr(90, w, h, 270, 80); }
    ctx.fillStyle = "rgba(5,3,18,0.18)"; ctx.fillRect(0, 0, w, h);
    for (const p of pts) {
      p.x = (p.x + p.vx + w) % w; p.y = (p.y + p.vy + h) % h;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 5);
      g.addColorStop(0, `hsla(${p.hue},90%,78%,0.9)`); g.addColorStop(1, "transparent");
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 5, 0, Math.PI * 2);
      ctx.fillStyle = g; ctx.fill();
    }
    void t;
  }};
}

function makePartComet(): Anim {
  type Comet = Part & { trail: Array<[number, number]> };
  let comets: Comet[] = [], pw = 0, ph = 0;
  return { draw(ctx, w, h, t) {
    if (pw !== w || ph !== h) {
      pw = w; ph = h;
      comets = Array.from({ length: 40 }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 1.2, vy: (Math.random() - 0.5) * 1.2,
        r: Math.random() * 2 + 1, hue: 200 + Math.random() * 80, trail: [],
      }));
    }
    ctx.fillStyle = "rgba(2,7,22,0.18)"; ctx.fillRect(0, 0, w, h);
    for (const c of comets) {
      c.trail.push([c.x, c.y]);
      if (c.trail.length > 16) c.trail.shift();
      c.x = (c.x + c.vx + w) % w; c.y = (c.y + c.vy + h) % h;
      if (Math.abs(c.x - (c.trail[0]?.[0] ?? c.x)) > w / 2) c.trail = [];
      for (let i = 1; i < c.trail.length; i++) {
        const alpha = (i / c.trail.length) * 0.7;
        ctx.beginPath();
        ctx.moveTo(c.trail[i-1][0], c.trail[i-1][1]);
        ctx.lineTo(c.trail[i][0], c.trail[i][1]);
        ctx.strokeStyle = `hsla(${c.hue},85%,70%,${alpha})`;
        ctx.lineWidth = c.r * (i / c.trail.length);
        ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${c.hue},90%,85%,0.9)`; ctx.fill();
    }
    void t;
  }};
}

function makePartBurst(): Anim {
  return { draw(ctx, w, h, t) {
    ctx.fillStyle = "rgba(2,5,18,0.14)"; ctx.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const N = 60;
    for (let i = 0; i < N; i++) {
      const angle = (i / N) * Math.PI * 2;
      const phase = ((t * 0.35 + i / N * 0.5) % 1);
      const r = phase * Math.min(w, h) * 0.45;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      const radius = 3 * (1 - phase) + 0.5;
      const alpha = Math.sin(phase * Math.PI) * 0.85;
      const hue = angle * (180 / Math.PI) + t * 20;
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue},85%,72%,${alpha})`; ctx.fill();
    }
  }};
}

function makePartSlow(): Anim {
  let pts: Part[] = [], pw = 0, ph = 0;
  return { draw(ctx, w, h, t) {
    if (pw !== w || ph !== h) {
      pw = w; ph = h;
      pts = Array.from({ length: 30 }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.18, vy: (Math.random() - 0.5) * 0.18,
        r: Math.random() * 14 + 6, hue: 200 + Math.random() * 120,
      }));
    }
    ctx.fillStyle = "rgba(2,8,22,0.12)"; ctx.fillRect(0, 0, w, h);
    for (const p of pts) {
      p.x = (p.x + p.vx + w) % w; p.y = (p.y + p.vy + h) % h;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
      g.addColorStop(0, `hsla(${p.hue},80%,70%,0.5)`); g.addColorStop(1, "transparent");
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2);
      ctx.fillStyle = g; ctx.fill();
    }
    void t;
  }};
}

function makePartRain(): Anim {
  type Drop = { x: number; y: number; r: number; speed: number; hue: number };
  let drops: Drop[] = [], pw = 0, ph = 0;
  return { draw(ctx, w, h, t) {
    if (pw !== w || ph !== h) {
      pw = w; ph = h;
      drops = Array.from({ length: 70 }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        r: Math.random() * 2.5 + 0.8, speed: Math.random() * 1.5 + 0.6,
        hue: 200 + Math.random() * 80,
      }));
    }
    ctx.fillStyle = "rgba(3,8,24,0.16)"; ctx.fillRect(0, 0, w, h);
    for (const d of drops) {
      d.y = (d.y + d.speed * 0.6 + h) % (h + 10);
      const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r * 4);
      g.addColorStop(0, `hsla(${d.hue},85%,72%,0.85)`); g.addColorStop(1, "transparent");
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r * 4, 0, Math.PI * 2);
      ctx.fillStyle = g; ctx.fill();
    }
    void t;
  }};
}

function makePartOrbit(): Anim {
  type Orb = { cx: number; cy: number; r: number; angle: number; speed: number; hue: number; dotR: number };
  let orbs: Orb[] = [], pw = 0, ph = 0;
  return { draw(ctx, w, h, t) {
    if (pw !== w || ph !== h) {
      pw = w; ph = h;
      orbs = Array.from({ length: 10 }, () => ({
        cx: Math.random() * w, cy: Math.random() * h,
        r: Math.random() * 60 + 30, angle: Math.random() * Math.PI * 2,
        speed: (Math.random() > 0.5 ? 1 : -1) * (Math.random() * 0.6 + 0.3),
        hue: Math.random() * 150 + 180, dotR: Math.random() * 3 + 1.5,
      }));
    }
    ctx.fillStyle = "rgba(3,8,22,0.14)"; ctx.fillRect(0, 0, w, h);
    for (const o of orbs) {
      o.angle += o.speed * 0.016;
      // Orbit ring
      ctx.beginPath(); ctx.arc(o.cx, o.cy, o.r, 0, Math.PI * 2);
      ctx.strokeStyle = `hsla(${o.hue},70%,55%,0.12)`; ctx.lineWidth = 1; ctx.stroke();
      // Dot
      const px = o.cx + Math.cos(o.angle) * o.r;
      const py = o.cy + Math.sin(o.angle) * o.r;
      const g = ctx.createRadialGradient(px, py, 0, px, py, o.dotR * 5);
      g.addColorStop(0, `hsla(${o.hue},90%,78%,1)`); g.addColorStop(1, "transparent");
      ctx.beginPath(); ctx.arc(px, py, o.dotR * 5, 0, Math.PI * 2);
      ctx.fillStyle = g; ctx.fill();
    }
    void t;
  }};
}

// ─────────────────────────────────────────────────────────────────────────────
// CIRCUIT helpers
// ─────────────────────────────────────────────────────────────────────────────

type CircLine = { x: number; y: number; dir: number; len: number; progress: number; speed: number; hue: number };

function makeCircuitLines(w: number, h: number, hueBase: number, hueRange: number, n: number, stepDiv: number): CircLine[] {
  const step = Math.max(16, w / stepDiv);
  return Array.from({ length: n }, () => {
    const gx = Math.floor(Math.random() * (w / step)) * step;
    const gy = Math.floor(Math.random() * (h / step)) * step;
    return {
      x: gx, y: gy, dir: Math.floor(Math.random() * 4),
      len: (Math.floor(Math.random() * 6) + 2) * step,
      progress: Math.random() * 200, speed: Math.random() * 2.5 + 1,
      hue: hueBase + Math.random() * hueRange,
    };
  });
}

function drawCircuit(ctx: CanvasRenderingContext2D, _w: number, _h: number, lines: CircLine[], step: number) {
  for (const ln of lines) {
    ln.progress = (ln.progress + ln.speed * 0.5) % (ln.len + step * 3);
    const drawn = Math.min(ln.progress, ln.len);
    if (drawn < 2) continue;
    const dx = ln.dir === 0 ? drawn : ln.dir === 2 ? -drawn : 0;
    const dy = ln.dir === 1 ? drawn : ln.dir === 3 ? -drawn : 0;
    const g = ctx.createLinearGradient(ln.x, ln.y, ln.x + dx, ln.y + dy);
    g.addColorStop(0, `hsla(${ln.hue},80%,55%,0.06)`);
    g.addColorStop(0.65, `hsla(${ln.hue},90%,65%,0.35)`);
    g.addColorStop(1, `hsla(${ln.hue},100%,82%,0.95)`);
    ctx.strokeStyle = g; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(ln.x, ln.y); ctx.lineTo(ln.x + dx, ln.y + dy); ctx.stroke();
    ctx.beginPath(); ctx.arc(ln.x + dx, ln.y + dy, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${ln.hue},100%,82%,0.85)`; ctx.fill();
  }
}

function makeCircuitGold(): Anim {
  let lines: CircLine[] = [], pw = 0, ph = 0;
  return { draw(ctx, w, h, t) {
    if (pw !== w || ph !== h) { pw = w; ph = h; lines = makeCircuitLines(w, h, 35, 30, 45, 38); }
    ctx.fillStyle = "rgba(8,5,2,0.1)"; ctx.fillRect(0, 0, w, h);
    drawCircuit(ctx, w, h, lines, Math.max(16, w / 38));
    void t;
  }};
}

function makeCircuitDense(): Anim {
  let lines: CircLine[] = [], pw = 0, ph = 0;
  return { draw(ctx, w, h, t) {
    if (pw !== w || ph !== h) { pw = w; ph = h; lines = makeCircuitLines(w, h, 190, 60, 80, 55); }
    ctx.fillStyle = "rgba(2,8,18,0.08)"; ctx.fillRect(0, 0, w, h);
    drawCircuit(ctx, w, h, lines, Math.max(14, w / 55));
    void t;
  }};
}

function makeCircuitPulse(): Anim {
  let lines: CircLine[] = [], pw = 0, ph = 0;
  return { draw(ctx, w, h, t) {
    if (pw !== w || ph !== h) { pw = w; ph = h; lines = makeCircuitLines(w, h, 0, 360, 50, 40); }
    ctx.fillStyle = "rgba(2,6,16,0.1)"; ctx.fillRect(0, 0, w, h);
    // shift hue over time for pulse effect
    for (const ln of lines) ln.hue = (ln.hue + 0.3) % 360;
    drawCircuit(ctx, w, h, lines, Math.max(16, w / 40));
    void t;
  }};
}

function makeCircuitBlue(): Anim {
  let lines: CircLine[] = [], pw = 0, ph = 0;
  return { draw(ctx, w, h, t) {
    if (pw !== w || ph !== h) { pw = w; ph = h; lines = makeCircuitLines(w, h, 200, 50, 45, 40); }
    ctx.fillStyle = "rgba(2,6,20,0.1)"; ctx.fillRect(0, 0, w, h);
    drawCircuit(ctx, w, h, lines, Math.max(16, w / 40));
    void t;
  }};
}

// ─────────────────────────────────────────────────────────────────────────────
// MESH helpers
// ─────────────────────────────────────────────────────────────────────────────

type MeshPt = { x: number; y: number; vx: number; vy: number; hue: number };

function makeMeshPts(n: number, w: number, h: number, speed: number, hueBase: number, hueRange: number): MeshPt[] {
  return Array.from({ length: n }, () => ({
    x: Math.random() * w, y: Math.random() * h,
    vx: (Math.random() - 0.5) * speed, vy: (Math.random() - 0.5) * speed,
    hue: hueBase + Math.random() * hueRange,
  }));
}

function drawMesh(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  pts: MeshPt[], maxDist: number,
  colorFn: (hue1: number, hue2: number, alpha: number) => string,
  dotColor: string, dotR: number
) {
  for (const p of pts) {
    p.x = (p.x + p.vx + w) % w; p.y = (p.y + p.vy + h) % h;
  }
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < maxDist) {
        const alpha = (1 - dist / maxDist) * 0.55;
        ctx.strokeStyle = colorFn(pts[i].hue, pts[j].hue, alpha);
        ctx.lineWidth = (1 - dist / maxDist) * 1.5;
        ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke();
      }
    }
  }
  for (const p of pts) {
    ctx.beginPath(); ctx.arc(p.x, p.y, dotR, 0, Math.PI * 2);
    ctx.fillStyle = dotColor; ctx.fill();
  }
}

function makeMeshTight(): Anim {
  let pts: MeshPt[] = [], pw = 0, ph = 0;
  return { draw(ctx, w, h, t) {
    if (pw !== w || ph !== h) { pw = w; ph = h; pts = makeMeshPts(80, w, h, 0.45, 210, 50); }
    ctx.fillStyle = "rgba(3,8,22,0.15)"; ctx.fillRect(0, 0, w, h);
    drawMesh(ctx, w, h, pts, w * 0.09,
      (_, __, a) => `rgba(100,140,255,${a})`,
      "rgba(150,180,255,0.8)", 2);
    void t;
  }};
}

function makeMeshColored(): Anim {
  let pts: MeshPt[] = [], pw = 0, ph = 0;
  return { draw(ctx, w, h, t) {
    if (pw !== w || ph !== h) { pw = w; ph = h; pts = makeMeshPts(55, w, h, 0.5, 0, 360); }
    ctx.fillStyle = "rgba(3,6,20,0.15)"; ctx.fillRect(0, 0, w, h);
    drawMesh(ctx, w, h, pts, w * 0.13,
      (h1, h2, a) => `hsla(${(h1 + h2) / 2},80%,65%,${a})`,
      "rgba(200,220,255,0.8)", 2.5);
    void t;
  }};
}

function makeMeshSlow(): Anim {
  let pts: MeshPt[] = [], pw = 0, ph = 0;
  return { draw(ctx, w, h, t) {
    if (pw !== w || ph !== h) { pw = w; ph = h; pts = makeMeshPts(40, w, h, 0.18, 220, 60); }
    ctx.fillStyle = "rgba(2,7,20,0.1)"; ctx.fillRect(0, 0, w, h);
    drawMesh(ctx, w, h, pts, w * 0.17,
      (_, __, a) => `rgba(80,130,230,${a * 0.8})`,
      "rgba(140,180,255,0.7)", 3);
    void t;
  }};
}

function makeMeshGlow(): Anim {
  let pts: MeshPt[] = [], pw = 0, ph = 0;
  return { draw(ctx, w, h, t) {
    if (pw !== w || ph !== h) { pw = w; ph = h; pts = makeMeshPts(50, w, h, 0.4, 180, 120); }
    ctx.fillStyle = "rgba(2,6,18,0.15)"; ctx.fillRect(0, 0, w, h);
    // Move first
    for (const p of pts) { p.x = (p.x + p.vx + w) % w; p.y = (p.y + p.vy + h) % h; }
    // Lines
    const maxDist = w * 0.11;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < maxDist) {
          const alpha = (1 - dist / maxDist) * 0.4;
          ctx.strokeStyle = `rgba(100,150,255,${alpha})`;
          ctx.lineWidth = (1 - dist / maxDist);
          ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke();
        }
      }
    }
    // Glowing dots
    for (const p of pts) {
      const pulse = (Math.sin(t * 1.2 + p.hue * 0.05) + 1) / 2;
      const r = 3 + pulse * 4;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3);
      g.addColorStop(0, `hsla(${p.hue},90%,75%,${0.7 + pulse * 0.3})`);
      g.addColorStop(1, "transparent");
      ctx.beginPath(); ctx.arc(p.x, p.y, r * 3, 0, Math.PI * 2);
      ctx.fillStyle = g; ctx.fill();
    }
  }};
}

// ─────────────────────────────────────────────────────────────────────────────
// MIX animations
// ─────────────────────────────────────────────────────────────────────────────

function makeMixHexParticles(): Anim {
  let pts: Part[] = [], pw = 0, ph = 0;
  return { draw(ctx, w, h, t) {
    if (pw !== w || ph !== h) { pw = w; ph = h; pts = makePartsArr(55, w, h, 200, 80); }
    ctx.fillStyle = "rgba(2,6,20,0.16)"; ctx.fillRect(0, 0, w, h);
    // Hex layer
    drawHexGrid(ctx, w, h, t, { hueBase: 215, hueSat: 75, speed: 0.4, strokeAlphaMin: 0.04, strokeAlphaMax: 0.3, fillAlpha: 0 });
    // Particles layer
    for (const p of pts) {
      p.x = (p.x + p.vx + w) % w; p.y = (p.y + p.vy + h) % h;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
      g.addColorStop(0, `hsla(${p.hue},85%,72%,0.8)`); g.addColorStop(1, "transparent");
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    }
  }};
}

function makeMixHexCircuit(): Anim {
  let lines: CircLine[] = [], pw = 0, ph = 0;
  return { draw(ctx, w, h, t) {
    if (pw !== w || ph !== h) { pw = w; ph = h; lines = makeCircuitLines(w, h, 200, 60, 40, 40); }
    ctx.fillStyle = "rgba(2,6,18,0.14)"; ctx.fillRect(0, 0, w, h);
    drawHexGrid(ctx, w, h, t, { hueBase: 220, hueSat: 70, speed: 0.35, strokeAlphaMin: 0.03, strokeAlphaMax: 0.22, fillAlpha: 0 });
    drawCircuit(ctx, w, h, lines, Math.max(16, w / 40));
    void t;
  }};
}

function makeMixTriMesh(): Anim {
  let tris: TriState[] = [], pts: MeshPt[] = [], pw = 0, ph = 0;
  return { draw(ctx, w, h, t) {
    if (pw !== w || ph !== h) {
      pw = w; ph = h;
      tris = makeTris(20, w, h, 210, 70);
      pts = makeMeshPts(40, w, h, 0.4, 210, 70);
    }
    ctx.fillStyle = "rgba(3,7,22,0.14)"; ctx.fillRect(0, 0, w, h);
    drawMesh(ctx, w, h, pts, w * 0.12, (_, __, a) => `rgba(90,130,240,${a})`, "rgba(130,170,255,0.7)", 2);
    drawTris(ctx, w, h, tris, t * 5, 0.9);
  }};
}

function makeMixCircuitPart(): Anim {
  let lines: CircLine[] = [], pts: Part[] = [], pw = 0, ph = 0;
  return { draw(ctx, w, h, t) {
    if (pw !== w || ph !== h) {
      pw = w; ph = h;
      lines = makeCircuitLines(w, h, 180, 80, 35, 38);
      pts = makePartsArr(50, w, h, 185, 90);
    }
    ctx.fillStyle = "rgba(2,6,20,0.14)"; ctx.fillRect(0, 0, w, h);
    drawCircuit(ctx, w, h, lines, Math.max(16, w / 38));
    for (const p of pts) {
      p.x = (p.x + p.vx + w) % w; p.y = (p.y + p.vy + h) % h;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3.5);
      g.addColorStop(0, `hsla(${p.hue},85%,70%,0.6)`); g.addColorStop(1, "transparent");
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 3.5, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    }
    void t;
  }};
}

function makeMixMeshHex(): Anim {
  let pts: MeshPt[] = [], pw = 0, ph = 0;
  return { draw(ctx, w, h, t) {
    if (pw !== w || ph !== h) { pw = w; ph = h; pts = makeMeshPts(50, w, h, 0.45, 210, 60); }
    ctx.fillStyle = "rgba(2,6,20,0.16)"; ctx.fillRect(0, 0, w, h);
    drawHexGrid(ctx, w, h, t, { hueBase: 210, hueSat: 65, speed: 0.3, strokeAlphaMin: 0.03, strokeAlphaMax: 0.18, fillAlpha: 0, size: Math.max(35, w / 18) });
    drawMesh(ctx, w, h, pts, w * 0.11, (_, __, a) => `rgba(100,150,255,${a})`, "rgba(160,200,255,0.8)", 2.5);
  }};
}

// ─────────────────────────────────────────────────────────────────────────────
// Preset map
// ─────────────────────────────────────────────────────────────────────────────

const ANIM_MAP: Record<string, () => Anim> = {
  hex_blue:          makeHexBlue,
  hex_gold:          makeHexGold,
  hex_neon:          makeHexNeon,
  hex_dark:          makeHexDark,
  hex_filled:        makeHexFilled,
  hex_wave:          makeHexWave,
  tri_blue:          makeTriBlue,
  tri_gold:          makeTriGold,
  tri_spin:          makeTriSpin,
  tri_burst:         makeTriBurst,
  tri_grid:          makeTriGrid,
  part_violet:       makePartViolet,
  part_comet:        makePartComet,
  part_burst:        makePartBurst,
  part_slow:         makePartSlow,
  part_rain:         makePartRain,
  part_orbit:        makePartOrbit,
  circuit_gold:      makeCircuitGold,
  circuit_dense:     makeCircuitDense,
  circuit_pulse:     makeCircuitPulse,
  circuit_blue:      makeCircuitBlue,
  mesh_tight:        makeMeshTight,
  mesh_colored:      makeMeshColored,
  mesh_slow:         makeMeshSlow,
  mesh_glow:         makeMeshGlow,
  mix_hex_particles: makeMixHexParticles,
  mix_hex_circuit:   makeMixHexCircuit,
  mix_tri_mesh:      makeMixTriMesh,
  mix_circuit_part:  makeMixCircuitPart,
  mix_mesh_hex:      makeMixMeshHex,
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
      canvas!.width = parent.offsetWidth || 1;
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
