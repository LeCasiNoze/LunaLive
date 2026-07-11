// ── LÉVIATHAN ABYSSAL (mythique) ──────────────────────────────────────
// Boucle ~8.5 s : une vague d'encre noire engloutit le pseudo → il coule
// dans les abysses (bulles, tentacules qui ondulent) → il ressurgit lettre
// à lettre en bioluminescence turquoise → l'eau s'égoutte → retour au calme.
import gsap from "gsap";
import { Graphics, Sprite } from "pixi.js";
import { registerEffect } from "../registry";
import { ParticlePool } from "../particles";
import { rampColor, rand, pick } from "../utils";
import type { FxEffectContext } from "../types";

const ABYSS = 0x46628c;
const SUNK = 0x131b2e;
const BIO_RAMP: [number, number][] = [
  [0, 0x131b2e],
  [0.45, 0x0e7490],
  [0.8, 0x2dd4bf],
  [1, 0xa7f3d0],
];

registerEffect({
  id: "leviathan-abyssal",
  label: "Léviathan Abyssal",
  rarity: "mythic",
  loopSeconds: 9.3,
  pad: { y: 1.6 },
  create(ctx: FxEffectContext) {
    const { graphemes, fontSize, intensity } = ctx;
    const n = graphemes.length || 1;
    const pool = new ParticlePool(ctx.runtime, ctx.front, Math.round(90 * intensity) || 30);
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

    graphemes.forEach((g) => (g.text.tint = ABYSS));

    // vague d'encre (devant le texte) : nappe + crête ondulante
    const ink = new Sprite(soft);
    ink.anchor.set(0.5, 0);
    ink.tint = 0x171030;
    ink.alpha = 0.96;
    ink.scale.set(ctx.width / 28, (fontSize * 4) / 30);
    ink.position.set(ctx.width / 2, ctx.height + fontSize * 2.2);
    const crest = new Sprite(soft);
    crest.anchor.set(0.5);
    crest.blendMode = "add";
    crest.tint = 0x818cf8;
    crest.alpha = 0;
    crest.scale.set(ctx.width / 30, (fontSize * 0.42) / 32);
    ctx.front.addChild(ink, crest);

    // tentacules qui ondulent dans les abysses (derrière le texte)
    const tent = new Graphics();
    ctx.behind.addChild(tent);
    const tentPhase = { t: 0, alpha: 0 };
    const drawTentacles = () => {
      tent.clear();
      if (tentPhase.alpha <= 0.01) return;
      for (let k = 0; k < 3; k++) {
        const bx = ctx.width * (0.25 + k * 0.25) + Math.sin(tentPhase.t * 1.7 + k * 2.1) * 6;
        const top = ctx.height / 2 - fontSize * (0.35 + 0.12 * Math.sin(tentPhase.t * 2.3 + k));
        tent.moveTo(bx - 4, ctx.height);
        tent.bezierCurveTo(
          bx - 10 + Math.sin(tentPhase.t * 2 + k) * 8,
          ctx.height - fontSize * 0.8,
          bx + 8 + Math.cos(tentPhase.t * 1.4 + k * 1.3) * 8,
          top + fontSize * 0.5,
          bx,
          top,
        );
        tent.stroke({ width: 3.4 - k * 0.6, color: 0x4338ca, alpha: 0.8 * tentPhase.alpha, cap: "round" });
        tent.beginPath();
      }
    };

    // ŒIL du léviathan : une ellipse lumineuse qui s'ouvre dans le noir,
    // pupille fendue qui scrute, puis se referme
    const eyeGlow = new Sprite(soft);
    eyeGlow.anchor.set(0.5);
    eyeGlow.blendMode = "add";
    eyeGlow.tint = 0x22d3ee;
    eyeGlow.alpha = 0;
    eyeGlow.scale.set((fontSize * 1.1) / 32, 0);
    const pupil = new Sprite(soft);
    pupil.anchor.set(0.5);
    pupil.tint = 0x020408;
    pupil.alpha = 0;
    pupil.scale.set((fontSize * 0.16) / 32, 0);
    const eyeX = ctx.width * 0.62;
    const eyeY = ctx.height / 2 + fontSize * 0.05;
    eyeGlow.position.set(eyeX, eyeY);
    pupil.position.set(eyeX, eyeY);
    ctx.behind.addChild(eyeGlow, pupil);

    // silhouette serpentine qui ondule en traversant les abysses
    const serpent: Sprite[] = [];
    for (let k = 0; k < 8; k++) {
      const s = new Sprite(soft);
      s.anchor.set(0.5);
      s.tint = 0x141031;
      s.alpha = 0;
      s.scale.set(((fontSize * (0.62 - k * 0.05)) / 32) * 1.4);
      ctx.behind.addChild(s);
      serpent.push(s);
    }

    const emitBubble = () => {
      const s = pool.spawn(dot);
      if (!s) return;
      s.blendMode = "add";
      s.tint = pick([0x22d3ee, 0x67e8f9, 0x38bdf8]);
      s.alpha = rand(0.45, 0.8);
      s.scale.set(rand(0.2, 0.5));
      s.position.set(rand(ctx.width * 0.15, ctx.width * 0.85), ctx.height / 2 + fontSize * rand(0.3, 0.8));
      const tl2 = gsap.timeline({ onComplete: () => pool.release(s) });
      tl2.to(s, { y: s.y - fontSize * rand(1, 1.8), duration: rand(1.2, 2), ease: "sine.out" }, 0);
      tl2.to(s, { x: s.x + rand(-6, 6), duration: rand(1.2, 2), ease: "sine.inOut" }, 0);
      tl2.to(s, { alpha: 0, duration: 0.5 }, rand(0.8, 1.4));
      track(tl2);
    };
    const emitDrip = (x: number) => {
      const s = pool.spawn(dot);
      if (!s) return;
      s.tint = 0x38bdf8;
      s.alpha = 0.85;
      s.scale.set(rand(0.3, 0.5));
      s.position.set(x + rand(-4, 4), ctx.height / 2 + fontSize * 0.35);
      const tl2 = gsap.timeline({ onComplete: () => pool.release(s) });
      tl2.to(s, { y: s.y + fontSize * rand(0.8, 1.3), duration: rand(0.5, 0.8), ease: "power1.in" }, 0);
      tl2.to(s, { alpha: 0, duration: 0.3 }, 0.4);
      track(tl2);
    };

    const tl = gsap.timeline({ repeat: -1 });

    // Phase 1 — la vague monte et engloutit (0.6 → 2)
    tl.to(ink, { y: ctx.height / 2 - fontSize * 1.9, duration: 1.4, ease: "power2.in" }, 0.6);
    tl.to(crest, { alpha: 0.8, duration: 0.4 }, 1.2);
    const crestProxy = { t: 0 };
    tl.to(crestProxy, {
      t: Math.PI * 4,
      duration: 2,
      ease: "none",
      onUpdate() {
        crest.position.set(ctx.width / 2, ink.y + Math.sin(crestProxy.t) * 3);
      },
    }, 1.2);
    // les lettres coulent sous la vague
    graphemes.forEach((g, i) => {
      const at = 1.3 + i * 0.05;
      tl.to(g.text, { y: g.homeY + fontSize * 0.5, alpha: 0.3, duration: 0.8, ease: "power1.in" }, at);
      tl.to(g.text, { rotation: rand(-0.25, 0.25), duration: 0.8, ease: "sine.inOut" }, at);
      const proxy = { p: 0 };
      tl.to(proxy, {
        p: 1,
        duration: 0.8,
        onUpdate() {
          g.text.tint = rampColor([[0, ABYSS], [1, SUNK]], proxy.p);
        },
      }, at);
    });

    // Phase 2 — abysses : l'encre se dissout, tentacules + bulles (2.4 → 4.4)
    tl.to(ink, { alpha: 0.35, duration: 1.2, ease: "sine.inOut" }, 2.6);
    tl.to(crest, { alpha: 0, duration: 0.5 }, 2.4);
    tl.to(tentPhase, { alpha: 1, duration: 0.8 }, 2.6);
    tl.to(tentPhase, {
      t: 6,
      duration: 3.4,
      ease: "none",
      onUpdate: drawTentacles,
    }, 2.6);
    for (let k = 0; k < 10; k++) tl.call(emitBubble, undefined, 2.6 + k * 0.22);

    // la silhouette du léviathan passe (droite → gauche, ondulante)
    const serpP = { t: 0 };
    tl.to(serpP, {
      t: 1,
      duration: 2.1,
      ease: "sine.inOut",
      onUpdate() {
        serpent.forEach((s, k) => {
          const local = serpP.t - k * 0.045;
          const x = ctx.width * (1.15 - local * 1.3);
          const y = ctx.height / 2 - fontSize * 0.15 + Math.sin(local * Math.PI * 3 + k * 0.5) * fontSize * 0.4;
          s.position.set(x, y);
          s.alpha = local > 0 && local < 1 ? 0.55 : 0;
        });
      },
      onComplete() {
        serpent.forEach((s) => (s.alpha = 0));
      },
    }, 2.7);

    // l'œil s'ouvre, scrute, se referme
    tl.to(eyeGlow, { alpha: 0.5, duration: 0.35 }, 3.0);
    tl.to(eyeGlow.scale, { y: (fontSize * 0.62) / 32, duration: 0.35, ease: "back.out(1.6)" }, 3.0);
    tl.to(pupil, { alpha: 0.95, duration: 0.25 }, 3.05);
    tl.to(pupil.scale, { y: (fontSize * 0.5) / 32, duration: 0.3, ease: "back.out(1.6)" }, 3.05);
    tl.to(pupil, { x: eyeX - fontSize * 0.28, duration: 0.35, ease: "sine.inOut" }, 3.5);
    tl.to(pupil, { x: eyeX + fontSize * 0.28, duration: 0.4, ease: "sine.inOut" }, 3.95);
    tl.to(pupil, { x: eyeX, duration: 0.25, ease: "sine.inOut" }, 4.35);
    tl.to(eyeGlow.scale, { y: 0, duration: 0.28, ease: "power2.in" }, 4.62);
    tl.to(pupil.scale, { y: 0, duration: 0.24, ease: "power2.in" }, 4.62);
    tl.to(eyeGlow, { alpha: 0, duration: 0.25 }, 4.65);
    tl.to(pupil, { alpha: 0, duration: 0.2 }, 4.65);

    // Phase 3 — résurgence bioluminescente (4.6 →)
    tl.to(tentPhase, { alpha: 0, duration: 0.7, onUpdate: drawTentacles }, 4.9);
    tl.to(ink, { alpha: 0, duration: 0.9 }, 4.8);
    graphemes.forEach((g, i) => {
      const at = 4.8 + i * 0.09;
      tl.to(g.text, { y: g.homeY, alpha: 1, rotation: 0, duration: 0.7, ease: "back.out(1.8)" }, at);
      const proxy = { p: 0 };
      tl.to(proxy, {
        p: 1,
        duration: 0.9,
        ease: "sine.out",
        onUpdate() {
          g.text.tint = rampColor(BIO_RAMP, proxy.p);
        },
      }, at);
      // gouttes qui retombent des lettres à la sortie de l'eau
      tl.call(() => emitDrip(ctx.textLayer.x + g.homeX), undefined, at + 0.55);
      if (i % 3 === 0) tl.call(() => emitDrip(ctx.textLayer.x + g.homeX), undefined, at + 0.9);
    });

    // Phase 4 — apaisement : de la bioluminescence au bleu abyssal
    const calmAt = 4.8 + n * 0.09 + 1.4;
    graphemes.forEach((g, i) => {
      const proxy = { p: 1 };
      tl.to(proxy, {
        p: 0,
        duration: 0.9,
        ease: "sine.inOut",
        onUpdate() {
          g.text.tint = rampColor([[0, ABYSS], [1, 0x2dd4bf]], proxy.p);
        },
      }, calmAt + i * 0.03);
    });
    // reset de la vague hors champ pour la boucle suivante
    tl.set(ink, { y: ctx.height + fontSize * 2.2, alpha: 0.96 }, calmAt + 1);
    tl.set({}, {}, calmAt + 2.2);

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
        ink.destroy();
        crest.destroy();
        tent.destroy();
        eyeGlow.destroy();
        pupil.destroy();
        serpent.forEach((s) => s.destroy());
      },
    };
  },
});
