// ── CRISTALLISATION (légendaire) ──────────────────────────────────────
// Boucle ~6.5 s : le gel envahit les lettres une à une (cristaux qui
// poussent dessus, scintillement) → tout le pseudo gelé brille → un reflet
// glacé balaye → SHATTER : les cristaux éclatent en fragments → dégel.
import gsap from "gsap";
import { Sprite } from "pixi.js";
import { registerEffect } from "../registry";
import { ParticlePool } from "../particles";
import { rampColor, rand, pick } from "../utils";
import type { FxEffectContext } from "../types";

const BASE = 0x9db8d8;
const FREEZE_RAMP: [number, number][] = [
  [0, 0x9db8d8],
  [0.55, 0xcfe8ff],
  [1, 0xf0faff],
];

registerEffect({
  id: "cristallisation",
  label: "Cristallisation",
  rarity: "legendary",
  loopSeconds: 6.5,
  create(ctx: FxEffectContext) {
    const { graphemes, fontSize, intensity } = ctx;
    const n = graphemes.length || 1;
    const pool = new ParticlePool(ctx.runtime, ctx.front, Math.round(110 * intensity) || 40);
    const shard = ctx.runtime.shardTexture();
    const dot = ctx.runtime.dotTexture();
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

    graphemes.forEach((g) => (g.text.tint = BASE));

    // cristaux persistants (2 par lettre), réanimés à chaque boucle
    const crystals: Sprite[] = [];
    graphemes.forEach((g) => {
      for (let k = 0; k < 2; k++) {
        const s = new Sprite(shard);
        s.anchor.set(0.5, 0.9);
        s.tint = pick([0xdbeeff, 0xbfe0ff, 0xf0faff]);
        s.alpha = 0;
        s.scale.set(0);
        s.rotation = rand(-0.5, 0.5);
        s.position.set(
          ctx.textLayer.x + g.homeX + rand(-fontSize * 0.28, fontSize * 0.28),
          ctx.height / 2 + rand(-fontSize * 0.3, fontSize * 0.25),
        );
        ctx.front.addChild(s);
        crystals.push(s);
      }
    });

    // reflet glacé
    const sheen = new Sprite(soft);
    sheen.anchor.set(0.5);
    sheen.blendMode = "add";
    sheen.tint = 0xe8f6ff;
    sheen.alpha = 0;
    sheen.scale.set((fontSize * 0.5) / 32, (fontSize * 1.7) / 32);
    ctx.front.addChild(sheen);

    const tw = graphemes[n - 1].homeX - graphemes[0].homeX + fontSize;

    const sparkle = (x: number, y: number) => {
      const s = pool.spawn(dot);
      if (!s) return;
      s.blendMode = "add";
      s.tint = 0xffffff;
      s.alpha = 0;
      s.scale.set(rand(0.2, 0.4));
      s.position.set(x, y);
      const tl2 = gsap.timeline({ onComplete: () => pool.release(s) });
      tl2.to(s, { alpha: 0.95, duration: 0.12 }, 0);
      tl2.to(s, { alpha: 0, duration: 0.3 }, 0.15);
      track(tl2);
    };
    const burstShards = () => {
      crystals.forEach((c) => {
        // le cristal s'éjecte et tombe en tournant
        const clone = pool.spawn(shard);
        if (clone) {
          clone.tint = c.tint;
          clone.alpha = 1;
          clone.scale.set(c.scale.x);
          clone.rotation = c.rotation;
          clone.position.set(c.x, c.y);
          const tl2 = gsap.timeline({ onComplete: () => pool.release(clone) });
          tl2.to(clone, { x: clone.x + rand(-fontSize, fontSize) * 0.9, duration: 0.95, ease: "power1.out" }, 0);
          tl2.to(clone, { y: clone.y - rand(6, 16), duration: 0.26, ease: "power1.out" }, 0);
          tl2.to(clone, { y: `+=${fontSize * rand(0.9, 1.4)}`, duration: 0.7, ease: "power1.in" }, 0.26);
          tl2.to(clone, { rotation: clone.rotation + rand(-3, 3), duration: 0.95, ease: "none" }, 0);
          tl2.to(clone, { alpha: 0, duration: 0.3 }, 0.68);
          track(tl2);
        }
        c.alpha = 0;
        c.scale.set(0);
      });
    };

    const tl = gsap.timeline({ repeat: -1 });

    // Phase 1 — le gel envahit lettre à lettre
    graphemes.forEach((g, i) => {
      const at = 0.5 + i * 0.14;
      const proxy = { p: 0 };
      tl.to(proxy, {
        p: 1,
        duration: 0.6,
        ease: "sine.out",
        onUpdate() {
          g.text.tint = rampColor(FREEZE_RAMP, proxy.p);
        },
      }, at);
      tl.call(() => sparkle(ctx.textLayer.x + g.homeX + rand(-4, 4), ctx.height / 2 + rand(-6, 6)), undefined, at + 0.3);
    });
    // les cristaux poussent
    crystals.forEach((c, i) => {
      const at = 0.7 + (i / crystals.length) * (n * 0.14) + rand(0, 0.15);
      tl.to(c, { alpha: 0.95, duration: 0.2 }, at);
      tl.to(c.scale, { x: rand(0.7, 1.15), y: rand(0.8, 1.3), duration: 0.5, ease: "back.out(2)" }, at);
    });

    // Phase 2 — scintillement global + reflet qui balaye
    const frozenAt = 0.5 + n * 0.14 + 0.5;
    for (let k = 0; k < 6; k++) {
      tl.call(
        () => sparkle(ctx.textLayer.x + graphemes[Math.floor(rand(0, n))].homeX, ctx.height / 2 + rand(-8, 8)),
        undefined,
        frozenAt + k * 0.16,
      );
    }
    tl.set(sheen, { x: ctx.textLayer.x - fontSize * 0.8, y: ctx.height / 2, alpha: 0.65 }, frozenAt + 0.2);
    tl.to(sheen, { x: ctx.textLayer.x + tw + fontSize * 0.8, duration: 0.9, ease: "power1.inOut" }, frozenAt + 0.2);
    tl.to(sheen, { alpha: 0, duration: 0.15 }, frozenAt + 1.05);

    // Phase 3 — SHATTER
    const shatterAt = frozenAt + 1.5;
    tl.call(burstShards, undefined, shatterAt);
    graphemes.forEach((g) => {
      // secousse
      tl.to(g.text, { x: g.homeX + 1.5, duration: 0.04, repeat: 5, yoyo: true, ease: "none" }, shatterAt);
      // dégel
      const proxy = { p: 1 };
      tl.to(proxy, {
        p: 0,
        duration: 0.8,
        ease: "sine.inOut",
        onUpdate() {
          g.text.tint = rampColor(FREEZE_RAMP, proxy.p);
        },
      }, shatterAt + 0.3);
    });
    tl.set({}, {}, shatterAt + 2);

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
        crystals.forEach((c) => c.destroy());
        sheen.destroy();
      },
    };
  },
});
