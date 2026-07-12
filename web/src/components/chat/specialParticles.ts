// web/src/components/chat/specialParticles.ts
//
// Moteur de particules canvas porté du prototype "messages spéciaux du
// chat" (chat-events.html). Field = boucle rAF légère (émetteurs + burst
// initial), draw() dessine chaque forme, burst()/R() sont des helpers.
// mountFieldFor() reproduit le switch(kind) du prototype : uniquement les
// particules — timers et lecture DOM restent du ressort du composant React.

export type ParticleShape = "confetti" | "gem" | "coin" | "ember" | "spark" | "circle";

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  life: number;
  rot: number;
  vr: number;
  s: number;
  color: string;
  shape: ParticleShape;
}

interface Emitter {
  fn: (field: Field) => void;
  acc: number;
}

function reducedMotion(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion:reduce)").matches;
}

export class Field {
  cv: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  ps: Particle[] = [];
  emits: Emitter[] = [];
  last = 0;
  raf = 0;
  dpr: number;
  w = 0;
  h = 0;
  elapsed = 0;
  stopped = false;
  // Après ce délai (en "frames" ~60fps) les émetteurs continus sont coupés ;
  // la boucle rAF s'arrête ensuite dès que les particules restantes sont mortes.
  // Évite que N cartes empilées dans le flux fassent tourner N boucles à vie.
  static readonly EMIT_FRAMES = 260; // ~4.3s

  constructor(canvas: HTMLCanvasElement) {
    this.cv = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("specialParticles: 2D context unavailable");
    this.ctx = ctx;
    this.dpr = Math.min(2, (typeof devicePixelRatio !== "undefined" ? devicePixelRatio : 1) || 1);
    this.resize();
  }

  resize() {
    const r = this.cv.getBoundingClientRect();
    this.w = r.width || 300;
    this.h = r.height || 80;
    this.cv.width = this.w * this.dpr;
    this.cv.height = this.h * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  add(p: Particle) {
    if (this.ps.length < 80) this.ps.push(p);
  }

  emitter(fn: (field: Field) => void) {
    this.emits.push({ fn, acc: 0 });
  }

  start() {
    if (reducedMotion()) {
      this.resize();
      this.step(0, true);
      return;
    }
    this.last = performance.now();
    const loop = (t: number) => {
      this.step((t - this.last) / 16.67);
      this.last = t;
      if (!this.stopped) this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  step(dt: number, once?: boolean) {
    const c = this.ctx;
    c.clearRect(0, 0, this.w, this.h);
    if (!once) {
      this.elapsed += dt;
      if (this.elapsed > Field.EMIT_FRAMES && this.emits.length) this.emits.length = 0; // coupe les émetteurs
      for (const e of this.emits) {
        e.acc += dt;
        while (e.acc >= 1) {
          e.acc -= 1;
          e.fn(this);
        }
      }
      // plus d'émetteurs et plus de particules → on arrête la boucle
      if (!this.emits.length && this.ps.length === 0) {
        this.destroy();
        return;
      }
    }
    for (let i = this.ps.length - 1; i >= 0; i--) {
      const p = this.ps[i];
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      p.rot += p.vr * dt;
      if (p.life <= 0) {
        this.ps.splice(i, 1);
        continue;
      }
      const a = Math.min(1, p.life / 12);
      c.globalAlpha = a;
      draw(c, p);
    }
    c.globalAlpha = 1;
  }

  destroy() {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
  }
}

function draw(c: CanvasRenderingContext2D, p: Particle) {
  c.save();
  c.translate(p.x, p.y);
  c.rotate(p.rot);
  if (p.shape === "confetti") {
    c.fillStyle = p.color;
    c.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * .5);
  } else if (p.shape === "gem") {
    c.fillStyle = p.color;
    c.beginPath();
    c.moveTo(0, -p.s);
    c.lineTo(p.s * .8, -p.s * .2);
    c.lineTo(0, p.s);
    c.lineTo(-p.s * .8, -p.s * .2);
    c.closePath();
    c.fill();
  } else if (p.shape === "coin") {
    c.fillStyle = "#f5b622";
    c.strokeStyle = "#b8860b";
    c.beginPath();
    c.arc(0, 0, p.s, 0, 7);
    c.fill();
    c.stroke();
    c.fillStyle = "#7a5200";
    c.font = `900 ${p.s}px sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("€", 0, 1);
  } else if (p.shape === "ember") {
    c.fillStyle = p.color;
    c.shadowColor = p.color;
    c.shadowBlur = 6;
    c.beginPath();
    c.arc(0, 0, p.s, 0, 7);
    c.fill();
  } else {
    c.fillStyle = p.color;
    c.beginPath();
    c.arc(0, 0, p.s, 0, 7);
    c.fill();
  }
  c.restore();
}

function R(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

function rand<T>(a: T[]): T {
  return a[Math.floor(Math.random() * a.length)];
}

export interface BurstOptions {
  n?: number;
  x?: number;
  y?: number;
  colors: string | string[];
  shape?: ParticleShape;
  spread?: number;
  dir?: number;
  speed?: [number, number];
  g?: number;
  life?: [number, number];
  size?: [number, number];
}

export function burst(f: Field, opts: BurstOptions) {
  const {
    n = 26,
    x,
    y,
    colors,
    shape = "confetti",
    spread = Math.PI * 2,
    dir = -Math.PI / 2,
    speed = [1.5, 4],
    g = .14,
    life = [26, 46],
    size = [2, 4],
  } = opts;
  const px = x ?? f.w / 2;
  const py = y ?? f.h / 2;
  for (let i = 0; i < n; i++) {
    const ang = dir + R(-spread / 2, spread / 2);
    const sp = R(speed[0], speed[1]);
    f.add({
      x: px,
      y: py,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      g,
      life: R(life[0], life[1]),
      rot: R(0, 7),
      vr: R(-.3, .3),
      s: R(size[0], size[1]),
      color: Array.isArray(colors) ? rand(colors) : colors,
      shape,
    });
  }
}

/**
 * Configure les émetteurs/bursts pour un type d'event donné et démarre le
 * Field. Ne gère QUE les particules (pas de timers métier, pas de lecture
 * DOM) — ça reste la responsabilité du composant React appelant.
 */
export function mountFieldFor(kind: string, canvas: HTMLCanvasElement): Field {
  const f = new Field(canvas);
  const V = ["#7C4DFF", "#b39cff", "#c9b8ff"];
  const GOLD = ["#ffd54a", "#ffe89a", "#ff8a3d", "#fff"];
  const RUBY = ["#ff2d6b", "#ff6b9d", "#ffd1de"];
  const HOLO = ["#ff2d6b", "#f59e0b", "#ffd54a", "#34d399", "#38bdf8", "#a78bfa"];

  switch (kind) {
    case "raid":
      burst(f, { n: 16, y: f.h, colors: V, shape: "spark", dir: -Math.PI / 2, spread: Math.PI, speed: [2, 5], life: [20, 40], size: [1.5, 3] });
      f.emitter(x => { if (Math.random() > .6) x.add({ x: R(10, x.w - 10), y: x.h, vx: R(-.2, .2), vy: R(-.5, -1.1), g: -.004, life: R(30, 55), rot: 0, vr: 0, s: R(3, 7), color: "rgba(124,77,255,.5)", shape: "ember" }); });
      break;
    case "combo":
      burst(f, { n: 18, colors: GOLD, speed: [2, 5.5], life: [24, 46], size: [2, 4.5] });
      burst(f, { n: 10, colors: ["#fff", "#ffd54a"], shape: "spark", speed: [3, 6], g: 0, life: [12, 20], size: [1.5, 3] });
      break;
    case "sub":
      burst(f, { n: 18, colors: GOLD, y: f.h * .4, speed: [2, 5], life: [26, 50] });
      f.emitter(x => { if (Math.random() > .5) x.add({ x: R(0, x.w), y: R(0, x.h * .6), vx: 0, vy: R(.1, .4), g: 0, life: R(20, 40), rot: R(0, 7), vr: .1, s: R(1, 2.4), color: "#ffe89a", shape: "circle" }); });
      break;
    case "don":
      f.emitter(x => { if (Math.random() > .5) x.add({ x: R(6, x.w - 6), y: -6, vx: R(-.3, .3), vy: R(.6, 1.4), g: .05, life: R(50, 80), rot: R(0, 7), vr: R(-.2, .2), s: R(5, 8), color: "#f5b622", shape: "coin" }); });
      break;
    case "chest": {
      let t = 0;
      f.emitter(x => { t++; if (t % 150 < 8) { x.add({ x: x.w / 2 + R(-8, 8), y: x.h * .6, vx: R(-1.6, 1.6), vy: R(-2.6, -4), g: .16, life: R(30, 50), rot: R(0, 7), vr: R(-.3, .3), s: R(4, 7), color: Math.random() > .4 ? "#f5b622" : "#ff2d6b", shape: Math.random() > .4 ? "coin" : "gem" }); } });
      break;
    }
    case "rain":
      burst(f, { n: 14, colors: RUBY, shape: "gem", dir: -Math.PI / 2, spread: Math.PI, speed: [1, 3], life: [16, 30], size: [3, 5] });
      f.emitter(x => x.add({ x: R(0, x.w), y: -8, vx: R(-.2, .2), vy: R(1.6, 3), g: .04, life: R(40, 70), rot: R(0, 7), vr: R(-.25, .25), s: R(3.5, 6), color: rand(RUBY), shape: "gem" }));
      break;
    case "wheel":
      burst(f, { n: 16, colors: HOLO, speed: [2, 4.5], life: [24, 44] });
      break;
    case "predict":
      f.emitter(x => { if (Math.random() > .5) x.add({ x: x.w / 2 + R(-14, 14), y: x.h / 2 + R(-8, 8), vx: R(-.4, .4), vy: R(-.5, -1), g: -.01, life: R(24, 44), rot: 0, vr: 0, s: R(1, 2.4), color: "#a5b4fc", shape: "circle" }); });
      break;
    case "boss":
      burst(f, { n: 18, colors: ["#ef4444", "#f87171", "#f59e0b"], y: f.h, dir: -Math.PI / 2, spread: Math.PI * .8, speed: [2, 5], life: [20, 40] });
      f.emitter(x => x.add({ x: R(0, x.w), y: x.h + 4, vx: R(-.4, .4), vy: R(-1, -2.4), g: -.01, life: R(24, 46), rot: 0, vr: 0, s: R(2, 4.5), color: Math.random() > .5 ? "#ef4444" : "#f59e0b", shape: "ember" }));
      break;
    case "level":
      burst(f, { n: 18, colors: HOLO, speed: [2, 5], life: [26, 48] });
      f.emitter(x => { if (Math.random() > .5) x.add({ x: R(0, x.w), y: x.h, vx: 0, vy: R(-.6, -1.4), g: 0, life: R(30, 55), rot: R(0, 7), vr: .15, s: R(1.2, 2.6), color: rand(HOLO), shape: "circle" }); });
      break;
    default:
      break;
  }

  f.start();
  return f;
}
