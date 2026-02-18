// web/src/layout/Sidebar.tsx
import * as React from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `llSideItem ${isActive ? "active" : ""}`;

export function Sidebar() {
  const authAny = useAuth() as any;
  const userAny = authAny?.user ?? null;

  // Followed channels — brancher sur la vraie data quand dispo
  const followedChannels: Array<{
    slug: string; name: string; avatar?: string | null;
    viewers?: number; online: boolean;
  }> = (userAny as any)?.followedChannels ?? [];

  return (
    <aside className="llSidebar" aria-label="Sidebar">
      <style>{`
        /* ── Brand block en haut de la sidebar ── */
        .llSide-brand {
          display: flex; align-items: center; gap: 10px;
          padding: 14px 12px 12px;
          text-decoration: none;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          flex-shrink: 0;
        }
        .llSide-brandMark {
          width: 34px; height: 34px; border-radius: 11px;
          overflow: hidden; flex-shrink: 0;
          border: 1px solid rgba(124,92,252,0.28);
          background: rgba(0,0,0,0.32);
          box-shadow: 0 0 14px rgba(124,92,252,0.22);
          display: grid; place-items: center;
        }
        .llSide-brandMark img {
          width: 100%; height: 100%; object-fit: cover;
          display: block; border-radius: 10px;
        }
        .llSide-brandText { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
        .llSide-brandName {
          font-family: 'Syne', system-ui, sans-serif;
          font-weight: 900; font-size: 14px; letter-spacing: -0.4px; line-height: 1;
          background: linear-gradient(105deg, #c4b5fd 0%, #7c5cfc 35%, #5b8ef8 70%, #93c5fd 100%);
          background-size: 220% 100%;
          -webkit-background-clip: text; background-clip: text; color: transparent;
          filter: drop-shadow(0 0 8px rgba(124,92,252,0.40));
          animation: ll-shimmer 5s ease-in-out infinite;
          white-space: nowrap;
        }
        .llSide-brandSub {
          font-size: 9px; font-weight: 800; letter-spacing: 0.14em;
          text-transform: uppercase; color: rgba(167,155,220,0.50);
          white-space: nowrap;
        }

        /* ── Followed channels ── */
        .llSideChannels {
          display: flex; flex-direction: column; gap: 2px;
          overflow-y: auto; flex: 1;
          scrollbar-width: thin;
          scrollbar-color: rgba(124,92,252,0.20) transparent;
        }
        .llSideChannel {
          display: flex; align-items: center; gap: 8px;
          padding: 7px 10px; border-radius: 10px;
          text-decoration: none;
          color: rgba(200,195,240,0.78);
          font-family: var(--ll-font-display, 'Syne', system-ui, sans-serif);
          font-size: 12px; font-weight: 700;
          transition: background 130ms ease;
          position: relative;
        }
        .llSideChannel:hover { background: rgba(255,255,255,0.05); color: rgba(235,232,255,0.96); }
        .llSideChanAvatar {
          width: 26px; height: 26px; border-radius: 8px; overflow: hidden;
          flex-shrink: 0; background: rgba(124,92,252,0.12);
          border: 1px solid rgba(124,92,252,0.18);
          display: grid; place-items: center; font-size: 12px;
        }
        .llSideChanAvatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .llSideChanInfo { min-width: 0; flex: 1; }
        .llSideChanName {
          font-size: 12px; font-weight: 800;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .llSideChanViewers { font-size: 10px; color: rgba(167,155,220,0.52); margin-top: 1px; }
        .llSideChanLiveDot {
          width: 7px; height: 7px; border-radius: 999px;
          background: #ef4444; flex-shrink: 0;
          box-shadow: 0 0 0 4px rgba(239,68,68,0.14);
          animation: ping-pulse 1.6s ease-in-out infinite;
        }
        .llSideChanOffline {
          font-size: 10px; color: rgba(140,145,195,0.42);
          flex-shrink: 0; white-space: nowrap;
        }

        /* ── Daily Quest CTA ── */
        .llSideCtaWrap {
          width: 100%;
          padding: 11px 14px;
          border-radius: 14px;
          border: 1px solid rgba(124,92,252,0.26);
          background: linear-gradient(135deg, rgba(124,92,252,0.28), rgba(59,77,200,0.20), rgba(91,142,248,0.12));
          color: rgba(235,232,255,0.96);
          font-family: var(--ll-font-display, 'Syne', system-ui, sans-serif);
          cursor: pointer;
          box-shadow: 0 10px 32px rgba(0,0,0,0.38), 0 0 0 1px rgba(124,92,252,0.08) inset;
          display: flex; align-items: flex-start; gap: 10px;
          text-align: left;
          transition: filter 150ms ease, transform 140ms cubic-bezier(0.22,1,0.36,1);
        }
        .llSideCtaWrap:hover { filter: brightness(1.08); transform: translateY(-1px); }
        .llSideCtaIcon { font-size: 16px; flex-shrink: 0; margin-top: 1px; }
        .llSideCtaBody { flex: 1; min-width: 0; }
        .llSideCtaTitle { font-size: 12px; font-weight: 900; line-height: 1; margin-bottom: 6px; }
        .llSideCtaBar {
          height: 4px; border-radius: 999px;
          background: rgba(255,255,255,0.12); overflow: hidden; margin-bottom: 4px;
        }
        .llSideCtaBarFill {
          height: 100%; border-radius: 999px;
          background: linear-gradient(90deg, rgba(196,181,253,0.90), rgba(124,92,252,0.80));
          box-shadow: 0 0 8px rgba(124,92,252,0.40);
        }
        .llSideCtaMeta { font-size: 10px; color: rgba(196,181,253,0.70); font-weight: 700; }
        .llSideCtaSub { font-size: 10px; color: rgba(167,155,220,0.58); font-weight: 600; margin-top: 2px; }

        @keyframes ping-pulse {
          0%, 100% { box-shadow: 0 0 0 4px rgba(239,68,68,0.14); }
          50%       { box-shadow: 0 0 0 7px rgba(239,68,68,0.04); }
        }
        @keyframes ll-shimmer {
          0%   { background-position: 0%   50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0%   50%; }
        }
      `}</style>

      {/*
        llSideInner utilise grid-template-rows: auto auto 1fr (depuis 10_layout.css)
        On ajoute une 4e row pour le brand en modifiant via style inline.
        Plus simple : on wrap le tout dans llSideInner et on override avec flex.
      */}
      <div className="llSideInner" style={{
        display: "flex",
        flexDirection: "column",
        gridTemplateRows: "unset", // neutralise le grid de 10_layout.css
      }}>

        {/* ── BRAND ── */}
        <NavLink to="/" className="llSide-brand" aria-label="LunaLive — Accueil">
          <div className="llSide-brandMark" aria-hidden>
            <img src="/logo_onglet.png" alt="" />
          </div>
          <div className="llSide-brandText">
            <span className="llSide-brandName">LunaLive</span>
            <span className="llSide-brandSub">Premium Streaming</span>
          </div>
        </NavLink>

        {/* ── MENU ── */}
        <div className="llSideSection">
          <div className="llSideTitle">Menu</div>

          <NavLink to="/" end className={linkClass}>
            <span className="llSideIcon" aria-hidden>📺</span>
            <span className="llSideLabel">Lives</span>
          </NavLink>

          <NavLink to="/browse" className={linkClass}>
            <span className="llSideIcon" aria-hidden>🧭</span>
            <span className="llSideLabel">Browse</span>
          </NavLink>

          <NavLink to="/casinos" className={linkClass}>
            <span className="llSideIcon" aria-hidden>🎰</span>
            <span className="llSideLabel">CheckTaSlot</span>
          </NavLink>

          <NavLink to="/hunt" className={linkClass}>
            <span className="llSideIcon" aria-hidden>🧿</span>
            <span className="llSideLabel">Hunt</span>
          </NavLink>

          <NavLink to="/shop" className={linkClass}>
            <span className="llSideIcon" aria-hidden>🛒</span>
            <span className="llSideLabel">Shop</span>
          </NavLink>
        </div>

        {/* ── FOLLOWED CHANNELS ── */}
        <div className="llSideSection" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div className="llSideTitle">Followed channels</div>
          <div className="llSideChannels">
            {followedChannels.length === 0 ? (
              <div className="llSideEmpty">On branchera la liste après.</div>
            ) : (
              followedChannels.map((ch) => (
                <NavLink key={ch.slug} to={`/s/${ch.slug}`} className="llSideChannel">
                  <div className="llSideChanAvatar">
                    {ch.avatar
                      ? <img src={ch.avatar} alt={ch.name} />
                      : <span>{ch.name.slice(0, 1).toUpperCase()}</span>}
                  </div>
                  <div className="llSideChanInfo">
                    <div className="llSideChanName">{ch.name}</div>
                    {ch.online && ch.viewers != null && (
                      <div className="llSideChanViewers">👁 {ch.viewers.toLocaleString("fr-FR")}</div>
                    )}
                  </div>
                  {ch.online
                    ? <span className="llSideChanLiveDot" aria-label="En direct" />
                    : <span className="llSideChanOffline">Offline</span>}
                </NavLink>
              ))
            )}
          </div>
        </div>

        {/* ── DAILY QUEST ── */}
        <div className="llSideBottom">
          <button className="llSideCtaWrap" type="button">
            <span className="llSideCtaIcon" aria-hidden>✨</span>
            <div className="llSideCtaBody">
              <div className="llSideCtaTitle">Daily Quest</div>
              <div className="llSideCtaBar">
                <div className="llSideCtaBarFill" style={{ width: "75%" }} />
              </div>
              <div className="llSideCtaMeta">75%</div>
              <div className="llSideCtaSub">Watch 2 hours of live content today.</div>
            </div>
          </button>
        </div>

      </div>
    </aside>
  );
}