// web/src/components/chat/TitlePill.tsx
//
// Pill compact pour afficher un titre avec préfixe icone selon source
// et gradient selon rareté/source. Réutilisable: chat, profil, listes.

import * as React from "react";
import type { ChatTitleEntry } from "../../lib/cosmetics";

const STYLE_ID = "tp-styles-v5";
const CSS = `
@media (prefers-reduced-motion: reduce) {
  .tp, .tp *, .tp::before, .tp::after { animation: none !important; }
}
@keyframes tp-shimmer {
  0%   { background-position: 0% 50%; }
  100% { background-position: 200% 50%; }
}
.tp {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 0px 5px;
  border-radius: 999px;
  font-size: 0.65em;
  font-weight: 700;
  line-height: 1.4;
  letter-spacing: 0;
  white-space: nowrap;
  background-size: 200% 100%;
  animation: tp-shimmer 6s linear infinite;
  vertical-align: middle;
  user-select: none;
  border: 1px solid rgba(255,255,255,0.08);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tp-icon { font-size: 0.85em; opacity: 0.95; flex-shrink: 0; }
.tp-label { line-height: 1.25; overflow: hidden; text-overflow: ellipsis; }

/* Rareté → gradient (commun à toutes sources) */
.tp-rarity-common      { background: linear-gradient(135deg, #94a3b8, #cbd5e1, #94a3b8); color: #0f172a; }
.tp-rarity-uncommon    { background: linear-gradient(135deg, #34d399, #6ee7b7, #34d399); color: #064e3b; }
.tp-rarity-rare        { background: linear-gradient(135deg, #60a5fa, #93c5fd, #60a5fa); color: #1e3a8a; }
.tp-rarity-epic        { background: linear-gradient(135deg, #c084fc, #d8b4fe, #c084fc); color: #4c1d95; }
/* Légendaire : fond SOMBRE + texte or (règle Lucas : plus jamais de fond
   jaune par défaut — illisible et moche) */
.tp-rarity-legendary   {
  background: linear-gradient(135deg, #171207, #2b2110, #171207);
  color: #fbbf24;
  border-color: rgba(251, 191, 36, 0.45);
  text-shadow: 0 0 4px rgba(251, 191, 36, 0.25);
}
.tp-rarity-mythic      {
  background: linear-gradient(135deg, #f472b6, #fbbf24, #22d3ee, #c084fc, #f472b6);
  background-size: 300% 100%;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0,0,0,0.45);
  border-color: rgba(255,255,255,0.18);
}

/* ══ TITRES D'EVENT (rendus spéciaux, specs Lucas) ══ */
/* Roi du Spin v3 : MACHINE À SOUS — les lettres défilent floues comme des
   rouleaux puis s'arrêtent une à une (gauche → droite), flash jackpot */
.tp-ev-spin {
  background: linear-gradient(135deg, #101014, #1f1f28);
  border-color: rgba(212, 175, 55, 0.5);
  animation: none;
  position: relative;
}
.tp-slot-cell {
  display: inline-block;
  overflow: hidden;
  height: 1.3em;
  line-height: 1.3em;
  vertical-align: middle;
}
.tp-slot-glyph {
  display: inline-block;
  background: linear-gradient(180deg, #fff3c4, #d4af37 60%, #a8741a);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  font-weight: 900;
  will-change: transform, filter;
  animation: tpSlotSpin 6s cubic-bezier(0.3, 0.6, 0.4, 1) infinite;
}
@keyframes tpSlotSpin {
  0%, 4% { transform: translateY(0); filter: blur(0); }
  8% { transform: translateY(-130%); filter: blur(1.6px); }
  8.02% { transform: translateY(130%); }
  14% { transform: translateY(-130%); }
  14.02% { transform: translateY(130%); }
  20% { transform: translateY(-130%); }
  20.02% { transform: translateY(130%); }
  26% { transform: translateY(0); filter: blur(0.6px); }
  30%, 100% { transform: translateY(0); filter: blur(0); }
}
/* flash jackpot une fois tous les rouleaux posés */
.tp-ev-spin::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: radial-gradient(60% 120% at 50% 50%, rgba(255, 216, 94, 0.5), transparent 70%);
  opacity: 0;
  animation: tpJackpot 6s ease-in-out infinite;
}
@keyframes tpJackpot {
  0%, 56% { opacity: 0; }
  60% { opacity: 1; }
  64% { opacity: 0.25; }
  68% { opacity: 0.85; }
  76%, 100% { opacity: 0; }
}

/* Baron du Coffre : fond sombre contrasté (retour Lucas), tirelire EN FIN
   de titre qui reçoit des pièces, grossit puis explose */
.tp-ev-baron {
  background: linear-gradient(135deg, #2a1c06, #4a3308);
  border-color: rgba(251, 191, 36, 0.45);
  color: #fde68a;
  animation: none;
  overflow: visible;
  position: relative;
}
.tp-ev-baron .tp-label {
  background: linear-gradient(180deg, #fff3c4, #fbbf24 70%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  font-weight: 900;
}
.tp-baron-scene { position: relative; display: inline-block; width: 1.3em; text-align: center; }
.tp-baron-pig { display: inline-block; animation: tpBaronPig 5s ease-in-out infinite; transform-origin: 50% 90%; }
.tp-baron-coin {
  position: absolute; left: 50%; top: -0.9em; margin-left: -0.4em;
  font-style: normal; font-size: 0.8em; pointer-events: none;
  animation: tpBaronCoin 5s ease-in infinite;
}
/* jiggle à chaque pièce reçue (18/38/58%) + gonflement puis explosion */
@keyframes tpBaronPig {
  0%, 12% { transform: scale(1) rotate(0); filter: none; }
  18% { transform: scale(1.02) rotate(-7deg); }
  22% { transform: scale(1.08) rotate(3deg); }
  26% { transform: scale(1.08) rotate(0); }
  38% { transform: scale(1.1) rotate(6deg); }
  42% { transform: scale(1.17) rotate(-3deg); }
  46% { transform: scale(1.17) rotate(0); }
  58% { transform: scale(1.2) rotate(-7deg); }
  62% { transform: scale(1.28) rotate(4deg); }
  66% { transform: scale(1.28) rotate(0); }
  74% { transform: scale(1.36) rotate(0); filter: brightness(1.15); }
  78% { transform: scale(1.65) rotate(0); filter: brightness(1.9) saturate(1.6); opacity: 1; }
  80% { transform: scale(0.2); opacity: 0; }
  88% { transform: scale(0.2); opacity: 0; }
  94% { transform: scale(1); opacity: 1; }
  100% { transform: scale(1); }
}
/* gerbe de pièces éjectées à l'explosion */
.tp-baron-jet {
  position: absolute;
  left: 50%;
  top: 30%;
  font-style: normal;
  font-size: 0.7em;
  pointer-events: none;
  opacity: 0;
}
.tp-baron-jet--1 { animation: tpJet1 5s ease-out infinite; }
.tp-baron-jet--2 { animation: tpJet2 5s ease-out infinite; }
.tp-baron-jet--3 { animation: tpJet3 5s ease-out infinite; }
@keyframes tpJet1 {
  0%, 77% { opacity: 0; transform: translate(0, 0) rotate(0); }
  79% { opacity: 1; }
  92% { opacity: 0; transform: translate(-1.4em, -1.1em) rotate(-160deg); }
  100% { opacity: 0; }
}
@keyframes tpJet2 {
  0%, 77% { opacity: 0; transform: translate(0, 0) rotate(0); }
  79% { opacity: 1; }
  92% { opacity: 0; transform: translate(0.2em, -1.5em) rotate(120deg); }
  100% { opacity: 0; }
}
@keyframes tpJet3 {
  0%, 77% { opacity: 0; transform: translate(0, 0) rotate(0); }
  79% { opacity: 1; }
  92% { opacity: 0; transform: translate(1.5em, -0.9em) rotate(200deg); }
  100% { opacity: 0; }
}
/* le titre ENCAISSE chaque pièce (squash) et s'embrase d'or progressivement
   (les pièces, elles, tombent pile sur le cochon — .tp-baron-coin) */
.tp-ev-baron .tp-label {
  display: inline-block;
  animation: tpBaronGlow 5s ease-in-out infinite;
}
@keyframes tpBaronGlow {
  0%, 10% { filter: brightness(0.92); transform: scale(1); }
  19% { transform: scale(1, 1); }
  21% { transform: scale(1.06, 0.9); }
  24% { transform: scale(1); filter: brightness(1); }
  39% { transform: scale(1, 1); }
  41% { transform: scale(1.07, 0.88); }
  44% { transform: scale(1); filter: brightness(1.08); }
  59% { transform: scale(1, 1); }
  61% { transform: scale(1.08, 0.87); }
  64% { transform: scale(1); filter: brightness(1.18) drop-shadow(0 0 4px rgba(251, 191, 36, 0.55)); }
  74% { filter: brightness(1.3) drop-shadow(0 0 6px rgba(251, 191, 36, 0.7)); }
  79% { transform: scale(1.12); filter: brightness(1.7) drop-shadow(0 0 10px rgba(251, 191, 36, 1)); }
  82% { transform: scale(1); }
  90%, 100% { filter: brightness(0.92); transform: scale(1); }
}
/* flash plein cadre à l'explosion */
.tp-ev-baron::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: radial-gradient(70% 140% at 60% 50%, rgba(255, 216, 94, 0.65), transparent 72%);
  opacity: 0;
  animation: tpBaronFlash 5s ease-out infinite;
}
@keyframes tpBaronFlash {
  0%, 76% { opacity: 0; }
  79% { opacity: 1; }
  88%, 100% { opacity: 0; }
}
@keyframes tpBaronCoin {
  0%, 6% { opacity: 0; transform: translateY(-2px); }
  10% { opacity: 1; }
  18% { opacity: 0; transform: translateY(0.9em); }
  22%, 26% { opacity: 0; transform: translateY(-2px); }
  30% { opacity: 1; }
  38% { opacity: 0; transform: translateY(0.9em); }
  42%, 46% { opacity: 0; transform: translateY(-2px); }
  50% { opacity: 1; }
  58% { opacity: 0; transform: translateY(0.9em); }
  62%, 100% { opacity: 0; }
}
.tp-baron-burst {
  position: absolute; left: 50%; top: 40%; width: 4px; height: 4px; margin: -2px;
  border-radius: 999px; pointer-events: none; opacity: 0; font-style: normal;
  box-shadow: 0 0 0 0 rgba(251,191,36,0.9);
  animation: tpBaronBurst 5s ease-out infinite;
}
@keyframes tpBaronBurst {
  0%, 76% { opacity: 0; box-shadow: 0 -2px 0 0 #fde68a, 2px 1px 0 0 #fbbf24, -2px 1px 0 0 #f59e0b; transform: scale(0.4); }
  80% { opacity: 1; transform: scale(1.4); }
  90% { opacity: 0; box-shadow: 0 -10px 0 1px #fde68a, 9px 6px 0 1px #fbbf24, -9px 6px 0 1px #f59e0b; transform: scale(1.8); }
  100% { opacity: 0; }
}

/* Split VERTICAL (Boss Slayer) : le slash balaye, les moitiés gauche/droite
   s'écartent puis se ressoudent — synchronisé sur tpSlash (6.5s) */
.tp-cutv-wrap { position: relative; display: inline-block; }
.tp-cutv-half {
  display: inline-block;
  background: linear-gradient(180deg, #fecaca 20%, #dc2626 70%, #7f1d1d);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  font-weight: 900;
}
.tp-cutv-half--left { position: absolute; left: 0; top: 0; clip-path: inset(0 48% 0 0); animation: tpCutVLeft 6.5s ease-in-out infinite; }
.tp-cutv-half--right { clip-path: inset(0 0 0 52%); animation: tpCutVRight 6.5s ease-in-out infinite; }
/* écart synchronisé sur la LAME VERTICALE (tpGuillotine : descend 66-73%) */
@keyframes tpCutVLeft {
  0%, 72%, 100% { transform: translateX(0); }
  76% { transform: translateX(-3px); }
  88% { transform: translateX(-1.4px); }
  94% { transform: translateX(0); }
}
@keyframes tpCutVRight {
  0%, 72%, 100% { transform: translateX(0); }
  76% { transform: translateX(3px); }
  88% { transform: translateX(1.4px); }
  94% { transform: translateX(0); }
}

/* Boss Slayer : rouge ensanglanté, gouttes qui tombent + coup d'épée */
.tp-ev-slayer {
  background: linear-gradient(180deg, #450a0a, #7f1d1d);
  color: #fca5a5;
  border-color: rgba(220, 38, 38, 0.45);
  animation: none;
  overflow: visible;
  position: relative;
}
.tp-ev-slayer .tp-label {
  overflow: visible;
  background: linear-gradient(180deg, #fecaca 20%, #dc2626 70%, #7f1d1d);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  font-weight: 900;
}
.tp-drip {
  position: absolute; top: 70%; width: 3px; height: 5px;
  border-radius: 40% 40% 60% 60%; background: #b91c1c; pointer-events: none;
  animation: tpDrip 3.4s ease-in infinite;
}
.tp-drip--1 { left: 28%; animation-delay: 0s; }
.tp-drip--2 { left: 64%; animation-delay: 1.7s; }
@keyframes tpDrip {
  0%, 55% { opacity: 0; transform: translateY(0) scaleY(0.6); }
  62% { opacity: 0.95; transform: translateY(1px) scaleY(1); }
  90% { opacity: 0.9; transform: translateY(9px) scaleY(1.15); }
  100% { opacity: 0; transform: translateY(12px); }
}
.tp-slash {
  position: absolute; left: -6%; right: -6%; top: 50%; height: 1.6px; margin-top: -0.8px;
  background: linear-gradient(90deg, transparent, #fff 22%, #ffe9e9 50%, #fff 78%, transparent);
  filter: drop-shadow(0 0 4px rgba(255,255,255,0.9));
  opacity: 0; pointer-events: none; transform: translateX(-30%) rotate(-4deg);
  animation: tpSlash 6.5s ease-in-out infinite;
}
@keyframes tpSlash {
  0%, 78% { opacity: 0; transform: translateX(-45%) rotate(-4deg); }
  81% { opacity: 1; }
  86% { opacity: 1; transform: translateX(45%) rotate(-4deg); }
  89%, 100% { opacity: 0; transform: translateX(45%) rotate(-4deg); }
}

/* Bourreau : la lame s'abat et COUPE le titre en deux, qui se ressoude */
.tp-ev-bourreau {
  background: linear-gradient(135deg, #1c1c22, #34343c);
  color: #e2e8f0;
  border-color: rgba(220, 38, 38, 0.4);
  animation: none;
  overflow: visible;
  position: relative;
}
.tp-bourreau-wrap { position: relative; display: inline-block; }
/* bas des lettres ensanglanté : le gradient commun vire au sang vers le bas */
.tp-bourreau-half { display: inline-block; background: linear-gradient(180deg, #f1f5f9, #94a3b8 45%, #dc2626 78%, #7f1d1d 100%); -webkit-background-clip: text; background-clip: text; color: transparent; font-weight: 900; }
/* moitiés parfaitement contiguës (0..52% / 52..100%) — aucun chevauchement,
   sinon le texte paraît dédoublé au repos */
.tp-bourreau-half--top { position: absolute; left: 0; top: 0; clip-path: inset(0 0 48% 0); animation: tpCutTop 6.5s ease-in-out infinite; }
.tp-bourreau-half--bottom { clip-path: inset(52% 0 0 0); animation: tpCutBottom 6.5s ease-in-out infinite; }
/* écart synchronisé sur le passage du slash horizontal (tpSlash, 6.5s) */
@keyframes tpCutTop {
  0%, 84%, 100% { transform: translate(0, 0) rotate(0); }
  87% { transform: translate(-1.5px, -2.4px) rotate(-2deg); }
  94% { transform: translate(-0.8px, -1.2px) rotate(-1deg); }
  98% { transform: translate(0, 0) rotate(0); }
}
@keyframes tpCutBottom {
  0%, 84%, 100% { transform: translate(0, 0) rotate(0); }
  87% { transform: translate(1.5px, 2.6px) rotate(1.6deg); }
  94% { transform: translate(0.8px, 1.3px) rotate(0.8deg); }
  98% { transform: translate(0, 0) rotate(0); }
}
.tp-guillotine {
  position: absolute; left: 50%; top: -1.1em; width: 2.5px; height: 1.1em; margin-left: -1px;
  background: linear-gradient(180deg, transparent, #e2e8f0 30%, #f8fafc);
  clip-path: polygon(0 0, 100% 0, 100% 78%, 50% 100%, 0 78%);
  filter: drop-shadow(0 0 3px rgba(226,232,240,0.8));
  opacity: 0; pointer-events: none;
  animation: tpGuillotine 6.5s cubic-bezier(0.6, 0, 0.9, 0.4) infinite;
}
@keyframes tpGuillotine {
  0%, 66% { opacity: 0; transform: translateY(-6px); }
  69% { opacity: 1; transform: translateY(-4px); }
  73% { opacity: 1; transform: translateY(1.15em); }
  76%, 100% { opacity: 0; transform: translateY(1.15em); }
}

/* ══ TITLE FX (rework 11 juil) — animations lettre par lettre.
   Grille raretés (specs Lucas, comme pseudos/cadrans) :
   épique = habillage + anim très légère (4 familles) ;
   légendaire = effet UNIQUE par titre, anim moyenne ;
   mythique = DA complète. Chaque lettre est un span .tfx-l avec
   son index dans --i (stagger via animation-delay). ══ */
.tfx { overflow: visible; }
.tfx .tp-label { overflow: visible; }
.tfx-l { display: inline-block; white-space: pre; will-change: transform; }

/* ── Familles ÉPIQUES (anim très légère) ─────────────────── */
/* e-gold : reflet doré qui court sur les lettres (casino/économie) */
.tfx--e-gold .tfx-l { animation: tfxGlint 6.5s ease-in-out calc(var(--i) * 0.12s) infinite; }
@keyframes tfxGlint {
  0%, 78%, 100% { filter: brightness(1); }
  84% { filter: brightness(1.55) drop-shadow(0 0 2px rgba(255,243,196,0.7)); }
  90% { filter: brightness(1); }
}
/* e-pulse : respiration lumineuse du pill (fidélité/watch) */
.tfx--e-pulse { animation: tp-shimmer 6s linear infinite, tfxPillBreath 5s ease-in-out infinite; }
@keyframes tfxPillBreath {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0); }
  50% { box-shadow: 0 0 8px 0 rgba(255,255,255,0.28); }
}
/* e-pop : micro-rebond en vague occasionnel (chat/social) */
.tfx--e-pop .tfx-l { animation: tfxMicroPop 5.4s ease-in-out calc(var(--i) * 0.1s) infinite; }
@keyframes tfxMicroPop {
  0%, 74%, 100% { transform: translateY(0); }
  80% { transform: translateY(-1.4px) scale(1.06); }
  86% { transform: translateY(0) scale(1); }
}
/* e-bat : bat-signal — pill sombre, halo jaune qui balaye (Batman) */
.tfx--e-bat {
  background: linear-gradient(135deg, #101014, #1c1c26);
  color: #fde047;
  border-color: rgba(253, 224, 71, 0.4);
  animation: tfxBatSignal 6s ease-in-out infinite;
}
@keyframes tfxBatSignal {
  0%, 62%, 100% { box-shadow: 0 0 2px rgba(253,224,71,0.1); }
  70% { box-shadow: 0 0 10px rgba(253,224,71,0.6); }
  78% { box-shadow: 0 0 4px rgba(253,224,71,0.2); }
}
/* la chauve-souris traverse le ciel du titre en vol erratique */
.tfx--e-bat .tfx-prop--1 { top: -0.5em; left: -0.5em; font-size: 0.55em; opacity: 0; animation: tfxBatFly 6s ease-in-out infinite; }
.tfx--e-bat .tfx-prop--1::after { content: "🦇"; }
@keyframes tfxBatFly {
  0%, 56% { transform: translate(0, 0.2em); opacity: 0; }
  62% { transform: translate(1em, -0.15em); opacity: 1; }
  70% { transform: translate(2.6em, 0.12em) scaleX(-1); }
  78% { transform: translate(4.2em, -0.2em); }
  86% { transform: translate(5.6em, 0.05em); opacity: 1; }
  92%, 100% { transform: translate(6.6em, -0.3em); opacity: 0; }
}

/* ── ACCESSOIRES de scène (props) ────────────────────────── */
.tfx { position: relative; }
.tfx-prop { position: absolute; pointer-events: none; font-style: normal; line-height: 1; z-index: 3; }

/* ══ LÉGENDAIRES — une SCÈNE narrative par titre (nom + obtention) ══ */

/* moon — Sous la lune (30h de watch le soir) : la nuit tombe, une lune
   se lève en arc au-dessus du titre, argente les lettres à son zénith,
   puis se couche — les lettres gardent leur éclat le temps de la nuit */
.tfx--moon { background: linear-gradient(135deg, #0b0e1d, #1d2340); color: #64748b; animation: none; }
.tfx--moon .tfx-l { animation: tfxMoonTide 8s ease-in-out calc(var(--i) * 0.1s) infinite; }
@keyframes tfxMoonTide {
  0%, 8% { color: #64748b; text-shadow: none; }
  30% { color: #f8fafc; text-shadow: 0 0 7px rgba(226,232,240,0.95); transform: translateY(-1px); }
  40%, 74% { color: #e2e8f0; text-shadow: 0 0 4px rgba(226,232,240,0.5); transform: translateY(0); }
  92%, 100% { color: #64748b; text-shadow: none; }
}
/* (lune retirée sur retour Lucas — la marée d'argent seule) */

/* roue — Prêtre de la roue (200 spins) : une bille blanche parcourt le
   titre, chaque lettre croisée tourne comme une case de roulette, la
   dernière flashe rouge — le numéro gagnant */
.tfx--roue { background: linear-gradient(135deg, #131016, #241a1c); color: #e7cba0; animation: none; }
.tfx--roue .tfx-l { animation: tfxRouletteSpin 7s cubic-bezier(0.4, 0, 0.3, 1) calc(var(--i) * 0.12s) infinite; }
.tfx--roue .tfx-l:nth-child(odd) { color: #b91c1c; }
@keyframes tfxRouletteSpin {
  0%, 8% { transform: rotateY(0); filter: brightness(1); }
  14% { transform: rotateY(180deg); filter: brightness(0.7); }
  20% { transform: rotateY(360deg); filter: brightness(1); }
  46% { filter: brightness(1); text-shadow: none; }
  52% { filter: brightness(1.9); text-shadow: 0 0 6px rgba(252,165,165,0.9); }
  58%, 100% { transform: rotateY(360deg); filter: brightness(1); text-shadow: none; }
}
.tfx--roue .tfx-prop--1 {
  top: 55%; left: 6%; width: 0.24em; height: 0.24em; border-radius: 999px;
  background: radial-gradient(circle at 35% 30%, #fff, #cbd5e1);
  box-shadow: 0 0 3px rgba(255,255,255,0.9);
  animation: tfxBille 7s cubic-bezier(0.3, 0.1, 0.4, 1) infinite;
}
@keyframes tfxBille {
  0% { left: 4%; top: 62%; opacity: 1; }
  10% { left: 40%; top: 28%; }
  20% { left: 78%; top: 58%; }
  30% { left: 55%; top: 24%; }
  40% { left: 86%; top: 45%; }
  48% { left: 88%; top: 52%; }
  56%, 88% { left: 88%; top: 52%; opacity: 1; }
  94%, 100% { left: 4%; top: 62%; opacity: 0; }
}

/* scribe — Archiviste (10 000 messages) : un curseur d'écriture avance
   et tape les lettres une à une sur le parchemin, clignote en fin de
   ligne, puis la page s'efface pour la suivante */
.tfx--scribe { background: linear-gradient(135deg, #2c2416, #453620); color: #e7d8b0; animation: none; }
.tfx--scribe .tfx-l { animation: tfxTypeIn 7.5s steps(1) calc(var(--i) * 0.16s) infinite; }
@keyframes tfxTypeIn {
  0% { opacity: 0; }
  4%, 82% { opacity: 1; }
  88%, 100% { opacity: 0; }
}
/* (curseur vertical retiré sur retour Lucas — la frappe seule) */

/* pillar — Pilier (soutenir 20 streamers) : chaque colonne s'abat avec
   un impact qui soulève la poussière, l'édifice tient, aura de solidité */
.tfx--pillar { background: linear-gradient(135deg, #1c1917, #2c2825); color: #e7e5e4; animation: none; }
.tfx--pillar .tfx-l { animation: tfxSlamDown 7s cubic-bezier(0.5, 0, 0.8, 0.3) calc(var(--i) * 0.14s) infinite; }
@keyframes tfxSlamDown {
  0% { transform: translateY(-0.9em) scaleY(1.15); opacity: 0; }
  5% { transform: translateY(0.06em) scaleY(0.85); opacity: 1; }
  9% { transform: translateY(0) scaleY(1); }
  50% { text-shadow: none; }
  58% { text-shadow: 0 0 5px rgba(253,230,138,0.55); color: #fde68a; }
  76% { text-shadow: 0 0 2px rgba(253,230,138,0.25); color: #e7e5e4; }
  88% { transform: translateY(0); opacity: 1; }
  94%, 100% { transform: translateY(-0.9em); opacity: 0; }
}
.tfx--pillar .tfx-prop--1 {
  bottom: 8%; left: 12%; width: 3px; height: 3px; border-radius: 999px; opacity: 0;
  box-shadow: 0.2em 0 0 rgba(231,229,228,0.7), 1.2em 0.05em 0 rgba(231,229,228,0.6), 2.4em -0.02em 0 rgba(231,229,228,0.65), 3.4em 0.04em 0 rgba(231,229,228,0.55);
  background: rgba(231,229,228,0.7);
  animation: tfxDust 7s ease-out infinite;
}
@keyframes tfxDust {
  0%, 4% { opacity: 0; transform: translateY(0) scale(0.6); }
  10% { opacity: 0.9; transform: translateY(-0.14em) scale(1); }
  22% { opacity: 0; transform: translateY(-0.3em) scale(1.3); }
  100% { opacity: 0; }
}

/* sparkle — Parfait (30 bonus quotidiens/mois) : une étincelle saute de
   lettre en lettre pour cocher chaque jour, et quand le mois est parfait
   le titre explose d'or */
.tfx--sparkle .tfx-l { animation: tfxCheck 6.5s ease-in-out calc(var(--i) * 0.14s) infinite; }
@keyframes tfxCheck {
  0%, 6% { filter: brightness(0.85); }
  11% { filter: brightness(1.9) drop-shadow(0 0 3px rgba(255,255,255,0.95)); transform: scale(1.14); }
  16% { filter: brightness(1.15); transform: scale(1); }
  52% { filter: brightness(1.15); }
  58% { filter: brightness(1.7) drop-shadow(0 0 5px rgba(253,230,138,1)); }
  66%, 86% { filter: brightness(1.25); }
  94%, 100% { filter: brightness(0.85); }
}
.tfx--sparkle .tfx-prop--1 { top: -0.55em; left: 8%; font-size: 0.62em; animation: tfxHopStar 6.5s ease-in-out infinite; }
.tfx--sparkle .tfx-prop--1::after { content: "✦"; color: #fff; text-shadow: 0 0 4px #fde68a; }
@keyframes tfxHopStar {
  0% { left: 6%; transform: translateY(0); opacity: 1; }
  8% { left: 22%; transform: translateY(-0.4em); }
  16% { left: 38%; transform: translateY(0); }
  24% { left: 54%; transform: translateY(-0.4em); }
  32% { left: 70%; transform: translateY(0); }
  40% { left: 86%; transform: translateY(-0.4em); }
  48% { left: 92%; transform: translateY(0); opacity: 1; }
  56% { opacity: 0; transform: scale(2); }
  100% { left: 6%; opacity: 0; }
}

/* huecycle — Polyvalent (3 gold dans 3 catégories) : trois familles de
   lettres vivent chacune leur couleur, puis convergent en blanc pur */
.tfx--huecycle { background: linear-gradient(135deg, #17171f, #23232f); animation: none; }
.tfx--huecycle .tfx-l { animation: tfxTri1 7s ease-in-out infinite; }
.tfx--huecycle .tfx-l:nth-child(3n+2) { animation-name: tfxTri2; }
.tfx--huecycle .tfx-l:nth-child(3n) { animation-name: tfxTri3; }
@keyframes tfxTri1 {
  0%, 48% { color: #f472b6; text-shadow: 0 0 3px rgba(244,114,182,0.5); transform: translateY(0); }
  58%, 82% { color: #ffffff; text-shadow: 0 0 6px rgba(255,255,255,0.9); transform: translateY(-1px); }
  92%, 100% { color: #f472b6; text-shadow: 0 0 3px rgba(244,114,182,0.5); transform: translateY(0); }
}
@keyframes tfxTri2 {
  0%, 48% { color: #67e8f9; text-shadow: 0 0 3px rgba(103,232,249,0.5); transform: translateY(0); }
  58%, 82% { color: #ffffff; text-shadow: 0 0 6px rgba(255,255,255,0.9); transform: translateY(-1px); }
  92%, 100% { color: #67e8f9; text-shadow: 0 0 3px rgba(103,232,249,0.5); transform: translateY(0); }
}
@keyframes tfxTri3 {
  0%, 48% { color: #fde047; text-shadow: 0 0 3px rgba(253,224,71,0.5); transform: translateY(0); }
  58%, 82% { color: #ffffff; text-shadow: 0 0 6px rgba(255,255,255,0.9); transform: translateY(-1px); }
  92%, 100% { color: #fde047; text-shadow: 0 0 3px rgba(253,224,71,0.5); transform: translateY(0); }
}

/* puzzle — Collection par catégorie (tous les bronze+silver) : les pièces
   arrivent des quatre directions, s'emboîtent avec un clic, la collection
   complète s'illumine */
.tfx--puzzle .tfx-l { animation: tfxAssemble 7.5s cubic-bezier(0.2, 0.9, 0.3, 1.1) calc(var(--i) * 0.08s) infinite; }
.tfx--puzzle .tfx-l:nth-child(4n+2) { animation-name: tfxAssembleB; }
.tfx--puzzle .tfx-l:nth-child(4n+3) { animation-name: tfxAssembleC; }
.tfx--puzzle .tfx-l:nth-child(4n) { animation-name: tfxAssembleD; }
@keyframes tfxAssemble {
  0% { transform: translate(-0.8em, 0); opacity: 0; }
  9% { transform: translate(0.04em, 0); opacity: 1; }
  12% { transform: translate(0, 0); }
  55% { filter: brightness(1); }
  62%, 84% { filter: brightness(1.5) drop-shadow(0 0 3px rgba(255,255,255,0.7)); }
  90% { filter: brightness(1); opacity: 1; }
  96%, 100% { opacity: 0; transform: translate(-0.8em, 0); }
}
@keyframes tfxAssembleB {
  0% { transform: translate(0.8em, 0); opacity: 0; }
  9% { transform: translate(-0.04em, 0); opacity: 1; }
  12% { transform: translate(0, 0); }
  55% { filter: brightness(1); }
  62%, 84% { filter: brightness(1.5) drop-shadow(0 0 3px rgba(255,255,255,0.7)); }
  90% { filter: brightness(1); opacity: 1; }
  96%, 100% { opacity: 0; transform: translate(0.8em, 0); }
}
@keyframes tfxAssembleC {
  0% { transform: translate(0, -0.7em); opacity: 0; }
  9% { transform: translate(0, 0.04em); opacity: 1; }
  12% { transform: translate(0, 0); }
  55% { filter: brightness(1); }
  62%, 84% { filter: brightness(1.5) drop-shadow(0 0 3px rgba(255,255,255,0.7)); }
  90% { filter: brightness(1); opacity: 1; }
  96%, 100% { opacity: 0; transform: translate(0, -0.7em); }
}
@keyframes tfxAssembleD {
  0% { transform: translate(0, 0.7em); opacity: 0; }
  9% { transform: translate(0, -0.04em); opacity: 1; }
  12% { transform: translate(0, 0); }
  55% { filter: brightness(1); }
  62%, 84% { filter: brightness(1.5) drop-shadow(0 0 3px rgba(255,255,255,0.7)); }
  90% { filter: brightness(1); opacity: 1; }
  96%, 100% { opacity: 0; transform: translate(0, 0.7em); }
}

/* trophy — Ultime (20 succès débloqués) : les lettres se dorent une à
   une (chaque succès gagné), et au 20e le trophée s'embrase — reflet
   intégral + rebond de victoire */
.tfx--trophy .tfx-l { animation: tfxGoldize 7s ease-in-out calc(var(--i) * 0.16s) infinite; }
@keyframes tfxGoldize {
  0%, 4% { color: #a8a29e; text-shadow: none; transform: translateY(0); }
  12%, 46% { color: #fbbf24; text-shadow: 0 0 3px rgba(251,191,36,0.5); }
  54% { color: #fff3c4; text-shadow: 0 0 8px rgba(255,243,196,1); transform: translateY(-0.1em); }
  60% { transform: translateY(0); }
  66%, 86% { color: #fbbf24; text-shadow: 0 0 4px rgba(251,191,36,0.6); }
  94%, 100% { color: #a8a29e; text-shadow: none; }
}
.tfx--trophy .tfx-prop--1 {
  inset: 0; border-radius: inherit;
  background: linear-gradient(115deg, transparent 36%, rgba(255,243,196,0.55) 50%, transparent 64%);
  transform: translateX(-110%);
  animation: tfxTrophySheen 7s ease-in-out infinite;
}
@keyframes tfxTrophySheen { 0%, 50% { transform: translateX(-110%); } 64%, 100% { transform: translateX(110%); } }

/* stalk — Prédateur (300 calls envoyés) : deux yeux s'ouvrent dans le
   noir au-dessus de la proie, les lettres tremblent, il BONDIT — tout
   s'écrase puis se relève */
.tfx--stalk { background: linear-gradient(135deg, #120a0a, #241010); color: #fca5a5; animation: none; }
.tfx--stalk .tfx-l { animation: tfxPrey 7s ease-in-out calc(var(--i) * 0.02s) infinite; }
@keyframes tfxPrey {
  0%, 22% { transform: translate(0, 0) scaleY(1); color: #fca5a5; }
  32% { transform: translate(0.3px, 0); }
  38% { transform: translate(-0.3px, 0.2px); }
  44% { transform: translate(0.35px, -0.2px); }
  50% { transform: translate(0, 0); }
  55% { transform: scaleY(0.55) translateY(0.2em); color: #ef4444; text-shadow: 0 0 6px rgba(239,68,68,0.9); }
  62% { transform: scaleY(1.06) translateY(-0.03em); }
  66% { transform: scaleY(1) translateY(0); color: #fca5a5; text-shadow: none; }
  100% { transform: translate(0, 0); }
}
.tfx--stalk .tfx-prop--1, .tfx--stalk .tfx-prop--2 {
  top: -0.42em; width: 0.22em; height: 0.14em; border-radius: 999px;
  background: #ef4444; box-shadow: 0 0 4px rgba(239,68,68,1);
  transform: scaleY(0); animation: tfxEyes 7s ease-in-out infinite;
}
.tfx--stalk .tfx-prop--1 { left: 38%; }
.tfx--stalk .tfx-prop--2 { left: 54%; }
@keyframes tfxEyes {
  0%, 16% { transform: scaleY(0); }
  24%, 30% { transform: scaleY(1); }
  33% { transform: scaleY(0.1); }
  36%, 50% { transform: scaleY(1); }
  54%, 100% { transform: scaleY(0); }
}

/* ticker — Trader (100 payouts) : la ligne de cours traverse le titre,
   les lettres montent au vert, krach rouge, puis le payout tombe : $ */
.tfx--ticker { background: linear-gradient(135deg, #0d1117, #161f2c); animation: none; }
.tfx--ticker .tfx-l { color: #9ca3af; animation: tfxQuote 7.5s ease-in-out calc(var(--i) * 0.07s) infinite; }
@keyframes tfxQuote {
  0%, 8% { color: #9ca3af; transform: translateY(0); }
  20%, 34% { color: #4ade80; transform: translateY(-0.08em); text-shadow: 0 0 4px rgba(74,222,128,0.6); }
  42%, 50% { color: #f87171; transform: translateY(0.1em); text-shadow: 0 0 4px rgba(248,113,113,0.6); }
  60%, 86% { color: #4ade80; transform: translateY(-0.04em); text-shadow: 0 0 3px rgba(74,222,128,0.4); }
  96%, 100% { color: #9ca3af; transform: translateY(0); text-shadow: none; }
}
.tfx--ticker .tfx-prop--1 {
  top: 50%; left: 0; right: 0; height: 1.4px;
  background: linear-gradient(90deg, transparent, rgba(74,222,128,0.9) 30%, rgba(248,113,113,0.9) 55%, rgba(74,222,128,0.9) 80%, transparent);
  transform: translateX(-100%);
  animation: tfxCourbe 7.5s linear infinite;
  opacity: 0.65;
}
@keyframes tfxCourbe { 0%, 6% { transform: translateX(-100%); } 56% { transform: translateX(100%); } 100% { transform: translateX(100%); } }
.tfx--ticker .tfx-prop--2 { top: -0.6em; right: 8%; font-size: 0.7em; opacity: 0; animation: tfxPayout 7.5s ease-out infinite; }
.tfx--ticker .tfx-prop--2::after { content: "$"; color: #fde68a; text-shadow: 0 0 4px rgba(253,230,138,0.9); font-weight: 900; }
@keyframes tfxPayout {
  0%, 58% { opacity: 0; transform: translateY(0.4em) scale(0.6); }
  66% { opacity: 1; transform: translateY(-0.1em) scale(1.15); }
  78% { opacity: 1; transform: translateY(-0.3em) scale(1); }
  88%, 100% { opacity: 0; transform: translateY(-0.6em); }
}

/* shock — Max frappe (multiplicateur x1000) : le compteur monte, tout
   vibre de plus en plus fort, IMPACT — onde de choc et lettres soufflées */
.tfx--shock .tfx-l { animation: tfxCharge 6.5s linear calc(var(--i) * 0.02s) infinite; }
@keyframes tfxCharge {
  0%, 18% { transform: translate(0, 0) scale(1); }
  30% { transform: translate(0.2px, -0.15px); }
  40% { transform: translate(-0.35px, 0.25px); }
  48% { transform: translate(0.5px, -0.4px); }
  54% { transform: translate(-0.6px, 0.5px); filter: brightness(1.3); }
  58% { transform: scale(1.35); filter: brightness(2); }
  63% { transform: scale(0.92); filter: brightness(1.1); }
  67%, 90% { transform: scale(1); filter: brightness(1.25) drop-shadow(0 0 3px rgba(255,255,255,0.5)); }
  100% { transform: scale(1); filter: brightness(1); }
}
.tfx--shock .tfx-prop--1 {
  top: 50%; left: 50%; width: 0.5em; height: 0.5em; margin: -0.25em;
  border: 1.5px solid rgba(255,255,255,0.9); border-radius: 999px;
  opacity: 0; animation: tfxRing 6.5s ease-out infinite;
}
@keyframes tfxRing {
  0%, 56% { opacity: 0; transform: scale(0.2); }
  58% { opacity: 1; transform: scale(0.4); }
  70% { opacity: 0; transform: scale(6); }
  100% { opacity: 0; }
}

/* mystic — Oracle (40 prédictions gagnées) : le troisième œil s'ouvre,
   son rayon balaye et révèle les lettres qui lévitent, vision violette */
.tfx--mystic { background: linear-gradient(135deg, #170c2c, #271447); color: #6d5a94; animation: none; }
.tfx--mystic .tfx-l { animation: tfxVision 7s ease-in-out calc(var(--i) * 0.09s) infinite; }
@keyframes tfxVision {
  0%, 14% { color: #6d5a94; text-shadow: none; transform: translateY(0); }
  28%, 76% { color: #e9d5ff; text-shadow: 0 0 6px rgba(192,132,252,0.9); transform: translateY(-0.08em); }
  90%, 100% { color: #6d5a94; text-shadow: none; transform: translateY(0); }
}
.tfx--mystic .tfx-prop--1 { top: -0.72em; left: 46%; font-size: 0.66em; transform: scaleY(0); animation: tfxThirdEye 7s ease-in-out infinite; }
.tfx--mystic .tfx-prop--1::after { content: "👁"; filter: hue-rotate(230deg) saturate(1.4); }
@keyframes tfxThirdEye {
  0%, 8% { transform: scaleY(0); }
  16%, 78% { transform: scaleY(1); }
  86%, 100% { transform: scaleY(0); }
}
.tfx--mystic .tfx-prop--2 {
  inset: 0; border-radius: inherit;
  background: linear-gradient(90deg, transparent 40%, rgba(192,132,252,0.3) 50%, transparent 60%);
  transform: translateX(-80%);
  animation: tfxRayon 7s ease-in-out infinite;
}
@keyframes tfxRayon {
  0%, 14% { transform: translateX(-80%); opacity: 0; }
  20% { opacity: 1; }
  46% { transform: translateX(80%); opacity: 1; }
  52%, 100% { transform: translateX(80%); opacity: 0; }
}

/* aqua — Nessie (150 mains de blackjack) : une bosse passe sous la
   surface et soulève les lettres l'une après l'autre, éclaboussure,
   puis les eaux se calment */
.tfx--aqua { background: linear-gradient(180deg, #082f49, #0c4a6e); color: #7dd3fc; animation: none; }
.tfx--aqua .tfx-l { animation: tfxBosse 6.5s ease-in-out calc(var(--i) * 0.13s) infinite; }
@keyframes tfxBosse {
  0%, 10% { transform: translateY(0); }
  18% { transform: translateY(-0.22em); text-shadow: 0 0.2em 4px rgba(125,211,252,0.5); }
  26% { transform: translateY(0.05em); text-shadow: none; }
  32% { transform: translateY(0); }
  40%, 88% { transform: translateY(0); }
  94% { transform: translateY(-0.03em); }
  100% { transform: translateY(0); }
}
.tfx--aqua .tfx-prop--1 {
  bottom: -0.1em; left: -20%; width: 1.1em; height: 0.5em;
  border-radius: 999px 999px 0 0; background: rgba(8, 47, 73, 0.9);
  border-top: 1.5px solid rgba(125,211,252,0.6);
  animation: tfxNessieBump 6.5s ease-in-out infinite;
}
@keyframes tfxNessieBump {
  0%, 6% { left: -22%; opacity: 0; }
  12% { opacity: 1; }
  40% { left: 96%; opacity: 1; }
  46%, 100% { left: 110%; opacity: 0; }
}
.tfx--aqua .tfx-prop--2 { top: -0.4em; right: 4%; font-size: 0.55em; opacity: 0; animation: tfxSplash 6.5s ease-out infinite; }
.tfx--aqua .tfx-prop--2::after { content: "💦"; }
@keyframes tfxSplash {
  0%, 38% { opacity: 0; transform: translateY(0.3em) scale(0.5); }
  44% { opacity: 1; transform: translateY(-0.15em) scale(1.1); }
  54%, 100% { opacity: 0; transform: translateY(-0.4em) scale(0.8); }
}

/* deal — Croupier slayer (3000 rubis nets au BJ) : les cartes sont
   distribuées, puis l'As fatal traverse et TRANCHE la main du croupier */
.tfx--deal { background: linear-gradient(135deg, #0c1a12, #143024); color: #86efac; animation: none; }
.tfx--deal .tfx-l { animation: tfxDealCut 7s ease-in-out calc(var(--i) * 0.11s) infinite; backface-visibility: hidden; }
@keyframes tfxDealCut {
  0% { transform: rotateX(90deg); opacity: 0; }
  6% { transform: rotateX(0); opacity: 1; }
  46% { transform: translateY(0); }
  52% { transform: translateY(-0.14em) rotate(-3deg); filter: brightness(1.6); }
  58% { transform: translateY(0) rotate(0); filter: brightness(1.15); }
  86% { transform: rotateX(0); opacity: 1; filter: brightness(1.1); }
  94%, 100% { transform: rotateX(90deg); opacity: 0; }
}
.tfx--deal .tfx-prop--1 {
  top: 8%; left: -12%; font-size: 0.62em; padding: 0 0.14em;
  background: #f8fafc; color: #b91c1c; border-radius: 2px; font-weight: 900;
  animation: tfxAsFatal 7s cubic-bezier(0.6, 0, 0.4, 1) infinite; opacity: 0;
}
.tfx--deal .tfx-prop--1::after { content: "A♠"; color: #0f172a; }
@keyframes tfxAsFatal {
  0%, 40% { left: -14%; transform: rotate(-20deg); opacity: 0; }
  46% { opacity: 1; }
  58% { left: 104%; transform: rotate(20deg); opacity: 1; }
  64%, 100% { left: 110%; opacity: 0; }
}

/* coin — Baron (10 000 rubis en poche) : les pièces tombent sur les
   lettres qui ploient sous le poids puis se redressent, cousues d'or */
.tfx--coin .tfx-l { animation: tfxLingot 6.8s ease-in-out calc(var(--i) * 0.1s) infinite; }
@keyframes tfxLingot {
  0%, 10% { transform: translateY(0) scaleY(1); filter: brightness(0.95); }
  18% { transform: translateY(0.1em) scaleY(0.82); }
  26% { transform: translateY(0) scaleY(1); filter: brightness(1.5) drop-shadow(0 0 3px rgba(255,243,196,0.9)); }
  36%, 84% { filter: brightness(1.2) drop-shadow(0 0 2px rgba(255,243,196,0.4)); }
  94%, 100% { filter: brightness(0.95); }
}
.tfx--coin .tfx-prop--1, .tfx--coin .tfx-prop--2 { top: -0.8em; font-size: 0.55em; opacity: 0; }
.tfx--coin .tfx-prop--1 { left: 24%; animation: tfxPiece 6.8s ease-in infinite; }
.tfx--coin .tfx-prop--2 { left: 64%; animation: tfxPiece 6.8s ease-in 0.35s infinite; }
.tfx--coin .tfx-prop--1::after, .tfx--coin .tfx-prop--2::after { content: "🪙"; }
@keyframes tfxPiece {
  0%, 4% { opacity: 0; transform: translateY(0) rotate(0); }
  8% { opacity: 1; }
  18% { opacity: 1; transform: translateY(0.95em) rotate(140deg); }
  22%, 100% { opacity: 0; transform: translateY(1em); }
}

/* stairs — Rothschild (75 000 rubis gagnés) : la courbe grimpe marche
   après marche, une étincelle escalade, sommet doré… puis LE KRACH */
.tfx--stairs .tfx-l { animation: tfxBull 8s ease-in-out calc(var(--i) * 0.05s) infinite; }
@keyframes tfxBull {
  0%, 8% { transform: translateY(0); color: inherit; }
  20% { transform: translateY(calc(var(--i) * -0.34px)); color: #86efac; }
  30%, 56% { transform: translateY(calc(var(--i) * -0.34px)); color: #86efac; text-shadow: 0 0 3px rgba(134,239,172,0.5); }
  60% { transform: translateY(calc(var(--i) * -0.34px)) scale(1.06); color: #fde68a; text-shadow: 0 0 6px rgba(253,230,138,0.9); }
  64% { transform: translateY(0.12em); color: #f87171; text-shadow: 0 0 4px rgba(248,113,113,0.8); }
  68% { transform: translateY(0); }
  74%, 92% { transform: translateY(0); color: #86efac; text-shadow: none; }
  100% { transform: translateY(0); color: inherit; }
}
.tfx--stairs .tfx-prop--1 { bottom: 20%; left: 4%; font-size: 0.5em; opacity: 0; animation: tfxGrimpe 8s ease-in-out infinite; }
.tfx--stairs .tfx-prop--1::after { content: "▲"; color: #4ade80; text-shadow: 0 0 3px rgba(74,222,128,0.9); }
@keyframes tfxGrimpe {
  0%, 8% { left: 2%; bottom: 12%; opacity: 0; }
  14% { opacity: 1; }
  56% { left: 88%; bottom: 68%; opacity: 1; }
  60% { left: 90%; bottom: 72%; opacity: 1; transform: scale(1.4); }
  64% { left: 92%; bottom: 10%; opacity: 1; transform: rotate(180deg); }
  70%, 100% { opacity: 0; }
}

/* rage — Acharné (40 quêtes hebdo) : le tampon VALIDÉ claque sur le
   titre encore et encore, les lettres encaissent chaque coup */
.tfx--rage .tfx-l { animation: tfxStamped 5.8s ease-in-out calc(var(--i) * 0.015s) infinite; }
@keyframes tfxStamped {
  0%, 16% { transform: scale(1); }
  19% { transform: scale(0.94, 0.86); filter: brightness(1.3); }
  24% { transform: scale(1); filter: brightness(1); }
  44% { transform: scale(1); }
  47% { transform: scale(0.94, 0.86); filter: brightness(1.3); }
  52% { transform: scale(1); filter: brightness(1); }
  72% { transform: scale(1); }
  75% { transform: scale(0.93, 0.84); filter: brightness(1.45); }
  80%, 100% { transform: scale(1); filter: brightness(1); }
}
.tfx--rage .tfx-prop--1 {
  top: -0.5em; left: 40%; font-size: 0.72em; font-weight: 900; color: #4ade80;
  border: 1.5px solid #4ade80; border-radius: 3px; padding: 0 0.12em;
  transform: scale(3) rotate(-14deg); opacity: 0;
  animation: tfxStamp 5.8s cubic-bezier(0.6, 0, 0.8, 0.3) infinite;
}
.tfx--rage .tfx-prop--1::after { content: "✓"; }
@keyframes tfxStamp {
  0%, 14% { transform: scale(3) rotate(-14deg); opacity: 0; }
  19% { transform: scale(1) rotate(-14deg); opacity: 1; }
  30% { opacity: 1; }
  36% { opacity: 0; }
  42% { transform: scale(3) rotate(10deg); opacity: 0; }
  47% { transform: scale(1) rotate(10deg); opacity: 1; }
  58% { opacity: 1; }
  64% { opacity: 0; }
  70% { transform: scale(3) rotate(-8deg); opacity: 0; }
  75% { transform: scale(1) rotate(-8deg); opacity: 1; }
  88% { opacity: 1; }
  94%, 100% { opacity: 0; }
}

/* march — Inarrêtable (10 quêtes mensuelles) : la troupe avance, un mur
   se dresse, elle le TRAVERSE — le mur vole en éclats */
.tfx--march .tfx-l { animation: tfxAvance 6.5s ease-in-out calc(var(--i) * 0.06s) infinite; }
@keyframes tfxAvance {
  0% { transform: translateX(-0.3em); opacity: 0.6; }
  10% { transform: translateX(0); opacity: 1; }
  20% { transform: translateX(0.06em) rotate(1.5deg); }
  30% { transform: translateX(0) rotate(0); }
  40% { transform: translateX(0.06em) rotate(1.5deg); }
  48% { transform: translateX(0.14em) rotate(0); filter: brightness(1.5); }
  56% { transform: translateX(0); filter: brightness(1.15); }
  90% { transform: translateX(0); opacity: 1; }
  97%, 100% { transform: translateX(-0.3em); opacity: 0.6; }
}
.tfx--march .tfx-prop--1 {
  top: 12%; right: 10%; width: 2.5px; height: 0.85em;
  background: linear-gradient(180deg, #94a3b8, #64748b);
  animation: tfxMur 6.5s ease-in-out infinite;
}
@keyframes tfxMur {
  0%, 10% { opacity: 0; transform: scaleY(0); }
  18%, 44% { opacity: 1; transform: scaleY(1) rotate(0); }
  50% { opacity: 1; transform: scaleY(1) rotate(20deg) translateX(0.1em); }
  56%, 100% { opacity: 0; transform: rotate(70deg) translate(0.3em, 0.2em); }
}

/* flag — One Piece : le drapeau ondule, le Jolly Roger apparaît dans la
   trame, un éclat de trésor doré traverse la toile */
.tfx--flag { background: linear-gradient(135deg, #1a0d0d, #331717); animation: none; }
.tfx--flag .tfx-l {
  background: linear-gradient(180deg, #fde68a, #f59e0b 60%, #b45309);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  animation: tfxFlagWave 2.6s ease-in-out calc(var(--i) * 0.14s) infinite;
}
@keyframes tfxFlagWave {
  0%, 100% { transform: translateY(0.09em) rotate(1.5deg); }
  50% { transform: translateY(-0.09em) rotate(-1.5deg); }
}
/* chapeau de paille de LUFFY dessiné en CSS, posé DANS le O (pseudo-
   éléments de la 1re lettre → il suit sa houle automatiquement) :
   calotte jaune paille à bande rouge + bord large */
.tfx--flag .tfx-l:first-child { position: relative; }
.tfx--flag .tfx-l:first-child::before {
  content: ""; position: absolute; z-index: 2;
  top: -0.3em; left: 50%; width: 0.46em; height: 0.3em; margin-left: -0.23em;
  background: linear-gradient(180deg, #fbbf24 0 58%, #dc2626 58% 86%, #f59e0b 86%);
  border-radius: 0.23em 0.23em 0.04em 0.04em;
}
.tfx--flag .tfx-l:first-child::after {
  content: ""; position: absolute; z-index: 2;
  top: -0.06em; left: 50%; width: 0.78em; height: 0.13em; margin-left: -0.39em;
  background: linear-gradient(180deg, #fbbf24, #d97706);
  border-radius: 999px;
  box-shadow: 0 1px 1px rgba(0, 0, 0, 0.35);
}

/* chatpop — Légende du chat (messages de légende) : l'indicateur "…"
   tape, les lettres partent comme des messages, double-check de lecture */
.tfx--chatpop { background: linear-gradient(135deg, #0e1626, #1a2a44); color: #93c5fd; animation: none; }
.tfx--chatpop .tfx-l { animation: tfxSend 7s cubic-bezier(0.34, 1.6, 0.64, 1) calc(0.9s + var(--i) * 0.09s) infinite; opacity: 0; }
@keyframes tfxSend {
  0% { transform: scale(0) translateY(0.2em); opacity: 0; }
  5% { transform: scale(1.18); opacity: 1; }
  8% { transform: scale(1); }
  80% { transform: scale(1); opacity: 1; }
  88%, 100% { transform: scale(1); opacity: 0; }
}
/* vraie bulle de pensée 💭 (retour Lucas) : il réfléchit à son message,
   la bulle gonfle en deux temps, puis pouf — le message part (pop des
   lettres) */
.tfx--chatpop .tfx-prop--1 { top: -0.68em; left: 24%; font-size: 0.85em; opacity: 0; animation: tfxPense 7s ease-in-out infinite; }
.tfx--chatpop .tfx-prop--1::after { content: "💭"; }
@keyframes tfxPense {
  0% { opacity: 0; transform: scale(0.3); }
  3% { opacity: 1; transform: scale(0.75); }
  6% { transform: scale(0.9); }
  9% { transform: scale(1.02); }
  12% { opacity: 1; transform: scale(1); }
  16%, 100% { opacity: 0; transform: scale(0.3); }
}
.tfx--chatpop .tfx-prop--2 { top: -0.5em; right: 5%; font-size: 0.6em; opacity: 0; animation: tfxSeen 7s ease-out infinite; }
.tfx--chatpop .tfx-prop--2::after { content: "✓✓"; color: #4ade80; font-weight: 900; }
@keyframes tfxSeen {
  0%, 42% { opacity: 0; transform: translateY(0.2em); }
  50%, 74% { opacity: 1; transform: translateY(0); }
  84%, 100% { opacity: 0; }
}

/* scan — Brother Eye : l'œil parcourt le titre, chaque lettre glitch
   sous le scan puis s'authentifie — verdict vert */
.tfx--scan { background: linear-gradient(135deg, #05161a, #09282e); color: #67e8f9; animation: none; }
.tfx--scan .tfx-l { animation: tfxIdent 7s linear calc(var(--i) * 0.11s) infinite; }
@keyframes tfxIdent {
  0%, 12% { text-shadow: none; transform: translate(0, 0); }
  16% { transform: translate(0.5px, -0.4px); text-shadow: 0 0 6px rgba(103,232,249,1); }
  18% { transform: translate(-0.5px, 0.4px); }
  20% { transform: translate(0, 0); text-shadow: 0 0 3px rgba(103,232,249,0.4); }
  58% { color: #67e8f9; }
  64%, 88% { color: #4ade80; text-shadow: 0 0 4px rgba(74,222,128,0.7); }
  94%, 100% { color: #67e8f9; text-shadow: none; }
}
.tfx--scan .tfx-prop--1 {
  top: 6%; bottom: 6%; left: 0; width: 2px;
  background: rgba(103,232,249,0.95); box-shadow: 0 0 6px rgba(103,232,249,0.9);
  animation: tfxScanLine 7s linear infinite;
}
@keyframes tfxScanLine {
  0%, 8% { left: 4%; opacity: 0; }
  12% { opacity: 1; }
  52% { left: 94%; opacity: 1; }
  58%, 100% { left: 96%; opacity: 0; }
}
.tfx--scan .tfx-prop--2 { top: -0.55em; left: 44%; font-size: 0.62em; opacity: 0; animation: tfxVerdict 7s ease-out infinite; }
.tfx--scan .tfx-prop--2::after { content: "◉"; color: #4ade80; text-shadow: 0 0 4px rgba(74,222,128,0.9); }
@keyframes tfxVerdict {
  0%, 56% { opacity: 0; transform: scale(0.4); }
  62%, 84% { opacity: 1; transform: scale(1); }
  92%, 100% { opacity: 0; }
}

/* flip — Éphéméride (bonus quotidiens) : chaque jour son feuillet — les
   lettres flippent comme un calendrier et une page arrachée s'envole */
.tfx--flip { background: linear-gradient(135deg, #191920, #2b2b36); color: #e2e8f0; animation: none; }
.tfx--flip .tfx-l { animation: tfxFlipDay 7s ease-in-out calc(var(--i) * 0.12s) infinite; backface-visibility: hidden; }
@keyframes tfxFlipDay {
  0%, 20% { transform: rotateX(0); color: #e2e8f0; }
  26% { transform: rotateX(-88deg); }
  32% { transform: rotateX(0); color: #fde68a; text-shadow: 0 0 3px rgba(253,230,138,0.5); }
  78% { color: #fde68a; }
  86%, 100% { transform: rotateX(0); color: #e2e8f0; text-shadow: none; }
}
.tfx--flip .tfx-prop--1 {
  top: 10%; left: 46%; width: 0.5em; height: 0.62em; border-radius: 1px;
  background: linear-gradient(180deg, #f8fafc, #cbd5e1); opacity: 0;
  animation: tfxPageOff 7s ease-in infinite;
}
@keyframes tfxPageOff {
  0%, 24% { opacity: 0; transform: translate(0, 0) rotate(0); }
  28% { opacity: 0.95; }
  46% { opacity: 0; transform: translate(1.6em, -1.1em) rotate(160deg); }
  100% { opacity: 0; }
}

/* overheat — Tryharder : ça chauffe du blanc au rouge, la vapeur monte,
   surchauffe totale puis grosse expiration et retour au calme */
.tfx--overheat .tfx-l { animation: tfxHeat 7s linear calc(var(--i) * 0.02s) infinite; }
@keyframes tfxHeat {
  0%, 12% { transform: translate(0, 0); color: inherit; text-shadow: none; }
  26% { color: #fdba74; transform: translate(0.25px, -0.2px); }
  40% { color: #fb923c; transform: translate(-0.4px, 0.3px); text-shadow: 0 0 3px rgba(251,146,60,0.5); }
  52% { color: #ef4444; transform: translate(0.55px, -0.45px); text-shadow: 0 0 6px rgba(239,68,68,0.9); }
  58% { color: #ef4444; transform: translate(-0.65px, 0.5px); text-shadow: 0 0 8px rgba(239,68,68,1); }
  62% { color: #fca5a5; transform: translate(0, 0) scale(1.08); }
  68%, 90% { color: #fdba74; transform: scale(1); text-shadow: 0 0 2px rgba(251,146,60,0.3); }
  100% { color: inherit; text-shadow: none; }
}
.tfx--overheat .tfx-prop--1, .tfx--overheat .tfx-prop--2 { top: -0.5em; font-size: 0.55em; opacity: 0; }
.tfx--overheat .tfx-prop--1 { left: 30%; animation: tfxVapeur 7s ease-out infinite; }
.tfx--overheat .tfx-prop--2 { left: 62%; animation: tfxVapeur 7s ease-out 0.5s infinite; }
.tfx--overheat .tfx-prop--1::after, .tfx--overheat .tfx-prop--2::after { content: "〰"; color: rgba(252,165,165,0.8); transform: rotate(90deg); display: inline-block; }
@keyframes tfxVapeur {
  0%, 40% { opacity: 0; transform: translateY(0.3em); }
  50% { opacity: 0.9; transform: translateY(-0.1em); }
  64%, 100% { opacity: 0; transform: translateY(-0.55em); }
}

/* aura — Légende (v2, retour Lucas) : le nom est gravé dans la pierre,
   puis se DORE lettre à lettre — l'or coule dans la gravure avec un
   éclat qui voyage, deux éclats scellent la légende, tout reste doré */
.tfx--aura { background: linear-gradient(135deg, #16130c, #262017); color: #6b6456; animation: none; }
.tfx--aura .tfx-l { animation: tfxDorure 8s ease-in-out calc(var(--i) * 0.18s) infinite; }
@keyframes tfxDorure {
  0%, 6% { color: #6b6456; text-shadow: none; transform: scale(1); }
  12% { color: #fff3c4; text-shadow: 0 0 7px rgba(255,243,196,1); transform: scale(1.16); }
  18% { color: #fbbf24; text-shadow: 0 0 4px rgba(251,191,36,0.6); transform: scale(1); }
  52% { color: #fbbf24; text-shadow: 0 0 4px rgba(251,191,36,0.6); }
  58% { color: #fde68a; text-shadow: 0 0 7px rgba(253,230,138,0.95); }
  64%, 88% { color: #fbbf24; text-shadow: 0 0 4px rgba(251,191,36,0.55); }
  96%, 100% { color: #6b6456; text-shadow: none; }
}
.tfx--aura .tfx-prop--1, .tfx--aura .tfx-prop--2 { font-size: 0.5em; opacity: 0; }
.tfx--aura .tfx-prop--1 { top: -0.35em; left: 4%; animation: tfxSceau 8s ease-in-out infinite; }
.tfx--aura .tfx-prop--2 { bottom: -0.3em; right: 4%; animation: tfxSceau 8s ease-in-out 0.3s infinite; }
.tfx--aura .tfx-prop--1::after, .tfx--aura .tfx-prop--2::after { content: "✦"; color: #fff3c4; text-shadow: 0 0 4px rgba(253,230,138,1); }
@keyframes tfxSceau {
  0%, 48% { opacity: 0; transform: scale(0.3) rotate(0); }
  56% { opacity: 1; transform: scale(1.2) rotate(180deg); }
  62%, 86% { opacity: 0.9; transform: scale(1) rotate(180deg); }
  94%, 100% { opacity: 0; transform: scale(0.3); }
}

/* ghost — Sans vie : la vie quitte les lettres une à une, l'âme s'envole,
   puis le nom hante — pâle et flottant */
.tfx--ghost { background: linear-gradient(135deg, #111118, #1c1c28); color: #cbd5e1; animation: none; }
.tfx--ghost .tfx-l { animation: tfxDepart 8s ease-in-out calc(var(--i) * 0.14s) infinite; }
@keyframes tfxDepart {
  0%, 8% { color: #cbd5e1; opacity: 1; transform: translateY(0) rotate(0); filter: none; }
  22% { color: #64748b; opacity: 0.5; transform: translateY(0.06em) rotate(3deg); filter: blur(0.3px); }
  34%, 44% { color: #475569; opacity: 0.35; transform: translateY(0.1em) rotate(4deg); }
  56% { color: #94a3b8; opacity: 0.7; transform: translateY(-0.06em) rotate(0); filter: blur(0); }
  66%, 88% { color: #94a3b8; opacity: 0.85; transform: translateY(-0.03em); text-shadow: 0 0 6px rgba(148,163,184,0.5); }
  100% { color: #cbd5e1; opacity: 1; transform: translateY(0); text-shadow: none; }
}
.tfx--ghost .tfx-prop--1 { top: 10%; left: 46%; font-size: 0.6em; opacity: 0; animation: tfxAme 8s ease-out infinite; }
.tfx--ghost .tfx-prop--1::after { content: "👻"; opacity: 0.85; }
@keyframes tfxAme {
  0%, 26% { opacity: 0; transform: translateY(0) scale(0.5); }
  34% { opacity: 0.9; transform: translateY(-0.5em) scale(1); }
  48% { opacity: 0.5; transform: translateY(-1em) translateX(0.3em) scale(1.05); }
  58%, 100% { opacity: 0; transform: translateY(-1.4em) translateX(0.5em); }
}

/* moula — BigMoula : les billets pleuvent, les lettres comptent la
   liasse (tick de compteur), reflet dollar sur le magot */
.tfx--moula { background: linear-gradient(135deg, #05240f, #0d4020); animation: none; }
.tfx--moula .tfx-l {
  background: linear-gradient(180deg, #bbf7d0, #22c55e 60%, #15803d);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  animation: tfxCompte 6.5s ease-in-out calc(var(--i) * 0.08s) infinite;
}
@keyframes tfxCompte {
  0%, 12% { transform: rotateX(0); filter: brightness(1); }
  18% { transform: rotateX(-70deg); }
  24% { transform: rotateX(0); filter: brightness(1.4); }
  30%, 60% { filter: brightness(1.1); }
  66% { filter: brightness(1.8) drop-shadow(0 0 3px rgba(220,252,231,0.9)); }
  74%, 100% { filter: brightness(1.05); transform: rotateX(0); }
}
.tfx--moula .tfx-prop--1, .tfx--moula .tfx-prop--2 { top: -0.75em; font-size: 0.5em; opacity: 0; }
.tfx--moula .tfx-prop--1 { left: 20%; animation: tfxBillet 6.5s ease-in infinite; }
.tfx--moula .tfx-prop--2 { left: 62%; animation: tfxBillet 6.5s ease-in 0.4s infinite; }
.tfx--moula .tfx-prop--1::after, .tfx--moula .tfx-prop--2::after { content: "💵"; }
@keyframes tfxBillet {
  0%, 4% { opacity: 0; transform: translateY(0) rotate(-15deg); }
  10% { opacity: 1; }
  22% { opacity: 1; transform: translateY(0.9em) rotate(20deg); }
  28%, 100% { opacity: 0; transform: translateY(1em); }
}

/* ══ MYTHIQUES — scènes complètes ══ */

/* king — LunaKing : la nuit tombe, la lune se lève en arc et COURONNE le
   nom — chaque lettre sacrée d'or à son passage, aurore + éclat royal,
   puis la lune se couche et le cycle recommence */
.tfx--king {
  background: linear-gradient(115deg, #150f35, #3b1876 30%, #150f35 55%, #5a3609 80%, #150f35);
  background-size: 300% 100%;
  border-color: rgba(253, 230, 138, 0.4);
  animation: tfxKingAurora 9s linear infinite;
}
@keyframes tfxKingAurora { to { background-position: 300% 0; } }
.tfx--king .tfx-l { animation: tfxSacre 9s ease-in-out calc(var(--i) * 0.16s) infinite; }
@keyframes tfxSacre {
  0%, 6% { color: #64748b; text-shadow: none; transform: translateY(0); }
  16% { color: #f8fafc; text-shadow: 0 0 6px rgba(226,232,240,0.9); transform: translateY(-0.1em); }
  26% { color: #fde68a; text-shadow: 0 0 8px rgba(253,230,138,1); transform: translateY(0); }
  36%, 76% { color: #fbbf24; text-shadow: 0 0 4px rgba(251,191,36,0.6); }
  90%, 100% { color: #64748b; text-shadow: none; }
}
.tfx--king .tfx-prop--1 { top: -1.05em; left: -0.4em; font-size: 0.8em; animation: tfxLuneRoyale 9s ease-in-out infinite; }
.tfx--king .tfx-prop--1::after { content: "🌕"; filter: drop-shadow(0 0 4px rgba(253,230,138,0.8)); }
@keyframes tfxLuneRoyale {
  0% { transform: translate(0, 1em) scale(0.7); opacity: 0; }
  10% { transform: translate(12%, 0.2em) scale(1); opacity: 1; }
  38% { transform: translate(3.4em, -0.3em) scale(1.06); }
  70% { transform: translate(6.4em, 0.2em) scale(1); opacity: 1; }
  84%, 100% { transform: translate(7.4em, 1em) scale(0.7); opacity: 0; }
}
.tfx--king .tfx-prop--2 {
  inset: 0; border-radius: inherit;
  background: linear-gradient(115deg, transparent 38%, rgba(255,255,255,0.4) 50%, transparent 62%);
  transform: translateX(-110%);
  animation: tfxRoyalSheen 9s ease-in-out infinite;
}
@keyframes tfxRoyalSheen { 0%, 40% { transform: translateX(-110%); } 56%, 100% { transform: translateX(110%); } }

/* allin — All-in Man (v2, retour Lucas) : il mise TOUT — la liasse de
   billets posée en bout de titre PREND FEU, la chaleur gagne les lettres
   qui s'embrasent en or, flambée totale, puis les cendres retombent */
.tfx--allin { background: linear-gradient(135deg, #113c22, #052e16); color: #bbf7d0; animation: none; }
.tfx--allin .tfx-l { animation: tfxFlambe 8s ease-in-out calc(var(--i) * 0.09s) infinite; }
@keyframes tfxFlambe {
  0%, 18% { color: #bbf7d0; text-shadow: none; transform: translateY(0); }
  32% { color: #fde047; text-shadow: 0 0 4px rgba(253,224,71,0.5); }
  44% { color: #fb923c; text-shadow: 0 0 7px rgba(251,146,60,0.9); transform: translateY(-0.06em); }
  52% { color: #fde68a; text-shadow: 0 0 9px rgba(253,230,138,1); transform: translateY(-0.03em) scale(1.1); }
  58% { transform: scale(1); }
  64%, 86% { color: #fbbf24; text-shadow: 0 0 4px rgba(251,191,36,0.5); }
  96%, 100% { color: #bbf7d0; text-shadow: none; }
}
/* (billet et flamme retirés sur retour Lucas — l'embrasement des lettres seul) */
`;

function ensureCss() {
  if (typeof document === "undefined") return;
  const existing = document.getElementById(STYLE_ID);
  if (existing) {
    // HMR/déploiement : met à jour le contenu si le CSS a changé — sinon
    // l'ancien style reste appliqué et les nouveaux rendus semblent inertes.
    if (existing.textContent !== CSS) existing.textContent = CSS;
    return;
  }
  const tag = document.createElement("style");
  tag.id = STYLE_ID;
  tag.textContent = CSS;
  document.head.appendChild(tag);
}

const SOURCE_ICON: Record<ChatTitleEntry["source"], string> = {
  achievement: "🏆",
  level: "⭐",
};

// Titres d'EVENT à rendu spécial (specs Lucas) — matchés par code.
// NB : styles "blood" (sang+slash) et "cut" (lame qui coupe) INVERSÉS par
// rapport à la v1 sur retour Lucas : le Bourreau (#1, rare) prend le sang,
// Boss Slayer (masse) prend la coupe.
type EventTitleKind = "spin" | "baron" | "blood" | "cut";
function eventTitleKind(code: string | undefined): { kind: EventTitleKind; label: string } | null {
  const c = String(code || "");
  if (c === "title_wheel_king") return { kind: "spin", label: "Roi du Spin" };
  if (c === "title_chest_baron") return { kind: "baron", label: "Baron du Coffre" };
  if (c.startsWith("boss_slayer")) return { kind: "cut", label: "Boss Slayer" };
  if (c === "title_boss_bourreau") return { kind: "blood", label: "Bourreau" };
  return null;
}

function EventTitlePill({ kind, label, size }: { kind: EventTitleKind; label: string; size: "sm" | "md" }) {
  const mdStyle = size === "md" ? { fontSize: "0.82em", padding: "1px 8px" } : undefined;
  if (kind === "spin") {
    // machine à sous : chaque lettre est un rouleau qui défile puis se pose
    return (
      <span className="tp tp-ev-spin" style={mdStyle} title={`Succès · ${label}`}>
        <span className="tp-icon" aria-hidden>👑</span>
        <span className="tp-label">
          {label.split("").map((ch, i) => (
            <span key={i} className="tp-slot-cell">
              <span className="tp-slot-glyph" style={{ animationDelay: `${i * 0.15}s` }}>
                {ch === " " ? " " : ch}
              </span>
            </span>
          ))}
        </span>
      </span>
    );
  }
  if (kind === "baron") {
    // tirelire EN FIN de titre (retour Lucas)
    return (
      <span className="tp tp-ev-baron" style={mdStyle} title={`Succès · ${label}`}>
        <span className="tp-label">{label}</span>
        <span className="tp-baron-scene" aria-hidden>
          <span className="tp-baron-pig">🐷</span>
          <i className="tp-baron-coin">🪙</i>
          <i className="tp-baron-burst" />
          <i className="tp-baron-jet tp-baron-jet--1">🪙</i>
          <i className="tp-baron-jet tp-baron-jet--2">🪙</i>
          <i className="tp-baron-jet tp-baron-jet--3">🪙</i>
        </span>
      </span>
    );
  }
  if (kind === "blood") {
    // BOURREAU : la lame s'abat, le titre se fend en deux (split horizontal)
    // + gouttes de sang — le skin le plus rare cumule les deux effets
    return (
      <span className="tp tp-ev-bourreau" style={mdStyle} title={`Succès · ${label}`}>
        <span className="tp-icon" aria-hidden>🪓</span>
        <span className="tp-bourreau-wrap">
          <span className="tp-bourreau-half tp-bourreau-half--top" aria-hidden>{label}</span>
          <span className="tp-bourreau-half tp-bourreau-half--bottom">{label}</span>
        </span>
        <i className="tp-slash" aria-hidden />
        <i className="tp-drip tp-drip--1" aria-hidden />
        <i className="tp-drip tp-drip--2" aria-hidden />
      </span>
    );
  }
  // BOSS SLAYER : une lame VERTICALE tombe entre les deux mots, qui
  // s'écartent à gauche/droite puis se ressoudent
  return (
    <span className="tp tp-ev-slayer" style={mdStyle} title={`Succès · ${label}`}>
      <span className="tp-icon" aria-hidden>⚔️</span>
      <span className="tp-cutv-wrap">
        <span className="tp-cutv-half tp-cutv-half--left" aria-hidden>{label}</span>
        <span className="tp-cutv-half tp-cutv-half--right">{label}</span>
        <i className="tp-guillotine" aria-hidden />
      </span>
    </span>
  );
}

// ── TITLE FX : mapping code → effet lettre par lettre ──────────────
// Légendaires/mythiques : effet UNIQUE ; épiques : 4 familles par thème.
const TITLE_FX: Record<string, string> = {
  // Mythiques
  title_lunaking: "king",
  title_allin_man: "allin",
  // Légendaires
  title_sous_la_lune: "moon",
  title_pretre_de_la_roue: "roue",
  title_archiviste: "scribe",
  title_pilier: "pillar",
  title_parfait: "sparkle",
  title_polyvalent: "huecycle",
  title_collection_par_categorie: "puzzle",
  title_ultime: "trophy",
  title_predateur: "stalk",
  title_trader: "ticker",
  title_max_frappe: "shock",
  title_oracle: "mystic",
  title_nessie: "aqua",
  title_croupier_slayer: "deal",
  title_baron: "coin",
  title_rothschild: "stairs",
  title_acharne: "rage",
  title_inarretable: "march",
  title_one_piece: "flag",
  title_legende_du_chat: "chatpop",
  title_brother_eye: "scan",
  title_ephemeride: "flip",
  title_tryharder: "overheat",
  title_legende: "aura",
  title_sans_vie: "ghost",
  title_bigmoula: "moula",
  // Épiques — famille or (casino / économie)
  title_roulette: "e-gold", title_tour_complet: "e-gold", title_grosse_frappe: "e-gold",
  title_triplette: "e-gold", title_203: "e-gold", title_big_blind: "e-gold",
  title_banquier: "e-gold", title_flambeur: "e-gold", title_rentier: "e-gold",
  title_tracker: "e-gold", title_shark: "e-gold", title_instinct: "e-gold",
  title_slotteur: "e-gold", title_chasseur: "e-gold", title_beyblade: "e-gold",
  title_coffre_fort: "e-gold", title_mecene: "e-gold", title_pilleur: "e-gold",
  title_devin: "e-gold",
  // Épiques — famille pulse (fidélité / watch)
  title_marathon: "e-pulse", title_early_bird: "e-pulse", title_toujours_la: "e-pulse",
  title_fidele: "e-pulse", title_routine: "e-pulse", title_studieux: "e-pulse",
  title_accro: "e-pulse", title_rituel_lunalive: "e-pulse", title_cercle_fidele: "e-pulse",
  title_super_follow: "e-pulse", title_connu: "e-pulse", title_pro: "e-pulse",
  title_no_life: "e-pulse",
  // Épiques — famille pop (chat / social)
  title_grande_discussion: "e-pop", title_explorateur: "e-pop",
  title_maitre_du_bot: "e-pop", title_vitrine_complete: "e-pop",
  // Épique — unique
  title_batman: "e-bat",
};

// Nombre d'accessoires de scène (spans .tfx-prop--N) par effet
const FX_PROP_COUNT: Record<string, number> = {
  moon: 0, roue: 1, scribe: 0, pillar: 1, sparkle: 1, huecycle: 0, puzzle: 0,
  trophy: 1, stalk: 2, ticker: 2, shock: 1, mystic: 2, aqua: 2, deal: 1,
  coin: 2, stairs: 1, rage: 1, march: 1, flag: 0, chatpop: 2, scan: 2,
  flip: 1, overheat: 2, aura: 2, ghost: 1, moula: 2, king: 2, allin: 0,
  "e-bat": 1,
};

// Pill à effet lettre par lettre : chaque graphème devient un span .tfx-l
// avec son index dans --i (les keyframes staggerent via animation-delay),
// plus les accessoires de scène (lune, bille, curseur, jetons…)
function FxTitlePill({ fx, entry, size }: { fx: string; entry: ChatTitleEntry; size: "sm" | "md" }) {
  const label = String(entry.label || "");
  const cls = `tp tp-rarity-${entry.rarity} tfx tfx--${fx}`;
  const props = FX_PROP_COUNT[fx] || 0;
  return (
    <span
      className={cls}
      style={size === "md" ? { fontSize: "0.82em", padding: "1px 8px" } : undefined}
      title={`${entry.source === "achievement" ? "Succès" : "Niveau"} · ${entry.label}`}
    >
      <span className="tp-icon" aria-hidden>{SOURCE_ICON[entry.source]}</span>
      <span className="tp-label" aria-label={label}>
        {Array.from(label).map((ch, i) => (
          <span key={i} className="tfx-l" aria-hidden style={{ ["--i" as string]: i }}>
            {ch === " " ? " " : ch}
          </span>
        ))}
      </span>
      {Array.from({ length: props }, (_, n) => (
        <i key={n} className={`tfx-prop tfx-prop--${n + 1}`} aria-hidden />
      ))}
    </span>
  );
}

type Props = {
  entry: ChatTitleEntry;
  size?: "sm" | "md";
};

export function TitlePill({ entry, size = "sm" }: Props) {
  React.useEffect(() => { ensureCss(); }, []);
  const ev = eventTitleKind((entry as any)?.code);
  if (ev) return <EventTitlePill kind={ev.kind} label={ev.label} size={size} />;
  const fx = TITLE_FX[String((entry as any)?.code || "")];
  if (fx) return <FxTitlePill fx={fx} entry={entry} size={size} />;
  const cls = `tp tp-rarity-${entry.rarity} tp-source-${entry.source}`;
  return (
    <span
      className={cls}
      style={size === "md" ? { fontSize: "0.82em", padding: "1px 8px" } : undefined}
      title={`${entry.source === "achievement" ? "Succès" : "Niveau"} · ${entry.label}`}
    >
      <span className="tp-icon" aria-hidden>{SOURCE_ICON[entry.source]}</span>
      <span className="tp-label">{entry.label}</span>
    </span>
  );
}

/**
 * Bloc qui rend les 3 slots si présents, dans le layout proposé:
 *   Row 1 (à côté du pseudo, géré par le parent): juste le shop pill
 *   Row 2 (sous le pseudo): achievement pill - level pill
 *
 * Cet utilitaire retourne juste les 2 pills row 2 séparés par un `-`.
 */
type Titles = {
  achievement?: ChatTitleEntry | null;
  level?: ChatTitleEntry | null;
};

export function TitleSecondLine({ titles }: { titles: Titles | null | undefined }) {
  if (!titles) return null;
  const { achievement, level } = titles;
  if (!achievement && !level) return null;
  return (
    <div
      style={{
        marginTop: 1,
        display: "flex",
        alignItems: "center",
        gap: 3,
        // pas de wrap : on tient sur 1 ligne avec ellipsis si trop long
        flexWrap: "nowrap",
        overflow: "hidden",
        lineHeight: 1.2,
        minWidth: 0,
      }}
    >
      {achievement ? <TitlePill entry={achievement} /> : null}
      {achievement && level ? (
        <span style={{ opacity: 0.4, fontSize: "0.65em", flexShrink: 0 }}>·</span>
      ) : null}
      {level ? <TitlePill entry={level} /> : null}
    </div>
  );
}
