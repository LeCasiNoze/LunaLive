// ── NUÉE D'OBSIDIENNE (mythique) ──────────────────────────────────────
// Boucle ~7.5 s : chaque lettre éclate en papillons noirs-violets qui
// battent des ailes et tourbillonnent en nuée autour du pseudo, puis la
// nuée converge et redépose les lettres une à une.
import gsap from "gsap";
import { registerEffect } from "../registry";
import { ParticlePool } from "../particles";
import { rand, pick } from "../utils";
import type { FxEffectContext } from "../types";

const DUSK = 0x8b7bb0;
const WING_TINTS = [0x7c3aed, 0x8b5cf6, 0x6d28d9, 0xa78bfa];

registerEffect({
  id: "nuee-obsidienne",
  label: "Nuée d'Obsidienne",
  rarity: "mythic",
  loopSeconds: 8.2,
  pad: { x: 1.8, y: 1.7 },
  create(ctx: FxEffectContext) {
    const { graphemes, fontSize, intensity } = ctx;
    const n = graphemes.length || 1;
    const perChar = Math.max(2, Math.round(4 * intensity));
    const pool = new ParticlePool(ctx.runtime, ctx.front, n * perChar + 10);
    const leaf = ctx.runtime.leafTexture();
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

    graphemes.forEach((g) => (g.text.tint = DUSK));

    // vol d'un papillon : éclosion → errance en nuée → convergence → dépôt
    const flyButterfly = (g: (typeof graphemes)[number], wanderTime: number) => {
      const s = pool.spawn(leaf);
      if (!s) return;
      s.tint = pick(WING_TINTS);
      s.alpha = 0;
      const baseScale = rand(0.65, 1.05);
      s.scale.set(baseScale);
      const x0 = ctx.textLayer.x + g.homeX;
      const y0 = ctx.height / 2;
      s.position.set(x0, y0);
      s.rotation = rand(-0.6, 0.6);

      // battement d'ailes permanent (scaleX yoyo rapide)
      const flap = gsap.to(s.scale, {
        x: baseScale * 0.25,
        duration: rand(0.09, 0.14),
        yoyo: true,
        repeat: -1,
        ease: "sine.inOut",
      });
      loose.add(flap);

      const tl2 = gsap.timeline({
        onComplete: () => {
          flap.kill();
          loose.delete(flap);
          pool.release(s);
        },
      });
      tl2.to(s, { alpha: 0.95, duration: 0.2 }, 0);
      // errance : 3 étapes de vol chaotique autour du pseudo
      let px = x0;
      let py = y0;
      const hops = 3;
      for (let h = 0; h < hops; h++) {
        const nx = rand(ctx.width * 0.08, ctx.width * 0.92);
        const ny = ctx.height / 2 + rand(-fontSize * 1.3, fontSize * 1.1);
        const d = wanderTime / hops;
        tl2.to(s, {
          x: nx,
          y: ny,
          rotation: Math.atan2(ny - py, nx - px) * 0.25,
          duration: d * rand(0.85, 1.15),
          ease: "sine.inOut",
        });
        px = nx;
        py = ny;
      }
      // convergence : retour au point d'origine de la lettre
      tl2.to(s, { x: x0, y: y0, rotation: 0, duration: 0.6, ease: "power2.inOut" });
      tl2.to(s, { alpha: 0, duration: 0.22 }, ">-0.1");
      track(tl2);
    };

    const tl = gsap.timeline({ repeat: -1 });

    // Phase 1 — repos (léger frémissement violet)
    const idle = { p: 0 };
    tl.to(idle, {
      p: 1,
      duration: 0.7,
      onUpdate() {
        /* placeholder pour garder la phase visible */
      },
    }, 0);

    // Phase 2 — désagrégation : chaque lettre éclot en papillons
    graphemes.forEach((g, i) => {
      const at = 0.8 + i * 0.1;
      const wander = 2.6 + (n - 1 - i) * 0.1; // tous convergent ~au même moment
      tl.call(() => {
        for (let k = 0; k < perChar; k++) flyButterfly(g, wander * rand(0.9, 1.05));
      }, undefined, at);
      tl.call(() => (g.text.tint = DUSK), undefined, at);
      tl.to(g.text, { alpha: 0, duration: 0.25, ease: "power2.in" }, at + 0.05);
      tl.to(g.text.scale, { x: 0.6, y: 0.6, duration: 0.25, ease: "power2.in" }, at + 0.05);
    });

    // Phase 3 — la nuée tourbillonne (les vols gèrent cette phase) ; le
    // pseudo est absent ~2.5 s

    // Phase 4 — reformation : chaque lettre atterrit dans un petit flash
    // violet puis scintille (retour Lucas : affichage plus joli)
    const soft = ctx.runtime.softCircleTexture();
    graphemes.forEach((g, i) => {
      const at = 0.8 + i * 0.1 + 2.6 + (n - 1 - i) * 0.1 + 0.45;
      tl.call(() => {
        const s = pool.spawn(soft);
        if (!s) return;
        s.blendMode = "add";
        s.tint = 0xa78bfa;
        s.alpha = 0.75;
        s.scale.set(0.15);
        s.position.set(ctx.textLayer.x + g.homeX, ctx.height / 2);
        const t2 = gsap.timeline({ onComplete: () => pool.release(s) });
        t2.to(s.scale, { x: 0.9, y: 0.9, duration: 0.32, ease: "power2.out" }, 0);
        t2.to(s, { alpha: 0, duration: 0.32 }, 0.05);
        track(t2);
      }, undefined, at);
      tl.to(g.text, { alpha: 1, duration: 0.3, ease: "power2.out" }, at);
      tl.fromTo(
        g.text.scale,
        { x: 1.3, y: 1.3 },
        { x: 1, y: 1, duration: 0.4, ease: "back.out(2.2)" },
        at,
      );
      // shimmer d'atterrissage : violet clair → teinte crépuscule
      const proxy = { p: 1 };
      tl.to(proxy, {
        p: 0,
        duration: 0.55,
        ease: "sine.out",
        onStart() {
          g.text.tint = 0xe4dcf7;
        },
        onUpdate() {
          g.text.tint = 0x8b7bb0 + Math.round(0x30 * proxy.p) * 0x10101;
        },
        onComplete() {
          // final BRILLANT (retour Lucas : pas fade)
          g.text.tint = 0xc9b8f5;
        },
      }, at + 0.12);
    });

    // Phase 5 — pause lisible avant la boucle
    tl.set({}, {}, 0.8 + (n - 1) * 0.1 + 2.6 + (n - 1) * 0.1 + 2.4);

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
        graphemes.forEach((g) => {
          g.text.alpha = 1;
          g.text.scale.set(1);
        });
        tl.restart();
      },
      setQuality() {},
      destroy() {
        tl.kill();
        loose.forEach((a) => a.kill());
        loose.clear();
        pool.destroy();
      },
    };
  },
});
