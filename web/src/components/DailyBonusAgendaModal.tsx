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

function toastTextFromGranted(granted: any[] | null | undefined) {
  const arr = Array.isArray(granted) ? granted : [];
  if (!arr.length) return "Récompense récupérée ✅";

  let rubis = 0;
  let wheel = 0;
  let prestige = 0;
  let uniqSkin = 0;
  let uniqTitle = 0;

  for (const g of arr) {
    if (!g) continue;

    if (g.type === "rubis" && Number.isFinite(Number(g.amount))) {
      rubis += Number(g.amount);
      continue;
    }

    if (g.type === "token" && Number.isFinite(Number(g.amount))) {
      const t = String(g.token || "");
      if (t === "wheel_ticket") wheel += Number(g.amount);
      else if (t === "prestige_token") prestige += Number(g.amount);
      continue;
    }

    // (optionnel) uniques plus tard
    const kind = String(g.kind || g.unique || "");
    if (kind === "skin") uniqSkin += 1;
    if (kind === "title") uniqTitle += 1;
  }

  const parts: string[] = [];
  if (rubis > 0) parts.push(`+${rubis} rubis`);
  if (wheel > 0) parts.push(`+${wheel} ticket(s) roue`);
  if (prestige > 0) parts.push(`+${prestige} jeton(s) prestige`);
  if (uniqSkin > 0) parts.push(`Skin débloqué`);
  if (uniqTitle > 0) parts.push(`Titre débloqué`);

  return parts.length ? `${parts.join(" • ")} ✅` : "Récompense récupérée ✅";
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

  // ✅ mini toast interne (ne masque pas le calendrier)
  const [toast, setToast] = React.useState<string | null>(null);
  const toastTimer = React.useRef<number | null>(null);

  const showToast = React.useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
  }, []);

  React.useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  async function claimToday() {
    if (!token) return;
    setBusy("today");
    try {
      const r: any = await claimDailyBonusToday(token);

      if (r?.state?.ok) onState(r.state);
      await refreshMe();

      // ✅ FIX TS: on utilise r.granted
      showToast(toastTextFromGranted(r?.granted));
    } catch (e: any) {
      showToast(String(e?.message || "Erreur"));
    } finally {
      setBusy(null);
    }
  }

  async function claimMilestone(m: 5 | 10 | 20 | 30) {
    if (!token) return;
    setBusy(`m${m}`);
    try {
      const r: any = await claimDailyBonusMilestone(token, m);

      if (r?.state?.ok) onState(r.state);
      await refreshMe();

      // ✅ pareil: toast basé sur granted si présent
      showToast(r?.granted?.length ? toastTextFromGranted(r.granted) : `Palier ${m} jours récupéré ✅`);
    } catch (e: any) {
      showToast(String(e?.message || "Erreur"));
    } finally {
      setBusy(null);
    }
  }

  // ✅ ESC pour fermer
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
        background: "rgba(0,0,0,0.78)",
        backdropFilter: "blur(6px)",
        display: "grid",
        placeItems: "center",
        zIndex: 2147483647,
        padding: 16,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* ✅ Toast discret */}
      {toast ? (
        <div
          style={{
            position: "fixed",
            top: 18,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 2147483647,
            padding: "10px 14px",
            borderRadius: 999,
            background: "rgba(15,15,24,0.92)",
            border: "1px solid rgba(255,255,255,0.14)",
            boxShadow: "0 18px 60px rgba(0,0,0,0.55)",
            fontWeight: 900,
            fontSize: 13,
            letterSpacing: 0.2,
          }}
        >
          {toast}
        </div>
      ) : null}

        <div
        style={{
            width: "min(920px, 96vw)",
            maxHeight: "min(760px, 90vh)",
            overflow: "hidden",
            display: "grid",
            gridTemplateColumns: "240px 1fr",
            gap: 0,
            padding: 0,

            // ✅ OPAQUE
            background: "#0b0b10",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 18,
            boxShadow: "0 18px 60px rgba(0,0,0,0.60)",
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

          <div className="mutedSmall" style={{ opacity: 0.85 }}>
            Aujourd’hui: <strong style={{ color: "rgba(255,255,255,0.9)" }}>{state.day}</strong>
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

              <div className="panel" style={{ marginTop: 12, background: "rgba(255,255,255,0.03)" }}>
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

                <div className="mutedSmall" style={{ marginTop: 10, opacity: 0.85, lineHeight: 1.5 }}>
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
              <div className="panel" style={{ marginTop: 12, background: "rgba(255,255,255,0.03)" }}>
                <div className="mutedSmall" style={{ opacity: 0.9, lineHeight: 1.55 }}>
                  • 1 récupération par jour (timezone Europe/Paris).
                  <br />
                  • Cycle hebdo : Lun 3 / Mar 3 / Mer 🎡 / Jeu 5 / Ven 5 / Sam 🎡 / Dim 10.
                  <br />
                  • Les paliers 5/10/20/30 = nombre de jours claimés dans le mois (pas forcément en streak).
                  <br />
                  • Skins/titres seront visibles plus tard (shop/collections).
                </div>
              </div>
            </>
          ) : null}

          {tab === "event" ? (
            <>
              <div className="panelTitle">Événements</div>
              <div className="panel" style={{ marginTop: 12, background: "rgba(255,255,255,0.03)" }}>
                <div className="mutedSmall" style={{ opacity: 0.9 }}>
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
