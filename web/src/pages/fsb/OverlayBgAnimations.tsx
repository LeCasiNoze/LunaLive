import * as React from "react";

// ─── Preset list ──────────────────────────────────────────────────────────────

export const BG_PRESETS: Array<{ id: string; label: string }> = [
  { id: "none",           label: "— Aucun fond animé —" },
  { id: "particles_blue", label: "Particules bleues" },
  { id: "matrix_rain",    label: "Pluie Matrix" },
  { id: "neon_grid",      label: "Grille néon" },
  { id: "pulse_rings",    label: "Anneaux pulsés" },
  { id: "aurora",         label: "Aurora boréale" },
  { id: "starfield",      label: "Champ d'étoiles" },
  { id: "bokeh",          label: "Bokeh flottant" },
  { id: "synthwave",      label: "Synthwave rétro" },
  { id: "glitch",         label: "Glitch digital" },
  { id: "rain_drops",     label: "Pluie de gouttes" },
  { id: "vortex",         label: "Vortex tournant" },
  { id: "embers",         label: "Braises montantes" },
  { id: "breathing",      label: "Respiration lumineuse" },
  { id: "hexagons",       label: "Hexagones" },
  { id: "waves",          label: "Vagues sinusoïdales" },
  { id: "plasma",         label: "Plasma" },
  { id: "triangles",      label: "Triangles flottants" },
  { id: "binary_rain",    label: "Pluie binaire" },
  { id: "neon_lines",     label: "Lignes néon" },
  { id: "galaxy",         label: "Galaxie spirale" },
  { id: "crystals",       label: "Cristaux" },
  { id: "fire",           label: "Feu" },
  { id: "laser_show",     label: "Laser show" },
  { id: "mosaic",         label: "Mosaïque" },
  { id: "dna_helix",      label: "Hélice ADN" },
  { id: "scanlines",      label: "Scanlines rétro" },
  { id: "dark_pulse",     label: "Pulsation sombre" },
  { id: "circuit",        label: "Circuit électronique" },
  { id: "particles_mesh", label: "Réseau de particules" },
  { id: "snowfall",       label: "Chute de neige" },
];

// ─── Animation engine ─────────────────────────────────────────────────────────

interface Anim {
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void;
}

// ─── 30 animation factories ───────────────────────────────────────────────────

function makeParticlesBlue(): Anim {
  type P = { x: number; y: number; vx: number; vy: number; r: number; hue: number };
  let pts: P[] = [], pw = 0, ph = 0;
  return {
    draw(ctx, w, h, t) {
      if (pw !== w || ph !== h) {
        pw = w; ph = h;
        pts = Array.from({ length: 90 }, () => ({
          x: Math.random() * w, y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6,
          r: Math.random() * 3 + 1, hue: Math.random() * 60 + 210,
        }));
      }
      ctx.fillStyle = "rgba(4,8,28,0.18)";
      ctx.fillRect(0, 0, w, h);
      for (const p of pts) {
        p.x = (p.x + p.vx + w) % w;
        p.y = (p.y + p.vy + h) % h;
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
        glow.addColorStop(0, `hsla(${p.hue},90%,75%,0.9)`);
        glow.addColorStop(1, `hsla(${p.hue},90%,60%,0)`);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2);
        ctx.fillStyle = glow; ctx.fill();
      }
      void t;
    },
  };
}

function makeMatrixRain(): Anim {
  type Col = { x: number; y: number; speed: number; chars: string[] };
  let cols: Col[] = [], pw = 0, ph = 0;
  const CHARS = "ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ01";
  return {
    draw(ctx, w, h, t) {
      if (pw !== w || ph !== h) {
        pw = w; ph = h;
        const sz = Math.max(12, w / 80);
        cols = Array.from({ length: Math.floor(w / sz) }, (_, i) => ({
          x: i * sz, y: -Math.random() * h,
          speed: Math.random() * 1.5 + 0.5,
          chars: Array.from({ length: Math.floor(h / sz) + 2 },
            () => CHARS[Math.floor(Math.random() * CHARS.length)]),
        }));
      }
      ctx.fillStyle = "rgba(0,10,5,0.15)";
      ctx.fillRect(0, 0, w, h);
      const sz = Math.max(12, w / 80);
      const dt = 0.016;
      ctx.font = `bold ${sz}px monospace`;
      for (const col of cols) {
        col.y = (col.y + col.speed * dt * 60 + h) % (h + sz * 5) - sz * 5;
        const len = col.chars.length;
        for (let i = 0; i < len; i++) {
          const cy = col.y + i * sz;
          if (cy < -sz || cy > h + sz) continue;
          const frac = i / len;
          const alpha = Math.max(0, 1 - frac * 1.2);
          ctx.fillStyle = i === 0
            ? `rgba(220,255,220,${alpha})`
            : `rgba(0,${Math.floor(180 + frac * 75)},${Math.floor(frac * 40)},${alpha * 0.8})`;
          ctx.fillText(col.chars[i], col.x, cy);
        }
        if (Math.random() < 0.005) {
          col.chars[Math.floor(Math.random() * len)] = CHARS[Math.floor(Math.random() * CHARS.length)];
        }
      }
      void t;
    },
  };
}

function makeNeonGrid(): Anim {
  return {
    draw(ctx, w, h, t) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#020a16"; ctx.fillRect(0, 0, w, h);
      const step = w / 20;
      const pulse = Math.sin(t * 0.7) * 0.5 + 0.5;
      const col1 = `rgba(99,102,241,${0.15 + pulse * 0.25})`;
      const col2 = `rgba(168,85,247,${0.12 + pulse * 0.2})`;
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += step) {
        const gx = ctx.createLinearGradient(x, 0, x, h);
        gx.addColorStop(0, "transparent"); gx.addColorStop(0.5, col1); gx.addColorStop(1, "transparent");
        ctx.strokeStyle = gx; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y < h; y += step) {
        const gy = ctx.createLinearGradient(0, y, w, y);
        gy.addColorStop(0, "transparent"); gy.addColorStop(0.5, col2); gy.addColorStop(1, "transparent");
        ctx.strokeStyle = gy; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      // Intersection glows
      for (let x = step; x < w; x += step * 4) {
        for (let y = step; y < h; y += step * 4) {
          const d = (Math.sin(t * 1.1 + x * 0.02 + y * 0.01) + 1) / 2;
          const g = ctx.createRadialGradient(x, y, 0, x, y, step * 2);
          g.addColorStop(0, `rgba(99,102,241,${d * 0.4})`);
          g.addColorStop(1, "transparent");
          ctx.beginPath(); ctx.arc(x, y, step * 2, 0, Math.PI * 2);
          ctx.fillStyle = g; ctx.fill();
        }
      }
    },
  };
}

function makePulseRings(): Anim {
  return {
    draw(ctx, w, h, t) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#030918"; ctx.fillRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      const maxR = Math.hypot(cx, cy);
      const N = 6;
      for (let i = 0; i < N; i++) {
        const phase = (t * 0.4 + i / N) % 1;
        const r = phase * maxR;
        const alpha = Math.sin(phase * Math.PI) * 0.7;
        const hue = 220 + i * 20 + t * 10;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(${hue},85%,65%,${alpha})`;
        ctx.lineWidth = 2 - phase * 1.5;
        ctx.stroke();
      }
      // Center glow
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 0.3);
      const pulse = (Math.sin(t * 2) + 1) / 2;
      g.addColorStop(0, `rgba(99,102,241,${0.3 + pulse * 0.2})`);
      g.addColorStop(1, "transparent");
      ctx.beginPath(); ctx.arc(cx, cy, maxR * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = g; ctx.fill();
    },
  };
}

function makeAurora(): Anim {
  return {
    draw(ctx, w, h, t) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#010812"; ctx.fillRect(0, 0, w, h);
      const N = 4;
      for (let i = 0; i < N; i++) {
        const hue = 160 + i * 40 + t * 8;
        const speed = 0.3 + i * 0.15;
        const amp = h * 0.08;
        const yBase = h * (0.2 + i * 0.15);
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 4) {
          const y = yBase
            + Math.sin(x * 0.006 + t * speed) * amp
            + Math.sin(x * 0.011 - t * speed * 0.7) * amp * 0.5;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h); ctx.closePath();
        const grad = ctx.createLinearGradient(0, yBase - amp * 2, 0, yBase + amp * 4);
        grad.addColorStop(0, `hsla(${hue},90%,65%,0.22)`);
        grad.addColorStop(0.5, `hsla(${hue + 30},80%,55%,0.12)`);
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad; ctx.fill();
      }
    },
  };
}

function makeStarfield(): Anim {
  type Star = { x: number; y: number; z: number };
  let stars: Star[] = [], pw = 0, ph = 0;
  return {
    draw(ctx, w, h, t) {
      if (pw !== w || ph !== h) {
        pw = w; ph = h;
        stars = Array.from({ length: 200 }, () => ({
          x: (Math.random() - 0.5) * w, y: (Math.random() - 0.5) * h, z: Math.random(),
        }));
      }
      ctx.fillStyle = "rgba(2,6,20,0.2)"; ctx.fillRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      for (const s of stars) {
        s.z -= 0.004;
        if (s.z <= 0) { s.x = (Math.random() - 0.5) * w; s.y = (Math.random() - 0.5) * h; s.z = 1; }
        const iz = 1 / s.z;
        const px = s.x * iz + cx, py = s.y * iz + cy;
        if (px < 0 || px > w || py < 0 || py > h) { s.z = 1; continue; }
        const r = Math.max(0.3, (1 - s.z) * 3);
        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(220,230,255,${(1 - s.z) * 0.9})`; ctx.fill();
      }
      void t;
    },
  };
}

function makeBokeh(): Anim {
  type B = { x: number; y: number; vx: number; vy: number; r: number; hue: number; phase: number };
  let blobs: B[] = [], pw = 0, ph = 0;
  return {
    draw(ctx, w, h, t) {
      if (pw !== w || ph !== h) {
        pw = w; ph = h;
        blobs = Array.from({ length: 25 }, () => ({
          x: Math.random() * w, y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
          r: Math.random() * 80 + 30, hue: Math.random() * 120 + 180, phase: Math.random() * Math.PI * 2,
        }));
      }
      ctx.fillStyle = "rgba(3,7,22,0.12)"; ctx.fillRect(0, 0, w, h);
      for (const b of blobs) {
        b.x = (b.x + b.vx + w) % w; b.y = (b.y + b.vy + h) % h;
        const alpha = (Math.sin(t * 0.5 + b.phase) + 1) / 2 * 0.25 + 0.05;
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        g.addColorStop(0, `hsla(${b.hue},70%,65%,${alpha})`);
        g.addColorStop(1, "transparent");
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = g; ctx.fill();
      }
    },
  };
}

function makeSynthwave(): Anim {
  return {
    draw(ctx, w, h, t) {
      ctx.clearRect(0, 0, w, h);
      // Sky gradient
      const sky = ctx.createLinearGradient(0, 0, 0, h * 0.55);
      sky.addColorStop(0, "#0a0015"); sky.addColorStop(0.6, "#1a0030"); sky.addColorStop(1, "#3d0066");
      ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h * 0.55);
      // Ground
      const gnd = ctx.createLinearGradient(0, h * 0.55, 0, h);
      gnd.addColorStop(0, "#0d001a"); gnd.addColorStop(1, "#000005");
      ctx.fillStyle = gnd; ctx.fillRect(0, h * 0.55, w, h * 0.45);
      // Sun
      const sx = w / 2, sy = h * 0.52;
      const sunR = h * 0.12;
      const sunG = ctx.createRadialGradient(sx, sy, 0, sx, sy, sunR);
      sunG.addColorStop(0, "#ff7700"); sunG.addColorStop(0.5, "#ff00aa"); sunG.addColorStop(1, "transparent");
      ctx.beginPath(); ctx.arc(sx, sy, sunR, 0, Math.PI * 2);
      ctx.fillStyle = sunG; ctx.fill();
      // Sun scanlines
      ctx.fillStyle = "#1a0030";
      for (let i = 1; i <= 5; i++) {
        const ly = sy + (sunR * i) / 6;
        if (ly < sy + sunR) ctx.fillRect(sx - sunR, ly, sunR * 2, sunR * 0.06);
      }
      // Grid horizon lines
      const hor = h * 0.55;
      ctx.strokeStyle = "#ff00cc"; ctx.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        const progress = ((t * 0.3 + i / 8) % 1);
        const y = hor + progress * (h - hor);
        const fade = Math.sin(progress * Math.PI) * 0.8;
        ctx.strokeStyle = `rgba(255,0,204,${fade})`;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      // Grid vertical lines (perspective)
      const vp = w / 2;
      for (let i = -10; i <= 10; i++) {
        const bx = w / 2 + i * (w / 20);
        ctx.strokeStyle = "rgba(0,255,204,0.3)";
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(vp, hor); ctx.lineTo(bx, h); ctx.stroke();
      }
    },
  };
}

function makeGlitch(): Anim {
  return {
    draw(ctx, w, h, t) {
      ctx.fillStyle = "#040a18"; ctx.fillRect(0, 0, w, h);
      const tick = Math.floor(t * 30);
      const glitchOn = Math.sin(t * 0.8) > 0.5;
      if (glitchOn && tick % 3 === 0) {
        const lines = Math.floor(Math.random() * 12) + 2;
        for (let i = 0; i < lines; i++) {
          const y = Math.random() * h;
          const ht = Math.random() * 4 + 1;
          const offset = (Math.random() - 0.5) * 40;
          const hue = Math.random() * 360;
          ctx.fillStyle = `hsla(${hue},100%,60%,0.15)`;
          ctx.fillRect(0, y, w, ht);
          ctx.fillStyle = `hsla(${hue},100%,80%,0.08)`;
          ctx.fillRect(offset, y - 1, w, ht + 2);
        }
      }
      // Scanline
      ctx.fillStyle = `rgba(0,200,255,${0.04 + (Math.sin(t * 2)) * 0.02})`;
      for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 2);
      // Corner glows
      const corners = [[0, 0], [w, 0], [0, h], [w, h]];
      for (const [cx, cy] of corners) {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.3);
        g.addColorStop(0, `rgba(99,102,241,${0.05 + Math.sin(t * 1.5) * 0.03})`);
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      }
    },
  };
}

function makeRainDrops(): Anim {
  type Drop = { x: number; y: number; len: number; speed: number; alpha: number };
  let drops: Drop[] = [], pw = 0, ph = 0;
  return {
    draw(ctx, w, h, t) {
      if (pw !== w || ph !== h) {
        pw = w; ph = h;
        drops = Array.from({ length: 120 }, () => ({
          x: Math.random() * w, y: Math.random() * h,
          len: Math.random() * 20 + 8, speed: Math.random() * 4 + 3,
          alpha: Math.random() * 0.5 + 0.1,
        }));
      }
      ctx.fillStyle = "rgba(3,10,25,0.15)"; ctx.fillRect(0, 0, w, h);
      ctx.lineWidth = 1;
      for (const d of drops) {
        d.y = (d.y + d.speed * 0.8 + h) % (h + 20);
        const g = ctx.createLinearGradient(d.x, d.y, d.x, d.y + d.len);
        g.addColorStop(0, `rgba(100,180,255,0)`);
        g.addColorStop(0.7, `rgba(140,200,255,${d.alpha})`);
        g.addColorStop(1, `rgba(180,220,255,${d.alpha * 0.8})`);
        ctx.strokeStyle = g;
        ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 2, d.y + d.len); ctx.stroke();
      }
      void t;
    },
  };
}

function makeVortex(): Anim {
  return {
    draw(ctx, w, h, t) {
      ctx.fillStyle = "rgba(3,8,22,0.12)"; ctx.fillRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      const N = 120;
      for (let i = 0; i < N; i++) {
        const angle = (i / N) * Math.PI * 2 * 3 + t * 0.8;
        const r = (i / N) * Math.min(w, h) * 0.45;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        const hue = (i / N) * 360 + t * 30;
        const alpha = 1 - (i / N) * 0.7;
        ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue},80%,65%,${alpha})`; ctx.fill();
      }
    },
  };
}

function makeEmbers(): Anim {
  type E = { x: number; y: number; vy: number; vx: number; life: number; maxLife: number; r: number };
  let embers: E[] = [], pw = 0, ph = 0;
  return {
    draw(ctx, w, h, t) {
      if (pw !== w || ph !== h) { pw = w; ph = h; embers = []; }
      ctx.fillStyle = "rgba(5,2,2,0.15)"; ctx.fillRect(0, 0, w, h);
      // Spawn
      while (embers.length < 80) {
        embers.push({
          x: w * 0.2 + Math.random() * w * 0.6, y: h + Math.random() * 20,
          vy: -(Math.random() * 2 + 1), vx: (Math.random() - 0.5) * 0.8,
          life: 0, maxLife: Math.random() * 120 + 80, r: Math.random() * 2 + 0.5,
        });
      }
      for (let i = embers.length - 1; i >= 0; i--) {
        const e = embers[i];
        e.y += e.vy; e.x += e.vx + Math.sin(e.life * 0.1) * 0.3;
        e.life++;
        if (e.life > e.maxLife || e.y < -10) { embers.splice(i, 1); continue; }
        const prog = e.life / e.maxLife;
        const hue = 15 + prog * 25; const alpha = Math.sin(prog * Math.PI) * 0.9;
        const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * 3);
        g.addColorStop(0, `hsla(${hue},100%,80%,${alpha})`);
        g.addColorStop(1, `hsla(${hue},100%,40%,0)`);
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 3, 0, Math.PI * 2);
        ctx.fillStyle = g; ctx.fill();
      }
      void t;
    },
  };
}

function makeBreathing(): Anim {
  return {
    draw(ctx, w, h, t) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#030818"; ctx.fillRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      const pulse = (Math.sin(t * 0.6) + 1) / 2;
      const colors = ["#6366f1", "#a855f7", "#06b6d4"];
      for (let i = 0; i < 5; i++) {
        const r = (Math.min(w, h) * 0.1 + Math.min(w, h) * 0.08 * i) * (0.8 + pulse * 0.4);
        const hue = (i * 50 + t * 15) % 360;
        const g = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
        void colors;
        g.addColorStop(0, `hsla(${hue},80%,60%,${0.15 - i * 0.02})`);
        g.addColorStop(1, "transparent");
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = g; ctx.fill();
      }
    },
  };
}

function makeHexagons(): Anim {
  return {
    draw(ctx, w, h, t) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#020a18"; ctx.fillRect(0, 0, w, h);
      const size = Math.max(30, w / 22);
      const colStep = size * Math.sqrt(3);
      const rowStep = size * 1.5;
      for (let row = -1; row < h / rowStep + 2; row++) {
        for (let col = -1; col < w / colStep + 2; col++) {
          const x = col * colStep + (row % 2 === 0 ? 0 : colStep / 2);
          const y = row * rowStep;
          const phase = Math.sin(x * 0.015 + y * 0.01 + t * 0.6) * 0.5 + 0.5;
          const hue = (x * 0.1 + y * 0.08 + t * 15) % 360;
          ctx.beginPath();
          for (let a = 0; a < 6; a++) {
            const ang = (Math.PI / 3) * a - Math.PI / 6;
            const px = x + size * Math.cos(ang) * 0.92;
            const py = y + size * Math.sin(ang) * 0.92;
            a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.strokeStyle = `hsla(${hue},70%,55%,${phase * 0.6 + 0.05})`;
          ctx.lineWidth = 1; ctx.stroke();
          if (phase > 0.8) {
            ctx.fillStyle = `hsla(${hue},80%,60%,${(phase - 0.8) * 0.3})`;
            ctx.fill();
          }
        }
      }
    },
  };
}

function makeWaves(): Anim {
  return {
    draw(ctx, w, h, t) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#010a1a"; ctx.fillRect(0, 0, w, h);
      const N = 5;
      for (let i = 0; i < N; i++) {
        const hue = 200 + i * 25;
        const amp = h * 0.06 + i * h * 0.02;
        const yBase = h * (0.25 + i * 0.15);
        const speed = 0.5 + i * 0.15;
        ctx.beginPath(); ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 3) {
          const y = yBase
            + Math.sin(x * 0.008 - t * speed) * amp
            + Math.sin(x * 0.015 + t * speed * 0.6) * amp * 0.4;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h); ctx.closePath();
        const g = ctx.createLinearGradient(0, yBase - amp * 2, 0, yBase + amp * 3);
        g.addColorStop(0, `hsla(${hue},80%,60%,0.3)`);
        g.addColorStop(1, `hsla(${hue + 20},70%,40%,0)`);
        ctx.fillStyle = g; ctx.fill();
      }
    },
  };
}

function makePlasma(): Anim {
  return {
    draw(ctx, w, h, t) {
      ctx.clearRect(0, 0, w, h);
      const imageData = ctx.createImageData(w, h);
      const data = imageData.data;
      const scale = 0.008;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const v = Math.sin(x * scale + t)
            + Math.sin(y * scale + t * 0.7)
            + Math.sin((x + y) * scale * 0.7 + t * 1.2)
            + Math.sin(Math.sqrt((x - w / 2) ** 2 + (y - h / 2) ** 2) * scale + t * 0.5);
          const hue = (v + 4) / 8 * 280 + 160;
          const idx = (y * w + x) * 4;
          const r2 = Math.sin(hue * Math.PI / 180) * 60 + 60;
          const g2 = Math.sin((hue + 120) * Math.PI / 180) * 60 + 60;
          const b2 = Math.sin((hue + 240) * Math.PI / 180) * 60 + 120;
          data[idx] = r2; data[idx + 1] = g2; data[idx + 2] = b2; data[idx + 3] = 200;
        }
      }
      ctx.putImageData(imageData, 0, 0);
    },
  };
}

function makeTriangles(): Anim {
  type Tri = { x: number; y: number; size: number; angle: number; angSpeed: number; hue: number; alpha: number; alphaDir: number };
  let tris: Tri[] = [], pw = 0, ph = 0;
  return {
    draw(ctx, w, h, t) {
      if (pw !== w || ph !== h) {
        pw = w; ph = h;
        tris = Array.from({ length: 30 }, () => ({
          x: Math.random() * w, y: Math.random() * h,
          size: Math.random() * 80 + 20, angle: Math.random() * Math.PI * 2,
          angSpeed: (Math.random() - 0.5) * 0.01, hue: Math.random() * 120 + 200,
          alpha: Math.random() * 0.3 + 0.05, alphaDir: Math.random() > 0.5 ? 1 : -1,
        }));
      }
      ctx.fillStyle = "rgba(3,8,20,0.08)"; ctx.fillRect(0, 0, w, h);
      for (const tri of tris) {
        tri.angle += tri.angSpeed;
        tri.alpha += tri.alphaDir * 0.002;
        if (tri.alpha > 0.35 || tri.alpha < 0.03) tri.alphaDir *= -1;
        ctx.save(); ctx.translate(tri.x, tri.y); ctx.rotate(tri.angle);
        ctx.beginPath();
        ctx.moveTo(0, -tri.size / 2);
        ctx.lineTo(tri.size / 2, tri.size / 2);
        ctx.lineTo(-tri.size / 2, tri.size / 2);
        ctx.closePath();
        ctx.strokeStyle = `hsla(${tri.hue},70%,60%,${tri.alpha * 2})`;
        ctx.fillStyle = `hsla(${tri.hue},70%,50%,${tri.alpha})`;
        ctx.lineWidth = 1; ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      void t;
    },
  };
}

function makeBinaryRain(): Anim {
  type Col = { x: number; y: number; speed: number; bits: string[] };
  let cols: Col[] = [], pw = 0, ph = 0;
  return {
    draw(ctx, w, h, t) {
      if (pw !== w || ph !== h) {
        pw = w; ph = h;
        const sz = Math.max(11, w / 88);
        cols = Array.from({ length: Math.floor(w / sz) }, (_, i) => ({
          x: i * sz, y: -Math.random() * h,
          speed: Math.random() * 1.2 + 0.4,
          bits: Array.from({ length: Math.floor(h / sz) + 2 }, () => Math.random() > 0.5 ? "1" : "0"),
        }));
      }
      ctx.fillStyle = "rgba(0,5,15,0.16)"; ctx.fillRect(0, 0, w, h);
      const sz = Math.max(11, w / 88);
      ctx.font = `${sz}px monospace`;
      for (const col of cols) {
        col.y = (col.y + col.speed * 0.7 + h) % (h + sz * 4) - sz * 4;
        for (let i = 0; i < col.bits.length; i++) {
          const cy = col.y + i * sz;
          if (cy < -sz || cy > h + sz) continue;
          const frac = i / col.bits.length;
          ctx.fillStyle = i < 2
            ? `rgba(180,210,255,${1 - frac})`
            : `rgba(60,100,200,${(1 - frac) * 0.7})`;
          ctx.fillText(col.bits[i], col.x, cy);
        }
        if (Math.random() < 0.02) col.bits[Math.floor(Math.random() * col.bits.length)] = Math.random() > 0.5 ? "1" : "0";
      }
      void t;
    },
  };
}

function makeNeonLines(): Anim {
  type Seg = { x1: number; y1: number; x2: number; y2: number; hue: number; alpha: number; alphaDir: number; vx1: number; vy1: number; vx2: number; vy2: number };
  let segs: Seg[] = [], pw = 0, ph = 0;
  return {
    draw(ctx, w, h, t) {
      if (pw !== w || ph !== h) {
        pw = w; ph = h;
        segs = Array.from({ length: 18 }, () => ({
          x1: Math.random() * w, y1: Math.random() * h,
          x2: Math.random() * w, y2: Math.random() * h,
          hue: Math.random() * 360, alpha: Math.random() * 0.4 + 0.1, alphaDir: 1,
          vx1: (Math.random() - 0.5) * 0.5, vy1: (Math.random() - 0.5) * 0.5,
          vx2: (Math.random() - 0.5) * 0.5, vy2: (Math.random() - 0.5) * 0.5,
        }));
      }
      ctx.fillStyle = "rgba(2,8,20,0.1)"; ctx.fillRect(0, 0, w, h);
      for (const s of segs) {
        s.x1 = (s.x1 + s.vx1 + w) % w; s.y1 = (s.y1 + s.vy1 + h) % h;
        s.x2 = (s.x2 + s.vx2 + w) % w; s.y2 = (s.y2 + s.vy2 + h) % h;
        s.alpha += s.alphaDir * 0.003;
        if (s.alpha > 0.55 || s.alpha < 0.05) s.alphaDir *= -1;
        s.hue = (s.hue + 0.2) % 360;
        const g = ctx.createLinearGradient(s.x1, s.y1, s.x2, s.y2);
        g.addColorStop(0, `hsla(${s.hue},90%,65%,0)`);
        g.addColorStop(0.5, `hsla(${s.hue},90%,70%,${s.alpha})`);
        g.addColorStop(1, `hsla(${s.hue},90%,65%,0)`);
        ctx.strokeStyle = g; ctx.lineWidth = 2;
        ctx.shadowBlur = 8; ctx.shadowColor = `hsla(${s.hue},90%,60%,0.6)`;
        ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
      }
      ctx.shadowBlur = 0;
      void t;
    },
  };
}

function makeGalaxy(): Anim {
  return {
    draw(ctx, w, h, t) {
      ctx.fillStyle = "rgba(1,3,12,0.15)"; ctx.fillRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      const N = 400;
      for (let i = 0; i < N; i++) {
        const frac = i / N;
        const arm = i % 2;
        const angle = frac * Math.PI * 6 + arm * Math.PI + t * (0.15 - frac * 0.1);
        const r = frac * Math.min(w, h) * 0.42 + Math.random() * 8;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r * 0.45;
        const size = (1 - frac) * 2 + 0.3;
        const hue = 200 + frac * 100;
        ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue},80%,75%,${(1 - frac) * 0.7})`; ctx.fill();
      }
    },
  };
}

function makeCrystals(): Anim {
  return {
    draw(ctx, w, h, t) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#020b1a"; ctx.fillRect(0, 0, w, h);
      const N = 12;
      const gridW = w / N, gridH = h / N;
      for (let row = 0; row < N; row++) {
        for (let col = 0; col < N; col++) {
          const cx = col * gridW + gridW / 2;
          const cy = row * gridH + gridH / 2;
          const phase = (Math.sin(cx * 0.01 + t * 0.4) + Math.sin(cy * 0.012 - t * 0.3)) * 0.5 + 0.5;
          const hue = (cx * 0.15 + cy * 0.1 + t * 20) % 360;
          const size = Math.min(gridW, gridH) * 0.35 * (0.4 + phase * 0.6);
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 0.1 + row * 0.3);
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
            const px = Math.cos(a) * size, py = Math.sin(a) * size;
            i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.strokeStyle = `hsla(${hue},80%,65%,${0.4 + phase * 0.5})`;
          ctx.lineWidth = 1; ctx.stroke();
          ctx.restore();
        }
      }
    },
  };
}

function makeFire(): Anim {
  type Particle = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number };
  let particles: Particle[] = [], pw = 0, ph = 0;
  return {
    draw(ctx, w, h, t) {
      if (pw !== w || ph !== h) { pw = w; ph = h; particles = []; }
      ctx.fillStyle = "rgba(8,2,0,0.2)"; ctx.fillRect(0, 0, w, h);
      while (particles.length < 100) {
        particles.push({
          x: w * 0.3 + Math.random() * w * 0.4,
          y: h * 0.85 + Math.random() * h * 0.15,
          vx: (Math.random() - 0.5) * 1.5,
          vy: -(Math.random() * 3 + 1.5),
          life: 0, maxLife: Math.random() * 60 + 40,
          size: Math.random() * 12 + 4,
        });
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx + Math.sin(p.life * 0.2) * 0.5;
        p.y += p.vy; p.life++;
        if (p.life > p.maxLife) { particles.splice(i, 1); continue; }
        const prog = p.life / p.maxLife;
        const hue = 30 - prog * 30; const alpha = Math.sin(prog * Math.PI) * 0.9;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * (1 - prog * 0.5));
        g.addColorStop(0, `hsla(${hue + 20},100%,90%,${alpha})`);
        g.addColorStop(0.4, `hsla(${hue},100%,60%,${alpha * 0.8})`);
        g.addColorStop(1, `hsla(0,80%,20%,0)`);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - prog * 0.5), 0, Math.PI * 2);
        ctx.fillStyle = g; ctx.fill();
      }
      void t;
    },
  };
}

function makeLaserShow(): Anim {
  return {
    draw(ctx, w, h, t) {
      ctx.fillStyle = "rgba(2,5,18,0.14)"; ctx.fillRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      const N = 6;
      for (let i = 0; i < N; i++) {
        const angle = (i / N) * Math.PI * 2 + t * (0.4 + i * 0.05);
        const hue = (i / N) * 360 + t * 20;
        const len = Math.min(w, h) * 0.8;
        const ex = cx + Math.cos(angle) * len;
        const ey = cy + Math.sin(angle) * len;
        const g = ctx.createLinearGradient(cx, cy, ex, ey);
        g.addColorStop(0, `hsla(${hue},100%,80%,0.9)`);
        g.addColorStop(1, `hsla(${hue},100%,50%,0)`);
        ctx.strokeStyle = g; ctx.lineWidth = 1.5;
        ctx.shadowBlur = 12; ctx.shadowColor = `hsla(${hue},100%,60%,0.8)`;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke();
      }
      ctx.shadowBlur = 0;
      const gCenter = ctx.createRadialGradient(cx, cy, 0, cx, cy, 30);
      gCenter.addColorStop(0, "rgba(255,255,255,0.6)");
      gCenter.addColorStop(1, "transparent");
      ctx.beginPath(); ctx.arc(cx, cy, 30, 0, Math.PI * 2);
      ctx.fillStyle = gCenter; ctx.fill();
    },
  };
}

function makeMosaic(): Anim {
  return {
    draw(ctx, w, h, t) {
      ctx.clearRect(0, 0, w, h);
      const sz = Math.max(20, Math.floor(w / 48));
      for (let x = 0; x < w; x += sz) {
        for (let y = 0; y < h; y += sz) {
          const phase = Math.sin(x * 0.02 + y * 0.015 + t * 0.5)
            + Math.cos(x * 0.01 - y * 0.02 + t * 0.3);
          const hue = (x * 0.08 + y * 0.06 + t * 12) % 360;
          const light = 8 + (phase + 2) / 4 * 22;
          const alpha = 0.12 + (phase + 2) / 4 * 0.18;
          ctx.fillStyle = `hsla(${hue},70%,${light}%,${alpha})`;
          ctx.fillRect(x, y, sz - 1, sz - 1);
        }
      }
    },
  };
}

function makeDnaHelix(): Anim {
  return {
    draw(ctx, w, h, t) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#020a1a"; ctx.fillRect(0, 0, w, h);
      const cx = w / 2;
      const amp = w * 0.15;
      const freq = Math.PI * 2 / (h * 0.4);
      const speed = t * 1.2;
      const N = 60;
      for (let i = 0; i <= N; i++) {
        const y = (i / N) * h;
        const angle = freq * y + speed;
        const x1 = cx + Math.cos(angle) * amp;
        const x2 = cx + Math.cos(angle + Math.PI) * amp;
        const depth1 = (Math.cos(angle) + 1) / 2;
        const depth2 = (Math.cos(angle + Math.PI) + 1) / 2;
        const r1 = 3 + depth1 * 4, r2 = 3 + depth2 * 4;
        // Strand 1
        ctx.beginPath(); ctx.arc(x1, y, r1, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(210,90%,${50 + depth1 * 30}%,${0.6 + depth1 * 0.4})`; ctx.fill();
        // Strand 2
        ctx.beginPath(); ctx.arc(x2, y, r2, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(300,80%,${50 + depth2 * 30}%,${0.6 + depth2 * 0.4})`; ctx.fill();
        // Cross bars every 4 steps
        if (i % 4 === 0) {
          ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y);
          ctx.strokeStyle = `rgba(180,200,255,0.25)`; ctx.lineWidth = 1; ctx.stroke();
        }
      }
    },
  };
}

function makeScanlines(): Anim {
  return {
    draw(ctx, w, h, t) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#03071a"; ctx.fillRect(0, 0, w, h);
      // Noise overlay
      const imageData = ctx.createImageData(w, h);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const v = Math.random() * 12;
        data[i] = v; data[i + 1] = v; data[i + 2] = v + 5; data[i + 3] = 40;
      }
      ctx.putImageData(imageData, 0, 0);
      // Scanlines
      const lineH = 3;
      for (let y = 0; y < h; y += lineH * 2) {
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(0, y, w, lineH);
      }
      // Moving bright band
      const bandY = (t * 80 % (h + 100)) - 50;
      const bandG = ctx.createLinearGradient(0, bandY, 0, bandY + 80);
      bandG.addColorStop(0, "transparent");
      bandG.addColorStop(0.5, "rgba(100,150,255,0.06)");
      bandG.addColorStop(1, "transparent");
      ctx.fillStyle = bandG; ctx.fillRect(0, bandY, w, 80);
      // Vignette
      const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.8);
      vig.addColorStop(0, "transparent"); vig.addColorStop(1, "rgba(0,0,0,0.5)");
      ctx.fillStyle = vig; ctx.fillRect(0, 0, w, h);
    },
  };
}

function makeDarkPulse(): Anim {
  return {
    draw(ctx, w, h, t) {
      ctx.fillStyle = "rgba(2,5,18,0.12)"; ctx.fillRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      const N = 5;
      for (let i = 0; i < N; i++) {
        const phase = (t * 0.35 + i / N) % 1;
        const r = phase * Math.max(w, h) * 0.8;
        const alpha = Math.sin(phase * Math.PI) * 0.5;
        const hue = 230 + i * 15;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(${hue},70%,50%,${alpha})`;
        ctx.lineWidth = 3 - phase * 2; ctx.stroke();
      }
      // Center dark hole
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.35);
      g.addColorStop(0, "rgba(0,0,0,0.6)"); g.addColorStop(1, "transparent");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    },
  };
}

function makeCircuit(): Anim {
  type Line = { x: number; y: number; dir: number; len: number; progress: number; speed: number; hue: number };
  let lines: Line[] = [], pw = 0, ph = 0;
  return {
    draw(ctx, w, h, t) {
      if (pw !== w || ph !== h) {
        pw = w; ph = h;
        const step = Math.max(20, w / 36);
        lines = Array.from({ length: 40 }, () => {
          const gx = Math.floor(Math.random() * (w / step)) * step;
          const gy = Math.floor(Math.random() * (h / step)) * step;
          return {
            x: gx, y: gy, dir: Math.floor(Math.random() * 4),
            len: (Math.floor(Math.random() * 5) + 2) * step,
            progress: 0, speed: Math.random() * 2 + 1, hue: Math.random() * 60 + 180,
          };
        });
      }
      ctx.fillStyle = "rgba(2,10,20,0.08)"; ctx.fillRect(0, 0, w, h);
      const step = Math.max(20, w / 36);
      for (const ln of lines) {
        ln.progress = (ln.progress + ln.speed * 0.5) % (ln.len + step * 2);
        const drawn = Math.min(ln.progress, ln.len);
        const dx = ln.dir === 0 ? drawn : ln.dir === 2 ? -drawn : 0;
        const dy = ln.dir === 1 ? drawn : ln.dir === 3 ? -drawn : 0;
        if (drawn < 2) continue;
        const g = ctx.createLinearGradient(ln.x, ln.y, ln.x + dx, ln.y + dy);
        g.addColorStop(0, `hsla(${ln.hue},80%,55%,0.08)`);
        g.addColorStop(0.7, `hsla(${ln.hue},90%,65%,0.4)`);
        g.addColorStop(1, `hsla(${ln.hue},100%,80%,0.9)`);
        ctx.strokeStyle = g; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(ln.x, ln.y); ctx.lineTo(ln.x + dx, ln.y + dy); ctx.stroke();
        // Node dot at head
        const headX = ln.x + dx, headY = ln.y + dy;
        ctx.beginPath(); ctx.arc(headX, headY, 3, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${ln.hue},100%,80%,0.8)`; ctx.fill();
      }
      void t;
    },
  };
}

function makeParticlesMesh(): Anim {
  type P = { x: number; y: number; vx: number; vy: number };
  let pts: P[] = [], pw = 0, ph = 0;
  return {
    draw(ctx, w, h, t) {
      if (pw !== w || ph !== h) {
        pw = w; ph = h;
        pts = Array.from({ length: 55 }, () => ({
          x: Math.random() * w, y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5,
        }));
      }
      ctx.fillStyle = "rgba(3,8,22,0.15)"; ctx.fillRect(0, 0, w, h);
      for (const p of pts) {
        p.x = (p.x + p.vx + w) % w; p.y = (p.y + p.vy + h) % h;
      }
      const maxDist = w * 0.12;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < maxDist) {
            const alpha = (1 - dist / maxDist) * 0.5;
            ctx.strokeStyle = `rgba(99,140,255,${alpha})`;
            ctx.lineWidth = (1 - dist / maxDist) * 1.5;
            ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke();
          }
        }
      }
      for (const p of pts) {
        ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(140,170,255,0.8)"; ctx.fill();
      }
      void t;
    },
  };
}

function makeSnowfall(): Anim {
  type Flake = { x: number; y: number; r: number; speed: number; drift: number; phase: number };
  let flakes: Flake[] = [], pw = 0, ph = 0;
  return {
    draw(ctx, w, h, t) {
      if (pw !== w || ph !== h) {
        pw = w; ph = h;
        flakes = Array.from({ length: 100 }, () => ({
          x: Math.random() * w, y: Math.random() * h,
          r: Math.random() * 3 + 1, speed: Math.random() * 1 + 0.5,
          drift: Math.random() * 0.3 + 0.1, phase: Math.random() * Math.PI * 2,
        }));
      }
      ctx.fillStyle = "rgba(5,10,30,0.15)"; ctx.fillRect(0, 0, w, h);
      for (const f of flakes) {
        f.y = (f.y + f.speed * 0.5 + h) % (h + 10);
        f.x += Math.sin(t * f.drift + f.phase) * 0.4;
        if (f.x < 0) f.x += w; if (f.x > w) f.x -= w;
        const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
        g.addColorStop(0, "rgba(220,235,255,0.95)");
        g.addColorStop(1, "rgba(180,210,255,0)");
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fillStyle = g; ctx.fill();
      }
      void t;
    },
  };
}

// ─── Preset map ───────────────────────────────────────────────────────────────

const ANIM_MAP: Record<string, () => Anim> = {
  particles_blue: makeParticlesBlue,
  matrix_rain:    makeMatrixRain,
  neon_grid:      makeNeonGrid,
  pulse_rings:    makePulseRings,
  aurora:         makeAurora,
  starfield:      makeStarfield,
  bokeh:          makeBokeh,
  synthwave:      makeSynthwave,
  glitch:         makeGlitch,
  rain_drops:     makeRainDrops,
  vortex:         makeVortex,
  embers:         makeEmbers,
  breathing:      makeBreathing,
  hexagons:       makeHexagons,
  waves:          makeWaves,
  plasma:         makePlasma,
  triangles:      makeTriangles,
  binary_rain:    makeBinaryRain,
  neon_lines:     makeNeonLines,
  galaxy:         makeGalaxy,
  crystals:       makeCrystals,
  fire:           makeFire,
  laser_show:     makeLaserShow,
  mosaic:         makeMosaic,
  dna_helix:      makeDnaHelix,
  scanlines:      makeScanlines,
  dark_pulse:     makeDarkPulse,
  circuit:        makeCircuit,
  particles_mesh: makeParticlesMesh,
  snowfall:       makeSnowfall,
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
