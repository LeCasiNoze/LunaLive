// web/src/layout/Topbar.tsx
import * as React from "react";
import { NavLink, Link } from "react-router-dom";
import { useIsMobile } from "../hooks/useIsMobile";
import { AvatarMenu } from "../components/AvatarMenu";
import { useAuth } from "../auth/AuthProvider";
import { ReportModal } from "../components/ReportModal";
import { UnreadBadge } from "../components/UnreadBadge";
import { publicGetContent } from "../lib/api";
import { contentVersionFromItem, isUnread } from "../lib/unread_seen";

type ActivePlans = { viewer: boolean; streamer: boolean };

function isActiveSubEntry(s: any): boolean {
  const now = Date.now();
  if (!s) return false;

  const status = String(s.status || s.state || "").toLowerCase();
  const endRaw = s.current_period_end ?? s.currentPeriodEnd ?? s.end ?? null;

  if (!endRaw) return status === "active" || status === "trialing";

  const endMs =
    typeof endRaw === "number"
      ? endRaw * (endRaw > 1e12 ? 1 : 1000)
      : new Date(String(endRaw)).getTime();

  return (status === "active" || status === "trialing") && Number.isFinite(endMs) && endMs > now;
}

function addPlan(out: ActivePlans, planCode: string | null | undefined, active: boolean) {
  if (!active) return;
  const p = String(planCode || "").toLowerCase();
  if (p === "viewer") out.viewer = true;
  if (p === "streamer") out.streamer = true;
}

function getActivePlansFrom(x: any): ActivePlans {
  const out: ActivePlans = { viewer: false, streamer: false };
  if (!x) return out;

  // array: [{plan_code,status,...}, ...]
  if (Array.isArray(x)) {
    for (const s of x) addPlan(out, s?.plan_code ?? s?.planCode, isActiveSubEntry(s));
    return out;
  }

  // object map: { viewer: {...}, streamer: {...} }
  if (typeof x === "object") {
    if (x.viewer || x.streamer) {
      addPlan(out, "viewer", isActiveSubEntry(x.viewer));
      addPlan(out, "streamer", isActiveSubEntry(x.streamer));
      return out;
    }

    // shape: { plans: {...} } ou { subscriptions: {...} }
    if (x.plans) return getActivePlansFrom(x.plans);
    if (x.subscriptions) return getActivePlansFrom(x.subscriptions);

    // single entry: { plan_code:'viewer', status:'active', ... }
    if (x.plan_code || x.planCode) {
      addPlan(out, x.plan_code ?? x.planCode, isActiveSubEntry(x));
      return out;
    }
  }

  return out;
}

function mergePlans(a: ActivePlans, b: ActivePlans): ActivePlans {
  return { viewer: a.viewer || b.viewer, streamer: a.streamer || b.streamer };
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
  const token = authAny?.token ?? null;

  const CONTENT_KEYS = ["daily_bonus_infos", "guide_viewer", "guide_streamer"] as const;
  const [unreadBonus, setUnreadBonus] = React.useState(false);

  const reloadUnreadBonus = React.useCallback(async () => {
    if (!token) {
      setUnreadBonus(false);
      return;
    }
    try {
      const results = await Promise.all(
        CONTENT_KEYS.map(async (k) => {
          const r: any = await publicGetContent(k);
          const item = r?.item ?? null;
          if (!item) return false;
          const v = contentVersionFromItem(item);
          return isUnread(`content:${k}`, v);
        })
      );
      setUnreadBonus(results.some(Boolean));
    } catch {
      setUnreadBonus(false);
    }
  }, [token]);

  React.useEffect(() => {
    reloadUnreadBonus();
  }, [reloadUnreadBonus]);

  React.useEffect(() => {
    const onSeen = () => reloadUnreadBonus();
    window.addEventListener("ll:content-seen", onSeen as any);

    const onStorage = () => reloadUnreadBonus();
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("ll:content-seen", onSeen as any);
      window.removeEventListener("storage", onStorage);
    };
  }, [reloadUnreadBonus]);

  const userAny = authAny?.user ?? null;
  const user = userAny as { rubis: number; username?: string } | null;

  // ✅ plans actifs (viewer/streamer) depuis plusieurs shapes possibles
  const plans = React.useMemo(() => {
    let p: ActivePlans = { viewer: false, streamer: false };
    p = mergePlans(p, getActivePlansFrom(userAny?.subscriptions));
    p = mergePlans(p, getActivePlansFrom(userAny?.subs));
    p = mergePlans(p, getActivePlansFrom(userAny?.user_subscriptions));
    p = mergePlans(p, getActivePlansFrom(userAny?.userSubscriptions));
    return p;
  }, [userAny]);

  // ✅ fallback legacy (si ton backend envoie encore des flags)
  const legacyPremium = Boolean(
    userAny?.premiumActive ??
      userAny?.isPremium ??
      userAny?.is_premium ??
      userAny?.premium ??
      userAny?.subActive
  );

  type StarKind = "none" | "viewer" | "streamer" | "both" | "legacy";
  const starKind: StarKind =
    plans.viewer && plans.streamer
      ? "both"
      : plans.viewer
      ? "viewer"
      : plans.streamer
      ? "streamer"
      : legacyPremium
      ? "legacy"
      : "none";

  const showStar = starKind !== "none";

  const [reportOpen, setReportOpen] = React.useState(false);

  React.useEffect(() => {
    const onOpen = () => setReportOpen(true);
    window.addEventListener("ui:report_open", onOpen as any);
    return () => window.removeEventListener("ui:report_open", onOpen as any);
  }, []);

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
          gap: 5px;
          text-decoration: none;
          color: inherit;
          user-select: none;
          padding: 10px 8px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.04);
          box-shadow: 0 18px 50px rgba(0,0,0,0.22);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        .llBrandLink:hover{
          background: rgba(255,255,255,0.06);
          border-color: rgba(255,255,255,0.14);
          transform: translateY(-1px);
        }
        .llBrandLink:active{ transform: translateY(0px); }

        .llBrandMark{
          width: 44px;
          height: 44px;
          border-radius: 999px;         /* ✅ cercle parfait */
          overflow: hidden;             /* ✅ crop */
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.04);
          box-shadow: 0 18px 50px rgba(0,0,0,0.35);
          display: grid;
          place-items: center;
        }


.llBrandLogo{
  width: 100%;
  height: 100%;
  object-fit: cover;            /* ✅ remplit le cercle */
  object-position: center;
  border-radius: 999px;         /* ✅ au cas où */
  display: block;
  user-select: none;
  -webkit-user-drag: none;
}


        .llBrandText{
          display:flex;
          flex-direction: column;
          line-height: 1.05;
        }

.llBrandText b{
  font-size: 19px;
  letter-spacing: -0.4px;
  font-weight: 1200;

  background: linear-gradient(
    90deg,
    rgba(170,110,255,1) 0%,
    rgba(110,200,255,1) 25%,
    rgba(255,120,200,1) 50%,
    rgba(110,200,255,1) 75%,
    rgba(170,110,255,1) 100%
  );
  background-size: 300% 100%;
  background-position: 0% 50%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;

  animation: llBrandGradient 6s linear infinite;
  filter: drop-shadow(0 10px 20px rgba(0,0,0,0.45));
}

@keyframes llBrandGradient{
  0%   { background-position: 0% 50%; }
  50% { background-position: 50% 50%; }
}
@media (prefers-reduced-motion: reduce){
  .llBrandText b{ animation: none; }
}


        .llBrandText span{
          font-size: 12px;
          opacity: .75;
          margin-top: 3px;
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

        /* ✅ NEW: wrapper avatar + marqueur */
        .llAvatarWrap{ position: relative; }

        .llPremiumStar{
          position: absolute;
          left: -4px;
          bottom: -4px;
          width: 18px;
          height: 18px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          z-index: 5;
          box-shadow: 0 14px 36px rgba(0,0,0,0.40);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          pointer-events: none;
          border: 1px solid rgba(255,255,255,0.22);
          background: rgba(0,0,0,0.20);
        }

        .llPremiumStar span{
          font-size: 12px;
          line-height: 1;
          text-shadow:
            0 0 10px rgba(255,255,255,0.20),
            0 10px 18px rgba(0,0,0,0.55);
        }

        /* Viewer = jaune */
        .llPremiumStar.star--viewer{
          border-color: rgba(255, 210, 110, 0.75);
          background:
            radial-gradient(circle at 30% 30%, rgba(255,255,255,0.28), rgba(0,0,0,0) 60%),
            linear-gradient(135deg, rgba(255, 220, 120, 0.55), rgba(255, 190, 60, 0.35)),
            rgba(0,0,0,0.20);
        }
        .llPremiumStar.star--viewer span{ color: #ffd66a; }

        /* Streamer = bleu */
        .llPremiumStar.star--streamer{
          border-color: rgba(110, 185, 255, 0.70);
          background:
            radial-gradient(circle at 30% 30%, rgba(255,255,255,0.24), rgba(0,0,0,0) 60%),
            linear-gradient(135deg, rgba(90, 170, 255, 0.52), rgba(60, 120, 255, 0.30)),
            rgba(0,0,0,0.20);
        }
        .llPremiumStar.star--streamer span{ color: #8fd0ff; }

        /* Both = violet */
        .llPremiumStar.star--both{
          border-color: rgba(180, 120, 255, 0.75);
          background:
            radial-gradient(circle at 30% 30%, rgba(255,255,255,0.24), rgba(0,0,0,0) 60%),
            linear-gradient(135deg, rgba(170, 110, 255, 0.55), rgba(255, 90, 180, 0.22)),
            rgba(0,0,0,0.20);
        }
        .llPremiumStar.star--both span{ color: #d7a6ff; }

        /* Legacy = rouge */
        .llPremiumStar.star--legacy{
          border-color: rgba(255, 110, 110, 0.75);
          background:
            radial-gradient(circle at 30% 30%, rgba(255,255,255,0.24), rgba(0,0,0,0) 60%),
            linear-gradient(135deg, rgba(255, 120, 120, 0.50), rgba(255, 60, 60, 0.28)),
            rgba(0,0,0,0.20);
        }
        .llPremiumStar.star--legacy span{ color: #ffb2b2; }

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
            <div className="llBrandMark" aria-hidden>
              <img className="llBrandLogo" src="/logo_onglet.png" alt="" aria-hidden />
            </div>
            <div className="llBrandText">
              <b>LunaLive</b>
            </div>
          </Link>
        </div>

        {/* Center nav big buttons */}
        {!isMobile && (
          <nav className="navCentered llNav" aria-label="Navigation">
            <NavLink to="/" end className={linkClass}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                Lives
                <UnreadBadge show={unreadBonus} title="Nouveautés • Bonus quotidien" />
              </span>
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
                {showStar ? (
                  <div
                    className={`llPremiumStar ${
                      starKind === "viewer"
                        ? "star--viewer"
                        : starKind === "streamer"
                        ? "star--streamer"
                        : starKind === "both"
                        ? "star--both"
                        : "star--legacy"
                    }`}
                    title={
                      starKind === "both"
                        ? "Abonné Viewer + Streamer"
                        : starKind === "viewer"
                        ? "Abonné Viewer"
                        : starKind === "streamer"
                        ? "Abonné Streamer"
                        : "Premium (legacy)"
                    }
                    aria-label={
                      starKind === "both"
                        ? "Abonné Viewer + Streamer"
                        : starKind === "viewer"
                        ? "Abonné Viewer"
                        : starKind === "streamer"
                        ? "Abonné Streamer"
                        : "Premium legacy"
                    }
                  >
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
