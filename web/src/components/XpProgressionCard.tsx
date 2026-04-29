// web/src/components/XpProgressionCard.tsx
//
// Carte "Progression" pour la page profil (et autres). Niveau + barre XP large,
// liste des perks débloqués + à venir.

import * as React from "react";
import { getMyXp, type XpInfo, type XpPerk } from "../lib/api_quests";

const STYLE_ID = "xpc-styles-v1";
const CSS = `
@keyframes xpc-shimmer {
  0%   { background-position: 0% 50%; }
  100% { background-position: 200% 50%; }
}
.xpc-card {
  border-radius: 18px;
  border: 1px solid rgba(124,92,252,0.18);
  background:
    radial-gradient(ellipse 60% 50% at 0% 0%, rgba(124,92,252,0.10), transparent 60%),
    radial-gradient(ellipse 60% 50% at 100% 100%, rgba(34,211,238,0.08), transparent 55%),
    rgba(13,11,24,0.85);
  padding: 22px;
  color: #dde8ff;
  position: relative;
  overflow: hidden;
}
.xpc-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.xpc-titlewrap { display: flex; flex-direction: column; }
.xpc-tier {
  font-size: 11px; font-weight: 800; letter-spacing: 0.10em;
  text-transform: uppercase; color: rgba(167,139,250,0.85);
  margin-bottom: 4px;
}
.xpc-title {
  font-size: 26px; font-weight: 900; letter-spacing: -0.025em; line-height: 1.05;
  background: linear-gradient(135deg,#a78bfa 0%,#22d3ee 100%);
  background-size: 200% 100%;
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: xpc-shimmer 5s linear infinite;
}
.xpc-lvl {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 12px; border-radius: 999px;
  background: linear-gradient(135deg,#6366f1,#8b5cf6);
  color: #fff; font-weight: 800; font-size: 13px;
  box-shadow: 0 4px 14px rgba(124,92,252,0.4);
}
.xpc-bar-wrap { margin-bottom: 6px; }
.xpc-bar {
  height: 12px; border-radius: 6px;
  background: rgba(255,255,255,0.07);
  overflow: hidden;
  position: relative;
}
.xpc-bar-fill {
  height: 100%;
  background: linear-gradient(90deg,#a78bfa,#22d3ee,#a78bfa);
  background-size: 200% 100%;
  animation: xpc-shimmer 4s linear infinite;
  border-radius: 6px;
  transition: width 480ms cubic-bezier(.22,1,.36,1);
}
.xpc-bar-fill-max { background: linear-gradient(90deg,#fbbf24,#f59e0b,#fbbf24); background-size: 200% 100%; }
.xpc-bar-meta {
  display: flex; justify-content: space-between;
  font-size: 11.5px; color: rgba(220,220,255,0.6);
  margin-top: 6px;
}
.xpc-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-top: 18px;
}
.xpc-col {
  border-radius: 12px;
  border: 1px solid rgba(124,92,252,0.10);
  background: rgba(255,255,255,0.025);
  padding: 12px 14px;
}
.xpc-col-title {
  font-size: 11px; font-weight: 800; letter-spacing: 0.08em;
  text-transform: uppercase; color: rgba(167,139,250,0.85);
  margin-bottom: 8px;
}
.xpc-perk {
  font-size: 12.5px; line-height: 1.4;
  padding: 6px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  color: #dde8ff;
}
.xpc-perk:last-child { border-bottom: none; }
.xpc-perk-lvl {
  display: inline-block;
  font-size: 10.5px; font-weight: 800;
  padding: 2px 6px; border-radius: 5px;
  background: rgba(124,92,252,0.18);
  color: #c4b5fd;
  margin-right: 6px;
}
.xpc-perk-locked .xpc-perk-lvl {
  background: rgba(255,255,255,0.05);
  color: rgba(220,220,255,0.5);
}
.xpc-perk-locked { color: rgba(220,220,255,0.5); }
.xpc-empty { color: rgba(220,220,255,0.5); font-size: 12px; padding: 6px 0; }
@media (max-width: 720px) { .xpc-grid { grid-template-columns: 1fr; } }
`;

function ensureCss() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const tag = document.createElement("style");
  tag.id = STYLE_ID;
  tag.textContent = CSS;
  document.head.appendChild(tag);
}

function fmtPerk(p: XpPerk): string {
  if (p.kind === "shop_grade") return `Shop grade ${p.grade}`;
  if (p.kind === "title_auto") return p.label;
  return p.label;
}

export function XpProgressionCard() {
  const [info, setInfo] = React.useState<XpInfo | null>(null);

  React.useEffect(() => {
    ensureCss();
    let cancelled = false;
    (async () => {
      try {
        const r = await getMyXp();
        if (!cancelled) setInfo(r);
      } catch {
        // pas connecté ou pas dispo
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!info) return null;

  const unlockedTop = info.unlockedPerks.slice(-6).reverse();

  return (
    <div className="xpc-card">
      <div className="xpc-head">
        <div className="xpc-titlewrap">
          <div className="xpc-tier">Palier {info.tier + 1} / 10</div>
          <div className="xpc-title">{info.fullTitle}</div>
        </div>
        <div className="xpc-lvl">⭐ Niveau {info.level} / {info.maxLevel}</div>
      </div>

      <div className="xpc-bar-wrap">
        <div className="xpc-bar">
          <div
            className={`xpc-bar-fill${info.isMax ? " xpc-bar-fill-max" : ""}`}
            style={{ width: `${info.pctToNext}%` }}
          />
        </div>
        <div className="xpc-bar-meta">
          <span>
            {info.xpProgress.toLocaleString("fr-FR")} / {info.xpForNextLevel.toLocaleString("fr-FR")} XP
          </span>
          <span>
            {info.isMax
              ? "Niveau max atteint ⭐"
              : `Plus que ${info.xpToNext.toLocaleString("fr-FR")} XP`}
          </span>
        </div>
      </div>

      <div className="xpc-grid">
        <div className="xpc-col">
          <div className="xpc-col-title">✓ Débloqué (récents)</div>
          {unlockedTop.length === 0 ? (
            <div className="xpc-empty">Continue à monter de niveau pour débloquer des perks.</div>
          ) : (
            unlockedTop.map((p, i) => (
              <div key={i} className="xpc-perk">
                {fmtPerk(p)}
              </div>
            ))
          )}
        </div>
        <div className="xpc-col">
          <div className="xpc-col-title">🎯 À venir</div>
          {info.upcomingPerks.length === 0 ? (
            <div className="xpc-empty">Tous les perks sont débloqués.</div>
          ) : (
            info.upcomingPerks.map((up) =>
              up.perks.map((p, i) => (
                <div key={`${up.level}-${i}`} className="xpc-perk xpc-perk-locked">
                  <span className="xpc-perk-lvl">Lv {up.level}</span>
                  {fmtPerk(p)}
                </div>
              ))
            )
          )}
        </div>
      </div>
    </div>
  );
}
