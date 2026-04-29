// web/src/components/chat/TitlePill.tsx
//
// Pill compact pour afficher un titre avec préfixe icone selon source
// et gradient selon rareté/source. Réutilisable: chat, profil, listes.

import * as React from "react";
import type { ChatTitleEntry } from "../../lib/cosmetics";

const STYLE_ID = "tp-styles-v1";
const CSS = `
@keyframes tp-shimmer {
  0%   { background-position: 0% 50%; }
  100% { background-position: 200% 50%; }
}
.tp {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 0.78em;
  font-weight: 700;
  letter-spacing: 0.01em;
  white-space: nowrap;
  background-size: 200% 100%;
  animation: tp-shimmer 6s linear infinite;
  vertical-align: middle;
  user-select: none;
  border: 1px solid rgba(255,255,255,0.08);
}
.tp-icon { font-size: 0.85em; opacity: 0.95; }
.tp-label { line-height: 1.1; }

/* Rareté → gradient (commun à toutes sources) */
.tp-rarity-common      { background: linear-gradient(135deg, #94a3b8, #cbd5e1, #94a3b8); color: #0f172a; }
.tp-rarity-uncommon    { background: linear-gradient(135deg, #34d399, #6ee7b7, #34d399); color: #064e3b; }
.tp-rarity-rare        { background: linear-gradient(135deg, #60a5fa, #93c5fd, #60a5fa); color: #1e3a8a; }
.tp-rarity-epic        { background: linear-gradient(135deg, #c084fc, #d8b4fe, #c084fc); color: #4c1d95; }
.tp-rarity-legendary   { background: linear-gradient(135deg, #fbbf24, #fde68a, #fbbf24); color: #78350f; }
.tp-rarity-mythic      {
  background: linear-gradient(135deg, #f472b6, #fbbf24, #22d3ee, #c084fc, #f472b6);
  background-size: 300% 100%;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0,0,0,0.45);
  border-color: rgba(255,255,255,0.18);
}

/* Source-spécifique: shop = glow rose subtil */
.tp-source-shop {
  box-shadow: 0 0 0 1px rgba(244,114,182,0.18), 0 2px 6px rgba(244,114,182,0.18);
}
`;

function ensureCss() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const tag = document.createElement("style");
  tag.id = STYLE_ID;
  tag.textContent = CSS;
  document.head.appendChild(tag);
}

const SOURCE_ICON: Record<ChatTitleEntry["source"], string> = {
  shop: "👑",
  achievement: "🏆",
  level: "⭐",
};

type Props = {
  entry: ChatTitleEntry;
  size?: "sm" | "md";
};

export function TitlePill({ entry, size = "sm" }: Props) {
  React.useEffect(() => { ensureCss(); }, []);
  const cls = `tp tp-rarity-${entry.rarity} tp-source-${entry.source}`;
  return (
    <span
      className={cls}
      style={size === "md" ? { fontSize: "0.86em", padding: "2px 9px" } : undefined}
      title={`${entry.source === "shop" ? "Shop" : entry.source === "achievement" ? "Succès" : "Niveau"} · ${entry.label}`}
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
  shop?: ChatTitleEntry | null;
  achievement?: ChatTitleEntry | null;
  level?: ChatTitleEntry | null;
};

export function TitleSecondLine({ titles }: { titles: Titles | null | undefined }) {
  if (!titles) return null;
  const { achievement, level } = titles;
  if (!achievement && !level) return null;
  return (
    <div style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {achievement ? <TitlePill entry={achievement} /> : null}
      {achievement && level ? <span style={{ opacity: 0.45, fontSize: "0.85em" }}>—</span> : null}
      {level ? <TitlePill entry={level} /> : null}
    </div>
  );
}
