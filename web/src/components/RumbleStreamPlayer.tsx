// web/src/components/RumbleStreamPlayer.tsx
import * as React from "react";
import Hls from "hls.js";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

function toProxiedHls(url: string): string {
  return `${API_BASE}/hls?u=${encodeURIComponent(url)}`;
}

export type RumbleStreamPlayerProps = {
  hlsUrl?: string | null;
  thumbnailUrl?: string | null;
  isLive?: boolean;
};

export default function RumbleStreamPlayer({ hlsUrl, thumbnailUrl, isLive }: RumbleStreamPlayerProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const hlsRef = React.useRef<Hls | null>(null);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video || !isLive || !hlsUrl) return;

    const proxiedUrl = toProxiedHls(hlsUrl);

    // Support natif HLS (Safari/iOS)
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = proxiedUrl;
      video.play().catch(() => {});
      return () => {
        video.pause();
        video.src = "";
      };
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
    });

    hlsRef.current = hls;

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {});
    });

    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (!data.fatal) return;
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        hls.recoverMediaError();
      } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        hls.startLoad();
      } else {
        hls.destroy();
      }
    });

    hls.attachMedia(video);
    hls.loadSource(proxiedUrl);

    return () => {
      hls.destroy();
      hlsRef.current = null;
    };
  }, [isLive, hlsUrl]);

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
      </div>
    </div>
  );
}
