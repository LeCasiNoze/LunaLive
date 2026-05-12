import * as React from "react";
import Hls from "hls.js";

// HLS proxy : toujours via Cloudflare Worker (Render Starter 512 MB OOM si on
// bufferise les segments). On ignore VITE_HLS_BASE en prod et on hardcode pour
// que la string soit garantie dans le bundle (Vite tree-shake parfois le fallback).
const HLS_WORKER_URL = "https://lunalive-hls.lunalive.workers.dev";
const _envHls = (import.meta.env.VITE_HLS_BASE as string | undefined);
const HLS_BASE = (_envHls && _envHls.length > 0 ? _envHls : HLS_WORKER_URL).replace(/\/$/, "");

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = (navigator.userAgent || "").toLowerCase();
  const isi = /iphone|ipad|ipod/.test(ua);
  // iPadOS qui se présente comme Mac
  const isIpadOs = /macintosh/.test(ua) && /mobile/.test(ua);
  return isi || isIpadOs;
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
  try {
    video.defaultPlaybackRate = 1;
    video.playbackRate = 1;
  } catch {}
}

function safePlay(video: HTMLVideoElement) {
  try {
    const p = video.play();
    if (p && typeof (p as any).catch === "function") (p as any).catch(() => {});
  } catch {}
}

/**
 * Fullscreen Zoom Guard
 * - Beaucoup de “zoom chelou” en fullscreen mobile vient du viewport ou du text autosize.
 * - Ici on force un viewport stable uniquement pendant le fullscreen, puis on restaure.
 */
function getViewportMeta(): HTMLMetaElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector('meta[name="viewport"]');
}
function readViewportContent(): string | null {
  const m = getViewportMeta();
  const c = m?.getAttribute("content");
  return c && String(c).trim() ? String(c) : null;
}
function writeViewportContent(content: string) {
  const m = getViewportMeta();
  if (!m) return;
  m.setAttribute("content", content);
}
function isFullscreenNow(): boolean {
  if (typeof document === "undefined") return false;
  const d: any = document;
  return !!(document.fullscreenElement || d.webkitFullscreenElement || d.mozFullScreenElement || d.msFullscreenElement);
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

  // ✅ Logs activables en PROD via localStorage (pas besoin de ?debug=1)
  const debugEnabled =
    typeof window !== "undefined" &&
    (localStorage.getItem("ll_player_debug") === "1" ||
      new URLSearchParams(window.location.search).has("debug"));

  const dbgLog = (...args: any[]) => {
    if (!debugEnabled) return;
    console.log("[DlivePlayer]", ...args);
  };
  const dbgWarn = (...args: any[]) => {
    if (!debugEnabled) return;
    console.warn("[DlivePlayer]", ...args);
  };

  const [menuOpen, setMenuOpen] = React.useState(false);

  // q = "auto" ou index de level ("0", "1", ...)
  const [q, setQ] = React.useState<string>(() => localStorage.getItem("ll_quality") || "auto");

  const [levelsUI, setLevelsUI] = React.useState<LevelOpt[]>([{ key: "auto", label: "Auto (recommandé)" }]);
  const [canChooseQuality, setCanChooseQuality] = React.useState(false);
  const [qualityBadge, setQualityBadge] = React.useState<string | null>(null);
  const qualityBadgeTimerRef = React.useRef<number | null>(null);

  const ios = isIOS();
  const safari = isSafariUA();

  // ✅ "Sound unlock" : sur iOS/Safari, autoplay + son = souvent bloqué.
  // On évite de forcer unmute tant que l'utilisateur n'a pas interagi.
  const userInteractedRef = React.useRef(false);

  React.useEffect(() => {
    const mark = () => {
      userInteractedRef.current = true;
      const v = videoRef.current;
      if (!v) return;
      try {
        if (v.muted) v.muted = false;
        if (typeof v.volume === "number" && v.volume === 0) v.volume = 1;
      } catch {}
      safePlay(v);
    };

    // premier geste utilisateur = on "unlock" le son
    window.addEventListener("pointerdown", mark, { capture: true, passive: true });
    window.addEventListener("touchstart", mark, { capture: true, passive: true });

    return () => {
      window.removeEventListener("pointerdown", mark, { capture: true } as any);
      window.removeEventListener("touchstart", mark, { capture: true } as any);
    };
  }, []);

  // ✅ Anti-remute (mais safe)
  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const tryUnmute = () => {
      // On ne force pas le son tant que l'utilisateur n'a pas interagi (évite les blocages iOS)
      if (!userInteractedRef.current) return;
      try {
        if (video.muted) video.muted = false;
        if (typeof video.volume === "number" && video.volume === 0) video.volume = 1;
      } catch {}
    };

    const onFs = () => tryUnmute();
    const onMeta = () => tryUnmute();
    const onResize = () => tryUnmute();

    document.addEventListener("fullscreenchange", onFs);
    // safari iOS old events
    document.addEventListener("webkitfullscreenchange" as any, onFs);
    video.addEventListener("loadedmetadata", onMeta);
    window.addEventListener("resize", onResize);

    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange" as any, onFs);
      video.removeEventListener("loadedmetadata", onMeta);
      window.removeEventListener("resize", onResize);
    };
  }, [channelSlug, channelUsername, isLive]);

  // ✅ FULLSCREEN ZOOM GUARD (iOS + Android)
  React.useEffect(() => {
    if (typeof document === "undefined") return;

    const originalViewport = readViewportContent();
    const lockedViewport =
      "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";

    const originalTextAdjust = (document.documentElement.style as any).webkitTextSizeAdjust || "";
    const originalTextAdjustStd = (document.documentElement.style as any).textSizeAdjust || "";

    let locked = false;

    const preventGesture = (e: any) => {
      // iOS Safari pinch events
      if (!locked) return;
      if (e && typeof e.preventDefault === "function") e.preventDefault();
    };

    const applyLock = () => {
      if (locked) return;
      locked = true;

      // 1) viewport lock (stop scale jump)
      try {
        if (originalViewport != null) writeViewportContent(lockedViewport);
      } catch {}

      // 2) stop text “boosting” during fullscreen transitions
      try {
        (document.documentElement.style as any).webkitTextSizeAdjust = "100%";
        (document.documentElement.style as any).textSizeAdjust = "100%";
      } catch {}

      // 3) avoid weird zoom due to focused inputs
      try {
        const ae = document.activeElement as any;
        if (ae && typeof ae.blur === "function") ae.blur();
      } catch {}

      // 4) block pinch gestures while fullscreen
      window.addEventListener("gesturestart" as any, preventGesture, { passive: false } as any);
      window.addEventListener("gesturechange" as any, preventGesture, { passive: false } as any);
      window.addEventListener("gestureend" as any, preventGesture, { passive: false } as any);

      // (Android Chrome) also block double-tap zoom quirks on some builds
      try {
        (document.body.style as any).touchAction = "manipulation";
      } catch {}

      // force reflow
      try {
        window.scrollTo(0, 0);
      } catch {}
    };

    const restoreLock = () => {
      if (!locked) return;
      locked = false;

      // restore viewport
      try {
        if (originalViewport != null) writeViewportContent(originalViewport);
      } catch {}

      // restore text adjust
      try {
        (document.documentElement.style as any).webkitTextSizeAdjust = originalTextAdjust;
        (document.documentElement.style as any).textSizeAdjust = originalTextAdjustStd;
      } catch {}

      // restore gesture handlers
      window.removeEventListener("gesturestart" as any, preventGesture as any);
      window.removeEventListener("gesturechange" as any, preventGesture as any);
      window.removeEventListener("gestureend" as any, preventGesture as any);

      try {
        (document.body.style as any).touchAction = "";
      } catch {}
    };

    const onFs = () => {
      if (isFullscreenNow()) applyLock();
      else restoreLock();
    };

    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange" as any, onFs);

    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange" as any, onFs);
      restoreLock();
    };
  }, []);

  // ✅ LOCK vitesse en LIVE
  const lockingRateRef = React.useRef(false);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isLive) forceRate1(video);

    const onRateChange = () => {
      if (!isLive) return;
      if (lockingRateRef.current) return;

      const r = Number(video.playbackRate);
      if (!Number.isFinite(r) || Math.abs(r - 1) > 0.001) {
        lockingRateRef.current = true;
        forceRate1(video);
        window.setTimeout(() => {
          lockingRateRef.current = false;
        }, 0);
      }
    };

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
        hls.autoLevelCapping = capIdx720 >= 0 ? capIdx720 : -1;
        return;
      }

      const idx = Number(q);
      if (!Number.isFinite(idx)) return;
      hls.autoLevelCapping = -1;
      hls.currentLevel = idx;
    } catch {}
  }, [q]);

  // ✅ LIVE EDGE / FREEZE watchdogs
  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let tLiveEdge: number | null = null;
    let tStall: number | null = null;

    const RESYNC_THRESHOLD_SEC = 10; // si > 10s derrière => resync
    const IOS_LIVE_SAFETY_SEC = 1.5; // seek à end - 1.5s
    const STALL_GRACE_MS = 20_000; // si pas de progrès pendant 20s => recovery (évite faux positifs)
    const PROGRESS_EPS = 0.5; // 500ms de progrès = ok (20ms était trop fin, causait des faux stalls)

    let lastT = Number(video.currentTime || 0);
    let lastProgressAt = Date.now();

    // ✅ DEBUG LOGGING
    const dbgLog = (...args: any[]) => {
      if (debugEnabled) console.log("[DlivePlayer Watchdogs]", ...args);
    };

    // ✅ CROSS-TAB COORDINATION
    const streamKey = `ll-live-${channelUsername}`;
    const myTabId = Math.random().toString(36).slice(2);
    let isLeader = false;
    let heartbeatInterval: number | null = null;
    let coordinationChannel: BroadcastChannel | null = null;

    // Helper: BroadcastChannel support
    const supportsBroadcastChannel = typeof BroadcastChannel !== 'undefined';

    // Helper: localStorage heartbeat
    const setLeaderHeartbeat = () => {
      try {
        localStorage.setItem(`ll-leader-${streamKey}`, JSON.stringify({
          tabId: myTabId,
          heartbeat: Date.now(),
          streamKey,
          visible: !document.hidden
        }));
      } catch {}
    };

    // Helper: check if current leader is alive
    const getCurrentLeader = () => {
      try {
        const data = localStorage.getItem(`ll-leader-${streamKey}`);
        if (!data) return null;
        const parsed = JSON.parse(data);
        if (parsed.streamKey !== streamKey) return null;
        const age = Date.now() - parsed.heartbeat;
        return age < 5000 ? parsed : null; // 5s timeout
      } catch {
        return null;
      }
    };

    // Helper: try to become leader
    const tryBecomeLeader = () => {
      const current = getCurrentLeader();
      if (!current) {
        setLeaderHeartbeat();
        isLeader = true;
        dbgLog("became leader", { streamKey, tabId: myTabId });
        return true;
      }
      if (current.tabId === myTabId) {
        isLeader = true;
        setLeaderHeartbeat(); // refresh heartbeat
        return true;
      }
      isLeader = false;
      return false;
    };

    // Helper: step down as leader
    const stepDownAsLeader = () => {
      if (isLeader) {
        try {
          const current = localStorage.getItem(`ll-leader-${streamKey}`);
          if (current) {
            const parsed = JSON.parse(current);
            if (parsed.tabId === myTabId) {
              localStorage.removeItem(`ll-leader-${streamKey}`);
            }
          }
        } catch {}
        isLeader = false;
        dbgLog("stepped down as leader", { streamKey, tabId: myTabId });
      }
    };

    // Setup coordination
    const setupCoordination = () => {
      // Try to become leader initially
      tryBecomeLeader();

      // Setup heartbeat if leader
      if (isLeader) {
        heartbeatInterval = window.setInterval(() => {
          if (isLeader) {
            setLeaderHeartbeat();
            // Broadcast heartbeat to other tabs
            if (coordinationChannel) {
              try {
                coordinationChannel.postMessage({
                  type: 'heartbeat',
                  streamKey,
                  tabId: myTabId,
                  timestamp: Date.now()
                });
              } catch {}
            }
          }
        }, 2000);
      }

      // Setup BroadcastChannel listener (if supported)
      if (supportsBroadcastChannel) {
        try {
          coordinationChannel = new BroadcastChannel('ll-live-coordination');
          coordinationChannel.onmessage = (event) => {
            const data = event.data;
            if (data.type === 'heartbeat' && data.streamKey === streamKey) {
              if (data.tabId !== myTabId && isLeader) {
                // Another tab claims leadership, check if we should step down
                const current = getCurrentLeader();
                if (!current || current.tabId !== myTabId) {
                  isLeader = false;
                  if (heartbeatInterval) {
                    window.clearInterval(heartbeatInterval);
                    heartbeatInterval = null;
                  }
                  dbgLog("detected other leader, stepping down", { 
                    streamKey, 
                    otherTabId: data.tabId,
                    myTabId 
                  });
                }
              }
            }
          };
        } catch (e) {
          // BroadcastChannel failed, fallback to localStorage only
          coordinationChannel = null;
        }
      }

      // Periodic leader check (fallback for tabs without BroadcastChannel)
      const leaderCheckInterval = window.setInterval(() => {
        if (!isLeader) {
          tryBecomeLeader();
        }
      }, 3000);

      return () => {
        if (heartbeatInterval) {
          window.clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
        if (leaderCheckInterval) {
          window.clearInterval(leaderCheckInterval);
        }
        if (coordinationChannel) {
          try {
            coordinationChannel.close();
          } catch {}
          coordinationChannel = null;
        }
        stepDownAsLeader();
      };
    };

    // ✅ VISIBILITY HANDLER
    const handleVisibilityChange = () => {
      if (document.hidden) {
        dbgLog("tab hidden - pausing watchdogs", { isLeader });
        // Update heartbeat to reflect visibility but stay leader
        if (isLeader) {
          setLeaderHeartbeat();
        }
        return;
      }
      dbgLog("tab visible - resuming watchdogs", { isLeader });
      lastProgressAt = Date.now(); // reset grace period
      // Update heartbeat to reflect visibility
      if (isLeader) {
        setLeaderHeartbeat();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    const markProgress = () => {
      const nowT = Number(video.currentTime || 0);
      if (Math.abs(nowT - lastT) > PROGRESS_EPS) {
        lastT = nowT;
        lastProgressAt = Date.now();
      }
    };

    const onTimeUpdate = () => markProgress();
    const onPlaying = () => {
      lastProgressAt = Date.now();
      markProgress();
    };
    const onWaiting = () => dbgWarn("video waiting", { rs: video.readyState, ns: video.networkState });
    const onStalled = () => dbgWarn("video stalled", { rs: video.readyState, ns: video.networkState });
    const onError = () => dbgWarn("video error", { err: (video as any).error });

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("stalled", onStalled);
    video.addEventListener("error", onError);

    // Setup cross-tab coordination
    const cleanupCoordination = setupCoordination();

    // 1) live-edge resync (leader only)
    tLiveEdge = window.setInterval(() => {
      if (!isLive) return;
      if (!video || video.paused) return;
      if (document.hidden) return; // ✅ PAUSE EN ARRIÈRE-PLAN
      if (!isLeader) return; // ✅ COORDINATION MULTI-ONGLETS

      const hls = hlsRef.current;

      // hls.js
      if (hls && typeof (hls as any).liveSyncPosition === "number" && Number.isFinite((hls as any).liveSyncPosition)) {
        const livePos = Number((hls as any).liveSyncPosition);
        const ct = Number(video.currentTime || 0);
        const behind = livePos - ct;

        if (Number.isFinite(behind) && behind > RESYNC_THRESHOLD_SEC) {
          dbgLog("resync (hlsjs)", { behind: behind.toFixed(2), ct: ct.toFixed(2), livePos: livePos.toFixed(2) });
          try {
            video.currentTime = livePos;
          } catch {}
        }
        return;
      }

      // native iOS/Safari
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

    // 2) stall watchdog (leader only)
    tStall = window.setInterval(() => {
      if (!isLive) return;
      if (!video) return;
      if (video.paused) return;
      if (document.hidden) return; // ✅ PAUSE EN ARRIÈRE-PLAN
      if (!isLeader) return; // ✅ COORDINATION MULTI-ONGLETS

      const now = Date.now();
      const since = now - lastProgressAt;

      if (Number(video.currentTime || 0) <= 0.01) return;
      if (since < STALL_GRACE_MS) return;

      // ✅ Ne déclencher le recovery QUE si le décodeur est vraiment bloqué
      // readyState 0/1/2 = pas de données / HAVE_METADATA / HAVE_CURRENT_DATA → stall réel
      // readyState 3/4 = HAVE_FUTURE_DATA / HAVE_ENOUGH_DATA → la vidéo joue, faux positif
      if (video.readyState >= 3) {
        // Le décodeur a des données — ce n'est pas un vrai stall, juste timeupdate lent
        // Remettre le compteur pour éviter de re-détecter au prochain tick
        lastProgressAt = Date.now();
        lastT = Number(video.currentTime || 0);
        return;
      }

      const hls = hlsRef.current;
      dbgLog("stall detected", {
        sinceMs: since,
        ct: Number(video.currentTime || 0).toFixed(2),
        rs: video.readyState,
        ns: video.networkState,
        mode: hls ? "hlsjs" : "native",
      });

      // Recovery minimal — pas de recoverMediaError() qui freeze le décodeur système
      if (hls) {
        try { hls.startLoad(-1); } catch {}
      } else {
        safePlay(video);
      }

      lastProgressAt = Date.now();
      lastT = Number(video.currentTime || 0);
    }, 3000);

    return () => {
      // ✅ CLEANUP COORDINATION
      cleanupCoordination();

      document.removeEventListener("visibilitychange", handleVisibilityChange);

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
    forceRate1(video);

    // important : reset source proprement
    try {
      video.removeAttribute("src");
      // @ts-ignore
      video.srcObject = null;
    } catch {}
    video.load();

    const username = String(channelUsername || "").trim();
    if (!username) {
      dbgWarn("missing channelUsername (cannot play)", { channelSlug });
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

    // Native iOS/Safari: le plus stable (pas hls.js)
    if (mode === "native-ios" || mode === "native") {
      video.src = proxied;
      forceRate1(video);
      // sur iOS, autoplay son sera bloqué => ok, l'user clique et on unlock
      safePlay(video);
      setCanChooseQuality(false);
      setLevelsUI([{ key: "auto", label: "Auto" }]);
      return;
    }

    if (mode !== "hlsjs-proxy") return;

    const hls = new Hls({
      // ✅ stabilité globale
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 30,

      // ✅ live-edge (latence faible, DVR réduit)
      liveSyncDurationCount: 2,
      liveMaxLatencyDurationCount: 6,
      liveDurationInfinity: true,

      // ✅ pas de “catch-up speed”
      maxLiveSyncPlaybackRate: 1.0,

      // ✅ buffer (évite les trous / micro stalls)
      maxBufferHole: 0.7,
      maxBufferLength: 20,
      maxMaxBufferLength: 30,
      maxFragLookUpTolerance: 0.2,

      // ✅ ABR plus conservateur (moins de ping-pong de qualité)
      abrBandWidthFactor: 0.8,
      abrBandWidthUpFactor: 0.7,

      // ✅ retries réseau (proxy + CF = parfois des micro ratés)
      fragLoadingMaxRetry: 8,
      fragLoadingRetryDelay: 700,
      fragLoadingMaxRetryTimeout: 10000,

      levelLoadingMaxRetry: 8,
      levelLoadingRetryDelay: 700,
      levelLoadingMaxRetryTimeout: 10000,

      manifestLoadingMaxRetry: 8,
      manifestLoadingRetryDelay: 700,
      manifestLoadingMaxRetryTimeout: 10000,

      // ✅ “nudge” quand stuck sur un trou de buffer
      nudgeMaxRetry: 8,
      nudgeOffset: 0.1,

      // ✅ meilleure reprise
      startFragPrefetch: true,
    });

    hlsRef.current = hls;
    hls.attachMedia(video);

    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      dbgLog("media attached -> loadSource");
      hls.loadSource(proxied);
    });

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      dbgLog("manifest parsed", { levels: (hls.levels || []).length });

      // ✅ DEBUG LOGGING: Niveaux HLS détectés
      const levels = hls.levels || [];
      dbgLog("HLS LEVELS DETECTED", levels.map((lvl: any, i: number) => ({
        index: i,
        height: lvl?.height,
        bitrate: lvl?.bitrate,
        codecSet: lvl?.codecSet,
        name: lvl?.name,
        attrs: lvl?.attrs
      })));

      const lvls = levels.map((lvl: any, i: number) => ({
        key: String(i),
        label: lvl?.height ? `${lvl.height}p` : `Niveau ${i}`,
        levelIndex: i,
        height: typeof lvl?.height === "number" ? lvl.height : undefined,
        bitrate: typeof lvl?.bitrate === "number" ? lvl.bitrate : undefined,
      }));

      const unique = uniqBy(lvls, (x) => String(x.height || x.label));
      unique.sort((a, b) => (b.height || 0) - (a.height || 0));

      // ✅ DEBUG LOGGING: Qualités disponibles après déduplication
      dbgLog("QUALITIES AVAILABLE", unique.map(q => ({
        key: q.key,
        label: q.label,
        height: q.height,
        bitrate: q.bitrate
      })));

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
        dbgLog("ABR CONFIG", { 
          currentLevel: hls.currentLevel, 
          autoLevelCapping: hls.autoLevelCapping,
          capIdx720
        });
      } catch {}

      forceRate1(video);
      safePlay(video);
    });

    // ✅ UN SEUL handler ERROR : logs + recovery
    hls.on(Hls.Events.ERROR, (_e, data) => {
      dbgWarn("hls error", {
        fatal: !!data?.fatal,
        type: data?.type,
        details: data?.details,
        reason: data?.reason,
        response: data?.response ? { code: data.response.code, text: data.response.text } : undefined,
      });

      // Recovery fatal
      if (data?.fatal) {
        try {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            // relance chargement segments
            dbgLog("NETWORK ERROR - startLoad(-1)");
            hls.startLoad(-1);
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            dbgLog("MEDIA ERROR - recoverMediaError");
            hls.recoverMediaError();
          } else {
            dbgLog("FATAL ERROR - destroy");
            hls.destroy();
          }
        } catch {}
      }
    });

    // ✅ Niveau ABR — badge visible 3s
    hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
      const currentLevel = hls.levels[data?.level];
      dbgLog("LEVEL SWITCHED", {
        level: data?.level,
        height: currentLevel?.height,
        bitrate: currentLevel?.bitrate,
        auto: hls.autoLevelEnabled,
        currentLevel: hls.currentLevel,
        autoLevelCapping: hls.autoLevelCapping
      });
      const label = currentLevel?.height ? `${currentLevel.height}p` : null;
      if (label) {
        setQualityBadge(label);
        if (qualityBadgeTimerRef.current) window.clearTimeout(qualityBadgeTimerRef.current);
        qualityBadgeTimerRef.current = window.setTimeout(() => { setQualityBadge(null); qualityBadgeTimerRef.current = null; }, 3000);
      }
    });

    // ✅ DEBUG LOGGING: Fragment loading
    hls.on(Hls.Events.FRAG_LOADED, (_e, data) => {
      const frag = data?.frag;
      dbgLog("FRAG LOADED", {
        level: frag?.level,
        sn: frag?.sn,
        url: frag?.url?.substring(0, 100) + "...",
        duration: frag?.duration
      });
    });

    // ✅ DEBUG LOGGING: Bandwidth estimation
    hls.on(Hls.Events.BUFFER_APPENDED, () => {
      if (hls.bandwidthEstimate) {
        dbgLog("BANDWIDTH ESTIMATE", {
          bandwidth: Math.round(hls.bandwidthEstimate),
          bwEstimate: Math.round(hls.bandwidthEstimate / 1000000) + "Mbps",
          autoLevelEnabled: hls.autoLevelEnabled,
          currentLevel: hls.currentLevel
        });
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
          preload="auto"
          disableRemotePlayback
          style={{ width: "100%", display: "block", background: "rgba(0,0,0,0.25)" }}
        />

        {/* Badge qualité ABR — apparaît 3s lors d'un changement automatique */}
        {qualityBadge && (
          <div style={{
            position: "absolute", top: 10, left: 10, pointerEvents: "none",
            padding: "4px 9px", borderRadius: 8, fontSize: 12, fontWeight: 700,
            background: "rgba(10,10,18,0.72)", backdropFilter: "blur(8px)",
            border: "1px solid rgba(180,160,255,0.22)", color: "rgba(235,235,255,0.90)",
          }}>
            {qualityBadge}
          </div>
        )}

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
                        <span style={{ marginLeft: 8, fontSize: 11, opacity: 0.7 }}>({opt.height}p)</span>
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
