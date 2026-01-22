// web/src/layout/Topbar.tsx
import * as React from "react";
import { NavLink, Link } from "react-router-dom";
import { useIsMobile } from "../hooks/useIsMobile";
import { AvatarMenu } from "../components/AvatarMenu";
import { useAuth } from "../auth/AuthProvider";
import { ReportModal } from "../components/ReportModal";

function isActiveSubLike(x: any): boolean {
  // accepte plusieurs shapes possibles (objet, array, etc.)
  const now = Date.now();

  const checkOne = (s: any) => {
    if (!s) return false;
    const status = String(s.status || s.state || "").toLowerCase();
    const endRaw = s.current_period_end ?? s.currentPeriodEnd ?? s.end ?? null;

    // si pas de date: on se base juste sur le status
    if (!endRaw) return status === "active" || status === "trialing";

    const endMs =
      typeof endRaw === "number"
        ? endRaw * (endRaw > 1e12 ? 1 : 1000) // tolère seconds/ms
        : new Date(String(endRaw)).getTime();

    return (status === "active" || status === "trialing") && Number.isFinite(endMs) && endMs > now;
  };

  // array: [{plan_code,status,...}, ...]
  if (Array.isArray(x)) {
    return x.some((s) => checkOne(s));
  }

  // object map: { viewer: {...}, streamer: {...} }
  if (typeof x === "object") {
    if (x.viewer || x.streamer) return checkOne(x.viewer) || checkOne(x.streamer);

    // shape: { plans: {...} } ou { subscriptions: {...} }
    if (x.plans) return checkOne(x.plans.viewer) || checkOne(x.plans.streamer);
    if (x.subscriptions) return checkOne(x.subscriptions.viewer) || checkOne(x.subscriptions.streamer);

    // shape: { plan_code: 'viewer', ... }
    return checkOne(x);
  }

  return false;
}

export function Topbar({
  onOpenLogin,
  onLogout,
}: {
  onOpenLogin: () => void;
  onLogout: () => void;
}) {
  const isMobile = useIsMobile();
  const authAny = useAuth() as any;

  const userAny = authAny?.user ?? null;
  const user = userAny as { rubis: number; username?: string } | null;

  // ✅ marqueur premium (robuste sur plusieurs shapes de payload)
  const isPremium =
    Boolean(
      userAny?.premiumActive ??
        userAny?.isPremium ??
        userAny?.is_premium ??
        userAny?.premium ??
        userAny?.subActive
    ) ||
    isActiveSubLike(userAny?.subscriptions) ||
    isActiveSubLike(userAny?.subs) ||
    isActiveSubLike(userAny?.user_subscriptions) ||
    isActiveSubLike(userAny?.userSubscriptions);

  const [reportOpen, setReportOpen] = React.useState(false);

  const linkClass = ({ isActive }: { isActive: boolean }) => `llNavBtn ${isActive ? "active" : ""}`;
  React.useEffect(() => {
    console.log("[Topbar:user]", authAny?.user);
  }, [authAny?.user]);

  return (
    <header className="topbar llTopbar">
      <style>{`
        .llTopbar{
          position: sticky;
          top: 0;
          z-index: 50;
          width: 100%;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          background:
            radial-gradient(1000px 240px at 12% 0%, rgba(140,90,255,0.22), rgba(0,0,0,0) 60%),
            radial-gradient(800px 240px at 88% 0%, rgba(255,90,180,0.14), rgba(0,0,0,0) 55%),
            rgba(8,10,16,0.58);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
        }

        /* Full width layout: brand left / nav center / user right */
        .llTopbarInner{
          width: 100%;
          padding: 10px 16px;
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 14px;
        }

        /* Brand far left */
        .llBrandLink{
          display: inline-flex;
          align-items: center;
          gap: 10px;
          text-decoration: none;
          color: inherit;
          user-select: none;
          padding: 6px 8px;
          border-radius: 14px;
        }
        .llBrandLink:hover{
          background: rgba(255,255,255,0.04);
        }

        .llBrandMark{
          width: 34px;
          height: 34px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.12);
          background:
            radial-gradient(circle at 30% 30%, rgba(255,255,255,0.18), rgba(0,0,0,0) 55%),
            linear-gradient(135deg, rgba(140,90,255,0.28), rgba(80,160,255,0.14), rgba(255,90,180,0.10));
          box-shadow: 0 14px 40px rgba(0,0,0,0.35);
          position: relative;
          overflow: hidden;
          flex: 0 0 auto;
        }
        .llBrandMark:after{
          content:"🌙";
          position:absolute;
          inset:0;
          display:grid;
          place-items:center;
          font-size: 16px;
          opacity: .95;
          filter: drop-shadow(0 10px 18px rgba(0,0,0,0.4));
        }

        .llBrandText{
          display:flex;
          flex-direction: column;
          line-height: 1.05;
        }
        .llBrandText b{
          font-size: 14px;
          letter-spacing: -0.2px;
          font-weight: 1100;
        }
        .llBrandText span{
          font-size: 12px;
          opacity: .68;
          margin-top: 2px;
          white-space: nowrap;
        }

        /* Center nav with big clickable buttons */
        .llNav{
          justify-self: center;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 8px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.04);
          box-shadow: 0 18px 50px rgba(0,0,0,0.22);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }

        .llNavBtn{
          position: relative;
          display:inline-flex;
          align-items:center;
          justify-content:center;
          height: 42px;
          padding: 0 16px;
          border-radius: 999px;
          text-decoration: none;
          color: inherit;
          font-weight: 1100;
          font-size: 14px;
          letter-spacing: -0.1px;
          opacity: .86;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.03);
          transition: transform .15s ease, opacity .15s ease, background .15s ease, border-color .15s ease;
          cursor: pointer;
          user-select: none;
          min-width: 104px;
        }
        .llNavBtn:hover{
          opacity: 1;
          transform: translateY(-1px);
          background: rgba(255,255,255,0.06);
          border-color: rgba(255,255,255,0.14);
        }
        .llNavBtn:active{
          transform: translateY(0px);
        }
        .llNavBtn.active{
          opacity: 1;
          border-color: rgba(255,255,255,0.16);
          background:
            linear-gradient(90deg, rgba(140,90,255,0.22), rgba(80,160,255,0.16), rgba(255,90,180,0.12));
          box-shadow: 0 16px 40px rgba(0,0,0,0.18);
        }
        .llNavBtn.active:after{
          content:"";
          position:absolute;
          left: 14px;
          right: 14px;
          bottom: 6px;
          height: 2px;
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(140,90,255,0.95), rgba(80,160,255,0.92), rgba(255,90,180,0.92));
          opacity: .95;
          filter: drop-shadow(0 10px 18px rgba(140,90,255,0.22));
        }

        /* Right side pinned */
        .llRight{
          justify-self: end;
          display:flex;
          align-items:center;
          gap: 10px;
        }

        .llPill{
          display:inline-flex;
          align-items:center;
          gap: 8px;
          height: 40px;
          padding: 0 12px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.05);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          font-size: 13px;
          font-weight: 1100;
          white-space: nowrap;
        }
        .llPillRuby{
          border-color: rgba(255,210,110,0.22);
          background: linear-gradient(180deg, rgba(255,210,110,0.12), rgba(255,255,255,0.04));
        }

        .llLoginBtn{
          display:inline-flex;
          align-items:center;
          justify-content:center;
          height: 40px;
          padding: 0 14px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
          background:
            linear-gradient(90deg, rgba(140,90,255,0.30), rgba(80,160,255,0.22), rgba(255,90,180,0.16));
          box-shadow: 0 18px 50px rgba(0,0,0,0.25);
          color: inherit;
          cursor:pointer;
          font-weight: 1100;
        }
        .llLoginBtn:hover{ filter: brightness(1.05); transform: translateY(-1px); }
        .llLoginBtn:active{ transform: translateY(0px); }

        /* ✅ NEW: bouton signalement */
        .llReportBtn{
          display:inline-flex;
          align-items:center;
          justify-content:center;
          height: 40px;
          width: 40px;
          padding: 0;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.05);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          cursor:pointer;
          font-weight: 1100;
        }
        .llReportBtn:hover{
          border-color: rgba(255,255,255,0.18);
          background: rgba(255,255,255,0.07);
          transform: translateY(-1px);
        }
        .llReportBtn:active{ transform: translateY(0px); }

        .llReportFlag{
          font-size: 16px;
          line-height: 1;
          opacity: .95;
          filter: drop-shadow(0 6px 14px rgba(0,0,0,0.55));
          text-shadow: 0 0 14px rgba(255,255,255,0.10);
        }

        /* ✅ NEW: wrapper avatar + marqueur premium */
        .llPremiumStar{
          position: absolute;
          left: -4px;
          bottom: -4px;

          width: 18px;
          height: 18px;
          border-radius: 999px;
          display: grid;
          place-items: center;

          /* ✅ IMPORTANT: au premier plan */
          z-index: 5;

          /* ✅ jaune */
          border: 1px solid rgba(255, 210, 110, 0.75);
          background:
            radial-gradient(circle at 30% 30%, rgba(255,255,255,0.28), rgba(0,0,0,0) 60%),
            linear-gradient(135deg, rgba(255, 220, 120, 0.55), rgba(255, 190, 60, 0.35)),
            rgba(0,0,0,0.20);
          box-shadow: 0 14px 36px rgba(0,0,0,0.40);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          pointer-events: none; /* ne bloque pas le click avatar */
        }

        .llPremiumStar span{
          font-size: 12px;
          line-height: 1;
          color: #ffd66a;
          text-shadow:
            0 0 10px rgba(255, 210, 110, 0.45),
            0 10px 18px rgba(0,0,0,0.55);
        }

        /* Responsive: hide center nav on mobile (your existing behavior) */
        @media (max-width: 820px){
          .llTopbarInner{ padding: 10px 12px; }
          .llNav{ display: none; }
        }

        @media (prefers-reduced-motion: no-preference){
          .llBrandMark{ animation: llGlow 6.5s ease-in-out infinite; }
          @keyframes llGlow{
            0%,100%{ filter: drop-shadow(0 0 0 rgba(140,90,255,0)); }
            50%{ filter: drop-shadow(0 18px 35px rgba(140,90,255,0.22)); }
          }
        }
      `}</style>

      <div className="topbarInner llTopbarInner">
        {/* Brand = cliquable => / */}
        <div className="leftSlot">
          <Link to="/" className="llBrandLink" aria-label="Aller à la page Lives">
            <div className="llBrandMark" aria-hidden />
            <div className="llBrandText">
              <b>LunaLive</b>
              <span>live • casinos • communauté</span>
            </div>
          </Link>
        </div>

        {/* Center nav big buttons */}
        {!isMobile && (
          <nav className="navCentered llNav" aria-label="Navigation">
            <NavLink to="/" end className={linkClass}>
              Lives
            </NavLink>
            <NavLink to="/browse" className={linkClass}>
              Browse
            </NavLink>
            <NavLink to="/casinos" className={linkClass}>
              CheckTaSlot
            </NavLink>
            <NavLink to="/hunt" className={linkClass}>
              Hunt
            </NavLink>
            <NavLink to="/shop" className={linkClass}>
              Shop
            </NavLink>
          </nav>
        )}

        {/* Right side */}
        <div className="rightSlot llRight">
          {/* ✅ NEW: bouton toujours visible */}
          <button
            className="llReportBtn"
            onClick={() => setReportOpen(true)}
            title="Signalement / retour"
            aria-label="Ouvrir signalement / retour"
          >
            <span className="llReportFlag" aria-hidden>
              ⚑
            </span>
          </button>

          {user ? (
            <>
              <div className="pill llPill llPillRuby" title="Rubis">
                💎 <strong>{Number(user.rubis || 0).toLocaleString("fr-FR")}</strong>
              </div>

              <div className="llAvatarWrap">
                {isPremium ? (
                  <div className="llPremiumStar" title="Abonnement premium actif" aria-label="Abonnement premium actif">
                    <span aria-hidden>★</span>
                  </div>
                ) : null}

                <AvatarMenu user={userAny as any} onLogout={onLogout} onOpenReport={() => setReportOpen(true)} />
              </div>
            </>
          ) : (
            <button className="btnPrimary llLoginBtn" onClick={onOpenLogin}>
              Se connecter
            </button>
          )}
        </div>
      </div>

      {/* ✅ NEW: modale */}
      <ReportModal open={reportOpen} onClose={() => setReportOpen(false)} preset={null} />
    </header>
  );
}
