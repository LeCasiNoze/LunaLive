import * as React from "react";
import Hls from "hls.js";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(
  /\/$/,
  ""
);

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
  const [dbg, setDbg] = React.useState<string>("init");

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // reset
    try {
      video.pause();
    } catch {}
    video.removeAttribute("src");
    video.load();

    const username = String(channelUsername || channelSlug || "").trim();
    const nativeHls = video.canPlayType("application/vnd.apple.mpegurl") !== "";
    const hlsSupported = Hls.isSupported();

    // ✅ debug visible (on veut savoir POURQUOI ça ne fetch pas)
    setDbg(
      `username=${username || "∅"} | isLive=${String(isLive)} | nativeHls=${nativeHls} | hls.js=${hlsSupported} | api=${API_BASE}`
    );

    if (!username) return;

    // ⚠️ IMPORTANT : on tente même si offline (debug). Tu pourras remettre le check après.
    // if (!isLive) return;

    const upstream = `https://live.prd.dlive.tv/hls/live/${encodeURIComponent(
      username
    )}.m3u8?mobileweb`;
    const proxied = `${API_BASE}/hls?u=${encodeURIComponent(upstream)}`;

    // Safari/iOS : natif
    if (nativeHls) {
      video.src = upstream;
      video.play().catch(() => {});
      return;
    }

    // Desktop : hls.js via proxy
    if (!hlsSupported) return;

    const hls = new Hls({ lowLatencyMode: true });
    hls.attachMedia(video);

    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      setDbg((s) => `${s} | load=${proxied}`);
      hls.loadSource(proxied);
    });

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {});
    });

    hls.on(Hls.Events.ERROR, (_evt, data) => {
      setDbg(
        `HLS_ERROR fatal=${String(data?.fatal)} type=${String(data?.type)} details=${String(
          data?.details
        )}`
      );
      if (data?.fatal) {
        try {
          hls.destroy();
        } catch {}
      }
    });

    return () => {
      try {
        hls.destroy();
      } catch {}
    };
  }, [channelSlug, channelUsername, isLive]);

  return (
    <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
      <video
        ref={videoRef}
        controls
        playsInline
        autoPlay
        muted
        style={{ width: "100%", display: "block", background: "rgba(0,0,0,0.25)" }}
      />
      <div className="mutedSmall" style={{ padding: 10 }}>
        {dbg}
      </div>
    </div>
  );
}
