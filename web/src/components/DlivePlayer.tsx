import * as React from "react";
import Hls from "hls.js";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");
const HLS_BASE = (import.meta.env.VITE_HLS_BASE ?? API_BASE).replace(/\/$/, "");

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iP(hone|ad|od)/i.test(navigator.userAgent || "");
}

function isSafariUA(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Brave/i.test(ua);
}

type LevelOpt = {
  key: string; // "auto" or levelIndex string
  label: string;
  levelIndex?: number;
  height?: number;
  bitrate?: number;
};

function uniqBy<T>(arr: T[], keyFn: (x: T) => string) {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of arr) {
    const k = keyFn(x);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

function pickBestCapIndex(levels: any[], maxHeight: number): number {
  // pick highest height <= maxHeight
  let best = -1;
  let bestH = -1;
  for (let i = 0; i < levels.length; i++) {
    const h = Number(levels[i]?.height || 0);
    if (h > 0 && h <= maxHeight && h >= bestH) {
      bestH = h;
      best = i;
    }
  }
  return best;
}

function GearIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M19.4 13a7.8 7.8 0 0 0 .05-2l2-1.2-2-3.4-2.3.7a8.2 8.2 0 0 0-1.7-1L15.3 3h-4L8.6 6.1a8.2 8.2 0 0 0-1.7 1l-2.3-.7-2 3.4 2 1.2a7.8 7.8 0 0 0 0 2l-2 1.2 2 3.4 2.3-.7a8.2 8.2 0 0 0 1.7 1L11.3 21h4l1.7-3.1a8.2 8.2 0 0 0 1.7-1l2.3.7 2-3.4-2-1.2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function forceRate1(video: HTMLVideoElement) {
  // Important: playbackRate peut rester “collé” entre deux loads
  try {
    video.defaultPlaybackRate = 1;
    video.playbackRate = 1;
  } catch {}
}

export function DlivePlayer({
  channelSlug,
  channelUsername,
  isLive,
}: {
  channelSlug: string | null | undefined;
  channelUsername: string | null | undefined;
  isLive: boolean | undefined;
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const hlsRef = React.useRef<Hls | null>(null);

  const menuRef = React.useRef<HTMLDivElement>(null);

  // ✅ Debug uniquement en DEV + ?debug=1 (aucun texte UI)
  const debugEnabled =
    !!import.meta.env.DEV && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug");
  const dbgLog = (...args: any[]) => {
    if (debugEnabled) console.debug("[DlivePlayer]", ...args);
  };

  const [menuOpen, setMenuOpen] = React.useState(false);

  // q = "auto" ou index de level ("0", "1", ...)
  const [q, setQ] = React.useState<string>(() => localStorage.getItem("ll_quality") || "auto");

  const [levelsUI, setLevelsUI] = React.useState<LevelOpt[]>([{ key: "auto", label: "Auto (recommandé)" }]);
  const [canChooseQuality, setCanChooseQuality] = React.useState(false);

  const ios = isIOS();
  const safari = isSafariUA();

  // ✅ Anti-remute: certains navigateurs rebasculent en muted au relayout / fullscreen
  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const unmute = () => {
      try {
        if (video.muted) video.muted = false;
        // si le volume est à 0 (cas rare), on le remet à un niveau normal
        if (typeof video.volume === "number" && video.volume === 0) video.volume = 1;
      } catch {}
    };

    const onFs = () => unmute();
    const onMeta = () => unmute();
    const onResize = () => unmute();

    document.addEventListener("fullscreenchange", onFs);
    video.addEventListener("loadedmetadata", onMeta);
    window.addEventListener("resize", onResize);

    // au montage
    unmute();

    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      video.removeEventListener("loadedmetadata", onMeta);
      window.removeEventListener("resize", onResize);
    };
  }, [channelSlug, channelUsername, isLive]);

  // ✅ LOCK vitesse en LIVE (empêche un user de rester en 1.1/1.15)
  const lockingRateRef = React.useRef(false);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // On force 1x au montage
    if (isLive) forceRate1(video);

    const onRateChange = () => {
      if (!isLive) return;
      if (lockingRateRef.current) return;

      const r = Number(video.playbackRate);
      if (!Number.isFinite(r) || Math.abs(r - 1) > 0.001) {
        lockingRateRef.current = true;
        forceRate1(video);
        // libère au tick suivant (évite boucle infinie)
        window.setTimeout(() => {
          lockingRateRef.current = false;
        }, 0);
      }
    };

    // Si le navigateur propose “vitesse” dans les controls, on neutralise en live
    video.addEventListener("ratechange", onRateChange);

    return () => {
      video.removeEventListener("ratechange", onRateChange);
    };
  }, [isLive, channelSlug, channelUsername]);

  // Close popover on outside click / ESC
  React.useEffect(() => {
    if (!menuOpen) return;

    const onDown = (e: MouseEvent) => {
      const t = e.target as any;
      if (!menuRef.current) return;
      if (menuRef.current.contains(t)) return;
      setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };

    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // Apply quality changes (hls.js only)
  React.useEffect(() => {
    localStorage.setItem("ll_quality", q);

    const hls = hlsRef.current;
    if (!hls) return;

    try {
      const lvls = hls.levels || [];
      const capIdx720 = pickBestCapIndex(lvls, 720);

      if (q === "auto") {
        hls.currentLevel = -1;
        // cap à 720 seulement si on a réellement une 720 (ou en dessous) dans le manifest
        hls.autoLevelCapping = capIdx720 >= 0 ? capIdx720 : -1;
        return;
      }

      const idx = Number(q);
      if (!Number.isFinite(idx)) return;
      hls.autoLevelCapping = -1;
      hls.currentLevel = idx;
    } catch {}
  }, [q]);

  // ✅ LIVE EDGE / FREEZE watchdogs (stabilité + resync)
  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let tLiveEdge: number | null = null;
    let tStall: number | null = null;

    // réglages (tu peux ajuster)
    const RESYNC_THRESHOLD_SEC = 10; // si > 10s derrière => resync
    const IOS_LIVE_SAFETY_SEC = 1.5; // seek à end - 1.5s
    const STALL_GRACE_MS = 8000; // si pas de progrès pendant 8s => recovery
    const PROGRESS_EPS = 0.02; // 20ms de progrès = ok

    let lastT = Number(video.currentTime || 0);
    let lastProgressAt = Date.now();

    const markProgress = () => {
      const nowT = Number(video.currentTime || 0);
      if (Math.abs(nowT - lastT) > PROGRESS_EPS) {
        lastT = nowT;
        lastProgressAt = Date.now();
      }
    };

    // listeners utiles
    const onTimeUpdate = () => markProgress();
    const onPlaying = () => {
      lastProgressAt = Date.now();
      markProgress();
    };
    const onWaiting = () => dbgLog("video waiting", { rs: video.readyState, ns: video.networkState });
    const onStalled = () => dbgLog("video stalled", { rs: video.readyState, ns: video.networkState });
    const onError = () => dbgLog("video error", { err: (video as any).error });

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("stalled", onStalled);
    video.addEventListener("error", onError);

    // 1) live-edge resync (toutes les 7s)
    tLiveEdge = window.setInterval(() => {
      if (!isLive) return;
      if (!video || video.paused) return;

      const hls = hlsRef.current;

      // hls.js: liveSyncPosition
      if (hls && typeof (hls as any).liveSyncPosition === "number" && Number.isFinite((hls as any).liveSyncPosition)) {
        const livePos = Number((hls as any).liveSyncPosition);
        const ct = Number(video.currentTime || 0);
        const behind = livePos - ct;

        if (Number.isFinite(behind) && behind > RESYNC_THRESHOLD_SEC) {
          dbgLog("resync (hlsjs)", { behind: behind.toFixed(2), ct: ct.toFixed(2), livePos: livePos.toFixed(2) });
          try {
            // petit seek direct au live edge
            video.currentTime = livePos;
          } catch {}
        }
        return;
      }

      // native (iOS/Safari): seekable.end()
      try {
        const s = video.seekable;
        if (!s || s.length <= 0) return;
        const end = s.end(s.length - 1);
        const ct = Number(video.currentTime || 0);
        const behind = end - ct;

        if (Number.isFinite(behind) && behind > RESYNC_THRESHOLD_SEC) {
          const target = Math.max(0, end - IOS_LIVE_SAFETY_SEC);
          dbgLog("resync (native)", { behind: behind.toFixed(2), ct: ct.toFixed(2), end: end.toFixed(2) });
          video.currentTime = target;
        }
      } catch {}
    }, 7000);

    // 2) stall watchdog (toutes les 3s)
    tStall = window.setInterval(() => {
      if (!isLive) return;
      if (!video) return;
      if (video.paused) return;

      // si le doc est hidden, on évite les actions agressives
      if (typeof document !== "undefined" && (document as any).hidden) return;

      const now = Date.now();
      const since = now - lastProgressAt;

      // ignore si pas encore démarré
      if (Number(video.currentTime || 0) <= 0.01) return;

      if (since < STALL_GRACE_MS) return;

      const hls = hlsRef.current;
      const rs = video.readyState;
      const ns = video.networkState;

      dbgLog("stall detected", {
        sinceMs: since,
        ct: Number(video.currentTime || 0).toFixed(2),
        rs,
        ns,
        mode: hls ? "hlsjs" : "native",
      });

      // === Recovery escalier ===

      // A) kick play()
      video.play().catch(() => {});

      // B) petit nudge (débloque parfois un trou)
      try {
        video.currentTime = Number(video.currentTime || 0) + 0.1;
      } catch {}

      // C) hls.js recover
      if (hls) {
        try {
          // on tente d'abord un recover media
          hls.recoverMediaError();
        } catch {}
        try {
          // et on relance le chargement
          hls.startLoad(-1);
        } catch {}
      } else {
        // D) native hard refresh rare
        try {
          const cur = video.currentTime || 0;
          const base = video.src || "";
          if (base) {
            const sep = base.includes("?") ? "&" : "?";
            video.src = `${base}${sep}t=${Date.now()}`;
            video.load();
            // on essaye de revenir proche de la position (si possible)
            try {
              video.currentTime = cur;
            } catch {}
            video.play().catch(() => {});
          }
        } catch {}
      }

      // reset timer après tentative
      lastProgressAt = Date.now();
      lastT = Number(video.currentTime || 0);
    }, 3000);

    return () => {
      if (tLiveEdge) window.clearInterval(tLiveEdge);
      if (tStall) window.clearInterval(tStall);

      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("stalled", onStalled);
      video.removeEventListener("error", onError);
    };
  }, [isLive, channelSlug, channelUsername]);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // cleanup previous
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch {}
      hlsRef.current = null;
    }

    // reset video
    try {
      video.pause();
    } catch {}
    forceRate1(video); // ✅ important
    video.removeAttribute("src");
    video.load();

    const username = String(channelUsername || "").trim();
    if (!username) {
      dbgLog("missing channelUsername (cannot play)", { channelSlug });
      return;
    }
    if (!isLive) {
      dbgLog("skip (offline)", { username });
      return;
    }

    const upstream = `https://live.prd.dlive.tv/hls/live/${encodeURIComponent(username)}.m3u8?mobileweb`;
    const proxied = `${HLS_BASE}/hls?u=${encodeURIComponent(upstream)}`;

    const nativeHls = video.canPlayType("application/vnd.apple.mpegurl") !== "";
    const hlsJsSupported = Hls.isSupported();

    // iOS => native only (pas de choix qualité manuel côté hls.js)
    const mode = ios && nativeHls ? "native-ios" : hlsJsSupported ? "hlsjs-proxy" : nativeHls ? "native" : "unsupported";

    dbgLog("init", {
      username,
      isLive: String(isLive),
      nativeHls: String(nativeHls),
      hlsJsSupported: String(hlsJsSupported),
      ios: String(ios),
      safari: String(safari),
      mode,
      hlsBase: HLS_BASE,
      q,
    });

    // Native
    if (mode === "native-ios" || mode === "native") {
      video.src = proxied; // ✅ passe par ton proxy (headers + CORS + rewrite m3u8)
      forceRate1(video);
      video.play().catch(() => {});
      setCanChooseQuality(false);
      setLevelsUI([{ key: "auto", label: "Auto" }]);
      return;
    }

    if (mode !== "hlsjs-proxy") return;

    const hls = new Hls({
      lowLatencyMode: true,

      // live-edge + réduit DVR
      liveSyncDurationCount: 2,
      liveMaxLatencyDurationCount: 6,

      // ✅ IMPORTANT: pas de catch-up en vitesse (cause 1.1/1.15)
      maxLiveSyncPlaybackRate: 1.0,

      // ✅ Buffer un poil plus stable (moins de micro-freezes)
      backBufferLength: 30,
      maxBufferLength: 20,

      // ✅ ABR plus conservateur (moins de yo-yo)
      abrBandWidthFactor: 0.8,
      abrBandWidthUpFactor: 0.7,

      // ✅ retries réseau (résilience)
      fragLoadingMaxRetry: 6,
      fragLoadingRetryDelay: 800,
      fragLoadingMaxRetryTimeout: 6400,

      levelLoadingMaxRetry: 6,
      levelLoadingRetryDelay: 800,
      levelLoadingMaxRetryTimeout: 6400,

      manifestLoadingMaxRetry: 6,
      manifestLoadingRetryDelay: 800,
      manifestLoadingMaxRetryTimeout: 6400,
    });

    hlsRef.current = hls;
    hls.attachMedia(video);

    // logs hls.js utiles en debug
    if (debugEnabled) {
      hls.on(Hls.Events.ERROR, (_e, data) => {
        dbgLog("hls error", {
          fatal: !!data?.fatal,
          type: data?.type,
          details: data?.details,
          reason: data?.reason,
          response: data?.response ? { code: data.response.code, text: data.response.text } : undefined,
        });
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => dbgLog("level switched", data));
      hls.on(Hls.Events.FRAG_LOADED, (_e, data) => dbgLog("frag loaded", { sn: data?.frag?.sn, lvl: data?.frag?.level }));
      hls.on(Hls.Events.ERROR, (_e, data) => {
      // log complet si tu veux
      dbgLog("hls error", {
        fatal: !!data?.fatal,
        type: data?.type,
        details: data?.details,
        reason: data?.reason,
        response: data?.response ? { code: data.response.code, text: data.response.text } : undefined,
      });

      // ✅ équivalent “buffer stalled”
      if (data?.details === (Hls.ErrorDetails as any)?.BUFFER_STALLED_ERROR) {
        dbgLog("buffer stalled error");
      }
    });

    }

    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      hls.loadSource(proxied);
    });

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      const lvls = (hls.levels || []).map((lvl: any, i: number) => ({
        key: String(i),
        label: lvl?.height ? `${lvl.height}p` : `Niveau ${i}`,
        levelIndex: i,
        height: typeof lvl?.height === "number" ? lvl.height : undefined,
        bitrate: typeof lvl?.bitrate === "number" ? lvl.bitrate : undefined,
      }));

      const unique = uniqBy(lvls, (x) => String(x.height || x.label));
      unique.sort((a, b) => (b.height || 0) - (a.height || 0));

      const capIdx720 = pickBestCapIndex(hls.levels || [], 720);
      const autoLabel = capIdx720 >= 0 ? "Auto (max 720p)" : "Auto (recommandé)";
      const opts: LevelOpt[] = [{ key: "auto", label: autoLabel }, ...unique];

      setLevelsUI(opts);
      setCanChooseQuality(unique.length >= 2);

      const validKeys = new Set(opts.map((o) => o.key));
      if (!validKeys.has(q)) setQ("auto");

      try {
        hls.currentLevel = -1;
        hls.autoLevelCapping = capIdx720 >= 0 ? capIdx720 : -1;
      } catch {}

      // ✅ force 1x au moment où ça démarre réellement
      forceRate1(video);
      video.play().catch(() => {});
    });

    // gardé: recovery fatal (déjà ok)
    hls.on(Hls.Events.ERROR, (_evt, data) => {
      if (data?.fatal) {
        try {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad(-1);
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          else hls.destroy();
        } catch {}
      }
    });

    return () => {
      try {
        hls.destroy();
      } catch {}
      hlsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelSlug, channelUsername, isLive, HLS_BASE]);

  const selectedLabel = React.useMemo(() => {
    const found = levelsUI.find((o) => o.key === q);
    return found?.label ?? "Auto";
  }, [levelsUI, q]);

  return (
    <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ position: "relative" }}>
        <video
          ref={videoRef}
          controls
          playsInline
          autoPlay
          style={{ width: "100%", display: "block", background: "rgba(0,0,0,0.25)" }}
        />

        {/* Engrenage intégré au player (overlay) */}
        {canChooseQuality && !ios && (
          <div ref={menuRef} style={{ position: "absolute", right: 10, bottom: 10 }}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              title="Qualité"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                borderRadius: 14,
                background: "rgba(10, 10, 18, 0.72)",
                backdropFilter: "blur(10px)",
                border: "1px solid rgba(180, 160, 255, 0.28)",
                color: "rgba(235, 235, 255, 0.95)",
                cursor: "pointer",
                boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
              }}
            >
              <GearIcon />
              <span style={{ fontSize: 12, opacity: 0.95 }}>{selectedLabel}</span>
            </button>

            {menuOpen && (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  bottom: "calc(100% + 10px)",
                  minWidth: 180,
                  borderRadius: 14,
                  overflow: "hidden",
                  background: "rgba(10, 10, 18, 0.92)",
                  border: "1px solid rgba(180, 160, 255, 0.25)",
                  boxShadow: "0 14px 40px rgba(0,0,0,0.55)",
                }}
              >
                <div style={{ padding: "10px 12px", fontSize: 12, opacity: 0.8 }}>Qualité</div>
                <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

                {levelsUI.map((opt) => {
                  const active = opt.key === q;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => {
                        setQ(opt.key);
                        setMenuOpen(false);
                      }}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 12px",
                        fontSize: 13,
                        color: active ? "white" : "rgba(235,235,255,0.88)",
                        background: active ? "rgba(120, 90, 255, 0.35)" : "transparent",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      {opt.label}
                      {opt.key !== "auto" && opt.height ? (
                        <span style={{ marginLeft: 8, fontSize: 11, opacity: 0.7 }}>
                          ({opt.height}p)
                        </span>
                      ) : null}
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
