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
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M19.4 13a7.8 7.8 0 0 0 .05-2l2-1.2-2-3.4-2.3.7a8.2 8.2 0 0 0-1.7-1L15.3 3h-4L8.6 6.1a8.2 8.2 0 0 0-1.7 1l-2.3-.7-2 3.4 2 1.2a7.8 7.8 0 0 0 0 2l-2 1.2 2 3.4 2.3-.7a8.2 8.2 0 0 0 1.7 1L11.3 21h4l1.7-3.1a8.2 8.2 0 0 0 1.7-1l2.3.7 2-3.4-2-1.2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
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

  const [dbg, setDbg] = React.useState("init");
  const [menuOpen, setMenuOpen] = React.useState(false);

  // q = "auto" ou index de level ("0", "1", ...)
  const [q, setQ] = React.useState<string>(() => localStorage.getItem("ll_quality") || "auto");

  const [levelsUI, setLevelsUI] = React.useState<LevelOpt[]>([{ key: "auto", label: "Auto (recommandé)" }]);
  const [canChooseQuality, setCanChooseQuality] = React.useState(false);

  const ios = isIOS();
  const safari = isSafariUA();

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
    video.removeAttribute("src");
    video.load();

    const username = String(channelUsername || channelSlug || "").trim();
    if (!username) {
      setDbg(`username=∅`);
      return;
    }
    if (!isLive) {
      setDbg(`username=${username} | isLive=false (skip)`);
      return;
    }

    const upstream = `https://live.prd.dlive.tv/hls/live/${encodeURIComponent(username)}.m3u8?mobileweb`;
    const proxied = `${HLS_BASE}/hls?u=${encodeURIComponent(upstream)}`;

    const nativeHls = video.canPlayType("application/vnd.apple.mpegurl") !== "";
    const hlsJsSupported = Hls.isSupported();

    // iOS => native only (pas de choix qualité manuel côté hls.js)
    const mode = ios && nativeHls ? "native-ios" : hlsJsSupported ? "hlsjs-proxy" : nativeHls ? "native" : "unsupported";

    setDbg(
      `username=${username} | isLive=${String(isLive)} | nativeHls=${String(nativeHls)} | hls.js=${String(
        hlsJsSupported
      )} | ios=${String(ios)} | safari=${String(safari)} | mode=${mode} | hlsBase=${HLS_BASE} | q=${q}`
    );

    // Native
    if (mode === "native-ios" || mode === "native") {
      video.src = upstream;
      video.play().catch(() => {});
      setCanChooseQuality(false);
      setLevelsUI([{ key: "auto", label: "Auto" }]);
      return;
    }

    if (mode !== "hlsjs-proxy") return;

    const hls = new Hls({
      lowLatencyMode: true,

      // live-edge + réduit DVR (pas une “interdiction” totale, mais beaucoup moins de backbuffer)
      liveSyncDurationCount: 2,
      liveMaxLatencyDurationCount: 6,
      maxLiveSyncPlaybackRate: 1.2,
      backBufferLength: 0,
      maxBufferLength: 10,
    });

    hlsRef.current = hls;
    hls.attachMedia(video);

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

      // uniq par height (sinon menu chelou)
      const unique = uniqBy(lvls, (x) => String(x.height || x.label));

      // tri desc
      unique.sort((a, b) => (b.height || 0) - (a.height || 0));

      // Cap 720 uniquement si possible
      const capIdx720 = pickBestCapIndex(hls.levels || [], 720);
      const autoLabel = capIdx720 >= 0 ? "Auto (max 720p)" : "Auto (recommandé)";

      const opts: LevelOpt[] = [{ key: "auto", label: autoLabel }, ...unique];

      setLevelsUI(opts);

      // Afficher l'engrenage seulement si on a un vrai choix (au moins 2 qualités distinctes)
      setCanChooseQuality(unique.length >= 2);

      // Si la préférence stockée n'existe plus, fallback auto
      const validKeys = new Set(opts.map((o) => o.key));
      if (!validKeys.has(q)) setQ("auto");

      // Appliquer auto par défaut (avec cap 720 si possible)
      try {
        hls.currentLevel = -1;
        hls.autoLevelCapping = capIdx720 >= 0 ? capIdx720 : -1;
      } catch {}

      video.play().catch(() => {});
    });

    hls.on(Hls.Events.ERROR, (_evt, data) => {
      setDbg(
        `HLS_ERROR fatal=${String(data?.fatal)} type=${String(data?.type)} details=${String(data?.details)} | q=${q}`
      );

      if (data?.fatal) {
        try {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
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
          muted
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
                <div style={{ padding: "10px 12px", fontSize: 12, opacity: 0.8 }}>
                  Qualité
                </div>
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

      {/* debug (tu pourras le retirer plus tard) */}
      <div className="mutedSmall" style={{ padding: 10 }}>
        {dbg}
      </div>
    </div>
  );
}
