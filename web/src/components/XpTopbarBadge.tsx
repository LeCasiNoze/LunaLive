// web/src/components/XpTopbarBadge.tsx
//
// Badge XP compact pour la topbar desktop. Affiche level + barre de progression
// vers le prochain level. Tooltip détaillé au hover. Click → modal détails.

import * as React from "react";
import { getMyXp, type XpInfo } from "../lib/api_quests";

const STYLE_ID = "xpb-styles-v1";
const CSS = `
@keyframes xpb-shimmer {
  0%   { background-position: 0% 50%; }
  100% { background-position: 200% 50%; }
}
.xpb {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid rgba(124,92,252,0.32);
  background: rgba(124,92,252,0.08);
  color: #dde8ff;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background 160ms ease, border-color 160ms ease, transform 140ms ease;
  position: relative;
  user-select: none;
}
.xpb:hover {
  background: rgba(124,92,252,0.16);
  border-color: rgba(124,92,252,0.5);
  transform: translateY(-1px);
}
.xpb-lvl {
  font-size: 11.5px;
  font-weight: 800;
  background: linear-gradient(135deg,#a78bfa,#22d3ee);
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: 0.02em;
}
.xpb-bar {
  width: 80px;
  height: 5px;
  border-radius: 3px;
  background: rgba(255,255,255,0.07);
  overflow: hidden;
  position: relative;
}
.xpb-bar-fill {
  height: 100%;
  background: linear-gradient(90deg,#a78bfa,#22d3ee,#a78bfa);
  background-size: 200% 100%;
  animation: xpb-shimmer 4s linear infinite;
  border-radius: 3px;
  transition: width 350ms ease;
}
.xpb-bar-fill-max {
  background: linear-gradient(90deg,#fbbf24,#f59e0b,#fbbf24);
  background-size: 200% 100%;
}
.xpb-tip {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  background: rgba(13,11,24,0.96);
  border: 1px solid rgba(124,92,252,0.3);
  border-radius: 12px;
  padding: 12px 14px;
  font-size: 12px;
  font-weight: 500;
  color: #dde8ff;
  white-space: nowrap;
  box-shadow: 0 12px 32px rgba(0,0,0,.5);
  z-index: 1000;
  pointer-events: none;
  opacity: 0;
  transform: translateY(-4px);
  transition: opacity 160ms ease, transform 160ms ease;
}
.xpb:hover .xpb-tip { opacity: 1; transform: translateY(0); }
.xpb-tip-title {
  font-size: 13px;
  font-weight: 800;
  background: linear-gradient(135deg,#a78bfa,#22d3ee);
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent;
  margin-bottom: 4px;
}
.xpb-tip-row { color: rgba(220,220,255,0.7); margin-top: 2px; }
.xpb-tip-strong { color: #fff; font-weight: 700; }
`;

function ensureCss() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const tag = document.createElement("style");
  tag.id = STYLE_ID;
  tag.textContent = CSS;
  document.head.appendChild(tag);
}

type Props = {
  onClick?: () => void;
};

export function XpTopbarBadge({ onClick }: Props) {
  const [info, setInfo] = React.useState<XpInfo | null>(null);

  React.useEffect(() => {
    ensureCss();
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const r = await getMyXp();
        if (!cancelled) setInfo(r);
      } catch {
        // silent (pas connecté ou pas encore deployé)
      }
    };
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!info) return null;

  return (
    <button
      type="button"
      className="xpb"
      onClick={onClick}
      title={`${info.fullTitle} — ${info.xp.toLocaleString("fr-FR")} XP`}
      aria-label={`Niveau ${info.level} (${info.fullTitle})`}
    >
      <span className="xpb-lvl">Lv {info.level}</span>
      <span className="xpb-bar" aria-hidden>
        <span
          className={`xpb-bar-fill${info.isMax ? " xpb-bar-fill-max" : ""}`}
          style={{ width: `${info.pctToNext}%` }}
        />
      </span>
      <span className="xpb-tip" role="tooltip">
        <div className="xpb-tip-title">{info.fullTitle}</div>
        <div className="xpb-tip-row">
          XP : <span className="xpb-tip-strong">{info.xp.toLocaleString("fr-FR")}</span>
        </div>
        {info.isMax ? (
          <div className="xpb-tip-row">
            <span className="xpb-tip-strong">⭐ Niveau MAX</span>
          </div>
        ) : (
          <>
            <div className="xpb-tip-row">
              Progression : <span className="xpb-tip-strong">{info.pctToNext}%</span>
            </div>
            <div className="xpb-tip-row">
              Prochain niveau dans{" "}
              <span className="xpb-tip-strong">{info.xpToNext.toLocaleString("fr-FR")} XP</span>
            </div>
          </>
        )}
      </span>
    </button>
  );
}
