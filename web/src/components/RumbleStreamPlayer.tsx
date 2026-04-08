// web/src/components/RumbleStreamPlayer.tsx
import * as React from "react";
import Hls from "hls.js";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

function toProxiedHls(url: string): string {
  return `${API_BASE}/hls?u=${encodeURIComponent(url)}`;
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
      const capIdx = pickBestCapIndex(hls.levels || [], 720);
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

    // Safari / iOS : HLS natif
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = proxiedUrl;
      safePlay(video);
      setCanChooseQuality(false);
      return () => { video.pause(); video.removeAttribute("src"); video.load(); };
    }

    if (!Hls.isSupported()) return;

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      startPosition: -1,
      backBufferLength: 30,
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 10,
      maxLiveSyncPlaybackRate: 1.0,
      abrBandWidthFactor: 0.8,
      abrBandWidthUpFactor: 0.7,
      fragLoadingMaxRetry: 6,
      levelLoadingMaxRetry: 6,
      manifestLoadingMaxRetry: 6,
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

      const capIdx = pickBestCapIndex(levels, 720);
      const autoLabel = capIdx >= 0 ? "Auto (max 720p)" : "Auto (recommandé)";
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

      safePlay(video);
    });

    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (!data.fatal) return;
      try {
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad(-1);
        else hls.destroy();
      } catch {}
    });

    return () => {
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
          autoPlay
          preload="auto"
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
