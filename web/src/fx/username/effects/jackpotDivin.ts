// ── JACKPOT DIVIN (mythique, casino) ──────────────────────────────────
// Boucle ~7.5 s : pseudo or sombre → chaque lettre devient un rouleau de
// slot qui défile (symboles) → les rouleaux s'arrêtent un à un (rebond) →
// tous alignés : FLASH doré + pluie de pièces → le pseudo reste laqué or
// brillant → retour au calme.
import gsap from "gsap";
import { Sprite } from "pixi.js";
import { registerEffect } from "../registry";
import { ParticlePool } from "../particles";
import { rampColor, rand, pick } from "../utils";
import type { FxEffectContext } from "../types";

const GOLD_DARK = 0x8a6508;
const GOLD_RAMP: [number, number][] = [
  [0, 0x8a6508],
  [0.5, 0xd9a514],
  [0.85, 0xffd85e],
  [1, 0xfff3c4],
];
const SYMBOLS = ["7", "★", "♦", "♣", "♥", "◈"];

registerEffect({
  id: "jackpot-divin",
  label: "Jackpot Divin",
  rarity: "mythic",
  loopSeconds: 8.7,
  create(ctx: FxEffectContext) {
    const { graphemes, fontSize, intensity } = ctx;
    const n = graphemes.length || 1;
    const pool = new ParticlePool(ctx.runtime, ctx.front, Math.round(120 * intensity) || 40);
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
    const originals = graphemes.map((g) => g.text.text);

    // flash plein champ (apogée jackpot)
    const flash = new Sprite(soft);
    flash.anchor.set(0.5);
    flash.blendMode = "add";
    flash.tint = 0xffd85e;
    flash.alpha = 0;
    flash.position.set(ctx.width / 2, ctx.height / 2);
    flash.scale.set(ctx.width / 24, (fontSize * 3) / 24);
    ctx.behind.addChild(flash);

    graphemes.forEach((g) => (g.text.tint = GOLD_DARK));

    const coinRain = () => {
      const count = Math.round(18 * intensity);
      for (let i = 0; i < count; i++) {
        const s = pool.spawn(Math.random() < 0.6 ? dot : soft);
        if (!s) return;
        s.blendMode = "add";
        s.tint = pick([0xffd85e, 0xfbbf24, 0xfff3c4]);
        s.alpha = 0;
        s.scale.set(rand(0.25, 0.55));
        s.position.set(rand(ctx.width * 0.08, ctx.width * 0.92), ctx.height / 2 - fontSize * rand(1.1, 1.6));
        const tl2 = gsap.timeline({ delay: rand(0, 0.5), onComplete: () => pool.release(s) });
        tl2.to(s, { alpha: rand(0.7, 1), duration: 0.15 }, 0);
        tl2.to(s, { y: ctx.height / 2 + fontSize * rand(0.7, 1.2), duration: rand(0.7, 1.1), ease: "power1.in" }, 0);
        tl2.to(s, { alpha: 0, duration: 0.3 }, rand(0.6, 0.9));
        track(tl2);
      }
    };

    const tl = gsap.timeline({ repeat: -1 });

    // Phase 1 — repos (léger shimmer or sombre)
    const idle = { p: 0 };
    tl.to(idle, {
      p: 1,
      duration: 0.8,
      ease: "sine.inOut",
      onUpdate() {
        for (const g of graphemes) g.text.tint = rampColor(GOLD_RAMP, idle.p * 0.25);
      },
    }, 0);

    // Phase 2 — les rouleaux tournent : symboles qui défilent par lettre
    const spinStart = 1.0;
    const spinBase = 1.4; // durée mini de spin
    graphemes.forEach((g, i) => {
      const stopAt = spinStart + spinBase + i * 0.22; // arrêts en cascade
      // défilement des symboles (changement toutes les ~75 ms)
      const swaps = Math.floor((stopAt - spinStart) / 0.075);
      for (let k = 0; k < swaps; k++) {
        tl.call(
          () => {
            g.text.text = pick(SYMBOLS);
            g.text.tint = pick([0xd9a514, 0xb98a10, 0xffd85e]);
            g.text.y = g.homeY + rand(-2, 2);
          },
          undefined,
          spinStart + k * 0.075,
        );
      }
      // arrêt : la vraie lettre revient avec rebond + petit éclat
      tl.call(
        () => {
          g.text.text = originals[i];
          g.text.y = g.homeY;
          g.text.tint = 0xffd85e;
          const s = pool.spawn(soft);
          if (s) {
            s.blendMode = "add";
            s.tint = 0xffd85e;
            s.alpha = 0.8;
            s.scale.set(0.18);
            s.position.set(ctx.textLayer.x + g.homeX, ctx.height / 2);
            const t2 = gsap.timeline({ onComplete: () => pool.release(s) });
            t2.to(s.scale, { x: 0.85, y: 0.85, duration: 0.3, ease: "power2.out" }, 0);
            t2.to(s, { alpha: 0, duration: 0.3 }, 0.05);
            track(t2);
          }
        },
        undefined,
        stopAt,
      );
      tl.fromTo(g.text.scale, { x: 1.35, y: 1.35 }, { x: 1, y: 1, duration: 0.4, ease: "back.out(3)" }, stopAt);
    });

    // Phase 3 — JACKPOT : flash + pluie de pièces + or éclatant
    const jackpotAt = spinStart + spinBase + (n - 1) * 0.22 + 0.5;
    tl.to(flash, { alpha: 0.36, duration: 0.12, ease: "power2.out" }, jackpotAt);
    tl.to(flash, { alpha: 0, duration: 0.7, ease: "sine.out" }, jackpotAt + 0.12);
    tl.call(coinRain, undefined, jackpotAt + 0.05);
    graphemes.forEach((g, i) => {
      const proxy = { p: 0.6 };
      tl.to(
        proxy,
        {
          p: 1,
          duration: 0.4,
          ease: "power2.out",
          onUpdate() {
            g.text.tint = rampColor(GOLD_RAMP, proxy.p);
          },
        },
        jackpotAt + i * 0.03,
      );
      // petit saut de joie en vague
      tl.to(g.text, { y: g.homeY - fontSize * 0.18, duration: 0.18, ease: "power2.out", yoyo: true, repeat: 1 }, jackpotAt + 0.15 + i * 0.05);
    });

    // Phase 4 — retombée douce vers l'or sombre (fin de boucle propre).
    // Le pseudo reste affiché en OR de fin d'animation un long moment
    // (retour Lucas).
    const calmAt = jackpotAt + 3.4;
    const calm = { p: 1 };
    tl.to(
      calm,
      {
        p: 0,
        duration: 1,
        ease: "sine.inOut",
        onUpdate() {
          for (const g of graphemes) g.text.tint = rampColor(GOLD_RAMP, calm.p * 0.25);
        },
      },
      calmAt,
    );
    tl.set({}, {}, calmAt + 1.3);

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
        graphemes.forEach((g, i) => {
          g.text.text = originals[i];
          g.text.y = g.homeY;
        });
        tl.restart();
      },
      setQuality() {},
      destroy() {
        tl.kill();
        loose.forEach((a) => a.kill());
        loose.clear();
        pool.destroy();
        flash.destroy();
      },
    };
  },
});
