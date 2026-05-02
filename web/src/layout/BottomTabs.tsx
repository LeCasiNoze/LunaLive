// web/src/layout/BottomTabs.tsx
// ─────────────────────────────────────────────────────────────────────────────
//  LunaLive — BottomTabs mobile (single bar, 5 onglets)
//  Design : Purple Velvet × Blue Night
//  Comportement : icône seule en inactif, icône + label en actif (gain de place).
//  Toutes les actions sont des routes — plus de popup. Le contenu des onglets
//  Lives / Clips / Bonus / Menu vit dans la home page (?tab=...).
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";
import { Link, useLocation } from "react-router-dom";

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@500;700;800&display=swap');

.bt-root {
  --bt-text-2: rgba(180,185,230,.70);
  --bt-safe:   env(safe-area-inset-bottom, 0px);
  --bt-ease:   cubic-bezier(.22,1,.36,1);
}

.bt-bar {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 80;
  padding: 6px 6px calc(6px + var(--bt-safe));
  background: rgba(8,7,18,.90);
  border-top: 1px solid rgba(124,92,252,.16);
  backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
  display: flex; gap: 4px; align-items: stretch;
}
.bt-bar::before {
  content:""; position:absolute; top:0; left:5%; right:5%; height:1px;
  background: linear-gradient(90deg,transparent,rgba(167,139,250,.35) 38%,rgba(91,142,248,.26) 64%,transparent);
  pointer-events:none;
}

.bt-spacer { height: calc(64px + var(--bt-safe)); }

.bt-tab {
  position: relative;
  display: inline-flex; align-items: center; justify-content: center;
  gap: 6px;
  padding: 8px 12px; border-radius: 14px;
  border: 1px solid transparent; background: transparent;
  color: var(--bt-text-2); text-decoration: none; min-height: 48px;
  font-family: 'Syne', system-ui, sans-serif;
  font-size: 12px; font-weight: 800; letter-spacing: -.05px;
  transition:
    color 180ms ease,
    background 180ms ease,
    border-color 180ms ease,
    flex-grow 320ms var(--bt-ease),
    flex-basis 320ms var(--bt-ease),
    padding 280ms var(--bt-ease),
    transform 130ms var(--bt-ease);
  -webkit-tap-highlight-color: transparent; user-select: none; cursor: pointer;
  overflow: hidden;
  white-space: nowrap;
  flex: 0 0 auto;
}
.bt-tab:active { transform: scale(.95); }

.bt-tab-icon {
  font-size: 20px; line-height: 1; flex-shrink: 0;
  transition: transform 220ms var(--bt-ease), filter 200ms ease;
}
.bt-tab-label {
  max-width: 0; opacity: 0; overflow: hidden;
  font-size: 11px; font-weight: 800; letter-spacing: .03em; text-transform: uppercase;
  transition: max-width 280ms var(--bt-ease), opacity 200ms ease 60ms;
}

.bt-tab.active {
  color: rgba(235,232,255,.98);
  background: linear-gradient(135deg, rgba(124,92,252,.20), rgba(91,142,248,.14));
  border-color: rgba(124,92,252,.34);
  box-shadow: 0 0 0 1px rgba(167,139,250,.06) inset, 0 6px 18px rgba(124,92,252,.18);
  flex: 1 1 auto;
  padding: 8px 16px;
}
.bt-tab.active .bt-tab-icon {
  transform: scale(1.05);
  filter: drop-shadow(0 0 8px rgba(167,139,250,.55));
}
.bt-tab.active .bt-tab-label {
  max-width: 160px;
  opacity: 1;
}
`;

let _btCssInjected = false;
function useBottomTabsStyles() {
  React.useEffect(() => {
    if (_btCssInjected) return;
    const el = document.createElement("style");
    el.id = "bt-css"; el.textContent = CSS;
    document.head.appendChild(el);
    _btCssInjected = true;
  }, []);
}

type TabDef = {
  key: "lives" | "clips" | "bonus" | "menu" | "casinos";
  to: string;
  icon: string;
  label: string;
  ariaLabel: string;
};

const TABS: TabDef[] = [
  { key: "menu",   to: "/?tab=menu",   icon: "☰",  label: "Menu",        ariaLabel: "Menu" },
  { key: "lives",  to: "/",            icon: "📡", label: "Lives",       ariaLabel: "Lives en direct" },
  { key: "bonus",  to: "/?tab=bonus",  icon: "🎁", label: "Bonus",       ariaLabel: "Bonus & quêtes" },
  { key: "clips",  to: "/?tab=clips",  icon: "🎬", label: "Clips",       ariaLabel: "Clips" },
  { key: "casinos", to: "/casinos",    icon: "🎰", label: "CheckTaSlot", ariaLabel: "CheckTaSlot" },
];

function activeKeyFor(pathname: string, search: string): TabDef["key"] | null {
  if (pathname === "/casinos" || pathname.startsWith("/casinos/")) return "casinos";
  if (pathname !== "/") return null;
  const t = new URLSearchParams(search).get("tab");
  if (t === "clips" || t === "bonus" || t === "menu") return t;
  return "lives";
}

export function BottomTabs() {
  useBottomTabsStyles();
  const location = useLocation();
  const activeKey = activeKeyFor(location.pathname, location.search);

  return (
    <div className="bt-root">
      <nav className="bt-bar" aria-label="Navigation principale">
        {TABS.map((t) => {
          const active = activeKey === t.key;
          return (
            <Link
              key={t.key}
              to={t.to}
              className={`bt-tab${active ? " active" : ""}`}
              aria-label={t.ariaLabel}
              aria-current={active ? "page" : undefined}
            >
              <span className="bt-tab-icon" aria-hidden>{t.icon}</span>
              <span className="bt-tab-label">{t.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="bt-spacer" aria-hidden />
    </div>
  );
}
