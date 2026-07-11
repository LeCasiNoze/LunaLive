// ── ÉVEIL LUNAIRE (mythique, identité LunaLive) ───────────────────────
// Boucle ~8 s : nuit calme → une lune se lève en arc au-dessus du pseudo →
// son passage argente les lettres une à une, qui se mettent à léviter dans
// une poussière d'étoiles → apogée lumineuse → la lune se couche, les
// lettres s'éteignent et se reposent.
import gsap from "gsap";
import { Sprite } from "pixi.js";
import { registerEffect } from "../registry";
import { ParticlePool } from "../particles";
import { rampColor, rand } from "../utils";
import type { FxEffectContext } from "../types";

const NIGHT = 0x5d6472;
const SILVER_RAMP: [number, number][] = [
  [0, 0x5d6472],
  [0.5, 0xaab6c8],
  [0.85, 0xe8ecf5],
  [1, 0xffffff],
];

registerEffect({
  id: "eveil-lunaire",
  label: "Éveil Lunaire",
  // rétrogradé mythic→legendary (verdict Lucas)
  rarity: "legendary",
  loopSeconds: 9.6,
  pad: { y: 2.1 },
  create(ctx: FxEffectContext) {
    const { graphemes, fontSize, intensity } = ctx;
    const n = graphemes.length || 1;
    const pool = new ParticlePool(ctx.runtime, ctx.front, Math.round(80 * intensity) || 30);
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

    // la lune : disque doux + cœur plus net
    const moonHalo = new Sprite(soft);
    moonHalo.anchor.set(0.5);
    moonHalo.blendMode = "add";
    moonHalo.tint = 0xbfd7ff;
    moonHalo.scale.set((fontSize * 2.0) / 32);
    const moon = new Sprite(soft);
    moon.anchor.set(0.5);
    moon.tint = 0xe9f0ff;
    moon.scale.set((fontSize * 0.95) / 32);
    ctx.behind.addChild(moonHalo, moon);

    const startX = ctx.width * 0.12;
    const endX = ctx.width * 0.88;
    const lowY = ctx.height / 2 + fontSize * 1.6;
    const highY = ctx.height / 2 - fontSize * 1.45;
    const setMoon = (x: number, y: number, a: number) => {
      moon.position.set(x, y);
      moonHalo.position.set(x, y);
      moon.alpha = a * 0.92;
      moonHalo.alpha = a * 0.38;
    };
    setMoon(startX, lowY, 0);

    graphemes.forEach((g) => (g.text.tint = NIGHT));

    const emitStar = () => {
      const s = pool.spawn(dot);
      if (!s) return;
      s.blendMode = "add";
      s.tint = 0xdbe7ff;
      s.alpha = 0;
      s.scale.set(rand(0.18, 0.4));
      s.position.set(rand(ctx.width * 0.1, ctx.width * 0.9), ctx.height / 2 + rand(-4, fontSize * 0.6));
      const tl2 = gsap.timeline({ onComplete: () => pool.release(s) });
      tl2.to(s, { alpha: rand(0.5, 0.9), duration: 0.4 }, 0);
      tl2.to(s, { y: s.y - rand(fontSize * 0.8, fontSize * 1.6), duration: rand(1.4, 2.2), ease: "sine.out" }, 0);
      tl2.to(s, { alpha: 0, duration: 0.6 }, rand(1, 1.6));
      track(tl2);
    };

    const tl = gsap.timeline({ repeat: -1 });

    // lever de lune en arc (x linéaire, y en cloche via deux tweens)
    const moonProxy = { t: 0 };
    tl.to(
      moonProxy,
      {
        t: 1,
        duration: 6.4,
        ease: "none",
        onUpdate() {
          const t = moonProxy.t;
          const x = startX + (endX - startX) * t;
          const y = lowY - (lowY - highY) * Math.sin(Math.PI * t);
          const a = Math.min(1, Math.sin(Math.PI * t) * 1.6);
          setMoon(x, y, a);
        },
      },
      0.4,
    );

    // le passage de la lune argente chaque lettre (stagger calé sur l'arc)
    graphemes.forEach((g, i) => {
      const at = 0.4 + 6.4 * (0.12 + (0.62 * i) / Math.max(1, n - 1));
      const proxy = { p: 0 };
      tl.to(
        proxy,
        {
          p: 1,
          duration: 0.8,
          ease: "sine.out",
          onUpdate() {
            g.text.tint = rampColor(SILVER_RAMP, proxy.p);
          },
        },
        at,
      );
      // lévitation douce (monte, ondule, redescendra au coucher)
      tl.to(g.text, { y: g.homeY - fontSize * 0.22, duration: 0.9, ease: "sine.inOut" }, at);
      tl.to(g.text, {
        y: g.homeY - fontSize * 0.13,
        duration: 0.7,
        ease: "sine.inOut",
        repeat: 1,
        yoyo: true,
      }, at + 0.9);
    });

    // poussière d'étoiles pendant toute la traversée
    for (let k = 0; k < 20; k++) tl.call(emitStar, undefined, 1 + k * 0.3);

    // apogée : pulse du halo
    tl.to(moonHalo.scale, { x: (fontSize * 3.4) / 32, y: (fontSize * 3.4) / 32, duration: 0.7, ease: "sine.inOut", yoyo: true, repeat: 1 }, 3.1);

    // coucher : les lettres s'éteignent dans l'ordre inverse et redescendent
    graphemes.forEach((g, i) => {
      const at = 7.6 + (n - 1 - i) * 0.07; // pause de lecture argentée avant extinction
      const proxy = { p: 1 };
      tl.to(
        proxy,
        {
          p: 0,
          duration: 0.7,
          ease: "sine.inOut",
          onUpdate() {
            g.text.tint = rampColor(SILVER_RAMP, proxy.p);
          },
          onComplete() {
            g.text.tint = NIGHT;
          },
        },
        at,
      );
      tl.to(g.text, { y: g.homeY, duration: 0.8, ease: "sine.inOut", overwrite: "auto" }, at);
      tl.set(g.text, { y: g.homeY }, at + 0.85);
    });
    tl.set({}, {}, 9.6);

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
        moon.destroy();
        moonHalo.destroy();
      },
    };
  },
});
