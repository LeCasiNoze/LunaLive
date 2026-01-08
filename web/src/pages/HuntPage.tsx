import * as React from "react";
import { useAuth } from "../auth/AuthProvider";
import {
  huntAdd,
  huntClose,
  huntGetState,
  huntLoad,
  huntMyHunts,
  huntNew,
  huntOpen,
  huntRevert,
  huntSave,
  huntSetBet,
  huntSetPay,
  huntSetStart,
  huntSuggest,
  huntDelete,
  huntDeleteAll,
} from "../lib/hunt_api";
import type { HuntState, SuggestItem, SavedHunt } from "../lib/hunt_types";

function fmt(n: number) {
  try {
    return n.toLocaleString("fr-FR");
  } catch {
    return String(n);
  }
}

export default function HuntPage() {
  const { user } = useAuth();

  const [loading, setLoading] = React.useState(true);
  const [state, setState] = React.useState<HuntState | null>(null);

  const [q, setQ] = React.useState("");
  const [suggestions, setSuggestions] = React.useState<SuggestItem[]>([]);
  const [myHunts, setMyHunts] = React.useState<SavedHunt[]>([]);

  const [startInput, setStartInput] = React.useState<string>("");

  async function refreshAll() {
    const s = await huntGetState();
    if (!s?.ok) throw new Error("state_failed");
    setState(s.state);

    // refresh list archives
    const h = await huntMyHunts().catch(() => null);
    if (h?.ok) setMyHunts(h.items || []);

    // sync start input
    setStartInput(s.state?.start ? String(s.state.start) : "");
  }

  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await refreshAll();
      } catch {
        // ignore here; UI will show login block if not connected
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // suggestions
  React.useEffect(() => {
    let alive = true;
    (async () => {
      const qq = q.trim();
      if (qq.length < 2) {
        setSuggestions([]);
        return;
      }
      try {
        const r = await huntSuggest(qq, 12);
        if (!alive) return;
        setSuggestions(r?.ok ? r.items : []);
      } catch {
        if (!alive) return;
        setSuggestions([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [q]);

  if (!user) {
    return (
      <main className="page">
        <h1>Hunt</h1>
        <p>Tu dois être connecté pour accéder au tableau de hunt.</p>
      </main>
    );
  }

  const phase = state?.phase ?? "edit";
  const items = state?.items ?? [];

  const totalBet = items.reduce((s, it: any) => s + (Number(it.bet) || 0), 0);
  const totalPay = items.reduce((s, it: any) => s + (Number(it.pay) || 0), 0);
  const start = Number(state?.start) || 0;
  const profit = start > 0 ? totalPay - start : 0;
  const globalMulti = start > 0 && totalPay > 0 ? Math.round((totalPay / start) * 100) / 100 : null;

  return (
    <main className="page">
      <div className="pageHeader">
        <h1>Hunt</h1>
        <p style={{ opacity: 0.8, marginTop: 6 }}>
          Phase: <b>{phase}</b>
        </p>
      </div>

      {/* Actions principales */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ opacity: 0.8 }}>Start</span>
            <input
              value={startInput}
              onChange={(e) => setStartInput(e.target.value)}
              placeholder="ex: 5000"
              style={{ width: 140 }}
              disabled={phase !== "edit"}
            />
            <button
              disabled={phase !== "edit"}
              onClick={async () => {
                const v = Number(startInput);
                if (!Number.isFinite(v) || v <= 0) return;
                await huntSetStart(v);
                await refreshAll();
              }}
            >
              Valider Start
            </button>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            {phase === "edit" && (
              <>
                <button
                  onClick={async () => {
                    await huntOpen();
                    await refreshAll();
                  }}
                  disabled={!items.length || !start}
                >
                  Ouvrir le Hunt
                </button>
                <button
                  onClick={async () => {
                    await huntNew();
                    await refreshAll();
                  }}
                >
                  Nouveau Hunt
                </button>
                <button
                  onClick={async () => {
                    const ok = confirm("Reset total du hunt actuel ?");
                    if (!ok) return;
                    // si tu as /reset, remplace huntNew() par huntReset()
                    await huntNew();
                    await refreshAll();
                  }}
                >
                  Reset
                </button>
              </>
            )}

            {phase === "open" && (
              <>
                <button
                  onClick={async () => {
                    await huntClose();
                    await refreshAll();
                  }}
                >
                  Clôturer
                </button>
                <button
                  onClick={async () => {
                    await huntRevert();
                    await refreshAll();
                  }}
                >
                  Revenir en édition
                </button>
              </>
            )}

            {phase === "closed" && (
              <>
                <button
                  onClick={async () => {
                    await huntRevert();
                    await refreshAll();
                  }}
                >
                  Revenir en édition
                </button>
                <button
                  onClick={async () => {
                    await huntNew();
                    await refreshAll();
                  }}
                >
                  Nouveau Hunt
                </button>
                <button
                  onClick={async () => {
                    const title = prompt("Titre de sauvegarde (optionnel) :", "");
                    await huntSave(title || undefined);
                    await refreshAll();
                  }}
                >
                  Sauvegarder (copie)
                </button>
              </>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12, opacity: 0.9 }}>
          <div>Items: <b>{items.length}</b></div>
          <div>Total Bet: <b>{fmt(totalBet)}</b></div>
          <div>Total Pay: <b>{fmt(totalPay)}</b></div>
          <div>
            Profit: <b>{fmt(profit)}</b>
          </div>
          <div>
            Multi: <b>{globalMulti ?? "-"}</b>
          </div>
        </div>
      </div>

      {/* Ajout machine */}
      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Ajouter une machine</h2>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tape un nom de machine…"
            style={{ width: 360, maxWidth: "100%" }}
            disabled={phase !== "edit"}
          />
          <button
            disabled={phase !== "edit" || !q.trim()}
            onClick={async () => {
              const name = q.trim();
              if (!name) return;
              await huntAdd(name);
              setQ("");
              setSuggestions([]);
              await refreshAll();
            }}
          >
            Ajouter
          </button>
        </div>

        {!!suggestions.length && phase === "edit" && (
          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            {suggestions.map((s) => (
              <button
                key={`${s.name}-${s.score ?? ""}`}
                style={{
                  textAlign: "left",
                  padding: 10,
                  borderRadius: 10,
                }}
                onClick={async () => {
                  await huntAdd(s.name);
                  setQ("");
                  setSuggestions([]);
                  await refreshAll();
                }}
              >
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  {s.image_url ? (
                    <img
                      src={s.image_url}
                      alt=""
                      style={{ width: 34, height: 34, objectFit: "cover", borderRadius: 8 }}
                    />
                  ) : (
                    <div style={{ width: 34, height: 34, borderRadius: 8, opacity: 0.2, border: "1px solid currentColor" }} />
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{s.name}</div>
                    <div style={{ opacity: 0.75, fontSize: 12 }}>
                      {s.provider ? s.provider : "—"}
                      {typeof s.score === "number" ? ` • score ${s.score}` : ""}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tableau */}
      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Tableau</h2>

        {loading && <div style={{ opacity: 0.8 }}>Chargement…</div>}

        {!items.length ? (
          <div style={{ opacity: 0.8 }}>Aucune machine pour l’instant.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {items.map((it: any) => (
              <div
                key={it.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "44px 1fr 140px 140px 120px",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                {it.image_url ? (
                  <img
                    src={it.image_url}
                    alt=""
                    style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 10 }}
                  />
                ) : (
                  <div style={{ width: 44, height: 44, borderRadius: 10, opacity: 0.2, border: "1px solid currentColor" }} />
                )}

                <div>
                  <div style={{ fontWeight: 800 }}>{it.name}</div>
                  <div style={{ opacity: 0.75, fontSize: 12 }}>
                    {it.provider ?? "—"}
                  </div>
                </div>

                <input
                  type="number"
                  placeholder="bet"
                  value={it.bet ?? ""}
                  disabled={phase !== "edit" && phase !== "open"}
                  onChange={async (e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v) || v < 0) return;
                    await huntSetBet(it.id, v);
                    await refreshAll();
                  }}
                />

                <input
                  type="number"
                  placeholder="pay"
                  value={it.pay ?? ""}
                  disabled={phase !== "open"}
                  onChange={async (e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v) || v < 0) return;
                    await huntSetPay(it.id, v);
                    await refreshAll();
                  }}
                />

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button
                    disabled={phase !== "edit"}
                    onClick={async () => {
                      const ok = confirm(`Supprimer "${it.name}" ?`);
                      if (!ok) return;
                      // si tu as /remove (id) sur hunt2 => huntRemove(it.id)
                      const { huntRemove } = await import("../lib/hunt_api");
                      await huntRemove(it.id);
                      await refreshAll();
                    }}
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Archives */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={{ marginTop: 0, marginBottom: 0 }}>Mes hunts sauvegardés</h2>
          <button
            onClick={async () => {
              await refreshAll();
            }}
          >
            Rafraîchir
          </button>
          <div style={{ marginLeft: "auto" }}>
            <button
              onClick={async () => {
                const ok = confirm("Supprimer TOUTES tes sauvegardes ?");
                if (!ok) return;
                await huntDeleteAll();
                await refreshAll();
              }}
            >
              Tout supprimer
            </button>
          </div>
        </div>

        {!myHunts.length ? (
          <div style={{ opacity: 0.8, marginTop: 10 }}>Aucune sauvegarde.</div>
        ) : (
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            {myHunts.map((h) => (
              <div
                key={h.id}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ fontWeight: 800 }}>
                    {h.title ? h.title : `Hunt #${h.id}`}
                  </div>
                  <div style={{ opacity: 0.75, fontSize: 12 }}>
                    {h.created_at} • items {h.items_count} • start {h.start ?? "-"} • total {h.total_pay ?? "-"}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={async () => {
                      await huntLoad(h.id);
                      await refreshAll();
                    }}
                  >
                    Charger
                  </button>
                  <button
                    onClick={async () => {
                      const ok = confirm(`Supprimer la sauvegarde #${h.id} ?`);
                      if (!ok) return;
                      await huntDelete(h.id);
                      await refreshAll();
                    }}
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
