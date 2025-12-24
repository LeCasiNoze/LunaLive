import * as React from "react";
import { createPortal } from "react-dom";
import { claimDailyBonusToday, claimDailyBonusMilestone } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";

type WeekDay = {
  isodow: number;
  label: string;
  date: string;
  reward:
    | { type: "rubis"; amount: number; origin: string; weight_bp: number }
    | { type: "token"; token: "wheel_ticket"; amount: number };
  status: "future" | "missed" | "claimed" | "today_claimable" | "today_claimed";
};

type Milestone = { milestone: 5 | 10 | 20 | 30; status: "locked" | "claimable" | "claimed" };

export type DailyBonusState = {
  ok: true;
  day: string;
  weekStart: string;
  monthStart: string;
  monthClaimedDays: number;
  todayClaimed: boolean;
  week: WeekDay[];
  milestones: Milestone[];
  tokens: { wheel_ticket: number; prestige_token: number };
};

function rewardLabel(r: WeekDay["reward"]) {
  if (r.type === "rubis") return `💎 ${r.amount}`;
  return `🎡 x${r.amount}`;
}

function cellStyle(status: WeekDay["status"]) {
  const base: React.CSSProperties = {
    padding: "10px 10px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.05)",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    cursor: "default",
    userSelect: "none",
  };

  const greyed =
    status === "future" || status === "missed" || status === "claimed" || status === "today_claimed";

  const clickable = status === "today_claimable";

  if (greyed) {
    return {
      ...base,
      opacity: status === "missed" ? 0.55 : 0.75,
      filter: status === "missed" ? "grayscale(1)" : "none",
    };
  }

  if (clickable) {
    return {
      ...base,
      cursor: "pointer",
      border: "1px solid rgba(255,255,255,0.25)",
      boxShadow: "0 0 0 1px rgba(180,140,255,0.35), 0 0 18px rgba(140,120,255,0.25)",
      background: "rgba(255,255,255,0.07)",
    };
  }

  return base;
}

function milestoneStyle(status: Milestone["status"]) {
  const base: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.05)",
    fontSize: 12,
    fontWeight: 900,
    cursor: "default",
    userSelect: "none",
  };

  if (status === "claimed") return { ...base, opacity: 0.75 };
  if (status === "locked") return { ...base, opacity: 0.55, filter: "grayscale(1)" };

  return {
    ...base,
    cursor: "pointer",
    border: "1px solid rgba(255,255,255,0.25)",
    boxShadow: "0 0 0 1px rgba(180,140,255,0.35), 0 0 18px rgba(140,120,255,0.25)",
    background: "rgba(255,255,255,0.07)",
  };
}

export function DailyBonusAgendaModal({
  state,
  onClose,
  onState,
}: {
  state: DailyBonusState;
  onClose: () => void;
  onState: (s: DailyBonusState) => void;
}) {
  const auth = useAuth() as any;
  const token = auth?.token ?? null;
  const refreshMe = auth?.refreshMe ?? (async () => {});

  const [tab, setTab] = React.useState<"agenda" | "infos" | "event">("agenda");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);

  async function claimToday() {
    if (!token) return;
    setMsg(null);
    setBusy("today");
    try {
      const r = await claimDailyBonusToday(token);
      if (r?.state?.ok) onState(r.state);
      await refreshMe();
      setMsg("Bonus du jour récupéré ✅");
    } catch (e: any) {
      setMsg(String(e?.message || "Erreur"));
    } finally {
      setBusy(null);
    }
  }

  async function claimMilestone(m: 5 | 10 | 20 | 30) {
    if (!token) return;
    setMsg(null);
    setBusy(`m${m}`);
    try {
      const r = await claimDailyBonusMilestone(token, m);
      if (r?.state?.ok) onState(r.state);
      await refreshMe();
      setMsg(`Palier ${m} jours récupéré ✅`);
    } catch (e: any) {
      setMsg(String(e?.message || "Erreur"));
    } finally {
      setBusy(null);
    }
  }

  // ✅ Escape pour fermer
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "grid",
        placeItems: "center",
        zIndex: 2147483647, // ✅ au-dessus de tout
        padding: 16,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="panel"
        style={{
          width: "min(920px, 96vw)",
          maxHeight: "min(760px, 90vh)",
          overflow: "hidden",
          display: "grid",
          gridTemplateColumns: "240px 1fr",
          gap: 0,
          padding: 0,
        }}
      >
        {/* Sidebar */}
        <div
          style={{
            borderRight: "1px solid rgba(255,255,255,0.08)",
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 950 }}>Bonus</div>
            <button type="button" className="btnPrimarySmall" onClick={onClose} style={{ padding: "6px 10px" }}>
              ✕
            </button>
          </div>

          <button
            type="button"
            className={tab === "agenda" ? "btnPrimarySmall" : "btnSmall"}
            onClick={() => setTab("agenda")}
            style={{ justifyContent: "flex-start" as any }}
          >
            Chemin du retour
          </button>

          <button
            type="button"
            className={tab === "infos" ? "btnPrimarySmall" : "btnSmall"}
            onClick={() => setTab("infos")}
            style={{ justifyContent: "flex-start" as any }}
          >
            Informations
          </button>

          <button
            type="button"
            className={tab === "event" ? "btnPrimarySmall" : "btnSmall"}
            onClick={() => setTab("event")}
            style={{ justifyContent: "flex-start" as any, opacity: 0.75 }}
            title="Bientôt"
          >
            Événements (bientôt)
          </button>

          <div className="mutedSmall" style={{ opacity: 0.8 }}>
            Aujourd’hui:{" "}
            <strong style={{ color: "rgba(255,255,255,0.9)" }}>{state.day}</strong>
            <br />
            Jours claimés ce mois:{" "}
            <strong style={{ color: "rgba(255,255,255,0.9)" }}>{state.monthClaimedDays}</strong>
            <br />
            Tickets roue:{" "}
            <strong style={{ color: "rgba(255,255,255,0.9)" }}>{state.tokens.wheel_ticket}</strong>
            <br />
            Prestige:{" "}
            <strong style={{ color: "rgba(255,255,255,0.9)" }}>{state.tokens.prestige_token}</strong>
          </div>

          {msg ? (
            <div className="mutedSmall" style={{ color: "rgba(180,255,180,0.95)" }}>
              {msg}
            </div>
          ) : null}
        </div>

        {/* Content */}
        <div style={{ padding: 14, overflow: "auto" }}>
          {tab === "agenda" ? (
            <>
              <div className="panelTitle">Agenda hebdo</div>
              <div className="mutedSmall" style={{ opacity: 0.85, marginTop: 4 }}>
                Gris = futur / déjà pris / raté • Bordure = récupérable
              </div>

              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                {state.week.map((d) => (
                  <div
                    key={d.date}
                    style={cellStyle(d.status)}
                    onClick={() => {
                      if (d.status === "today_claimable" && !busy) claimToday();
                    }}
                    title={d.status === "today_claimable" ? "Cliquer pour récupérer" : undefined}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontWeight: 950 }}>{d.label}</div>
                      <div className="mutedSmall" style={{ opacity: 0.75 }}>
                        {d.status === "claimed" || d.status === "today_claimed"
                          ? "✓"
                          : d.status === "missed"
                            ? "×"
                            : ""}
                      </div>
                    </div>
                    <div style={{ fontWeight: 900, fontSize: 14 }}>{rewardLabel(d.reward)}</div>
                    <div className="mutedSmall" style={{ opacity: 0.75 }}>
                      {d.date}
                    </div>

                    {d.status === "today_claimable" ? (
                      <div className="mutedSmall" style={{ opacity: 0.9 }}>
                        {busy === "today" ? "Récupération…" : "Récupérer"}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="panel" style={{ marginTop: 12 }}>
                <div className="mutedSmall" style={{ marginBottom: 10 }}>
                  Paliers mensuels (5 / 10 / 20 / 30)
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {state.milestones.map((m) => (
                    <div
                      key={m.milestone}
                      style={milestoneStyle(m.status)}
                      onClick={() => {
                        if (m.status === "claimable" && !busy) claimMilestone(m.milestone);
                      }}
                      title={m.status === "claimable" ? "Cliquer pour récupérer" : undefined}
                    >
                      {m.milestone} jours{" "}
                      {m.status === "claimed"
                        ? "✓"
                        : m.status === "claimable"
                          ? busy === `m${m.milestone}`
                            ? "…"
                            : "★"
                          : "🔒"}
                    </div>
                  ))}
                </div>

                <div className="mutedSmall" style={{ marginTop: 10, opacity: 0.8, lineHeight: 1.5 }}>
                  • 20j = Skin (unique, sinon +20 rubis)
                  <br />
                  • 30j = Titre (unique, sinon +1 jeton prestige)
                </div>
              </div>
            </>
          ) : null}

          {tab === "infos" ? (
            <>
              <div className="panelTitle">Informations</div>
              <div className="panel" style={{ marginTop: 12 }}>
                <div className="mutedSmall" style={{ opacity: 0.85, lineHeight: 1.55 }}>
                  • 1 récupération par jour (timezone Europe/Paris).
                  <br />
                  • Cycle hebdo qui se répète : Lun 3 / Mar 3 / Mer 🎡 / Jeu 5 / Ven 5 / Sam 🎡 / Dim 10.
                  <br />
                  • Les paliers 5/10/20/30 se débloquent selon le nombre de jours claimés dans le mois (pas forcément en streak).
                  <br />
                  • Skins/titres seront visibles plus tard (shop/collections). Pour l’instant, on les stocke comme récompenses.
                </div>
              </div>
            </>
          ) : null}

          {tab === "event" ? (
            <>
              <div className="panelTitle">Événements</div>
              <div className="panel" style={{ marginTop: 12 }}>
                <div className="mutedSmall" style={{ opacity: 0.85 }}>
                  Onglet réservé pour plus tard (events, annonces, promos, etc.).
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
