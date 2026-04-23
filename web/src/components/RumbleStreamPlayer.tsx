// web/src/components/RumbleStreamPlayer.tsx
import * as React from "react";
import Hls from "hls.js";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");
const HLS_BASE = (import.meta.env.VITE_HLS_BASE ?? API_BASE).replace(/\/$/, "");

function toProxiedHls(url: string): string {
  // 1a-1791.com est le CDN Rumble avec CORS * — pas besoin de proxy
  if (url.includes("1a-1791.com")) return url;
  return `${HLS_BASE}/hls?u=${encodeURIComponent(url)}`;
}

function safePlay(video: HTMLVideoElement) {
  try {
    const p = video.play();
    if (p && typeof (p as any).catch === "function") (p as any).catch(() => {});
  } catch {}
}

type LevelOpt = {
  key: string;
  label: string;
  levelIndex?: number;
  height?: number;
};

function uniqBy<T>(arr: T[], keyFn: (x: T) => string) {
  const seen = new Set<string>();
  return arr.filter((x) => { const k = keyFn(x); if (seen.has(k)) return false; seen.add(k); return true; });
}

function pickBestCapIndex(levels: any[], maxHeight: number): number {
  let best = -1, bestH = -1;
  for (let i = 0; i < levels.length; i++) {
    const h = Number(levels[i]?.height || 0);
    if (h > 0 && h <= maxHeight && h >= bestH) { bestH = h; best = i; }
  }
  return best;
}


function GearIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M19.4 13a7.8 7.8 0 0 0 .05-2l2-1.2-2-3.4-2.3.7a8.2 8.2 0 0 0-1.7-1L15.3 3h-4L8.6 6.1a8.2 8.2 0 0 0-1.7 1l-2.3-.7-2 3.4 2 1.2a7.8 7.8 0 0 0 0 2l-2 1.2 2 3.4 2.3-.7a8.2 8.2 0 0 0 1.7 1L11.3 21h4l1.7-3.1a8.2 8.2 0 0 0 1.7-1l2.3.7 2-3.4-2-1.2Z"
        stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export type RumbleStreamPlayerProps = {
  hlsUrl?: string | null;
  thumbnailUrl?: string | null;
  title?: string | null;
  isLive?: boolean;
};

export default function RumbleStreamPlayer({ hlsUrl, thumbnailUrl, isLive }: RumbleStreamPlayerProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const hlsRef = React.useRef<Hls | null>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const [q, setQ] = React.useState<string>(() => localStorage.getItem("ll_quality") || "auto");
  const [levelsUI, setLevelsUI] = React.useState<LevelOpt[]>([{ key: "auto", label: "Auto (recommandé)" }]);
  const [canChooseQuality, setCanChooseQuality] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);

  // Fermer le menu en cliquant dehors
  React.useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [menuOpen]);

  // Appliquer le changement de qualité
  React.useEffect(() => {
    localStorage.setItem("ll_quality", q);
    const hls = hlsRef.current;
    if (!hls) return;
    try {
      const capIdx = pickBestCapIndex(hls.levels || [], 1080);
      if (q === "auto") {
        hls.currentLevel = -1;
        hls.autoLevelCapping = capIdx >= 0 ? capIdx : -1;
      } else {
        const idx = Number(q);
        if (!Number.isFinite(idx)) return;
        hls.autoLevelCapping = -1;
        hls.currentLevel = idx;
      }
    } catch {}
  }, [q]);

  // Init / cleanup player
  React.useEffect(() => {
    const video = videoRef.current;
    if (!video || !isLive || !hlsUrl) return;

    const proxiedUrl = toProxiedHls(hlsUrl);

    // HLS.js en priorité — Chrome 130+ supporte HLS nativement mais son player DVR
    // ne sait pas chercher le live edge. HLS.js donne un contrôle total.
    // Safari/iOS uniquement : HLS natif (HLS.js non supporté)
    if (!Hls.isSupported()) {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = proxiedUrl;
        // Safari + DVR : forcer le seek au live edge dès que la durée est connue
        const onMeta = () => {
          if (video.duration && Number.isFinite(video.duration) && video.duration > 10) {
            video.currentTime = video.duration - 4;
          }
          safePlay(video);
        };
        video.addEventListener("loadedmetadata", onMeta, { once: true });
        return () => {
          video.removeEventListener("loadedmetadata", onMeta);
          video.pause(); video.removeAttribute("src"); video.load();
        };
      }
      return;
    }

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,   // Rumble n'utilise pas LL-HLS (pas de #EXT-X-PART)
      backBufferLength: 8,
      // live-edge — viser au plus près du direct (1× targetDuration)
      liveSyncDurationCount: 1,
      liveMaxLatencyDurationCount: 4,
      liveDurationInfinity: true,
      maxLiveSyncPlaybackRate: 1.4,
      // buffer
      maxBufferLength: 16,
      maxMaxBufferLength: 24,
      maxBufferHole: 0.5,
      maxFragLookUpTolerance: 0.2,
      // ABR conservateur
      abrBandWidthFactor: 0.8,
      abrBandWidthUpFactor: 0.7,
      // retries réseau
      fragLoadingMaxRetry: 6,
      fragLoadingRetryDelay: 1000,
      fragLoadingMaxRetryTimeout: 8000,
      levelLoadingMaxRetry: 6,
      levelLoadingRetryDelay: 1000,
      levelLoadingMaxRetryTimeout: 8000,
      manifestLoadingMaxRetry: 6,
      manifestLoadingRetryDelay: 1000,
      manifestLoadingMaxRetryTimeout: 8000,
      nudgeMaxRetry: 6,
      nudgeOffset: 0.1,
      startFragPrefetch: false,
    });

    hlsRef.current = hls;
    hls.attachMedia(video);

    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      hls.loadSource(proxiedUrl);
    });

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      const levels = hls.levels || [];

      const lvls = levels.map((lvl: any, i: number) => ({
        key: String(i),
        label: lvl?.height ? `${lvl.height}p` : `Niveau ${i}`,
        levelIndex: i,
        height: typeof lvl?.height === "number" ? lvl.height : undefined,
      }));
      const unique = uniqBy(lvls, (x) => String(x.height || x.label));
      unique.sort((a, b) => (b.height || 0) - (a.height || 0));

      const capIdx = pickBestCapIndex(levels, 1080);
      const autoLabel = capIdx >= 0 ? "Auto (max 1080p)" : "Auto (recommandé)";
      const opts: LevelOpt[] = [{ key: "auto", label: autoLabel }, ...unique];

      setLevelsUI(opts);
      setCanChooseQuality(unique.length >= 2);

      // Appliquer la qualité sauvegardée ou cap 720p
      const validKeys = new Set(opts.map((o) => o.key));
      const savedQ = localStorage.getItem("ll_quality") || "auto";
      const finalQ = validKeys.has(savedQ) ? savedQ : "auto";
      setQ(finalQ);

      try {
        if (finalQ === "auto") {
          hls.currentLevel = -1;
          hls.autoLevelCapping = capIdx >= 0 ? capIdx : -1;
        } else {
          const idx = Number(finalQ);
          if (Number.isFinite(idx)) { hls.autoLevelCapping = -1; hls.currentLevel = idx; }
        }
      } catch {}

      // DVR playlist : currentTime peut être à 0 (début du DVR, il y a des heures).
      // On force le seek à la fin réelle de la playlist (dernier fragment),
      // plus proche du direct que `liveSyncPosition` qui reste 1×targetDuration derrière.
      const seekToLiveEdge = () => {
        try {
          const level = (hls as any).levels?.[(hls as any).currentLevel >= 0 ? (hls as any).currentLevel : 0];
          const frags = level?.details?.fragments;
          if (Array.isArray(frags) && frags.length > 0) {
            const last = frags[frags.length - 1];
            const edge = Number(last?.start ?? 0) + Number(last?.duration ?? 0);
            if (Number.isFinite(edge) && edge > 0) {
              video.currentTime = Math.max(0, edge - 1.5);
              return;
            }
          }
          const livePos = (hls as any).liveSyncPosition;
          if (typeof livePos === "number" && Number.isFinite(livePos) && livePos > 0) {
            video.currentTime = livePos;
          } else if (video.duration && Number.isFinite(video.duration) && video.duration > 10) {
            video.currentTime = video.duration - 2;
          }
        } catch {}
      };

      seekToLiveEdge();
      safePlay(video);
    });

    // Après que le premier buffer est chargé, re-vérifier qu'on est au live edge
    hls.on(Hls.Events.BUFFER_APPENDED, (() => {
      let done = false;
      return () => {
        if (done) return;
        done = true;
        try {
          const livePos = (hls as any).liveSyncPosition;
          if (typeof livePos === "number" && Number.isFinite(livePos) && livePos > 0) {
            const ct = video.currentTime;
            // Si on est à plus de 10s du live edge, corriger
            if (livePos - ct > 10) {
              video.currentTime = livePos;
            }
          }
        } catch {}
      };
    })());

    let mediaErrorRetries = 0;
    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (!data.fatal) return;
      try {
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          if (mediaErrorRetries < 3) { mediaErrorRetries++; hls.recoverMediaError(); }
          else hls.destroy();
        } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad(-1);
        } else {
          hls.destroy();
        }
      } catch {}
    });

    // ── Stall watchdog ─────────────────────────────────────────
    const STALL_GRACE_MS = 20_000;
    const PROGRESS_EPS = 0.5;
    let lastT = Number(video.currentTime || 0);
    let lastProgressAt = Date.now();

    const onTimeUpdate = () => {
      const nowT = Number(video.currentTime || 0);
      if (Math.abs(nowT - lastT) > PROGRESS_EPS) { lastT = nowT; lastProgressAt = Date.now(); }
    };
    const onPlaying = () => { lastProgressAt = Date.now(); lastT = Number(video.currentTime || 0); };
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("playing", onPlaying);

    const tStall = window.setInterval(() => {
      if (!video || video.paused || document.hidden) return;
      if (Number(video.currentTime || 0) <= 0.01) return;
      if (Date.now() - lastProgressAt < STALL_GRACE_MS) return;
      if (video.readyState >= 3) { lastProgressAt = Date.now(); lastT = Number(video.currentTime || 0); return; }
      try { hls.startLoad(-1); } catch {}
      lastProgressAt = Date.now(); lastT = Number(video.currentTime || 0);
    }, 3000);

    // ── Live-edge resync ────────────────────────────────────────
    // Si on dérive de plus de 8s de la fin réelle de la playlist, on recolle.
    const RESYNC_THRESHOLD_SEC = 8;
    const tLiveEdge = window.setInterval(() => {
      if (!video || video.paused || document.hidden) return;
      try {
        const level = (hls as any).levels?.[(hls as any).currentLevel >= 0 ? (hls as any).currentLevel : 0];
        const frags = level?.details?.fragments;
        let edge: number | null = null;
        if (Array.isArray(frags) && frags.length > 0) {
          const last = frags[frags.length - 1];
          const e = Number(last?.start ?? 0) + Number(last?.duration ?? 0);
          if (Number.isFinite(e) && e > 0) edge = e;
        }
        if (edge === null) {
          const livePos = Number((hls as any).liveSyncPosition);
          if (Number.isFinite(livePos)) edge = livePos;
        }
        if (edge === null) return;
        const target = Math.max(0, edge - 1.5);
        const ct = Number(video.currentTime || 0);
        if (target - ct > RESYNC_THRESHOLD_SEC) {
          video.currentTime = target;
        }
      } catch {}
    }, 5000);

    return () => {
      window.clearInterval(tStall);
      window.clearInterval(tLiveEdge);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("playing", onPlaying);
      try { hls.destroy(); } catch {}
      hlsRef.current = null;
    };
  }, [isLive, hlsUrl]);

  // Éviter la pause au fullscreen / visibilitychange
  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onFs = () => {
      // Après un changement de fullscreen, forcer la lecture si la vidéo s'est mise en pause
      setTimeout(() => {
        if (video.paused) safePlay(video);
      }, 150);
    };

    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange" as any, onFs);

    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange" as any, onFs);
    };
  }, []);

  const selectedLabel = React.useMemo(() => levelsUI.find((o) => o.key === q)?.label ?? "Auto", [levelsUI, q]);

  return (
    <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ position: "relative" }}>
        <video
          ref={videoRef}
          controls
          playsInline
          preload="auto"
          disableRemotePlayback
          poster={thumbnailUrl || undefined}
          style={{ width: "100%", display: "block", background: "rgba(0,0,0,0.25)" }}
        />

        {canChooseQuality && (
          <div ref={menuRef} style={{ position: "absolute", right: 10, bottom: 10 }}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              title="Qualité"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "8px 10px", borderRadius: 14,
                background: "rgba(10, 10, 18, 0.72)", backdropFilter: "blur(10px)",
                border: "1px solid rgba(180, 160, 255, 0.28)",
                color: "rgba(235, 235, 255, 0.95)", cursor: "pointer",
                boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
              }}
            >
              <GearIcon />
              <span style={{ fontSize: 12, opacity: 0.95 }}>{selectedLabel}</span>
            </button>

            {menuOpen && (
              <div style={{
                position: "absolute", right: 0, bottom: "calc(100% + 10px)",
                minWidth: 180, borderRadius: 14, overflow: "hidden",
                background: "rgba(10, 10, 18, 0.92)",
                border: "1px solid rgba(180, 160, 255, 0.25)",
                boxShadow: "0 14px 40px rgba(0,0,0,0.55)",
              }}>
                <div style={{ padding: "10px 12px", fontSize: 12, opacity: 0.8 }}>Qualité</div>
                <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />
                {levelsUI.map((opt) => {
                  const active = opt.key === q;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => { setQ(opt.key); setMenuOpen(false); }}
                      style={{
                        width: "100%", textAlign: "left", padding: "10px 12px", fontSize: 13,
                        color: active ? "white" : "rgba(235,235,255,0.88)",
                        background: active ? "rgba(120, 90, 255, 0.35)" : "transparent",
                        border: "none", cursor: "pointer",
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
