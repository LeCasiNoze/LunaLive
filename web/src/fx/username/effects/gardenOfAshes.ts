// ── JARDIN DES CENDRES (mythique) ─────────────────────────────────────
// Boucle ~8.8 s : obsidienne fissurée → embrasement char par char →
// braises + fumée → désintégration en cendres → vide → racines qui
// retracent les lettres → végétalisation (feuilles, fleurs) → une fleur
// crache une étincelle qui retombe sur la 1re lettre → ré-embrasement.
import gsap from "gsap";
import { Graphics, Sprite } from "pixi.js";
import { registerEffect } from "../registry";
import { ParticlePool } from "../particles";
import { rampColor, rand, pick } from "../utils";
import type { FxEffectContext, FxGrapheme } from "../types";

const OBSIDIAN = 0x554a63;
const FIRE_RAMP: [number, number][] = [
  [0, 0x554a63],
  [0.28, 0x9f1d1d],
  [0.55, 0xea580c],
  [0.8, 0xfbbf24],
  [1, 0xfff3d6],
];
const ROOT_BROWN = 0x6b4a2c;
const PLANT_RAMP: [number, number][] = [
  [0, 0x6b4a2c],
  [0.5, 0x3f6b3a],
  [1, 0x86e29b],
];
const LEAF_TINTS = [0x4ade80, 0x67c26b, 0x86efac];
const FLOWER_TINTS = [0xf9a8d4, 0xfda4af, 0xfef3c7];

type Curve = { pts: { x: number; y: number }[]; delay: number };

registerEffect({
  id: "garden-of-ashes",
  label: "Jardin des Cendres",
  rarity: "mythic",
  loopSeconds: 10.4,
  create(ctx: FxEffectContext) {
    const { graphemes, fontSize, intensity } = ctx;
    const n = graphemes.length || 1;
    const stagger = Math.min(0.12, 1.3 / n);
    const pool = new ParticlePool(ctx.runtime, ctx.front, Math.round(160 * intensity) || 40);
    const smokePool = new ParticlePool(ctx.runtime, ctx.behind, 40);
    const loose = new Set<gsap.core.Animation>(); // tweens de particules hors timeline
    const soft = ctx.runtime.softCircleTexture();
    const dot = ctx.runtime.dotTexture();
    const leafTex = ctx.runtime.leafTexture();
    const petalTex = ctx.runtime.petalTexture();

    const track = (a: gsap.core.Animation) => {
      loose.add(a);
      // préserve le onComplete existant (release des particules !) au lieu
      // de l'écraser — sinon le pool fuit et se vide après la 1re boucle
      const prevDone = a.eventCallback("onComplete");
      a.eventCallback("onComplete", () => {
        prevDone?.();
        loose.delete(a);
      });
      return a;
    };

    // ── fissures (au-dessus du texte, visibles au repos) ──
    const cracks = new Graphics();
    ctx.front.addChild(cracks);
    const drawCracks = () => {
      cracks.clear();
      const y0 = ctx.height / 2;
      const x0 = ctx.width / 2 - (graphemes[n - 1].homeX + fontSize * 0.5 - graphemes[0].homeX) / 2;
      for (let k = 0; k < Math.max(2, Math.floor(n / 2)); k++) {
        const g = pick(graphemes);
        let x = ctx.textLayer.x + g.homeX + rand(-4, 4);
        let y = y0 - fontSize * 0.35;
        cracks.moveTo(x, y);
        for (let s = 0; s < 3; s++) {
          x += rand(-3, 5);
          y += rand(2, 5);
          cracks.lineTo(x, y);
        }
      }
      cracks.stroke({ width: 0.8, color: 0xff8a4a, alpha: 1 });
      void x0;
    };
    drawCracks();
    cracks.alpha = 0.4;

    // ── halo de chaleur derrière le texte (visible pendant la combustion) ──
    const heat = new Sprite(soft);
    heat.anchor.set(0.5);
    heat.blendMode = "add";
    heat.tint = 0xff7a1a;
    heat.alpha = 0;
    heat.position.set(ctx.width / 2, ctx.height / 2);
    const tw = graphemes[n - 1].homeX - graphemes[0].homeX + fontSize;
    heat.scale.set(Math.max(1, tw / 26), (fontSize * 2.4) / 32);
    ctx.behind.addChild(heat);

    // ── racines : polylignes précalculées par char (derrière le texte) ──
    const roots = new Graphics();
    ctx.behind.addChild(roots);
    const groundY = ctx.height / 2 + fontSize * 0.72;
    const curves: Curve[] = [];
    graphemes.forEach((g, i) => {
      const baseX = ctx.textLayer.x + g.homeX;
      const nCurves = 1 + (i % 2);
      for (let c = 0; c < nCurves; c++) {
        const sx = baseX + rand(-fontSize * 0.5, fontSize * 0.5);
        const pts = [{ x: sx, y: groundY + 3 }];
        const steps = 4;
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          pts.push({
            x: sx + (baseX - sx) * t + rand(-2.5, 2.5),
            y: groundY + 3 - (groundY + 3 - (ctx.height / 2 + fontSize * 0.1)) * t,
          });
        }
        curves.push({ pts, delay: i * stagger * 0.55 + c * 0.05 });
      }
    });
    const rootProxy = { p: 0 };
    const drawRoots = () => {
      roots.clear();
      if (rootProxy.p <= 0) return;
      for (const cu of curves) {
        const local = Math.max(0, Math.min(1, (rootProxy.p - cu.delay) / 0.55));
        if (local <= 0) continue;
        const count = Math.max(1, Math.floor(cu.pts.length * local));
        roots.moveTo(cu.pts[0].x, cu.pts[0].y);
        for (let i = 1; i <= Math.min(count, cu.pts.length - 1); i++) {
          roots.lineTo(cu.pts[i].x, cu.pts[i].y);
        }
        roots.stroke({
          width: 1.6,
          color: rampColor(PLANT_RAMP, local),
          alpha: 0.95 * local,
          cap: "round",
        });
        // repart sur un chemin vierge — sinon chaque stroke() re-trace TOUT
        // le path accumulé (traits parasites multicolores)
        roots.beginPath();
      }
    };

    // ── feuilles + fleurs persistantes (réanimées à chaque boucle) ──
    const foliage: Sprite[] = [];
    const flowers: Sprite[] = [];
    const foliageCount = Math.min(8, Math.max(4, n));
    for (let i = 0; i < foliageCount; i++) {
      const s = new Sprite(leafTex);
      s.anchor.set(0.1, 0.9);
      s.tint = pick(LEAF_TINTS);
      s.alpha = 0;
      ctx.front.addChild(s);
      foliage.push(s);
    }
    for (let i = 0; i < 3; i++) {
      const s = new Sprite(petalTex);
      s.anchor.set(0.5);
      s.tint = pick(FLOWER_TINTS);
      s.alpha = 0;
      ctx.front.addChild(s);
      flowers.push(s);
    }
    const placeFoliage = () => {
      foliage.forEach((s) => {
        const g = pick(graphemes);
        s.position.set(
          ctx.textLayer.x + g.homeX + rand(-fontSize * 0.4, fontSize * 0.4),
          ctx.height / 2 + rand(-fontSize * 0.1, fontSize * 0.45),
        );
        s.rotation = rand(-1.2, 1.2);
        s.scale.set(0);
        s.alpha = 0;
      });
      flowers.forEach((s) => {
        const g = pick(graphemes);
        s.position.set(
          ctx.textLayer.x + g.homeX + rand(-3, 3),
          ctx.height / 2 - fontSize * rand(0.35, 0.55),
        );
        s.scale.set(0);
        s.alpha = 0;
      });
    };
    placeFoliage();

    // ── particules ──
    const emitEmber = (g: FxGrapheme) => {
      const s = pool.spawn(Math.random() < 0.5 ? soft : dot);
      if (!s) return;
      s.blendMode = "add";
      s.tint = pick([0xffb066, 0xff7a1a, 0xffd166]);
      const sc = rand(0.12, 0.3);
      s.scale.set(sc);
      s.alpha = rand(0.7, 1);
      s.position.set(ctx.textLayer.x + g.homeX + rand(-4, 4), ctx.height / 2 + rand(-6, 2));
      track(
        gsap.to(s, {
          y: s.y - rand(fontSize * 0.9, fontSize * 1.8),
          x: s.x + rand(-8, 8),
          alpha: 0,
          duration: rand(0.7, 1.3),
          ease: "power1.out",
          onComplete: () => pool.release(s),
        }),
      );
    };
    const emitSmoke = (g: FxGrapheme) => {
      const s = smokePool.spawn(soft);
      if (!s) return;
      s.tint = 0x4a4a52;
      s.alpha = 0.12;
      s.scale.set(rand(0.4, 0.7));
      s.position.set(ctx.textLayer.x + g.homeX + rand(-5, 5), ctx.height / 2 - fontSize * 0.3);
      const tl2 = gsap.timeline({ onComplete: () => smokePool.release(s) });
      tl2.to(s, { y: s.y - fontSize * rand(1, 1.7), x: s.x + rand(-6, 10), duration: rand(1.2, 1.9), ease: "sine.out" }, 0);
      tl2.to(s.scale, { x: s.scale.x * 2.2, y: s.scale.y * 2.2, duration: rand(1.2, 1.9), ease: "sine.out" }, 0);
      tl2.to(s, { alpha: 0, duration: 0.8 }, 0.5);
      track(tl2);
    };
    const burstAshes = (g: FxGrapheme) => {
      const count = Math.round(rand(10, 16) * intensity);
      for (let i = 0; i < count; i++) {
        const s = pool.spawn(dot);
        if (!s) return;
        s.tint = pick([0xb8b8c2, 0x8a8a92, 0xd4874a, 0x6b6b74, 0xe8e8ee]);
        s.alpha = rand(0.75, 1);
        s.scale.set(rand(0.4, 0.85));
        s.position.set(
          ctx.textLayer.x + g.homeX + rand(-fontSize * 0.28, fontSize * 0.28),
          ctx.height / 2 + rand(-fontSize * 0.35, fontSize * 0.3),
        );
        const drift = rand(4, 16);
        const tl2 = gsap.timeline({ onComplete: () => pool.release(s) });
        tl2.to(s, { x: s.x + drift, duration: rand(1.1, 1.7), ease: "none" }, 0);
        tl2.to(s, { y: s.y - rand(6, 18), duration: 0.4, ease: "power1.out" }, 0);
        tl2.to(s, { y: `+=${rand(16, 30)}`, duration: rand(0.9, 1.4), ease: "power1.in" }, 0.4);
        tl2.to(s, { alpha: 0, duration: 0.6 }, rand(0.7, 1));
        track(tl2);
      }
    };

    // ── timeline maître ──
    const tl = gsap.timeline({ repeat: -1, onRepeat: placeFoliage });

    // Phase 1 — repos obsidienne (fissures qui respirent)
    graphemes.forEach((g) => {
      g.text.tint = OBSIDIAN;
      g.text.alpha = 1;
    });
    tl.to(cracks, { alpha: 0.75, duration: 0.45, ease: "sine.inOut" }, 0.1);
    tl.to(cracks, { alpha: 0.35, duration: 0.45, ease: "sine.inOut" }, 0.55);

    // Phase 2-3 — embrasement char par char + braises + fumée
    graphemes.forEach((g, i) => {
      const at = 0.7 + i * stagger;
      const proxy = { p: 0 };
      tl.to(
        proxy,
        {
          p: 1,
          duration: 0.9,
          ease: "power1.in",
          onUpdate() {
            g.text.tint = rampColor(FIRE_RAMP, proxy.p);
          },
        },
        at,
      );
      // shake de combustion
      tl.to(g.text, { x: g.homeX + 1, duration: 0.05, repeat: 9, yoyo: true, ease: "none" }, at + 0.5);
      // braises échelonnées ; fumée sur un char sur deux seulement
      for (let k = 0; k < 3; k++) tl.call(() => emitEmber(g), undefined, at + 0.4 + k * 0.35);
      if (i % 2 === 0) tl.call(() => emitSmoke(g), undefined, at + 0.7);
    });
    tl.to(cracks, { alpha: 0, duration: 0.5 }, 0.9);
    tl.to(heat, { alpha: 0.4 * intensity, duration: 1.2, ease: "sine.in" }, 1.0);

    // Phase 4 — désintégration en cendres
    const burnEnd = 0.7 + (n - 1) * stagger + 1.0;
    tl.to(heat, { alpha: 0, duration: 0.8, ease: "sine.out" }, burnEnd);
    graphemes.forEach((g, i) => {
      const at = burnEnd + i * stagger * 0.8;
      tl.call(() => burstAshes(g), undefined, at);
      tl.to(g.text, { alpha: 0, duration: 0.4, ease: "power1.in" }, at);
      tl.to(g.text.scale, { y: 0.72, duration: 0.4, ease: "power1.in" }, at);
    });

    // Phase 5 — vide (fumée résiduelle déjà en fade)
    const voidAt = burnEnd + n * stagger * 0.8 + 0.5;

    // Phase 6 — racines qui retracent les lettres
    tl.to(
      rootProxy,
      { p: 1.4, duration: 1.5, ease: "sine.inOut", onUpdate: drawRoots },
      voidAt,
    );

    // Phase 7 — végétalisation : les lettres renaissent en plante
    const growAt = voidAt + 0.9;
    graphemes.forEach((g, i) => {
      const at = growAt + i * stagger * 0.7;
      const proxy = { p: 0 };
      tl.to(g.text.scale, { y: 1, x: 1, duration: 0.45, ease: "back.out(1.6)" }, at);
      tl.to(
        proxy,
        {
          p: 1,
          duration: 0.7,
          ease: "sine.out",
          onStart() {
            g.text.tint = ROOT_BROWN;
          },
          onUpdate() {
            g.text.alpha = Math.min(1, proxy.p * 1.4);
            g.text.tint = rampColor(PLANT_RAMP, proxy.p);
          },
        },
        at,
      );
    });
    foliage.forEach((s, i) => {
      const at = growAt + 0.3 + i * 0.08;
      tl.to(s, { alpha: 0.95, duration: 0.3 }, at);
      tl.to(s.scale, { x: rand(0.8, 1.15), y: rand(0.8, 1.15), duration: 0.5, ease: "back.out(2)" }, at);
    });
    flowers.forEach((s, i) => {
      const at = growAt + 0.7 + i * 0.12;
      tl.to(s, { alpha: 1, duration: 0.25 }, at);
      tl.to(s.scale, { x: 1, y: 1, duration: 0.45, ease: "back.out(2.4)" }, at);
    });

    // Phase 8 — l'étincelle : une fleur crache une braise qui retombe sur
    // la première lettre
    const sparkAt = growAt + 1.7;
    tl.call(
      () => {
        const src = flowers[0];
        const dst = graphemes[0];
        const s = pool.spawn(dot);
        if (!s) return;
        s.blendMode = "add";
        s.tint = 0xffd166;
        s.scale.set(0.5);
        s.position.set(src.x, src.y);
        const tx = ctx.textLayer.x + dst.homeX;
        const ty = ctx.height / 2;
        const tl2 = gsap.timeline({
          onComplete: () => {
            pool.release(s);
            // mini flash à l'impact
            const f = pool.spawn(soft);
            if (f) {
              f.blendMode = "add";
              f.tint = 0xffb066;
              f.alpha = 0.9;
              f.scale.set(0.2);
              f.position.set(tx, ty);
              const t3 = gsap.timeline({ onComplete: () => pool.release(f) });
              t3.to(f.scale, { x: 1.5, y: 1.5, duration: 0.35, ease: "power2.out" }, 0);
              t3.to(f, { alpha: 0, duration: 0.35 }, 0.05);
              track(t3);
            }
          },
        });
        tl2.to(s, { x: tx, duration: 0.8, ease: "none" }, 0);
        tl2.to(s, { y: src.y - fontSize * 0.7, duration: 0.36, ease: "power1.out" }, 0);
        tl2.to(s, { y: ty, duration: 0.44, ease: "power1.in" }, 0.36);
        track(tl2);
      },
      undefined,
      sparkAt,
    );

    // Phase 9 — fleurs et racines fanent VITE après l'étincelle : pendant
    // la pause de lecture, seul le pseudo VERT reste (retour Lucas)
    const cleanAt = sparkAt + 0.9;
    foliage.concat(flowers).forEach((s, i) => {
      tl.to(s, { alpha: 0, y: `+=${4}`, duration: 0.4, ease: "power1.in" }, cleanAt + i * 0.02);
    });
    tl.to(rootProxy, { p: 0, duration: 0.5, ease: "power1.in", onUpdate: drawRoots }, cleanAt);
    const fadeAt = sparkAt + 2.8;
    graphemes.forEach((g, i) => {
      const proxy = { p: 1 };
      tl.to(
        proxy,
        {
          p: 0,
          duration: 0.55,
          ease: "sine.inOut",
          onUpdate() {
            g.text.tint = rampColor(PLANT_RAMP, proxy.p);
          },
          onComplete() {
            g.text.tint = OBSIDIAN;
          },
        },
        fadeAt + 0.15 + i * 0.02,
      );
    });
    tl.to(cracks, { alpha: 0.4, duration: 0.5 }, fadeAt + 0.4);
    // petit tampon avant la reboucle
    tl.set({}, {}, fadeAt + 0.9);

    return {
      play() {
        tl.play();
        loose.forEach((a) => a.play());
      },
      pause() {
        tl.pause();
        loose.forEach((a) => a.pause());
      },
      restart() {
        pool.releaseAll();
        smokePool.releaseAll();
        loose.forEach((a) => a.kill());
        loose.clear();
        tl.restart();
      },
      setQuality(q) {
        pool.setCap(q === "low" ? 40 : q === "medium" ? 100 : 160);
      },
      destroy() {
        tl.kill();
        loose.forEach((a) => a.kill());
        loose.clear();
        pool.destroy();
        smokePool.destroy();
        cracks.destroy();
        roots.destroy();
        heat.destroy();
        foliage.concat(flowers).forEach((s) => s.destroy());
      },
    };
  },
});
