// web/src/layout/BottomTabs.tsx
import * as React from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

import { DailyWheelCard } from "../components/DailyWheelCard";
import { DailyBonusAccessCard } from "../components/DailyBonusAccessCard";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

function absolutize(url: string | null) {
  if (!url) return null;
  const u = String(url);
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/")) return `${API_BASE}${u}`;
  return u;
}

type MenuLink = { kind: "link"; to: string; label: string; icon?: React.ReactNode };
type MenuAction = { kind: "action"; label: string; icon?: React.ReactNode; onClick: () => void };
type MenuItem = MenuLink | MenuAction;

export function BottomTabs() {
  const location = useLocation();
  const authAny = useAuth() as any;
  const userAny = authAny?.user ?? null;

  const username = String(userAny?.username || "");
  const avatarRaw =
    userAny?.avatarUrl != null
      ? String(userAny.avatarUrl)
      : userAny?.avatar_url != null
      ? String(userAny.avatar_url)
      : userAny?.picture != null
      ? String(userAny.picture)
      : userAny?.photoUrl != null
      ? String(userAny.photoUrl)
      : userAny?.photo_url != null
      ? String(userAny.photo_url)
      : null;

  const avatarSrc = avatarRaw ? absolutize(avatarRaw) || avatarRaw : null;

  const [open, setOpen] = React.useState(false);

  // refs pour scroll vers les cards (bonus / roue)
  const bonusRef = React.useRef<HTMLDivElement | null>(null);
  const wheelRef = React.useRef<HTMLDivElement | null>(null);

  // ferme le menu si navigation (y compris query ?open=clips)
  React.useEffect(() => {
    setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  // ESC + lock scroll
  React.useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = prevOverflow;
    };
  }, [open]);

  const tabClass = ({ isActive }: { isActive: boolean }) => `tab ${isActive ? "active" : ""}`;

  function openReport() {
    // déclenche l'ouverture de ReportModal dans Topbar
    window.dispatchEvent(new Event("ui:report_open"));
    setOpen(false);
  }

  const menuItems: MenuItem[] = [
    // ✅ Remplacement Lives/Browse/Mon compte: => Clips + Bonus + Roue
    // Liens principaux
    { kind: "link", to: "/casinos", label: "CheckTaSlot", icon: "🎰" },
    { kind: "link", to: "/hunt", label: "Hunt", icon: "🧿" },
    { kind: "link", to: "/shop", label: "Shop", icon: "🛍️" },
  ];

  return (
    <>
      <style>{`
        .bottomTabs{
          position: fixed;
          left: 0; right: 0;
          bottom: 0;
          z-index: 80;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          gap: 10px;
          padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
          background: rgba(12,12,16,0.72);
          border-top: 1px solid rgba(255,255,255,0.10);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
        }

        .tab{
          display:flex;
          align-items:center;
          justify-content:center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.04);
          color: rgba(255,255,255,0.90);
          text-decoration:none;
          min-height: 46px;
          user-select:none;
        }
        .tab:active{ transform: translateY(1px); }
        .tab.active{
          border-color: rgba(140,90,255,0.35);
          background: rgba(140,90,255,0.12);
        }

        .tabIcon{
          width: 22px; height: 22px;
          display:grid; place-items:center;
          font-weight: 1200;
          opacity: 0.95;
        }
        .tabLabel{
          font-weight: 1150;
          letter-spacing: -0.2px;
          font-size: 13px;
        }

        .menuBtn{
          width: 56px;
          height: 46px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.92);
          cursor: pointer;
          font-weight: 1300;
          font-size: 20px;
        }
        .menuBtn:active{ transform: translateY(1px); }

        /* Sheet */
        .sheetBackdrop{
          position: fixed;
          inset: 0;
          z-index: 120;
          background: rgba(0,0,0,0.55);
          display: grid;
          align-items: end;
          padding: 12px;
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }
        .sheet{
          width: min(720px, 100%);
          margin: 0 auto;
          border-radius: 18px 18px 0 0;
          border: 1px solid rgba(255,255,255,0.12);
          background: linear-gradient(180deg, rgba(30,30,40,0.92), rgba(10,10,14,0.94));
          box-shadow: 0 30px 90px rgba(0,0,0,0.55);
          overflow: hidden;
        }
        .sheetTop{
          display:flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 14px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .sheetBody{
          padding: 12px;
          max-height: min(78vh, 720px);
          overflow: auto;
          padding-bottom: calc(18px + env(safe-area-inset-bottom));
          display: grid;
          gap: 12px;
        }

        .iconBtn{
          width: 34px;
          height: 34px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.92);
          cursor: pointer;
          font-weight: 1100;
        }

        .meBtn{
          display:flex;
          align-items:center;
          gap: 10px;
          padding: 12px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.04);
          text-decoration: none;
          color: rgba(255,255,255,0.92);
        }
        .meBtn:active{ transform: translateY(1px); }
        .meAva{
          width: 44px; height: 44px;
          border-radius: 16px;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(0,0,0,0.35);
          flex: 0 0 auto;
        }
        .meAva img{ width:100%; height:100%; object-fit: cover; display:block; }
        .meName{
          font-weight: 1300;
          letter-spacing: -0.2px;
          overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
        }
        .meSub{
          font-size: 12px;
          opacity: 0.78;
          font-weight: 950;
          margin-top: 2px;
        }

        .menuList{ display:grid; gap: 10px; }
        .menuItem{
          display:flex;
          align-items:center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 12px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.92);
          text-decoration: none;
          cursor:pointer;
          font-weight: 1150;
        }
        .menuItem:active{ transform: translateY(1px); }
        .menuLeft{
          display:inline-flex;
          align-items:center;
          gap: 10px;
          min-width: 0;
        }
        .menuLabel{
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
          letter-spacing: -0.2px;
        }
        .menuHint{
          font-size: 12px;
          font-weight: 1000;
          opacity: 0.82;
          white-space: nowrap;
        }

        .reportBtn{
          width: 100%;
          display:flex;
          align-items:center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 12px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.92);
          cursor:pointer;
          font-weight: 1150;
        }
        .reportBtn:active{ transform: translateY(1px); }
        /* ✅ réserve de l’espace pour éviter que la barre fixe cache le bas des pages */
        .bottomTabsSpacer{
          height: calc(72px + env(safe-area-inset-bottom));
        }
      `}</style>

      <nav className="bottomTabs" aria-label="Navigation">
        
        <NavLink to="/" end className={tabClass}>
          <div className="tabIcon">●</div>
          <div className="tabLabel">Lives</div>
        </NavLink>

        <button type="button" className="menuBtn" onClick={() => setOpen(true)} aria-label="Ouvrir le menu">
          ⋯
        </button>

        <NavLink to="/browse" className={tabClass}>
          <div className="tabIcon">◔</div>
          <div className="tabLabel">Browse</div>
        </NavLink>
      </nav>
      <div className="bottomTabsSpacer" aria-hidden="true" />

      {open ? (
        <div className="sheetBackdrop" role="presentation" onClick={() => setOpen(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Menu" onClick={(e) => e.stopPropagation()}>
            <div className="sheetTop">
              <div style={{ fontWeight: 1250, letterSpacing: -0.2 }}>Menu</div>
              <button className="iconBtn" type="button" onClick={() => setOpen(false)} aria-label="Fermer">
                ✕
              </button>
            </div>

            <div className="sheetBody">
              {/* Mon compte (unique, en haut) */}
              <Link to="/profile" className="meBtn" onClick={() => setOpen(false)} aria-label="Mon compte">
                <div className="meAva" aria-hidden>
                  {avatarSrc ? (
                    <img
                      src={avatarSrc}
                      alt=""
                      onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                    />
                  ) : null}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="meName">{username || "Mon compte"}</div>
                  <div className="meSub">Profil • options</div>
                </div>
                <div className="menuHint">▶</div>
              </Link>

              {/* Liens / actions */}
              <div className="menuList">
                {menuItems.map((it) => {
                  if (it.kind === "link") {
                    return (
                      <Link
                        key={`${it.to}-${it.label}`}
                        to={it.to}
                        className="menuItem"
                        onClick={() => setOpen(false)}
                        aria-label={it.label}
                      >
                        <span className="menuLeft">
                          <span aria-hidden>{it.icon ?? "•"}</span>
                          <span className="menuLabel">{it.label}</span>
                        </span>
                        <span className="menuHint">▶</span>
                      </Link>
                    );
                  }

                  return (
                    <button
                      key={`action-${it.label}`}
                      type="button"
                      className="menuItem"
                      onClick={it.onClick}
                      aria-label={it.label}
                      style={{ textAlign: "left" }}
                    >
                      <span className="menuLeft">
                        <span aria-hidden>{it.icon ?? "•"}</span>
                        <span className="menuLabel">{it.label}</span>
                      </span>
                      <span className="menuHint">▶</span>
                    </button>
                  );
                })}

                {/* Sections intégrées (cards) : bonus + roue */}
                <div ref={bonusRef} style={{ display: "grid", gap: 10, marginTop: 2 }}>
                  <DailyBonusAccessCard />
                </div>

                <div ref={wheelRef} style={{ display: "grid", gap: 10 }}>
                  <DailyWheelCard />
                </div>

                {/* Signaler un problème => ouvre la modale */}
                <button type="button" className="reportBtn" onClick={openReport} aria-label="Signaler un problème">
                  <span className="menuLeft">
                    <span aria-hidden>🚩</span>
                    <span className="menuLabel">Signaler un problème</span>
                  </span>
                  <span className="menuHint">▶</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
