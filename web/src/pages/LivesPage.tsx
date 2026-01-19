// web/src/pages/LivesPage.tsx
import * as React from "react";
import { Link } from "react-router-dom";
import Hls from "hls.js";

import { formatViewers } from "../lib/format";
import { getLives } from "../lib/api";
import { svgThumb } from "../lib/thumb";
import type { LiveCard } from "../lib/types";

import { DailyWheelCard } from "../components/DailyWheelCard";
import { DailyBonusAccessCard } from "../components/DailyBonusAccessCard";

type LiveCardVM = LiveCard & {
  thumbFallback: string; // svg
  thumbFinal: string; // what we display (never "blink" during refresh)
  durationLabel?: string | null;

  // premium / featured (foundation)
  featured?: boolean;
};

type ClipVM = {
  id: number;

  streamerSlug: string;
  streamerName: string | null;
  avatarUrl: string | null;

  title: string | null;
  createdAtMs: number;

  vodUrl: string | null;
  startSec: number;
  durationSec: number;

  thumbUrl: string | null;
  likesCount: number;
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

function preloadImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const done = (ok: boolean) => resolve(ok);
    img.onload = () => done(true);
    img.onerror = () => done(false);
    img.src = url;
  });
}

function timeAgo(ms: number) {
  const d = Date.now() - (ms || 0);
  const mins = Math.floor(d / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} h`;
  const days = Math.floor(h / 24);
  return `${days} j`;
}

function fmtDuration(sec: number) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
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
 * Featured foundation:
 * - source of truth currently = /streamers (returns {slug,isLive,featured})
 * - we only need it for LIVE ones.
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
 * Clips du mois (public):
 * GET /clips/top?range=month&limit=24
 * -> { ok:true, total:number, clips:[ ... ] }
 */
async function fetchTopClipsMonth(): Promise<{ total: number; clips: ClipVM[] }> {
  try {
    const res = await fetch(`${API_BASE}/clips/top?range=month&limit=24`, {
      headers: { "content-type": "application/json" },
    });

    const j = await res.json().catch(() => null);
    if (!res.ok || !j || j.ok === false) return { total: 0, clips: [] };

    const arr = Array.isArray(j.clips) ? j.clips : Array.isArray(j) ? j : [];
    const total = Number(j.total ?? arr.length ?? 0) || 0;

    const clips = arr
      .map((x: any) => {
        const id = Number(x?.id);
        if (!Number.isFinite(id) || id <= 0) return null;

        const streamerSlug =
          x?.streamerSlug != null
            ? String(x.streamerSlug)
            : x?.streamer_slug != null
            ? String(x.streamer_slug)
            : "";

        const streamerName =
          x?.streamerDisplayName != null
            ? String(x.streamerDisplayName)
            : x?.streamer_display_name != null
            ? String(x.streamer_display_name)
            : x?.streamerName != null
            ? String(x.streamerName)
            : x?.streamer_name != null
            ? String(x.streamer_name)
            : null;

        const likesCount = Number(x?.likesCount ?? x?.likes_count ?? x?.likes ?? 0) || 0;

        const thumbUrl = x?.thumbUrl ? String(x.thumbUrl) : x?.thumb_url ? String(x.thumb_url) : null;

        const vodUrl = x?.vodUrl != null ? String(x.vodUrl) : x?.vod_url != null ? String(x.vod_url) : null;
        const startSec = Number(x?.startSec ?? x?.start_sec ?? 0) || 0;
        const durationSec = Number(x?.durationSec ?? x?.duration_sec ?? 0) || 0;

        const createdAtMs = Number(x?.createdAtMs ?? x?.created_at_ms ?? x?.created_ts ?? 0) || 0;

        const avatarUrl =
          x?.avatarUrl != null
            ? String(x.avatarUrl)
            : x?.streamerAvatarUrl != null
            ? String(x.streamerAvatarUrl)
            : x?.streamer_avatar_url != null
            ? String(x.streamer_avatar_url)
            : null;

        const title = x?.title != null ? String(x.title) : null;

        return {
          id,
          streamerSlug: String(streamerSlug || ""),
          streamerName,
          avatarUrl,
          title,
          createdAtMs,
          vodUrl,
          startSec,
          durationSec,
          thumbUrl,
          likesCount,
        } satisfies ClipVM;
      })
      .filter(Boolean) as ClipVM[];

    return { total, clips };
  } catch {
    return { total: 0, clips: [] };
  }
}

function ClipLikesBadge({ likes, corner }: { likes: number; corner: "tl" | "tr" | "br" | "bl" }) {
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

function ClipPlayerModal({
  clip,
  onClose,
  zIndex,
}: {
  clip: ClipVM;
  onClose: () => void;
  zIndex: number;
}) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const url = clip.vodUrl;
    if (!url) return;

    let hls: Hls | null = null;

    const start = Math.max(0, Number(clip.startSec || 0));
    const end = Math.max(start + 1, start + Math.max(1, Number(clip.durationSec || 0))); // start+duration
    const EPS = 0.25; // marge anti-jitter

    // IMPORTANT: éviter de précharger tout le flux
    video.preload = "metadata";

    const cleanupVideo = () => {
      try {
        video.pause();
      } catch {}
      try {
        video.removeEventListener("timeupdate", onTimeUpdate);
        video.removeEventListener("seeking", onSeeking);
        video.removeEventListener("loadedmetadata", onLoadedMeta);
      } catch {}
      try {
        video.removeAttribute("src");
        video.load();
      } catch {}
    };

    const onTimeUpdate = () => {
      try {
        if (video.currentTime >= end - EPS) {
          video.pause();
          // soit tu fermes automatiquement:
          // onClose();
          // soit tu restes sur la modale, juste en pause à la fin:
          video.currentTime = end - EPS;
        }
      } catch {}
    };

    // Empêche l’utilisateur de sortir de la fenêtre du clip
    const onSeeking = () => {
      try {
        if (video.currentTime < start - EPS) video.currentTime = start;
        if (video.currentTime > end - EPS) video.currentTime = end - EPS;
      } catch {}
    };

    const onLoadedMeta = () => {
      try {
        video.currentTime = start;
      } catch {}
      video.play().catch(() => {});
    };

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("seeking", onSeeking);

    // Safari iOS/macOS HLS natif
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.addEventListener("loadedmetadata", onLoadedMeta);
      return () => {
        cleanupVideo();
      };
    }

    if (Hls.isSupported()) {
      hls = new Hls({
        // ✅ clé : ne démarre pas à 0
        autoStartLoad: false,
        // certains env respectent startPosition; on force aussi startLoad
        startPosition: start,
        // bonus: réduit buffering
        maxBufferLength: 30,
        backBufferLength: 0,
      });

      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        // ✅ force le chargement à partir de start
        try {
          hls?.startLoad(start);
        } catch {}
      });

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        // ✅ positionne et play
        try {
          video.currentTime = start;
        } catch {}
        video.play().catch(() => {});
      });

      return () => {
        try {
          hls?.destroy();
        } catch {}
        cleanupVideo();
      };
    }

    // fallback basique
    video.src = url;
    video.addEventListener("loadedmetadata", onLoadedMeta);
    return () => {
      cleanupVideo();
    };
  }, [clip /* (+ onClose si tu auto-close) */]);


  return (
    <div className="chatSheetBackdrop" onClick={onClose} role="presentation" style={{ zIndex }}>
      <div
        className="chatSheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{ maxWidth: 980 }}
      >
        <div className="chatSheetTop" style={{ gap: 10 }}>
          <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
            <div style={{ fontWeight: 1050, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {clip.title || "Clip"}
            </div>
            <div className="mutedSmall" style={{ opacity: 0.8, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <span>
                Par{" "}
                <Link
                  to={clip.streamerSlug ? `/s/${encodeURIComponent(clip.streamerSlug)}` : "#"}
                  style={{ color: "rgba(255,255,255,0.92)", fontWeight: 950, textDecoration: "none" }}
                  onClick={() => {
                    // fermer la modale quand on navigue
                    onClose();
                  }}
                >
                  {clip.streamerName || clip.streamerSlug || "Streamer"}
                </Link>
              </span>
              <span style={{ opacity: 0.9 }}>•</span>
              <span>❤️ {Number(clip.likesCount || 0)}</span>
            </div>
          </div>

          <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <button className="iconBtn" onClick={onClose} type="button" aria-label="Fermer">
              ✕
            </button>
          </div>
        </div>

        <div className="chatSheetBody" style={{ padding: 14 }}>
          {!clip.vodUrl ? (
            <div className="mutedSmall" style={{ opacity: 0.85 }}>
              Vidéo indisponible (VOD pas prête).
            </div>
          ) : (
            <video
              ref={videoRef}
              controls
              playsInline
              style={{
                width: "100%",
                borderRadius: 16,
                background: "black",
                border: "1px solid rgba(255,255,255,0.10)",
              }}
            />
          )}

          <div className="mutedSmall" style={{ marginTop: 10, opacity: 0.85, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span>
              Durée: <strong style={{ color: "rgba(255,255,255,0.9)" }}>{fmtDuration(clip.durationSec)}</strong>
            </span>
            <span style={{ opacity: 0.9 }}>•</span>
            <span>
              Publié: <strong style={{ color: "rgba(255,255,255,0.9)" }}>{timeAgo(clip.createdAtMs)}</strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MonthClipsListModal({
  title,
  clips,
  total,
  onClose,
  onPickClip,
  zIndex,
}: {
  title: string;
  clips: ClipVM[];
  total: number;
  onClose: () => void;
  onPickClip: (c: ClipVM) => void;
  zIndex: number;
}) {
  return (
    <div className="chatSheetBackdrop" onClick={onClose} role="presentation" style={{ zIndex }}>
      <div
        className="chatSheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{ maxWidth: 860 }}
      >
        <div className="chatSheetTop" style={{ gap: 10 }}>
          <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
            <div style={{ fontWeight: 1100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {title}
            </div>
            <div className="mutedSmall" style={{ opacity: 0.8 }}>
              Liste des clips du mois • tri par ❤️ (top) • {total || clips.length} clip(s)
            </div>
          </div>

          <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <button className="iconBtn" onClick={onClose} type="button" aria-label="Fermer">
              ✕
            </button>
          </div>
        </div>

        <div className="chatSheetBody" style={{ padding: 14 }}>
          {clips.length === 0 ? (
            <div className="mutedSmall" style={{ opacity: 0.85 }}>
              Aucun clip pour le moment.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {clips.map((c) => {
                const name = c.streamerName || c.streamerSlug || "Streamer";
                return (
                  <button
                    key={c.id}
                    type="button"
                    className="panel"
                    onClick={() => onPickClip(c)}
                    style={{
                      textAlign: "left",
                      cursor: "pointer",
                      padding: 12,
                      borderRadius: 16,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(255,255,255,0.03)",
                      display: "grid",
                      gridTemplateColumns: "44px 1fr auto",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 16,
                        overflow: "hidden",
                        border: "1px solid rgba(255,255,255,0.14)",
                        background: "rgba(0,0,0,0.35)",
                      }}
                      aria-hidden
                    >
                      {c.avatarUrl ? (
                        <img
                          src={absolutize(c.avatarUrl) || c.avatarUrl}
                          alt=""
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : null}
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 1100, letterSpacing: -0.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.title || "(sans titre)"}
                        </div>
                        <span className="mutedSmall" style={{ opacity: 0.8 }}>
                          — {name}
                        </span>
                      </div>
                      <div className="mutedSmall" style={{ opacity: 0.8, marginTop: 4 }}>
                        {timeAgo(c.createdAtMs)} • {fmtDuration(c.durationSec)}
                      </div>
                    </div>

                    <div style={{ display: "grid", justifyItems: "end", gap: 6 }}>
                      <div
                        style={{
                          display: "inline-flex",
                          gap: 6,
                          alignItems: "center",
                          padding: "6px 10px",
                          borderRadius: 999,
                          background: "rgba(0,0,0,0.45)",
                          border: "1px solid rgba(255,255,255,0.12)",
                          fontWeight: 1100,
                        }}
                        title="Likes"
                      >
                        ❤️ {Number(c.likesCount || 0)}
                      </div>
                      <div className="mutedSmall" style={{ opacity: 0.75 }}>
                        ▶ Ouvrir
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LivesPage() {
  const [lives, setLives] = React.useState<LiveCardVM[]>([]);
  const [loading, setLoading] = React.useState(true); // initial only
  const [refreshing, setRefreshing] = React.useState(false); // silent refresh
  const [err, setErr] = React.useState<string | null>(null);

  const [clips, setClips] = React.useState<ClipVM[]>([]);
  const [clipsTotal, setClipsTotal] = React.useState(0);
  const [clipsLoading, setClipsLoading] = React.useState(false);

  // modals (clips du mois)
  const [openMonthList, setOpenMonthList] = React.useState(false);
  const [openClip, setOpenClip] = React.useState<ClipVM | null>(null);

  // ✅ lock pour éviter refresh concurrents
  const refreshLockRef = React.useRef(false);

  const mergeThumbFinal = React.useCallback((prev: LiveCardVM[], nextBase: LiveCardVM[]) => {
    // on garde l’ancienne thumbFinal si la nouvelle n’est pas encore préloadée
    const prevMap = new Map(prev.map((x) => [String(x.slug || x.id), x] as const));
    return nextBase.map((x) => {
      const k = String(x.slug || x.id);
      const old = prevMap.get(k);
      return {
        ...x,
        thumbFinal: old?.thumbFinal || x.thumbFinal,
      };
    });
  }, []);

  const load = React.useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = !!opts?.silent;
      if (refreshLockRef.current) return;
      refreshLockRef.current = true;

      if (silent) setRefreshing(true);
      else setLoading(true);

      setErr(null);

      try {
        const nowMs = Date.now();
        const data = await getLives();

        // base mapping
        const vmBase: LiveCardVM[] = (data as any[]).map((x: any) => {
          const fallback = svgThumb(x.displayName);
          const rawThumbUrl = absolutize(x.thumbUrl || x.thumb_url || null);
          const thumbUrl = rawThumbUrl ? withMinuteBust(String(rawThumbUrl), nowMs) : null;

          // IMPORTANT: thumbFinal initial = old thumb (merge), sinon fallback
          const thumbFinal = thumbUrl || fallback;

          const started = x.liveStartedAt || x.live_started_at || null;
          const durationLabel = started ? formatDurationDot(String(started), nowMs) : null;

          return { ...x, thumbFallback: fallback, thumbFinal, durationLabel };
        });

        // featured foundation
        const featuredSlugs = await fetchFeaturedLiveSlugs();
        const vmWithFeatured = vmBase.map((x) => ({
          ...x,
          featured: x?.featured != null ? !!(x as any).featured : featuredSlugs.has(String(x.slug || "")),
        }));

        // ✅ merge thumbs so we never blink to fallback during refresh
        setLives((prev) => mergeThumbFinal(prev, vmWithFeatured));

        // ✅ now: preload any "new" thumbs and only then swap thumbFinal for that card
        const preloadJobs = vmWithFeatured.map(async (live) => {
          const nowThumb = absolutize((live as any).thumbUrl || (live as any).thumb_url || null);
          const url = nowThumb ? withMinuteBust(String(nowThumb), nowMs) : null;
          if (!url) return;

          const ok = await preloadImage(url);
          if (!ok) return;

          setLives((prev) =>
            prev.map((p) => (String(p.slug || p.id) === String(live.slug || live.id) ? { ...p, thumbFinal: url } : p))
          );
        });

        await Promise.allSettled(preloadJobs);
      } catch (e: any) {
        setErr(e?.message || String(e));
      } finally {
        refreshLockRef.current = false;
        if (silent) setRefreshing(false);
        else setLoading(false);
      }
    },
    [mergeThumbFinal]
  );

  const loadClips = React.useCallback(async () => {
    setClipsLoading(true);
    try {
      const r = await fetchTopClipsMonth();
      setClips(r.clips);
      setClipsTotal(r.total || r.clips.length);
    } finally {
      setClipsLoading(false);
    }
  }, []);

  // initial load
  React.useEffect(() => {
    load();
    loadClips();
  }, [load, loadClips]);

  // auto-refresh: poll while tab is visible
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

  const sorted = React.useMemo(() => [...lives].sort((a, b) => Number(b.viewers) - Number(a.viewers)), [lives]);

  const featuredLives = React.useMemo(() => sorted.filter((x) => !!x.featured), [sorted]);
  const normalLives = React.useMemo(() => sorted.filter((x) => !x.featured), [sorted]);

  const clipsTop4 = React.useMemo(() => clips.slice(0, 4), [clips]);
  const extraClipsCount = Math.max(0, clipsTotal - clipsTop4.length);
  const hasMoreThan4 = clipsTotal > 4;

  function onClickMonthClip(c: ClipVM) {
    if (hasMoreThan4) {
      setOpenMonthList(true);
      return;
    }
    setOpenClip(c);
  }

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

        /* Flashy hover */
        .hoverGlow{
          transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
        }
        .hoverGlow:hover{
          transform: translateY(-2px);
          box-shadow: 0 26px 70px rgba(0,0,0,0.38);
          border-color: rgba(255,90,180,0.25);
        }

        /* Header live ping */
        .livePing{
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: rgba(255,90,180,0.95);
          box-shadow: 0 0 0 6px rgba(255,90,180,0.14);
          display:inline-block;
          vertical-align: middle;
          margin-right: 6px;
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
        .clipTile::before{
          content:"";
          position:absolute;
          inset:0;
          background: radial-gradient(420px 160px at 30% 0%, rgba(255,90,180,0.16), rgba(0,0,0,0) 60%),
                      radial-gradient(420px 160px at 90% 20%, rgba(80,160,255,0.14), rgba(0,0,0,0) 60%),
                      linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.22));
          pointer-events:none;
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

        .clipMidAvatar{
          position:absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%,-50%);
          width: 40px;
          height: 40px;
          border-radius: 16px;
          overflow:hidden;
          border: 1px solid rgba(255,255,255,0.18);
          background: rgba(0,0,0,0.40);
          backdrop-filter: blur(10px);
          box-shadow: 0 18px 50px rgba(0,0,0,0.35);
          pointer-events:none;
        }
        .clipMidAvatar img{
          width:100%;
          height:100%;
          object-fit: cover;
          display:block;
        }

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

        /* Minimal modal fallback (si pas déjà défini globalement) */
        .chatSheetBackdrop{
          position: fixed;
          inset: 0;
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

      <div className="livesWrap">
        {/* Header */}
        <div className="livesHeader">
          <div style={{ display: "grid", gap: 6, minWidth: 280 }}>
            <h1 className="livesH1">Lives</h1>
            <div className="mutedSmall" style={{ maxWidth: 760 }}>
              Les streams en direct sur LunaLive. Miniatures live, viewers, durée.
              {refreshing ? (
                <span style={{ marginLeft: 10, opacity: 0.8, fontWeight: 900 }}>
                  <span className="livePing" aria-hidden /> update…
                </span>
              ) : null}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
            <Pill tone="live" title="Nombre de lives en direct">
              🔴 Live <b>{totals.liveCount}</b>
            </Pill>
            <Pill tone="neutral" title="Viewers total sur la plateforme">
              👁 Viewers <b>{formatViewers(totals.viewersTotal)}</b>
            </Pill>
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

            <div className="sidebarDivider" />

            {/* ✅ Clips du mois */}
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

                <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                  {clipsLoading ? (
                    <span className="mutedSmall" style={{ opacity: 0.8 }}>
                      …
                    </span>
                  ) : null}
                </div>
              </div>

              {clipsTop4.length === 0 ? (
                <div className="mutedSmall" style={{ marginTop: 12 }}>
                  {clipsLoading ? "Chargement…" : "Aucun clip pour le moment."}
                </div>
              ) : (
                <div className="clipsGrid">
                  {clipsTop4.map((c, idx) => {
                    const raw = c.thumbUrl ? absolutize(c.thumbUrl) || c.thumbUrl : null;
                    const thumb = raw || svgThumb(c.streamerName || c.streamerSlug || "Clip");

                    // likes badge corner per tile: TL, TR, BL, BR
                    const corner: "tl" | "tr" | "bl" | "br" = (["tl", "tr", "bl", "br"] as const)[idx] ?? "tl";

                    return (
                      <button
                        key={c.id}
                        type="button"
                        className="clipTile hoverGlow"
                        onClick={() => onClickMonthClip(c)}
                        style={{
                          textDecoration: "none",
                          color: "inherit",
                          display: "block",
                          padding: 0,
                          cursor: "pointer",
                        }}
                        title={
                          hasMoreThan4
                            ? "Ouvrir la liste des clips du mois"
                            : c.title
                            ? `${c.title} — ${c.likesCount} likes`
                            : `${c.likesCount} likes`
                        }
                      >
                        <div className="clipThumb" style={{ backgroundImage: `url(${thumb})` }} />
                        <div className="clipPlay">
                          <span>▶</span>
                        </div>

                        <ClipLikesBadge likes={c.likesCount} corner={corner} />

                        {/* ✅ avatar streamer au centre (si dispo) */}
                        {c.avatarUrl ? (
                          <div className="clipMidAvatar" aria-hidden>
                            <img
                              src={absolutize(c.avatarUrl) || c.avatarUrl}
                              alt=""
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = "none";
                              }}
                            />
                          </div>
                        ) : null}
                      </button>
                    );
                  })}

                  {extraClipsCount > 0 ? <div className="clipsCross" aria-hidden /> : null}

                  {extraClipsCount > 0 ? (
                    <button
                      type="button"
                      className="clipsMoreOverlay"
                      onClick={() => setOpenMonthList(true)}
                      style={{ background: "transparent", border: 0, cursor: "pointer" }}
                      title="Voir tous les clips du mois"
                    >
                      <div className="bubble">
                        <strong>+{extraClipsCount}</strong> clips
                      </div>
                    </button>
                  ) : null}
                </div>
              )}
            </GlassCard>
          </aside>

          <section className="livesMain">
            {/* ✅ Initial loading only if nothing is on screen yet */}
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
                                  <Pill tone="neutral" title="Durée du live">
                                    ⏱ {live.durationLabel}
                                  </Pill>
                                ) : (
                                  <span />
                                )}
                              </div>

                              <div className="liveBottomRow">
                                <div className="liveName" title={live.displayName}>
                                  {live.displayName}
                                </div>
                                <Pill tone="neutral" title="Viewers">
                                  👁 {formatViewers(live.viewers)}
                                </Pill>
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
                                <span className="livePing" aria-hidden />
                                LIVE
                              </Pill>

                              {live.durationLabel ? (
                                <Pill tone="neutral" title="Durée du live">
                                  ⏱ {live.durationLabel}
                                </Pill>
                              ) : (
                                <span />
                              )}
                            </div>

                            <div className="liveBottomRow">
                              <div className="liveName" title={live.displayName}>
                                {live.displayName}
                              </div>
                              <Pill tone="neutral" title="Viewers">
                                👁 {formatViewers(live.viewers)}
                              </Pill>
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

      {/* Modale #1 (liste) si >4 */}
      {openMonthList ? (
        <MonthClipsListModal
          title="🎬 Clips du mois"
          clips={clips}
          total={clipsTotal || clips.length}
          onClose={() => setOpenMonthList(false)}
          onPickClip={(c) => setOpenClip(c)}
          zIndex={79}
        />
      ) : null}

      {/* Modale #2 (lecteur) */}
      {openClip ? (
        <ClipPlayerModal
          clip={openClip}
          onClose={() => setOpenClip(null)}
          zIndex={80}
        />
      ) : null}
    </main>
  );
}
