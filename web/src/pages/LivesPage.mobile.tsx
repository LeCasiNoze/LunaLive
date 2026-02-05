// web/src/pages/LivesPage.mobile.tsx
import * as React from "react";
import { Link } from "react-router-dom";

import { formatViewers } from "../lib/format";
import { svgThumb } from "../lib/thumb";

import { DailyWheelCard } from "../components/DailyWheelCard";
import { DailyBonusAccessCard } from "../components/DailyBonusAccessCard";
import type { LiveCardVM, ClipVM } from "./LivesPage";

function absolutize(apiBase: string, url: string | null) {
  if (!url) return null;
  const u = String(url);
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/")) return `${apiBase}${u}`;
  return u;
}

function fmtDuration(sec: number) {
  sec = Math.max(0, Math.floor(Number(sec || 0)));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h) return `${h}:${String(mm).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${mm}:${String(s).padStart(2, "0")}`;
}

function timeAgo(ms: number) {
  const d = Date.now() - (Number(ms || 0) || 0);
  const mins = Math.floor(d / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} h`;
  const days = Math.floor(h / 24);
  return `${days} j`;
}

/**
 * ✅ Avatar EXACTEMENT comme desktop LivesPage.tsx :
 * - prend live.avatarUrl ou live.avatar_url
 * - absolutize(apiBase, ...)
 * - fallback svgThumb(displayName)
 * - onError => svgThumb(displayName)
 */
function AvatarChip({
  apiBase,
  live,
  size = 22,
}: {
  apiBase: string;
  live: any;
  size?: number;
}) {
  const name = String(live?.displayName ?? live?.slug ?? "Streamer");

  const raw =
    (live as any).avatarUrl != null
      ? String((live as any).avatarUrl)
      : (live as any).avatar_url != null
      ? String((live as any).avatar_url)
      : null;

  const abs = raw ? absolutize(apiBase, raw) || raw : null;
  const fallback = svgThumb(name);

  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: Math.floor(size / 2),
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(0,0,0,0.28)",
        overflow: "hidden",
        display: "inline-grid",
        placeItems: "center",
        flex: "0 0 auto",
      }}
      title={name}
    >
      <img
        src={abs || fallback}
        alt=""
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).src = fallback;
        }}
      />
    </span>
  );
}

function Pill({
  tone,
  children,
  title,
}: {
  tone: "neutral" | "live" | "brand" | "gold";
  children: React.ReactNode;
  title?: string;
}) {
  const map: Record<string, { bg: string; bd: string }> = {
    brand: { bg: "rgba(140,90,255,0.14)", bd: "rgba(140,90,255,0.28)" },
    live: { bg: "rgba(255,90,180,0.14)", bd: "rgba(255,90,180,0.26)" },
    gold: { bg: "rgba(255,210,120,0.14)", bd: "rgba(255,210,120,0.28)" },
    neutral: { bg: "rgba(255,255,255,0.06)", bd: "rgba(255,255,255,0.12)" },
  };
  const t = map[tone] ?? map.neutral;
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 11px",
        borderRadius: 999,
        border: `1px solid ${t.bd}`,
        background: t.bg,
        fontSize: 12,
        fontWeight: 1100,
        whiteSpace: "nowrap",
        backdropFilter: "blur(10px)",
      }}
    >
      {children}
    </span>
  );
}

function GlassCard({
  children,
  style,
  className,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        borderRadius: 20,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(0,0,0,0.10))",
        boxShadow: "0 18px 55px rgba(0,0,0,0.28)",
        backdropFilter: "blur(10px)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function LiveBackdrop({ url }: { url: string }) {
  return (
    <>
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url(${url})`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
          backgroundSize: "cover",
          opacity: 0.92,
          filter: "contrast(1.06) saturate(1.18) brightness(1.02)",
          transform: "scale(1.03)",
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(90deg, rgba(0,0,0,0.55), rgba(0,0,0,0.14) 55%, rgba(0,0,0,0.62)), radial-gradient(700px 320px at 50% 0%, rgba(255,255,255,0.06), rgba(0,0,0,0) 60%)",
          pointerEvents: "none",
        }}
      />
    </>
  );
}

function Sheet({
  title,
  onClose,
  children,
  zIndex,
}: {
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  zIndex: number;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="mSheetBackdrop" onClick={onClose} role="presentation" style={{ zIndex, alignItems: "end" }}>
      <div
        className="mSheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title || "Menu"}
      >
        <div className="mSheetTop">
          <div style={{ fontWeight: 1250, letterSpacing: -0.2 }}>{title || "Menu"}</div>
          <button className="mIconBtn" onClick={onClose} type="button" aria-label="Fermer">
            ✕
          </button>
        </div>
        <div className="mSheetBody">{children}</div>
      </div>
    </div>
  );
}

function Section({
  title,
  right,
  defaultOpen,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(!!defaultOpen);
  return (
    <div className="mAcc">
      <button type="button" className="mAccBtn" onClick={() => setOpen((v) => !v)}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          <span className="mChevron" aria-hidden style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>
            ▸
          </span>
          <span style={{ fontWeight: 1200, letterSpacing: -0.2 }}>{title}</span>
        </span>
        <span style={{ opacity: 0.85 }}>{right}</span>
      </button>
      {open ? <div className="mAccBody">{children}</div> : null}
    </div>
  );
}

type Routes = {
  lives?: string;
  browse?: string;
  dashboard?: string;
  profile?: string;
  report?: string;
  connections?: string;
};

export default function LivesPageMobile(props: {
  apiBase: string;

  lives: LiveCardVM[];
  loading: boolean;
  refreshing: boolean;
  err: string | null;

  totals: { liveCount: number; viewersTotal: number };
  featuredLives: LiveCardVM[];
  normalLives: LiveCardVM[];

  clipsTop4: ClipVM[];
  clipsTotal: number;
  clipsLoading: boolean;
  extraClipsCount: number;
  hasMoreThan4: boolean;

  onOpenMonthList: () => void;
  onOpenClip: (c: ClipVM) => void;

  routes?: Routes;
  me?: { username?: string | null; avatarUrl?: string | null } | null;
}) {
  const {
    apiBase,
    lives,
    loading,
    refreshing,
    err,
    totals,
    featuredLives,
    normalLives,
    clipsTop4,
    clipsTotal,
    clipsLoading,
    extraClipsCount,
    hasMoreThan4,
    onOpenMonthList,
    onOpenClip,
    routes,
    me,
  } = props;

  const r: Required<Routes> = {
    lives: routes?.lives ?? "/",
    browse: routes?.browse ?? "/browse",
    dashboard: routes?.dashboard ?? "/dashboard",
    profile: routes?.profile ?? "/me",
    report: routes?.report ?? "/report",
    connections: routes?.connections ?? "/connections",
  };

  const [openMenu, setOpenMenu] = React.useState(false);

  const canShowGrid = !(loading && lives.length === 0);

  // --- Clips UI helpers
  const clipsTop3 = React.useMemo(() => clipsTop4.slice(0, 3), [clipsTop4]);
  const clipBig = clipsTop3[0] ?? null;
  const clipSm1 = clipsTop3[1] ?? null;
  const clipSm2 = clipsTop3[2] ?? null;

  function onPickClipFromGrid(c: ClipVM | null) {
    if (!c) return;
    if (hasMoreThan4) onOpenMonthList();
    else onOpenClip(c);
  }

  function clipThumb(c: ClipVM) {
    const raw = c.thumbUrl ? absolutize(apiBase, c.thumbUrl) || c.thumbUrl : null;
    return raw || svgThumb(c.streamerName || c.streamerSlug || "Clip");
  }

  function clipWho(c: ClipVM) {
    return c.streamerName || c.streamerSlug || "Streamer";
  }

  function clipLikes(c: ClipVM) {
    return Number((c as any).likesCount ?? 0) || 0;
  }

  return (
    <main className="container livesMobile">
      <style>{`
        .livesMobile{ position:relative; padding-bottom: calc(26px + env(safe-area-inset-bottom)); }
        .livesMobile::before{
          content:""; position:fixed; inset:0; z-index:0; pointer-events:none;
          background:
            radial-gradient(900px 360px at 18% 0%, rgba(255,90,180,0.22), rgba(0,0,0,0) 62%),
            radial-gradient(900px 420px at 80% 10%, rgba(80,160,255,0.22), rgba(0,0,0,0) 62%),
            radial-gradient(900px 520px at 50% 95%, rgba(140,90,255,0.22), rgba(0,0,0,0) 64%),
            linear-gradient(180deg, rgba(0,0,0,0.0), rgba(0,0,0,0.10));
        }

        .mWrap{
          position:relative; z-index:1;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.10);
          background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(0,0,0,0.10));
          box-shadow: 0 20px 70px rgba(0,0,0,0.32);
          backdrop-filter: blur(10px);
          padding: 12px;
          overflow:hidden;
        }

        /* --- Clips hero (au-dessus de Lives) --- */
        .mClipsCard{
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,0.12);
          background:
            radial-gradient(700px 240px at 20% 0%, rgba(255,90,180,0.16), rgba(0,0,0,0) 60%),
            radial-gradient(700px 240px at 90% 20%, rgba(80,160,255,0.14), rgba(0,0,0,0) 62%),
            linear-gradient(180deg, rgba(255,255,255,0.07), rgba(0,0,0,0.14));
          box-shadow: 0 20px 65px rgba(0,0,0,0.35);
          overflow:hidden;
        }
        .mClipsTop{
          display:flex; align-items:center; justify-content:space-between; gap:10px;
          padding: 12px 12px 10px;
        }
        .mClipsTitle{
          display:flex; align-items:baseline; gap:10px; min-width:0;
          font-weight: 1300; letter-spacing:-0.2px;
        }
        .mClipsTitle span{ white-space:nowrap; }
        .mClipsCount{
          font-size: 12px; opacity: 0.8; font-weight: 1000; white-space: nowrap;
          padding: 6px 10px; border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.25);
          backdrop-filter: blur(10px);
        }
        .mClipsBtn{
          display:inline-flex; align-items:center; justify-content:center;
          padding: 10px 12px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.92);
          font-weight: 1150;
          cursor:pointer;
          text-decoration:none;
          min-height: 40px;
          white-space: nowrap;
        }
        .mClipsBtn:active{ transform: translateY(1px); }

        .mClipsLayout{
          padding: 0 12px 12px;
          display:grid;
          grid-template-columns: 1.35fr 1fr;
          gap: 10px;
        }
        @media (max-width: 380px){
          .mClipsLayout{ grid-template-columns: 1fr; }
        }

        .mClipBig, .mClipSm{
          position: relative;
          overflow: hidden;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(0,0,0,0.18);
          cursor: pointer;
          padding: 0;
        }
        .mClipBig{ min-height: 180px; }
        .mClipSm{ min-height: 86px; border-radius: 16px; }

        .mClipBg{
          position:absolute; inset:0;
          background-position:center; background-size:cover; background-repeat:no-repeat;
          opacity: 0.92;
          transform: scale(1.03);
          filter: contrast(1.05) saturate(1.15);
        }
        .mClipOverlay{
          position:absolute; inset:0;
          background:
            radial-gradient(520px 200px at 30% 0%, rgba(255,90,180,0.18), rgba(0,0,0,0) 62%),
            radial-gradient(520px 200px at 95% 20%, rgba(80,160,255,0.14), rgba(0,0,0,0) 60%),
            linear-gradient(180deg, rgba(0,0,0,0.08), rgba(0,0,0,0.55));
          pointer-events:none;
        }
        .mClipTopBadges{
          position:absolute; top:10px; left:10px; right:10px;
          display:flex; justify-content:space-between; align-items:center; gap:10px;
          pointer-events:none;
        }
        .mClipBadge{
          display:inline-flex; align-items:center; gap:6px;
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(0,0,0,0.52);
          border: 1px solid rgba(255,255,255,0.12);
          backdrop-filter: blur(10px);
          font-weight: 1100;
          font-size: 12px;
          white-space: nowrap;
        }
        .mClipPlay{
          width: 44px; height: 44px;
          border-radius: 16px;
          display:grid; place-items:center;
          background: rgba(0,0,0,0.55);
          border: 1px solid rgba(255,255,255,0.12);
          backdrop-filter: blur(10px);
          box-shadow: 0 16px 45px rgba(0,0,0,0.35);
          pointer-events:none;
        }
        .mClipBottom{
          position:absolute; left:12px; right:12px; bottom:12px;
          display:grid; gap:4px;
          pointer-events:none;
        }
        .mClipName{
          font-weight: 1250;
          letter-spacing: -0.2px;
          font-size: 12px;
          opacity: 0.95;
          display:-webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
          overflow:hidden;
        }
        .mClipMeta{
          font-size: 12px;
          opacity: 0.78;
          font-weight: 950;
          overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
          display:flex; gap:8px; align-items:center; flex-wrap:wrap;
        }

        .mClipsRightCol{ display:grid; gap:10px; }
        .mClipsFooter{
          padding: 0 12px 12px;
          display:flex; align-items:center; justify-content:space-between; gap:10px;
        }
        .mClipsFooterNote{
          font-size: 12px;
          opacity: 0.80;
          font-weight: 950;
          display:flex; align-items:center; gap:8px;
        }

        /* --- Banner Lives (sous les clips) --- */
        .mBanner{
          margin-top: 12px;
          padding: 12px 12px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.10);
          background:
            radial-gradient(900px 320px at 20% 0%, rgba(140,90,255,0.18), rgba(0,0,0,0) 60%),
            linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.12));
          box-shadow: 0 18px 55px rgba(0,0,0,0.25);
          backdrop-filter: blur(10px);
          display:flex; justify-content:space-between; align-items:center; gap:12px;
        }
        .mBannerLeft{ min-width:0; }
        .mH1{
          margin:0; font-weight:1500; letter-spacing:-0.6px; font-size: 26px; line-height:1.05;
          background: linear-gradient(90deg, rgba(255,90,180,1), rgba(180,140,255,1), rgba(80,160,255,1));
          -webkit-background-clip:text; background-clip:text; color:transparent;
          filter: drop-shadow(0 10px 24px rgba(0,0,0,0.35));
        }
        .mSub{
          margin-top:6px; font-size:12px; opacity:0.82; font-weight:900; display:flex; gap:10px; flex-wrap:wrap;
        }
        .mStats{ display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
        .mPing{
          width:8px; height:8px; border-radius:999px;
          background: rgba(255,90,180,0.95);
          box-shadow: 0 0 0 6px rgba(255,90,180,0.14);
          display:inline-block;
        }

        .mSectionTop{ display:flex; justify-content:space-between; align-items:baseline; gap:10px; margin: 14px 2px 10px; }
        .mSectionTop h2{ margin:0; font-size: 12px; font-weight: 1300; text-transform: uppercase; opacity:0.92; letter-spacing:-0.2px; }
        .mHint{ font-size:12px; opacity:0.72; font-weight:900; }

        .mGrid{ display:grid; gap:10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        @media (max-width: 380px){ .mGrid{ grid-template-columns: 1fr; } }

        .mCardLink{ text-decoration:none; color:inherit; display:block; }
        .mThumb{
          position:relative; overflow:hidden;
          border-radius: 16px;
          min-height: 116px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(0,0,0,0.18);
        }
        .mTopRow{
          position:absolute; top:10px; left:10px; right:10px;
          display:flex; justify-content:space-between; align-items:center; gap:10px;
          pointer-events:none;
        }
        .mMeta{ padding: 10px 8px 8px; display:grid; gap:6px; }
        .mMetaTop{ display:flex; justify-content:space-between; align-items:baseline; gap:10px; min-width:0; }
        .mName{
          font-weight: 1200; letter-spacing:-0.2px; font-size: 13px;
          overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0;
        }
        .mViewers{ font-size:12px; font-weight:1100; opacity:0.92; white-space:nowrap; }
        .mTitle{
          font-weight: 900; font-size: 12px; line-height:1.25; opacity:0.92;
          display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
          min-height: 30px;
        }

        /* ✅ FAB: plus "3 points" + plus bas pour être atteignable */
        .mFab{
          position:fixed; right: 12px; bottom: calc(12px + env(safe-area-inset-bottom));
          z-index: 60;
          width: 56px; height: 56px; border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(20,20,26,0.72);
          color: rgba(255,255,255,0.95);
          backdrop-filter: blur(12px);
          box-shadow: 0 18px 55px rgba(0,0,0,0.45);
          cursor:pointer;
          font-size: 20px; font-weight: 1200;
        }
        .mFab:active{ transform: translateY(1px); }

        /* Sheet */
        .mSheetBackdrop{
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.62);
          display: grid;
          padding: 14px;
          backdrop-filter: blur(10px);
        }
        .mSheet{
          width: min(720px, 100%);
          max-height: min(92vh, 860px);
          overflow: hidden;
          border-top-left-radius: 18px;
          border-top-right-radius: 18px;
          border: 1px solid rgba(255,255,255,0.12);
          background: linear-gradient(180deg, rgba(30,30,40,0.90), rgba(10,10,14,0.94));
          box-shadow: 0 30px 90px rgba(0,0,0,0.55);
        }
        .mSheetTop{
          display:flex;
          justify-content: space-betweenedesktop LivesPage.tsx
          align-items: center;
          padding: 12px 14px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .mSheetBody{
          overflow: auto;
          max-height: calc(92vh - 60px);
          padding: 12px;
          padding-bottom: calc(18px + env(safe-area-inset-bottom));
        }
        .mIconBtn{
          width: 34px;
          height: 34px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.92);
          cursor: pointer;
          font-weight: 1100;
        }

        /* Menu items */
        .mMenuGrid{ display:grid; gap:10px; }
        .mMenuRow{ display:flex; gap:10px; }
        .mMenuBtn{
          flex:1;
          display:flex; align-items:center; justify-content:space-between; gap:10px;
          padding: 12px 12px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.92);
          text-decoration: none;
          font-weight: 1150;
          cursor:pointer;
        }
        .mMenuBtn:active{ transform: translateY(1px); }
        .mMenuLeft{ display:inline-flex; align-items:center; gap:10px; min-width:0; }
        .mMenuLabel{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .mMenuMeta{ font-size: 12px; opacity: 0.82; font-weight: 1000; white-space:nowrap; }

        /* Accordion */
        .mAcc{
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.04);
          overflow: hidden;
        }
        .mAccBtn{
          width:100%;
          display:flex; align-items:center; justify-content:space-between; gap:12px;
          padding: 12px 12px;
          background: transparent;
          border: 0;
          color: rgba(255,255,255,0.92);
          cursor:pointer;
        }
        .mChevron{
          width: 18px; height: 18px;
          display:inline-grid; place-items:center;
          opacity: 0.9;
          transition: transform 140ms ease;
        }
        .mAccBody{
          padding: 12px;
          border-top: 1px solid rgba(255,255,255,0.08);
        }

        /* Profile mini */
        .mMeRow{
          display:flex; align-items:center; gap:10px;
          padding: 12px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.04);
        }
        .mMeAva{
          width: 44px; height: 44px; border-radius: 16px; overflow:hidden;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(0,0,0,0.35);
          flex: 0 0 auto;
        }
        .mMeAva img{ width:100%; height:100%; object-fit:cover; display:block; }
        .mMeName{
          font-weight: 1250;
          letter-spacing: -0.2px;
          overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
        }
        .mMeActions{ display:flex; gap:10px; margin-top:10px; }
      `}</style>

      <div className="mWrap">
        {/* ✅ CLIPS (AU-DESSUS DE TOUT) */}
        <div className="mClipsCard">
          <div className="mClipsTop">
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <div className="mClipsTitle" style={{ minWidth: 0 }}>
                <span style={{ opacity: 0.9 }}>🎬</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>Clips du mois</span>
              </div>
              <div className="mClipsCount" title="Nombre de clips du mois">
                {clipsLoading ? "…" : `${clipsTotal || 0} clip(s)`}
              </div>
            </div>

            <button
              type="button"
              className="mClipsBtn"
              onClick={() => onOpenMonthList()}
              aria-label="Voir tous les clips du mois"
              title="Voir tous les clips du mois"
            >
              Voir tout
            </button>
          </div>

          {clipsTop4.length === 0 ? (
            <div style={{ padding: "0 12px 12px" }}>
              <div className="mutedSmall" style={{ opacity: 0.85 }}>
                {clipsLoading ? "Chargement…" : "Aucun clip pour le moment."}
              </div>
            </div>
          ) : (
            <>
              <div className="mClipsLayout">
                {/* Big left */}
                {clipBig ? (
                  <button
                    type="button"
                    className="mClipBig"
                    onClick={() => onPickClipFromGrid(clipBig)}
                    style={{ border: 0, background: "transparent", textAlign: "left" }}
                    title={clipBig.title || "Clip"}
                  >
                    <div className="mClipBg" style={{ backgroundImage: `url(${clipThumb(clipBig)})` }} />
                    <div className="mClipOverlay" aria-hidden />
                    <div className="mClipTopBadges">
                      <span className="mClipBadge" title="Likes">
                        ❤️ {clipLikes(clipBig)}
                      </span>
                      <span className="mClipPlay" aria-hidden>
                        ▶
                      </span>
                    </div>
                    <div className="mClipBottom">
                      <div className="mClipName">{clipBig.title || "(sans titre)"}</div>
                      <div className="mClipMeta">
                        <span style={{ opacity: 0.92 }}>{clipWho(clipBig)}</span>
                        <span style={{ opacity: 0.8 }}>•</span>
                        <span>{fmtDuration(clipBig.durationSec)}</span>
                        <span style={{ opacity: 0.8 }}>•</span>
                        <span>{timeAgo(clipBig.createdAtMs)}</span>
                      </div>
                    </div>
                  </button>
                ) : (
                  <div />
                )}

                {/* Right column (2 small) */}
                <div className="mClipsRightCol">
                  {[clipSm1, clipSm2].map((c, idx) => {
                    if (!c) {
                      return (
                        <div
                          key={`empty-${idx}`}
                          className="mClipSm"
                          style={{
                            opacity: 0.25,
                            display: "grid",
                            placeItems: "center",
                            pointerEvents: "none",
                          }}
                        >
                          <span className="mutedSmall">—</span>
                        </div>
                      );
                    }

                    return (
                      <button
                        key={c.id}
                        type="button"
                        className="mClipSm"
                        onClick={() => onPickClipFromGrid(c)}
                        style={{ border: 0, background: "transparent", textAlign: "left" }}
                        title={c.title || "Clip"}
                      >
                        <div className="mClipBg" style={{ backgroundImage: `url(${clipThumb(c)})` }} />
                        <div className="mClipOverlay" aria-hidden style={{ opacity: 0.9 }} />
                        <div className="mClipTopBadges">
                          <span className="mClipBadge" title="Likes">
                            ❤️ {clipLikes(c)}
                          </span>
                          <span className="mClipBadge" title="Durée">
                            ⏱ {fmtDuration(c.durationSec)}
                          </span>
                        </div>
                        <div className="mClipBottom" style={{ bottom: 10, left: 10, right: 10 }}>
                          <div className="mClipName" style={{ fontSize: 12, WebkitLineClamp: 1 as any }}>
                            {c.title || "(sans titre)"}
                          </div>
                          <div className="mClipMeta" style={{ gap: 6 }}>
                            <span style={{ opacity: 0.92 }}>{clipWho(c)}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mClipsFooter">
                <div className="mClipsFooterNote">
                  {extraClipsCount > 0 ? (
                    <>
                      <span style={{ opacity: 0.9 }}>＋{extraClipsCount}</span>
                      <span style={{ opacity: 0.8 }}>autre(s) clip(s)</span>
                    </>
                  ) : (
                    <span style={{ opacity: 0.8 }}>Top du mois • tri par ❤️</span>
                  )}
                </div>

                <button
                  type="button"
                  className="mClipsBtn"
                  onClick={() => onOpenMonthList()}
                  style={{ padding: "10px 12px" }}
                  title="Ouvrir la liste des clips du mois"
                >
                  Ouvrir ▶
                </button>
              </div>
            </>
          )}
        </div>

        {/* ✅ BANNIÈRE LIVES (SOUS LES CLIPS) */}
        <div className="mBanner">
          <div className="mBannerLeft">
            <h1 className="mH1">Lives</h1>
            <div className="mSub">
              <span>Plateforme casino FR</span>
              {refreshing ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span className="mPing" aria-hidden /> refresh
                </span>
              ) : null}
            </div>
          </div>

          <div className="mStats">
            <Pill tone="live" title="Lives en direct">
              🔴 <b>{totals.liveCount}</b>
            </Pill>
            <Pill tone="neutral" title="Viewers total">
              👁 <b>{formatViewers(totals.viewersTotal)}</b>
            </Pill>
          </div>
        </div>

        {err ? (
          <div className="alert" style={{ marginTop: 12 }}>
            {err}
          </div>
        ) : null}

        {featuredLives.length > 0 ? (
          <>
            <div className="mSectionTop">
              <h2>✨ Mise en avant</h2>
              <div className="mHint">{featuredLives.length}</div>
            </div>

            <section className="mGrid">
              {featuredLives.map((live) => (
                <Link key={live.id} to={`/s/${live.slug}`} className="mCardLink">
                  <GlassCard
                    style={{
                      padding: 10,
                      border: "1px solid rgba(255,210,120,0.28)",
                      background:
                        "radial-gradient(700px 220px at 20% 0%, rgba(255,210,120,0.14), rgba(0,0,0,0) 60%), linear-gradient(180deg, rgba(255,255,255,0.07), rgba(0,0,0,0.10))",
                    }}
                  >
                    <div className="mThumb" style={{ borderColor: "rgba(255,210,120,0.18)" }}>
                      <LiveBackdrop url={(live as any).thumbFinal} />
                      <div className="mTopRow">
                        <Pill tone="gold" title="Featured">
                          ✨
                        </Pill>
                        {(live as any).durationLabel ? (
                          <Pill tone="neutral" title="Durée">
                            ⏱ {(live as any).durationLabel}
                          </Pill>
                        ) : (
                          <span />
                        )}
                      </div>
                    </div>

                    <div className="mMeta">
                      <div className="mMetaTop">
                        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                          <AvatarChip apiBase={apiBase} live={live} size={22} />
                          <div className="mName" title={(live as any).displayName} style={{ minWidth: 0 }}>
                            {(live as any).displayName}
                          </div>
                        </div>

                        <div className="mViewers" title="Viewers">
                          👁 {formatViewers(Number((live as any).viewers || 0))}
                        </div>
                      </div>
                      <div className="mTitle" title={(live as any).title || ""}>
                        {(live as any).title || "—"}
                      </div>
                    </div>
                  </GlassCard>
                </Link>
              ))}
            </section>
          </>
        ) : null}

        <div className="mSectionTop">
          <h2>🔴 En direct</h2>
          <div className="mHint">{normalLives.length}</div>
        </div>

        {!canShowGrid ? (
          <div className="mutedSmall" style={{ opacity: 0.85 }}>
            Chargement…
          </div>
        ) : (
          <section className="mGrid">
            {normalLives.map((live) => (
              <Link key={live.id} to={`/s/${live.slug}`} className="mCardLink">
                <GlassCard
                  style={{
                    padding: 10,
                    border: "1px solid rgba(255,90,180,0.18)",
                    background:
                      "radial-gradient(700px 220px at 20% 0%, rgba(255,90,180,0.14), rgba(0,0,0,0) 60%), linear-gradient(180deg, rgba(255,255,255,0.07), rgba(0,0,0,0.10))",
                  }}
                >
                  <div className="mThumb">
                    <LiveBackdrop url={(live as any).thumbFinal} />
                    <div className="mTopRow">
                      <Pill tone="live" title="En direct">
                        🔴 LIVE
                      </Pill>
                      {(live as any).durationLabel ? (
                        <Pill tone="neutral" title="Durée">
                          ⏱ {(live as any).durationLabel}
                        </Pill>
                      ) : (
                        <span />
                      )}
                    </div>
                  </div>

                  <div className="mMeta">
                    <div className="mMetaTop">
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <AvatarChip apiBase={apiBase} live={live} size={22} />
                        <div className="mName" title={(live as any).displayName} style={{ minWidth: 0 }}>
                          {(live as any).displayName}
                        </div>
                      </div>

                      <div className="mViewers" title="Viewers">
                        👁 {formatViewers(Number((live as any).viewers || 0))}
                      </div>
                    </div>
                    <div className="mTitle" title={(live as any).title || ""}>
                      {(live as any).title || "—"}
                    </div>
                  </div>
                </GlassCard>
              </Link>
            ))}
          </section>
        )}
      </div>

      {/* ✅ Floating "3 dots" menu */}
      <button className="mFab" type="button" onClick={() => setOpenMenu(true)} aria-label="Ouvrir le menu">
        ⋯
      </button>

      {openMenu ? (
        <Sheet title="Menu" onClose={() => setOpenMenu(false)} zIndex={78}>
          <div className="mMenuGrid">
            {/* ✅ Quick nav */}
            <div className="mMenuRow">
              <Link to={r.lives} className="mMenuBtn" onClick={() => setOpenMenu(false)} aria-label="Aller à Lives">
                <span className="mMenuLeft">
                  <span aria-hidden>🔴</span>
                  <span className="mMenuLabel">Lives</span>
                </span>
                <span className="mMenuMeta">{totals.liveCount}</span>
              </Link>

              <Link to={r.browse} className="mMenuBtn" onClick={() => setOpenMenu(false)} aria-label="Aller à Browse">
                <span className="mMenuLeft">
                  <span aria-hidden>🧭</span>
                  <span className="mMenuLabel">Browse</span>
                </span>
                <span className="mMenuMeta">▶</span>
              </Link>
            </div>

            {/* ✅ Economy inside accordion */}
            <Section title="Récompenses" right={<span style={{ opacity: 0.8 }}>Wheel • Bonus</span>} defaultOpen>
              <div style={{ display: "grid", gap: 12 }}>
                <DailyWheelCard />
                <DailyBonusAccessCard />
              </div>
            </Section>

            {/* ✅ Profil accessible */}
            <Section title="Mon compte" right={<span style={{ opacity: 0.8 }}>Profil • Dashboard</span>} defaultOpen>
              <div className="mMeRow">
                <div className="mMeAva" aria-hidden>
                  {me?.avatarUrl ? (
                    <img
                      src={absolutize(apiBase, me.avatarUrl) || me.avatarUrl || ""}
                      alt=""
                      onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                    />
                  ) : null}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="mMeName">{me?.username || "Profil"}</div>
                  <div className="mutedSmall" style={{ opacity: 0.78, marginTop: 2 }}>
                    Options • connexions • support
                  </div>

                  <div className="mMeActions">
                    <Link
                      to={r.profile}
                      className="mMenuBtn"
                      style={{ padding: "10px 12px", borderRadius: 16 }}
                      onClick={() => setOpenMenu(false)}
                    >
                      <span className="mMenuLeft">
                        <span aria-hidden>👤</span>
                        <span className="mMenuLabel">Profil</span>
                      </span>
                      <span className="mMenuMeta">▶</span>
                    </Link>

                    <Link
                      to={r.dashboard}
                      className="mMenuBtn"
                      style={{ padding: "10px 12px", borderRadius: 16 }}
                      onClick={() => setOpenMenu(false)}
                    >
                      <span className="mMenuLeft">
                        <span aria-hidden>🧩</span>
                        <span className="mMenuLabel">Dashboard</span>
                      </span>
                      <span className="mMenuMeta">▶</span>
                    </Link>
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                <Link to={r.connections} className="mMenuBtn" onClick={() => setOpenMenu(false)}>
                  <span className="mMenuLeft">
                    <span aria-hidden>🔗</span>
                    <span className="mMenuLabel">Connexions</span>
                  </span>
                  <span className="mMenuMeta">▶</span>
                </Link>

                <Link to={r.report} className="mMenuBtn" onClick={() => setOpenMenu(false)}>
                  <span className="mMenuLeft">
                    <span aria-hidden>🚩</span>
                    <span className="mMenuLabel">Signaler un problème</span>
                  </span>
                  <span className="mMenuMeta">▶</span>
                </Link>
              </div>
            </Section>
          </div>
        </Sheet>
      ) : null}
    </main>
  );
}
