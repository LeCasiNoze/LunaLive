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
  onClose,
  children,
  zIndex,
}: {
  onClose: () => void;
  children: React.ReactNode;
  zIndex: number;
}) {
  return (
    <div className="chatSheetBackdrop" onClick={onClose} role="presentation" style={{ zIndex, alignItems: "end" }}>
      <div
        className="chatSheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          width: "min(720px, 100%)",
          maxHeight: "min(92vh, 860px)",
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
        }}
      >
        <div className="chatSheetTop" style={{ gap: 10 }}>
          <div style={{ fontWeight: 1200, letterSpacing: -0.2 }}>Menu</div>
          <button className="iconBtn" onClick={onClose} type="button" aria-label="Fermer">
            ✕
          </button>
        </div>
        <div className="chatSheetBody" style={{ padding: 12 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

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
    clipsLoading,
    extraClipsCount,
    hasMoreThan4,
    onOpenMonthList,
    onOpenClip,
  } = props;

  const [openMenu, setOpenMenu] = React.useState(false);

  return (
    <main className="container livesMobile">
      <style>{`
        .livesMobile{ position:relative; padding-bottom: calc(24px + env(safe-area-inset-bottom)); }
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

        .mTop{
          display:flex; justify-content:space-between; align-items:flex-start; gap:12px;
        }
        .mH1{
          margin:0; font-weight:1500; letter-spacing:-0.6px; font-size: 26px; line-height:1.05;
          background: linear-gradient(90deg, rgba(255,90,180,1), rgba(180,140,255,1), rgba(80,160,255,1));
          -webkit-background-clip:text; background-clip:text; color:transparent;
          filter: drop-shadow(0 10px 24px rgba(0,0,0,0.35));
        }
        .mSub{ margin-top:6px; font-size:12px; opacity:0.82; font-weight:900; display:flex; gap:10px; flex-wrap:wrap; }
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

        .mFab{
          position:fixed; right: 14px; bottom: calc(14px + env(safe-area-inset-bottom));
          z-index: 60;
          width: 56px; height: 56px; border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(20,20,26,0.72);
          color: rgba(255,255,255,0.95);
          backdrop-filter: blur(12px);
          box-shadow: 0 18px 55px rgba(0,0,0,0.45);
          cursor:pointer;
          font-size: 18px; font-weight: 1200;
        }
        .mFab:active{ transform: translateY(1px); }

        .mClipsGrid{ margin-top:12px; display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
        .mClipTile{
          position:relative; border-radius: 16px; overflow:hidden;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.06);
          min-height: 90px;
        }
        .mClipThumb{
          position:absolute; inset:0;
          background-position:center; background-size:cover; background-repeat:no-repeat;
          opacity: 0.92;
          transform: scale(1.03);
          filter: contrast(1.03) saturate(1.12);
        }
        .mClipTile::before{
          content:""; position:absolute; inset:0;
          background: radial-gradient(420px 160px at 30% 0%, rgba(255,90,180,0.16), rgba(0,0,0,0) 60%),
                      radial-gradient(420px 160px at 90% 20%, rgba(80,160,255,0.14), rgba(0,0,0,0) 60%),
                      linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.22));
          pointer-events:none;
        }
        .mClipPlay{
          position:absolute; inset:0; display:grid; place-items:center; pointer-events:none;
        }
        .mClipPlay span{
          width: 42px; height: 42px; border-radius: 999px;
          display:grid; place-items:center;
          background: rgba(0,0,0,0.55);
          border: 1px solid rgba(255,255,255,0.12);
          backdrop-filter: blur(10px);
          box-shadow: 0 16px 40px rgba(0,0,0,0.35);
          font-size: 16px;
        }

        /* Modal styles (réutilise tes modales existantes LivesPage.tsx) */
        .chatSheetBackdrop{
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.62);
          display: grid;
          place-items: center;
          padding: 18px;
          backdrop-filter: blur(10px);
        }
        .chatSheet{
          width: min(980px, 100%);
          max-height: min(92vh, 860px);
          overflow: hidden;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.12);
          background: linear-gradient(180deg, rgba(30,30,40,0.85), rgba(10,10,14,0.92));
          box-shadow: 0 30px 90px rgba(0,0,0,0.55);
        }
        .chatSheetTop{
          display:flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 14px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .chatSheetBody{
          overflow: auto;
          max-height: calc(92vh - 60px);
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
      `}</style>

      <div className="mWrap">
        <div className="mTop">
          <div style={{ minWidth: 0 }}>
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
                      <LiveBackdrop url={live.thumbFinal} />
                      <div className="mTopRow">
                        <Pill tone="gold" title="Featured">
                          ✨
                        </Pill>
                        {live.durationLabel ? (
                          <Pill tone="neutral" title="Durée">
                            ⏱ {live.durationLabel}
                          </Pill>
                        ) : (
                          <span />
                        )}
                      </div>
                    </div>

                    <div className="mMeta">
                      <div className="mMetaTop">
                        <div className="mName" title={live.displayName}>
                          {live.displayName}
                        </div>
                        <div className="mViewers" title="Viewers">
                          👁 {formatViewers(live.viewers)}
                        </div>
                      </div>
                      <div className="mTitle" title={live.title || ""}>
                        {live.title || "—"}
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

        {loading && lives.length === 0 ? (
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
                    <LiveBackdrop url={live.thumbFinal} />
                    <div className="mTopRow">
                      <Pill tone="live" title="En direct">
                        🔴 LIVE
                      </Pill>
                      {live.durationLabel ? (
                        <Pill tone="neutral" title="Durée">
                          ⏱ {live.durationLabel}
                        </Pill>
                      ) : (
                        <span />
                      )}
                    </div>
                  </div>

                  <div className="mMeta">
                    <div className="mMetaTop">
                      <div className="mName" title={live.displayName}>
                        {live.displayName}
                      </div>
                      <div className="mViewers" title="Viewers">
                        👁 {formatViewers(live.viewers)}
                      </div>
                    </div>
                    <div className="mTitle" title={live.title || ""}>
                      {live.title || "—"}
                    </div>
                  </div>
                </GlassCard>
              </Link>
            ))}
          </section>
        )}
      </div>

      {/* Floating menu */}
      <button className="mFab" type="button" onClick={() => setOpenMenu(true)} aria-label="Ouvrir le menu">
        ☰
      </button>

      {/* Menu sheet */}
      {openMenu ? (
        <Sheet onClose={() => setOpenMenu(false)} zIndex={78}>
          <div style={{ display: "grid", gap: 12 }}>
            <DailyWheelCard />
            <DailyBonusAccessCard />

            <GlassCard style={{ padding: 12 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontWeight: 1200, letterSpacing: -0.2 }}>
                  <span style={{ opacity: 0.85 }}>🎬</span> Clips du mois
                </div>
                <button
                  type="button"
                  className="btnGhostSmall"
                  onClick={() => {
                    setOpenMenu(false);
                    onOpenMonthList();
                  }}
                  style={{ minHeight: 40 }}
                >
                  Voir tout
                </button>
              </div>

              {clipsTop4.length === 0 ? (
                <div className="mutedSmall" style={{ marginTop: 10, opacity: 0.85 }}>
                  {clipsLoading ? "Chargement…" : "Aucun clip."}
                </div>
              ) : (
                <div className="mClipsGrid">
                  {clipsTop4.map((c) => {
                    const raw = c.thumbUrl ? absolutize(apiBase, c.thumbUrl) || c.thumbUrl : null;
                    const thumb = raw || svgThumb(c.streamerName || c.streamerSlug || "Clip");

                    return (
                      <button
                        key={c.id}
                        type="button"
                        className="mClipTile"
                        onClick={() => {
                          setOpenMenu(false);
                          if (hasMoreThan4) onOpenMonthList();
                          else onOpenClip(c);
                        }}
                        style={{ padding: 0, border: 0, background: "transparent", cursor: "pointer" }}
                        title={c.title || "Clip"}
                      >
                        <div className="mClipThumb" style={{ backgroundImage: `url(${thumb})` }} />
                        <div className="mClipPlay">
                          <span>▶</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {extraClipsCount > 0 ? (
                <div className="mutedSmall" style={{ marginTop: 10, opacity: 0.85 }}>
                  +{extraClipsCount} autres clips (ouvre la liste)
                </div>
              ) : null}
            </GlassCard>
          </div>
        </Sheet>
      ) : null}
    </main>
  );
}
