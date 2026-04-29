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
import { QuestsModal } from "../components/QuestsModal";
import { getQuests } from "../lib/api_quests";

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

  if (Array.isArray(x)) {
    for (const s of x) addPlan(out, s?.plan_code ?? s?.planCode, isActiveSubEntry(s));
    return out;
  }

  if (typeof x === "object") {
    if (x.viewer || x.streamer) {
      addPlan(out, "viewer", isActiveSubEntry(x.viewer));
      addPlan(out, "streamer", isActiveSubEntry(x.streamer));
      return out;
    }

    if (x.plans) return getActivePlansFrom(x.plans);
    if (x.subscriptions) return getActivePlansFrom(x.subscriptions);

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

  // Quests modal + claimable badge
  const [questsOpen, setQuestsOpen] = React.useState(false);
  const [questsClaimable, setQuestsClaimable] = React.useState(0);
  React.useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const r = await getQuests();
        if (!cancelled) setQuestsClaimable(r.claimableCount || 0);
      } catch {
        // silent
      }
    };
    refresh();
    const id = setInterval(refresh, 90_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user]);

  const plans = React.useMemo(() => {
    let p: ActivePlans = { viewer: false, streamer: false };
    p = mergePlans(p, getActivePlansFrom(userAny?.subscriptions));
    p = mergePlans(p, getActivePlansFrom(userAny?.subs));
    p = mergePlans(p, getActivePlansFrom(userAny?.user_subscriptions));
    p = mergePlans(p, getActivePlansFrom(userAny?.userSubscriptions));
    return p;
  }, [userAny]);

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

  return (
    <header className="topbar llTopbar">
      <style>{`
        /* ─────────────────────────────────────────
           Topbar shell (glass + highlight line)
        ───────────────────────────────────────── */
        .llTopbar{
          position: sticky;
          top: 0;
          z-index: 50;
          width: 100%;
          border-bottom: 1px solid rgba(124,92,252,0.14);
          background: rgba(13, 11, 24, 0.78);
          box-shadow: 0 18px 55px rgba(0,0,0,0.38);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          overflow: hidden;
        }
        .llTopbar::before{
          content:"";
          position:absolute;
          top:0; left:8%; right:8%;
          height:1px;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(167,139,250,0.40) 35%,
            rgba(91,142,248,0.28) 65%,
            transparent
          );
          pointer-events:none;
        }
        .llTopbar::after{
          content:"";
          position:absolute;
          top:-38px; left:-38px;
          width:220px; height:140px;
          border-radius:50%;
          background: radial-gradient(ellipse, rgba(124,92,252,0.10), transparent 70%);
          pointer-events:none;
        }

        .llTopbarInner{
          position: relative;
          width: 100%;
          padding: 10px 16px;
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 14px;
          z-index: 1;
        }

        /* ─────────────────────────────────────────
           Brand (match LivesPage/DailyWheel)
        ───────────────────────────────────────── */
        .llBrandLink{
          display: inline-flex;
          align-items: center;
          gap: 10px;
          text-decoration: none;
          color: inherit;
          user-select: none;

          padding: 8px 10px;
          border-radius: 18px;
          border: 1px solid rgba(124,92,252,0.14);
          background: rgba(13, 11, 24, 0.62);
          box-shadow: 0 14px 38px rgba(0,0,0,0.35);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          transition: transform 140ms cubic-bezier(.22,1,.36,1), border-color 180ms ease, filter 180ms ease;
        }
        .llBrandLink:hover{
          transform: translateY(-1px);
          border-color: rgba(124,92,252,0.28);
          filter: brightness(1.06);
        }
        .llBrandLink:active{ transform: translateY(0px); filter: brightness(0.98); }

        .llBrandMark{
          width: 40px;
          height: 40px;
          border-radius: 999px;
          overflow: hidden;
          border: 1px solid rgba(124,92,252,0.22);
          background: rgba(0,0,0,0.32);
          box-shadow: 0 18px 50px rgba(0,0,0,0.45);
          display: grid;
          place-items: center;
          flex-shrink: 0;
        }

        .llBrandLogo{
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center;
          border-radius: 999px;
          display: block;
          user-select: none;
          -webkit-user-drag: none;
        }

        .llBrandText{
          display:flex;
          flex-direction: column;
          line-height: 1.02;
          min-width: 0;
        }

        /* ✅ “LunaLive” EXACTEMENT comme DailyWheel title (Syne + gradient) */
        .llBrandText b{
          font-family: 'Syne', system-ui, sans-serif;
          font-weight: 800;
          font-size: 16px;
          letter-spacing: -0.4px;
          line-height: 1;
          background: linear-gradient(105deg, #c4b5fd 0%, #7c5cfc 35%, #5b8ef8 70%, #93c5fd 100%);
          background-size: 220% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          filter:
            drop-shadow(0 0 8px rgba(124,92,252,0.40))
            drop-shadow(0 0 20px rgba(91,142,248,0.15));
          animation: ll-topbar-shimmer 5s ease-in-out infinite;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 160px;
        }

        .llBrandText small{
          font-family: 'Syne', system-ui, sans-serif;
          font-size: 11px;
          font-weight: 500;
          color: rgba(167,155,220,0.52);
          margin-top: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 180px;
        }

        @keyframes ll-topbar-shimmer{
          0%{ background-position: 0% 50%; }
          50%{ background-position: 100% 50%; }
          100%{ background-position: 0% 50%; }
        }

        /* ─────────────────────────────────────────
           Nav (unchanged logic, tuned to match glass)
        ───────────────────────────────────────── */
        .llNav{
          justify-self: center;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 8px;
          border-radius: 999px;
          border: 1px solid rgba(124,92,252,0.14);
          background: rgba(13, 11, 24, 0.58);
          box-shadow: 0 14px 38px rgba(0,0,0,0.35);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        .llNavBtn{
          position: relative;
          display:inline-flex;
          align-items:center;
          justify-content:center;

          height: 42px;
          padding: 0 16px;
          min-width: 104px;

          border-radius: 999px;
          text-decoration: none;
          color: rgba(235,232,255,0.92);

          font-family: 'Syne', system-ui, sans-serif;
          font-weight: 700;
          font-size: 13px;
          letter-spacing: -0.15px;

          opacity: .92;
          border: 1px solid rgba(124,92,252,0.14);
          background: rgba(124,92,252,0.06);

          transition:
            transform 180ms cubic-bezier(.22,1,.36,1),
            background 180ms ease,
            border-color 180ms ease,
            box-shadow 180ms ease,
            opacity 180ms ease,
            filter 180ms ease;

          will-change: transform, box-shadow;
          cursor: pointer;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }

        .llNavBtn:hover{
          opacity: 1;
          transform: translateY(-1px);
          border-color: rgba(124,92,252,0.32);
          background: rgba(124,92,252,0.12);
          box-shadow: 0 12px 32px rgba(0,0,0,0.38), 0 0 0 1px rgba(124,92,252,0.10) inset;
          filter: brightness(1.05);
        }

        .llNavBtn:active{
          transform: translateY(0px) scale(0.985);
          filter: brightness(0.98);
        }

        .llNavBtn.active{
          opacity: 1;
          border-color: rgba(124,92,252,0.36);
          background: rgba(124,92,252,0.16);
          box-shadow: 0 14px 38px rgba(0,0,0,0.42), 0 0 0 1px rgba(124,92,252,0.12) inset;
        }

        .llNavBtn.active:after{
          content:"";
          position:absolute;
          left: 14px;
          right: 14px;
          bottom: 6px;
          height: 2px;
          border-radius: 999px;
          background: linear-gradient(105deg, #c4b5fd 0%, #7c5cfc 35%, #5b8ef8 70%, #93c5fd 100%);
          opacity: .95;
          filter: drop-shadow(0 10px 18px rgba(140,90,255,0.22));
        }

        .llNavBtn:focus-visible{
          outline: none;
          box-shadow:
            0 14px 38px rgba(0,0,0,0.42),
            0 0 0 3px rgba(124,92,252,0.22);
        }

        /* ─────────────────────────────────────────
           Right side
        ───────────────────────────────────────── */
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
          border: 1px solid rgba(124,92,252,0.14);
          background: rgba(13, 11, 24, 0.58);
          color: rgba(235,232,255,0.92);
          box-shadow: 0 12px 32px rgba(0,0,0,0.35);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          font-family: var(--ll-font-display);

          font-size: 12px;
          font-weight: 700;
          letter-spacing: -0.1px;
          white-space: nowrap;
        }

        .llPillRuby{
          border-color: rgba(124,92,252,0.22);
          background:
            linear-gradient(135deg, rgba(124,92,252,0.18), rgba(59,77,200,0.12), rgba(91,142,248,0.08)),
            rgba(13, 11, 24, 0.58);
        }

        .llLoginBtn{
          display:inline-flex;
          align-items:center;
          justify-content:center;
          height: 40px;
          padding: 0 14px;
          border-radius: 999px;
          border: 1px solid rgba(124,92,252,0.32);
          background: linear-gradient(135deg, rgba(124,92,252,0.24), rgba(59,77,200,0.18), rgba(91,142,248,0.10));
          box-shadow: 0 14px 38px rgba(0,0,0,0.45), 0 0 0 1px rgba(124,92,252,0.10) inset;
          color: rgba(235,232,255,0.96);
          cursor:pointer;
          font-family: 'Syne', system-ui, sans-serif;
          font-weight: 800;
          letter-spacing: -0.15px;
          transition: transform 140ms cubic-bezier(.22,1,.36,1), filter 160ms ease, border-color 160ms ease;
        }
        .llLoginBtn:hover{ filter: brightness(1.10); transform: translateY(-1px); border-color: rgba(124,92,252,0.55); }
        .llLoginBtn:active{ transform: translateY(0px); filter: brightness(0.98); }

        .llReportBtn{
          display:inline-flex;
          align-items:center;
          justify-content:center;
          height: 40px;
          width: 40px;
          padding: 0;
          border-radius: 999px;
          border: 1px solid rgba(240,78,78,0.34);
          background: linear-gradient(135deg, rgba(240,78,78,0.16), rgba(220,38,38,0.10));
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          cursor:pointer;
          font-weight: 1100;
          transition: transform 140ms cubic-bezier(.22,1,.36,1), background 160ms ease, border-color 160ms ease, filter 160ms ease, box-shadow 160ms ease;
          box-shadow: 0 4px 14px rgba(240,78,78,0.18), 0 0 0 1px rgba(240,78,78,0.10) inset;
        }
        .llReportBtn:hover{
          border-color: rgba(240,78,78,0.62);
          background: linear-gradient(135deg, rgba(240,78,78,0.28), rgba(220,38,38,0.18));
          transform: translateY(-1px);
          filter: brightness(1.10);
          box-shadow: 0 6px 22px rgba(240,78,78,0.32);
        }
        .llReportBtn:active{ transform: translateY(0px); filter: brightness(0.98); }

        .llReportFlag{
          font-size: 18px;
          line-height: 1;
          opacity: 1;
          color: #ffb4b4;
          filter: drop-shadow(0 2px 6px rgba(240,78,78,0.55));
          text-shadow: 0 0 10px rgba(240,78,78,0.45);
        }

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
          box-shadow: 0 14px 36px rgba(0,0,0,0.55);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          pointer-events: none;
          border: 1px solid rgba(255,255,255,0.22);
          background: rgba(0,0,0,0.24);
        }

        .llPremiumStar span{
          font-size: 12px;
          line-height: 1;
          text-shadow: 0 0 10px rgba(255,255,255,0.20), 0 10px 18px rgba(0,0,0,0.65);
        }

        .llPremiumStar.star--viewer{
          border-color: rgba(255, 210, 110, 0.75);
          background:
            radial-gradient(circle at 30% 30%, rgba(255,255,255,0.28), rgba(0,0,0,0) 60%),
            linear-gradient(135deg, rgba(255, 220, 120, 0.55), rgba(255, 190, 60, 0.35)),
            rgba(0,0,0,0.24);
        }
        .llPremiumStar.star--viewer span{ color: #ffd66a; }

        .llPremiumStar.star--streamer{
          border-color: rgba(110, 185, 255, 0.70);
          background:
            radial-gradient(circle at 30% 30%, rgba(255,255,255,0.24), rgba(0,0,0,0) 60%),
            linear-gradient(135deg, rgba(90, 170, 255, 0.52), rgba(60, 120, 255, 0.30)),
            rgba(0,0,0,0.24);
        }
        .llPremiumStar.star--streamer span{ color: #8fd0ff; }

        .llPremiumStar.star--both{
          border-color: rgba(180, 120, 255, 0.75);
          background:
            radial-gradient(circle at 30% 30%, rgba(255,255,255,0.24), rgba(0,0,0,0) 60%),
            linear-gradient(135deg, rgba(170, 110, 255, 0.55), rgba(255, 90, 180, 0.22)),
            rgba(0,0,0,0.24);
        }
        .llPremiumStar.star--both span{ color: #d7a6ff; }

        .llPremiumStar.star--legacy{
          border-color: rgba(255, 110, 110, 0.75);
          background:
            radial-gradient(circle at 30% 30%, rgba(255,255,255,0.24), rgba(0,0,0,0) 60%),
            linear-gradient(135deg, rgba(255, 120, 120, 0.50), rgba(255, 60, 60, 0.28)),
            rgba(0,0,0,0.24);
        }
        .llPremiumStar.star--legacy span{ color: #ffb2b2; }

        @media (max-width: 820px){
          .llTopbarInner{ padding: 10px 12px; }
          .llNav{ display: none; }
          .llBrandText b{ max-width: 130px; }
          .llBrandText small{ display:none; }
        }
      `}</style>

      <div className="topbarInner llTopbarInner">
        <div className="leftSlot">
          <Link to="/" className="llBrandLink" aria-label="Aller à la page Lives">
            <div className="llBrandMark" aria-hidden>
              <img className="llBrandLogo" src="/logo_onglet.png" alt="" aria-hidden />
            </div>

            {/* ✅ Nouveau bloc brand: même “DNA” que LivesPage */}
            <div className="llBrandText">
              <b>LunaLive</b>
            </div>
          </Link>
        </div>

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

        <div className="rightSlot llRight">
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
              <button
                type="button"
                className="pill llPill llPillQuests"
                onClick={() => setQuestsOpen(true)}
                title="Mes quêtes"
                aria-label="Mes quêtes"
                style={{
                  border: "1px solid rgba(99,102,241,.32)",
                  background: "rgba(99,102,241,.12)",
                  color: "#dde8ff",
                  cursor: "pointer",
                  position: "relative",
                  fontWeight: 700,
                }}
              >
                🎯 {!isMobile && <span style={{ marginLeft: 4 }}>Quêtes</span>}
                {questsClaimable > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: -4,
                      right: -4,
                      minWidth: 18,
                      height: 18,
                      padding: "0 5px",
                      borderRadius: 9,
                      background: "linear-gradient(135deg,#10b981,#34d399)",
                      color: "#fff",
                      fontSize: 11,
                      fontWeight: 800,
                      display: "grid",
                      placeItems: "center",
                      boxShadow: "0 2px 6px rgba(16,185,129,.5)",
                    }}
                  >
                    {questsClaimable}
                  </span>
                )}
              </button>

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

      <ReportModal open={reportOpen} onClose={() => setReportOpen(false)} preset={null} />
      <QuestsModal
        open={questsOpen}
        onClose={() => setQuestsOpen(false)}
        onClaimed={async () => {
          try {
            const r = await getQuests();
            setQuestsClaimable(r.claimableCount || 0);
          } catch {}
        }}
      />
    </header>
  );
}
