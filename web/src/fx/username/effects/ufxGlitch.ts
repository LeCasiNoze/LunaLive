// ── GLITCH (légendaire, rework moteur de l'effet CSS) ─────────────────
// Boucle ~5 s : signal corrompu — 3 bursts : les lettres se remplacent par
// des glyphes corrompus quelques frames, sautent, et leurs échos RGB
// (cyan/magenta) divergent ; une scanline descend en continu.
import gsap from "gsap";
import { Sprite, Text } from "pixi.js";
import { registerEffect } from "../registry";
import { rampColor, rand, pick } from "../utils";
import type { FxEffectContext } from "../types";

// dégradé cyan→magenta (retour Lucas : un peu de couleur)
const BASE_RAMP: [number, number][] = [
  [0, 0x7ff5e4],
  [0.5, 0xd9d4f0],
  [1, 0xff9be8],
];
const GLYPHS = ["▓", "▒", "░", "#", "@", "%", "&", "$", "?", "0", "1"];

registerEffect({
  id: "ufx-glitch",
  label: "Glitch (moteur)",
  rarity: "legendary",
  loopSeconds: 5,
  create(ctx: FxEffectContext) {
    const { graphemes, fontSize } = ctx;
    const soft = ctx.runtime.softCircleTexture();
    const loose = new Set<gsap.core.Animation>();
    const originals = graphemes.map((g) => g.text.text);
    const nAll = graphemes.length || 1;
    graphemes.forEach((g, i) => (g.text.tint = rampColor(BASE_RAMP, i / Math.max(1, nAll - 1))));

    // échos RGB par lettre (cachés hors bursts)
    const cyan: Text[] = [];
    const magenta: Text[] = [];
    graphemes.forEach((g) => {
      for (const [arr, tint] of [
        [cyan, 0x22ffe0],
        [magenta, 0xff2bd6],
      ] as const) {
        const t = new Text({ text: g.text.text, style: g.text.style });
        t.anchor.set(0.5);
        // dérive RGB permanente subtile (signal jamais parfaitement stable)
        t.position.set(g.homeX + (tint === 0x22ffe0 ? 1 : -1), g.homeY);
        t.tint = tint;
        t.alpha = 0.14;
        ctx.textLayer.addChildAt(t, 0);
        arr.push(t);
      }
    });

    // scanline qui descend en continu
    const scan = new Sprite(soft);
    scan.anchor.set(0.5);
    scan.blendMode = "add";
    scan.tint = 0x9df5e8;
    scan.alpha = 0.16;
    scan.scale.set(ctx.width / 30, (fontSize * 0.22) / 32);
    ctx.front.addChild(scan);

    const tl = gsap.timeline({ repeat: -1 });
    const scanP = { t: 0 };
    tl.to(scanP, {
      t: 1,
      duration: 5,
      ease: "none",
      onUpdate() {
        const yy = ctx.height / 2 + ((scanP.t * 2.4) % 1.2 - 0.6) * fontSize * 1.6;
        scan.position.set(ctx.width / 2, yy);
      },
    }, 0);

    // un burst = 3 salves rapprochées de corruption
    const burst = (at: number, strength: number) => {
      for (let s = 0; s < 3; s++) {
        const t0 = at + s * 0.11;
        tl.call(() => {
          graphemes.forEach((g, i) => {
            if (Math.random() > strength) return;
            g.text.text = pick(GLYPHS);
            g.text.x = g.homeX + rand(-3.5, 3.5);
            cyan[i].alpha = 0.8;
            cyan[i].position.set(g.homeX + rand(1.5, 3.5), g.homeY + rand(-1.5, 1.5));
            magenta[i].alpha = 0.8;
            magenta[i].position.set(g.homeX - rand(1.5, 3.5), g.homeY - rand(-1.5, 1.5));
          });
        }, undefined, t0);
        tl.call(() => {
          graphemes.forEach((g, i) => {
            g.text.text = originals[i];
            g.text.x = g.homeX;
            cyan[i].alpha = 0.14;
            cyan[i].position.set(g.homeX + 1, g.homeY);
            magenta[i].alpha = 0.14;
            magenta[i].position.set(g.homeX - 1, g.homeY);
          });
        }, undefined, t0 + 0.07);
      }
    };
    burst(0.9, 0.5);
    burst(2.4, 0.85);
    burst(3.9, 0.35);

    tl.set({}, {}, 5);

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
        graphemes.forEach((g, i) => {
          g.text.text = originals[i];
          g.text.x = g.homeX;
        });
        tl.restart();
      },
      setQuality() {},
      destroy() {
        tl.kill();
        loose.forEach((a) => a.kill());
        loose.clear();
        cyan.concat(magenta).forEach((t) => t.destroy());
        scan.destroy();
      },
    };
  },
});
