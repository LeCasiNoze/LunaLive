import * as React from "react";
import { useAuth } from "../auth/AuthProvider";
import { getDailyBonusState } from "../lib/api";
import { DailyBonusAgendaModal, type DailyBonusState } from "./DailyBonusAgendaModal";

function rewardShort(r: any) {
  if (!r) return "—";
  if (r.type === "rubis") return `💎 ${r.amount}`;
  return `🎡 x${r.amount ?? 1}`;
}

function smallCellStyle(status: string) {
  const base: React.CSSProperties = {
    padding: "10px 10px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.05)",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    userSelect: "none",
    minHeight: 62,
  };

  const clickable = status === "today_claimable";
  const greyed = status === "future" || status === "missed" || status === "claimed" || status === "today_claimed";

  if (clickable) {
    return {
      ...base,
      cursor: "pointer",
      border: "1px solid rgba(255,255,255,0.25)",
      boxShadow: "0 0 0 1px rgba(180,140,255,0.35), 0 0 18px rgba(140,120,255,0.25)",
      background: "rgba(255,255,255,0.07)",
    };
  }

  if (greyed) {
    return {
      ...base,
      opacity: status === "missed" ? 0.55 : 0.75,
      filter: status === "missed" ? "grayscale(1)" : "none",
      cursor: "default",
    };
  }

  return base;
}

export function DailyBonusHomeCard() {
  const auth = useAuth() as any;
  const token = auth?.token ?? null;

  const [loading, setLoading] = React.useState(true);
  const [state, setState] = React.useState<DailyBonusState | null>(null);
  const [open, setOpen] = React.useState(false);
  const [opening, setOpening] = React.useState(false);

  const reload = React.useCallback(async () => {
    if (!token) {
      setState(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const s = await getDailyBonusState(token);
      if (s?.ok) setState(s as any);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  React.useEffect(() => {
    reload();
  }, [reload]);

  // si AuthProvider fait un claim et dispatch un event, on refresh state
  React.useEffect(() => {
    const onAny = (ev: any) => {
      const detail = ev?.detail;
      if (detail?.state?.ok) setState(detail.state);
      else reload();
    };
    window.addEventListener("dailyBonus:result", onAny as any);
    return () => window.removeEventListener("dailyBonus:result", onAny as any);
  }, [reload]);

  const openAgenda = React.useCallback(async () => {
    if (!token) return;

    // si on a déjà le state -> open direct
    if (state?.ok) {
      setOpen(true);
      return;
    }

    // sinon on fetch puis open (pour éviter un modal vide)
    setOpening(true);
    try {
      const s = await getDailyBonusState(token);
      if (s?.ok) setState(s as any);
      setOpen(true);
    } catch (e) {
      console.error(e);
      // même si ça fail, on peut ouvrir un modal "erreur" plus tard
      // pour l’instant: on n’ouvre pas
    } finally {
      setOpening(false);
    }
  }, [token, state]);

  return (
    <div className="panel" style={{ marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div className="panelTitle" style={{ marginBottom: 0 }}>
            Bonus quotidien
          </div>
          <div className="mutedSmall" style={{ opacity: 0.8 }}>
            {token ? (loading ? "Chargement…" : "Agenda hebdo + paliers mensuels") : "Connecte-toi pour voir l’agenda"}
          </div>
        </div>

        {/* ✅ Toujours cliquable si connecté (même si déjà claim / tout grisé) */}
        <button
          type="button"
          className="btnPrimarySmall"
          onClick={openAgenda}
          disabled={!token || opening}
          title={!token ? "Connecte-toi pour accéder à l’agenda" : undefined}
        >
          {opening ? "…" : "Ouvrir"}
        </button>
      </div>

      {/* Preview seulement si state chargé */}
      {token && state?.ok ? (
        <>
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {state.week.map((d) => (
              <div
                key={d.date}
                style={smallCellStyle(d.status)}
                onClick={() => {
                  // Preview = ouvre l’agenda (pas de claim direct ici)
                  openAgenda();
                }}
                title="Ouvrir l’agenda"
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontWeight: 950 }}>{d.label}</div>
                  <div className="mutedSmall" style={{ opacity: 0.75 }}>
                    {d.status === "claimed" || d.status === "today_claimed" ? "✓" : d.status === "missed" ? "×" : ""}
                  </div>
                </div>
                <div style={{ fontWeight: 900 }}>{rewardShort(d.reward)}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {state.milestones.map((m) => {
              const claimable = m.status === "claimable";
              return (
                <div
                  key={m.milestone}
                  onClick={openAgenda}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 999,
                    border: claimable ? "1px solid rgba(255,255,255,0.25)" : "1px solid rgba(255,255,255,0.10)",
                    background: claimable ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.05)",
                    boxShadow: claimable
                      ? "0 0 0 1px rgba(180,140,255,0.35), 0 0 18px rgba(140,120,255,0.25)"
                      : "none",
                    fontSize: 12,
                    fontWeight: 900,
                    opacity: m.status === "locked" ? 0.55 : 0.9,
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                  title="Ouvrir l’agenda"
                >
                  {m.milestone}j {m.status === "claimed" ? "✓" : m.status === "claimable" ? "★" : "🔒"}
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      {open && state?.ok ? (
        <DailyBonusAgendaModal state={state} onState={(s) => setState(s)} onClose={() => setOpen(false)} />
      ) : null}
    </div>
  );
}
