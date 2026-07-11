// ── GALAXY (légendaire, rework moteur) ────────────────────────────────
// Boucle ~6.5 s : un micro trou noir traverse le pseudo — les lettres
// proches sont attirées, se penchent et s'étirent vers lui, des étoiles
// scintillent et une traînée stellaire suit son passage.
import gsap from "gsap";
import { Sprite } from "pixi.js";
import { registerEffect } from "../registry";
import { ParticlePool } from "../particles";
import { rampColor, rand, pick } from "../utils";
import type { FxEffectContext } from "../types";

const SPACE_RAMP: [number, number][] = [
  [0, 0x8b7bd8],
  [0.5, 0x818cf8],
  [1, 0x38bdf8],
];

registerEffect({
  id: "ufx-galaxy",
  label: "Galaxy (moteur)",
  rarity: "legendary",
  loopSeconds: 6.5,
  pad: { y: 1.5 },
  create(ctx: FxEffectContext) {
    const { graphemes, fontSize, intensity } = ctx;
    const n = graphemes.length || 1;
    const pool = new ParticlePool(ctx.runtime, ctx.front, Math.round(60 * intensity) || 25);
    const dot = ctx.runtime.dotTexture();
    const soft = ctx.runtime.softCircleTexture();
    const ring = ctx.runtime.ringTexture();
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

    // dégradé spatial statique par position + variation lente
    graphemes.forEach((g, i) => (g.text.tint = rampColor(SPACE_RAMP, i / Math.max(1, n - 1))));

    // trou noir : halo violet + disque sombre + anneau photon
    const bhHalo = new Sprite(soft);
    bhHalo.anchor.set(0.5);
    bhHalo.blendMode = "add";
    bhHalo.tint = 0x7c3aed;
    bhHalo.scale.set((fontSize * 1.15) / 32);
    const bhRing = new Sprite(ring);
    bhRing.anchor.set(0.5);
    bhRing.tint = 0xe9d5ff;
    bhRing.scale.set((fontSize * 0.52) / 20);
    const bh = new Sprite(soft);
    bh.anchor.set(0.5);
    bh.tint = 0x05030a;
    bh.alpha = 1;
    bh.scale.set((fontSize * 0.42) / 32);
    ctx.front.addChild(bhHalo, bh, bhRing);

    const emitStar = () => {
      const s = pool.spawn(dot);
      if (!s) return;
      s.blendMode = "add";
      s.tint = pick([0xffffff, 0xdbeafe, 0xe9d5ff]);
      s.alpha = 0;
      s.scale.set(rand(0.15, 0.35));
      s.position.set(rand(ctx.width * 0.08, ctx.width * 0.92), ctx.height / 2 + rand(-fontSize * 0.9, fontSize * 0.9));
      const tl2 = gsap.timeline({ onComplete: () => pool.release(s) });
      tl2.to(s, { alpha: rand(0.5, 0.95), duration: 0.25 }, 0);
      tl2.to(s, { alpha: 0, duration: 0.5 }, rand(0.5, 1.1));
      track(tl2);
    };
    const emitTrail = (x: number, y: number) => {
      const s = pool.spawn(dot);
      if (!s) return;
      s.blendMode = "add";
      s.tint = 0xa78bfa;
      s.alpha = 0.7;
      s.scale.set(rand(0.18, 0.34));
      s.position.set(x + rand(-3, 3), y + rand(-4, 4));
      const tl2 = gsap.timeline({ onComplete: () => pool.release(s) });
      tl2.to(s, { alpha: 0, duration: rand(0.5, 0.8) }, 0);
      track(tl2);
    };

    const tl = gsap.timeline({ repeat: -1 });

    // étoiles qui scintillent en continu
    for (let k = 0; k < 12; k++) tl.call(emitStar, undefined, k * 0.5);

    // traversée du trou noir (1 → 5.4)
    const bhP = { t: 0 };
    const startX = -fontSize * 0.8;
    const endX = ctx.width + fontSize * 0.8;
    tl.to(bhP, {
      t: 1,
      duration: 4.4,
      ease: "sine.inOut",
      onUpdate() {
        const bx = startX + (endX - startX) * bhP.t;
        const by = ctx.height / 2 - fontSize * 0.55;
        bhHalo.position.set(bx, by);
        bh.position.set(bx, by);
        bhRing.position.set(bx, by);
        bhRing.rotation += 0.05;
        // attraction : chaque lettre se penche/étire vers le trou noir
        for (const g of graphemes) {
          const gx = ctx.textLayer.x + g.homeX;
          const d = (bx - gx) / (fontSize * 1.6);
          const pull = Math.exp(-d * d); // gaussienne
          g.text.y = g.homeY - pull * fontSize * 0.34;
          g.text.rotation = Math.max(-0.5, Math.min(0.5, d)) * -0.35 * pull;
          g.text.scale.y = 1 + pull * 0.35;
          g.text.scale.x = 1 - pull * 0.12;
        }
        if (Math.random() < 0.35) emitTrail(bx, by);
      },
      onComplete() {
        for (const g of graphemes) {
          g.text.position.set(g.homeX, g.homeY);
          g.text.rotation = 0;
          g.text.scale.set(1);
        }
      },
    }, 1);
    // halo qui respire pendant la traversée
    tl.to(bhHalo, { alpha: 0.55, duration: 0.5 }, 1);
    tl.to(bhHalo, { alpha: 0, duration: 0.4 }, 5.1);
    tl.set(bh, { x: -fontSize * 2 }, 5.6);
    tl.set(bhRing, { x: -fontSize * 2 }, 5.6);

    tl.set({}, {}, 6.5);

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
        bh.destroy();
        bhHalo.destroy();
        bhRing.destroy();
      },
    };
  },
});
