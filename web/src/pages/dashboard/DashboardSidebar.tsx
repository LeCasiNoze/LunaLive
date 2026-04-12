// web/src/components/dashboard/DashboardSidebar.tsx
import type { ApiMyStreamer } from "../../lib/api";

export type DashboardTab =
  | "overview"
  | "agency"
  | "lunabot"
  | "stream"
  | "moderation"
  | "appearance"
  | "emotes"
  | "earnings"
  | "stats"
  | "settings";

const ICONS: Record<DashboardTab, string> = {
  overview: "OV",
  agency: "AG",
  lunabot: "LB",
  stream: "ST",
  moderation: "MD",
  appearance: "AP",
  emotes: "EM",
  earnings: "RV",
  stats: "ST",
  settings: "CFG",
};

export function DashboardSidebar({
  tab,
  setTab,
  streamer,
}: {
  tab: DashboardTab;
  setTab: (t: DashboardTab) => void;
  streamer: ApiMyStreamer;
}) {
  const items: { id: DashboardTab; label: string; hint?: string }[] = [
    { id: "overview", label: "Vue d'ensemble", hint: "Resume + liaison DLive" },
    { id: "agency", label: "Agence", hint: "Subaffiliation - stats - gains" },
    { id: "lunabot", label: "LunaBot", hint: "Commandes - auto-messages - logs" },
    { id: "stream", label: "Stream", hint: "Titre + cles RTMP" },
    { id: "moderation", label: "Moderation", hint: "Modos - bans - regles chat" },
    { id: "appearance", label: "Apparence", hint: "Offline + chat + skins" },
    { id: "emotes", label: "Emojis & GIFs", hint: "Ajouter - supprimer - limites" },
    { id: "earnings", label: "Revenus", hint: "Solde - repartition - cashout" },
    { id: "stats", label: "Stats", hint: "Analytics / periodes" },
    { id: "settings", label: "Parametres" },
  ];

  return (
    <aside style={{ width: "100%" }}>
      <style>{`
        .llDashSideHead{
          padding: 12px 12px 10px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }
        .llDashSideTitle{
          display:flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 10px;
        }
        .llDashSideTitle b{
          font-weight: 1100;
          letter-spacing: -0.2px;
          color: rgba(255,255,255,0.92);
        }
        .llDashSlug{
          opacity: 0.75;
          font-size: 12px;
          font-weight: 900;
          color: rgba(255,255,255,0.72);
        }

        .llDashSideList{
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .llDashItem{
          width: 100%;
          text-align: left;
          cursor: pointer;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.10);
          background:
            radial-gradient(140px 90px at 18% 0%, rgba(255,255,255,0.06), rgba(0,0,0,0) 60%),
            rgba(0,0,0,0.22);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          padding: 11px 12px;
          display:flex;
          gap: 10px;
          align-items:flex-start;
          color: rgba(255,255,255,0.88);
          transition: transform .08s ease, background .12s ease, border-color .12s ease, box-shadow .12s ease;
          outline: none;
        }
        .llDashItem:hover{
          transform: translateY(-1px);
          background:
            radial-gradient(140px 90px at 18% 0%, rgba(255,255,255,0.09), rgba(0,0,0,0) 60%),
            rgba(255,255,255,0.06);
          border-color: rgba(255,255,255,0.16);
          box-shadow: 0 10px 24px rgba(0,0,0,0.22);
        }
        .llDashItem:active{
          transform: translateY(0px);
        }
        .llDashItem:focus-visible{
          box-shadow:
            0 0 0 2px rgba(124,77,255,0.22),
            0 10px 24px rgba(0,0,0,0.22);
          border-color: rgba(124,77,255,0.45);
        }

        .llDashItemActive{
          background:
            radial-gradient(160px 110px at 18% 0%, rgba(124,77,255,0.30), rgba(0,0,0,0) 62%),
            linear-gradient(180deg, rgba(124,77,255,0.16), rgba(124,77,255,0.10));
          border-color: rgba(124,77,255,0.55);
          box-shadow:
            0 0 0 2px rgba(124,77,255,0.12),
            0 14px 30px rgba(0,0,0,0.26);
          color: rgba(255,255,255,0.92);
        }

        .llDashIcon{
          width: 30px;
          height: 30px;
          border-radius: 14px;
          display:grid;
          place-items:center;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.06);
          flex: 0 0 30px;
          font-size: 11px;
          font-weight: 900;
          box-shadow: inset 0 -8px 16px rgba(0,0,0,0.20);
        }
        .llDashItemActive .llDashIcon{
          border-color: rgba(124,77,255,0.50);
          background: rgba(124,77,255,0.22);
        }

        .llDashItemMain{
          min-width: 0;
          display:flex;
          flex-direction: column;
          gap: 2px;
        }
        .llDashLabel{
          font-weight: 1100;
          letter-spacing: -0.2px;
          font-size: 14px;
          line-height: 1.2;
          color: rgba(255,255,255,0.92);
          text-shadow: 0 1px 0 rgba(0,0,0,0.20);
        }
        .llDashHint{
          font-size: 12px;
          line-height: 1.25;
          color: rgba(255,255,255,0.64);
          opacity: 1;
        }

        @media (prefers-reduced-motion: reduce){
          .llDashItem{ transition: background .12s ease, border-color .12s ease, box-shadow .12s ease; }
          .llDashItem:hover{ transform: none; }
        }
      `}</style>

      <div className="llDashSideHead">
        <div className="llDashSideTitle">
          <b>Dashboard</b>
          <span className="llDashSlug">@{streamer.slug}</span>
        </div>
        <div className="llDashHint" style={{ marginTop: 6 }}>
          Navigation streamer
        </div>
      </div>

      <div className="llDashSideList">
        {items.map((it) => {
          const active = it.id === tab;
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => setTab(it.id)}
              className={`llDashItem ${active ? "llDashItemActive" : ""}`}
            >
              <div className="llDashIcon" aria-hidden>
                {ICONS[it.id]}
              </div>

              <div className="llDashItemMain">
                <div className="llDashLabel">{it.label}</div>
                {it.hint ? <div className="llDashHint">{it.hint}</div> : null}
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
