// ── FORGE CÉLESTE (mythique) ──────────────────────────────────────────
// Boucle ~8.5 s : le pseudo chauffe au rouge-blanc → TROIS coups de
// marteau (squash + onde de choc + gerbes d'étincelles) → trempe (vapeur,
// le métal vire au chrome froid) → un reflet balaye la lame → refonte.
import gsap from "gsap";
import { Graphics, Sprite } from "pixi.js";
import { registerEffect } from "../registry";
import { ParticlePool } from "../particles";
import { rampColor, rand, pick } from "../utils";
import type { FxEffectContext } from "../types";

const IRON = 0x7a828e;
const HEAT_RAMP: [number, number][] = [
  [0, 0x7a828e],
  [0.35, 0x9f1d1d],
  [0.7, 0xf97316],
  [1, 0xffe9c4],
];
const CHROME_RAMP: [number, number][] = [
  [0, 0xffe9c4],
  [0.5, 0xbfdbfe],
  [1, 0xe8f4ff],
];

registerEffect({
  id: "forge-celeste",
  label: "Forge Céleste",
  rarity: "mythic",
  loopSeconds: 9.8,
  create(ctx: FxEffectContext) {
    const { graphemes, fontSize, intensity } = ctx;
    const pool = new ParticlePool(ctx.runtime, ctx.front, Math.round(140 * intensity) || 50);
    const soft = ctx.runtime.softCircleTexture();
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

    graphemes.forEach((g) => (g.text.tint = IRON));

    // halo de chauffe derrière le texte
    const heat = new Sprite(soft);
    heat.anchor.set(0.5);
    heat.blendMode = "add";
    heat.tint = 0xff7a1a;
    heat.alpha = 0;
    heat.position.set(ctx.width / 2, ctx.height / 2);
    const n = graphemes.length || 1;
    const tw = graphemes[n - 1].homeX - graphemes[0].homeX + fontSize;
    heat.scale.set(Math.max(1, tw / 26), (fontSize * 2.2) / 32);
    ctx.behind.addChild(heat);

    // MARTEAU visible (v2, retour Lucas) : manche + tête, pivot au manche,
    // swing rapide sur chaque coup
    const hammer = new Graphics();
    const hs = fontSize / 26; // échelle relative
    hammer.roundRect(-2.4 * hs, -30 * hs, 4.8 * hs, 30 * hs, 2 * hs).fill({ color: 0x8a5a2b });
    hammer.roundRect(-10 * hs, -38 * hs, 20 * hs, 10 * hs, 2.5 * hs).fill({ color: 0x9aa4b2 });
    hammer.roundRect(-10 * hs, -38 * hs, 20 * hs, 3.5 * hs, 2 * hs).fill({ color: 0xc8d2de });
    hammer.alpha = 0;
    hammer.rotation = -1.25;
    ctx.front.addChild(hammer);

    // reflet chromé (sweep vertical étroit, devant le texte)
    const sheen = new Sprite(soft);
    sheen.anchor.set(0.5);
    sheen.blendMode = "add";
    sheen.tint = 0xffffff;
    sheen.alpha = 0;
    sheen.scale.set((fontSize * 0.5) / 32, (fontSize * 1.8) / 32);
    ctx.front.addChild(sheen);

    const sparks = (cx: number) => {
      const count = Math.round(rand(14, 18) * intensity);
      for (let i = 0; i < count; i++) {
        const s = pool.spawn(dot);
        if (!s) return;
        s.blendMode = "add";
        s.tint = pick([0xffd166, 0xff9e3d, 0xfff3c4]);
        s.alpha = 1;
        s.scale.set(rand(0.3, 0.6));
        s.position.set(cx + rand(-fontSize * 0.4, fontSize * 0.4), ctx.height / 2);
        const vx = rand(-fontSize, fontSize) * 1.1;
        const tl2 = gsap.timeline({ onComplete: () => pool.release(s) });
        tl2.to(s, { x: s.x + vx, duration: rand(0.5, 0.8), ease: "power1.out" }, 0);
        tl2.to(s, { y: s.y - rand(fontSize * 0.4, fontSize * 0.9), duration: 0.28, ease: "power1.out" }, 0);
        tl2.to(s, { y: `+=${fontSize * rand(0.9, 1.4)}`, duration: rand(0.4, 0.6), ease: "power1.in" }, 0.28);
        tl2.to(s, { alpha: 0, duration: 0.25 }, rand(0.45, 0.65));
        track(tl2);
      }
    };
    const shockwave = (cx: number) => {
      const s = pool.spawn(soft);
      if (!s) return;
      s.blendMode = "add";
      s.tint = 0xffdba8;
      s.alpha = 0.65;
      s.scale.set(0.15);
      s.position.set(cx, ctx.height / 2);
      const tl2 = gsap.timeline({ onComplete: () => pool.release(s) });
      tl2.to(s.scale, { x: 2.6, y: 1.1, duration: 0.4, ease: "power2.out" }, 0);
      tl2.to(s, { alpha: 0, duration: 0.4 }, 0.05);
      track(tl2);
    };
    const steam = () => {
      const s = pool.spawn(soft);
      if (!s) return;
      s.tint = 0xcfe8ff;
      s.alpha = 0.16;
      s.scale.set(rand(0.5, 0.8));
      s.position.set(rand(ctx.width * 0.2, ctx.width * 0.8), ctx.height / 2 - fontSize * 0.2);
      const tl2 = gsap.timeline({ onComplete: () => pool.release(s) });
      tl2.to(s, { y: s.y - fontSize * rand(0.9, 1.5), duration: rand(1, 1.6), ease: "sine.out" }, 0);
      tl2.to(s.scale, { x: s.scale.x * 2, y: s.scale.y * 2, duration: rand(1, 1.6) }, 0);
      tl2.to(s, { alpha: 0, duration: 0.6 }, 0.5);
      track(tl2);
    };

    const tl = gsap.timeline({ repeat: -1 });

    // Phase 1 — chauffe (0.4 → 2.2)
    const heatProxy = { p: 0 };
    tl.to(heatProxy, {
      p: 1,
      duration: 1.8,
      ease: "power1.in",
      onUpdate() {
        for (const g of graphemes) g.text.tint = rampColor(HEAT_RAMP, heatProxy.p);
      },
    }, 0.4);
    tl.to(heat, { alpha: 0.42 * intensity, duration: 1.6, ease: "sine.in" }, 0.6);

    // Phase 2 — trois coups de marteau (2.5 / 3.3 / 4.1)
    tl.to(hammer, { alpha: 1, duration: 0.25 }, 2.1);
    [2.5, 3.3, 4.1].forEach((at, k) => {
      const cx = ctx.width / 2 + (k - 1) * tw * 0.22;
      // le marteau se place, se lève, frappe (impact pile à `at`)
      tl.set(hammer, { x: cx + fontSize * 0.35, y: ctx.height / 2 - fontSize * 0.15 }, at - 0.35);
      tl.fromTo(hammer, { rotation: -1.25 }, { rotation: 0.12, duration: 0.14, ease: "power3.in" }, at - 0.14);
      tl.to(hammer, { rotation: -0.55, duration: 0.22, ease: "power2.out" }, at + 0.05);
      tl.call(() => {
        sparks(cx);
        shockwave(cx);
      }, undefined, at);
      // squash de l'enclume sur tout le pseudo
      graphemes.forEach((g) => {
        tl.to(g.text.scale, { y: 0.72, x: 1.08, duration: 0.07, ease: "power2.in" }, at);
        tl.to(g.text.scale, { y: 1, x: 1, duration: 0.45, ease: "elastic.out(1.2, 0.5)" }, at + 0.07);
      });
      tl.to(heat, { alpha: 0.6 * intensity, duration: 0.08, yoyo: true, repeat: 1 }, at);
    });

    // le marteau se retire
    tl.to(hammer, { alpha: 0, y: `-=${fontSize * 0.5}`, duration: 0.35 }, 4.5);

    // Phase 3 — trempe : vapeur + chrome froid (4.9 → 6.2)
    for (let k = 0; k < 7; k++) tl.call(steam, undefined, 4.9 + k * 0.16);
    tl.to(heat, { alpha: 0, duration: 0.7 }, 4.9);
    const chromeProxy = { p: 0 };
    tl.to(chromeProxy, {
      p: 1,
      duration: 1.1,
      ease: "sine.inOut",
      onUpdate() {
        for (const g of graphemes) g.text.tint = rampColor(CHROME_RAMP, chromeProxy.p);
      },
    }, 5.1);

    // Phase 4 — reflet qui balaye la lame (6.4 → 7.2)
    tl.set(sheen, { x: ctx.textLayer.x - fontSize, y: ctx.height / 2, alpha: 0.75 }, 6.4);
    tl.to(sheen, { x: ctx.textLayer.x + tw + fontSize, duration: 0.8, ease: "power1.inOut" }, 6.4);
    tl.to(sheen, { alpha: 0, duration: 0.2 }, 7.1);

    // Phase 5 — refonte : retour au fer froid (7.4 → 8.4)
    const meltProxy = { p: 0 };
    tl.to(meltProxy, {
      p: 1,
      duration: 0.7,
      ease: "sine.inOut",
      onUpdate() {
        for (const g of graphemes) g.text.tint = rampColor([[0, 0xe8f4ff], [1, IRON]], meltProxy.p);
      },
    }, 9.0);
    tl.set({}, {}, 9.8);

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
        heat.destroy();
        sheen.destroy();
        hammer.destroy();
      },
    };
  },
});
