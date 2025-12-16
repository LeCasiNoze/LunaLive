import * as React from "react";
import Hls from "hls.js";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

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

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.pause();
    video.removeAttribute("src");
    video.load();

    const username = (channelUsername || channelSlug || "").trim();
    if (!username || !isLive) return;

    const upstream = `https://live.prd.dlive.tv/hls/live/${encodeURIComponent(username)}.m3u8?mobileweb`;
    const proxied = `${API_BASE}/hls?u=${encodeURIComponent(upstream)}`;

    // iOS/Safari = natif OK (et pas besoin proxy)
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = upstream;
      video.play().catch(() => {});
      return;
    }

    // Desktop = hls.js via proxy (sinon CORS)
    if (!Hls.isSupported()) return;

    const hls = new Hls({ lowLatencyMode: true });
    hls.attachMedia(video);
    hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(proxied));
    hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));

    return () => {
      try { hls.destroy(); } catch {}
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
    </div>
  );
}
