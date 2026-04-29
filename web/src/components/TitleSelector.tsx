// web/src/components/TitleSelector.tsx
//
// Sélecteur unifié de titre (3 sources: niveau, succès, shop) avec preview
// stylé et bouton équiper. À placer dans la section Personnalisation.

import * as React from "react";
import { loadToken } from "../lib/storage";

type Source = "level" | "achievement" | "shop";
type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic";

type TitleEntry = {
  code: string;
  source: Source;
  label: string;
  description?: string;
  rarity: Rarity;
  owned: boolean;
};

type TitlesResponse = {
  ok: true;
  equipped: string | null;
  currentLevel: number;
  currentLevelTitle: string;
  titles: TitleEntry[];
};

const BASE = (
  (import.meta.env.VITE_API_BASE ??
    import.meta.env.VITE_API_URL ??
    "https://lunalive-api.onrender.com") as string
).replace(/\/$/, "");

async function fetchJson(path: string, init: RequestInit = {}): Promise<any> {
  const token = loadToken();
  const headers = new Headers(init.headers || {});
  if (init.body != null && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) throw new Error(data?.error || `API ${res.status}`);
  return data;
}

const STYLE_ID = "ts-styles-v1";
const CSS = `
@keyframes ts-shimmer {
  0%   { background-position: 0% 50%; }
  100% { background-position: 200% 50%; }
}
.ts-wrap { display: flex; flex-direction: column; gap: 14px; }
.ts-tabs { display: inline-flex; gap: 4px; background: rgba(255,255,255,0.04); border: 1px solid rgba(124,92,252,0.16); border-radius: 999px; padding: 3px; align-self: flex-start; }
.ts-tab {
  padding: 7px 14px; border-radius: 999px; border: none; background: transparent;
  color: rgba(220,220,255,0.6); font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer;
  transition: color .15s, background .15s;
}
.ts-tab:hover { color: #fff; }
.ts-tab-active { background: linear-gradient(135deg,#6366f1,#8b5cf6); color: #fff; box-shadow: 0 3px 10px rgba(124,92,252,0.4); }
.ts-tab-count { font-weight: 600; opacity: .7; margin-left: 4px; font-size: 11px; }

.ts-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
.ts-card {
  position: relative;
  border-radius: 14px;
  border: 1px solid rgba(124,92,252,0.16);
  background: rgba(13,11,24,0.65);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: border-color .18s, transform .18s;
  cursor: pointer;
}
.ts-card:hover { border-color: rgba(124,92,252,0.42); transform: translateY(-1px); }
.ts-card-locked { opacity: 0.55; cursor: not-allowed; }
.ts-card-equipped { border-color: #34d399 !important; box-shadow: 0 0 0 1px #34d399 inset, 0 6px 20px rgba(16,185,129,0.25); }

.ts-preview {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.02em;
  background-size: 200% 100%;
  animation: ts-shimmer 5s linear infinite;
}
.ts-rarity-common      { background: linear-gradient(135deg, #94a3b8, #cbd5e1, #94a3b8); color: #0f172a; }
.ts-rarity-uncommon    { background: linear-gradient(135deg, #34d399, #6ee7b7, #34d399); color: #064e3b; }
.ts-rarity-rare        { background: linear-gradient(135deg, #60a5fa, #93c5fd, #60a5fa); color: #1e3a8a; }
.ts-rarity-epic        { background: linear-gradient(135deg, #c084fc, #d8b4fe, #c084fc); color: #4c1d95; }
.ts-rarity-legendary   { background: linear-gradient(135deg, #fbbf24, #fde68a, #fbbf24); color: #78350f; }
.ts-rarity-mythic      { background: linear-gradient(135deg, #f472b6, #fbbf24, #22d3ee, #f472b6); color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.4); }

.ts-source { font-size: 10.5px; color: rgba(167,139,250,0.85); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 800; }
.ts-desc { font-size: 11.5px; color: rgba(220,220,255,0.55); line-height: 1.4; }
.ts-actions { display: flex; gap: 6px; margin-top: 4px; }
.ts-btn {
  flex: 1;
  padding: 6px 10px; border-radius: 8px;
  border: 1px solid rgba(124,92,252,0.32);
  background: rgba(124,92,252,0.10);
  color: #dde8ff; font: inherit; font-size: 11.5px; font-weight: 700;
  cursor: pointer;
  transition: background .15s, border-color .15s;
}
.ts-btn:hover { background: rgba(124,92,252,0.20); border-color: rgba(124,92,252,0.55); }
.ts-btn-primary { background: linear-gradient(135deg,#10b981,#34d399); border-color: rgba(16,185,129,0.4); color: #fff; }
.ts-btn-primary:hover { filter: brightness(1.1); }
.ts-btn:disabled { opacity: .5; cursor: not-allowed; }

.ts-equip-current {
  border-radius: 14px;
  border: 1px solid rgba(16,185,129,0.32);
  background: linear-gradient(160deg, rgba(16,185,129,0.06), transparent 60%), rgba(13,11,24,0.65);
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.ts-equip-current-label { font-size: 11px; color: rgba(167,139,250,0.85); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 800; margin-bottom: 6px; }
`;

function ensureCss() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const tag = document.createElement("style");
  tag.id = STYLE_ID;
  tag.textContent = CSS;
  document.head.appendChild(tag);
}

export function renderTitlePreview(label: string, rarity: Rarity, key?: string) {
  return (
    <span key={key} className={`ts-preview ts-rarity-${rarity}`}>
      {label}
    </span>
  );
}

const SOURCE_LABEL: Record<Source, string> = {
  level: "Niveau",
  achievement: "Succès",
  shop: "Shop",
};

export function TitleSelector() {
  const [data, setData] = React.useState<TitlesResponse | null>(null);
  const [tab, setTab] = React.useState<Source | "all">("all");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    try {
      const r = (await fetchJson(`/api/me/titles`)) as TitlesResponse;
      setData(r);
    } catch (e: any) {
      setErr(String(e?.message || e));
    }
  }, []);

  React.useEffect(() => {
    ensureCss();
    reload();
  }, [reload]);

  const equip = async (code: string | null) => {
    setBusy(code || "_unequip");
    setErr(null);
    try {
      await fetchJson(`/api/me/titles/equip`, { method: "POST", body: JSON.stringify({ code }) });
      await reload();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(null);
    }
  };

  if (!data) return <div style={{ color: "rgba(220,220,255,0.55)", fontSize: 13, padding: 12 }}>Chargement…</div>;

  const equippedEntry = data.titles.find((t) => t.code === data.equipped) || null;

  const filtered = tab === "all" ? data.titles : data.titles.filter((t) => t.source === tab);
  const counts = {
    all: data.titles.filter((t) => t.owned).length,
    level: data.titles.filter((t) => t.source === "level" && t.owned).length,
    achievement: data.titles.filter((t) => t.source === "achievement" && t.owned).length,
    shop: data.titles.filter((t) => t.source === "shop" && t.owned).length,
  };

  return (
    <div className="ts-wrap">
      {/* Bloc titre actuel */}
      <div className="ts-equip-current">
        <div>
          <div className="ts-equip-current-label">Titre actuel</div>
          {equippedEntry ? (
            renderTitlePreview(equippedEntry.label, equippedEntry.rarity)
          ) : (
            <span style={{ color: "rgba(220,220,255,0.55)", fontSize: 13, fontStyle: "italic" }}>
              Aucun titre équipé
            </span>
          )}
        </div>
        {data.equipped && (
          <button
            type="button"
            className="ts-btn"
            disabled={busy === "_unequip"}
            onClick={() => equip(null)}
          >
            Retirer
          </button>
        )}
      </div>

      {err && (
        <div style={{ padding: 8, borderRadius: 8, background: "rgba(240,78,78,0.1)", border: "1px solid rgba(240,78,78,0.28)", color: "#fc8181", fontSize: 12 }}>
          ⚠️ {err}
        </div>
      )}

      {/* Tabs */}
      <div className="ts-tabs">
        <button className={`ts-tab ${tab === "all" ? "ts-tab-active" : ""}`} onClick={() => setTab("all")}>
          Tous <span className="ts-tab-count">({counts.all})</span>
        </button>
        <button className={`ts-tab ${tab === "level" ? "ts-tab-active" : ""}`} onClick={() => setTab("level")}>
          Niveau
        </button>
        <button className={`ts-tab ${tab === "achievement" ? "ts-tab-active" : ""}`} onClick={() => setTab("achievement")}>
          Succès <span className="ts-tab-count">({counts.achievement})</span>
        </button>
        <button className={`ts-tab ${tab === "shop" ? "ts-tab-active" : ""}`} onClick={() => setTab("shop")}>
          Shop <span className="ts-tab-count">({counts.shop})</span>
        </button>
      </div>

      {/* Liste */}
      <div className="ts-list">
        {filtered.map((t) => {
          const isEquipped = data.equipped === t.code;
          const cardCls = `ts-card${!t.owned ? " ts-card-locked" : ""}${isEquipped ? " ts-card-equipped" : ""}`;
          return (
            <div key={t.code} className={cardCls}>
              <span className="ts-source">{SOURCE_LABEL[t.source]}</span>
              {renderTitlePreview(t.label, t.rarity)}
              {t.description && <span className="ts-desc">{t.description}</span>}
              <div className="ts-actions">
                {t.owned ? (
                  isEquipped ? (
                    <button className="ts-btn" disabled>✓ Équipé</button>
                  ) : (
                    <button
                      className="ts-btn ts-btn-primary"
                      disabled={busy === t.code}
                      onClick={() => equip(t.code)}
                    >
                      {busy === t.code ? "…" : "Équiper"}
                    </button>
                  )
                ) : (
                  <button className="ts-btn" disabled>🔒 Verrouillé</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
