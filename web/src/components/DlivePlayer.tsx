import * as React from "react";
import Hls from "hls.js";

export function DlivePlayer({
  channelSlug,
  isLive,
}: {
  channelSlug: string | null | undefined;
  isLive: boolean | undefined;
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // reset src on changes
    video.removeAttribute("src");
    video.load();

    if (!channelSlug || !isLive) return;

    const hlsUrl = `https://live.prd.dlive.tv/hls/live/${encodeURIComponent(channelSlug)}.m3u8`;

    // Safari / iOS support natif HLS
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = hlsUrl;
      return;
    }

    // Chrome/Firefox/Edge => hls.js
    if (Hls.isSupported()) {
      const hls = new Hls({
        lowLatencyMode: true,
      });
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);

      return () => {
        try {
          hls.destroy();
        } catch {}
      };
    } else {
      // fallback best-effort
      video.src = hlsUrl;
    }
  }, [channelSlug, isLive]);

  if (!channelSlug) {
    return (
      <div className="panel">
        <div className="muted">Aucun compte DLive assigné à ce streamer.</div>
      </div>
    );
  }

  if (!isLive) {
    return (
      <div className="panel">
        <div className="muted">Offline pour le moment.</div>
        <a className="btnGhostInline" href={`https://dlive.tv/${channelSlug}`} target="_blank" rel="noreferrer">
          Ouvrir sur DLive →
        </a>
      </div>
    );
  }

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
