import * as React from "react";
import Hls from "hls.js";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(
  /\/$/,
  ""
);

function isAppleSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isIOS = /iP(hone|ad|od)/i.test(ua);
  const isSafari = /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Brave/i.test(ua);
  return isIOS || isSafari;
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
  const [dbg, setDbg] = React.useState("init");

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
    if (!username) {
      setDbg(`username=∅`);
      return;
    }

    // (debug) on peut laisser le stream tenter même si offline, mais ici on respecte le flag
    if (!isLive) {
      setDbg(`username=${username} | isLive=false (skip)`);
      return;
    }

    const upstream = `https://live.prd.dlive.tv/hls/live/${encodeURIComponent(
      username
    )}.m3u8?mobileweb`;
    const proxied = `${API_BASE}/hls?u=${encodeURIComponent(upstream)}`;

    const nativeHls = video.canPlayType("application/vnd.apple.mpegurl") !== "";
    const hlsJsSupported = Hls.isSupported();
    const safari = isAppleSafari();

    // ✅ on force hls.js (proxy) partout sauf Safari Apple
    const mode = safari && nativeHls ? "native" : hlsJsSupported ? "hlsjs-proxy" : "unsupported";

    setDbg(
      `username=${username} | isLive=${String(isLive)} | nativeHls=${String(
        nativeHls
      )} | hls.js=${String(hlsJsSupported)} | safari=${String(safari)} | mode=${mode}`
    );

    if (mode === "native") {
      video.src = upstream;
      video.play().catch(() => {});
      return;
    }

    if (mode !== "hlsjs-proxy") return;

    const hls = new Hls({ lowLatencyMode: true });
    hls.attachMedia(video);

    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
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
