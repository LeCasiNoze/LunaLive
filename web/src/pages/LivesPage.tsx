// web/src/pages/LivesPage.tsx
import * as React from "react";
import { Link } from "react-router-dom";

import { formatViewers } from "../lib/format";
import { getLives } from "../lib/api";
import { svgThumb } from "../lib/thumb";
import type { LiveCard } from "../lib/types";

import { DailyWheelCard } from "../components/DailyWheelCard";
import { DailyBonusAccessCard } from "../components/DailyBonusAccessCard";

type LiveCardVM = LiveCard & {
  thumbFallback: string;
  thumbFinal: string;
  durationLabel?: string | null;

  // premium / featured (foundation)
  featured?: boolean;
};

type ClipVM = {
  id: string;
  url: string; // target video link
  thumbUrl: string | null;
  likes: number;
  streamerSlug?: string | null;
  streamerName?: string | null;
  streamerAvatarUrl?: string | null; // optional later
};

const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

function formatDurationDot(startIso: string, nowMs: number) {
  const start = Date.parse(startIso);
  if (!Number.isFinite(start)) return null;
  const diff = Math.max(0, nowMs - start);
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `${h}.${String(m).padStart(2, "0")}`;
}

function withMinuteBust(url: string, nowMs: number) {
  const t = Math.floor(nowMs / 60000);
  return url.includes("?") ? `${url}&t=${t}` : `${url}?t=${t}`;
}

function absolutize(url: string | null) {
  if (!url) return null;
  const u = String(url);
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/") && API_BASE) return `${API_BASE}${u}`;
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
        borderRadius: 22,
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
            "linear-gradient(90deg, rgba(0,0,0,0.62), rgba(0,0,0,0.22) 55%, rgba(0,0,0,0.70)), radial-gradient(900px 420px at 50% 0%, rgba(255,255,255,0.06), rgba(0,0,0,0) 60%)",
          pointerEvents: "none",
        }}
      />
    </>
  );
}

/**
 * Foundation: featured slugs come from /streamers (which exposes "featured")
 * We only need it for LIVE ones.
 */
async function fetchFeaturedLiveSlugs(): Promise<Set<string>> {
  try {
    const res = await fetch(`${API_BASE}/streamers`, { headers: { "content-type": "application/json" } });
    const data = await res.json().catch(() => null);
    if (!res.ok || !Array.isArray(data)) return new Set();

    const set = new Set<string>();
    for (const s of data) {
      if (!s) continue;
      const slug = String(s.slug || "").trim();
      const isLive = !!s.isLive;
      const featured = !!s.featured;
      if (slug && isLive && featured) set.add(slug);
    }
    return set;
  } catch {
    return new Set();
  }
}

/**
 * Foundation: top clips of the month
 * - safe if endpoint doesn't exist yet (returns [])
 * Expected future shape:
 * [{ id, url, thumbUrl, likes, streamerSlug, streamerName, streamerAvatarUrl }]
 */
async function fetchTopClipsMonth(): Promise<ClipVM[]> {
  try {
    // ✅ when you wire backend, keep same path and just return the expected shape
    const res = await fetch(`${API_BASE}/clips/top?period=month&limit=20`, {
      headers: { "content-type": "application/json" },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !Array.isArray(data)) return [];

    return data
      .map((x: any) => ({
        id: String(x?.id ?? ""),
        url: String(x?.url ?? ""),
        thumbUrl: x?.thumbUrl ? String(x.thumbUrl) : x?.thumb_url ? String(x.thumb_url) : null,
        likes: Number(x?.likes ?? x?.likeCount ?? x?.like_count ?? 0) || 0,
        streamerSlug: x?.streamerSlug ? String(x.streamerSlug) : x?.streamer_slug ? String(x.streamer_slug) : null,
        streamerName: x?.streamerName ? String(x.streamerName) : x?.streamer_name ? String(x.streamer_name) : null,
        streamerAvatarUrl: x?.streamerAvatarUrl
          ? String(x.streamerAvatarUrl)
          : x?.streamer_avatar_url
          ? String(x.streamer_avatar_url)
          : null,
      }))
      .filter((c: ClipVM) => !!c.id && !!c.url);
  } catch {
    return [];
  }
}

function ClipLikesBadge({
  likes,
  corner,
}: {
  likes: number;
  corner: "tl" | "tr" | "br" | "bl";
}) {
  const pos: Record<string, React.CSSProperties> = {
    tl: { top: 8, left: 8 },
    tr: { top: 8, right: 8 },
    br: { bottom: 8, right: 8 },
    bl: { bottom: 8, left: 8 },
  };
  return (
    <span
      style={{
        position: "absolute",
        ...pos[corner],
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 1100,
        letterSpacing: 0.2,
        background: "rgba(0,0,0,0.52)",
        border: "1px solid rgba(255,255,255,0.12)",
        backdropFilter: "blur(10px)",
        pointerEvents: "none",
      }}
      title={`${likes} likes`}
    >
      ❤️ {likes}
    </span>
  );
}

export default function LivesPage() {
  const [lives, setLives] = React.useState<LiveCardVM[]>([]);
  const [loading, setLoading] = React.useState(true);        // initial only
  const [refreshing, setRefreshing] = React.useState(false); // silent refresh
  const [err, setErr] = React.useState<string | null>(null);

  const [clips, setClips] = React.useState<ClipVM[]>([]);
  const [clipsLoading, setClipsLoading] = React.useState(false);

  const load = React.useCallback(async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;

    // ✅ si on a déjà des lives affichés, on ne met PAS loading=true
    if (silent) setRefreshing(true);
    else setLoading(true);

    setErr(null);

    try {
      const nowMs = Date.now();

      const data = await getLives();

      const vmBase: LiveCardVM[] = (data as any[]).map((x: any) => {
        const fallback = svgThumb(x.displayName);

        const rawThumbUrl = absolutize(x.thumbUrl || x.thumb_url || null);
        const thumbFinal = rawThumbUrl ? withMinuteBust(String(rawThumbUrl), nowMs) : fallback;

        const started = x.liveStartedAt || x.live_started_at || null;
        const durationLabel = started ? formatDurationDot(String(started), nowMs) : null;

        return { ...x, thumbFallback: fallback, thumbFinal, durationLabel };
      });

      // featured foundation
      const featuredSlugs = await fetchFeaturedLiveSlugs();
      const vm = vmBase.map((x) => ({
        ...x,
        featured: x?.featured != null ? !!(x as any).featured : featuredSlugs.has(String(x.slug || "")),
      }));

      setLives(vm);
    } catch (e: any) {
      // ✅ ne pas casser l'écran en silent refresh : on garde la liste visible
      setErr(e?.message || String(e));
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  const loadClips = React.useCallback(async () => {
    setClipsLoading(true);
    try {
      const data = await fetchTopClipsMonth();
      setClips(data);
    } finally {
      setClipsLoading(false);
    }
  }, []);

  // initial load
  React.useEffect(() => {
    load();
    loadClips();
  }, [load, loadClips]);

  // auto-refresh (foundation): poll while tab is visible
  React.useEffect(() => {
    const EVERY_MS = 20_000;

    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") load({ silent: true });
    }, EVERY_MS);

    const onVis = () => {
      if (document.visibilityState === "visible") load({ silent: true });
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  const totals = React.useMemo(() => {
    const liveCount = lives.length;
    const viewersTotal = lives.reduce((acc, x) => acc + (Number(x.viewers) || 0), 0);
    return { liveCount, viewersTotal };
  }, [lives]);

  const sorted = React.useMemo(
    () => [...lives].sort((a, b) => Number(b.viewers) - Number(a.viewers)),
    [lives]
  );

  // ✅ category "Mise en avant" only if there is at least 1 featured live
  const featuredLives = React.useMemo(() => sorted.filter((x) => !!x.featured), [sorted]);
  const normalLives = React.useMemo(() => sorted.filter((x) => !x.featured), [sorted]);

  const clipsTop4 = React.useMemo(() => clips.slice(0, 4), [clips]);
  const extraClipsCount = Math.max(0, clips.length - clipsTop4.length);

  return (
    <main className="container livesPage">
      <style>{`
        .livesPage{
          position: relative;
          padding-bottom: 26px;
        }
        .livesPage::before{
          content:"";
          position: fixed;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          background:
            radial-gradient(1100px 420px at 18% 0%, rgba(255,90,180,0.22), rgba(0,0,0,0) 62%),
            radial-gradient(1200px 500px at 80% 10%, rgba(80,160,255,0.22), rgba(0,0,0,0) 62%),
            radial-gradient(1200px 600px at 50% 95%, rgba(140,90,255,0.22), rgba(0,0,0,0) 64%),
            linear-gradient(180deg, rgba(0,0,0,0.0), rgba(0,0,0,0.10));
          transform: translateZ(0);
        }

        .livesWrap{
          position: relative;
          z-index: 1;
          border-radius: 26px;
          border: 1px solid rgba(255,255,255,0.10);
          background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(0,0,0,0.10));
          box-shadow: 0 20px 70px rgba(0,0,0,0.32);
          backdrop-filter: blur(10px);
          padding: 14px;
          overflow: hidden;
        }

        .livesHeader{
          display:flex;
          justify-content: space-between;
          gap: 14px;
          flex-wrap: wrap;
          align-items: baseline;
        }
        .livesH1{
          margin: 0;
          font-weight: 1500;
          letter-spacing: -0.9px;
          font-size: 34px;
          line-height: 1.05;
          background: linear-gradient(90deg, rgba(255,90,180,1), rgba(180,140,255,1), rgba(80,160,255,1));
          -webkit-background-clip:text;
          background-clip:text;
          color: transparent;
          filter: drop-shadow(0 10px 24px rgba(0,0,0,0.35));
        }

        .livesLayout{
          margin-top: 12px;
          display: grid;
          grid-template-columns: 320px 1fr;
          gap: 12px;
          align-items: start;
        }
        .livesSidebar{
          position: sticky;
          top: 14px;
          display: grid;
          gap: 12px;
        }
        .livesMain{ min-width: 0; }

        @media (max-width: 980px) {
          .livesLayout { grid-template-columns: 1fr; }
          .livesSidebar { position: static; }
        }

        .sectionTitle{
          display:flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 10px;
          margin: 6px 2px 10px;
        }
        .sectionTitle h2{
          margin:0;
          font-size: 14px;
          font-weight: 1300;
          letter-spacing: -0.2px;
          text-transform: uppercase;
          opacity: 0.92;
        }
        .sectionHint{
          font-size: 12px;
          opacity: 0.72;
          font-weight: 900;
        }

        .livesGrid{
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          align-items: start;
        }
        .liveLink{
          text-decoration: none;
          color: inherit;
          display: block;
        }

        .liveThumb{
          position: relative;
          overflow: hidden;
          border-radius: 18px;
          min-height: 168px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(0,0,0,0.18);
        }
        .liveTopRow{
          position: absolute;
          top: 10px;
          left: 10px;
          right: 10px;
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: center;
          pointer-events: none;
        }
        .liveBottomRow{
          position: absolute;
          left: 10px;
          right: 10px;
          bottom: 10px;
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: flex-end;
          pointer-events: none;
        }
        .liveName{
          font-weight: 1300;
          letter-spacing: -0.25px;
          font-size: 16px;
          text-shadow: 0 12px 26px rgba(0,0,0,0.55);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 70%;
        }
        .liveTitle{
          font-weight: 900;
          font-size: 13px;
          line-height: 1.25;
          opacity: 0.94;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          min-height: 34px;
        }

        /* flashy hover */
        .hoverGlow{
          transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
        }
        .hoverGlow:hover{
          transform: translateY(-2px);
          box-shadow: 0 26px 70px rgba(0,0,0,0.38);
          border-color: rgba(255,90,180,0.25);
        }

        /* Clips */
        .sidebarDivider{
          height: 1px;
          margin: 10px 2px 2px;
          background: linear-gradient(90deg, rgba(255,255,255,0.0), rgba(255,255,255,0.16), rgba(255,255,255,0.0));
          opacity: 0.9;
        }

        .clipsCard{
          padding: 14px;
        }
        .clipsGrid{
          margin-top: 12px;
          position: relative;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .clipTile{
          position: relative;
          border-radius: 18px;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.06);
          min-height: 92px;
        }
        .clipTile::before{
          content:"";
          position:absolute;
          inset:0;
          background: radial-gradient(420px 160px at 30% 0%, rgba(255,90,180,0.16), rgba(0,0,0,0) 60%),
                      radial-gradient(420px 160px at 90% 20%, rgba(80,160,255,0.14), rgba(0,0,0,0) 60%),
                      linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.22));
          pointer-events:none;
        }
        .clipThumb{
          position:absolute;
          inset:0;
          background-position:center;
          background-size:cover;
          background-repeat:no-repeat;
          opacity: 0.92;
          filter: contrast(1.03) saturate(1.12);
          transform: scale(1.03);
        }
        .clipPlay{
          position:absolute;
          inset:0;
          display:grid;
          place-items:center;
          pointer-events:none;
        }
        .clipPlay span{
          width: 42px;
          height: 42px;
          border-radius: 999px;
          display:grid;
          place-items:center;
          background: rgba(0,0,0,0.55);
          border: 1px solid rgba(255,255,255,0.12);
          backdrop-filter: blur(10px);
          box-shadow: 0 16px 40px rgba(0,0,0,0.35);
          font-size: 16px;
        }

        /* overlay for +N extra clips */
        .clipsMoreOverlay{
          position:absolute;
          inset: 0;
          display:grid;
          place-items:center;
          pointer-events:none;
        }
        .clipsMoreOverlay .bubble{
          padding: 10px 12px;
          border-radius: 18px;
          background: rgba(0,0,0,0.55);
          border: 1px solid rgba(255,255,255,0.14);
          backdrop-filter: blur(12px);
          box-shadow: 0 20px 55px rgba(0,0,0,0.38);
          font-weight: 1300;
          letter-spacing: -0.3px;
        }
        .clipsMoreOverlay .bubble strong{
          background: linear-gradient(90deg, rgba(255,90,180,1), rgba(180,140,255,1), rgba(80,160,255,1));
          -webkit-background-clip:text;
          background-clip:text;
          color: transparent;
        }

        /* little corner markers at the center cross (visual cue) */
        .clipsCross{
          position:absolute;
          left: 50%;
          top: 50%;
          width: 42px;
          height: 42px;
          transform: translate(-50%,-50%);
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.04);
          box-shadow: 0 16px 45px rgba(0,0,0,0.25);
          backdrop-filter: blur(10px);
          pointer-events:none;
          opacity: 0.9;
        }
      `}</style>

      <div className="livesWrap">
        {/* Header */}
        <div className="livesHeader">
          <div style={{ display: "grid", gap: 6, minWidth: 280 }}>
            <h1 className="livesH1">Lives</h1>
            <div className="mutedSmall" style={{ maxWidth: 760 }}>
              Les streams en direct sur LunaLive. Miniatures live, viewers, durée.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
            <Pill tone="live" title="Nombre de lives en direct">🔴 Live <b>{totals.liveCount}</b></Pill>
            <Pill tone="neutral" title="Viewers total sur la plateforme">👁 Viewers <b>{formatViewers(totals.viewersTotal)}</b></Pill>
              <button
                className="btnPrimary"
                onClick={() => load({ silent: true })}
                disabled={loading || refreshing}
                style={{ borderRadius: 999 }}
              >
                {loading ? "Chargement…" : refreshing ? "Rafraîchit…" : "Rafraîchir"}
              </button>
          </div>
        </div>

        {err ? (
          <div className="alert" style={{ marginTop: 12 }}>
            {err}
          </div>
        ) : null}

        <div className="livesLayout">
          <aside className="livesSidebar">
            <DailyWheelCard />
            <DailyBonusAccessCard />

            {/* ✅ Clips section (below daily bonus, a bit lower + separated) */}
            <div className="sidebarDivider" />

            <GlassCard className="clipsCard">
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                <div style={{ display: "grid", gap: 4 }}>
                  <div style={{ fontWeight: 1400, letterSpacing: -0.25, fontSize: 14 }}>
                    <span style={{ opacity: 0.85 }}>🎬</span> Clips du mois
                  </div>
                  <div className="mutedSmall" style={{ opacity: 0.8 }}>
                    Top clips (likes). 4 max + indicateur si plus.
                  </div>
                </div>

                <button
                  className="btnGhost"
                  onClick={loadClips}
                  disabled={clipsLoading}
                  style={{ borderRadius: 999, padding: "8px 10px" }}
                  title="Rafraîchir les clips"
                >
                  {clipsLoading ? "…" : "↻"}
                </button>
              </div>

              {clipsTop4.length === 0 ? (
                <div className="mutedSmall" style={{ marginTop: 12 }}>
                  {clipsLoading ? "Chargement…" : "Aucun clip pour le moment (on branchera l’API clips ensuite)."}
                </div>
              ) : (
                <div className="clipsGrid">
                  {clipsTop4.map((c, idx) => {
                    const raw = c.thumbUrl ? absolutize(c.thumbUrl) || c.thumbUrl : null;
                    const thumb = raw || svgThumb(c.streamerName || c.streamerSlug || "Clip");

                    // likes badge corner per tile: TL, TR, BR, BL
                    const corner: "tl" | "tr" | "br" | "bl" = (["tl", "tr", "bl", "br"] as const)[idx] ?? "tl";

                    return (
                      <a
                        key={c.id}
                        href={c.url}
                        target="_blank"
                        rel="noreferrer"
                        className="clipTile hoverGlow"
                        style={{
                          textDecoration: "none",
                          color: "inherit",
                          display: "block",
                        }}
                        title={c.streamerName ? `${c.streamerName} — ${c.likes} likes` : `${c.likes} likes`}
                      >
                        <div className="clipThumb" style={{ backgroundImage: `url(${thumb})` }} />
                        <div className="clipPlay">
                          <span>▶</span>
                        </div>

                        <ClipLikesBadge likes={c.likes} corner={corner} />

                        {/* Foundation: later we can drop streamer avatar in the center */}
                        {/* {c.streamerAvatarUrl ? (
                          <img ... />
                        ) : null} */}
                      </a>
                    );
                  })}

                  {/* cross marker (nice visual for your "superposition" idea) */}
                  {extraClipsCount > 0 ? <div className="clipsCross" aria-hidden /> : null}

                  {/* +N overlay if there are more clips */}
                  {extraClipsCount > 0 ? (
                    <div className="clipsMoreOverlay" aria-hidden>
                      <div className="bubble">
                        <strong>+{extraClipsCount}</strong> clips
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </GlassCard>
          </aside>

          <section className="livesMain">
            {loading && lives.length === 0 ? (
              <div className="muted" style={{ marginTop: 12 }}>
                Chargement…
              </div>
            ) : (
              <>
                {/* ✅ Featured section only if needed */}
                {featuredLives.length > 0 ? (
                  <div style={{ marginTop: 8 }}>
                    <div className="sectionTitle">
                      <h2>✨ Mise en avant</h2>
                      <div className="sectionHint">Abonnés / premium</div>
                    </div>

                    <section className="livesGrid">
                      {featuredLives.map((live) => (
                        <Link key={live.id} to={`/s/${live.slug}`} className="liveLink">
                          <GlassCard
                            className="hoverGlow"
                            style={{
                              padding: 12,
                              border: "1px solid rgba(255,210,120,0.28)",
                              background:
                                "radial-gradient(900px 260px at 20% 0%, rgba(255,210,120,0.14), rgba(0,0,0,0) 60%), radial-gradient(900px 260px at 90% 10%, rgba(255,90,180,0.12), rgba(0,0,0,0) 62%), linear-gradient(180deg, rgba(255,255,255,0.07), rgba(0,0,0,0.10))",
                            }}
                          >
                            <div className="liveThumb" style={{ borderColor: "rgba(255,210,120,0.18)" }}>
                              <LiveBackdrop url={live.thumbFinal} />

                              <div className="liveTopRow">
                                <Pill tone="gold" title="Mise en avant">
                                  ✨ FEATURED
                                </Pill>
                                {live.durationLabel ? (
                                  <Pill tone="neutral" title="Durée du live">⏱ {live.durationLabel}</Pill>
                                ) : (
                                  <span />
                                )}
                              </div>

                              <div className="liveBottomRow">
                                <div className="liveName" title={live.displayName}>
                                  {live.displayName}
                                </div>
                                <Pill tone="neutral" title="Viewers">👁 {formatViewers(live.viewers)}</Pill>
                              </div>
                            </div>

                            <div style={{ padding: "10px 8px 6px" }}>
                              <div className="liveTitle" title={live.title || ""}>
                                {live.title || "—"}
                              </div>
                              <div
                                aria-hidden
                                style={{
                                  marginTop: 10,
                                  height: 2,
                                  borderRadius: 999,
                                  background:
                                    "linear-gradient(90deg, rgba(255,210,120,0.0), rgba(255,210,120,0.45), rgba(255,210,120,0.0))",
                                  opacity: 0.95,
                                }}
                              />
                            </div>
                          </GlassCard>
                        </Link>
                      ))}
                    </section>
                  </div>
                ) : null}

                {/* Normal lives */}
                <div style={{ marginTop: featuredLives.length > 0 ? 16 : 8 }}>
                  <div className="sectionTitle">
                    <h2>🔴 Lives</h2>
                    <div className="sectionHint">{normalLives.length} en direct</div>
                  </div>

                  <section className="livesGrid">
                    {normalLives.map((live) => (
                      <Link key={live.id} to={`/s/${live.slug}`} className="liveLink">
                        <GlassCard
                          className="hoverGlow"
                          style={{
                            padding: 12,
                            border: "1px solid rgba(255,90,180,0.18)",
                            background:
                              "radial-gradient(700px 220px at 20% 0%, rgba(255,90,180,0.14), rgba(0,0,0,0) 60%), linear-gradient(180deg, rgba(255,255,255,0.07), rgba(0,0,0,0.10))",
                          }}
                        >
                          <div className="liveThumb">
                            <LiveBackdrop url={live.thumbFinal} />

                            <div className="liveTopRow">
                              <Pill tone="live" title="En direct">
                                <span
                                  aria-hidden
                                  style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: 999,
                                    background: "rgba(255,90,180,0.95)",
                                    boxShadow: "0 0 0 6px rgba(255,90,180,0.14)",
                                  }}
                                />
                                LIVE
                              </Pill>

                              {live.durationLabel ? (
                                <Pill tone="neutral" title="Durée du live">⏱ {live.durationLabel}</Pill>
                              ) : (
                                <span />
                              )}
                            </div>

                            <div className="liveBottomRow">
                              <div className="liveName" title={live.displayName}>
                                {live.displayName}
                              </div>
                              <Pill tone="neutral" title="Viewers">👁 {formatViewers(live.viewers)}</Pill>
                            </div>
                          </div>

                          <div style={{ padding: "10px 8px 6px" }}>
                            <div className="liveTitle" title={live.title || ""}>
                              {live.title || "—"}
                            </div>

                            <div
                              aria-hidden
                              style={{
                                marginTop: 10,
                                height: 2,
                                borderRadius: 999,
                                background:
                                  "linear-gradient(90deg, rgba(255,90,180,0.0), rgba(255,90,180,0.40), rgba(255,90,180,0.0))",
                                opacity: 0.9,
                              }}
                            />
                          </div>
                        </GlassCard>
                      </Link>
                    ))}

                    {sorted.length === 0 ? (
                      <GlassCard style={{ padding: 14 }}>
                        <div className="mutedSmall">Aucun streamer en live pour le moment.</div>
                      </GlassCard>
                    ) : null}
                  </section>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
