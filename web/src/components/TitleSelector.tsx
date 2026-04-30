// web/src/components/TitleSelector.tsx
//
// Sélecteur multi-slots: l'user équipe simultanément 3 titres (1 par source):
//   - Succès (🏆) en 2e ligne
//   - Niveau (⭐) en 2e ligne (auto-évolutif palier)

import * as React from "react";
import { loadToken } from "../lib/storage";
import { TitlePill } from "./chat/TitlePill";
import type { ChatTitleEntry } from "../lib/cosmetics";

type Source = "achievement" | "level";
type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic";

type TitleEntry = {
  code: string;
  source: Source;
  label: string;
  description?: string;
  rarity: Rarity;
  owned: boolean;
};

type Equipped = {
  achievement: string | null;
  level: boolean;
};

type TitlesResponse = {
  ok: true;
  equipped: Equipped;
  currentLevel: number;
  currentLevelTitle: string;
  currentLevelTier: number;
  titles: TitleEntry[];
};

type FilterMode = "all" | "owned" | "locked";

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

const STYLE_ID = "ts2-styles-v2";
const CSS = `
.ts2-wrap { display: flex; flex-direction: column; gap: 18px; }
.ts2-section {
  border-radius: 14px;
  border: 1px solid rgba(124,92,252,0.16);
  background: rgba(13,11,24,0.55);
  padding: 14px 16px;
}
.ts2-section-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; margin-bottom: 10px; flex-wrap: wrap;
}
.ts2-section-title {
  font-size: 12px; font-weight: 800; letter-spacing: 0.08em;
  text-transform: uppercase; color: rgba(167,139,250,0.85);
  display: flex; align-items: center; gap: 6px;
}
.ts2-equipped-now {
  display: flex; align-items: center; gap: 8px;
  font-size: 12.5px; color: rgba(220,220,255,0.75);
}
.ts2-toolbar {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  margin-bottom: 10px;
}
.ts2-search {
  flex: 1; min-width: 120px; max-width: 200px;
  padding: 5px 10px; border-radius: 8px;
  border: 1px solid rgba(124,92,252,0.22);
  background: rgba(255,255,255,0.04);
  color: #dde8ff; font: inherit; font-size: 12px;
  outline: none;
}
.ts2-search::placeholder { color: rgba(220,220,255,0.35); }
.ts2-filter-btn {
  padding: 4px 10px; border-radius: 7px;
  border: 1px solid rgba(124,92,252,0.22);
  background: rgba(255,255,255,0.04);
  color: rgba(220,220,255,0.65); font: inherit; font-size: 11px; font-weight: 700;
  cursor: pointer;
}
.ts2-filter-btn-active {
  border-color: rgba(124,92,252,0.45);
  background: rgba(124,92,252,0.14);
  color: #c4b5fd;
}
.ts2-rarity-group { margin-bottom: 10px; }
.ts2-rarity-group:last-child { margin-bottom: 0; }
.ts2-rarity-summary {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 0;
  cursor: pointer;
  list-style: none;
  font-size: 11px; font-weight: 800; letter-spacing: 0.06em;
  text-transform: uppercase;
  user-select: none;
}
.ts2-rarity-summary::-webkit-details-marker { display: none; }
.ts2-rarity-count {
  font-size: 10px; font-weight: 600; opacity: 0.65;
  letter-spacing: 0;
}
.ts2-rarity-line {
  flex: 1; height: 1px; background: currentColor; opacity: 0.15;
}
.ts2-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
  margin-top: 8px;
}
.ts2-card {
  position: relative;
  border-radius: 10px;
  border: 1px solid rgba(124,92,252,0.14);
  background: rgba(255,255,255,0.025);
  padding: 9px 11px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: border-color .15s, transform .15s;
  cursor: pointer;
}
.ts2-card:hover { border-color: rgba(124,92,252,0.4); transform: translateY(-1px); }
.ts2-card-locked { opacity: 0.45; cursor: not-allowed; }
.ts2-card-equipped { border-color: #34d399 !important; box-shadow: 0 0 0 1px #34d399 inset; }
.ts2-desc { font-size: 11px; color: rgba(220,220,255,0.55); line-height: 1.35; }
.ts2-lock-hint { font-size: 10px; color: rgba(220,220,255,0.40); font-style: italic; }
.ts2-actions { display: flex; gap: 6px; margin-top: 2px; }
.ts2-btn {
  flex: 1;
  padding: 5px 9px; border-radius: 7px;
  border: 1px solid rgba(124,92,252,0.32);
  background: rgba(124,92,252,0.08);
  color: #dde8ff; font: inherit; font-size: 11px; font-weight: 700;
  cursor: pointer;
}
.ts2-btn:hover { background: rgba(124,92,252,0.20); }
.ts2-btn-primary { background: linear-gradient(135deg,#10b981,#34d399); border-color: rgba(16,185,129,0.4); color: #fff; }
.ts2-btn:disabled { opacity: .5; cursor: not-allowed; }
.ts2-empty { color: rgba(220,220,255,0.45); font-size: 12px; padding: 12px 4px; text-align: center; }
`;

// Rarity display config
const RARITY_ORDER: Rarity[] = ["mythic", "legendary", "epic", "rare", "uncommon", "common"];
const RARITY_LABEL: Record<Rarity, string> = {
  mythic: "Mythique", legendary: "Légendaire", epic: "Épique",
  rare: "Rare", uncommon: "Peu commun", common: "Commun",
};
const RARITY_COLOR: Record<Rarity, string> = {
  mythic: "#e879f9", legendary: "#f59e0b", epic: "#a78bfa",
  rare: "#60a5fa", uncommon: "#6ee7b7", common: "rgba(220,220,255,0.55)",
};

function ensureCss() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const tag = document.createElement("style");
  tag.id = STYLE_ID;
  tag.textContent = CSS;
  document.head.appendChild(tag);
}

function toChatEntry(t: TitleEntry): ChatTitleEntry {
  return { source: t.source, code: t.code, label: t.label, rarity: t.rarity };
}

const SECTION_LABEL: Record<Source, { icon: string; title: string; sub: string }> = {
  achievement: { icon: "🏆", title: "Titre Succès", sub: "Débloqué via les achievements" },
  level: { icon: "⭐", title: "Titre Niveau (auto)", sub: "Suit ton palier — évolue avec ton XP" },
};

export function TitleSelector() {
  const [data, setData] = React.useState<TitlesResponse | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<FilterMode>("all");
  const [search, setSearch] = React.useState("");

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

  const equip = async (slot: Source, code: string | null) => {
    setBusy(`${slot}:${code ?? "_unequip"}`);
    setErr(null);
    try {
      await fetchJson(`/api/me/titles/equip`, {
        method: "POST",
        body: JSON.stringify({ slot, code }),
      });
      await reload();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(null);
    }
  };

  if (!data) return <div style={{ color: "rgba(220,220,255,0.55)", fontSize: 13, padding: 12 }}>Chargement…</div>;

  const renderSection = (slot: Source) => {
    const allItems = data.titles.filter((t) => t.source === slot);
    const isLevelSlot = slot === "level";
    const equippedCode = isLevelSlot ? (data.equipped.level ? "level_auto" : null) : (data.equipped as any)[slot];
    const equippedEntry = allItems.find((t) => t.code === equippedCode) || null;

    const q = search.toLowerCase().trim();
    const filtered = allItems.filter((t) => {
      if (q && !t.label.toLowerCase().includes(q)) return false;
      if (filter === "owned") return t.owned;
      if (filter === "locked") return !t.owned;
      return true;
    });

    // group by rarity
    const byRarity: Partial<Record<Rarity, TitleEntry[]>> = {};
    for (const r of RARITY_ORDER) {
      const items = filtered.filter((t) => t.rarity === r);
      if (items.length) byRarity[r] = items;
    }

    return (
      <div key={slot} className="ts2-section">
        <div className="ts2-section-head">
          <div className="ts2-section-title">
            <span aria-hidden>{SECTION_LABEL[slot].icon}</span>
            {SECTION_LABEL[slot].title}
            <span style={{ color: "rgba(220,220,255,0.45)", fontSize: 11, fontWeight: 600, textTransform: "none", letterSpacing: 0, marginLeft: 4 }}>
              · {SECTION_LABEL[slot].sub}
            </span>
          </div>
          <div className="ts2-equipped-now">
            {equippedEntry ? (
              <>
                <span>Équipé :</span>
                <TitlePill entry={toChatEntry(equippedEntry)} />
                <button
                  type="button"
                  className="ts2-btn"
                  style={{ flex: "0 0 auto", padding: "3px 9px" }}
                  disabled={busy === `${slot}:_unequip`}
                  onClick={() => equip(slot, null)}
                >
                  Retirer
                </button>
              </>
            ) : (
              <span style={{ fontStyle: "italic" }}>Aucun</span>
            )}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="ts2-empty">Aucun titre dans cette catégorie.</div>
        ) : (
          <div>
            {(RARITY_ORDER as Rarity[]).map((rarity) => {
              const items = byRarity[rarity];
              if (!items?.length) return null;
              const ownedCount = items.filter(t => t.owned).length;
              return (
                <details key={rarity} className="ts2-rarity-group" open>
                  <summary className="ts2-rarity-summary" style={{ color: RARITY_COLOR[rarity] }}>
                    {RARITY_LABEL[rarity]}
                    <span className="ts2-rarity-count">({ownedCount}/{items.length})</span>
                    <div className="ts2-rarity-line" />
                  </summary>
                  <div className="ts2-list">
                    {items.map((t) => {
                      const isEquipped = equippedCode === t.code;
                      const cardCls = `ts2-card${!t.owned ? " ts2-card-locked" : ""}${isEquipped ? " ts2-card-equipped" : ""}`;
                      const busyKey = `${slot}:${t.code}`;
                      return (
                        <div key={t.code} className={cardCls}>
                          <TitlePill entry={toChatEntry(t)} />
                          {t.description && <div className="ts2-desc">{t.description}</div>}
                          {!t.owned && (
                            <div className="ts2-lock-hint">🔒 Débloque via un succès</div>
                          )}
                          <div className="ts2-actions">
                            {t.owned ? (
                              isEquipped ? (
                                <button className="ts2-btn" disabled>✓ Équipé</button>
                              ) : (
                                <button
                                  className="ts2-btn ts2-btn-primary"
                                  disabled={busy === busyKey}
                                  onClick={() => equip(slot, t.code)}
                                >
                                  {busy === busyKey ? "…" : "Équiper"}
                                </button>
                              )
                            ) : (
                              <button className="ts2-btn" disabled>🔒 Verrouillé</button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="ts2-wrap">
      {err && (
        <div style={{ padding: 10, borderRadius: 8, background: "rgba(240,78,78,0.1)", border: "1px solid rgba(240,78,78,0.28)", color: "#fc8181", fontSize: 12 }}>
          ⚠️ {err}
        </div>
      )}
      <div style={{ fontSize: 12.5, color: "rgba(220,220,255,0.65)", lineHeight: 1.5 }}>
        Tu peux équiper un titre <strong>🏆 Succès</strong> et activer ton titre <strong>⭐ Niveau</strong> (palier auto-évolutif).
        Les deux s'affichent côte-à-côte sous ton pseudo dans le chat.
      </div>

      {/* Toolbar global */}
      <div className="ts2-toolbar">
        <input
          className="ts2-search"
          type="text"
          placeholder="Rechercher un titre…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {(["all", "owned", "locked"] as FilterMode[]).map(f => (
          <button
            key={f}
            type="button"
            className={`ts2-filter-btn${filter === f ? " ts2-filter-btn-active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "Tous" : f === "owned" ? "Débloqués" : "Verrouillés"}
          </button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 11, color: "rgba(220,220,255,0.45)" }}>
          {data.titles.filter(t => t.owned).length}/{data.titles.length} débloqués
        </span>
      </div>

      {renderSection("achievement")}
      {renderSection("level")}
    </div>
  );
}
