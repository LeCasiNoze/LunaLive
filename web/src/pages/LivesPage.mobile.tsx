// web/src/pages/LivesPage.mobile.tsx
// ─────────────────────────────────────────────────────────────────────────────
//  LunaLive — Mobile  |  Design System : Purple Velvet × Blue Night
//  Police : Syne 800 (titres) + système natif (corps)
//  Palette : #7c5cfc / #a78bfa / #5b8ef8 / #c4b5fd  (alignée sur LivesPage.css)
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";
import { ArrowRight, Clapperboard, Clock3, Heart, Play, Radio, Search, Sparkles, Users } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { formatViewers } from "../lib/format";
import { svgThumb }       from "../lib/thumb";
import { DailyWheelCard }      from "../components/DailyWheelCard";
import { DailyBonusAccessCard } from "../components/DailyBonusAccessCard";
import { QuestsHomeCard }      from "../components/QuestsHomeCard";
import { LoginModal }          from "../components/LoginModal";
import { useAuth }             from "../auth/AuthProvider";
import { getMyXp, type XpInfo } from "../lib/api_quests";
import { getStreamers, type ApiStreamer } from "../lib/api";
import type { LiveCardVM, ClipVM } from "./LivesPage";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

function _abs(url: string | null): string | null {
  if (!url) return null;
  const u = String(url);
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/")) return `${API_BASE}${u}`;
  return u;
}
function pickAva(user: any): string | null {
  if (!user) return null;
  const direct = user.avatarUrl || user.avatar_url || user.avatar || user.photoUrl || user.photo_url || null;
  if (direct) return _abs(String(direct));
  const uid = user.id != null ? Number(user.id) : null;
  return uid ? _abs(`/avatars/u/${uid}?v=${Math.floor(Date.now() / 60000)}`) : null;
}
function _initials(name: string) {
  const s = (name || "?").trim(); if (!s) return "?";
  const parts = s.split(/[\s._-]+/g).filter(Boolean);
  const a = parts[0]?.[0] ?? s[0]; const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : s[1];
  return (a + (b ?? "")).toUpperCase();
}

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
  min-height: 100dvh;
  color: var(--lm-text-1);
  font-family: 'Syne', system-ui, sans-serif;
  position: relative;
  overflow-x: hidden;
  padding: 0 0 calc(80px + var(--lm-safe-bottom));
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

/* ══ Hero header zone (fixe, en haut, hors viewport scroll-snap) ════════ */
.lm-top {
  position: relative; z-index: 1;
  flex-shrink: 0;
  padding: 12px 12px 8px;
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

/* ══ Search streamer (Lives pane) ═══════════════════════════════════════ */
.lm-search { position: relative; }
.lm-search-row {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px; border-radius: 14px;
  border: 1px solid rgba(124,92,252,.22);
  background: #14102a;
  box-shadow: 0 6px 18px rgba(0,0,0,.30), 0 0 0 1px rgba(167,139,250,.05) inset;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}
.lm-search-row:focus-within {
  border-color: rgba(167,139,250,.55);
  box-shadow: 0 8px 22px rgba(124,92,252,.20), 0 0 0 3px rgba(124,92,252,.10);
}
.lm-search-icon { font-size: 15px; color: rgba(196,181,253,.70); flex-shrink: 0; }
.lm-search-input {
  flex: 1; min-width: 0;
  border: 0; outline: none; background: transparent;
  color: rgba(235,232,255,.96);
  font-family:'Syne',system-ui,sans-serif; font-size: 14px; font-weight: 600; letter-spacing:-.1px;
}
.lm-search-input::placeholder { color: rgba(167,155,220,.55); font-weight: 500; }
.lm-search-clear {
  background: rgba(255,255,255,.06); border: 0;
  border-radius: 999px; color: rgba(235,232,255,.70);
  width: 22px; height: 22px; padding: 0; cursor: pointer;
  font-size: 11px; display: grid; place-items: center;
  -webkit-tap-highlight-color: transparent;
}
.lm-search-clear:hover { background: rgba(255,255,255,.12); }

.lm-suggest {
  position: absolute; top: calc(100% + 6px); left: 0; right: 0;
  z-index: 60;
  border-radius: 14px;
  border: 1px solid rgba(124,92,252,.28);
  background: #14102a;
  box-shadow: 0 18px 50px rgba(0,0,0,.55), 0 0 0 1px rgba(167,139,250,.06) inset;
  overflow: hidden;
  max-height: min(60vh, 460px); overflow-y: auto;
  scrollbar-width: thin; scrollbar-color: rgba(124,92,252,.30) transparent;
  animation: lm-suggest-in 160ms cubic-bezier(.22,1,.36,1);
}
@keyframes lm-suggest-in { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
.lm-suggest::-webkit-scrollbar { width: 4px; }
.lm-suggest::-webkit-scrollbar-thumb { background: rgba(124,92,252,.30); border-radius: 4px; }

.lm-suggest-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; cursor: pointer; text-decoration: none;
  color: rgba(235,232,255,.92); border: 0; background: transparent; width: 100%; text-align: left;
  font-family:'Syne',system-ui,sans-serif;
  -webkit-tap-highlight-color: transparent;
  border-bottom: 1px solid rgba(124,92,252,.06);
  transition: background 120ms ease;
}
.lm-suggest-item:last-child { border-bottom: 0; }
.lm-suggest-item:hover, .lm-suggest-item.is-focus { background: rgba(124,92,252,.10); }
.lm-suggest-ava {
  width: 32px; height: 32px; border-radius: 10px; flex-shrink: 0; overflow: hidden;
  border: 1px solid rgba(255,255,255,.10); background: rgba(0,0,0,.35);
  display: grid; place-items: center;
  font-size: 12px; font-weight: 700; color: rgba(196,181,253,.80);
}
.lm-suggest-ava img { width:100%; height:100%; object-fit:cover; display:block; }
.lm-suggest-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.lm-suggest-name {
  font-weight: 700; font-size: 13px; letter-spacing: -.15px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.lm-suggest-sub {
  font-size: 10.5px; font-weight: 500; color: rgba(167,155,220,.60);
  display: flex; align-items: center; gap: 6px;
}
.lm-suggest-live {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 1px 7px; border-radius: 999px;
  font-size: 9.5px; font-weight: 800; letter-spacing: .04em;
  background: rgba(239,68,68,.12); border: 1px solid rgba(239,68,68,.30); color: #fca5a5;
}
.lm-suggest-empty {
  padding: 14px; text-align: center;
  font-size: 12px; color: rgba(167,155,220,.55);
}

/* ══ Pane content (rendu dans le scroll vertical normal de la page) ════ */
.lm-pane {
  padding: 12px 12px 0;
  display: flex; flex-direction: column; gap: 10px;
  animation: lm-pane-in 220ms cubic-bezier(.22,1,.36,1);
}
@keyframes lm-pane-in {
  from { opacity: 0; transform: translateX(var(--lm-pane-from, 12px)); }
  to   { opacity: 1; transform: translateX(0); }
}

/* ══ Menu pane (page interne complète : compte, navigation, signaler) ════ */
.lm-menu-card {
  position: relative; overflow: hidden;
  border-radius: 18px;
  border: 1px solid rgba(124,92,252,.18);
  background: rgba(11,9,22,.86);
  backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
  box-shadow: 0 14px 40px rgba(0,0,0,.40);
}
.lm-menu-card::before {
  content:""; position:absolute; top:0; left:8%; right:8%; height:1px;
  background: linear-gradient(90deg,transparent,rgba(167,139,250,.40) 40%,rgba(91,142,248,.30) 65%,transparent);
  pointer-events:none;
}

/* CTA login (déconnecté) */
.lm-login-cta {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 16px; border-radius: 18px;
  border: 1px solid rgba(124,92,252,.34);
  background: linear-gradient(135deg,rgba(124,92,252,.20),rgba(91,142,248,.16));
  color: rgba(235,232,255,.96);
  font-family:'Syne',system-ui,sans-serif; font-weight: 800; font-size: 14px;
  width: 100%; text-align: left; cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: filter 150ms ease, transform 120ms var(--lm-ease);
  position: relative; overflow: hidden;
  box-shadow: 0 8px 28px rgba(124,92,252,.22), 0 0 0 1px rgba(167,139,250,.08) inset;
}
.lm-login-cta::before {
  content:""; position:absolute; top:0; left:10%; right:10%; height:1px;
  background: linear-gradient(90deg,transparent,rgba(167,139,250,.55) 40%,rgba(91,142,248,.40) 60%,transparent);
  pointer-events:none;
}
.lm-login-cta:active { transform: scale(.98); }
.lm-login-cta-icon {
  width: 44px; height: 44px; border-radius: 13px;
  background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.14);
  display:grid; place-items:center; font-size: 22px; flex-shrink: 0;
}
.lm-login-cta-body { display:flex; flex-direction:column; gap:2px; min-width:0; flex:1; }
.lm-login-cta-title { font-size: 14px; font-weight: 800; letter-spacing:-.2px; color: rgba(235,232,255,.98); }
.lm-login-cta-sub   { font-size: 11px; font-weight: 500; color: rgba(196,181,253,.78); }
.lm-login-cta-arrow { font-size: 18px; color: rgba(196,181,253,.85); flex-shrink: 0; }

/* Profile card (connecté) */
.lm-prof {
  display: flex; align-items: center; gap: 12px; padding: 14px 16px;
  text-decoration: none; color: inherit;
  border-radius: 18px;
  border: 1px solid rgba(124,92,252,.22);
  background: #14102a;
  box-shadow: 0 8px 24px rgba(0,0,0,.40), 0 0 0 1px rgba(167,139,250,.05) inset;
  -webkit-tap-highlight-color: transparent;
  transition: background 160ms ease, border-color 160ms ease, transform 120ms var(--lm-ease);
}
.lm-prof:active { transform: scale(.99); }
.lm-prof-ava {
  width: 52px; height: 52px; border-radius: 16px; flex-shrink: 0; overflow: hidden;
  border: 2px solid rgba(124,92,252,.30);
  background: rgba(0,0,0,.35);
  display:grid; place-items:center;
  font-family:'Syne',system-ui,sans-serif; font-size: 16px; font-weight: 800;
  color: rgba(196,181,253,.88);
}
.lm-prof-ava img { width:100%; height:100%; object-fit:cover; display:block; }
.lm-prof-meta { display:flex; flex-direction:column; gap: 5px; min-width: 0; flex: 1; }
.lm-prof-line1 { display:flex; align-items:center; gap:8px; min-width:0; }
.lm-prof-name {
  font-family:'Syne',system-ui,sans-serif; font-weight: 800; font-size: 15px; letter-spacing:-.2px;
  background: linear-gradient(90deg,#c4b5fd,#a78bfa);
  -webkit-background-clip:text; background-clip:text; color:transparent;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0;
}
.lm-prof-lvl {
  display:inline-flex; align-items:center; gap:4px;
  padding:2px 8px; border-radius:999px;
  border:1px solid rgba(124,92,252,.32);
  background:linear-gradient(135deg,rgba(167,139,250,.18),rgba(91,142,248,.14));
  font-family:'Syne',system-ui,sans-serif; font-weight: 800; font-size: 10px; letter-spacing:.02em;
  color:#c4b5fd; flex-shrink: 0;
}
.lm-prof-xpbar {
  position: relative; height: 6px; border-radius: 999px; overflow: hidden;
  background: rgba(255,255,255,.07);
}
.lm-prof-xpfill {
  position:absolute; inset:0 auto 0 0; height:100%;
  background: linear-gradient(90deg,#a78bfa,#5b8ef8,#a78bfa); background-size: 200% 100%;
  animation: lm-xp-shimmer 4s linear infinite; border-radius:999px;
  transition: width 350ms ease;
}
.lm-prof-xpfill.is-max { background: linear-gradient(90deg,#fbbf24,#f59e0b,#fbbf24); background-size: 200% 100%; }
@keyframes lm-xp-shimmer { 0%{background-position:0% 50%;} 100%{background-position:200% 50%;} }
.lm-prof-xptext {
  font-family:'Syne',system-ui,sans-serif; font-size: 10px; font-weight: 600;
  color: rgba(167,155,220,.62); letter-spacing:.02em;
}
.lm-prof-arrow { font-size: 16px; color: rgba(196,181,253,.55); flex-shrink: 0; }

/* Section header dans menu */
.lm-menu-section {
  font-family:'Syne',sans-serif;
  font-size: 10px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase;
  color: var(--lm-text-3); padding: 4px 4px 6px;
  display: flex; align-items: center; gap: 8px;
  margin-top: 4px;
}
.lm-menu-section::before {
  content:""; width:3px; height:10px; border-radius:2px; flex-shrink:0;
  background: linear-gradient(180deg,#a78bfa,#5b8ef8);
}

/* Items de menu (liens / actions) */
.lm-menu-list { display: grid; gap: 8px; }
.lm-menu-item {
  display:flex; align-items:center; justify-content:space-between; gap: 12px;
  padding: 13px 14px; border-radius: 14px;
  border: 1px solid rgba(124,92,252,.18);
  background: #14102a;
  box-shadow: 0 6px 18px rgba(0,0,0,.34), 0 0 0 1px rgba(167,139,250,.04) inset;
  color: rgba(235,232,255,.92); text-decoration: none; cursor: pointer;
  font-family:'Syne',system-ui,sans-serif;
  font-size: 13px; font-weight: 700; letter-spacing:-.15px;
  text-align: left; width: 100%;
  -webkit-tap-highlight-color: transparent;
  transition: background 140ms ease, border-color 140ms ease, transform 120ms var(--lm-ease);
}
.lm-menu-item:hover { background: #1a1535; border-color: rgba(124,92,252,.30); }
.lm-menu-item:active { transform: translateX(2px); }
.lm-menu-item-left { display: inline-flex; align-items: center; gap: 10px; min-width: 0; }
.lm-menu-item-icon { font-size: 17px; flex-shrink: 0; }
.lm-menu-item-arrow { font-size: 12px; color: rgba(124,92,252,.55); flex-shrink: 0; }
.lm-menu-item-danger {
  border-color: rgba(239,68,68,.26);
  background: #2a1014;
  color: rgba(252,165,165,.92);
  box-shadow: 0 6px 18px rgba(0,0,0,.34), 0 0 0 1px rgba(239,68,68,.06) inset;
}
.lm-menu-item-danger:hover { background: #361319; border-color: rgba(239,68,68,.40); }
.lm-menu-item-danger .lm-menu-item-arrow { color: rgba(239,68,68,.55); }

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

/* ══ 2026 clean mobile experience ═══════════════════════════════════════ */
.lm-page {
  --lm-text-1:#f6f2ff;
  --lm-text-2:#aaa0ba;
  --lm-text-3:#84798f;
  --lm-border:rgba(196,181,253,.14);
  padding:0 0 calc(86px + var(--lm-safe-bottom));
  font-family:'Manrope',sans-serif;
  font-variant-numeric:tabular-nums;
}
.lm-page :is(button,input,select) { font-family:'Manrope',sans-serif; }
.lm-page::before { background:radial-gradient(110vw 52vh at 12% -8%,rgba(124,92,252,.14),transparent 62%),radial-gradient(90vw 50vh at 104% 45%,rgba(91,64,168,.09),transparent 65%); }
.lm-page::after { display:none; }
.lm-top { padding:10px 12px 5px; }
.lm-summary { display:flex; align-items:flex-end; justify-content:space-between; gap:12px; padding:4px 2px 10px; border-bottom:1px solid var(--lm-border); }
.lm-summary > div:first-child > span { color:#a78bfa; font-size:8px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; }
.lm-summary h1 { margin:3px 0 0; color:#f5f1fb; font-size:22px; font-weight:800; letter-spacing:-.055em; }
.lm-summary-stats { display:flex; align-items:center; justify-content:flex-end; gap:6px; flex-wrap:wrap; }
.lm-summary-stats > span { display:inline-flex; align-items:center; gap:5px; min-height:28px; padding:0 8px; border:1px solid var(--lm-border); border-radius:9px; background:rgba(157,124,248,.045); color:#9d92ae; font-size:8px; font-weight:700; }
.lm-summary-stats > span i { width:6px; height:6px; border-radius:50%; background:#f43f5e; box-shadow:0 0 0 3px rgba(244,63,94,.12); }
.lm-rewards-shortcut { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:10px; width:100%; min-height:50px; margin:2px 0 10px; padding:8px 11px; border:1px solid rgba(167,139,250,.2); border-radius:13px; background:rgba(157,124,248,.08); color:#cbbcf1; text-align:left; }
.lm-rewards-shortcut > span { display:grid; gap:1px; min-width:0; }
.lm-rewards-shortcut b { color:#eee9f7; font-size:10px; font-weight:800; }
.lm-rewards-shortcut small { color:#8f849f; font-size:8px; }
.lm-hero { align-items:flex-end; padding:19px 17px 17px; border-color:var(--lm-border); border-radius:19px; background:linear-gradient(120deg,rgba(38,25,62,.95),rgba(15,10,26,.96) 66%); box-shadow:0 17px 48px rgba(0,0,0,.3); backdrop-filter:none; }
.lm-hero::before { display:none; }
.lm-hero::after { top:-88px; right:-45px; left:auto; width:190px; height:190px; border:30px solid rgba(167,139,250,.055); border-radius:50%; background:none; }
.lm-hero-kicker { position:relative; z-index:1; display:inline-flex; align-items:center; gap:5px; color:#c4b5fd; font-size:8px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; }
.lm-logo { margin-top:7px; background:none; color:#f7f3ff; filter:none; animation:none; font-family:'Manrope',sans-serif; font-size:29px; font-weight:800; letter-spacing:-.055em; }
.lm-sub { margin-top:4px; color:#968ba6; font-size:9px; font-weight:600; }
.lm-hero-pills { gap:5px; }
.lm-pill { min-height:23px; padding:0 7px; border-radius:7px; font-family:'Manrope',sans-serif; font-size:8px; font-weight:800; letter-spacing:.02em; text-transform:uppercase; }
.lm-pill-live { background:rgba(225,29,72,.88); border-color:rgba(251,113,133,.28); color:#fff; }
.lm-pill-neutral { background:rgba(8,5,14,.7); }
.lm-ping { width:5px; height:5px; margin-right:0; box-shadow:0 0 0 3px rgba(255,255,255,.16); animation:none; background:#fff; }
.lm-pane { padding:5px 12px 18px; animation:lm-pane-in 170ms ease both; }
.lm-search { margin:3px 0 20px; }
.lm-search-row { height:45px; border:1px solid var(--lm-border); border-radius:13px; background:rgba(19,13,31,.88); box-shadow:0 10px 28px rgba(0,0,0,.18); }
.lm-search-icon { color:#8d819e; }
.lm-search-input { color:#eee9f6; font-family:'Manrope',sans-serif; font-size:12px; }
.lm-search-input::placeholder { color:#756a83; }
.lm-suggest { border-color:var(--lm-border); border-radius:14px; background:rgba(18,12,30,.98); box-shadow:0 22px 62px rgba(0,0,0,.55); }
.lm-section-head { align-items:flex-end; margin:0 2px 10px; }
.lm-section-head:not(:first-child) { margin-top:24px; }
.lm-section-title { padding-left:0; color:#f0ebf7; font-family:'Manrope',sans-serif; font-size:15px; font-weight:800; letter-spacing:-.035em; text-transform:none; }
.lm-section-title::before { display:none; }
.lm-section-hint { display:grid; place-items:center; min-width:24px; min-height:24px; border-radius:8px; background:rgba(157,124,248,.08); color:#9e90bd; font-size:9px; }
.lm-grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
.lm-card { border-color:var(--lm-border); border-radius:17px; background:rgba(20,14,33,.88); box-shadow:0 13px 38px rgba(0,0,0,.24); backdrop-filter:none; }
.lm-card::before,.lm-card-divider { display:none; }
.lm-card-featured { border-color:rgba(251,191,36,.22); background:linear-gradient(145deg,rgba(58,39,42,.56),rgba(20,13,32,.9) 70%); }
.lm-thumb { height:auto; aspect-ratio:16/9; border-radius:16px 16px 0 0; }
.lm-thumb-bg { opacity:.88; filter:saturate(.95) brightness(.86); transform:none; }
.lm-thumb::after { background:linear-gradient(180deg,rgba(0,0,0,.04) 38%,rgba(5,3,9,.7)); }
.lm-card-body { gap:5px; padding:9px 9px 10px; }
.lm-card-row { gap:6px; }
.lm-ava { width:27px; height:27px; border-radius:9px; border-color:rgba(196,181,253,.2); }
.lm-card-name { color:#f1edf7; font-family:'Manrope',sans-serif; font-size:10px; font-weight:800; letter-spacing:-.025em; }
.lm-card-viewers { display:inline-flex; align-items:center; gap:3px; color:#a69aad; font-family:'Manrope',sans-serif; font-size:7px; }
.lm-card-title { min-height:23px; color:#aaa0b7; font-size:8px; line-height:1.4; -webkit-line-clamp:2; }
.lm-card-follow { color:#82778e; font-size:8px; }
.lm-empty-state { display:grid; justify-items:center; gap:5px; padding:42px 16px; border:1px dashed var(--lm-border); border-radius:17px; background:rgba(19,13,31,.5); color:#a997d2; text-align:center; }
.lm-empty-state b { margin-top:4px; color:#e6dff1; font-size:12px; }
.lm-empty-state span { color:#887d96; font-size:9px; }
.lm-clips-card { border:0; border-radius:0; background:none; box-shadow:none; backdrop-filter:none; }
.lm-clips-card::before { display:none; }
.lm-clips-header { align-items:flex-end; padding:2px 1px 12px; }
.lm-clips-title { background:none; color:#f0ebf7; filter:none; font-family:'Manrope',sans-serif; font-size:17px; font-weight:800; letter-spacing:-.04em; }
.lm-clips-header p { margin:4px 0 0; color:#887e98; font-size:9px; }
.lm-clips-count { border-radius:8px; color:#a69ab6; background:rgba(157,124,248,.07); font-size:8px; }
.lm-clips-grid { grid-template-columns:1fr; gap:11px; padding:0; }
.lm-clips-cross,.lm-clips-more-overlay { display:none; }
.lm-clip-tile { min-height:0; aspect-ratio:16/10.5; border-color:var(--lm-border); border-radius:16px; background:linear-gradient(135deg,#281846,#10091d); }
.lm-clip-bg { opacity:.78; filter:saturate(.95) brightness(.83); transform:none; }
.lm-clip-tile::before { background:linear-gradient(180deg,rgba(0,0,0,.02) 38%,rgba(5,3,9,.82)); }
.lm-clip-play-btn { width:38px; height:38px; border-color:rgba(255,255,255,.18); background:rgba(8,5,14,.68); }
.lm-clip-badge { top:9px !important; right:9px !important; bottom:auto !important; left:auto !important; gap:5px; min-height:23px; padding:0 7px; border-radius:7px; background:rgba(8,5,14,.7); color:#fda4af; font-family:'Manrope',sans-serif; font-size:8px; }
.lm-clip-ava { display:none; }
.lm-clip-caption { position:absolute; z-index:3; right:11px; bottom:10px; left:11px; display:grid; gap:2px; color:white; text-align:left; }
.lm-clip-caption b { overflow:hidden; font-size:11px; font-weight:800; text-overflow:ellipsis; white-space:nowrap; }
.lm-clip-caption small { overflow:hidden; color:#bcb1c8; font-size:8px; font-weight:600; text-overflow:ellipsis; white-space:nowrap; }
.lm-clips-see-all { display:flex; align-items:center; justify-content:center; gap:7px; min-height:41px; margin-top:11px; border-color:rgba(167,139,250,.18); border-radius:11px; background:rgba(157,124,248,.08); color:#c9bbed; font-family:'Manrope',sans-serif; font-size:9px; font-weight:800; }
.lm-clips-empty { padding:35px 10px; border:1px dashed var(--lm-border); border-radius:16px; color:#8b809a; font-size:10px; text-align:center; }
.lm-pane > :is(.dwc-card,.dba-card,.qhc-card) { border:1px solid var(--lm-border) !important; border-radius:17px !important; background:rgba(20,14,33,.88) !important; box-shadow:0 12px 36px rgba(0,0,0,.2) !important; backdrop-filter:none !important; animation:none !important; }
.lm-pane :is(.dwc-title,.dba-title,.qhc-title) { background:none !important; -webkit-text-fill-color:initial !important; color:#f1ecf8 !important; filter:none !important; animation:none !important; font-family:'Manrope',sans-serif !important; font-size:13px !important; }
.lm-pane :is(.dwc-sub,.dba-sub,.qhc-sub) { color:#8f849f !important; font-family:'Manrope',sans-serif !important; font-size:9px !important; }
.lm-prof,.lm-login-cta,.lm-menu-item { border-color:var(--lm-border); background:rgba(20,14,33,.82); box-shadow:none; }
.lm-prof-name,.lm-login-cta-title,.lm-menu-item { font-family:'Manrope',sans-serif; }

@media (min-width:560px) {
  .lm-grid { grid-template-columns:repeat(3,minmax(0,1fr)); }
  .lm-clips-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
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
function ThumbBg({ url, label }: { url: string; label: string }) {
  const fallback = svgThumb(label);
  return (
    <>
      <div className="lm-thumb-bg" style={{ backgroundImage: `url(${url}), url(${fallback})` }} aria-hidden />
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
          <ThumbBg url={live.thumbFinal} label={name} />
          <div className="lm-thumb-top">
            {featured
              ? <Pill tone="gold" title="Mise en avant"><Sparkles size={11} /> À la une</Pill>
              : <Pill tone="live" title="En direct"><span className="lm-ping" aria-hidden />En direct</Pill>
            }
            {live.durationLabel ? <Pill tone="neutral"><Clock3 size={11} /> {live.durationLabel}</Pill> : <span />}
          </div>
          <div className="lm-thumb-bottom">
            <Pill tone="neutral" title="Viewers"><Users size={11} /> {fmtViewers(viewers)}</Pill>
          </div>
        </div>

        {/* Body */}
        <div className="lm-card-body">
          <div className="lm-card-row">
            <Ava apiBase={apiBase} live={live} />
            <div className="lm-card-name" title={name}>{name}</div>
            <div className="lm-card-viewers"><Users size={11} /> {fmtViewers(viewers)}</div>
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
        <div className="lm-clip-play-btn"><Play size={15} fill="currentColor" /></div>
      </div>
      {/* Badge likes */}
      <span className={`lm-clip-badge lm-clip-badge-${corner}`}><Heart size={11} fill="currentColor" /> {clip.likesCount}</span>
      {/* Avatar streamer centré */}
      {clip.avatarUrl ? (
        <div className="lm-clip-ava" aria-hidden>
          <img src={abs(apiBase, clip.avatarUrl) || clip.avatarUrl} alt=""
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        </div>
      ) : null}
      <span className="lm-clip-caption">
        <b>{clip.title || "Moment du live"}</b>
        <small>{clip.streamerName || clip.streamerSlug || "Streamer"}</small>
      </span>
    </button>
  );
}

/* ─── Types ─────────────────────────────────────────────────────────── */
type NavTab = "lives" | "clips" | "bonus" | "menu";
// Ordre des panes dans le viewport scroll-snap, aligné avec la barre globale.
const TAB_ORDER: NavTab[] = ["menu", "lives", "bonus", "clips"];
const TAB_INDEX: Record<NavTab, number> = { menu: 0, lives: 1, bonus: 2, clips: 3 };

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

  // Onglet piloté par l'URL (?tab=clips|bonus|menu). Default = lives.
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTabRaw = searchParams.get("tab");
  const tab: NavTab = (urlTabRaw === "clips" || urlTabRaw === "bonus" || urlTabRaw === "menu")
    ? urlTabRaw : "lives";
  const setTab = React.useCallback((next: NavTab) => {
    setSearchParams(prev => {
      const sp = new URLSearchParams(prev);
      if (next === "lives") sp.delete("tab");
      else sp.set("tab", next);
      return sp;
    }, { replace: true });
  }, [setSearchParams]);

  // Scroll to top quand on change d'onglet
  React.useEffect(() => {
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {}
  }, [tab]);

  // ── Swipe entre onglets (gesture-based, sans interférer avec les liens) ─
  const swipeRef = React.useRef({ x0: 0, y0: 0, t0: 0, active: false, locked: null as null | "x" | "y" });
  const [paneDir, setPaneDir] = React.useState<-1 | 1>(1); // 1 = next (slide-in from right), -1 = prev
  function onSwipeStart(e: React.TouchEvent) {
    const t = e.touches?.[0]; if (!t) return;
    if (t.clientX < 14 || t.clientX > window.innerWidth - 14) return; // évite back-gestures iOS
    swipeRef.current = { x0: t.clientX, y0: t.clientY, t0: Date.now(), active: true, locked: null };
  }
  function onSwipeMove(e: React.TouchEvent) {
    const s = swipeRef.current; if (!s.active) return;
    const t = e.touches?.[0]; if (!t) return;
    const dx = t.clientX - s.x0;
    const dy = t.clientY - s.y0;
    if (s.locked == null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      s.locked = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (s.locked === "y") s.active = false; // on laisse le scroll vertical
  }
  function onSwipeEnd(e: React.TouchEvent) {
    const s = swipeRef.current;
    if (!s.active || s.locked !== "x") { s.active = false; return; }
    const t = e.changedTouches?.[0]; if (!t) return;
    const dx = t.clientX - s.x0;
    const dt = Date.now() - s.t0;
    s.active = false;
    // Seuil : 50px OU vélocité > 0.4 px/ms
    if (Math.abs(dx) < 50 && (Math.abs(dx) / Math.max(1, dt)) < 0.4) return;
    const idx = TAB_INDEX[tab];
    if (dx < 0 && idx < TAB_ORDER.length - 1) {
      setPaneDir(1); setTab(TAB_ORDER[idx + 1]);
    } else if (dx > 0 && idx > 0) {
      setPaneDir(-1); setTab(TAB_ORDER[idx - 1]);
    }
  }

  const canShowGrid = !(loading && lives.length === 0);

  /* ─ clip click ─ */
  function handleClipClick(c: ClipVM) {
    onOpenClip(c);
  }

  /* ═══════════════════════════════════════
     TABS CONTENT
  ═══════════════════════════════════════ */
  const TabLives = (
    <>
      <StreamerSearch apiBase={apiBase} />

      {/* Featured */}
      {featuredLives.length > 0 && (
        <div>
          <div className="lm-section-head">
            <h2 className="lm-section-title">À la une</h2>
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
          <h2 className="lm-section-title">En direct maintenant</h2>
          <span className="lm-section-hint">{normalLives.length}</span>
        </div>
        {!canShowGrid
          ? <SkeletonGrid />
          : normalLives.length === 0 && !loading ? (
            <div className="lm-empty-state">
              <Radio size={20} />
              <b>Aucun live en ce moment</b>
              <span>Retrouve bientôt les streamers de la communauté.</span>
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
      <div className="lm-clips-header">
        <div>
          <h2 className="lm-clips-title">
            <Clapperboard size={17} />
            Clips du mois
          </h2>
          <p>Les moments préférés de la communauté.</p>
        </div>
        {!clipsLoading && clipsTotal > 0 && (
          <span className="lm-clips-count">{clipsTotal} clips</span>
        )}
      </div>

      {/* Grille 2×2 */}
      {clipsTop4.length === 0 ? (
          <div className="lm-clips-empty">
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
              Voir tous les clips <ArrowRight size={14} />
            </button>
          )}
        </>
      )}
    </div>
  );

  const TabRewards = (
    <>
      <div className="lm-section-head">
        <h2 className="lm-section-title">Roue quotidienne</h2>
      </div>
      <DailyWheelCard />

      <div className="lm-section-head">
        <h2 className="lm-section-title">Agenda et bonus</h2>
      </div>
      <DailyBonusAccessCard />

      <div className="lm-section-head">
        <h2 className="lm-section-title">Quêtes</h2>
      </div>
      <QuestsHomeCard />
    </>
  );

  /* ── Menu pane (compte, navigation, signaler) ─────────────────────── */
  const TabMenu = <MenuPane />;

  /* ═══════════════════════════════════════
     RENDER
  ═══════════════════════════════════════ */
  return (
    <main className="lm-page">
      {/* En-tête historique de la page mobile. */}
      <div className="lm-top">
        <div className="lm-hero">
          <div className="lm-hero-left">
            <span className="lm-hero-kicker"><Radio size={12} /> LunaLive</span>
            <h1 className="lm-logo">En direct</h1>
            <div className="lm-sub">
              <span>Les chaînes de la communauté</span>
              {refreshing ? <span className="lm-refreshing" aria-hidden /> : null}
            </div>
          </div>
          <div className="lm-hero-pills">
            <Pill tone="live" title="Lives en direct"><span className="lm-ping" aria-hidden /><b>{totals.liveCount}</b> live{totals.liveCount > 1 ? "s" : ""}</Pill>
            <Pill tone="neutral" title="Viewers total"><Users size={11} /> <b>{fmtViewers(totals.viewersTotal)}</b></Pill>
          </div>
        </div>
        {err && <div className="lm-err" style={{ marginTop: 8 }}>⚠️ {err}</div>}
      </div>

      {/* ── Pane actif (page scroll vertical normal, swipe horizontal pour changer) ── */}
      <section
        key={tab}
        className="lm-pane"
        style={{ ["--lm-pane-from" as any]: paneDir === 1 ? "16px" : "-16px" }}
        onTouchStart={onSwipeStart}
        onTouchMove={onSwipeMove}
        onTouchEnd={onSwipeEnd}
      >
        {tab === "menu"  && TabMenu}
        {tab === "lives" && TabLives}
        {tab === "bonus" && TabRewards}
        {tab === "clips" && TabClips}
      </section>
    </main>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   MenuPane — page interne complète : compte/login, profil, navigation, signaler
═══════════════════════════════════════════════════════════════════════ */
function MenuPane() {
  const navigate = useNavigate();
  const auth = useAuth() as any;
  const user = auth?.user ?? null;
  const token = auth?.token ?? null;
  const isLoggedIn = !!token && !!user;

  const [loginOpen, setLoginOpen] = React.useState(false);
  const [xp, setXp] = React.useState<XpInfo | null>(null);
  const [avatarOk, setAvatarOk] = React.useState(true);

  React.useEffect(() => {
    if (!isLoggedIn) { setXp(null); return; }
    let cancelled = false;
    const refresh = async () => {
      try { const r = await getMyXp(); if (!cancelled) setXp(r); } catch {}
    };
    refresh();
    const id = window.setInterval(refresh, 60_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [isLoggedIn]);

  const username = String(user?.username || "");
  const avatarSrc = pickAva(user);
  React.useEffect(() => setAvatarOk(true), [avatarSrc]);

  function openReport() {
    window.dispatchEvent(new Event("ui:report_open"));
  }

  return (
    <>
      {isLoggedIn ? (
        <Link to="/profile" className="lm-prof" aria-label="Mon compte">
          <div className="lm-prof-ava" aria-hidden>
            {avatarSrc && avatarOk
              ? <img src={String(avatarSrc)} alt="" onError={() => setAvatarOk(false)} />
              : <span>{_initials(username)}</span>}
          </div>
          <div className="lm-prof-meta">
            <div className="lm-prof-line1">
              <span className="lm-prof-name">{username || "Mon compte"}</span>
              {xp ? <span className="lm-prof-lvl" title={xp.fullTitle}>Lv {xp.level}</span> : null}
            </div>
            {xp ? (
              <>
                <div className="lm-prof-xpbar" aria-hidden>
                  <div
                    className={`lm-prof-xpfill${xp.isMax ? " is-max" : ""}`}
                    style={{ width: `${Math.max(2, Math.min(100, xp.pctToNext))}%` }}
                  />
                </div>
                <div className="lm-prof-xptext">
                  {xp.isMax
                    ? "⭐ Niveau MAX"
                    : `${xp.xp.toLocaleString("fr-FR")} XP · ${xp.xpToNext.toLocaleString("fr-FR")} pour Lv ${xp.level + 1}`}
                </div>
              </>
            ) : (
              <div className="lm-prof-xptext">Profil · Stats · Paramètres</div>
            )}
          </div>
          <span className="lm-prof-arrow" aria-hidden>›</span>
        </Link>
      ) : (
        <button type="button" className="lm-login-cta" onClick={() => setLoginOpen(true)} aria-label="Se connecter">
          <div className="lm-login-cta-icon" aria-hidden>👤</div>
          <div className="lm-login-cta-body">
            <div className="lm-login-cta-title">Connecte-toi</div>
            <div className="lm-login-cta-sub">Profil, XP, récompenses et chat</div>
          </div>
          <span className="lm-login-cta-arrow" aria-hidden>›</span>
        </button>
      )}

      <div className="lm-menu-section">Découvrir</div>
      <div className="lm-menu-list">
        <button type="button" className="lm-menu-item" onClick={() => navigate("/casinos")}>
          <span className="lm-menu-item-left">
            <span className="lm-menu-item-icon" aria-hidden>🎰</span>
            <span>CheckTaSlot</span>
          </span>
          <span className="lm-menu-item-arrow" aria-hidden>›</span>
        </button>
        <button type="button" className="lm-menu-item" onClick={() => navigate("/hunt")}>
          <span className="lm-menu-item-left">
            <span className="lm-menu-item-icon" aria-hidden>🧿</span>
            <span>Hunt</span>
          </span>
          <span className="lm-menu-item-arrow" aria-hidden>›</span>
        </button>
        <button type="button" className="lm-menu-item" onClick={() => navigate("/shop")}>
          <span className="lm-menu-item-left">
            <span className="lm-menu-item-icon" aria-hidden>🛍️</span>
            <span>Shop</span>
          </span>
          <span className="lm-menu-item-arrow" aria-hidden>›</span>
        </button>
        <button type="button" className="lm-menu-item" onClick={() => navigate("/event")}>
          <span className="lm-menu-item-left">
            <span className="lm-menu-item-icon" aria-hidden>🎉</span>
            <span>Événements</span>
          </span>
          <span className="lm-menu-item-arrow" aria-hidden>›</span>
        </button>
      </div>

      {isLoggedIn ? (
        <>
          <div className="lm-menu-section">Mon compte</div>
          <div className="lm-menu-list">
            <button type="button" className="lm-menu-item" onClick={() => navigate("/profile")}>
              <span className="lm-menu-item-left">
                <span className="lm-menu-item-icon" aria-hidden>👤</span>
                <span>Profil</span>
              </span>
              <span className="lm-menu-item-arrow" aria-hidden>›</span>
            </button>
            {(user?.role === "streamer" || user?.role === "admin") ? (
              <button type="button" className="lm-menu-item" onClick={() => navigate("/dashboard")}>
                <span className="lm-menu-item-left">
                  <span className="lm-menu-item-icon" aria-hidden>🚀</span>
                  <span>Dashboard streamer</span>
                </span>
                <span className="lm-menu-item-arrow" aria-hidden>›</span>
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      <div className="lm-menu-section">Aide</div>
      <div className="lm-menu-list">
        <button type="button" className="lm-menu-item lm-menu-item-danger" onClick={openReport}>
          <span className="lm-menu-item-left">
            <span className="lm-menu-item-icon" aria-hidden>🚩</span>
            <span>Signaler un problème</span>
          </span>
          <span className="lm-menu-item-arrow" aria-hidden>›</span>
        </button>
      </div>

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   StreamerSearch — barre de recherche dynamique en haut du pane Lives.
   Cache la liste complète des streamers, filtre client-side, suggestions
   au clavier (↑/↓/Enter/Escape) + clic.
═══════════════════════════════════════════════════════════════════════ */
let _streamersCache: { ts: number; data: ApiStreamer[] } | null = null;
const STREAMERS_TTL_MS = 60_000;

function StreamerSearch({ apiBase }: { apiBase: string }) {
  const navigate = useNavigate();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const wrapRef  = React.useRef<HTMLDivElement>(null);
  const [streamers, setStreamers] = React.useState<ApiStreamer[]>(() =>
    _streamersCache ? _streamersCache.data : []
  );
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [focusIdx, setFocusIdx] = React.useState(0);

  // Charge la liste (cache 60s)
  React.useEffect(() => {
    const fresh = _streamersCache && Date.now() - _streamersCache.ts < STREAMERS_TTL_MS;
    if (fresh) { setStreamers(_streamersCache!.data); return; }
    let cancelled = false;
    (async () => {
      try {
        const r = await getStreamers();
        if (cancelled) return;
        const data = Array.isArray(r) ? r : [];
        _streamersCache = { ts: Date.now(), data };
        setStreamers(data);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Click outside → close
  React.useEffect(() => {
    if (!open) return;
    const onDocDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDocDown);
    return () => document.removeEventListener("pointerdown", onDocDown);
  }, [open]);

  const matches = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) {
      // Suggestions par défaut : lives en direct triés par viewers
      return streamers
        .filter(s => s.isLive)
        .sort((a, b) => Number(b.viewers || 0) - Number(a.viewers || 0))
        .slice(0, 8);
    }
    const score = (s: ApiStreamer) => {
      const dn = String(s.displayName || "").toLowerCase();
      const sl = String(s.slug || "").toLowerCase();
      if (dn === needle || sl === needle) return 100;
      if (dn.startsWith(needle) || sl.startsWith(needle)) return 70;
      if (dn.includes(needle) || sl.includes(needle)) return 40;
      return 0;
    };
    return streamers
      .map(s => [s, score(s)] as const)
      .filter(([, sc]) => sc > 0)
      .sort((a, b) => {
        const ds = b[1] - a[1];
        if (ds !== 0) return ds;
        const liveDiff = Number(b[0].isLive) - Number(a[0].isLive);
        if (liveDiff !== 0) return liveDiff;
        return Number(b[0].viewers || 0) - Number(a[0].viewers || 0);
      })
      .slice(0, 12)
      .map(([s]) => s);
  }, [q, streamers]);

  React.useEffect(() => { setFocusIdx(0); }, [q]);

  function go(s: ApiStreamer) {
    setOpen(false);
    setQ("");
    inputRef.current?.blur();
    navigate(`/s/${encodeURIComponent(String(s.slug))}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setFocusIdx(i => Math.min(matches.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIdx(i => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      const m = matches[focusIdx];
      if (m) { e.preventDefault(); go(m); }
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  function ava(s: ApiStreamer) {
    const raw = (s as any).avatarUrl ?? (s as any).avatar_url ?? null;
    const u = raw ? (String(raw).startsWith("http") || String(raw).startsWith("//") ? String(raw)
      : String(raw).startsWith("/") ? `${apiBase}${raw}` : String(raw)) : null;
    return u;
  }
  function inits(s: ApiStreamer) {
    const n = String(s.displayName || s.slug || "?").trim();
    return (n[0] || "?").toUpperCase();
  }

  return (
    <div className="lm-search" ref={wrapRef}>
      <div className="lm-search-row">
        <span className="lm-search-icon" aria-hidden><Search size={17} /></span>
        <input
          ref={inputRef}
          className="lm-search-input"
          type="search"
          inputMode="search"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          placeholder="Chercher un streamer…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          aria-label="Chercher un streamer"
          aria-expanded={open}
          aria-controls="lm-suggest-list"
        />
        {q ? (
          <button
            type="button"
            className="lm-search-clear"
            onClick={() => { setQ(""); inputRef.current?.focus(); }}
            aria-label="Effacer"
          >✕</button>
        ) : null}
      </div>

      {open && matches.length > 0 ? (
        <div className="lm-suggest" id="lm-suggest-list" role="listbox">
          {matches.map((s, i) => {
            const av = ava(s);
            return (
              <button
                key={String(s.id || s.slug)}
                type="button"
                role="option"
                aria-selected={i === focusIdx}
                className={`lm-suggest-item${i === focusIdx ? " is-focus" : ""}`}
                onMouseEnter={() => setFocusIdx(i)}
                onClick={() => go(s)}
              >
                <div className="lm-suggest-ava" aria-hidden>
                  {av ? <img src={av} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> : <span>{inits(s)}</span>}
                </div>
                <div className="lm-suggest-meta">
                  <div className="lm-suggest-name">{s.displayName || s.slug}</div>
                  <div className="lm-suggest-sub">
                    <span>@{s.slug}</span>
                    {s.isLive ? (
                      <>
                        <span style={{ opacity: .4 }}>·</span>
                        <span>👁 {Number(s.viewers || 0).toLocaleString("fr-FR")}</span>
                      </>
                    ) : null}
                  </div>
                </div>
                {s.isLive ? <span className="lm-suggest-live">● LIVE</span> : null}
              </button>
            );
          })}
        </div>
      ) : open && q.trim().length > 0 ? (
        <div className="lm-suggest" id="lm-suggest-list" role="listbox">
          <div className="lm-suggest-empty">Aucun streamer trouvé pour « {q} »</div>
        </div>
      ) : null}
    </div>
  );
}
