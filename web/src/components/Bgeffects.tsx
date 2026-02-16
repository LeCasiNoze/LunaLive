// web/src/components/BgEffects.tsx
// ─────────────────────────────────────────────────────────────────────────────
//  LunaLive — Effets de fond animés  |  Purple Velvet × Casino Night
//  4 effets disponibles :
//    "coins"   → pièces dorées/violettes qui tombent (jackpot)
//    "cards"   → cartes à jouer 3D qui flottent
//    "aurora"  → rideaux de lumière nordique ondulants
//    "stars"   → étoiles filantes en diagonale
//    "bubbles" → bulles lampe à lave (reprend LavaLamp)
//
//  Usage dans App.tsx :
//    <BgEffect type="cards" />
//
//  Tous les effets :
//  - position: fixed, z-index: 0, pointer-events: none
//  - will-change: transform/opacity (GPU only)
//  - prefers-reduced-motion respecté
//  - seamless loop (0% === 100% ou alternate)
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";

export type BgEffectType = "coins" | "cards" | "aurora" | "stars" | "bubbles";

/* ════════════════════════════════════════════════════════════════════════════
   ENTRÉE PRINCIPALE
════════════════════════════════════════════════════════════════════════════ */
export function BgEffect({ type }: { type: BgEffectType }) {
  switch (type) {
    case "coins":  return <SlotCoins />;
    case "cards":  return <FloatingCards />;
    case "aurora": return <AuroraCurtain />;
    case "stars":  return <ShootingStars />;
    case "bubbles":return <LavaLampBubbles />;
    default:       return null;
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   UTILITAIRES
════════════════════════════════════════════════════════════════════════════ */
function injectCss(id: string, css: string) {
  if (document.getElementById(id)) return;
  const el = document.createElement("style");
  el.id = id; el.textContent = css;
  document.head.appendChild(el);
}

function useInjectCss(id: string, css: string) {
  React.useEffect(() => { injectCss(id, css); }, []);
}

/* ════════════════════════════════════════════════════════════════════════════
   1. 🎰 SLOT COINS — pièces qui tombent en diagonale
════════════════════════════════════════════════════════════════════════════ */
const COINS_CSS = `
.ll-coins-root {
  position: fixed; inset: 0; z-index: 0;
  pointer-events: none; overflow: hidden;
}
.ll-coin {
  position: absolute;
  top: -120px;
  border-radius: 50%;
  will-change: transform, opacity;
  animation:
    ll-coin-fall var(--fall-dur) linear infinite,
    ll-coin-spin var(--spin-dur) linear infinite,
    ll-coin-fade var(--fall-dur) ease-in-out infinite;
  animation-delay: var(--delay);
}
/* Brillance métallique via box-shadow */
.ll-coin::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: radial-gradient(
    circle at 35% 28%,
    rgba(255,255,255,0.55),
    transparent 55%
  );
  animation: ll-coin-shine var(--spin-dur) linear infinite;
  animation-delay: var(--delay);
}
/* Symbole centré */
.ll-coin::after {
  content: var(--symbol);
  position: absolute; inset: 0;
  display: grid; place-items: center;
  font-size: calc(var(--size) * 0.42px);
  line-height: 1;
  opacity: 0.90;
  text-shadow: 0 1px 3px rgba(0,0,0,0.50);
}

@keyframes ll-coin-fall {
  0%   { transform: translateX(0)   translateY(-120px); }
  100% { transform: translateX(var(--drift)) translateY(115vh); }
}
@keyframes ll-coin-spin {
  0%   { transform: scaleX(1);    }
  25%  { transform: scaleX(0.15); }
  50%  { transform: scaleX(1);    }
  75%  { transform: scaleX(0.15); }
  100% { transform: scaleX(1);    }
}
@keyframes ll-coin-shine {
  0%,100% { opacity: 0.55; }
  50%      { opacity: 0.20; }
}
@keyframes ll-coin-fade {
  0%        { opacity: 0;    }
  8%        { opacity: 1;    }
  82%       { opacity: 0.85; }
  100%      { opacity: 0;    }
}
@media (prefers-reduced-motion: reduce) {
  .ll-coin { animation: none !important; opacity: 0 !important; }
}
`;

type CoinCfg = {
  id: number; x: number; size: number;
  fallDur: number; spinDur: number;
  delay: number; drift: string;
  bg: string; symbol: string;
};

const COIN_DATA: CoinCfg[] = [
  // Pièces dorées
  { id:1,  x:3,  size:32, fallDur:8,  spinDur:1.2, delay:-1,  drift:"-40px", bg:"linear-gradient(135deg,#fbbf24,#f59e0b,#d97706)", symbol:"'🪙'" },
  { id:2,  x:12, size:24, fallDur:11, spinDur:0.9, delay:-5,  drift:"30px",  bg:"linear-gradient(135deg,#fde68a,#fbbf24,#b45309)", symbol:"'💰'" },
  { id:3,  x:22, size:38, fallDur:9,  spinDur:1.4, delay:-8,  drift:"-55px", bg:"linear-gradient(135deg,#fbbf24,#f59e0b,#92400e)", symbol:"'🪙'" },
  { id:4,  x:33, size:20, fallDur:13, spinDur:0.8, delay:-2,  drift:"20px",  bg:"linear-gradient(135deg,#fde68a,#fbbf24,#b45309)", symbol:"'$'"  },
  { id:5,  x:44, size:30, fallDur:10, spinDur:1.1, delay:-9,  drift:"-30px", bg:"linear-gradient(135deg,#fbbf24,#f59e0b,#d97706)", symbol:"'🪙'" },
  { id:6,  x:55, size:26, fallDur:7,  spinDur:0.7, delay:-4,  drift:"45px",  bg:"linear-gradient(135deg,#fde68a,#fbbf24,#92400e)", symbol:"'💰'" },
  { id:7,  x:65, size:34, fallDur:12, spinDur:1.3, delay:-6,  drift:"-25px", bg:"linear-gradient(135deg,#fbbf24,#f59e0b,#b45309)", symbol:"'🪙'" },
  { id:8,  x:76, size:22, fallDur:9,  spinDur:1.0, delay:-3,  drift:"35px",  bg:"linear-gradient(135deg,#fde68a,#fbbf24,#d97706)", symbol:"'$'"  },
  { id:9,  x:86, size:40, fallDur:14, spinDur:1.5, delay:-11, drift:"-50px", bg:"linear-gradient(135deg,#fbbf24,#f59e0b,#92400e)", symbol:"'🪙'" },
  { id:10, x:94, size:28, fallDur:8,  spinDur:0.9, delay:-7,  drift:"20px",  bg:"linear-gradient(135deg,#fde68a,#fbbf24,#b45309)", symbol:"'💰'" },
  // Pièces violettes (LunaLive brand)
  { id:11, x:7,  size:28, fallDur:15, spinDur:1.1, delay:-13, drift:"40px",  bg:"linear-gradient(135deg,#c4b5fd,#7c5cfc,#4c1d95)", symbol:"'✦'"  },
  { id:12, x:18, size:36, fallDur:11, spinDur:1.4, delay:-2,  drift:"-30px", bg:"linear-gradient(135deg,#a78bfa,#7c5cfc,#3b1e8e)", symbol:"'⬟'"  },
  { id:13, x:38, size:22, fallDur:9,  spinDur:0.8, delay:-7,  drift:"50px",  bg:"linear-gradient(135deg,#c4b5fd,#a78bfa,#5b21b6)", symbol:"'✦'"  },
  { id:14, x:50, size:32, fallDur:13, spinDur:1.2, delay:-4,  drift:"-40px", bg:"linear-gradient(135deg,#a78bfa,#7c5cfc,#4c1d95)", symbol:"'⬟'"  },
  { id:15, x:60, size:18, fallDur:8,  spinDur:0.7, delay:-10, drift:"25px",  bg:"linear-gradient(135deg,#c4b5fd,#7c5cfc,#3b1e8e)", symbol:"'✦'"  },
  { id:16, x:70, size:42, fallDur:16, spinDur:1.6, delay:-1,  drift:"-60px", bg:"linear-gradient(135deg,#a78bfa,#7c5cfc,#5b21b6)", symbol:"'⬟'"  },
  { id:17, x:82, size:24, fallDur:10, spinDur:0.9, delay:-8,  drift:"35px",  bg:"linear-gradient(135deg,#c4b5fd,#a78bfa,#4c1d95)", symbol:"'✦'"  },
  { id:18, x:90, size:30, fallDur:12, spinDur:1.2, delay:-5,  drift:"-20px", bg:"linear-gradient(135deg,#a78bfa,#7c5cfc,#3b1e8e)", symbol:"'⬟'"  },
];

function SlotCoins() {
  useInjectCss("ll-coins-css", COINS_CSS);
  return (
    <div className="ll-coins-root" aria-hidden>
      {COIN_DATA.map((c) => (
        <div key={c.id} className="ll-coin" style={{
          left: `${c.x}%`,
          width: `${c.size}px`, height: `${c.size}px`,
          background: c.bg,
          boxShadow: `0 0 ${c.size * 0.4}px rgba(251,191,36,0.35), inset 0 2px 4px rgba(255,255,255,0.30), inset 0 -2px 4px rgba(0,0,0,0.25)`,
          ["--fall-dur" as any]: `${c.fallDur}s`,
          ["--spin-dur" as any]: `${c.spinDur}s`,
          ["--delay"    as any]: `${c.delay}s`,
          ["--drift"    as any]: c.drift,
          ["--size"     as any]: `${c.size}`,
          ["--symbol"   as any]: c.symbol,
        }} />
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   2. 🃏 FLOATING CARDS — cartes à jouer 3D qui flottent
════════════════════════════════════════════════════════════════════════════ */
const CARDS_CSS = `
.ll-cards-root {
  position: fixed; inset: 0; z-index: 0;
  pointer-events: none; overflow: hidden;
}
.ll-card-wrap {
  position: absolute;
  will-change: transform, opacity;
  animation:
    ll-card-float  var(--float-dur) ease-in-out infinite alternate,
    ll-card-drift  var(--drift-dur) ease-in-out infinite alternate,
    ll-card-fade   var(--fade-dur)  ease-in-out infinite;
  animation-delay: var(--delay);
  transform-style: preserve-3d;
  perspective: 600px;
}
.ll-card-inner {
  width: var(--w);
  height: var(--h);
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.18);
  background: var(--card-bg);
  box-shadow:
    0 8px 32px rgba(0,0,0,0.55),
    0 0 0 1px rgba(255,255,255,0.06) inset,
    0 1px 0 rgba(255,255,255,0.20) inset;
  display: grid; place-items: center;
  animation: ll-card-rotate var(--rot-dur) ease-in-out infinite alternate;
  animation-delay: var(--delay);
  position: relative; overflow: hidden;
}
/* Reflet haut carte */
.ll-card-inner::before {
  content:""; position:absolute; inset:0;
  background: linear-gradient(160deg, rgba(255,255,255,0.14) 0%, transparent 45%);
  pointer-events:none;
}
.ll-card-suit {
  font-size: var(--suit-size);
  line-height: 1;
  opacity: 0.88;
  filter: drop-shadow(0 2px 8px rgba(0,0,0,0.60));
  user-select: none;
}
/* Corner indices */
.ll-card-tl, .ll-card-br {
  position:absolute;
  font-size: calc(var(--suit-size) * 0.42);
  line-height:1; opacity:0.70; user-select:none;
}
.ll-card-tl { top:6px; left:7px; }
.ll-card-br { bottom:6px; right:7px; transform: rotate(180deg); }

@keyframes ll-card-float {
  0%   { transform: translateY(0px);   }
  100% { transform: translateY(-28px); }
}
@keyframes ll-card-drift {
  0%   { transform: translateX(0px);  }
  100% { transform: translateX(18px); }
}
@keyframes ll-card-rotate {
  0%   { transform: rotateY(0deg)   rotateZ(var(--tilt-start)); }
  100% { transform: rotateY(22deg)  rotateZ(var(--tilt-end));   }
}
@keyframes ll-card-fade {
  0%,100% { opacity: var(--min-op); }
  45%     { opacity: var(--max-op); }
}
@media (prefers-reduced-motion: reduce) {
  .ll-card-wrap, .ll-card-inner { animation: none !important; }
  .ll-card-wrap { opacity: 0.3; }
}
`;

type CardCfg = {
  id: number; x: number; y: number;
  w: number; h: number;
  suit: string; value: string; color: string;
  bg: string;
  floatDur: number; driftDur: number; rotDur: number; fadeDur: number;
  delay: number;
  tiltStart: string; tiltEnd: string;
  minOp: number; maxOp: number;
};

const CARD_DATA: CardCfg[] = [
  { id:1,  x:4,  y:15, w:60, h:84,  suit:"♠", value:"A", color:"rgba(196,181,253,0.90)", bg:"linear-gradient(145deg,rgba(14,11,26,0.92),rgba(22,16,44,0.88))", floatDur:6,  driftDur:8,  rotDur:7,  fadeDur:14, delay:-2,  tiltStart:"-6deg",  tiltEnd:"2deg",   minOp:0.30, maxOp:0.65 },
  { id:2,  x:14, y:55, w:52, h:73,  suit:"♥", value:"K", color:"rgba(248,113,113,0.92)", bg:"linear-gradient(145deg,rgba(14,11,26,0.90),rgba(30,12,24,0.88))", floatDur:8,  driftDur:10, rotDur:9,  fadeDur:18, delay:-7,  tiltStart:"3deg",   tiltEnd:"-5deg",  minOp:0.25, maxOp:0.60 },
  { id:3,  x:24, y:25, w:68, h:95,  suit:"♦", value:"Q", color:"rgba(248,113,113,0.88)", bg:"linear-gradient(145deg,rgba(14,11,26,0.94),rgba(26,12,20,0.90))", floatDur:7,  driftDur:9,  rotDur:8,  fadeDur:16, delay:-12, tiltStart:"-8deg",  tiltEnd:"4deg",   minOp:0.35, maxOp:0.70 },
  { id:4,  x:36, y:65, w:44, h:62,  suit:"♣", value:"J", color:"rgba(167,139,250,0.90)", bg:"linear-gradient(145deg,rgba(14,11,26,0.88),rgba(18,14,36,0.86))", floatDur:9,  driftDur:11, rotDur:10, fadeDur:20, delay:-4,  tiltStart:"5deg",   tiltEnd:"-2deg",  minOp:0.20, maxOp:0.55 },
  { id:5,  x:47, y:20, w:72, h:100, suit:"♠", value:"K", color:"rgba(196,181,253,0.92)", bg:"linear-gradient(145deg,rgba(14,11,26,0.96),rgba(20,14,40,0.92))", floatDur:5,  driftDur:7,  rotDur:6,  fadeDur:12, delay:-9,  tiltStart:"-4deg",  tiltEnd:"7deg",   minOp:0.40, maxOp:0.72 },
  { id:6,  x:58, y:50, w:56, h:78,  suit:"♥", value:"A", color:"rgba(248,113,113,0.92)", bg:"linear-gradient(145deg,rgba(14,11,26,0.90),rgba(28,10,20,0.88))", floatDur:7,  driftDur:9,  rotDur:8,  fadeDur:16, delay:-1,  tiltStart:"2deg",   tiltEnd:"-8deg",  minOp:0.28, maxOp:0.62 },
  { id:7,  x:68, y:30, w:48, h:67,  suit:"♦", value:"10",color:"rgba(252,165,165,0.88)", bg:"linear-gradient(145deg,rgba(14,11,26,0.92),rgba(24,10,18,0.88))", floatDur:8,  driftDur:10, rotDur:9,  fadeDur:18, delay:-14, tiltStart:"-7deg",  tiltEnd:"3deg",   minOp:0.22, maxOp:0.58 },
  { id:8,  x:78, y:60, w:64, h:90,  suit:"♣", value:"A", color:"rgba(167,139,250,0.90)", bg:"linear-gradient(145deg,rgba(14,11,26,0.94),rgba(16,12,32,0.90))", floatDur:6,  driftDur:8,  rotDur:7,  fadeDur:14, delay:-6,  tiltStart:"6deg",   tiltEnd:"-4deg",  minOp:0.32, maxOp:0.68 },
  { id:9,  x:88, y:22, w:50, h:70,  suit:"♠", value:"Q", color:"rgba(196,181,253,0.88)", bg:"linear-gradient(145deg,rgba(14,11,26,0.90),rgba(20,14,40,0.86))", floatDur:9,  driftDur:11, rotDur:10, fadeDur:20, delay:-11, tiltStart:"-3deg",  tiltEnd:"8deg",   minOp:0.25, maxOp:0.60 },
  { id:10, x:5,  y:72, w:40, h:56,  suit:"♥", value:"7", color:"rgba(248,113,113,0.85)", bg:"linear-gradient(145deg,rgba(14,11,26,0.88),rgba(26,10,20,0.84))", floatDur:10, driftDur:12, rotDur:11, fadeDur:22, delay:-3,  tiltStart:"4deg",   tiltEnd:"-6deg",  minOp:0.18, maxOp:0.50 },
  { id:11, x:30, y:8,  w:58, h:81,  suit:"♦", value:"K", color:"rgba(252,165,165,0.90)", bg:"linear-gradient(145deg,rgba(14,11,26,0.93),rgba(26,10,18,0.88))", floatDur:7,  driftDur:9,  rotDur:8,  fadeDur:16, delay:-16, tiltStart:"-5deg",  tiltEnd:"3deg",   minOp:0.30, maxOp:0.64 },
  { id:12, x:92, y:70, w:46, h:64,  suit:"♣", value:"Q", color:"rgba(167,139,250,0.88)", bg:"linear-gradient(145deg,rgba(14,11,26,0.90),rgba(14,12,30,0.86))", floatDur:8,  driftDur:10, rotDur:9,  fadeDur:18, delay:-8,  tiltStart:"7deg",   tiltEnd:"-3deg",  minOp:0.20, maxOp:0.56 },
];

function FloatingCards() {
  useInjectCss("ll-cards-css", CARDS_CSS);
  return (
    <div className="ll-cards-root" aria-hidden>
      {CARD_DATA.map((c) => (
        <div key={c.id} className="ll-card-wrap" style={{
          left: `${c.x}%`, top: `${c.y}%`,
          ["--float-dur"   as any]: `${c.floatDur}s`,
          ["--drift-dur"   as any]: `${c.driftDur}s`,
          ["--rot-dur"     as any]: `${c.rotDur}s`,
          ["--fade-dur"    as any]: `${c.fadeDur}s`,
          ["--delay"       as any]: `${c.delay}s`,
          ["--tilt-start"  as any]: c.tiltStart,
          ["--tilt-end"    as any]: c.tiltEnd,
          ["--min-op"      as any]: `${c.minOp}`,
          ["--max-op"      as any]: `${c.maxOp}`,
        }}>
          <div className="ll-card-inner" style={{
            ["--w"         as any]: `${c.w}px`,
            ["--h"         as any]: `${c.h}px`,
            ["--suit-size" as any]: `${Math.round(c.w * 0.45)}px`,
            width: `${c.w}px`, height: `${c.h}px`,
            background: c.bg,
          }}>
            <div className="ll-card-tl" style={{ color: c.color }}>{c.value}<br/>{c.suit}</div>
            <div className="ll-card-suit" style={{ color: c.color }}>{c.suit}</div>
            <div className="ll-card-br" style={{ color: c.color }}>{c.value}<br/>{c.suit}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   3. 🌊 AURORA CURTAIN — rideaux de lumière nordique ondulants
════════════════════════════════════════════════════════════════════════════ */
const AURORA_CSS = `
.ll-aurora-root {
  position: fixed; inset: 0; z-index: 0;
  pointer-events: none; overflow: hidden;
}
.ll-aurora-band {
  position: absolute;
  top: -20%;
  width: var(--band-w);
  height: 140%;
  will-change: transform, opacity;
  filter: blur(var(--band-blur));
  animation:
    ll-aurora-wave  var(--wave-dur)  ease-in-out infinite alternate,
    ll-aurora-pulse var(--pulse-dur) ease-in-out infinite;
  animation-delay: var(--delay);
  border-radius: 50% / 10%;
  transform-origin: 50% 0%;
}
@keyframes ll-aurora-wave {
  0%   {
    transform: skewX(-12deg) scaleX(1.0) translateX(0px);
    opacity: var(--min-op);
  }
  30%  {
    transform: skewX(-4deg)  scaleX(1.08) translateX(var(--tx-mid));
    opacity: var(--max-op);
  }
  70%  {
    transform: skewX( 6deg)  scaleX(0.95) translateX(var(--tx-far));
    opacity: var(--max-op);
  }
  100% {
    transform: skewX( 14deg) scaleX(1.04) translateX(var(--tx-end));
    opacity: var(--min-op);
  }
}
@keyframes ll-aurora-pulse {
  0%,100% { filter: blur(var(--band-blur)) brightness(1.0); }
  45%     { filter: blur(calc(var(--band-blur) - 6px)) brightness(1.25); }
}
@media (prefers-reduced-motion: reduce) {
  .ll-aurora-band { animation: none !important; opacity: 0.15; }
}
`;

type AuroraBand = {
  id: number; x: number; w: number;
  gradient: string; blur: number;
  waveDur: number; pulseDur: number; delay: number;
  txMid: string; txFar: string; txEnd: string;
  minOp: number; maxOp: number;
};

const AURORA_BANDS: AuroraBand[] = [
  { id:1, x:-5,  w:28, gradient:"linear-gradient(180deg,rgba(124,92,252,0.0) 0%,rgba(124,92,252,0.55) 25%,rgba(167,139,255,0.65) 50%,rgba(91,142,248,0.40) 75%,rgba(124,92,252,0.0) 100%)", blur:18, waveDur:12, pulseDur:8,  delay:-2,  txMid:"30px",  txFar:"-20px", txEnd:"10px",  minOp:0.30, maxOp:0.72 },
  { id:2, x:8,   w:22, gradient:"linear-gradient(180deg,rgba(59,77,200,0.0) 0%,rgba(59,77,200,0.48) 20%,rgba(91,142,248,0.60) 48%,rgba(167,139,255,0.50) 78%,rgba(59,77,200,0.0) 100%)", blur:22, waveDur:15, pulseDur:11, delay:-7,  txMid:"-25px", txFar:"35px",  txEnd:"-10px", minOp:0.25, maxOp:0.65 },
  { id:3, x:20,  w:32, gradient:"linear-gradient(180deg,rgba(196,181,253,0.0) 0%,rgba(167,139,255,0.50) 22%,rgba(124,92,252,0.70) 50%,rgba(91,142,248,0.48) 80%,rgba(196,181,253,0.0) 100%)", blur:16, waveDur:10, pulseDur:7,  delay:-4,  txMid:"40px",  txFar:"-30px", txEnd:"15px",  minOp:0.35, maxOp:0.78 },
  { id:4, x:38,  w:24, gradient:"linear-gradient(180deg,rgba(91,142,248,0.0) 0%,rgba(91,142,248,0.45) 25%,rgba(59,77,200,0.58) 52%,rgba(124,92,252,0.42) 78%,rgba(91,142,248,0.0) 100%)", blur:20, waveDur:13, pulseDur:9,  delay:-11, txMid:"-35px", txFar:"25px",  txEnd:"-15px", minOp:0.28, maxOp:0.68 },
  { id:5, x:52,  w:30, gradient:"linear-gradient(180deg,rgba(124,92,252,0.0) 0%,rgba(124,92,252,0.52) 20%,rgba(196,181,253,0.68) 50%,rgba(167,139,255,0.46) 82%,rgba(124,92,252,0.0) 100%)", blur:14, waveDur:11, pulseDur:8,  delay:-1,  txMid:"28px",  txFar:"-42px", txEnd:"20px",  minOp:0.32, maxOp:0.74 },
  { id:6, x:66,  w:26, gradient:"linear-gradient(180deg,rgba(167,139,255,0.0) 0%,rgba(167,139,255,0.46) 24%,rgba(91,142,248,0.62) 52%,rgba(59,77,200,0.44) 80%,rgba(167,139,255,0.0) 100%)", blur:24, waveDur:14, pulseDur:10, delay:-6,  txMid:"-28px", txFar:"38px",  txEnd:"-12px", minOp:0.26, maxOp:0.66 },
  { id:7, x:78,  w:20, gradient:"linear-gradient(180deg,rgba(91,142,248,0.0) 0%,rgba(91,142,248,0.42) 22%,rgba(124,92,252,0.56) 50%,rgba(196,181,253,0.40) 80%,rgba(91,142,248,0.0) 100%)", blur:18, waveDur:9,  pulseDur:6,  delay:-9,  txMid:"32px",  txFar:"-22px", txEnd:"8px",   minOp:0.22, maxOp:0.60 },
  { id:8, x:88,  w:28, gradient:"linear-gradient(180deg,rgba(59,77,200,0.0) 0%,rgba(124,92,252,0.50) 26%,rgba(167,139,255,0.64) 54%,rgba(91,142,248,0.42) 82%,rgba(59,77,200,0.0) 100%)", blur:20, waveDur:16, pulseDur:12, delay:-3,  txMid:"-30px", txFar:"20px",  txEnd:"-18px", minOp:0.28, maxOp:0.70 },
  { id:9, x:102, w:24, gradient:"linear-gradient(180deg,rgba(124,92,252,0.0) 0%,rgba(91,142,248,0.44) 20%,rgba(167,139,255,0.58) 48%,rgba(124,92,252,0.36) 78%,rgba(124,92,252,0.0) 100%)", blur:22, waveDur:12, pulseDur:9,  delay:-14, txMid:"26px",  txFar:"-36px", txEnd:"14px",  minOp:0.24, maxOp:0.62 },
];

function AuroraCurtain() {
  useInjectCss("ll-aurora-css", AURORA_CSS);
  return (
    <div className="ll-aurora-root" aria-hidden>
      {AURORA_BANDS.map((b) => (
        <div key={b.id} className="ll-aurora-band" style={{
          left: `${b.x}%`,
          width: `${b.w}vw`,
          background: b.gradient,
          ["--band-w"    as any]: `${b.w}vw`,
          ["--band-blur" as any]: `${b.blur}px`,
          ["--wave-dur"  as any]: `${b.waveDur}s`,
          ["--pulse-dur" as any]: `${b.pulseDur}s`,
          ["--delay"     as any]: `${b.delay}s`,
          ["--tx-mid"    as any]: b.txMid,
          ["--tx-far"    as any]: b.txFar,
          ["--tx-end"    as any]: b.txEnd,
          ["--min-op"    as any]: `${b.minOp}`,
          ["--max-op"    as any]: `${b.maxOp}`,
        }} />
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   4. 💫 SHOOTING STARS — étoiles filantes en diagonale
════════════════════════════════════════════════════════════════════════════ */
const STARS_CSS = `
.ll-stars-root {
  position: fixed; inset: 0; z-index: 0;
  pointer-events: none; overflow: hidden;
}
.ll-star {
  position: absolute;
  will-change: transform, opacity;
  border-radius: 999px;
  animation:
    ll-star-shoot var(--dur) ease-in-out infinite,
    ll-star-fade  var(--dur) ease-in-out infinite;
  animation-delay: var(--delay);
}
/* Queue lumineuse */
.ll-star::before {
  content: "";
  position: absolute;
  right: 100%; top: 50%;
  transform: translateY(-50%);
  width: var(--tail-w);
  height: var(--star-h);
  border-radius: 999px;
  background: linear-gradient(90deg, transparent, var(--star-color));
  opacity: 0.80;
}
/* Point brillant en tête */
.ll-star::after {
  content: "";
  position: absolute; inset: 0;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(255,255,255,0.90), var(--star-color) 60%, transparent);
  filter: blur(1px);
}

@keyframes ll-star-shoot {
  0%   { transform: translateX(0)          translateY(0)          rotate(var(--angle)); }
  100% { transform: translateX(var(--tx))  translateY(var(--ty))  rotate(var(--angle)); }
}
@keyframes ll-star-fade {
  0%        { opacity: 0;    }
  5%        { opacity: 0;    }
  15%       { opacity: 1;    }
  75%       { opacity: 0.90; }
  90%       { opacity: 0;    }
  100%      { opacity: 0;    }
}
@media (prefers-reduced-motion: reduce) {
  .ll-star { animation: none !important; opacity: 0 !important; }
}
`;

type StarCfg = {
  id: number; x: number; y: number;
  w: number; h: number; tailW: number;
  color: string; dur: number; delay: number;
  angle: string; tx: string; ty: string;
};

const STAR_DATA: StarCfg[] = [
  // Traversées longues (diagonale principale ↘)
  { id:1,  x:5,  y:8,  w:6,  h:2, tailW:80,  color:"rgba(196,181,253,0.90)", dur:4,  delay:-0.5, angle:"20deg",  tx:"160vw",  ty:"60vh"  },
  { id:2,  x:15, y:3,  w:4,  h:2, tailW:60,  color:"rgba(255,255,255,0.85)", dur:5,  delay:-2,   angle:"18deg",  tx:"140vw",  ty:"55vh"  },
  { id:3,  x:0,  y:20, w:8,  h:3, tailW:110, color:"rgba(167,139,250,0.92)", dur:3.5,delay:-4,   angle:"22deg",  tx:"150vw",  ty:"65vh"  },
  { id:4,  x:25, y:5,  w:5,  h:2, tailW:70,  color:"rgba(91,142,248,0.88)", dur:6,   delay:-7,   angle:"19deg",  tx:"155vw",  ty:"58vh"  },
  { id:5,  x:8,  y:35, w:7,  h:2, tailW:90,  color:"rgba(196,181,253,0.85)", dur:4.5,delay:-1,   angle:"21deg",  tx:"145vw",  ty:"62vh"  },
  // Traversées plus courtes et plus fréquentes
  { id:6,  x:40, y:10, w:4,  h:2, tailW:50,  color:"rgba(255,255,255,0.80)", dur:3,  delay:-3,   angle:"25deg",  tx:"100vw",  ty:"50vh"  },
  { id:7,  x:60, y:2,  w:5,  h:2, tailW:65,  color:"rgba(196,181,253,0.88)", dur:4,  delay:-8,   angle:"17deg",  tx:"110vw",  ty:"45vh"  },
  { id:8,  x:70, y:18, w:6,  h:2, tailW:75,  color:"rgba(167,139,250,0.85)", dur:5,  delay:-5,   angle:"23deg",  tx:"120vw",  ty:"52vh"  },
  { id:9,  x:80, y:6,  w:4,  h:2, tailW:55,  color:"rgba(91,142,248,0.90)", dur:3.5, delay:-10,  angle:"20deg",  tx:"95vw",   ty:"48vh"  },
  { id:10, x:50, y:28, w:7,  h:3, tailW:95,  color:"rgba(255,255,255,0.82)", dur:4,  delay:-6,   angle:"22deg",  tx:"130vw",  ty:"56vh"  },
  // Petites rapides — effet "pluie d'étoiles" subtile
  { id:11, x:18, y:12, w:3,  h:1, tailW:38,  color:"rgba(196,181,253,0.75)", dur:2.5,delay:-1.5, angle:"19deg",  tx:"80vw",   ty:"38vh"  },
  { id:12, x:35, y:40, w:3,  h:1, tailW:42,  color:"rgba(167,139,250,0.72)", dur:3,  delay:-9,   angle:"24deg",  tx:"85vw",   ty:"42vh"  },
  { id:13, x:55, y:14, w:4,  h:1, tailW:48,  color:"rgba(91,142,248,0.78)", dur:2.8, delay:-4.5, angle:"21deg",  tx:"90vw",   ty:"40vh"  },
  { id:14, x:75, y:30, w:3,  h:1, tailW:36,  color:"rgba(255,255,255,0.70)", dur:3.2,delay:-12,  angle:"18deg",  tx:"78vw",   ty:"36vh"  },
  { id:15, x:90, y:10, w:4,  h:1, tailW:44,  color:"rgba(196,181,253,0.76)", dur:2.6,delay:-2.5, angle:"22deg",  tx:"82vw",   ty:"39vh"  },
];

function ShootingStars() {
  useInjectCss("ll-stars-css", STARS_CSS);
  return (
    <div className="ll-stars-root" aria-hidden>
      {STAR_DATA.map((s) => (
        <div key={s.id} className="ll-star" style={{
          left: `${s.x}%`, top: `${s.y}%`,
          width: `${s.w}px`, height: `${s.h}px`,
          ["--star-h"   as any]: `${s.h}px`,
          ["--tail-w"   as any]: `${s.tailW}px`,
          ["--star-color" as any]: s.color,
          ["--dur"      as any]: `${s.dur}s`,
          ["--delay"    as any]: `${s.delay}s`,
          ["--angle"    as any]: s.angle,
          ["--tx"       as any]: s.tx,
          ["--ty"       as any]: s.ty,
        }} />
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   5. 🔮 BUBBLES (reprise LavaLamp inline pour compatibilité)
════════════════════════════════════════════════════════════════════════════ */
const BUBBLES_CSS = `
.ll-bbl-root { position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden; }
.ll-bbl {
  position:absolute; bottom:-20%; border-radius:50%;
  will-change:transform,opacity;
  box-shadow: inset -8px -8px 20px rgba(0,0,0,0.30), inset 4px 4px 12px rgba(255,255,255,0.18);
  animation: ll-bbl-rise var(--dur) ease-in-out infinite, ll-bbl-sway var(--sway) ease-in-out infinite alternate, ll-bbl-fade var(--dur) ease-in-out infinite;
  animation-delay: var(--delay);
}
@keyframes ll-bbl-rise { 0%{transform:translateY(0) scale(1)} 50%{transform:translateY(-55vh) scale(1.06)} 100%{transform:translateY(-110vh) scale(0.92)} }
@keyframes ll-bbl-sway { 0%{margin-left:0} 25%{margin-left:-18px} 75%{margin-left:16px} 100%{margin-left:8px} }
@keyframes ll-bbl-fade { 0%{opacity:0} 12%{opacity:1} 80%{opacity:0.85} 100%{opacity:0} }
@media (prefers-reduced-motion:reduce) { .ll-bbl{animation:none!important;opacity:0!important} }
`;

const BBL_DATA = [
  {id:1,x:4,sz:90,dur:16,delay:0,c:"rgba(124,92,252,0.70)"},{id:2,x:14,sz:52,dur:22,delay:-4,c:"rgba(167,139,255,0.60)"},
  {id:3,x:24,sz:130,dur:28,delay:-9,c:"rgba(124,92,252,0.55)"},{id:4,x:36,sz:38,dur:18,delay:-2,c:"rgba(91,142,248,0.65)"},
  {id:5,x:47,sz:68,dur:24,delay:-14,c:"rgba(196,181,253,0.50)"},{id:6,x:58,sz:110,dur:30,delay:-6,c:"rgba(124,92,252,0.60)"},
  {id:7,x:68,sz:44,dur:19,delay:-11,c:"rgba(167,139,255,0.65)"},{id:8,x:78,sz:76,dur:25,delay:-1,c:"rgba(91,142,248,0.55)"},
  {id:9,x:88,sz:58,dur:21,delay:-8,c:"rgba(59,77,200,0.70)"},{id:10,x:96,sz:95,dur:26,delay:-4,c:"rgba(124,92,252,0.62)"},
];

function lighten(rgba:string){return rgba.replace(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/,(_,r,g,b,a)=>`rgba(${Math.min(255,Math.round(+r*1.5))},${Math.min(255,Math.round(+g*1.5))},${Math.min(255,Math.round(+b*1.5))},${Math.min(1,+a*0.9)})`);}
function darken(rgba:string){return rgba.replace(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/,(_,r,g,b,a)=>`rgba(${Math.round(+r*0.55)},${Math.round(+g*0.55)},${Math.round(+b*0.55)},${+a})`);}

function LavaLampBubbles() {
  useInjectCss("ll-bbl-css", BUBBLES_CSS);
  return (
    <div className="ll-bbl-root" aria-hidden>
      {BBL_DATA.map(b=>(
        <div key={b.id} className="ll-bbl" style={{
          left:`${b.x}%`, width:`${b.sz}px`, height:`${b.sz}px`,
          background:`radial-gradient(circle at 35% 35%,${lighten(b.c)},${b.c} 55%,${darken(b.c)} 100%)`,
          ["--dur" as any]:`${b.dur}s`, ["--sway" as any]:`${(b.dur*0.6).toFixed(1)}s`, ["--delay" as any]:`${b.delay}s`,
        }}/>
      ))}
    </div>
  );
}