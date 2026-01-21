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
  tokens?: { wheel_ticket?: number; prestige_token?: number };
};

function rewardLabel(r: WeekDay["reward"]) {
  if (r.type === "rubis") return `💎 ${r.amount}`;
  return `🎡 x${r.amount}`;
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

function dayBadge(status: WeekDay["status"]) {
  if (status === "claimed" || status === "today_claimed") return "✓";
  if (status === "missed") return "×";
  return "";
}

function statusPill(status: WeekDay["status"]) {
  if (status === "today_claimable") return { label: "À récupérer", kind: "cta" as const };
  if (status === "today_claimed") return { label: "Déjà récupéré", kind: "ok" as const };
  if (status === "claimed") return { label: "Récupéré", kind: "ok" as const };
  if (status === "missed") return { label: "Manqué", kind: "bad" as const };
  return { label: "À venir", kind: "muted" as const };
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

  // toast interne
  const [toast, setToast] = React.useState<string | null>(null);
  const toastTimer = React.useRef<number | null>(null);

  const tokensAny = (state as any)?.tokens ?? {};
  const wheelTickets = Number(tokensAny?.wheel_ticket ?? 0);
  const prestigeTokens = Number(tokensAny?.prestige_token ?? 0);

  const week = Array.isArray((state as any)?.week) ? (state as any).week : [];
  const milestones = Array.isArray((state as any)?.milestones) ? (state as any).milestones : [];

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
      showToast(r?.granted?.length ? toastTextFromGranted(r.granted) : `Palier ${m} jours récupéré ✅`);
    } catch (e: any) {
      showToast(String(e?.message || "Erreur"));
    } finally {
      setBusy(null);
    }
  }

  // ESC
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
      className="llBonusOverlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <style>{`
        .llBonusOverlay{
          position: fixed;
          inset: 0;
          z-index: 2147483647;
          display: grid;
          place-items: center;
          padding: 16px;
          background: rgba(0,0,0,0.78);
          backdrop-filter: blur(8px);
        }

        .llBonusToast{
          position: fixed;
          top: 18px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 2147483647;
          padding: 10px 14px;
          border-radius: 999px;
          background: rgba(15,15,24,0.92);
          border: 1px solid rgba(255,255,255,0.14);
          box-shadow: 0 18px 60px rgba(0,0,0,0.55);
          font-weight: 950;
          font-size: 13px;
          color: rgba(255,255,255,0.92);
        }

        .llBonusModal{
          width: min(980px, 96vw);
          max-height: min(780px, 90vh);
          overflow: hidden;
          display: grid;
          grid-template-columns: 260px 1fr;
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,0.12);
          background:
            radial-gradient(520px 260px at 10% 0%, rgba(124,77,255,0.18), rgba(0,0,0,0) 60%),
            rgba(10,10,14,0.96);
          box-shadow: 0 26px 90px rgba(0,0,0,0.60);
        }

        @media (max-width: 840px){
          .llBonusModal{
            grid-template-columns: 1fr;
            max-height: 92vh;
          }
        }

        .llBonusSide{
          border-right: 1px solid rgba(255,255,255,0.08);
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(0,0,0,0.18));
        }

        @media (max-width: 840px){
          .llBonusSide{
            border-right: none;
            border-bottom: 1px solid rgba(255,255,255,0.08);
          }
        }

        .llBonusSideTop{
          display:flex;
          align-items:center;
          justify-content: space-between;
          gap: 10px;
        }
        .llBonusTitle{
          font-weight: 1100;
          letter-spacing: -0.2px;
          font-size: 14px;
          color: rgba(255,255,255,0.92);
        }
        .llBonusClose{
          border-radius: 14px;
          padding: 8px 10px;
          font-weight: 950;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.18);
          color: rgba(255,255,255,0.86);
          cursor: pointer;
          transition: transform .08s ease, border-color .12s ease, background .12s ease, box-shadow .12s ease;
        }
        .llBonusClose:hover{
          transform: translateY(-1px);
          border-color: rgba(255,255,255,0.16);
          background: rgba(255,255,255,0.06);
        }
        .llBonusClose:focus-visible{
          outline: none;
          box-shadow: 0 0 0 2px rgba(124,77,255,0.16);
          border-color: rgba(124,77,255,0.55);
        }

        .llBonusTabs{
          display: grid;
          gap: 8px;
        }
        .llBonusTab{
          width: 100%;
          text-align: left;
          border-radius: 16px;
          padding: 10px 12px;
          font-weight: 950;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.14);
          color: rgba(255,255,255,0.86);
          cursor: pointer;
          transition: transform .08s ease, border-color .12s ease, background .12s ease, box-shadow .12s ease;
        }
        .llBonusTab:hover{
          transform: translateY(-1px);
          border-color: rgba(255,255,255,0.16);
          background: rgba(255,255,255,0.05);
        }
        .llBonusTab.isActive{
          border-color: rgba(124,77,255,0.55);
          background: rgba(124,77,255,0.14);
          box-shadow: 0 0 0 2px rgba(124,77,255,0.10);
        }
        .llBonusTab.isSoon{
          opacity: 0.7;
          cursor: not-allowed;
        }

        .llBonusMeta{
          margin-top: 4px;
          padding: 12px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(0,0,0,0.14);
          color: rgba(255,255,255,0.70);
          font-size: 12px;
          line-height: 1.55;
        }
        .llBonusMeta strong{
          color: rgba(255,255,255,0.92);
          font-weight: 950;
        }

        .llBonusBody{
          padding: 14px;
          overflow: auto;
        }

        .llBonusHeadRow{
          display:flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }
        .llBonusH1{
          font-weight: 1100;
          letter-spacing: -0.2px;
          font-size: 16px;
          color: rgba(255,255,255,0.92);
        }
        .llBonusSub{
          font-size: 12px;
          color: rgba(255,255,255,0.62);
        }

        .llBonusWeekGrid{
          margin-top: 12px;
          display: grid;
          gap: 10px;
          grid-template-columns: repeat(4, 1fr);
        }
        @media (max-width: 980px){
          .llBonusWeekGrid{ grid-template-columns: repeat(3, 1fr); }
        }
        @media (max-width: 720px){
          .llBonusWeekGrid{ grid-template-columns: repeat(2, 1fr); }
        }

        .llBonusDay{
          position: relative;
          padding: 12px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.10);
          background:
            radial-gradient(180px 90px at 18% 0%, rgba(255,255,255,0.06), rgba(0,0,0,0) 62%),
            rgba(0,0,0,0.16);
          color: rgba(255,255,255,0.88);
          text-align: left;
          user-select: none;
          transition: transform .10s ease, border-color .14s ease, background .14s ease, box-shadow .14s ease;
          cursor: default;
        }

        .llBonusDayTop{
          display:flex;
          justify-content: space-between;
          gap: 10px;
          align-items: center;
        }
        .llBonusDayLabel{
          font-weight: 1050;
          letter-spacing: -0.2px;
          font-size: 13px;
          color: rgba(255,255,255,0.92);
        }
        .llBonusDayMark{
          font-weight: 1100;
          opacity: 0.75;
        }

        .llBonusReward{
          margin-top: 10px;
          font-weight: 1100;
          font-size: 18px;
          letter-spacing: -0.2px;
          line-height: 1.1;
        }
        .llBonusDate{
          margin-top: 6px;
          font-size: 12px;
          color: rgba(255,255,255,0.62);
        }

        .llBonusPill{
          margin-top: 10px;
          display:inline-flex;
          align-items:center;
          gap: 8px;
          padding: 7px 10px;
          border-radius: 999px;
          font-weight: 950;
          font-size: 12px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.14);
          color: rgba(255,255,255,0.80);
          white-space: nowrap;
        }
        .llBonusPill.ok{
          border-color: rgba(60, 240, 180, 0.26);
          background: rgba(60, 240, 180, 0.10);
          color: rgba(230,255,248,0.92);
        }
        .llBonusPill.bad{
          border-color: rgba(255,90,90,0.24);
          background: rgba(255,90,90,0.10);
          color: rgba(255,210,210,0.92);
        }
        .llBonusPill.cta{
          border-color: rgba(124,77,255,0.55);
          background: rgba(124,77,255,0.16);
          color: rgba(255,255,255,0.92);
          box-shadow: 0 0 0 2px rgba(124,77,255,0.10);
        }

        .llBonusDay.isClickable{
          cursor: pointer;
          border-color: rgba(255,255,255,0.18);
        }
        .llBonusDay.isClickable:hover{
          transform: translateY(-1px);
          border-color: rgba(124,77,255,0.45);
          background:
            radial-gradient(180px 90px at 18% 0%, rgba(124,77,255,0.16), rgba(0,0,0,0) 62%),
            rgba(255,255,255,0.05);
          box-shadow: 0 16px 44px rgba(0,0,0,0.28);
        }
        .llBonusDay.isClickable:focus-visible{
          outline: none;
          box-shadow:
            0 0 0 2px rgba(124,77,255,0.18),
            0 16px 44px rgba(0,0,0,0.28);
          border-color: rgba(124,77,255,0.60);
        }

        .llBonusDay.isDim{ opacity: 0.72; }
        .llBonusDay.isMissed{ opacity: 0.55; filter: grayscale(1); }

        .llBonusPanel{
          margin-top: 12px;
          padding: 12px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(0,0,0,0.14);
        }

        .llBonusMilestonesRow{
          margin-top: 10px;
          display:flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .llBonusMilestone{
          display:inline-flex;
          align-items:center;
          gap: 8px;
          padding: 10px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.14);
          font-size: 12px;
          font-weight: 950;
          color: rgba(255,255,255,0.86);
          user-select: none;
          cursor: default;
          transition: transform .10s ease, border-color .14s ease, background .14s ease, box-shadow .14s ease;
        }
        .llBonusMilestone.isLocked{ opacity: 0.55; filter: grayscale(1); }
        .llBonusMilestone.isClaimed{ opacity: 0.75; }
        .llBonusMilestone.isClaimable{
          cursor: pointer;
          border-color: rgba(255,255,255,0.18);
        }
        .llBonusMilestone.isClaimable:hover{
          transform: translateY(-1px);
          border-color: rgba(124,77,255,0.55);
          background: rgba(124,77,255,0.14);
          box-shadow: 0 16px 44px rgba(0,0,0,0.26);
        }
        .llBonusMilestone.isClaimable:focus-visible{
          outline: none;
          box-shadow: 0 0 0 2px rgba(124,77,255,0.18);
          border-color: rgba(124,77,255,0.60);
        }

        @media (prefers-reduced-motion: reduce){
          .llBonusDay, .llBonusMilestone, .llBonusTab, .llBonusClose{
            transition: border-color .12s ease, background .12s ease, box-shadow .12s ease;
          }
          .llBonusDay:hover, .llBonusMilestone:hover, .llBonusTab:hover, .llBonusClose:hover{
            transform: none;
          }
        }
      `}</style>

      {toast ? <div className="llBonusToast">{toast}</div> : null}

      <div className="llBonusModal">
        {/* Sidebar */}
        <div className="llBonusSide">
          <div className="llBonusSideTop">
            <div className="llBonusTitle">Bonus</div>
              <button
                type="button"
                className="llBonusClose"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onClose();
                }}
              >
                ✕
              </button>
          </div>

          <div className="llBonusTabs">
            <button
              type="button"
              className={`llBonusTab ${tab === "agenda" ? "isActive" : ""}`}
              onClick={() => setTab("agenda")}
            >
              Bonus quotidien
            </button>

            <button
              type="button"
              className={`llBonusTab ${tab === "infos" ? "isActive" : ""}`}
              onClick={() => setTab("infos")}
            >
              Informations
            </button>

            <button type="button" className="llBonusTab isSoon" onClick={() => {}} title="Bientôt">
              Événements (bientôt)
            </button>
          </div>

          <div className="llBonusMeta">
            Aujourd’hui: <strong>{state.day}</strong>
            <br />
            Jours claimés ce mois: <strong>{state.monthClaimedDays}</strong>
            <br />
            Tickets roue: <strong>{wheelTickets}</strong>
            <br />
            Prestige: <strong>{prestigeTokens}</strong>
          </div>
        </div>

        {/* Content */}
        <div className="llBonusBody">
          {tab === "agenda" ? (
            <>
              <div className="llBonusHeadRow">
                <div className="llBonusH1">Agenda hebdo</div>
                <div className="llBonusSub"></div>
              </div>

              <div className="llBonusWeekGrid">
                {week.map((d: any) => {
                  const clickable = d.status === "today_claimable" && !busy;
                  const pill = statusPill(d.status);

                  return (
                    <div
                      key={d.date}
                      role={clickable ? "button" : undefined}
                      tabIndex={clickable ? 0 : -1}
                      className={[
                        "llBonusDay",
                        clickable ? "isClickable" : "",
                        d.status === "missed" ? "isMissed" : "",
                        d.status === "future" || d.status === "claimed" || d.status === "today_claimed" ? "isDim" : "",
                      ].join(" ")}
                      onClick={() => {
                        if (d.status === "today_claimable" && !busy) claimToday();
                      }}
                      onKeyDown={(e) => {
                        if (!clickable) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          claimToday();
                        }
                      }}
                      title={d.status === "today_claimable" ? "Cliquer pour récupérer" : undefined}
                    >
                      <div className="llBonusDayTop">
                        <div className="llBonusDayLabel">{d.label}</div>
                        <div className="llBonusDayMark">{dayBadge(d.status)}</div>
                      </div>

                      <div className="llBonusReward">{rewardLabel(d.reward)}</div>
                      <div className="llBonusDate">{d.date}</div>

                      <div className={`llBonusPill ${pill.kind}`}>
                        {pill.kind === "cta" && busy === "today" ? "Récupération…" : pill.label}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="llBonusPanel">
                <div className="llBonusSub" style={{ opacity: 0.85 }}>
                </div>

                <div className="llBonusMilestonesRow">
                  {milestones.map((m: any) => {
                    const isClaimable = m.status === "claimable" && !busy;
                    const cls =
                      m.status === "locked"
                        ? "isLocked"
                        : m.status === "claimed"
                        ? "isClaimed"
                        : "isClaimable";

                    const right =
                      m.status === "claimed"
                        ? "✓"
                        : m.status === "claimable"
                        ? busy === `m${m.milestone}`
                          ? "…"
                          : "★"
                        : "🔒";

                    return (
                      <div
                        key={m.milestone}
                        role={isClaimable ? "button" : undefined}
                        tabIndex={isClaimable ? 0 : -1}
                        className={`llBonusMilestone ${cls}`}
                        onClick={() => {
                          if (m.status === "claimable" && !busy) claimMilestone(m.milestone);
                        }}
                        onKeyDown={(e) => {
                          if (!isClaimable) return;
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            claimMilestone(m.milestone);
                          }
                        }}
                        title={m.status === "claimable" ? "Cliquer pour récupérer" : undefined}
                      >
                        <span>{m.milestone} jours</span>
                        <span style={{ opacity: 0.85 }}>{right}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="llBonusSub" style={{ marginTop: 10, opacity: 0.85, lineHeight: 1.55 }}>
                  • 20j = Skin (unique, sinon +20 rubis)
                  <br />
                  • 30j = Titre (unique, sinon +1 jeton prestige)
                </div>
              </div>
            </>
          ) : null}

          {tab === "infos" ? (
            <>
              <div className="llBonusHeadRow">
                <div className="llBonusH1">Informations</div>
              </div>

              <div className="llBonusPanel" style={{ marginTop: 12 }}>
                <div className="llBonusSub" style={{ opacity: 0.92, lineHeight: 1.65 }}>
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
              <div className="llBonusHeadRow">
                <div className="llBonusH1">Événements</div>
              </div>

              <div className="llBonusPanel" style={{ marginTop: 12 }}>
                <div className="llBonusSub" style={{ opacity: 0.92 }}>
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
