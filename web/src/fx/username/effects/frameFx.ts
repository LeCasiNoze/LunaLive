// ── CADRANS-CANVAS ────────────────────────────────────────────────────
// Couches de particules RÉELLES par-dessus les cadrans CSS validés (le
// CSS reste : bordures/fonds ; le canvas ajoute la vie que le CSS ne peut
// pas offrir). Un effet = (runtime, stage, w, h) → handle.
import gsap from "gsap";
import { Container, Sprite } from "pixi.js";
import { ParticlePool } from "../particles";
import type { UsernameFxRuntime } from "../runtime";
import { rand, pick } from "../utils";

export type FrameFxHandle = {
  play(): void;
  pause(): void;
  destroy(): void;
};
export type FrameFxFactory = (
  runtime: UsernameFxRuntime,
  stage: Container,
  w: number,
  h: number,
) => FrameFxHandle;

/** boilerplate : émetteur périodique via gsap + pool */
function emitterFx(
  runtime: UsernameFxRuntime,
  stage: Container,
  cap: number,
  intervalS: number,
  emit: (pool: ParticlePool, track: (a: gsap.core.Animation) => void) => void,
): FrameFxHandle {
  const pool = new ParticlePool(runtime, stage, cap);
  const loose = new Set<gsap.core.Animation>();
  const track = (a: gsap.core.Animation) => {
    loose.add(a);
    const prevDone = a.eventCallback("onComplete");
    a.eventCallback("onComplete", () => {
      prevDone?.();
      loose.delete(a);
    });
    return a;
  };
  const ticker = gsap.timeline({ repeat: -1 });
  ticker.call(() => emit(pool, track), undefined, 0);
  ticker.set({}, {}, intervalS);
  return {
    play() {
      ticker.play();
      loose.forEach((a) => a.play());
    },
    pause() {
      ticker.pause();
      loose.forEach((a) => a.pause());
    },
    destroy() {
      ticker.kill();
      loose.forEach((a) => a.kill());
      loose.clear();
      pool.destroy();
    },
  };
}

export const FRAME_FX: Record<string, FrameFxFactory> = {
  // Coffre-Fort : vraies pièces qui tombent en tournant (par-dessus la
  // pluie SVG du CSS — profondeur réelle)
  "frame_chest_vault": (runtime, stage, w, h) =>
    emitterFx(runtime, stage, 26, 0.36, (pool, track) => {
      const s = pool.spawn(runtime.coinTexture());
      if (!s) return;
      s.alpha = 0;
      const sc = rand(0.3, 0.55);
      s.scale.set(sc);
      s.position.set(rand(w * 0.05, w * 0.95), -8);
      const dur = rand(1.6, 2.6);
      const tl = gsap.timeline({ onComplete: () => pool.release(s) });
      tl.to(s, { alpha: rand(0.55, 0.9), duration: 0.25 }, 0);
      tl.to(s, { y: h + 10, duration: dur, ease: "none" }, 0);
      tl.to(s, { x: `+=${rand(-14, 14)}`, duration: dur, ease: "sine.inOut" }, 0);
      tl.to(s, { rotation: rand(-4, 4), duration: dur, ease: "none" }, 0);
      // aplatissement périodique = la pièce tournoie sur elle-même
      tl.to(s.scale, { x: sc * 0.2, duration: 0.3, yoyo: true, repeat: Math.floor(dur / 0.3), ease: "sine.inOut" }, 0);
      tl.to(s, { alpha: 0, duration: 0.3 }, dur - 0.3);
      track(tl);
    }),

  // Champ de Bataille : braises réelles qui montent + flammèches
  "frame_boss_flames": (runtime, stage, w, h) =>
    emitterFx(runtime, stage, 30, 0.22, (pool, track) => {
      const s = pool.spawn(Math.random() < 0.6 ? runtime.dotTexture() : runtime.softCircleTexture());
      if (!s) return;
      s.blendMode = "add";
      s.tint = pick([0xffb066, 0xff7a1a, 0xffd166, 0xff5a1f]);
      s.alpha = rand(0.5, 0.95);
      s.scale.set(rand(0.14, 0.34));
      s.position.set(rand(w * 0.03, w * 0.97), h + 4);
      const dur = rand(1.4, 2.4);
      const tl = gsap.timeline({ onComplete: () => pool.release(s) });
      tl.to(s, { y: h - rand(h * 0.5, h * 1.05), duration: dur, ease: "power1.out" }, 0);
      tl.to(s, { x: `+=${rand(-10, 10)}`, duration: dur, ease: "sine.inOut" }, 0);
      tl.to(s, { alpha: 0, duration: 0.5 }, dur - 0.5);
      track(tl);
    }),

  // Roi des Viewers : cœurs qui montent en ballon avec vrai balancement
  "frame_viewer_hearts": (runtime, stage, w, h) =>
    emitterFx(runtime, stage, 16, 0.55, (pool, track) => {
      const s = pool.spawn(runtime.heartTexture());
      if (!s) return;
      s.tint = pick([0xf472b6, 0xef4444, 0xfda4af, 0xfb7185]);
      s.alpha = 0;
      s.scale.set(rand(0.4, 0.75));
      const x0 = rand(w * 0.06, w * 0.94);
      s.position.set(x0, h + 6);
      const dur = rand(2.2, 3.4);
      const sway = { t: 0 };
      const tl = gsap.timeline({ onComplete: () => pool.release(s) });
      tl.to(s, { alpha: rand(0.5, 0.85), duration: 0.3 }, 0);
      tl.to(s, { y: -10, duration: dur, ease: "sine.in" }, 0);
      tl.to(sway, {
        t: Math.PI * rand(2.5, 4),
        duration: dur,
        ease: "none",
        onUpdate() {
          s.x = x0 + Math.sin(sway.t) * rand(5, 7);
          s.rotation = Math.sin(sway.t) * 0.18;
        },
      }, 0);
      tl.to(s, { alpha: 0, duration: 0.4 }, dur - 0.4);
      track(tl);
    }),

  // Glitch : fragments numériques cyan/magenta qui clignotent
  "mframe_glitch": (runtime, stage, w, h) =>
    emitterFx(runtime, stage, 18, 0.3, (pool, track) => {
      const s = pool.spawn(runtime.dotTexture());
      if (!s) return;
      s.blendMode = "add";
      s.tint = Math.random() < 0.5 ? 0x22ffe0 : 0xff2bd6;
      s.alpha = 0;
      s.scale.set(rand(0.2, 0.5), rand(0.12, 0.3));
      s.position.set(rand(w * 0.03, w * 0.97), rand(h * 0.08, h * 0.92));
      const tl = gsap.timeline({ onComplete: () => pool.release(s) });
      tl.to(s, { alpha: rand(0.5, 0.95), duration: 0.05 }, 0);
      tl.set(s, { x: s.x + rand(-8, 8) }, 0.1);
      tl.to(s, { alpha: 0, duration: 0.06 }, rand(0.14, 0.3));
      track(tl);
    }),

  // Eclipse : étoile filante occasionnelle + scintillements nocturnes
  "mframe_eclipse": (runtime, stage, w, h) =>
    emitterFx(runtime, stage, 12, 1.1, (pool, track) => {
      if (Math.random() < 0.3) {
        // étoile filante : traît lumineux qui traverse en diagonale
        const s = pool.spawn(runtime.softCircleTexture());
        if (!s) return;
        s.blendMode = "add";
        s.tint = 0xe9d5ff;
        s.alpha = 0.9;
        s.scale.set(0.45, 0.07);
        s.rotation = 0.32;
        const x0 = rand(w * 0.1, w * 0.6);
        const y0 = rand(2, h * 0.3);
        s.position.set(x0, y0);
        const tl = gsap.timeline({ onComplete: () => pool.release(s) });
        tl.to(s, { x: x0 + w * 0.3, y: y0 + w * 0.3 * 0.34, duration: 0.55, ease: "power1.in" }, 0);
        tl.to(s, { alpha: 0, duration: 0.25 }, 0.32);
        track(tl);
      } else {
        const s = pool.spawn(runtime.dotTexture());
        if (!s) return;
        s.blendMode = "add";
        s.tint = pick([0xe9d5ff, 0xc4b5fd, 0xffffff]);
        s.alpha = 0;
        s.scale.set(rand(0.14, 0.3));
        s.position.set(rand(w * 0.05, w * 0.95), rand(h * 0.1, h * 0.85));
        const tl = gsap.timeline({ onComplete: () => pool.release(s) });
        tl.to(s, { alpha: rand(0.5, 0.9), duration: 0.3 }, 0);
        tl.to(s, { alpha: 0, duration: 0.5 }, 0.5);
        track(tl);
      }
    }),

  // Néon Rainbow : pops d'étoiles néon multicolores + comète diagonale
  "mframe_neon_rainbow": (runtime, stage, w, h) =>
    emitterFx(runtime, stage, 16, 0.42, (pool, track) => {
      if (Math.random() < 0.14) {
        const s = pool.spawn(runtime.softCircleTexture());
        if (!s) return;
        s.blendMode = "add";
        s.tint = pick([0xff0080, 0x00e0ff, 0xffe000, 0x8000ff]);
        s.alpha = 0.85;
        s.scale.set(0.5, 0.08);
        s.rotation = -0.25;
        s.position.set(-6, rand(h * 0.2, h * 0.8));
        const tl = gsap.timeline({ onComplete: () => pool.release(s) });
        tl.to(s, { x: w + 8, y: `-=${w * 0.25}`, duration: 0.7, ease: "power1.inOut" }, 0);
        tl.to(s, { alpha: 0, duration: 0.2 }, 0.5);
        track(tl);
      } else {
        const s = pool.spawn(runtime.dotTexture());
        if (!s) return;
        s.blendMode = "add";
        s.tint = pick([0xff0080, 0x00e0ff, 0xffe000, 0x00ff80, 0x8000ff]);
        s.alpha = 0;
        s.scale.set(0.05);
        s.position.set(rand(w * 0.04, w * 0.96), rand(h * 0.1, h * 0.9));
        const tl = gsap.timeline({ onComplete: () => pool.release(s) });
        tl.to(s, { alpha: 0.95, duration: 0.12 }, 0);
        tl.to(s.scale, { x: rand(0.32, 0.5), y: rand(0.32, 0.5), duration: 0.3, ease: "back.out(2)" }, 0);
        tl.to(s, { alpha: 0, duration: 0.3 }, 0.35);
        track(tl);
      }
    }),

  // Glace : neige fine qui tombe en dérivant
  "mframe_ice": (runtime, stage, w, h) =>
    emitterFx(runtime, stage, 22, 0.3, (pool, track) => {
      const s = pool.spawn(runtime.dotTexture());
      if (!s) return;
      s.tint = pick([0xffffff, 0xe0f2fe, 0xbae6fd]);
      s.alpha = 0;
      s.scale.set(rand(0.12, 0.28));
      s.position.set(rand(-6, w), -6);
      const dur = rand(2.2, 3.6);
      const tl = gsap.timeline({ onComplete: () => pool.release(s) });
      tl.to(s, { alpha: rand(0.4, 0.8), duration: 0.4 }, 0);
      tl.to(s, { y: h + 8, duration: dur, ease: "none" }, 0);
      tl.to(s, { x: `+=${rand(8, 22)}`, duration: dur, ease: "sine.inOut" }, 0);
      tl.to(s, { alpha: 0, duration: 0.4 }, dur - 0.4);
      track(tl);
    }),
};

/** monte un effet de cadran sur une instance runtime déjà créée */
export function createFrameFx(
  id: string,
  runtime: UsernameFxRuntime,
  stage: Container,
  w: number,
  h: number,
): FrameFxHandle | null {
  const factory = FRAME_FX[id];
  if (!factory) return null;
  return factory(runtime, stage, w, h);
}

export const FRAME_FX_IDS = Object.keys(FRAME_FX);
// évite le tree-shaking du Sprite importé pour le typage des pools
void Sprite;
