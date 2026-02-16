// web/src/pages/LivesPage.mobile.tsx
// ─────────────────────────────────────────────────────────────────────────────
//  LunaLive — Mobile  |  Design System : Purple Velvet × Blue Night
//  Police : Syne 800 (titres) + système natif (corps)
//  Palette : #7c5cfc / #a78bfa / #5b8ef8 / #c4b5fd  (alignée sur LivesPage.css)
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";
import { Link } from "react-router-dom";

import { formatViewers } from "../lib/format";
import { svgThumb }       from "../lib/thumb";
import { DailyWheelCard }      from "../components/DailyWheelCard";
import { DailyBonusAccessCard } from "../components/DailyBonusAccessCard";
import type { LiveCardVM, ClipVM } from "./LivesPage";

/* ─── CSS injecté une seule fois ─────────────────────────────────────── */
const MOBILE_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@500;700;800&display=swap');

/* ══ Tokens ══════════════════════════════════════════════════════════════ */
.lm-page {
  --lm-purple:       #7c5cfc;
  --lm-purple-2:     #a78bfa;
  --lm-purple-pale:  #c4b5fd;
  --lm-blue:         #5b8ef8;
  --lm-blue-2:       #3b4dc8;
  --lm-blue-pale:    #93c5fd;
  --lm-red:          #ef4444;
  --lm-gold:         #fbbf24;
  --lm-gold-pale:    #fde68a;
  --lm-text-1:       rgba(235,232,255,.96);
  --lm-text-2:       rgba(180,185,230,.70);
  --lm-text-3:       rgba(140,145,195,.50);
  --lm-border:       rgba(124,92,252,.16);
  --lm-border-soft:  rgba(124,92,252,.28);
  --lm-surface:      rgba(11,9,22,.92);
  --lm-surface-2:    rgba(18,16,34,.90);
  --lm-ease:         cubic-bezier(.22,1,.36,1);
  --lm-grad: linear-gradient(105deg,#c4b5fd 0%,#7c5cfc 35%,#5b8ef8 70%,#93c5fd 100%);
  --lm-safe-bottom: env(safe-area-inset-bottom, 0px);
}

/* ══ Page shell ══════════════════════════════════════════════════════════ */
.lm-page {
  min-height: 100vh;
  padding: 0 0 calc(80px + var(--lm-safe-bottom));
  color: var(--lm-text-1);
  font-family: 'Syne', system-ui, sans-serif;
  position: relative;
  overflow-x: hidden;
}

/* Aurora fixe */
.lm-page::before {
  content: "";
  position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background:
    radial-gradient(ellipse 110vw 55vh at 15% -5%,  rgba(124,92,252,.13),  transparent 58%),
    radial-gradient(ellipse  80vw 45vh at 88%  40%,  rgba(59,77,200,.10),   transparent 58%),
    radial-gradient(ellipse  70vw 50vh at 45% 105%,  rgba(91,142,248,.08),  transparent 55%);
  transform: translateZ(0);
}

/* Grain subtil */
.lm-page::after {
  content: "";
  position: fixed; inset: 0; z-index: 0; pointer-events: none;
  opacity: .022;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 180px 180px;
}

/* ══ Scroll content ══════════════════════════════════════════════════════ */
.lm-scroll {
  position: relative; z-index: 1;
  padding: 12px 12px 0;
  display: flex; flex-direction: column; gap: 10px;
}

/* ══ Header hero ════════════════════════════════════════════════════════ */
.lm-hero {
  position: relative; overflow: hidden;
  border-radius: 22px;
  border: 1px solid rgba(124,92,252,.20);
  background: rgba(11,9,22,.88);
  box-shadow: 0 24px 70px rgba(0,0,0,.50), 0 0 0 1px rgba(167,139,250,.06) inset;
  backdrop-filter: blur(22px); -webkit-backdrop-filter: blur(22px);
  padding: 16px 16px 14px;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
}
/* Reflet haut */
.lm-hero::before {
  content:""; position:absolute; top:0; left:8%; right:8%; height:1px;
  background: linear-gradient(90deg, transparent, rgba(167,139,250,.45) 40%, rgba(91,142,248,.35) 60%, transparent);
  pointer-events: none;
}
/* Lueur ambiante */
.lm-hero::after {
  content:""; position:absolute; top:-50px; left:-50px;
  width:260px; height:160px; border-radius:50%;
  background: radial-gradient(ellipse, rgba(124,92,252,.14), transparent 70%);
  pointer-events: none;
}
.lm-hero-left { position:relative; z-index:1; }

.lm-logo {
  margin: 0;
  font-family: 'Syne', sans-serif;
  font-weight: 800; font-size: 28px; letter-spacing: -1.2px; line-height: 1;
  display: inline-block;
  background: var(--lm-grad);
  background-size: 220% 100%;
  -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 0 14px rgba(124,92,252,.55)) drop-shadow(0 0 36px rgba(91,142,248,.22));
  animation: lm-shimmer 5s ease-in-out infinite;
}
@keyframes lm-shimmer {
  0%  { background-position: 0%   50%; }
  50% { background-position: 100% 50%; }
  100%{ background-position: 0%   50%; }
}

.lm-sub {
  margin-top: 5px;
  font-size: 11px; font-weight: 500; color: var(--lm-text-3);
  display: flex; align-items: center; gap: 8px;
}

.lm-hero-pills {
  position: relative; z-index: 1;
  display: flex; flex-direction: column; align-items: flex-end; gap: 7px;
}

/* Ping live */
.lm-ping {
  width: 7px; height: 7px; border-radius: 999px;
  background: var(--lm-red);
  box-shadow: 0 0 0 5px rgba(239,68,68,.18);
  display: inline-block; vertical-align: middle; margin-right: 4px;
  animation: lm-ping 1.6s ease-in-out infinite;
}
@keyframes lm-ping {
  0%,100% { box-shadow: 0 0 0 5px rgba(239,68,68,.18); }
  50%      { box-shadow: 0 0 0 8px rgba(239,68,68,.05); }
}

/* Refreshing pulse */
.lm-refreshing {
  width: 6px; height: 6px; border-radius: 999px;
  background: rgba(167,139,250,.80);
  animation: lm-blink 1s ease-in-out infinite;
}
@keyframes lm-blink { 0%,100%{opacity:1} 50%{opacity:.28} }

/* ══ Pills ══════════════════════════════════════════════════════════════ */
.lm-pill {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 11px; border-radius: 999px;
  font-family: 'Syne', system-ui, sans-serif;
  font-size: 11px; font-weight: 700; letter-spacing: -.05px;
  white-space: nowrap;
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  -webkit-tap-highlight-color: transparent;
}
.lm-pill-live  { background:rgba(239,68,68,.14); border:1px solid rgba(239,68,68,.28); color:#fca5a5; }
.lm-pill-neutral{ background:rgba(0,0,0,.50);   border:1px solid rgba(255,255,255,.10); color:rgba(235,232,255,.92); }
.lm-pill-gold  { background:rgba(251,191,36,.14); border:1px solid rgba(251,191,36,.28); color:#fde68a; }
.lm-pill-brand { background:rgba(124,92,252,.16); border:1px solid rgba(124,92,252,.30); color:rgba(196,181,253,.90); }

/* ══ Section header ═════════════════════════════════════════════════════ */
.lm-section-head {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  margin: 4px 2px 8px;
}
.lm-section-title {
  margin: 0;
  font-family: 'Syne', sans-serif;
  font-size: 10.5px; font-weight: 700;
  letter-spacing: .18em; text-transform: uppercase;
  color: var(--lm-text-2);
  position: relative; padding-left: 12px;
}
/* barre colorée gauche */
.lm-section-title::before {
  content: "";
  position: absolute; left:0; top:50%; transform: translateY(-50%);
  width: 3px; height: 10px; border-radius: 2px;
  background: linear-gradient(180deg, var(--lm-purple-2), var(--lm-blue));
}
.lm-section-hint {
  font-size: 11px; font-weight: 600; color: var(--lm-text-3);
}

/* ══ Error ══════════════════════════════════════════════════════════════ */
.lm-err {
  padding: 10px 14px; border-radius: 14px;
  border: 1px solid rgba(239,68,68,.28); background: rgba(239,68,68,.08);
  font-size: 12px; font-weight: 500; color: rgba(252,165,165,.85);
}

/* ══ Lives grid ═════════════════════════════════════════════════════════ */
.lm-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0,1fr));
  gap: 10px;
}
@media (max-width: 360px) { .lm-grid { grid-template-columns: 1fr; } }
@media (min-width: 560px) { .lm-grid { grid-template-columns: repeat(3, minmax(0,1fr)); } }

.lm-card-link { text-decoration: none; color: inherit; display: block; }

/* Card glass */
.lm-card {
  position: relative; overflow: hidden;
  border-radius: 18px;
  border: 1px solid rgba(124,92,252,.16);
  background: rgba(13,11,24,.85);
  box-shadow: 0 14px 40px rgba(0,0,0,.38);
  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
  transition: transform 180ms var(--lm-ease), box-shadow 180ms var(--lm-ease);
  -webkit-tap-highlight-color: transparent;
}
.lm-card:active { transform: scale(.98); }
/* Reflet haut carte */
.lm-card::before {
  content:""; position:absolute; top:0; left:8%; right:8%; height:1px;
  background: linear-gradient(90deg, transparent, rgba(167,139,250,.28) 45%, rgba(91,142,248,.20) 65%, transparent);
  pointer-events:none; z-index:2;
}

.lm-card-featured {
  border-color: rgba(251,191,36,.24);
  background: radial-gradient(600px 180px at 20% 0%, rgba(251,191,36,.10), transparent 60%), rgba(13,11,24,.86);
}

/* Thumb */
.lm-thumb {
  position: relative;
  height: 108px;
  overflow: hidden;
  border-radius: 16px 16px 0 0;
  background: rgba(0,0,0,.35);
}
.lm-thumb::after {
  content:""; position:absolute; inset:0;
  background:
    linear-gradient(180deg, rgba(0,0,0,0) 38%, rgba(0,0,0,.62) 100%),
    linear-gradient(135deg, rgba(124,92,252,.06), rgba(59,77,200,.06));
  pointer-events:none;
}

.lm-thumb-bg {
  position:absolute; inset:0;
  background-size:cover; background-position:center; background-repeat:no-repeat;
  opacity:.92; filter: contrast(1.06) saturate(1.18) brightness(1.02);
  transform: scale(1.04);
}

/* Badge row dans le thumb */
.lm-thumb-top {
  position:absolute; top:8px; left:8px; right:8px;
  display:flex; justify-content:space-between; align-items:center; gap:6px;
  pointer-events:none; z-index:3;
}
.lm-thumb-bottom {
  position:absolute; bottom:8px; left:8px; right:8px;
  display:flex; justify-content:flex-end; align-items:center; gap:6px;
  pointer-events:none; z-index:3;
}

/* Card body */
.lm-card-body {
  padding: 9px 10px 11px;
  display: flex; flex-direction:column; gap: 7px;
}
.lm-card-row {
  display: flex; align-items: center; gap: 8px; min-width: 0;
}
.lm-card-name {
  font-family:'Syne', sans-serif; font-weight:700; font-size:12px; letter-spacing:-.2px;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  color: rgba(235,232,255,.94); flex:1; min-width:0;
}
.lm-card-viewers {
  font-family:'Syne', sans-serif; font-size:11px; font-weight:700;
  color: var(--lm-text-2); white-space:nowrap; flex-shrink:0;
}
.lm-card-title {
  font-size:11px; font-weight:500; line-height:1.3;
  color: var(--lm-text-2);
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
  min-height: 28px;
}
.lm-card-follow {
  font-size:10px; font-weight:500; color: var(--lm-text-3);
}

/* Divider signature */
.lm-card-divider {
  height:1px; border-radius:999px;
  background: linear-gradient(90deg, rgba(124,92,252,0), rgba(124,92,252,.30), rgba(91,142,248,.22), rgba(91,142,248,0));
}
.lm-card-featured .lm-card-divider {
  background: linear-gradient(90deg, rgba(251,191,36,0), rgba(251,191,36,.38), rgba(251,191,36,0));
}

/* Avatar inline */
.lm-ava {
  width: 22px; height: 22px; border-radius: 8px; overflow:hidden;
  border: 1px solid rgba(255,255,255,.14); background: rgba(0,0,0,.35); flex-shrink:0;
}
.lm-ava img { width:100%; height:100%; object-fit:cover; display:block; }

/* ══ Clips section ══════════════════════════════════════════════════════ */
.lm-clips-card {
  position: relative; overflow:hidden;
  border-radius: 20px;
  border: 1px solid rgba(124,92,252,.20);
  background: rgba(11,9,22,.88);
  box-shadow: 0 20px 60px rgba(0,0,0,.45);
  backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
}
.lm-clips-card::before {
  content:""; position:absolute; top:0; left:8%; right:8%; height:1px;
  background: linear-gradient(90deg, transparent, rgba(167,139,250,.40) 40%, rgba(91,142,248,.30) 65%, transparent);
  pointer-events:none;
}

.lm-clips-header {
  display:flex; align-items:center; justify-content:space-between; gap:10px;
  padding: 13px 14px 10px;
}
.lm-clips-title {
  margin:0;
  font-family:'Syne', sans-serif; font-weight:800; font-size:15px; letter-spacing:-.4px;
  background: var(--lm-grad);
  background-size: 220% 100%;
  -webkit-background-clip:text; background-clip:text; color:transparent;
  filter: drop-shadow(0 0 8px rgba(124,92,252,.42)) drop-shadow(0 0 20px rgba(91,142,248,.16));
  display:flex; align-items:center; gap:8px;
}
.lm-clips-count {
  font-size:11px; font-weight:600;
  color: var(--lm-text-3);
  padding: 4px 9px; border-radius:999px;
  border: 1px solid rgba(124,92,252,.14); background: rgba(124,92,252,.06);
}

/* Clip tiles grid 2×2 */
.lm-clips-grid {
  padding: 0 12px 12px;
  display:grid; grid-template-columns:1fr 1fr; gap:8px;
  position:relative;
}

.lm-clip-tile {
  position:relative; overflow:hidden;
  border-radius: 14px; min-height:96px;
  border: 1px solid rgba(124,92,252,.14);
  background: rgba(255,255,255,.04);
  cursor:pointer; padding:0;
  -webkit-tap-highlight-color:transparent;
  transition: border-color 160ms ease, transform 160ms var(--lm-ease);
}
.lm-clip-tile:active { transform: scale(.96); }

.lm-clip-bg {
  position:absolute; inset:0;
  background-size:cover; background-position:center; background-repeat:no-repeat;
  opacity:.88; filter: contrast(1.04) saturate(1.10);
  transform: scale(1.04); transition: opacity 200ms ease, transform 200ms var(--lm-ease);
}
.lm-clip-tile:active .lm-clip-bg { opacity:1; transform:scale(1); }

/* Overlay violet */
.lm-clip-tile::before {
  content:""; position:absolute; inset:0; z-index:1;
  background:
    radial-gradient(200px 80px at 30% 0%, rgba(124,92,252,.16), transparent 60%),
    linear-gradient(180deg, rgba(0,0,0,.04), rgba(0,0,0,.32));
  pointer-events:none;
}

/* Bouton play centré */
.lm-clip-play {
  position:absolute; inset:0; z-index:2;
  display:grid; place-items:center; pointer-events:none;
}
.lm-clip-play-btn {
  width:38px; height:38px; border-radius:999px;
  display:grid; place-items:center;
  background: rgba(0,0,0,.55);
  border: 1px solid rgba(255,255,255,.16);
  backdrop-filter: blur(10px);
  box-shadow: 0 6px 24px rgba(0,0,0,.42);
  font-size:13px;
}

/* Badge likes (coin) */
.lm-clip-badge {
  position:absolute; z-index:3;
  display:inline-flex; align-items:center; gap:5px;
  padding: 4px 8px; border-radius:999px;
  font-family:'Syne',system-ui,sans-serif; font-size:10px; font-weight:700;
  background: rgba(0,0,0,.58); border: 1px solid rgba(255,255,255,.10);
  backdrop-filter: blur(8px); pointer-events:none;
}
.lm-clip-badge-tl { top:7px; left:7px; }
.lm-clip-badge-tr { top:7px; right:7px; }
.lm-clip-badge-bl { bottom:7px; left:7px; }
.lm-clip-badge-br { bottom:7px; right:7px; }

/* Avatar centré sur clip */
.lm-clip-ava {
  position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); z-index:2;
  width:36px; height:36px; border-radius:12px; overflow:hidden;
  border: 1px solid rgba(255,255,255,.18); background: rgba(0,0,0,.42);
  backdrop-filter: blur(8px); box-shadow: 0 6px 24px rgba(0,0,0,.40);
  pointer-events:none;
}
.lm-clip-ava img { width:100%; height:100%; object-fit:cover; display:block; }

/* Croix centrale (quand il y a un overlay "+X clips") */
.lm-clips-cross {
  position:absolute; left:50%; top:50%;
  width:36px; height:36px; transform:translate(-50%,-50%);
  border-radius:11px; z-index:2;
  border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.03);
  backdrop-filter: blur(10px); pointer-events:none; opacity:.80;
}
.lm-clips-more-overlay {
  position:absolute; inset:0; z-index:3;
  display:grid; place-items:center;
  background:transparent; border:0; cursor:pointer;
  -webkit-tap-highlight-color:transparent;
}
.lm-clips-more-bubble {
  padding: 8px 13px; border-radius:13px;
  background: rgba(0,0,0,.62); border: 1px solid rgba(124,92,252,.22);
  backdrop-filter: blur(14px);
  font-family:'Syne',system-ui,sans-serif; font-size:13px; font-weight:700; letter-spacing:-.2px;
}
.lm-clips-more-bubble strong {
  background: var(--lm-grad); background-size:200% 100%;
  -webkit-background-clip:text; background-clip:text; color:transparent;
}

/* Voir tous les clips */
.lm-clips-see-all {
  margin: 0 12px 13px;
  width: calc(100% - 24px);
  padding: 12px 14px; border-radius:14px;
  border: 1px solid rgba(124,92,252,.28);
  background: linear-gradient(135deg, rgba(124,92,252,.18), rgba(59,77,200,.14), rgba(91,142,248,.10));
  color: rgba(235,232,255,.92);
  font-family:'Syne',system-ui,sans-serif; font-size:13px; font-weight:700; letter-spacing:-.15px;
  cursor:pointer;
  box-shadow: 0 6px 20px rgba(0,0,0,.28), 0 0 0 1px rgba(124,92,252,.07) inset;
  -webkit-tap-highlight-color:transparent;
  transition: filter 150ms ease;
}
.lm-clips-see-all:active { filter: brightness(1.12); }

/* ══ Rewards (wheel + bonus) ════════════════════════════════════════════ */
.lm-rewards-section {
  position: relative; overflow:hidden;
  border-radius: 20px;
  border: 1px solid rgba(124,92,252,.18);
  background: rgba(11,9,22,.86);
  backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  box-shadow: 0 16px 50px rgba(0,0,0,.42);
}
.lm-rewards-section::before {
  content:""; position:absolute; top:0; left:8%; right:8%; height:1px;
  background: linear-gradient(90deg, transparent, rgba(167,139,250,.38) 40%, rgba(91,142,248,.28) 65%, transparent);
  pointer-events:none;
}
.lm-rewards-header {
  display:flex; align-items:center; gap:9px;
  padding: 12px 14px 11px;
  border-bottom: 1px solid rgba(124,92,252,.08);
}
.lm-rewards-icon {
  width:26px; height:26px; border-radius:9px; flex-shrink:0;
  background: linear-gradient(135deg, rgba(124,92,252,.50), rgba(59,77,200,.40));
  border: 1px solid rgba(124,92,252,.28);
  display:grid; place-items:center; font-size:13px;
  box-shadow: 0 0 12px rgba(124,92,252,.22);
}
.lm-rewards-label {
  font-family:'Syne',sans-serif; font-weight:700; font-size:13px; letter-spacing:-.2px;
  color: rgba(235,232,255,.88);
}
.lm-rewards-body {
  padding: 12px;
  display:grid; gap:10px;
}

/* ══ Bottom navigation ══════════════════════════════════════════════════ */
.lm-nav {
  position: fixed; bottom:0; left:0; right:0; z-index:70;
  padding-bottom: var(--lm-safe-bottom);
  background: rgba(8,7,18,.90);
  border-top: 1px solid rgba(124,92,252,.16);
  backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
  display: flex;
}
.lm-nav::before {
  content:""; position:absolute; top:0; left:5%; right:5%; height:1px;
  background: linear-gradient(90deg, transparent, rgba(167,139,250,.32) 40%, rgba(91,142,248,.24) 65%, transparent);
  pointer-events:none;
}
.lm-nav-btn {
  flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:4px; padding: 10px 4px;
  background:transparent; border:0; color:var(--lm-text-3); cursor:pointer;
  -webkit-tap-highlight-color:transparent;
  transition: color 160ms ease;
  min-height:56px;
}
.lm-nav-btn.is-active { color: rgba(196,181,253,.95); }
.lm-nav-icon { font-size:18px; line-height:1; }
.lm-nav-label {
  font-family:'Syne',system-ui,sans-serif; font-size:10px; font-weight:700;
  letter-spacing:.02em; text-transform:uppercase;
}
/* Indicateur actif */
.lm-nav-btn.is-active .lm-nav-icon {
  filter: drop-shadow(0 0 6px rgba(167,139,250,.55));
}
/* Dot actif sous l'icône */
.lm-nav-dot {
  width:3px; height:3px; border-radius:999px;
  background: rgba(167,139,250,.0);
  transition: background 160ms ease, width 160ms ease;
}
.lm-nav-btn.is-active .lm-nav-dot { background: rgba(167,139,250,.72); width:16px; }

/* ══ Loader / empty ═════════════════════════════════════════════════════ */
.lm-loading {
  display:flex; flex-direction:column; gap:8px;
}
.lm-skel {
  border-radius:18px; overflow:hidden;
  background: linear-gradient(90deg, rgba(255,255,255,.05) 0%, rgba(255,255,255,.09) 50%, rgba(255,255,255,.05) 100%);
  background-size: 200% 100%;
  animation: lm-skel 1.6s ease-in-out infinite;
}
@keyframes lm-skel {
  0%  { background-position:  100% 50%; }
  100%{ background-position: -100% 50%; }
}
`;

let _mobileCssInjected = false;
function useMobileStyles() {
  React.useEffect(() => {
    if (_mobileCssInjected) return;
    const el = document.createElement("style");
    el.id = "ll-mobile-css"; el.textContent = MOBILE_CSS;
    document.head.appendChild(el);
    _mobileCssInjected = true;
  }, []);
}

/* ─── utils ─────────────────────────────────────────────────────────── */
function abs(apiBase: string, url: string | null): string | null {
  if (!url) return null;
  const u = String(url);
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/")) return `${apiBase}${u}`;
  return u;
}

function fmtViewers(n: number) { return formatViewers(n); }

/* ─── Sous-composants ────────────────────────────────────────────────── */

/** Pill générique */
function Pill({ tone, children, title }: {
  tone: "live" | "neutral" | "gold" | "brand";
  children: React.ReactNode;
  title?: string;
}) {
  return <span className={`lm-pill lm-pill-${tone}`} title={title}>{children}</span>;
}

/** Avatar inline dans les cartes */
function Ava({ apiBase, live }: { apiBase: string; live: any }) {
  const name = String(live?.displayName ?? live?.slug ?? "S");
  const raw  = live?.avatarUrl != null ? String(live.avatarUrl)
             : live?.avatar_url != null ? String(live.avatar_url) : null;
  const src  = abs(apiBase, raw) || svgThumb(name);
  return (
    <div className="lm-ava" aria-hidden>
      <img src={src} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).src = svgThumb(name); }} />
    </div>
  );
}

/** Fond de thumbnail (image + overlay) */
function ThumbBg({ url }: { url: string }) {
  return (
    <>
      <div className="lm-thumb-bg" style={{ backgroundImage: `url(${url})` }} aria-hidden />
      <div aria-hidden style={{
        position:"absolute", inset:0,
        background: "linear-gradient(90deg, rgba(0,0,0,.55), rgba(0,0,0,.14) 55%, rgba(0,0,0,.60)), radial-gradient(600px 280px at 50% 0%, rgba(255,255,255,.06), rgba(0,0,0,0) 60%)",
        pointerEvents:"none",
      }} />
    </>
  );
}

/* ─── LiveCard ─────────────────────────────────────────────────────── */
function LiveCard({ live, apiBase, featured }: {
  live: LiveCardVM & { followersCount?: number; avatarUrl?: string | null };
  apiBase: string;
  featured?: boolean;
}) {
  const name      = String(live.displayName || live.slug || "Streamer");
  const viewers   = Number((live as any).viewers || 0);
  const followers = Number((live as any).followersCount || 0);

  return (
    <Link to={`/s/${live.slug}`} className="lm-card-link" aria-label={`Voir le live de ${name}`}>
      <div className={`lm-card${featured ? " lm-card-featured" : ""}`}>
        {/* Thumbnail */}
        <div className="lm-thumb">
          <ThumbBg url={live.thumbFinal} />
          <div className="lm-thumb-top">
            {featured
              ? <Pill tone="gold" title="Mise en avant">✨ FEAT.</Pill>
              : <Pill tone="live" title="En direct"><span className="lm-ping" aria-hidden />LIVE</Pill>
            }
            {live.durationLabel ? <Pill tone="neutral">⏱ {live.durationLabel}</Pill> : <span />}
          </div>
          <div className="lm-thumb-bottom">
            <Pill tone="neutral" title="Viewers">👁 {fmtViewers(viewers)}</Pill>
          </div>
        </div>

        {/* Body */}
        <div className="lm-card-body">
          <div className="lm-card-row">
            <Ava apiBase={apiBase} live={live} />
            <div className="lm-card-name" title={name}>{name}</div>
            <div className="lm-card-viewers">👁 {fmtViewers(viewers)}</div>
          </div>
          {live.title ? (
            <div className="lm-card-title" title={live.title}>{live.title}</div>
          ) : null}
          {followers > 0 ? (
            <div className="lm-card-follow">{fmtViewers(followers)} followers</div>
          ) : null}
          <div className="lm-card-divider" aria-hidden />
        </div>
      </div>
    </Link>
  );
}

/* ─── Skeleton (loading) ────────────────────────────────────────────── */
function SkeletonGrid() {
  return (
    <div className="lm-grid">
      {[0,1,2,3].map((i) => (
        <div key={i} className="lm-skel" style={{ height: 190, animationDelay: `${i * 120}ms` }} />
      ))}
    </div>
  );
}

/* ─── ClipTile ──────────────────────────────────────────────────────── */
const CORNERS = ["tl","tr","bl","br"] as const;

function ClipTile({ clip, apiBase, idx, onClick }: {
  clip: ClipVM;
  apiBase: string;
  idx: number;
  onClick: () => void;
}) {
  const raw   = clip.thumbUrl ? abs(apiBase, clip.thumbUrl) || clip.thumbUrl : null;
  const thumb = raw || svgThumb(clip.streamerName || clip.streamerSlug || "Clip");
  const corner = CORNERS[idx % 4] ?? "tl";

  return (
    <button type="button" className="lm-clip-tile" onClick={onClick}
      title={clip.title ? `${clip.title} — ❤️ ${clip.likesCount}` : `❤️ ${clip.likesCount}`}>
      <div className="lm-clip-bg" style={{ backgroundImage: `url(${thumb})` }} aria-hidden />
      {/* Bouton play */}
      <div className="lm-clip-play" aria-hidden>
        <div className="lm-clip-play-btn">▶</div>
      </div>
      {/* Badge likes */}
      <span className={`lm-clip-badge lm-clip-badge-${corner}`}>❤️ {clip.likesCount}</span>
      {/* Avatar streamer centré */}
      {clip.avatarUrl ? (
        <div className="lm-clip-ava" aria-hidden>
          <img src={abs(apiBase, clip.avatarUrl) || clip.avatarUrl} alt=""
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        </div>
      ) : null}
    </button>
  );
}

/* ─── Types ─────────────────────────────────────────────────────────── */
type NavTab = "lives" | "clips" | "rewards";

type Props = {
  apiBase: string;
  lives: LiveCardVM[];
  loading: boolean;
  refreshing: boolean;
  err: string | null;
  totals: { liveCount: number; viewersTotal: number };
  featuredLives: LiveCardVM[];
  normalLives:   LiveCardVM[];
  clipsTop4:     ClipVM[];
  clipsTotal:    number;
  clipsLoading:  boolean;
  extraClipsCount: number;
  hasMoreThan4:  boolean;
  onOpenMonthList: () => void;
  onOpenClip: (c: ClipVM) => void;
  routes?: { lives?: string; browse?: string; dashboard?: string; profile?: string };
  me?: { username?: string | null; avatarUrl?: string | null } | null;
};

/* ─── Composant principal ───────────────────────────────────────────── */
export default function LivesPageMobile(props: Props) {
  useMobileStyles();

  const {
    apiBase, lives, loading, refreshing, err,
    totals, featuredLives, normalLives,
    clipsTop4, clipsTotal, clipsLoading, extraClipsCount, hasMoreThan4,
    onOpenMonthList, onOpenClip,
  } = props;

  const [tab, setTab] = React.useState<NavTab>("lives");

  // Scroll to top quand on change d'onglet
  const scrollRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [tab]);

  const canShowGrid = !(loading && lives.length === 0);

  /* ─ clip click ─ */
  function handleClipClick(c: ClipVM) {
    if (hasMoreThan4) { onOpenMonthList(); return; }
    onOpenClip(c);
  }

  /* ═══════════════════════════════════════
     TABS CONTENT
  ═══════════════════════════════════════ */
  const TabLives = (
    <>
      {/* Featured */}
      {featuredLives.length > 0 && (
        <div>
          <div className="lm-section-head">
            <h2 className="lm-section-title">✨ Mise en avant</h2>
            <span className="lm-section-hint">{featuredLives.length}</span>
          </div>
          <div className="lm-grid">
            {featuredLives.map((live) => (
              <LiveCard key={live.id} live={live as any} apiBase={apiBase} featured />
            ))}
          </div>
        </div>
      )}

      {/* Normal lives */}
      <div>
        <div className="lm-section-head">
          <h2 className="lm-section-title">🔴 En direct</h2>
          <span className="lm-section-hint">{normalLives.length}</span>
        </div>
        {!canShowGrid
          ? <SkeletonGrid />
          : normalLives.length === 0 && !loading ? (
            <div style={{ padding:"20px 4px", fontSize:12, color:"rgba(167,155,220,.45)", fontFamily:"'Syne',system-ui,sans-serif", fontWeight:500 }}>
              Aucun live en ce moment.
            </div>
          ) : (
            <div className="lm-grid">
              {normalLives.map((live) => (
                <LiveCard key={live.id} live={live as any} apiBase={apiBase} />
              ))}
            </div>
          )
        }
      </div>
    </>
  );

  const TabClips = (
    <div className="lm-clips-card">
      {/* Header */}
      <div className="lm-clips-header">
        <div>
          <h2 className="lm-clips-title">
            <span style={{ fontSize:15 }}>🎬</span>
            Clips du mois
          </h2>
        </div>
        {!clipsLoading && clipsTotal > 0 && (
          <span className="lm-clips-count">{clipsTotal} clips</span>
        )}
      </div>

      {/* Grille 2×2 */}
      {clipsTop4.length === 0 ? (
        <div style={{ padding:"8px 14px 14px", fontSize:12, color:"rgba(167,155,220,.45)", fontFamily:"'Syne',system-ui,sans-serif", fontWeight:500 }}>
          {clipsLoading ? "Chargement…" : "Aucun clip pour le moment."}
        </div>
      ) : (
        <>
          <div className="lm-clips-grid">
            {clipsTop4.map((c, idx) => (
              <ClipTile key={c.id} clip={c} apiBase={apiBase} idx={idx} onClick={() => handleClipClick(c)} />
            ))}
            {extraClipsCount > 0 && <div className="lm-clips-cross" aria-hidden />}
            {extraClipsCount > 0 && (
              <button type="button" className="lm-clips-more-overlay" onClick={onOpenMonthList} title="Voir tous les clips">
                <div className="lm-clips-more-bubble">
                  <strong>+{extraClipsCount}</strong> clips
                </div>
              </button>
            )}
          </div>

          {hasMoreThan4 && (
            <button type="button" className="lm-clips-see-all" onClick={onOpenMonthList}>
              Voir tous les clips →
            </button>
          )}
        </>
      )}
    </div>
  );

  const TabRewards = (
    <div className="lm-rewards-section">
      <div className="lm-rewards-header">
        <div className="lm-rewards-icon" aria-hidden>🎁</div>
        <span className="lm-rewards-label">Récompenses quotidiennes</span>
      </div>
      <div className="lm-rewards-body">
        <DailyWheelCard />
        <DailyBonusAccessCard />
      </div>
    </div>
  );

  /* ═══════════════════════════════════════
     RENDER
  ═══════════════════════════════════════ */
  return (
    <main className="lm-page">
      {/* Contenu scrollable */}
      <div ref={scrollRef} className="lm-scroll">

        {/* ── Hero header (toujours visible) ── */}
        <div className="lm-hero">
          <div className="lm-hero-left">
            <h1 className="lm-logo">LunaLive</h1>
            <div className="lm-sub">
              <span>Plateforme casino FR</span>
              {refreshing ? <span className="lm-refreshing" aria-hidden /> : null}
            </div>
          </div>
          <div className="lm-hero-pills">
            <Pill tone="live" title="Lives en direct">
              <span className="lm-ping" aria-hidden />
              <b>{totals.liveCount}</b> live{totals.liveCount > 1 ? "s" : ""}
            </Pill>
            <Pill tone="neutral" title="Viewers total">
              👁 <b>{fmtViewers(totals.viewersTotal)}</b>
            </Pill>
          </div>
        </div>

        {/* ── Erreur ── */}
        {err && <div className="lm-err">⚠️ {err}</div>}

        {/* ── Contenu selon onglet ── */}
        {tab === "lives"   && TabLives}
        {tab === "clips"   && TabClips}
        {tab === "rewards" && TabRewards}

      </div>

      {/* ── Bottom navigation fixe ── */}
      <nav className="lm-nav" aria-label="Navigation principale">

        {/* Lives */}
        <button type="button" className={`lm-nav-btn${tab === "lives" ? " is-active" : ""}`}
          onClick={() => setTab("lives")} aria-label="Lives" aria-current={tab === "lives" ? "page" : undefined}>
          <span className="lm-nav-icon">📡</span>
          <span className="lm-nav-label">Lives</span>
          <span className="lm-nav-dot" aria-hidden />
        </button>

        {/* Clips */}
        <button type="button" className={`lm-nav-btn${tab === "clips" ? " is-active" : ""}`}
          onClick={() => setTab("clips")} aria-label="Clips du mois" aria-current={tab === "clips" ? "page" : undefined}>
          <span className="lm-nav-icon">🎬</span>
          <span className="lm-nav-label">Clips</span>
          <span className="lm-nav-dot" aria-hidden />
        </button>

        {/* Récompenses */}
        <button type="button" className={`lm-nav-btn${tab === "rewards" ? " is-active" : ""}`}
          onClick={() => setTab("rewards")} aria-label="Récompenses" aria-current={tab === "rewards" ? "page" : undefined}>
          <span className="lm-nav-icon">🎁</span>
          <span className="lm-nav-label">Bonus</span>
          <span className="lm-nav-dot" aria-hidden />
        </button>

      </nav>
    </main>
  );
}