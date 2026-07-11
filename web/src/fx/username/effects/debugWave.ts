// Effet de validation de la chaîne complète (graphèmes, centrage, ticker,
// pause, destroy) : vague verticale + teinte cyclée. Pas exposé aux joueurs.
import gsap from "gsap";
import { registerEffect } from "../registry";
import { hslToHex } from "../utils";

registerEffect({
  id: "debug-wave",
  label: "Debug Wave (test)",
  rarity: "rare",
  loopSeconds: 2.4,
  create(ctx) {
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.2 });
    ctx.graphemes.forEach((g, i) => {
      tl.to(
        g.text,
        {
          y: g.homeY - ctx.fontSize * 0.4,
          duration: 0.32,
          ease: "sine.inOut",
          yoyo: true,
          repeat: 1,
        },
        i * 0.06,
      );
    });
    const proxy = { h: 0 };
    const tint = gsap.to(proxy, {
      h: 360,
      duration: 2.4,
      repeat: -1,
      ease: "none",
      onUpdate() {
        for (const g of ctx.graphemes) {
          g.text.tint = hslToHex((proxy.h + g.index * 24) % 360, 0.7, 0.72);
        }
      },
    });
    return {
      play() {
        tl.play();
        tint.play();
      },
      pause() {
        tl.pause();
        tint.pause();
      },
      restart() {
        tl.restart();
        tint.restart();
      },
      setQuality() {},
      destroy() {
        tl.kill();
        tint.kill();
      },
    };
  },
});
