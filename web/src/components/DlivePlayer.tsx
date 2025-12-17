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

type QualityItem = {
  key: string;       // "auto720" | "auto" | "3" (level index)
  label: string;     // "Auto (720 max)" | "1080p" | ...
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

function pickCapIndex(levels: any[], maxHeight: number): number {
  // hls.levels order is typically by bitrate; we pick the highest level <= maxHeight
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

  const [dbg, setDbg] = React.useState("init");
  const [qualities, setQualities] = React.useState<QualityItem[]>([
    { key: "auto720", label: "Auto (720 max)" },
    { key: "auto", label: "Auto (max)" },
  ]);

  const [q, setQ] = React.useState<string>(() => {
    return localStorage.getItem("ll_quality") || "auto720";
  });

  const safari = isSafariUA();
  const ios = isIOS();

  React.useEffect(() => {
    localStorage.setItem("ll_quality", q);
    const hls = hlsRef.current;
    if (!hls) return;

    // Apply quality choice live (when hls.js mode)
    const apply = () => {
      // Auto modes
      if (q === "auto" || q === "auto720") {
        hls.currentLevel = -1; // back to auto
        if (q === "auto720") {
          const cap = pickCapIndex(hls.levels || [], 720);
          hls.autoLevelCapping = cap >= 0 ? cap : -1;
        } else {
          hls.autoLevelCapping = -1;
        }
        return;
      }

      // Manual
      const idx = Number(q);
      if (!Number.isFinite(idx)) return;
      hls.autoLevelCapping = -1;
      // immediate switch (flush buffer)
      hls.currentLevel = idx; // hls.js supports this setter for immediate quality switch :contentReference[oaicite:2]{index=2}
    };

    try {
      apply();
    } catch {}
  }, [q]);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // cleanup previous
    if (hlsRef.current) {
      try { hlsRef.current.destroy(); } catch {}
      hlsRef.current = null;
    }

    // reset video
    try { video.pause(); } catch {}
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

    // iOS => native only (no manual quality selection possible in Safari native HLS) :contentReference[oaicite:3]{index=3}
    const mode = ios && nativeHls ? "native-ios" : hlsJsSupported ? "hlsjs-proxy" : nativeHls ? "native" : "unsupported";

    setDbg(
      `username=${username} | isLive=${String(isLive)} | nativeHls=${String(nativeHls)} | hls.js=${String(
        hlsJsSupported
      )} | ios=${String(ios)} | safari=${String(safari)} | mode=${mode} | hlsBase=${HLS_BASE}`
    );

    // Native (iOS / fallback)
    if (mode === "native-ios" || mode === "native") {
      video.src = upstream;
      video.play().catch(() => {});
      // UI quality: disable (Safari native limitation)
      setQualities([
        { key: "auto720", label: "Auto (Safari)" },
      ]);
      return;
    }

    if (mode !== "hlsjs-proxy") return;

    // hls.js instance
    const hls = new Hls({
      lowLatencyMode: true,
      // live edge feeling + reduced DVR
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
      // Build quality menu from available levels
      const lvls = (hls.levels || []).map((lvl: any, i: number) => ({
        key: String(i),
        label: lvl?.height ? `${lvl.height}p` : `Level ${i}`,
        levelIndex: i,
        height: typeof lvl?.height === "number" ? lvl.height : undefined,
        bitrate: typeof lvl?.bitrate === "number" ? lvl.bitrate : undefined,
      }));

      // Deduplicate by label/height (some manifests have duplicates)
      const unique = uniqBy(lvls, (x) => String(x.height || x.label));

      // Sort by height desc if present
      unique.sort((a, b) => (b.height || 0) - (a.height || 0));

      setQualities([
        { key: "auto720", label: "Auto (720 max)" },
        { key: "auto", label: "Auto (max)" },
        ...unique,
      ]);

      // Apply current preference (cap 720 default)
      try {
        if (q === "auto720") {
          const cap = pickCapIndex(hls.levels || [], 720);
          hls.autoLevelCapping = cap >= 0 ? cap : -1; // cap max in auto mode :contentReference[oaicite:4]{index=4}
          hls.currentLevel = -1;
        } else if (q === "auto") {
          hls.autoLevelCapping = -1;
          hls.currentLevel = -1;
        } else {
          const idx = Number(q);
          if (Number.isFinite(idx)) hls.currentLevel = idx;
        }
      } catch {}

      video.play().catch(() => {});
    });

    hls.on(Hls.Events.ERROR, (_evt, data) => {
      setDbg(`HLS_ERROR fatal=${String(data?.fatal)} type=${String(data?.type)} details=${String(data?.details)}`);
      // mini recovery
      if (data?.fatal) {
        try {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          else hls.destroy();
        } catch {}
      }
    });

    return () => {
      try { hls.destroy(); } catch {}
      hlsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelSlug, channelUsername, isLive, HLS_BASE]);

  const canChooseQuality = qualities.length > 2 && !ios; // iOS native: no manual selection :contentReference[oaicite:5]{index=5}

  return (
    <div className="panel" style={{ padding: 0, overflow: "hidden", position: "relative" }}>
      <video
        ref={videoRef}
        controls
        playsInline
        autoPlay
        muted
        style={{ width: "100%", display: "block", background: "rgba(0,0,0,0.25)" }}
      />

      {/* Quality selector */}
      <div
        style={{
          position: "absolute",
          right: 10,
          bottom: 10,
          display: "flex",
          gap: 8,
          alignItems: "center",
          padding: "8px 10px",
          borderRadius: 12,
          background: "rgba(10, 10, 18, 0.65)",
          backdropFilter: "blur(10px)",
          border: "1px solid rgba(180, 160, 255, 0.25)"
        }}
      >
        <span style={{ fontSize: 12, opacity: 0.85 }}>Qualité</span>
        <select
          value={q}
          onChange={(e) => setQ(e.target.value)}
          disabled={!canChooseQuality}
          style={{
            fontSize: 12,
            background: "rgba(255,255,255,0.06)",
            color: "white",
            border: "1px solid rgba(180, 160, 255, 0.25)",
            borderRadius: 10,
            padding: "6px 8px",
            outline: "none",
            cursor: canChooseQuality ? "pointer" : "not-allowed",
            opacity: canChooseQuality ? 1 : 0.6
          }}
        >
          {qualities.map((it) => (
            <option key={it.key} value={it.key}>
              {it.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mutedSmall" style={{ padding: 10 }}>
        {dbg}
      </div>
    </div>
  );
}
