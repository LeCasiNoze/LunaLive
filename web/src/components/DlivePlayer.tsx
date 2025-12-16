import * as React from "react";
import Hls from "hls.js";

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
  const [dbg, setDbg] = React.useState<string>("");

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // reset
    video.pause();
    video.removeAttribute("src");
    video.load();

    const username = (channelUsername || channelSlug || "").trim();
    if (!username || !isLive) {
      setDbg(!username ? "no_username" : "offline");
      return;
    }

    const hlsUrl = `https://live.prd.dlive.tv/hls/live/${encodeURIComponent(
      username
    )}.m3u8?mobileweb`;

    const nativeHls =
      video.canPlayType("application/vnd.apple.mpegurl") !== "";

    setDbg(
      `nativeHls=${nativeHls} hlsSupported=${Hls.isSupported()} url=${hlsUrl}`
    );

    // ✅ Safari / iOS : natif OK
    if (nativeHls) {
      video.src = hlsUrl;
      video.play().catch(() => {});
      return;
    }

    // ✅ Chrome/Brave : on FORCE hls.js (sinon écran noir)
    if (!Hls.isSupported()) {
      setDbg((s) => s + " | HLS_NOT_SUPPORTED");
      return;
    }

    const hls = new Hls({ lowLatencyMode: true });
    hls.attachMedia(video);
    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      hls.loadSource(hlsUrl);
    });

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {});
    });

    hls.on(Hls.Events.ERROR, (_evt, data) => {
      setDbg(
        `HLS_ERROR fatal=${data.fatal} type=${data.type} details=${data.details}`
      );
      if (data.fatal) {
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

  if (!channelSlug && !channelUsername) {
    return <div className="panel"><div className="muted">Aucun compte DLive assigné.</div></div>;
  }

  return (
    <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
      <video
        ref={videoRef}
        controls
        playsInline
        autoPlay
        muted
        crossOrigin="anonymous"
        style={{
          width: "100%",
          display: "block",
          background: "rgba(0,0,0,0.25)",
        }}
      />
      {/* debug MVP (tu pourras enlever après) */}
      <div className="mutedSmall" style={{ padding: 10 }}>
        {dbg}
      </div>
    </div>
  );
}
