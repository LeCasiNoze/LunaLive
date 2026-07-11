// ── ORAGE INTÉRIEUR (légendaire) ──────────────────────────────────────
// Boucle ~5.5 s : pseudo bleu-acier sous des nuées sombres — des arcs
// électriques claquent ENTRE les lettres à timing irrégulier (flash de la
// lettre touchée), puis un GRAND éclair traverse tout le pseudo.
import gsap from "gsap";
import { Graphics, Sprite } from "pixi.js";
import { registerEffect } from "../registry";
import { ParticlePool } from "../particles";
import { rampColor, rand } from "../utils";
import type { FxEffectContext } from "../types";

const FLASH_WHITE = 0xf3f8ff;
// dégradé électrique par position (retour Lucas : de la couleur)
const STEEL_RAMP: [number, number][] = [
  [0, 0x7da2c8],
  [0.5, 0xa8cbe8],
  [1, 0x6ee7f0],
];

registerEffect({
  id: "orage-interieur",
  label: "Orage Intérieur",
  rarity: "legendary",
  loopSeconds: 5.5,
  create(ctx: FxEffectContext) {
    const { graphemes, fontSize, intensity } = ctx;
    const n = graphemes.length || 1;
    const pool = new ParticlePool(ctx.runtime, ctx.front, 40);
    const soft = ctx.runtime.softCircleTexture();
    const loose = new Set<gsap.core.Animation>();
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

    const baseTints = graphemes.map((_, i) => rampColor(STEEL_RAMP, i / Math.max(1, n - 1)));
    graphemes.forEach((g, i) => (g.text.tint = baseTints[i]));

    // nuées sombres au-dessus du texte (dérive lente permanente)
    const clouds: Sprite[] = [];
    for (let i = 0; i < 3; i++) {
      const c = new Sprite(soft);
      c.anchor.set(0.5);
      c.tint = 0x33415e;
      c.alpha = 0.5;
      c.scale.set((fontSize * rand(1.6, 2.4)) / 32, (fontSize * 0.9) / 32);
      c.position.set(ctx.width * (0.25 + i * 0.25), ctx.height / 2 - fontSize * 0.95);
      ctx.behind.addChild(c);
      clouds.push(c);
      track(
        gsap.to(c, {
          x: c.x + rand(-14, 14),
          duration: rand(2.4, 3.6),
          ease: "sine.inOut",
          yoyo: true,
          repeat: -1,
        }),
      );
    }

    // couche des arcs électriques
    const bolt = new Graphics();
    ctx.front.addChild(bolt);

    /** dessine un arc en zigzag entre deux points (halo + cœur) */
    const drawArc = (x1: number, y1: number, x2: number, y2: number) => {
      bolt.clear();
      const steps = 5;
      const pts = [{ x: x1, y: y1 }];
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        pts.push({
          x: x1 + (x2 - x1) * t + rand(-3, 3),
          y: y1 + (y2 - y1) * t + rand(-fontSize * 0.28, fontSize * 0.28),
        });
      }
      pts.push({ x: x2, y: y2 });
      // halo
      bolt.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) bolt.lineTo(pts[i].x, pts[i].y);
      bolt.stroke({ width: 4.6, color: 0x7ea8ff, alpha: 0.45, cap: "round", join: "round" });
      // cœur
      bolt.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) bolt.lineTo(pts[i].x, pts[i].y);
      bolt.stroke({ width: 1.8, color: 0xeaf2ff, alpha: 1, cap: "round", join: "round" });
    };

    const zap = (big = false) => {
      const i = Math.floor(rand(0, n - 1));
      const j = big ? n - 1 : Math.min(n - 1, i + 1 + Math.floor(rand(0, 2)));
      const a = graphemes[big ? 0 : i];
      const b = graphemes[j];
      const y = ctx.height / 2 + rand(-fontSize * 0.2, fontSize * 0.2);
      drawArc(ctx.textLayer.x + a.homeX, y, ctx.textLayer.x + b.homeX, y + rand(-4, 4));
      bolt.alpha = 1;
      track(gsap.to(bolt, { alpha: 0, duration: big ? 0.55 : 0.3, ease: "power2.in" }));
      // flash des lettres touchées
      const targets = big ? graphemes : [a, b];
      for (const g of targets) {
        const back = baseTints[g.index];
        g.text.tint = FLASH_WHITE;
        track(
          gsap.to({ p: 0 }, {
            p: 1,
            duration: big ? 0.5 : 0.3,
            onComplete() {
              g.text.tint = back;
            },
          }),
        );
      }
      // lueur à l'impact
      const s = pool.spawn(soft);
      if (s) {
        s.blendMode = "add";
        s.tint = 0x9dc0ff;
        s.alpha = 0.7;
        s.scale.set(big ? 0.9 : 0.4);
        s.position.set(ctx.textLayer.x + b.homeX, y);
        const t2 = gsap.timeline({ onComplete: () => pool.release(s) });
        t2.to(s, { alpha: 0, duration: 0.35 }, 0);
        t2.to(s.scale, { x: s.scale.x * 1.8, y: s.scale.y * 1.8, duration: 0.35 }, 0);
        track(t2);
      }
    };

    // pluie fine permanente
    const emitRain = () => {
      const s = pool.spawn(soft);
      if (!s) return;
      s.tint = 0x93b4d8;
      s.alpha = 0.3;
      s.scale.set(0.07, 0.28);
      s.position.set(rand(ctx.width * 0.1, ctx.width * 0.9), ctx.height / 2 - fontSize * 1.1);
      const t2 = gsap.timeline({ onComplete: () => pool.release(s) });
      t2.to(s, { y: s.y + fontSize * 1.8, duration: rand(0.4, 0.6), ease: "none" }, 0);
      t2.to(s, { alpha: 0, duration: 0.15 }, 0.35);
      track(t2);
    };

    // timeline : petits claquements irréguliers + un grand coup à ~70%
    const tl = gsap.timeline({ repeat: -1 });
    for (let k = 0; k < 22; k++) tl.call(emitRain, undefined, 0.1 + k * 0.24);
    const zapTimes = [0.5, 0.95, 1.5, 2.05, 2.55, 2.9, 3.35];
    zapTimes.forEach((t) => tl.call(() => zap(false), undefined, t));
    tl.call(() => zap(true), undefined, 3.9);
    // grondement : micro-tremblement du texte au grand coup
    tl.to(ctx.textLayer, { y: ctx.textLayer.y + 1.5, duration: 0.05, repeat: 7, yoyo: true, ease: "none" }, 3.9);
    // respiration électrique de fond (les nuages s'éclairent faiblement)
    clouds.forEach((c, i) => {
      tl.to(c, { alpha: 0.75, duration: 0.3, yoyo: true, repeat: 1 }, 3.9 + i * 0.06);
    });
    tl.set({}, {}, 5.5);
    void intensity;

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
        tl.restart();
      },
      setQuality() {},
      destroy() {
        tl.kill();
        loose.forEach((a) => a.kill());
        loose.clear();
        pool.destroy();
        bolt.destroy();
        clouds.forEach((c) => c.destroy());
      },
    };
  },
});
