// web/src/pages/LivesPage.tsx
import * as React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Hls from "hls.js";

import { formatViewers } from "../lib/format";
import { getLives } from "../lib/api";
import { svgThumb } from "../lib/thumb";
import type { LiveCard } from "../lib/types";

import { DailyWheelCard } from "../components/DailyWheelCard";
import { DailyBonusAccessCard } from "../components/DailyBonusAccessCard";
import { useAuth } from "../auth/AuthProvider";
import { useIsMobile } from "../hooks/useIsMobile";
import LivesPageMobile from "./LivesPage.mobile";

export type LiveCardVM = LiveCard & {
  thumbFallback: string;
  thumbFinal: string;
  durationLabel?: string | null;
  featured?: boolean;
};

export type ClipVM = {
  id: number;

  streamerSlug: string;
  streamerName: string | null;
  avatarUrl: string | null;

  title: string | null;
  createdAtMs: number;

  vodUrl: string | null;
  startSec: number;
  durationSec: number;

  clipUrl?: string | null;

  thumbUrl: string | null;
  likesCount: number;

  myLiked?: boolean;
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

function with5MinBust(url: string, nowMs: number) {
  const t = Math.floor(nowMs / 300000); // 5 minutes
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

function safeTitle(v: any) {
  return (
    String(v || "clip")
      .trim()
      .replace(/[^a-z0-9-_]+/gi, "_")
      .slice(0, 80) || "clip"
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function fetchMp4BlobWithProgress(
  clipId: number,
  onProgress: (loaded: number, total: number | null) => void
) {
  const url = `${API_BASE}/clips/${clipId}/mp4`;
  const r = await fetch(url, { method: "GET" });

  if (!r.ok || !r.body) {
    const txt = await r.text().catch(() => "");
    throw new Error(`download_${r.status}${txt ? `:${txt.slice(0, 120)}` : ""}`);
  }

  const total = Number(r.headers.get("content-length") || 0) || null;
  const reader = r.body.getReader();

  let loaded = 0;
  const parts: BlobPart[] = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;

    parts.push(new Uint8Array(value));
    loaded += value.byteLength;
    onProgress(loaded, total);
  }

  const type = r.headers.get("content-type") || "video/mp4";
  return new Blob(parts, { type });
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
          backgroundSize: "contain",   // ✅ montre l’image entière
          backgroundColor: "rgba(0,0,0,0.35)", // optionnel: jolies bandes si ratio différent

          opacity: 0.92,
          filter: "contrast(1.06) saturate(1.18) brightness(1.02)",
          transform: "none",

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

async function fetchStreamersIndex(): Promise<{
  featuredLiveSlugs: Set<string>;
  metaBySlug: Map<string, { avatarUrl: string | null; followersCount: number }>;
}> {
  try {
    const res = await fetch(`${API_BASE}/streamers`, {
      headers: { "content-type": "application/json" },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !Array.isArray(data)) {
      return { featuredLiveSlugs: new Set(), metaBySlug: new Map() };
    }

    const featuredLiveSlugs = new Set<string>();
    const metaBySlug = new Map<string, { avatarUrl: string | null; followersCount: number }>();

    for (const s of data) {
      if (!s) continue;

      const slug = String(s.slug || "").trim();
      if (!slug) continue;

      const isLive = !!s.isLive;
      const featured = !!s.featured;
      if (isLive && featured) featuredLiveSlugs.add(slug);

      const avatarUrlRaw =
        s.avatarUrl != null
          ? String(s.avatarUrl)
          : s.avatar_url != null
          ? String(s.avatar_url)
          : s.profilePictureUrl != null
          ? String(s.profilePictureUrl)
          : s.profile_picture_url != null
          ? String(s.profile_picture_url)
          : null;

      const followersCount =
        Number(
          s.followersCount ??
            s.followers_count ??
            s.followers ??
            s.followersTotal ??
            s.followers_total ??
            0
        ) || 0;

      metaBySlug.set(slug, {
        avatarUrl: avatarUrlRaw ? absolutize(avatarUrlRaw) : null,
        followersCount,
      });
    }

    return { featuredLiveSlugs, metaBySlug };
  } catch {
    return { featuredLiveSlugs: new Set(), metaBySlug: new Map() };
  }
}

async function fetchTopClipsMonth(token?: string | null): Promise<{ total: number; clips: ClipVM[] }> {
  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/clips/top?range=month&limit=24`, { headers });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || j.ok === false) return { total: 0, clips: [] };

    const arr = Array.isArray(j.clips) ? j.clips : Array.isArray(j) ? j : [];
    const total = Number(j.total ?? arr.length ?? 0) || 0;

    const clips = arr
      .map((x: any) => {
        const id = Number(x?.id);
        if (!Number.isFinite(id) || id <= 0) return null;

        const streamerSlug =
          x?.streamerSlug != null ? String(x.streamerSlug) : x?.streamer_slug != null ? String(x.streamer_slug) : "";

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

        const myLiked = x?.myLiked != null ? !!x.myLiked : x?.my_liked != null ? !!x.my_liked : undefined;

        const thumbUrl = x?.thumbUrl ? String(x.thumbUrl) : x?.thumb_url ? String(x.thumb_url) : null;

        const vodUrl = x?.vodUrl != null ? String(x.vodUrl) : x?.vod_url != null ? String(x.vod_url) : null;
        const startSec = Number(x?.startSec ?? x?.start_sec ?? 0) || 0;
        const durationSec = Number(x?.durationSec ?? x?.duration_sec ?? 0) || 0;

        const clipUrlRaw =
          x?.clipUrl != null
            ? String(x.clipUrl)
            : x?.clip_url != null
            ? String(x.clip_url)
            : x?.mp4_url != null
            ? String(x.mp4_url)
            : x?.mp4Url != null
            ? String(x.mp4Url)
            : null;

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
          clipUrl: clipUrlRaw ? absolutize(clipUrlRaw) : null,
          thumbUrl,
          likesCount,
          myLiked,
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
  token,
  canModerate,
  onPatchClip,
  onRemoveClip,
  onClose,
  zIndex,
}: {
  clip: ClipVM;
  token: string | null;
  canModerate: boolean; // admin / LeCasiNoze
  onPatchClip: (id: number, patch: Partial<ClipVM>) => void;
  onRemoveClip: (id: number) => void;
  onClose: () => void;
  zIndex: number;
}) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  const [busy, setBusy] = React.useState<null | "liking" | "downloading" | "deleting">(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const [pct, setPct] = React.useState<number>(0);

  const mp4 = String((clip as any).clipUrl || "").trim() || null;

  // ✅ Like: tout user connecté, seulement si pas déjà liké
  const canLike = !!token && !clip.myLiked;

  // ✅ Download/Delete: seulement admin/LeCasiNoze (+ connecté pour delete)
  const canDownload = canModerate && !!mp4;
  const canDelete = canModerate && !!token;

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const mp4Url = String((clip as any).clipUrl || "").trim() || null;
    const hlsUrl = clip.vodUrl;

    let hls: Hls | null = null;
    video.preload = "metadata";

    if (mp4Url) {
      const onMp4Meta = () => {
        video.play().catch(() => {});
      };

      video.src = mp4Url;
      video.addEventListener("loadedmetadata", onMp4Meta);

      return () => {
        try {
          video.removeEventListener("loadedmetadata", onMp4Meta);
        } catch {}
        try {
          video.pause();
        } catch {}
        try {
          video.removeAttribute("src");
          video.load();
        } catch {}
      };
    }

    const url = hlsUrl;
    if (!url) return;

    const start = Math.max(0, Number(clip.startSec || 0));
    const end = Math.max(start + 1, start + Math.max(1, Number(clip.durationSec || 0)));
    const EPS = 0.25;

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
          video.currentTime = end - EPS;
        }
      } catch {}
    };

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

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.addEventListener("loadedmetadata", onLoadedMeta);
      return () => cleanupVideo();
    }

    if (Hls.isSupported()) {
      hls = new Hls({
        autoStartLoad: false,
        startPosition: start,
        maxBufferLength: 30,
        backBufferLength: 0,
      });

      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        try {
          hls?.startLoad(start);
        } catch {}
      });

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
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

    video.src = url;
    video.addEventListener("loadedmetadata", onLoadedMeta);
    return () => cleanupVideo();
  }, [clip]);

  async function doLike() {
    if (!token) {
      setStatus("Connecte-toi pour liker.");
      return;
    }
    if (!canLike || busy) return;

    setBusy("liking");
    setStatus(null);

    // optimistic
    onPatchClip(clip.id, {
      myLiked: true,
      likesCount: Math.max(0, Number(clip.likesCount || 0) + 1),
    });

    try {
      const res = await fetch(`${API_BASE}/clips/${clip.id}/like`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ like: true }),
      });

      const j = await res.json().catch(() => null);
      if (!res.ok || !j || j.ok === false) throw new Error(String(j?.error || `http_${res.status}`));

      onPatchClip(clip.id, {
        myLiked: !!j.myLiked,
        likesCount: Number(j.likesCount || 0) || 0,
      });

      setStatus("Liké ✅");
    } catch (e: any) {
      // rollback
      onPatchClip(clip.id, {
        myLiked: clip.myLiked,
        likesCount: clip.likesCount,
      });
      setStatus(`Erreur like: ${String(e?.message || "failed")}`);
    } finally {
      setBusy(null);
    }
  }

  async function doDownload() {
    if (!canDownload || busy) return;

    setBusy("downloading");
    setStatus("Téléchargement…");
    setPct(0);

    try {
      const blob = await fetchMp4BlobWithProgress(clip.id, (loaded, total) => {
        const p = total
          ? Math.max(1, Math.min(99, Math.round((loaded / total) * 100)))
          : Math.max(1, Math.min(99, Math.round((loaded / (1024 * 1024)) * 6)));
        setPct(p);
      });

      const filename = `top-clip-${clip.id}-${safeTitle(clip.title)}.mp4`;
      downloadBlob(blob, filename);

      setPct(100);
      setStatus("Téléchargé ✓");
    } catch (e: any) {
      setStatus(`Erreur download: ${String(e?.message || "failed")}`);
    } finally {
      setBusy(null);
    }
  }

  async function doDelete() {
    if (!canDelete || !token || busy) return;

    const ok = window.confirm("Supprimer ce clip ? (soft-delete, puis cleanup TTL)");
    if (!ok) return;

    setBusy("deleting");
    setStatus(null);

    try {
      const res = await fetch(`${API_BASE}/clips/${clip.id}/delete`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
      });

      const j = await res.json().catch(() => null);
      if (!res.ok || !j || j.ok === false) throw new Error(String(j?.error || `http_${res.status}`));

      onRemoveClip(clip.id);
      onClose();
    } catch (e: any) {
      setStatus(`Erreur delete: ${String(e?.message || "failed")}`);
    } finally {
      setBusy(null);
    }
  }

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
                  onClick={() => onClose()}
                >
                  {clip.streamerName || clip.streamerSlug || "Streamer"}
                </Link>
              </span>
              <span style={{ opacity: 0.9 }}>•</span>
              <span>❤️ {Number(clip.likesCount || 0)}</span>
              <span style={{ opacity: 0.9 }}>•</span>
              <span>{mp4 ? "MP4" : "HLS"}</span>
            </div>
          </div>

          <div style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {/* ✅ Like: tout user connecté, seulement si pas déjà liké */}
            <button
              type="button"
              className="btnGhostSmall"
              onClick={() => void doLike()}
              disabled={!!busy || !canLike}
              title={!token ? "Connecte-toi pour liker" : clip.myLiked ? "Déjà liké" : "Liker"}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, opacity: canLike ? 1 : 0.6 }}
            >
              <span>{clip.myLiked ? "❤️" : "🤍"}</span>
              <span>{Number(clip.likesCount || 0)}</span>
            </button>

            {/* ✅ Download/Delete: admin/LeCasiNoze uniquement */}
            {canModerate ? (
              <>
                <button
                  type="button"
                  className="btnGhostSmall"
                  onClick={() => void doDownload()}
                  disabled={!canDownload || !!busy}
                  title={!mp4 ? "MP4 pas dispo" : "Télécharger le MP4"}
                >
                  {busy === "downloading" ? `Download… ${pct ? `${pct}%` : ""}` : "Download"}
                </button>

                <button
                  type="button"
                  className="btnGhostSmall"
                  onClick={() => void doDelete()}
                  disabled={!canDelete || !!busy}
                  style={{
                    background: "rgba(255, 70, 70, 0.14)",
                    border: "1px solid rgba(255, 70, 70, 0.28)",
                    opacity: canDelete ? 1 : 0.6,
                  }}
                  title={!token ? "Connecte-toi" : "Supprimer le clip"}
                >
                  {busy === "deleting" ? "Suppression…" : "Supprimer"}
                </button>
              </>
            ) : null}

            <button className="iconBtn" onClick={onClose} type="button" aria-label="Fermer" disabled={!!busy}>
              ✕
            </button>
          </div>
        </div>

        <div className="chatSheetBody" style={{ padding: 14 }}>
          {!mp4 && !clip.vodUrl ? (
            <div className="mutedSmall" style={{ opacity: 0.85 }}>
              Vidéo indisponible (MP4/VOD pas prête).
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

          {status ? (
            <div className="mutedSmall" style={{ marginTop: 10, opacity: 0.9 }}>
              {status}
            </div>
          ) : null}
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
      <div className="chatSheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" style={{ maxWidth: 860 }}>
        <div className="chatSheetTop" style={{ gap: 10 }}>
          <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
            <div style={{ fontWeight: 1100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
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
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const [clips, setClips] = React.useState<ClipVM[]>([]);
  const [clipsTotal, setClipsTotal] = React.useState(0);
  const [clipsLoading, setClipsLoading] = React.useState(false);

  const [openMonthList, setOpenMonthList] = React.useState(false);
  const [openClip, setOpenClip] = React.useState<ClipVM | null>(null);

  const refreshLockRef = React.useRef(false);
  const preloadedRef = React.useRef<Set<string>>(new Set());

  const authAny = useAuth() as any;
  const token: string | null = authAny?.token || null;
  const user = authAny?.user as any | null;
  const username = String(user?.username || "");
  const role = String(user?.role || "");
  const isAdmin = role === "admin";
  const canModerateClips = isAdmin || username.toLowerCase() === "lecasinoze";
  const isMobile = useIsMobile();

  const location = useLocation();
  const navigate = useNavigate();

  React.useEffect(() => {
    const open = new URLSearchParams(location.search).get("open");
    if (open === "clips") setOpenMonthList(true);
  }, [location.search]);

  const mergeThumbFinal = React.useCallback((prev: LiveCardVM[], nextBase: LiveCardVM[]) => {
    const prevMap = new Map(prev.map((x) => [String(x.slug || x.id), x] as const));
    return nextBase.map((x) => {
      const k = String(x.slug || x.id);
      const old = prevMap.get(k);
      return { ...x, thumbFinal: old?.thumbFinal || x.thumbFinal };
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

        const vmBase: LiveCardVM[] = (data as any[]).map((x: any) => {
          const fallback = svgThumb(x.displayName);
          const rawThumbUrl = absolutize(x.thumbUrl || x.thumb_url || null);
          const thumbUrl = rawThumbUrl ? with5MinBust(String(rawThumbUrl), nowMs) : null;
          const thumbFinal = thumbUrl || fallback;

          const started = x.liveStartedAt || x.live_started_at || null;
          const durationLabel = started ? formatDurationDot(String(started), nowMs) : null;

          return { ...x, thumbFallback: fallback, thumbFinal, durationLabel };
        });

        const { featuredLiveSlugs, metaBySlug } = await fetchStreamersIndex();

        const vmWithFeatured = vmBase.map((x) => {
          const slug = String(x.slug || "").trim();
          const meta = slug ? metaBySlug.get(slug) : undefined;

          return {
            ...x,
            // featured
            featured: x?.featured != null ? !!(x as any).featured : featuredLiveSlugs.has(slug),
            // meta avatar + followers (si dispo)
            avatarUrl: (x as any).avatarUrl ?? (x as any).avatar_url ?? meta?.avatarUrl ?? null,
            followersCount:
              Number((x as any).followersCount ?? (x as any).followers_count ?? (x as any).followers ?? meta?.followersCount ?? 0) ||
              0,
          } as any;
        });

        setLives((prev) => mergeThumbFinal(prev, vmWithFeatured));

        const preloadJobs = vmWithFeatured.map(async (live) => {
          const nowThumb = absolutize((live as any).thumbUrl || (live as any).thumb_url || null);
          const url = nowThumb ? with5MinBust(String(nowThumb), nowMs) : null;
          if (!url) return;
          if (preloadedRef.current.has(url)) return;
          preloadedRef.current.add(url);

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
      const r = await fetchTopClipsMonth(token);
      setClips(r.clips);
      setClipsTotal(r.total || r.clips.length);
    } finally {
      setClipsLoading(false);
    }
  }, [token]);

  React.useEffect(() => {
    load();
    loadClips();
  }, [load, loadClips]);

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

  const patchClip = React.useCallback((id: number, patch: Partial<ClipVM>) => {
    setClips((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    setOpenClip((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
  }, []);

  const removeClip = React.useCallback((id: number) => {
    setClips((prev) => prev.filter((x) => x.id !== id));
    setClipsTotal((n) => Math.max(0, (Number(n) || 0) - 1));
  }, []);

    if (isMobile) {
    return (
      <>
        <LivesPageMobile
          apiBase={API_BASE}
          lives={lives}
          loading={loading}
          refreshing={refreshing}
          err={err}
          totals={totals}
          featuredLives={featuredLives as any}
          normalLives={normalLives as any}
          clipsTop4={clipsTop4 as any}
          clipsTotal={clipsTotal}
          clipsLoading={clipsLoading}
          extraClipsCount={extraClipsCount}
          hasMoreThan4={hasMoreThan4}
          onOpenMonthList={() => setOpenMonthList(true)}
          onOpenClip={(c) => setOpenClip(c)}
        />

        {/* ✅ on garde tes modales existantes (inchangées) */}
        {openMonthList ? (
          <MonthClipsListModal
            title="🎬 Clips du mois"
            clips={clips}
            total={clipsTotal || clips.length}
            onClose={() => {
              setOpenMonthList(false);
              // nettoie ?open=clips
              if (location.search) navigate(location.pathname, { replace: true });
            }}
            onPickClip={(c) => setOpenClip(c)}
            zIndex={79}
          />
        ) : null}

        {openClip ? (
          <ClipPlayerModal
            clip={openClip}
            token={token}
            canModerate={canModerateClips}
            onPatchClip={patchClip}
            onRemoveClip={removeClip}
            onClose={() => setOpenClip(null)}
            zIndex={80}
          />
        ) : null}
      </>
    );
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
  grid-template-columns: repeat(auto-fill, minmax(280px, 320px));
  justify-content: start; /* empêche le stretch */
  align-items: start;
}

        .liveLink{
          text-decoration: none;
          color: inherit;
          display: block;
        }

.liveThumb{
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

        .hoverGlow{
          transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
        }
        .hoverGlow:hover{
          transform: translateY(-2px);
          box-shadow: 0 26px 70px rgba(0,0,0,0.38);
          border-color: rgba(255,90,180,0.25);
        }

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

        .sidebarDivider{
          height: 1px;
          margin: 10px 2px 2px;
          background: linear-gradient(90deg, rgba(255,255,255,0.0), rgba(255,255,255,0.16), rgba(255,255,255,0.0));
          opacity: 0.9;
        }

        .clipsCard{ padding: 14px; }
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
        .clipMidAvatar img{ width:100%; height:100%; object-fit: cover; display:block; }

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
        <div className="livesHeader">
          <div style={{ display: "grid", gap: 6, minWidth: 280 }}>
            <h1 className="livesH1">Lives</h1>
            <div className="mutedSmall" style={{ maxWidth: 760 }}>
              Bienvenue sur votre plateforme dédiée à la commu casino Fr.
              {refreshing ? (
                <span style={{ marginLeft: 10, opacity: 0.8, fontWeight: 900 }}>
                  <span className="livePing" aria-hidden />
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

            <GlassCard className="clipsCard">
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                <div style={{ display: "grid", gap: 4 }}>
                  <div style={{ fontWeight: 1400, letterSpacing: -0.25, fontSize: 14 }}>
                    <span style={{ opacity: 0.85 }}>🎬</span> Clips du mois
                  </div>
                  <div className="mutedSmall" style={{ opacity: 0.8 }}>
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
            {loading && lives.length === 0 ? (
              <div className="muted" style={{ marginTop: 12 }}>

              </div>
            ) : (
              <>
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
                                <span />
                                <Pill tone="neutral" title="Viewers">
                                  👁 {formatViewers(live.viewers)}
                                </Pill>
                              </div>
                            </div>

                            <div style={{ padding: "10px 8px 6px" }}>
                              <div className="liveTitle" title={live.title || ""}>
                                {live.title || "—"}
                              </div>
                              <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                                <div
                                  style={{
                                    width: 34,
                                    height: 34,
                                    borderRadius: 14,
                                    overflow: "hidden",
                                    border: "1px solid rgba(255,255,255,0.16)",
                                    background: "rgba(0,0,0,0.35)",
                                    flex: "0 0 auto",
                                  }}
                                  aria-hidden
                                >
                                  <img
                                    src={
                                      absolutize((live as any).avatarUrl || (live as any).avatar_url || null) ||
                                      svgThumb(live.displayName || "Streamer")
                                    }
                                    alt=""
                                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                                    onError={(e) => {
                                      (e.currentTarget as HTMLImageElement).src = svgThumb(live.displayName || "Streamer");
                                    }}
                                  />
                                </div>

                                <div style={{ minWidth: 0, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                                  <div
                                    style={{
                                      fontWeight: 1150,
                                      letterSpacing: -0.2,
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      maxWidth: 220,
                                    }}
                                    title={live.displayName}
                                  >
                                    {live.displayName}
                                  </div>

                                  <div className="mutedSmall" style={{ opacity: 0.8, fontWeight: 950 }}>
                                    ({formatViewers(Number((live as any).followersCount || 0))} follow)
                                  </div>
                                </div>
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
                              <span />
                              <Pill tone="neutral" title="Viewers">
                                👁 {formatViewers(live.viewers)}
                              </Pill>
                            </div>
                          </div>

                          <div style={{ padding: "10px 8px 6px" }}>
                            <div className="liveTitle" title={live.title || ""}>
                              {live.title || "—"}
                            </div>
                            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                              <div
                                style={{
                                  width: 34,
                                  height: 34,
                                  borderRadius: 14,
                                  overflow: "hidden",
                                  border: "1px solid rgba(255,255,255,0.16)",
                                  background: "rgba(0,0,0,0.35)",
                                  flex: "0 0 auto",
                                }}
                                aria-hidden
                              >
                                <img
                                  src={
                                    absolutize((live as any).avatarUrl || (live as any).avatar_url || null) ||
                                    svgThumb(live.displayName || "Streamer")
                                  }
                                  alt=""
                                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).src = svgThumb(live.displayName || "Streamer");
                                  }}
                                />
                              </div>

                              <div style={{ minWidth: 0, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                                <div
                                  style={{
                                    fontWeight: 1150,
                                    letterSpacing: -0.2,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    maxWidth: 220,
                                  }}
                                  title={live.displayName}
                                >
                                  {live.displayName}
                                </div>

                                <div className="mutedSmall" style={{ opacity: 0.8, fontWeight: 950 }}>
                                  ({formatViewers(Number((live as any).followersCount || 0))} follow)
                                </div>
                              </div>
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


                  </section>
                </div>
              </>
            )}
          </section>
        </div>
      </div>

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

      {openClip ? (
        <ClipPlayerModal
          clip={openClip}
          token={token}
          canModerate={canModerateClips}
          onPatchClip={patchClip}
          onRemoveClip={removeClip}
          onClose={() => setOpenClip(null)}
          zIndex={80}
        />
      ) : null}
    </main>
  );
  
}
