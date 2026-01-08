// web/src/pages/HuntPage.tsx
import * as React from "react";

import { useAuth } from "../auth/AuthProvider";
import {
  huntAdd,
  huntClose,
  huntDelete,
  huntDeleteAll,
  huntGetState,
  huntLoad,
  huntMyHunts,
  huntNew,
  huntOpen,
  huntRemove,
  huntRevert,
  huntSave,
  huntSetBet,
  huntSetPay,
  huntSetStart,
  huntSuggest,
} from "../lib/hunt_api";
import type { HuntState, SuggestItem, SavedHunt } from "../lib/hunt_types";

/* ===================== Helpers ===================== */
const fmtEur = (n: number) => `${(Number(n) || 0).toFixed(2)}€`;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function apiBase() {
  const envBase = (import.meta as any).env?.VITE_API_BASE;
  const base = envBase ? String(envBase) : "https://lunalive-api.onrender.com";
  return base.replace(/\/+$/, "");
}

function pickImageUrl(x: any): string | null {
  const u = x?.image_url ?? x?.imageUrl ?? x?.imageURL ?? x?.thumb_url ?? x?.thumbUrl ?? null;
  const s = String(u || "").trim();
  return s ? s : null;
}

function pickProvider(x: any): string | null {
  const p = x?.provider ?? x?.provider_name ?? x?.providerName ?? null;
  const s = String(p || "").trim();
  return s ? s : null;
}

function isProfitable(h: SavedHunt) {
  const start = Number((h as any).start) || 0;
  const pay = Number((h as any).total_pay) || 0;
  if (start <= 0) return null;
  return pay >= start;
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="pill">
      <span>{label}</span>
      <b className="tabular-nums">{value}</b>
    </div>
  );
}

function createdLabel(h: any) {
  const v = h?.created_at ?? h?.createdAt ?? null;
  if (!v) return "—";
  const t = new Date(String(v));
  if (!Number.isFinite(t.getTime())) return "—";
  return t.toLocaleString();
}

function SlotThumb({ url, size = 42 }: { url?: string | null; size?: number }) {
  const [broken, setBroken] = React.useState(false);

  const boxStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: 12,
    flex: "0 0 auto",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    overflow: "hidden",
    display: "grid",
    placeItems: "center",
  };

  if (!url || broken) {
    return (
      <div style={boxStyle} aria-hidden="true" title="🎰">
        <span style={{ fontSize: 16, opacity: 0.9 }}>🎰</span>
      </div>
    );
  }

  return (
    <div style={boxStyle} aria-hidden="true">
      <img
        src={url}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
        }}
      />
    </div>
  );
}

/* ===================== Component ===================== */
export default function HuntPage() {
  const { user } = useAuth();

  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  const [state, setState] = React.useState<HuntState>(
    {
      phase: "edit",
      opened: false,
      items: [],
      start: null,
    } as any
  );

  const phase = (state?.phase || ((state as any)?.opened ? "open" : "edit")) as HuntState["phase"];
  const items = (state?.items || []) as any[];

  // ✅ affichage edit : nouveaux en haut
  const itemsEdit = React.useMemo(() => {
    const arr = Array.isArray(items) ? [...items] : [];
    return arr.reverse();
  }, [items]);

  const [myHunts, setMyHunts] = React.useState<SavedHunt[]>([]);
  const [startInput, setStartInput] = React.useState<string>("");

  // Suggest
  const [q, setQ] = React.useState("");
  const [suggestions, setSuggestions] = React.useState<SuggestItem[]>([]);
  const [suggLoading, setSuggLoading] = React.useState(false);
  const [suggError, setSuggError] = React.useState<string | null>(null);
  const [showSugg, setShowSugg] = React.useState(false);
  const [sel, setSel] = React.useState(0);

  // Cache local (name -> image/provider) pour afficher les thumbs dans la liste
  const [slotMetaByName, setSlotMetaByName] = React.useState<
    Record<string, { imageUrl: string | null; provider: string | null }>
  >({});

  function keyName(n: any) {
    return String(n || "").trim().toLowerCase();
  }

  function pickItemImage(x: any): string | null {
    return pickImageUrl(x) ?? slotMetaByName[keyName(x?.name)]?.imageUrl ?? null;
  }

  function pickItemProvider(x: any): string | null {
    return pickProvider(x) ?? slotMetaByName[keyName(x?.name)]?.provider ?? null;
  }

  // anti-race : ignore les réponses en retard
  const suggReqRef = React.useRef(0);

  // Bet focus after add
  const betRefs = React.useRef<Record<string, HTMLInputElement | null>>({});
  const [pendingFocusId, setPendingFocusId] = React.useState<string | null>(null);

  // OPEN: deck
  const [deckIndex, setDeckIndex] = React.useState(0);
  const [draftPay, setDraftPay] = React.useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = React.useState<Record<string, boolean>>({});

  const startValue = Number((state as any)?.start) || 0;

  // totals
  const totalBetAll = React.useMemo(
    () => items.reduce((s: number, it: any) => s + (Number(it.bet) || 0), 0),
    [items]
  );
  const totalPayAll = React.useMemo(
    () => items.reduce((s: number, it: any) => s + (Number(it.pay) || 0), 0),
    [items]
  );
  const profit = React.useMemo(() => totalPayAll - startValue, [totalPayAll, startValue]);
  const globalMulti = React.useMemo(() => (totalBetAll > 0 ? totalPayAll / totalBetAll : 0), [totalBetAll, totalPayAll]);

  const remainingBet = React.useMemo(
    () =>
      items
        .filter((it: any) => it.pay === null || typeof it.pay === "undefined")
        .reduce((s: number, it: any) => s + (Number(it.bet) || 0), 0),
    [items]
  );

  const remainingToRecoup = React.useMemo(() => {
    const left = startValue - totalPayAll;
    return left > 0 ? left : 0;
  }, [startValue, totalPayAll]);

  const beBase = React.useMemo(() => {
    if (startValue <= 0 || totalBetAll <= 0) return 0;
    return startValue / totalBetAll;
  }, [startValue, totalBetAll]);

  const beLive = React.useMemo(() => {
    if (remainingToRecoup <= 0) return 0;
    if (remainingBet <= 0) return 0;
    return remainingToRecoup / remainingBet;
  }, [remainingToRecoup, remainingBet]);

  const canOpen = React.useMemo(() => {
    return phase === "edit" && startValue > 0 && items.length > 0 && items.every((it: any) => Number(it.bet) > 0);
  }, [phase, startValue, items]);

  // keep deckIndex valid
  React.useEffect(() => {
    if (items?.length) setDeckIndex((i) => Math.max(0, Math.min(i, items.length - 1)));
    else setDeckIndex(0);
  }, [items.length]);

  async function refreshState() {
    const s = await huntGetState();
    if (s?.ok && s.state) {
      setState(s.state as any);
      setStartInput(s.state?.start != null ? String(s.state.start) : "");
    }
  }

  async function refreshAll() {
    await refreshState();
    const h = await huntMyHunts().catch(() => null);
    if (h?.ok) setMyHunts(h.items || []);
  }

  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await refreshAll();
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ Suggestions : même UX + fallback /slots/search (comme BotMenu)
  async function fetchSuggestions(text: string) {
    const s = String(text || "").trim();
    const reqId = ++suggReqRef.current;

    if (s.length < 2) {
      setSuggestions([]);
      setSuggError(null);
      setSuggLoading(false);
      return;
    }

    setSuggLoading(true);
    setSuggError(null);

    try {
      // 1) on tente /api/hunt2/suggest (si backend ok)
      let raw: any[] = [];
      try {
        const r = await huntSuggest(s, 12);
        raw = Array.isArray((r as any)?.items) ? (r as any).items : [];
      } catch (e: any) {
        raw = [];
        // on garde l’erreur pour debug si la fallback échoue aussi
        setSuggError(String(e?.message || "hunt_suggest_failed"));
      }

      // 2) fallback EXACT BotMenu: /slots/search
      if (!raw.length) {
        try {
          const r2 = await fetch(`${apiBase()}/slots/search?q=${encodeURIComponent(s)}&limit=12`);
          const j2 = await r2.json().catch(() => null);
          if (j2?.ok && Array.isArray(j2.items)) {
            raw = j2.items.map((x: any) => ({
              name: String(x?.name || ""),
              provider: x?.provider ?? null,
              image_url: x?.imageUrl ?? null,
              score: 0,
            }));
            setSuggError(null);
          }
        } catch (e: any) {
          // si tout a échoué, on garde l’erreur existante
          setSuggError((prev) => prev ?? String(e?.message || "slots_search_failed"));
        }
      }

      // réponse en retard => ignore
      if (reqId !== suggReqRef.current) return;

      const already = new Set(items.map((it: any) => String(it.name || "").trim().toLowerCase()));
      const seen = new Set<string>();

      const filtered = raw.filter((x: any) => {
        const key = String(x?.name || "").trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return !already.has(key);
      });

      setSlotMetaByName((prev) => {
        const next = { ...prev };
        for (const x of filtered) {
          const k = keyName((x as any)?.name);
          if (!k) continue;
          const img = pickImageUrl(x);
          const prov = pickProvider(x);
          if (!next[k]) next[k] = { imageUrl: img ?? null, provider: prov ?? null };
          else {
            if (!next[k].imageUrl && img) next[k].imageUrl = img;
            if (!next[k].provider && prov) next[k].provider = prov;
          }
        }
        return next;
      });

      setSuggestions(filtered);
      setSel(0);
    } finally {
      if (reqId === suggReqRef.current) setSuggLoading(false);
    }
  }

  // debounce
  React.useEffect(() => {
    const t = window.setTimeout(() => {
      fetchSuggestions(q).catch(() => {});
    }, 120);
    return () => window.clearTimeout(t);
  }, [q, items]);

  // focus bet after add
  React.useEffect(() => {
    if (!pendingFocusId) return;
    const el = betRefs.current[pendingFocusId];
    if (el) {
      el.focus();
      try {
        (el as any).select?.();
      } catch {}
      setPendingFocusId(null);
    }
  }, [pendingFocusId, itemsEdit]);

  // keyboard shortcuts in open
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (phase !== "open") return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setDeckIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setDeckIndex((i) => Math.min((items?.length || 1) - 1, i + 1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, items]);

  if (!user) {
    return (
      <main className="page huntPage">
        <div className="huntLayout" style={{ gridTemplateColumns: "1fr" }}>
          <section className="huntPanel">
            <div className="huntPanelInner">
              <h1 className="huntTitle">Hunt</h1>
              <div className="huntSubtitle">Connecte-toi pour créer et gérer ton hunt.</div>
            </div>
          </section>
        </div>
      </main>
    );
  }

  async function saveStart() {
    const v = Number(startInput);
    if (!(v > 0)) return;
    setBusy(true);
    try {
      await huntSetStart(v);
      await refreshState();
    } finally {
      setBusy(false);
    }
  }

  async function addItemFromSelection(item: SuggestItem | null) {
    if (!(startValue > 0)) {
      alert("Définis d’abord le Start du hunt.");
      return;
    }
    const nm = (item?.name || q || "").trim();
    if (!nm) return;

    // si on a cliqué une suggestion, on garde son image/provider pour l’affichage de la liste
    if (item?.name) {
      const k = keyName(item.name);
      const img = pickImageUrl(item);
      const prov = pickProvider(item);
      setSlotMetaByName((prev) => ({
        ...prev,
        [k]: {
          imageUrl: img ?? prev[k]?.imageUrl ?? null,
          provider: prov ?? prev[k]?.provider ?? null,
        },
      }));
    }

    setBusy(true);
  }

  async function removeItem(id: string) {
    setBusy(true);
    try {
      await huntRemove(id);
      await refreshState();
    } finally {
      setBusy(false);
    }
  }

  async function setBet(id: string, bet: number) {
    setBusy(true);
    try {
      await huntSetBet(id, bet);
      await refreshState();
    } finally {
      setBusy(false);
    }
  }

  async function setPay(id: string, pay: number) {
    setBusy(true);
    try {
      await huntSetPay(id, pay);
      await refreshState();
    } finally {
      setBusy(false);
    }
  }

  async function doOpen() {
    if (!canOpen) return;
    setBusy(true);
    try {
      await huntOpen();
      await refreshState();
    } finally {
      setBusy(false);
    }
  }

  async function doClose() {
    setBusy(true);
    try {
      await huntClose();
      await refreshAll();
    } finally {
      setBusy(false);
    }
  }

  async function doRevert() {
    setBusy(true);
    try {
      await huntRevert();
      await refreshState();
    } finally {
      setBusy(false);
    }
  }

  async function doNew() {
    setBusy(true);
    try {
      await huntNew();
      setDraftPay({});
      setConfirmed({});
      await refreshAll();
    } finally {
      setBusy(false);
    }
  }

  async function doLoad(id: number) {
    setBusy(true);
    try {
      await huntLoad(id);
      setDraftPay({});
      setConfirmed({});
      await refreshState();
    } finally {
      setBusy(false);
    }
  }

  async function doSaveCopy() {
    const title = prompt("Titre (optionnel) :", "") || undefined;
    setBusy(true);
    try {
      await huntSave(title);
      await refreshAll();
    } finally {
      setBusy(false);
    }
  }

  async function deleteSaved(id: number) {
    setBusy(true);
    try {
      await huntDelete(id);
      await refreshAll();
    } finally {
      setBusy(false);
    }
  }

  async function deleteAllSaved() {
    const ok = confirm("Supprimer TOUTES tes sauvegardes ?");
    if (!ok) return;
    setBusy(true);
    try {
      await huntDeleteAll();
      await refreshAll();
    } finally {
      setBusy(false);
    }
  }

  const progressPct = startValue > 0 ? clamp01(totalPayAll / startValue) * 100 : 0;

  const current = phase === "open" ? items[deckIndex] : null;
  const currentId = current ? String(current.id) : null;
  const currentKey = currentId || "";
  const isConfirmed = currentId ? !!confirmed[currentKey] : false;

  async function validateCurrentPay() {
    if (!currentId) return;
    const raw = String(draftPay[currentKey] ?? "").trim();
    if (!raw) return;
    const v = Math.max(0, Number((Number(raw) || 0).toFixed(2)));
    await setPay(currentId, v);
    setConfirmed((p) => ({ ...p, [currentKey]: true }));
  }

  function goNext() {
    setDeckIndex((x) => Math.min(items.length - 1, x + 1));
  }

  const primaryDeckLabel =
    phase === "open" && current
      ? isConfirmed
        ? deckIndex >= items.length - 1
          ? "Terminer"
          : "Next"
        : "Valider"
      : "Valider";

  return (
    <main className="page huntPage">
      <div className="huntLayout">
        {/* ===== SIDEBAR ===== */}
        <aside className="huntPanel">
          <div className="huntPanelInner">
            <div className="huntSidebarHeader">
              <div className="huntSidebarTitle">Mes Hunts</div>
              <div className="huntRow">
                <button className="btn" onClick={refreshAll} disabled={busy} title="Rafraîchir">
                  ↻
                </button>
                <button className="btn btnDanger" onClick={deleteAllSaved} disabled={busy} title="Tout supprimer">
                  ✕
                </button>
              </div>
            </div>

            {!myHunts.length ? (
              <div className="huntSmallMuted" style={{ marginTop: 10 }}>
                Aucun hunt sauvegardé pour l’instant.
              </div>
            ) : (
              <div className="huntList">
                {myHunts.map((h) => {
                  const prof = isProfitable(h);
                  const tone =
                    prof === true
                      ? "border:1px solid rgba(16,185,129,0.35)"
                      : prof === false
                      ? "border:1px solid rgba(244,63,94,0.35)"
                      : "";
                  return (
                    <div key={h.id} className="huntListItem" style={tone ? ({ border: tone as any } as any) : undefined}>
                      <div className="huntListTop">
                        <div className="huntListTitle">
                          <button
                            onClick={async () => {
                              await doLoad(h.id);
                            }}
                            disabled={busy}
                          >
                            {h.title ? h.title : `Hunt #${h.id}`}
                          </button>
                        </div>
                        <button className="btn btnDanger" onClick={() => deleteSaved(h.id)} disabled={busy} title="Supprimer">
                          ✕
                        </button>
                      </div>

                      <div className="huntListMeta">
                        {createdLabel(h)} • {(h as any).items_count ?? 0} items
                        <br />
                        start {fmtEur(Number((h as any).start || 0))} • total pay {fmtEur(Number((h as any).total_pay || 0))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
              <button className="btn btnPrimary" onClick={doNew} disabled={busy}>
                Commencer un nouveau Hunt
              </button>
            </div>
          </div>
        </aside>

        {/* ===== MAIN ===== */}
        <section style={{ display: "grid", gap: 14 }}>
          {/* Header / Start / Actions */}
          <div className="huntPanel">
            <div className="huntPanelInner">
              <h1 className="huntTitle">Hunt</h1>
              <div className="huntSubtitle">Sidebar + stats + ajout + tableau + deck (sans libs).</div>

              <div className="huntRow" style={{ marginTop: 12 }}>
                <div className="huntRow" style={{ gap: 8 }}>
                  <span className="huntSmallMuted">Start</span>
                  <input
                    type="number"
                    step="0.01"
                    value={startInput}
                    onChange={(e) => setStartInput(e.target.value)}
                    placeholder="ex: 100"
                    style={{ width: 160 }}
                    disabled={busy}
                  />
                  <button className="btn btnPrimary" onClick={saveStart} disabled={busy || !(Number(startInput) > 0)}>
                    Valider Start
                  </button>
                </div>

                <div style={{ marginLeft: "auto" }} className="huntRow">
                  {phase === "edit" && (
                    <button className="btn btnPrimary" onClick={doOpen} disabled={busy || !canOpen}>
                      Ouvrir le hunt
                    </button>
                  )}

                  {phase === "open" && (
                    <>
                      <button className="btn" onClick={doRevert} disabled={busy}>
                        Revenir en édition
                      </button>
                      <button className="btn btnPrimary" onClick={doClose} disabled={busy}>
                        Terminer le hunt
                      </button>
                    </>
                  )}

                  {phase === "closed" && (
                    <>
                      <button className="btn" onClick={doRevert} disabled={busy}>
                        Revenir en édition
                      </button>
                      <button className="btn" onClick={doSaveCopy} disabled={busy}>
                        Sauvegarder (copie)
                      </button>
                      <button className="btn btnPrimary" onClick={doNew} disabled={busy}>
                        Nouveau Hunt
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="huntPills">
                <StatPill label="Phase" value={String(phase)} />
                <StatPill label="Items" value={String(items.length)} />
                <StatPill label="Total bet" value={fmtEur(totalBetAll)} />
                <StatPill label="Total pay" value={fmtEur(totalPayAll)} />
                <StatPill label="Profit" value={fmtEur(profit)} />
                <StatPill label="Multi" value={`x${globalMulti.toFixed(2)}`} />
                <StatPill label="BE base" value={`x${beBase.toFixed(2)}`} />
                <StatPill label="BE reste" value={`x${beLive.toFixed(2)}`} />
              </div>

              <div style={{ marginTop: 12 }}>
                <div className="huntRow" style={{ justifyContent: "space-between" }}>
                  <span className="huntSmallMuted">Récupéré</span>
                  <span className="huntSmallMuted">
                    {fmtEur(totalPayAll)} / {fmtEur(startValue)}
                  </span>
                </div>
                <div
                  style={{
                    marginTop: 6,
                    height: 10,
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.04)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${progressPct}%`,
                      background: progressPct >= 100 ? "rgba(16,185,129,0.70)" : "rgba(34,211,238,0.70)",
                      transition: "width 200ms ease",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ===== EDIT ===== */}
          {phase === "edit" && (
            <>
              {/* Ajout machine + suggestions */}
              <div className="huntPanel">
                <div className="huntPanelInner">
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>Ajouter une machine</div>

                  <div className="huntRow">
                    <input
                      value={q}
                      onChange={(e) => {
                        setQ(e.target.value);
                        if (!showSugg) setShowSugg(true);
                      }}
                      placeholder="Tape un nom de machine…"
                      style={{ width: 460, maxWidth: "100%" }}
                      disabled={busy}
                      onFocus={() => setShowSugg(true)}
                      onBlur={() => setTimeout(() => setShowSugg(false), 160)}
                      onKeyDown={(e) => {
                        const visible = showSugg && q.trim().length >= 2;
                        if (!visible) {
                          if (e.key === "Enter") addItemFromSelection(null);
                          return;
                        }

                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          if (suggestions.length) setSel((i) => Math.min(suggestions.length - 1, i + 1));
                        } else if (e.key === "ArrowUp") {
                          e.preventDefault();
                          if (suggestions.length) setSel((i) => Math.max(0, i - 1));
                        } else if (e.key === "Enter") {
                          e.preventDefault();
                          if (suggestions.length) addItemFromSelection(suggestions[sel] || null);
                          else addItemFromSelection(null);
                        } else if (e.key === "Escape") {
                          setShowSugg(false);
                        }
                      }}
                    />

                    <button className="btn btnPrimary" disabled={busy || !q.trim()} onClick={() => addItemFromSelection(null)}>
                      Ajouter
                    </button>
                  </div>

                  {/* ✅ Suggestions : BotMenu-like */}
                  {showSugg && q.trim().length >= 2 ? (
                    <div style={{ marginTop: 10 }}>
                      {suggLoading ? <div className="huntSmallMuted">Suggestions…</div> : null}

                      {suggestions.length ? (
                        <div className="suggGrid">
                          {suggestions.map((s, i) => {
                            const img = pickImageUrl(s);
                            const prov = pickProvider(s);
                            return (
                              <button
                                key={`${s.name}-${prov || ""}-${i}`}
                                className="suggItem"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => addItemFromSelection(s)}
                                disabled={busy}
                                style={i === sel ? ({ outline: "2px solid rgba(167,139,250,0.55)", outlineOffset: 2 } as any) : undefined}
                              >
                                <div className="suggRow">
                                  <SlotThumb url={img} size={42} />
                                  <div style={{ minWidth: 0, flex: 1 }}>
                                    <div className="suggName">{s.name}</div>
                                    <div className="suggSub">{prov ? prov : "—"}</div>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ) : !suggLoading ? (
                        <div className="huntSmallMuted">{suggError ? `Aucune suggestion. (${suggError})` : "Aucune suggestion."}</div>
                      ) : null}
                    </div>
                  ) : null}

                  {startValue <= 0 ? (
                    <div className="huntSmallMuted" style={{ marginTop: 10 }}>
                      ⚠️ Tu peux chercher des machines, mais pour <b>ajouter</b> il faut définir un <b>Start</b>.
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Liste items */}
              <div className="huntPanel">
                <div className="huntPanelInner">
                  <div className="huntRow" style={{ justifyContent: "space-between" }}>
                    <div className="huntSmallMuted">
                      {items.length} machine{items.length > 1 ? "s" : ""} • total bet <b>{fmtEur(totalBetAll)}</b>
                    </div>
                    <button className="btn btnPrimary" onClick={doOpen} disabled={busy || !canOpen}>
                      Ouvrir le hunt
                    </button>
                  </div>

                  {!items.length ? (
                    <div className="huntSmallMuted" style={{ marginTop: 10 }}>
                      Aucune machine pour l’instant.
                    </div>
                  ) : (
                    <div className="itemsGrid" style={{ marginTop: 10 }}>
                      {itemsEdit.map((it: any) => {
                        const img = pickItemImage(it);
                        const prov = pickItemProvider(it);
                        return (
                          <div key={it.id} className="itemRow">
                            <div className="itemImg">
                              <SlotThumb url={img} size={46} />
                            </div>

                            <div style={{ minWidth: 0 }}>
                              <div className="itemName">{it.name}</div>
                              <div className="itemProvider">{prov ?? "—"}</div>
                            </div>

                            <input
                              ref={(el) => {
                                betRefs.current[String(it.id)] = el;
                              }}
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="bet"
                              defaultValue={it.bet ?? ""}
                              disabled={busy}
                              onBlur={(e) => {
                                const v = Number(e.currentTarget.value || "0");
                                if (!Number.isFinite(v)) return;
                                setBet(String(it.id), Math.max(0, Number(v.toFixed(2))));
                              }}
                            />

                            <input type="number" placeholder="pay (lock)" disabled value={it.pay ?? ""} />

                            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                              <button className="btn btnDanger" disabled={busy} onClick={() => removeItem(String(it.id))}>
                                Supprimer
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {!canOpen && items.length > 0 && (
                    <div className="huntSmallMuted" style={{ marginTop: 10 }}>
                      ⚠️ Pour ouvrir : Start &gt; 0, au moins 1 machine, et chaque machine doit avoir une mise (bet) &gt; 0.
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ===== OPEN (deck simple) ===== */}
          {phase === "open" && (
            <div className="huntPanel">
              <div className="huntPanelInner">
                <div className="huntRow" style={{ justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>Ouverture des bonus</div>
                    <div className="huntSmallMuted">{items.length ? `${deckIndex + 1} / ${items.length}` : "—"}</div>
                  </div>
                  <div className="huntRow">
                    <button className="btn" onClick={doRevert} disabled={busy}>
                      Revenir en édition
                    </button>
                    <button className="btn btnPrimary" onClick={doClose} disabled={busy}>
                      Terminer le hunt
                    </button>
                  </div>
                </div>

                {!current ? (
                  <div className="huntSmallMuted" style={{ marginTop: 10 }}>
                    Aucune machine.
                  </div>
                ) : (
                  <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                    {/* Nav */}
                    <div className="huntRow" style={{ justifyContent: "space-between" }}>
                      <button className="btn" onClick={() => setDeckIndex((i) => Math.max(0, i - 1))} disabled={busy || deckIndex === 0}>
                        ◀ Précédent
                      </button>
                      <button
                        className="btn"
                        onClick={() => setDeckIndex((i) => Math.min(items.length - 1, i + 1))}
                        disabled={busy || deckIndex >= items.length - 1}
                      >
                        Suivant ▶
                      </button>
                    </div>

                    {/* Card */}
                    <div
                      className="huntPanel"
                      style={{
                        borderRadius: 18,
                        overflow: "hidden",
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(255,255,255,0.04)",
                      }}
                    >
                      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 0 }}>
                        <div style={{ minHeight: 260, background: "rgba(0,0,0,0.25)" }}>
                            {pickItemImage(current) ? (
                            <img
                                src={pickItemImage(current) as string}
                              alt={current.name}
                              referrerPolicy="no-referrer"
                              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                            />
                          ) : (
                            <div style={{ height: "100%", display: "grid", placeItems: "center", opacity: 0.7 }}>—</div>
                          )}
                        </div>

                        <div style={{ padding: 14, display: "grid", gap: 10 }}>
                          <div>
                            <div style={{ fontWeight: 900, fontSize: 18, lineHeight: 1.2 }}>{current.name}</div>
                            <div className="huntSmallMuted">{pickProvider(current) ?? "—"}</div>
                          </div>

                          <div className="huntPills" style={{ marginTop: 0 }}>
                            <StatPill label="Bet" value={fmtEur(Number(current.bet) || 0)} />
                            <StatPill label="Pay" value={fmtEur(Number(current.pay) || 0)} />
                            <StatPill
                              label="Multi"
                              value={`x${Number(current.bet) > 0 ? ((Number(current.pay) || 0) / Number(current.bet)).toFixed(2) : "0.00"}`}
                            />
                          </div>

                          <div style={{ display: "grid", gap: 6 }}>
                            <div className="huntSmallMuted">Entrer le gain</div>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={draftPay[currentKey] ?? (current.pay != null ? String(current.pay) : "")}
                              onChange={(e) => {
                                const val = e.target.value;
                                setDraftPay((p) => ({ ...p, [currentKey]: val }));
                                setConfirmed((p) => ({ ...p, [currentKey]: false }));
                              }}
                              disabled={busy}
                              onKeyDown={async (e) => {
                                if (e.key === "Enter") {
                                  await validateCurrentPay();
                                }
                              }}
                            />
                          </div>

                          <div className="huntRow" style={{ justifyContent: "space-between", marginTop: 6 }}>
                            <button
                              className="btn btnPrimary"
                              disabled={busy || !currentId || (!isConfirmed && !String(draftPay[currentKey] ?? "").trim())}
                              onClick={async () => {
                                if (!currentId) return;

                                if (!isConfirmed) {
                                  await validateCurrentPay();
                                  return;
                                }

                                if (deckIndex >= items.length - 1) {
                                  await doClose();
                                  return;
                                }

                                goNext();
                              }}
                            >
                              {primaryDeckLabel}
                            </button>

                            <div className="huntSmallMuted" style={{ marginLeft: "auto" }}>
                              Astuce : flèches clavier ◀ ▶ pour naviguer.
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===== CLOSED ===== */}
          {phase === "closed" && (
            <div className="huntPanel">
              <div className="huntPanelInner">
                <div className="huntRow" style={{ justifyContent: "space-between" }}>
                  <div style={{ fontWeight: 900 }}>Hunt terminé</div>
                  <div className="huntRow">
                    <button className="btn" onClick={doRevert} disabled={busy}>
                      Revenir en édition
                    </button>
                    <button className="btn" onClick={doSaveCopy} disabled={busy}>
                      Sauvegarder (copie)
                    </button>
                    <button className="btn btnPrimary" onClick={doNew} disabled={busy}>
                      Nouveau Hunt
                    </button>
                  </div>
                </div>

                <div className="huntPills" style={{ marginTop: 12 }}>
                  <StatPill label="Start" value={fmtEur(startValue)} />
                  <StatPill label="Total pay" value={fmtEur(totalPayAll)} />
                  <StatPill label="Global multi" value={`x${globalMulti.toFixed(2)}`} />
                  <StatPill label="Profit" value={fmtEur(profit)} />
                </div>

                <div style={{ marginTop: 12 }}>
                  <div className="huntRow" style={{ justifyContent: "space-between" }}>
                    <span className="huntSmallMuted">Récupéré</span>
                    <span className="huntSmallMuted">
                      {fmtEur(totalPayAll)} / {fmtEur(startValue)}
                    </span>
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      height: 10,
                      borderRadius: 999,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(255,255,255,0.04)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${progressPct}%`,
                        background: progressPct >= 100 ? "rgba(16,185,129,0.70)" : "rgba(34,211,238,0.70)",
                        transition: "width 200ms ease",
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {loading ? <div className="huntSmallMuted">Chargement…</div> : null}
        </section>
      </div>
    </main>
  );
}
