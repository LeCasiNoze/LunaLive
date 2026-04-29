// web/src/components/LevelUpToast.tsx
//
// Toast plein-écran "LEVEL UP!" déclenché après une action qui fait passer
// un palier. Écoute l'event window 'lunalive:level_up' avec detail.{newLevel}.

import * as React from "react";
import { createPortal } from "react-dom";

const STYLE_ID = "lut-styles-v1";
const CSS = `
@keyframes lut-fade-in {
  from { opacity: 0; transform: translateY(-20px) scale(0.95); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes lut-fade-out {
  from { opacity: 1; transform: translateY(0) scale(1); }
  to   { opacity: 0; transform: translateY(-20px) scale(0.95); }
}
@keyframes lut-shimmer {
  0%   { background-position: 0% 50%; }
  100% { background-position: 200% 50%; }
}
@keyframes lut-pulse {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.04); }
}
.lut-overlay {
  position: fixed;
  top: 80px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 5000;
  pointer-events: none;
}
.lut-card {
  background: linear-gradient(135deg, rgba(124,92,252,0.95), rgba(34,211,238,0.85));
  background-size: 200% 100%;
  animation: lut-shimmer 3s linear infinite, lut-fade-in 280ms cubic-bezier(.22,1,.36,1);
  padding: 18px 28px;
  border-radius: 16px;
  border: 2px solid rgba(255,255,255,0.3);
  box-shadow: 0 18px 60px rgba(124,92,252,0.55), 0 0 0 1px rgba(167,139,250,0.4) inset;
  display: flex;
  align-items: center;
  gap: 14px;
  color: #fff;
  pointer-events: auto;
  min-width: 280px;
}
.lut-card.is-leaving { animation: lut-fade-out 280ms ease forwards; }
.lut-emoji { font-size: 36px; animation: lut-pulse 1.4s ease-in-out infinite; }
.lut-text { display: flex; flex-direction: column; }
.lut-title {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.85);
}
.lut-level {
  font-size: 22px;
  font-weight: 900;
  letter-spacing: -0.02em;
  text-shadow: 0 2px 12px rgba(0,0,0,0.35);
}
.lut-sub { font-size: 12px; color: rgba(255,255,255,0.85); margin-top: 1px; }
`;

function ensureCss() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const tag = document.createElement("style");
  tag.id = STYLE_ID;
  tag.textContent = CSS;
  document.head.appendChild(tag);
}

type LevelUpEvent = { newLevel: number };

export function fireLevelUpToast(detail: LevelUpEvent) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<LevelUpEvent>("lunalive:level_up", { detail }));
}

export function LevelUpToast() {
  const [active, setActive] = React.useState<LevelUpEvent | null>(null);
  const [leaving, setLeaving] = React.useState(false);

  React.useEffect(() => {
    ensureCss();
    const onEvt = (e: Event) => {
      const ce = e as CustomEvent<LevelUpEvent>;
      const lvl = Number(ce.detail?.newLevel);
      if (!Number.isFinite(lvl) || lvl <= 0) return;
      setLeaving(false);
      setActive({ newLevel: lvl });
      const t1 = window.setTimeout(() => setLeaving(true), 4500);
      const t2 = window.setTimeout(() => {
        setActive(null);
        setLeaving(false);
      }, 4900);
      return () => {
        window.clearTimeout(t1);
        window.clearTimeout(t2);
      };
    };
    window.addEventListener("lunalive:level_up", onEvt as any);
    return () => window.removeEventListener("lunalive:level_up", onEvt as any);
  }, []);

  if (!active || typeof document === "undefined") return null;

  return createPortal(
    <div className="lut-overlay" role="status" aria-live="polite">
      <div className={`lut-card${leaving ? " is-leaving" : ""}`}>
        <span className="lut-emoji" aria-hidden>⭐</span>
        <div className="lut-text">
          <span className="lut-title">Level Up !</span>
          <span className="lut-level">Niveau {active.newLevel}</span>
          <span className="lut-sub">De nouveaux perks débloqués</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
