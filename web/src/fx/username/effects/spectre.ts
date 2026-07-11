// ── SPECTRE (légendaire) ──────────────────────────────────────────────
// Boucle ~5.5 s : le pseudo est hanté — deux échos fantomatiques dérivent
// en opposition de phase, une âme erre à travers les lettres, et par
// moments une lettre disparaît puis réapparaît décalée avant de se
// replacer.
import gsap from "gsap";
import { Sprite, Text } from "pixi.js";
import { registerEffect } from "../registry";
import { rand } from "../utils";
import type { FxEffectContext } from "../types";

const GHOST = 0xa7e8dc;

registerEffect({
  id: "spectre",
  label: "Spectre",
  rarity: "legendary",
  loopSeconds: 5.5,
  create(ctx: FxEffectContext) {
    const { graphemes, fontSize } = ctx;
    const n = graphemes.length || 1;
    const soft = ctx.runtime.softCircleTexture();
    const loose = new Set<gsap.core.Animation>();

    graphemes.forEach((g) => (g.text.tint = GHOST));

    // deux échos du pseudo entier (clones translucides, derrière)
    const echoes: Text[][] = [[], []];
    for (let e = 0; e < 2; e++) {
      for (const g of graphemes) {
        const t = new Text({ text: g.text.text, style: g.text.style });
        t.anchor.set(0.5);
        t.position.set(g.homeX, g.homeY);
        t.tint = e === 0 ? 0x67e8f9 : 0xc4b5fd;
        t.alpha = 0.3;
        ctx.behind.addChild(t);
        // les échos vivent dans le repère du textLayer
        t.position.set(g.homeX + ctx.textLayer.x - ctx.textLayer.x, g.homeY);
        echoes[e].push(t);
      }
    }
    // replace les échos dans le textLayer pour partager le layout
    echoes.flat().forEach((t) => ctx.textLayer.addChildAt(t, 0));

    // âme errante
    const soul = new Sprite(soft);
    soul.anchor.set(0.5);
    soul.blendMode = "add";
    soul.tint = 0x9ff5ec;
    soul.alpha = 0;
    soul.scale.set(0.85);
    ctx.front.addChild(soul);

    const tl = gsap.timeline({ repeat: -1 });

    // dérive perpétuelle des échos + ondulation éthérée du texte principal
    const drift = { t: 0 };
    tl.to(drift, {
      t: Math.PI * 2,
      duration: 5.5,
      ease: "none",
      onUpdate() {
        const dx = Math.sin(drift.t) * fontSize * 0.24;
        const dy = Math.cos(drift.t * 1.3) * fontSize * 0.15;
        echoes[0].forEach((t, i) => t.position.set(graphemes[i].homeX + dx, graphemes[i].homeY + dy));
        echoes[1].forEach((t, i) => t.position.set(graphemes[i].homeX - dx, graphemes[i].homeY - dy * 0.7));
        // vague lente qui traverse le pseudo (souffle du spectre)
        graphemes.forEach((g, i) => {
          g.text.y = g.homeY + Math.sin(drift.t * 2 + i * 0.7) * fontSize * 0.07;
        });
      },
    }, 0);

    // vacillement doux du texte principal
    graphemes.forEach((g, i) => {
      tl.to(g.text, {
        alpha: 0.75,
        duration: rand(0.5, 0.8),
        ease: "sine.inOut",
        yoyo: true,
        repeat: 3,
      }, 0.2 + i * 0.07);
    });

    // l'âme serpente à travers le pseudo (avec pulsation)
    const soulPath = { t: 0 };
    tl.to(soul, { alpha: 0.75, duration: 0.4 }, 0.8);
    tl.to(soul.scale, { x: 1.05, y: 1.05, duration: 0.45, ease: "sine.inOut", yoyo: true, repeat: 6 }, 0.8);
    tl.to(soulPath, {
      t: 1,
      duration: 3.2,
      ease: "sine.inOut",
      onUpdate() {
        const x = ctx.width * (0.1 + soulPath.t * 0.8);
        const y = ctx.height / 2 + Math.sin(soulPath.t * Math.PI * 3) * fontSize * 0.55;
        soul.position.set(x, y);
      },
    }, 0.8);
    tl.to(soul, { alpha: 0, duration: 0.4 }, 3.7);

    // hantise : trois lettres disparaissent/réapparaissent décalées
    const hauntIdx = [Math.floor(n * 0.2), Math.floor(n * 0.55), Math.min(n - 1, Math.floor(n * 0.85))];
    hauntIdx.forEach((idx, k) => {
      const g = graphemes[idx];
      const at = 1.2 + k * 1.35;
      tl.to(g.text, { alpha: 0, duration: 0.14, ease: "power2.in" }, at);
      tl.set(g.text, { x: g.homeX + 6 }, at + 0.35);
      tl.to(g.text, { alpha: 0.55, duration: 0.1 }, at + 0.35);
      tl.to(g.text, { alpha: 0.2, duration: 0.08 }, at + 0.5);
      tl.to(g.text, { alpha: 1, x: g.homeX, duration: 0.4, ease: "sine.out" }, at + 0.62);
    });

    tl.set({}, {}, 5.5);

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
        tl.restart();
      },
      setQuality() {},
      destroy() {
        tl.kill();
        loose.forEach((a) => a.kill());
        loose.clear();
        echoes.flat().forEach((t) => t.destroy());
        soul.destroy();
      },
    };
  },
});
