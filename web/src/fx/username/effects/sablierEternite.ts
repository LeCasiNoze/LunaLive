// ── SABLIER D'ÉTERNITÉ (mythique) ─────────────────────────────────────
// Boucle ~8 s : les lettres s'effritent une à une en sable doré qui coule
// et s'accumule en tas → un tourbillon soulève le sable en spirale → les
// lettres se re-sculptent → shimmer doré.
import gsap from "gsap";
import { Graphics } from "pixi.js";
import { registerEffect } from "../registry";
import { ParticlePool } from "../particles";
import { rampColor, rand, pick } from "../utils";
import type { FxEffectContext, FxGrapheme } from "../types";

const SAND = 0xd9b36a;
const SAND_RAMP: [number, number][] = [
  [0, 0xd9b36a],
  [0.6, 0xf0d59a],
  [1, 0xfff1cc],
];
const GRAIN_TINTS = [0xd9b36a, 0xc49a4e, 0xf0d59a, 0xb8863b];

registerEffect({
  id: "sablier-eternite",
  label: "Sablier d'Éternité",
  rarity: "mythic",
  loopSeconds: 8.9,
  pad: { y: 1.6 },
  create(ctx: FxEffectContext) {
    const { graphemes, fontSize, intensity } = ctx;
    const n = graphemes.length || 1;
    const pool = new ParticlePool(ctx.runtime, ctx.front, Math.round(150 * intensity) || 60);
    const dot = ctx.runtime.dotTexture();
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

    graphemes.forEach((g) => (g.text.tint = SAND));

    // tas de sable (ellipse qui grossit/rétrécit)
    const pileY = ctx.height / 2 + fontSize * 0.78;
    const pile = new Graphics();
    ctx.behind.addChild(pile);
    const pileState = { h: 0 };
    const cx0 = ctx.textLayer.x + graphemes[0].homeX;
    const cx1 = ctx.textLayer.x + graphemes[n - 1].homeX;
    const drawPile = () => {
      pile.clear();
      if (pileState.h <= 0.01) return;
      const w = (cx1 - cx0) * 0.6 + fontSize;
      pile.ellipse((cx0 + cx1) / 2, pileY, (w / 2) * (0.5 + pileState.h * 0.5), fontSize * 0.3 * pileState.h)
        .fill({ color: 0xb8863b, alpha: 0.9 });
      pile.ellipse((cx0 + cx1) / 2, pileY - fontSize * 0.08 * pileState.h, (w / 2.6) * (0.5 + pileState.h * 0.5), fontSize * 0.2 * pileState.h)
        .fill({ color: 0xd9b36a, alpha: 0.9 });
    };

    // grain qui coule d'une lettre vers le tas
    const pour = (g: FxGrapheme) => {
      const count = Math.round(10 * intensity);
      for (let i = 0; i < count; i++) {
        const s = pool.spawn(dot);
        if (!s) return;
        s.tint = pick(GRAIN_TINTS);
        s.alpha = rand(0.7, 1);
        s.scale.set(rand(0.22, 0.42));
        s.position.set(
          ctx.textLayer.x + g.homeX + rand(-fontSize * 0.25, fontSize * 0.25),
          ctx.height / 2 + rand(-fontSize * 0.3, fontSize * 0.2),
        );
        const tl2 = gsap.timeline({ delay: rand(0, 0.25), onComplete: () => pool.release(s) });
        tl2.to(s, { y: pileY - rand(0, 3), duration: rand(0.45, 0.7), ease: "power1.in" }, 0);
        tl2.to(s, { x: s.x + rand(-4, 4), duration: rand(0.45, 0.7), ease: "none" }, 0);
        tl2.to(s, { alpha: 0, duration: 0.12 }, ">-0.1");
        track(tl2);
      }
    };

    // grain soulevé en spirale par le tourbillon (doré, lumineux)
    const whirl = () => {
      const s = pool.spawn(dot);
      if (!s) return;
      s.blendMode = "add";
      s.tint = pick([0xffd85e, 0xf0d59a, 0xfff1cc]);
      s.alpha = 0.95;
      s.scale.set(rand(0.24, 0.42));
      const cx = (cx0 + cx1) / 2 + rand(-fontSize, fontSize);
      const p = { t: 0 };
      s.position.set(cx, pileY);
      const dur = rand(0.8, 1.2);
      const radius = rand(fontSize * 0.3, fontSize * 0.9);
      const turns = rand(2, 3.4);
      const tl2 = gsap.timeline({ onComplete: () => pool.release(s) });
      tl2.to(p, {
        t: 1,
        duration: dur,
        ease: "power1.out",
        onUpdate() {
          s.position.set(
            cx + Math.sin(p.t * Math.PI * 2 * turns) * radius * (1 - p.t * 0.4),
            pileY - p.t * fontSize * 1.9,
          );
        },
      }, 0);
      tl2.to(s, { alpha: 0, duration: 0.25 }, dur - 0.25);
      track(tl2);
    };

    const tl = gsap.timeline({ repeat: -1 });

    // Phase 1 — effritement char par char, le sable coule, le tas monte
    graphemes.forEach((g, i) => {
      const at = 0.7 + i * 0.16;
      tl.call(() => pour(g), undefined, at);
      tl.to(g.text, { alpha: 0, duration: 0.5, ease: "power1.in" }, at + 0.1);
      tl.to(g.text.scale, { y: 0.6, duration: 0.5, ease: "power1.in" }, at + 0.1);
      tl.to(g.text, { y: g.homeY + fontSize * 0.18, duration: 0.5, ease: "power1.in" }, at + 0.1);
    });
    tl.to(pileState, { h: 1, duration: 0.7 + n * 0.16, ease: "sine.out", onUpdate: drawPile }, 0.8);

    // Phase 2 — le tourbillon soulève le sable, le tas se vide
    const whirlAt = 0.7 + n * 0.16 + 0.7;
    for (let k = 0; k < Math.round(32 * intensity); k++) {
      tl.call(whirl, undefined, whirlAt + k * 0.05);
    }
    tl.to(pileState, { h: 0, duration: 1.6, ease: "sine.inOut", onUpdate: drawPile }, whirlAt + 0.3);

    // Phase 3 — re-sculpture des lettres (dans l'ordre inverse)
    const rebuildAt = whirlAt + 1.2;
    graphemes.forEach((g, i) => {
      const at = rebuildAt + (n - 1 - i) * 0.09;
      tl.to(g.text, { alpha: 1, y: g.homeY, duration: 0.4, ease: "power2.out" }, at);
      tl.fromTo(g.text.scale, { y: 1.25, x: 0.85 }, { x: 1, y: 1, duration: 0.45, ease: "back.out(2)" }, at);
    });

    // Phase 4 — shimmer doré puis retour au sable mat
    const shineAt = rebuildAt + n * 0.09 + 0.3;
    graphemes.forEach((g, i) => {
      const proxy = { p: 0 };
      tl.to(proxy, {
        p: 1,
        duration: 0.5,
        ease: "sine.inOut",
        yoyo: true,
        repeat: 1,
        onUpdate() {
          g.text.tint = rampColor(SAND_RAMP, proxy.p);
        },
      }, shineAt + i * 0.05);
    });
    tl.set({}, {}, shineAt + n * 0.05 + 2.3);

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
        loose.forEach((a) => a.kill());
        loose.clear();
        tl.restart();
      },
      setQuality() {},
      destroy() {
        tl.kill();
        loose.forEach((a) => a.kill());
        loose.clear();
        pool.destroy();
        pile.destroy();
      },
    };
  },
});
