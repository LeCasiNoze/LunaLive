// ── PORTAGE MOTEUR DES EFFETS CLASSIQUES ──────────────────────────────
// Rework des anciens effets CSS : légendaire (chroma), épiques (fire, ice,
// gold, ember, pulses, rainbow) et rares (silver, purple, crimson, neon).
// Boucles courtes, budgets particules réduits — attractifs mais légers.
import gsap from "gsap";
import { Graphics, Sprite } from "pixi.js";
import { registerEffect } from "../registry";
import { ParticlePool } from "../particles";
import { hslToHex, lerpColor, rampColor, rand, pick } from "../utils";
import type { FxEffectContext, FxEffectHandle } from "../types";

/** boilerplate commun : timeline + tweens trackés + pool optionnel */
function makeHandle(
  tl: gsap.core.Timeline,
  loose: Set<gsap.core.Animation>,
  pool: ParticlePool | null,
  extraDestroy?: () => void,
): FxEffectHandle {
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
      pool?.releaseAll();
      loose.forEach((a) => a.kill());
      loose.clear();
      tl.restart();
    },
    setQuality() {},
    destroy() {
      tl.kill();
      loose.forEach((a) => a.kill());
      loose.clear();
      pool?.destroy();
      extraDestroy?.();
    },
  };
}

function tracker(loose: Set<gsap.core.Animation>) {
  return (a: gsap.core.Animation) => {
    loose.add(a);
    const prevDone = a.eventCallback("onComplete");
    a.eventCallback("onComplete", () => {
      prevDone?.();
      loose.delete(a);
    });
    return a;
  };
}

/** sheen sprite vertical réutilisable (sweep de reflet) */
function makeSheen(ctx: FxEffectContext, tint: number) {
  const soft = ctx.runtime.softCircleTexture();
  const s = new Sprite(soft);
  s.anchor.set(0.5);
  s.blendMode = "add";
  s.tint = tint;
  s.alpha = 0;
  s.scale.set((ctx.fontSize * 0.45) / 32, (ctx.fontSize * 1.6) / 32);
  ctx.front.addChild(s);
  return s;
}
function sweep(tl: gsap.core.Timeline, ctx: FxEffectContext, sheen: Sprite, at: number, dur = 0.8, alpha = 0.6) {
  const n = ctx.graphemes.length || 1;
  const x0 = ctx.textLayer.x + ctx.graphemes[0].homeX - ctx.fontSize * 0.8;
  const x1 = ctx.textLayer.x + ctx.graphemes[n - 1].homeX + ctx.fontSize * 0.8;
  tl.set(sheen, { x: x0, y: ctx.height / 2, alpha }, at);
  tl.to(sheen, { x: x1, duration: dur, ease: "power1.inOut" }, at);
  tl.to(sheen, { alpha: 0, duration: 0.15 }, at + dur - 0.1);
}

// ── CHROMA (légendaire) : carte HOLOGRAPHIQUE — bandes de couleurs vives
//    qui balayent en diagonale, double reflet, flashes prismatiques ──
registerEffect({
  id: "ufx-chroma",
  label: "Chroma (moteur)",
  rarity: "legendary",
  loopSeconds: 3.6,
  create(ctx) {
    const { graphemes, fontSize } = ctx;
    const loose = new Set<gsap.core.Animation>();
    const pool = new ParticlePool(ctx.runtime, ctx.front, 24);
    const track = tracker(loose);
    const dot = ctx.runtime.dotTexture();
    const tl = gsap.timeline({ repeat: -1 });
    const p = { t: 0 };
    tl.to(p, {
      t: 1,
      duration: 3.6,
      ease: "none",
      onUpdate() {
        graphemes.forEach((g, i) => {
          // bandes saturées qui traversent vite (carte holo qu'on incline)
          g.text.tint = hslToHex((p.t * 720 + i * 52) % 360, 0.82, 0.62);
          g.text.y = g.homeY + Math.sin(p.t * Math.PI * 4 + i * 0.8) * fontSize * 0.045;
        });
      },
    }, 0);
    // flashes prismatiques (double salve)
    [0.75, 0.95, 2.45, 2.65].forEach((at) => {
      tl.call(() => {
        for (let k = 0; k < 2; k++) {
          const g = pick(graphemes);
          const s = pool.spawn(dot);
          if (!s) return;
          s.blendMode = "add";
          s.tint = hslToHex(rand(0, 360), 0.85, 0.7);
          s.alpha = 0;
          s.scale.set(rand(0.3, 0.5));
          s.position.set(ctx.textLayer.x + g.homeX + rand(-5, 5), ctx.height / 2 + rand(-7, 7));
          const t2 = gsap.timeline({ onComplete: () => pool.release(s) });
          t2.to(s, { alpha: 1, duration: 0.1 }, 0);
          t2.to(s, { alpha: 0, duration: 0.3 }, 0.12);
          track(t2);
        }
      }, undefined, at);
    });
    return makeHandle(tl, loose, pool);
  },
});

// ── FIRE (épique) : ondulation de température + flammèches continues ──
registerEffect({
  id: "ufx-fire",
  label: "Feu (moteur)",
  rarity: "epic",
  loopSeconds: 2.6,
  create(ctx) {
    const { graphemes, fontSize } = ctx;
    const loose = new Set<gsap.core.Animation>();
    const pool = new ParticlePool(ctx.runtime, ctx.front, 30);
    const track = tracker(loose);
    const dot = ctx.runtime.dotTexture();
    const soft = ctx.runtime.softCircleTexture();
    const RAMP: [number, number][] = [
      [0, 0x9f1d1d],
      [0.5, 0xea580c],
      [0.8, 0xfbbf24],
      [1, 0xfff3c4],
    ];
    const tl = gsap.timeline({ repeat: -1 });
    const p = { t: 0 };
    tl.to(p, {
      t: Math.PI * 2,
      duration: 2.6,
      ease: "none",
      onUpdate() {
        graphemes.forEach((g, i) => {
          const heat = 0.55 + 0.45 * Math.sin(p.t + i * 0.75);
          g.text.tint = rampColor(RAMP, heat);
          g.text.y = g.homeY - Math.max(0, Math.sin(p.t * 1.5 + i)) * fontSize * 0.05;
        });
      },
    }, 0);
    for (let k = 0; k < 9; k++) {
      tl.call(() => {
        const g = pick(graphemes);
        const s = pool.spawn(Math.random() < 0.5 ? dot : soft);
        if (!s) return;
        s.blendMode = "add";
        s.tint = pick([0xffb066, 0xff7a1a, 0xffd166]);
        s.alpha = rand(0.6, 0.95);
        s.scale.set(rand(0.2, 0.42));
        s.position.set(ctx.textLayer.x + g.homeX + rand(-4, 4), ctx.height / 2 - fontSize * 0.1);
        const t2 = gsap.timeline({ onComplete: () => pool.release(s) });
        t2.to(s, { y: s.y - fontSize * rand(0.7, 1.3), x: s.x + rand(-6, 6), duration: rand(0.6, 1), ease: "power1.out" }, 0);
        t2.to(s, { alpha: 0, duration: 0.3 }, rand(0.4, 0.7));
        track(t2);
      }, undefined, k * 0.28);
    }
    return makeHandle(tl, loose, pool);
  },
});

// ── ICE (épique) : le pseudo de GLACE FOND en flaque d'eau, puis la
//    flaque se reforme en pseudo — boucle (idée Lucas) ──
registerEffect({
  id: "ufx-ice",
  label: "Glace (moteur)",
  rarity: "legendary",
  loopSeconds: 8.6,
  create(ctx) {
    const { graphemes, fontSize } = ctx;
    const n = graphemes.length || 1;
    const loose = new Set<gsap.core.Animation>();
    const pool = new ParticlePool(ctx.runtime, ctx.front, 24);
    const track = tracker(loose);
    const dot = ctx.runtime.dotTexture();
    const RAMP: [number, number][] = [
      [0, 0x7dd3fc],
      [0.5, 0xe0f2fe],
      [1, 0x38bdf8],
    ];
    graphemes.forEach((g, i) => (g.text.tint = rampColor(RAMP, i / Math.max(1, n - 1))));
    const h0 = graphemes.map((g) => g.text.height); // hauteurs AVANT scale
    const tw = graphemes[n - 1].homeX - graphemes[0].homeX + fontSize;
    const cx = ctx.width / 2;
    const puddleY = ctx.height / 2 + fontSize * 0.58;

    // flaque d'eau (derrière le texte)
    const puddle = new Graphics();
    ctx.behind.addChild(puddle);
    const pud = { h: 0, wob: 0 };
    const drawPuddle = () => {
      puddle.clear();
      if (pud.h <= 0.01) return;
      const wobble = 1 + Math.sin(pud.wob) * 0.04;
      puddle
        .ellipse(cx, puddleY, (tw * 0.55 + fontSize * 0.3) * pud.h * wobble, fontSize * 0.16 * pud.h)
        .fill({ color: 0x7dd3fc, alpha: 0.4 });
      puddle
        .ellipse(cx, puddleY - 1, (tw * 0.4) * pud.h * wobble, fontSize * 0.1 * pud.h)
        .fill({ color: 0xbfe9ff, alpha: 0.45 });
      puddle.beginPath();
    };

    const emitDrip = (x: number) => {
      const d = pool.spawn(dot);
      if (!d) return;
      d.tint = 0x9fdcff;
      d.alpha = 0.9;
      d.scale.set(rand(0.24, 0.4));
      d.position.set(x + rand(-4, 4), ctx.height / 2 + rand(0, fontSize * 0.2));
      const t2 = gsap.timeline({ onComplete: () => pool.release(d) });
      t2.to(d, { y: puddleY, duration: rand(0.35, 0.55), ease: "power1.in" }, 0);
      t2.to(d, { alpha: 0, duration: 0.12 }, ">-0.1");
      track(t2);
    };
    const sparkle = (x: number, y: number) => {
      const s2 = pool.spawn(dot);
      if (!s2) return;
      s2.blendMode = "add";
      s2.tint = 0xffffff;
      s2.alpha = 0;
      s2.scale.set(rand(0.2, 0.36));
      s2.position.set(x, y);
      const t2 = gsap.timeline({ onComplete: () => pool.release(s2) });
      t2.to(s2, { alpha: 0.9, duration: 0.12 }, 0);
      t2.to(s2, { alpha: 0, duration: 0.32 }, 0.15);
      track(t2);
    };

    const tl = gsap.timeline({ repeat: -1 });
    // ondulation permanente de la flaque
    tl.to(pud, { wob: Math.PI * 6, duration: 7, ease: "none", onUpdate: drawPuddle }, 0);

    // Phase 1 — lecture glacée (0 → 1.5) + scintillements
    [0.4, 0.9].forEach((at) =>
      tl.call(() => sparkle(ctx.textLayer.x + pick(graphemes).homeX, ctx.height / 2 + rand(-6, 6)), undefined, at),
    );

    // Phase 2 — FONTE (1.5 → 3.3) : chaque lettre s'affaisse en gouttant
    graphemes.forEach((g, i) => {
      const at = 1.5 + i * 0.08;
      const m = { p: 0 };
      tl.to(m, {
        p: 1,
        duration: 1.3,
        ease: "power2.in",
        onUpdate() {
          g.text.scale.y = 1 - m.p * 0.94;
          g.text.y = g.homeY + m.p * h0[i] * 0.45;
          g.text.alpha = 1 - m.p * 0.75;
          g.text.tint = rampColor([[0, 0xe0f2fe], [1, 0x60c4f5]], m.p);
        },
      }, at);
      for (let k = 0; k < 2; k++) {
        tl.call(() => emitDrip(ctx.textLayer.x + g.homeX), undefined, at + 0.4 + k * 0.45);
      }
    });
    tl.to(pud, { h: 1, duration: 1.9, ease: "sine.out" }, 1.8);

    // Phase 3 — flaque seule qui ondule (3.4 → 4.4)
    graphemes.forEach((g) => {
      tl.to(g.text, { alpha: 0, duration: 0.3 }, 3.4);
    });

    // Phase 4 — REFORMATION par STALAGMITES CHAOTIQUES (spec Lucas) : une
    // forêt de pics de glace pousse depuis la flaque sur TOUT l'espace du
    // pseudo — penchés, hauteurs et timings désordonnés — puis les lettres
    // apparaissent à travers pendant que les pics fondent
    const shard = ctx.runtime.shardTexture();
    type Stalag = { sp: Sprite; at: number; hgt: number };
    const stalagmites: Stalag[] = [];
    graphemes.forEach((g, i) => {
      for (let k = 0; k < 2; k++) {
        const sp = new Sprite(shard);
        sp.anchor.set(0.5, 1); // base en bas → pousse vers le haut
        sp.tint = k === 0 ? 0xcfe8ff : 0x9fd4f5;
        sp.alpha = 0;
        sp.rotation = rand(-0.35, 0.35);
        sp.scale.set(rand(0.6, 1.1), 0);
        sp.position.set(
          ctx.textLayer.x + g.homeX + rand(-fontSize * 0.45, fontSize * 0.45),
          puddleY + rand(0, 3),
        );
        ctx.front.addChild(sp);
        stalagmites.push({ sp, at: 4.4 + rand(0, 0.8), hgt: h0[i] * rand(0.5, 1.25) });
      }
    });
    stalagmites.forEach(({ sp, at, hgt }) => {
      tl.to(sp, { alpha: rand(0.75, 0.95), duration: 0.2 }, at);
      tl.to(sp.scale, { y: hgt / 12, duration: rand(0.4, 0.7), ease: "power2.out" }, at);
      tl.call(() => sparkle(sp.x + rand(-3, 3), puddleY - hgt * rand(0.4, 0.9)), undefined, at + 0.35);
      // fonte du pic une fois les lettres visibles
      tl.to(sp, { alpha: 0, duration: 0.5, ease: "power1.in" }, 5.9 + rand(0, 0.4));
      tl.to(sp.scale, { y: 0, duration: 0.55, ease: "power1.in" }, 5.95 + rand(0, 0.4));
    });
    // les lettres reviennent à travers la forêt de glace
    graphemes.forEach((g, i) => {
      const showAt = 5.3 + i * 0.06;
      tl.set(g.text, { y: g.homeY }, showAt);
      tl.set(g.text.scale, { y: 1 }, showAt);
      tl.call(() => {
        g.text.tint = rampColor(RAMP, i / Math.max(1, n - 1));
      }, undefined, showAt);
      tl.to(g.text, { alpha: 1, duration: 0.4, ease: "power2.out" }, showAt);
    });
    tl.to(pud, { h: 0, duration: 1.6, ease: "sine.in" }, 5.6);

    // Phase 5 — verrou d'état (le pseudo DOIT être là) + lecture glacée
    tl.call(() => {
      graphemes.forEach((g, i) => {
        g.text.alpha = 1;
        g.text.y = g.homeY;
        g.text.scale.set(1, 1);
        g.text.tint = rampColor(RAMP, i / Math.max(1, n - 1));
      });
    }, undefined, 6.6);
    tl.set({}, {}, 8.6);
    return makeHandle(tl, loose, pool, () => {
      puddle.destroy();
      stalagmites.forEach(({ sp }) => sp.destroy());
    });
  },
});

// ── GOLD (épique) : lingot + une PIÈCE D'OR qui roule sur le dessus des
//    lettres en épousant leurs hauteurs (idée Lucas) ──
registerEffect({
  id: "ufx-gold",
  label: "Gold (moteur)",
  rarity: "epic",
  loopSeconds: 4.4,
  pad: { y: 1.5 },
  create(ctx) {
    const { graphemes, fontSize } = ctx;
    const n = graphemes.length || 1;
    const loose = new Set<gsap.core.Animation>();
    const pool = new ParticlePool(ctx.runtime, ctx.front, 14);
    const track = tracker(loose);
    const dot = ctx.runtime.dotTexture();
    const coinTex = ctx.runtime.coinTexture();
    const RAMP: [number, number][] = [
      [0, 0xfff3c4],
      [0.35, 0xffd85e],
      [0.65, 0xc9940f],
      [1, 0xffd85e],
    ];
    graphemes.forEach((g, i) => (g.text.tint = rampColor(RAMP, i / Math.max(1, n - 1))));
    const sheen = makeSheen(ctx, 0xfff9e8);

    // profil RÉEL du texte : hauteur d'encre de chaque glyphe mesurée au
    // canvas 2D (la .height pixi est la boîte de ligne, identique partout —
    // c'est pourquoi la pièce flottait sur une barre invisible)
    const m2d = document.createElement("canvas").getContext("2d")!;
    m2d.font = `800 ${fontSize}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
    const ascents = graphemes.map(
      (g) => m2d.measureText(g.text.text).actualBoundingBoxAscent || fontSize * 0.72,
    );
    const maxAsc = Math.max(...ascents);
    const tops = graphemes.map((g, i) => g.homeY - g.text.height / 2 + (maxAsc - ascents[i]) + fontSize * 0.14);
    const coin = new Sprite(coinTex);
    coin.anchor.set(0.5);
    coin.alpha = 0;
    const coinR = fontSize * 0.24;
    coin.scale.set((coinR * 2) / 22);
    ctx.front.addChild(coin);

    const tl = gsap.timeline({ repeat: -1 });
    // la pièce roule de la 1re à la dernière lettre en suivant le profil
    const roll = { t: 0 };
    const x0 = ctx.textLayer.x + graphemes[0].homeX - fontSize * 0.3;
    const x1 = ctx.textLayer.x + graphemes[n - 1].homeX + fontSize * 0.3;
    tl.to(coin, { alpha: 1, duration: 0.2 }, 0.5);
    tl.to(roll, {
      t: 1,
      duration: 2.1,
      ease: "none",
      onUpdate() {
        const x = x0 + (x1 - x0) * roll.t;
        // lettre la plus proche + lissage avec la suivante
        const fi = Math.max(0, Math.min(n - 1.001, ((x - ctx.textLayer.x - graphemes[0].homeX) / Math.max(1, graphemes[n - 1].homeX - graphemes[0].homeX)) * (n - 1)));
        const i0 = Math.floor(fi);
        const i1 = Math.min(n - 1, i0 + 1);
        const f = fi - i0;
        // glisse en épousant la courbure : interpolation cosinus continue
        // entre les sommets des lettres (retour Lucas)
        const ease = (1 - Math.cos(f * Math.PI)) / 2;
        const smooth = tops[i0] + (tops[i1] - tops[i0]) * ease;
        // petit rebond au passage d'une lettre plus basse
        const y = ctx.height / 2 + (smooth - graphemes[0].homeY) - coinR - 1;
        coin.position.set(x, y);
        coin.rotation = ((x - x0) / coinR) * 0.9;
      },
    }, 0.5);
    // la pièce saute du bord et tombe
    tl.to(coin, { y: `+=${fontSize * 1.1}`, duration: 0.4, ease: "power1.in" }, 2.62);
    tl.to(coin, { x: `+=${fontSize * 0.5}`, rotation: `+=2`, duration: 0.4, ease: "none" }, 2.62);
    tl.to(coin, { alpha: 0, duration: 0.2 }, 2.85);
    tl.set(coin, { x: x0, rotation: 0 }, 3.4);
    // petites étincelles sous la pièce pendant le roulement
    [0.9, 1.5, 2.1].forEach((at) => {
      tl.call(() => {
        const s = pool.spawn(dot);
        if (!s) return;
        s.blendMode = "add";
        s.tint = 0xfff3c4;
        s.alpha = 0.95;
        s.scale.set(rand(0.2, 0.35));
        s.position.set(coin.x + rand(-2, 2), coin.y + coinR);
        const t2 = gsap.timeline({ onComplete: () => pool.release(s) });
        t2.to(s, { y: s.y - rand(3, 7), alpha: 0, duration: 0.4, ease: "power1.out" }, 0);
        track(t2);
      }, undefined, at);
    });
    sweep(tl, ctx, sheen, 3.4, 0.8, 0.7);
    tl.set({}, {}, 4.4);
    return makeHandle(tl, loose, pool, () => {
      sheen.destroy();
      coin.destroy();
    });
  },
});

// ── PULSES (épiques) : battement de cœur, halo + onde qui traverse ──
function registerPulse(id: string, label: string, halo: number, ramp: [number, number][]) {
  registerEffect({
    id,
    label,
    rarity: "epic",
    loopSeconds: 2.2,
    create(ctx) {
      const { graphemes, fontSize } = ctx;
      const n = graphemes.length || 1;
      const loose = new Set<gsap.core.Animation>();
      const soft = ctx.runtime.softCircleTexture();
      graphemes.forEach((g, i) => (g.text.tint = rampColor(ramp, i / Math.max(1, n - 1))));
      const glow = new Sprite(soft);
      glow.anchor.set(0.5);
      glow.blendMode = "add";
      glow.tint = halo;
      glow.alpha = 0;
      glow.position.set(ctx.width / 2, ctx.height / 2);
      const tw = graphemes[n - 1].homeX - graphemes[0].homeX + fontSize;
      glow.scale.set(Math.max(1, tw / 30), (fontSize * 1.7) / 32);
      ctx.behind.addChild(glow);
      const tl = gsap.timeline({ repeat: -1 });
      // double battement
      [0, 0.32].forEach((off, k) => {
        const a = k === 0 ? 0.32 : 0.45;
        tl.to(glow, { alpha: a, duration: 0.1, ease: "power2.out" }, off);
        tl.to(glow, { alpha: 0.05, duration: 0.24, ease: "power1.in" }, off + 0.1);
        graphemes.forEach((g, i) => {
          tl.to(g.text.scale, { x: 1.05, y: 1.05, duration: 0.09, yoyo: true, repeat: 1 }, off + i * 0.014);
        });
      });
      tl.to(glow, { alpha: 0, duration: 0.3 }, 0.75);
      tl.set({}, {}, 2.2);
      return makeHandle(tl, loose, null, () => glow.destroy());
    },
  });
}
registerPulse("ufx-pulse-red", "Pulse Rouge (moteur)", 0xef4444, [
  [0, 0xfca5a5],
  [0.5, 0xef4444],
  [1, 0xb91c1c],
]);
registerPulse("ufx-pulse-blue", "Pulse Bleu (moteur)", 0x3b82f6, [
  [0, 0xbfdbfe],
  [0.5, 0x3b82f6],
  [1, 0x1d4ed8],
]);

// ── RAINBOW (épique) : roue de couleurs + étoile qui saute de lettre en lettre ──
registerEffect({
  id: "ufx-rainbow",
  label: "Arc-en-ciel (moteur)",
  rarity: "epic",
  loopSeconds: 4,
  create(ctx) {
    const { graphemes, fontSize } = ctx;
    const n = graphemes.length || 1;
    const loose = new Set<gsap.core.Animation>();
    const dot = ctx.runtime.dotTexture();
    const star = new Sprite(dot);
    star.anchor.set(0.5);
    star.blendMode = "add";
    star.tint = 0xffffff;
    star.alpha = 0.9;
    star.scale.set(0.5);
    ctx.front.addChild(star);
    const tl = gsap.timeline({ repeat: -1 });
    const p = { t: 0 };
    tl.to(p, {
      t: 1,
      duration: 4,
      ease: "none",
      onUpdate() {
        graphemes.forEach((g, i) => {
          g.text.tint = hslToHex((p.t * 360 + i * (300 / Math.max(1, n))) % 360, 0.82, 0.66);
        });
        // l'étoile saute de lettre en lettre (arcs successifs)
        const seg = (p.t * n) % n;
        const i0 = Math.floor(seg) % n;
        const i1 = (i0 + 1) % n;
        const local = seg - Math.floor(seg);
        const x0 = ctx.textLayer.x + graphemes[i0].homeX;
        const x1 = ctx.textLayer.x + graphemes[i1].homeX;
        star.position.set(
          x0 + (x1 - x0) * local,
          ctx.height / 2 - fontSize * 0.62 - Math.sin(local * Math.PI) * fontSize * 0.3,
        );
      },
    }, 0);
    return makeHandle(tl, loose, null, () => star.destroy());
  },
});

// ── RARES : une seule idée par effet, discrète mais vivante ──
registerEffect({
  id: "ufx-silver",
  label: "Argenté (moteur)",
  rarity: "rare",
  loopSeconds: 3.2,
  create(ctx) {
    const { graphemes } = ctx;
    const n = graphemes.length || 1;
    const loose = new Set<gsap.core.Animation>();
    const RAMP: [number, number][] = [
      [0, 0xf8fafc],
      [0.5, 0x94a3b8],
      [1, 0xe2e8f0],
    ];
    graphemes.forEach((g, i) => (g.text.tint = rampColor(RAMP, i / Math.max(1, n - 1))));
    const sheen = makeSheen(ctx, 0xffffff);
    const tl = gsap.timeline({ repeat: -1 });
    sweep(tl, ctx, sheen, 0.9, 0.85, 0.55);
    tl.set({}, {}, 3.2);
    return makeHandle(tl, loose, null, () => sheen.destroy());
  },
});

registerEffect({
  id: "ufx-purple",
  label: "Pourpre royal (moteur)",
  rarity: "rare",
  loopSeconds: 3.6,
  create(ctx) {
    const { graphemes } = ctx;
    const loose = new Set<gsap.core.Animation>();
    const tl = gsap.timeline({ repeat: -1 });
    const p = { t: 0 };
    tl.to(p, {
      t: Math.PI * 2,
      duration: 3.6,
      ease: "none",
      onUpdate() {
        graphemes.forEach((g, i) => {
          const l = 0.5 + 0.5 * Math.sin(p.t + i * 0.5);
          g.text.tint = lerpColor(0x6b21a8, 0xd8b4fe, l * 0.7 + 0.15);
        });
      },
    }, 0);
    return makeHandle(tl, loose, null);
  },
});

registerEffect({
  id: "ufx-crimson",
  label: "Crimson (moteur)",
  rarity: "rare",
  loopSeconds: 3.8,
  create(ctx) {
    const { graphemes } = ctx;
    const loose = new Set<gsap.core.Animation>();
    const tl = gsap.timeline({ repeat: -1 });
    const p = { t: 0 };
    tl.to(p, {
      t: Math.PI * 2,
      duration: 3.8,
      ease: "none",
      onUpdate() {
        graphemes.forEach((g, i) => {
          const l = 0.5 + 0.5 * Math.sin(p.t - i * 0.45);
          g.text.tint = lerpColor(0x7f1d1d, 0xfb7185, l * 0.75 + 0.1);
        });
      },
    }, 0);
    return makeHandle(tl, loose, null);
  },
});

registerEffect({
  id: "ufx-neon",
  label: "Néon (moteur)",
  rarity: "rare",
  loopSeconds: 4.2,
  pad: { y: 1.4 },
  create(ctx) {
    const { graphemes, fontSize } = ctx;
    const n = graphemes.length || 1;
    const loose = new Set<gsap.core.Animation>();
    const soft = ctx.runtime.softCircleTexture();
    const dot = ctx.runtime.dotTexture();
    graphemes.forEach((g) => (g.text.tint = 0xf5edff));
    const glow = new Sprite(soft);
    glow.anchor.set(0.5);
    glow.blendMode = "add";
    glow.tint = 0xa855f7;
    glow.alpha = 0.3;
    glow.position.set(ctx.width / 2, ctx.height / 2);
    const tw = graphemes[n - 1].homeX - graphemes[0].homeX + fontSize;
    glow.scale.set(Math.max(1, tw / 30), (fontSize * 1.5) / 32);
    ctx.behind.addChild(glow);

    // bordure néon autour du pseudo (tube) + point qui fait le tour
    const bx = ctx.textLayer.x + graphemes[0].homeX - fontSize * 0.55;
    const by = ctx.height / 2 - fontSize * 0.72;
    const bw = tw + fontSize * 0.4;
    const bh = fontSize * 1.44;
    const border = new Graphics();
    border.roundRect(bx, by, bw, bh, fontSize * 0.4).stroke({ width: 1.2, color: 0xa855f7, alpha: 0.5 });
    ctx.front.addChild(border);
    const orbHalo = new Sprite(soft);
    orbHalo.anchor.set(0.5);
    orbHalo.blendMode = "add";
    orbHalo.tint = 0xc084fc;
    orbHalo.alpha = 0.6;
    orbHalo.scale.set(0.5);
    const orb = new Sprite(dot);
    orb.anchor.set(0.5);
    orb.blendMode = "add";
    orb.tint = 0xffffff;
    orb.scale.set(0.42);
    ctx.front.addChild(orbHalo, orb);
    const perim = 2 * (bw + bh);
    const setOrb = (t: number) => {
      const d = ((t % 1) + 1) % 1 * perim;
      let x = bx;
      let y = by;
      if (d < bw) {
        x = bx + d;
        y = by;
      } else if (d < bw + bh) {
        x = bx + bw;
        y = by + (d - bw);
      } else if (d < bw * 2 + bh) {
        x = bx + bw - (d - bw - bh);
        y = by + bh;
      } else {
        x = bx;
        y = by + bh - (d - bw * 2 - bh);
      }
      orb.position.set(x, y);
      orbHalo.position.set(x, y);
    };
    setOrb(0);

    const tl = gsap.timeline({ repeat: -1 });
    // le point parcourt la bordure en continu (1.6 tours par boucle)
    const orbP = { t: 0 };
    tl.to(orbP, { t: 0.9, duration: 4.2, ease: "none", onUpdate: () => setOrb(orbP.t) }, 0);
    // allumage de tube néon : sputters puis lumière stable
    const flick = (at: number, a: number, d = 0.05) => {
      tl.to(glow, { alpha: a, duration: d, ease: "none" }, at);
      tl.to(border, { alpha: Math.min(1, a * 2.2), duration: d, ease: "none" }, at);
      graphemes.forEach((g) => tl.to(g.text, { alpha: Math.min(1, a * 2.6), duration: d, ease: "none" }, at));
    };
    flick(0.5, 0.08);
    flick(0.58, 0.34);
    flick(0.68, 0.1);
    flick(0.78, 0.38);
    flick(0.86, 0.3);
    tl.to(glow, { alpha: 0.34, duration: 0.2 }, 1);
    tl.to(border, { alpha: 1, duration: 0.2 }, 1);
    graphemes.forEach((g) => tl.to(g.text, { alpha: 1, duration: 0.2 }, 1));
    tl.set({}, {}, 4.2);
    return makeHandle(tl, loose, null, () => {
      glow.destroy();
      border.destroy();
      orb.destroy();
      orbHalo.destroy();
    });
  },
});
