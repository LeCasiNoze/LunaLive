// ── CŒUR DU RÉACTEUR (mythique) ───────────────────────────────────────
// Boucle ~7.5 s : des veines d'énergie néon chargent les lettres une à
// une → surcharge (tremblement, lueur critique) → EXPLOSION : les lettres
// sont éjectées et orbitent en fragments → implosion : tout se réassemble.
import gsap from "gsap";
import { Sprite } from "pixi.js";
import { registerEffect } from "../registry";
import { ParticlePool } from "../particles";
import { rampColor, rand, pick } from "../utils";
import type { FxEffectContext } from "../types";

const CHARGE_RAMP: [number, number][] = [
  [0, 0x6b7a94],
  [0.4, 0x22d3ee],
  [0.75, 0x67e8f9],
  [1, 0xe0fbff],
];

registerEffect({
  id: "coeur-du-reacteur",
  label: "Cœur du Réacteur",
  rarity: "mythic",
  loopSeconds: 8.1,
  pad: { x: 1.7, y: 1.6 },
  create(ctx: FxEffectContext) {
    const { graphemes, fontSize, intensity } = ctx;
    const n = graphemes.length || 1;
    const pool = new ParticlePool(ctx.runtime, ctx.front, Math.round(100 * intensity) || 40);
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

    graphemes.forEach((g) => (g.text.tint = rampColor(CHARGE_RAMP, 0.18)));

    // cœur du réacteur : lueur centrale qui monte en puissance
    const core = new Sprite(soft);
    core.anchor.set(0.5);
    core.blendMode = "add";
    core.tint = 0x22d3ee;
    core.alpha = 0;
    core.position.set(ctx.width / 2, ctx.height / 2);
    const tw = graphemes[n - 1].homeX - graphemes[0].homeX + fontSize;
    core.scale.set(Math.max(0.8, tw / 30), (fontSize * 1.8) / 32);
    ctx.behind.addChild(core);

    const emitCharge = (x: number) => {
      const s = pool.spawn(dot);
      if (!s) return;
      s.blendMode = "add";
      s.tint = pick([0x22d3ee, 0x67e8f9, 0xa5f3fc]);
      s.alpha = 0.9;
      s.scale.set(rand(0.2, 0.4));
      // la particule court le long de la baseline VERS la lettre (veine)
      const fromX = x + rand(-fontSize * 2, fontSize * 2);
      s.position.set(fromX, ctx.height / 2 + fontSize * rand(0.5, 0.8) * (Math.random() < 0.5 ? 1 : -1));
      const tl2 = gsap.timeline({ onComplete: () => pool.release(s) });
      tl2.to(s, { x, y: ctx.height / 2, duration: rand(0.35, 0.55), ease: "power2.in" }, 0);
      tl2.to(s, { alpha: 0, duration: 0.12 }, ">-0.1");
      track(tl2);
    };

    const tl = gsap.timeline({ repeat: -1 });

    // Phase 1 — charge : les veines alimentent chaque lettre
    graphemes.forEach((g, i) => {
      const at = 0.5 + i * 0.13;
      const gx = ctx.textLayer.x + g.homeX;
      for (let k = 0; k < 3; k++) tl.call(() => emitCharge(gx), undefined, at + k * 0.12);
      const proxy = { p: 0 };
      tl.to(proxy, {
        p: 0.72,
        duration: 0.7,
        ease: "power1.in",
        onUpdate() {
          g.text.tint = rampColor(CHARGE_RAMP, proxy.p);
        },
      }, at + 0.15);
    });
    tl.to(core, { alpha: 0.3, duration: 1.6, ease: "power1.in" }, 0.7);

    // Phase 2 — surcharge critique : tremblement + blanc électrique
    const overAt = 0.5 + n * 0.13 + 0.5;
    graphemes.forEach((g) => {
      tl.to(g.text, { x: g.homeX + 1.4, duration: 0.04, repeat: 15, yoyo: true, ease: "none" }, overAt);
      const proxy = { p: 0.72 };
      tl.to(proxy, {
        p: 1,
        duration: 0.6,
        onUpdate() {
          g.text.tint = rampColor(CHARGE_RAMP, proxy.p);
        },
      }, overAt);
    });
    tl.to(core, { alpha: 0.62, duration: 0.6, ease: "power2.in" }, overAt);

    // Phase 3 — EXPLOSION : les lettres sont éjectées et orbitent
    const boomAt = overAt + 0.75;
    tl.to(core, { alpha: 0, duration: 0.25 }, boomAt);
    tl.call(() => {
      // onde de choc
      const s = pool.spawn(soft);
      if (s) {
        s.blendMode = "add";
        s.tint = 0xa5f3fc;
        s.alpha = 0.8;
        s.scale.set(0.3);
        s.position.set(ctx.width / 2, ctx.height / 2);
        const t2 = gsap.timeline({ onComplete: () => pool.release(s) });
        t2.to(s.scale, { x: ctx.width / 30, y: 2.4, duration: 0.5, ease: "power2.out" }, 0);
        t2.to(s, { alpha: 0, duration: 0.5 }, 0.05);
        track(t2);
      }
    }, undefined, boomAt);
    // orbites : chaque lettre part sur une ellipse autour du centre
    const orbits = graphemes.map((g, i) => ({
      g,
      a0: (i / n) * Math.PI * 2 + rand(-0.3, 0.3),
      rx: tw * 0.5 + fontSize * rand(0.2, 0.9),
      ry: fontSize * rand(0.7, 1.2),
      dir: i % 2 === 0 ? 1 : -1,
    }));
    const orbitProxy = { t: 0 };
    tl.to(orbitProxy, {
      t: 1,
      duration: 1.7,
      ease: "power1.inOut",
      onUpdate() {
        const t = orbitProxy.t;
        // enveloppe : sortie (0→0.25), orbite (0.25→0.75), retour (0.75→1)
        const env = t < 0.25 ? t / 0.25 : t > 0.75 ? (1 - t) / 0.25 : 1;
        for (const o of orbits) {
          const ang = o.a0 + o.dir * t * Math.PI * 2.2;
          const cxL = ctx.width / 2 - ctx.textLayer.x;
          o.g.text.x = o.g.homeX + (cxL + Math.cos(ang) * o.rx - o.g.homeX) * env * 0.9 - (env > 0 ? 0 : 0);
          o.g.text.y = o.g.homeY + Math.sin(ang) * o.ry * env;
          o.g.text.rotation = o.dir * t * Math.PI * 2 * env * 0.4;
          o.g.text.alpha = 1 - env * 0.15;
        }
      },
      onComplete() {
        for (const o of orbits) {
          o.g.text.position.set(o.g.homeX, o.g.homeY);
          o.g.text.rotation = 0;
          o.g.text.alpha = 1;
        }
      },
    }, boomAt + 0.1);

    // Phase 4 — réassemblage : flash doux + retour au froid
    const settleAt = boomAt + 2.0;
    graphemes.forEach((g, i) => {
      tl.fromTo(g.text.scale, { x: 1.2, y: 1.2 }, { x: 1, y: 1, duration: 0.35, ease: "back.out(2.5)" }, settleAt + i * 0.02);
      const proxy = { p: 1 };
      tl.to(proxy, {
        p: 0,
        duration: 1,
        ease: "sine.inOut",
        onUpdate() {
          g.text.tint = rampColor(CHARGE_RAMP, proxy.p * 0.5);
        },
        onComplete() {
          g.text.tint = rampColor(CHARGE_RAMP, 0.18);
        },
      }, settleAt + 0.4 + i * 0.02);
    });
    tl.set({}, {}, settleAt + 2.6);

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
          g.text.position.set(g.homeX, g.homeY);
          g.text.rotation = 0;
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
        core.destroy();
      },
    };
  },
});
