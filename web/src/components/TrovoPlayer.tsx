// web/src/components/TrovoPlayer.tsx
// Composant de player Trovo avec lecture vidéo réelle

import * as React from "react";

export type TrovoPlayerProps = {
  playUrl?: string | null;
  timeShiftUrl?: string | null;
};

export default function TrovoPlayer({ playUrl, timeShiftUrl }: TrovoPlayerProps) {
  const [selectedSource, setSelectedSource] = React.useState<"timeshift" | "main">("timeshift");
  const [playerState, setPlayerState] = React.useState<"loading" | "playing" | "paused" | "error" | "not_implemented">("loading");
  const [error, setError] = React.useState<string | null>(null);
  const [detectedType, setDetectedType] = React.useState<"hls" | "flv" | "unknown">("unknown");
  const [actualSource, setActualSource] = React.useState<string>("");

  const videoRef = React.useRef<HTMLVideoElement>(null);
  const hlsRef = React.useRef<any>(null);

  React.useEffect(() => {
    setSelectedSource(timeShiftUrl ? "timeshift" : "main");
  }, [timeShiftUrl]);

  const currentUrl = selectedSource === "timeshift" ? timeShiftUrl : playUrl;

  const initializePlayer = async () => {
    if (!currentUrl || !videoRef.current) {
      setPlayerState("error");
      setError("Aucune URL disponible ou élément vidéo non prêt");
      return;
    }

    setPlayerState("loading");
    setError(null);
    setActualSource(currentUrl);

    // Détection du type de flux
    if (currentUrl.includes(".m3u8")) {
      setDetectedType("hls");
      await initializeHlsPlayer(currentUrl);
    } else if (currentUrl.includes(".flv")) {
      setDetectedType("flv");
      await initializeFlvPlayer(currentUrl);
    } else {
      setDetectedType("unknown");
      setPlayerState("not_implemented");
      setError(`Format non supporté: ${currentUrl.split('.').pop()}`);
    }
  };

  const initializeHlsPlayer = async (url: string) => {
    const video = videoRef.current;
    if (!video) return;

    try {
      console.log(`[trovo-player] Initializing HLS for: ${url.substring(0, 100)}...`);

      // Import dynamique de hls.js
      const Hls = await import("hls.js").then(module => module.default);
      
      if (!Hls.isSupported()) {
        // Fallback natif pour Safari/iOS
        if (video.canPlayType("application/vnd.apple.mpegurl")) {
          console.log("[trovo-player] Using native HLS support");
          video.src = url;
          await attemptPlay(video);
          return;
        } else {
          throw new Error("HLS non supporté par ce navigateur");
        }
      }

      // Nettoyer l'instance précédente
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      // Créer nouvelle instance HLS.js
      const hls = new Hls({
        debug: false,
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 30,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 10,
        maxLiveSyncPlaybackRate: 1.0,
      });

      hlsRef.current = hls;

      // Configuration des événements
      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        console.log("[trovo-player] HLS media attached");
      });

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        console.log("[trovo-player] HLS manifest parsed, levels available:", data.levels?.length || 0);
        attemptPlay(video);
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        console.error("[trovo-player] HLS error:", data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              setError("Erreur réseau HLS");
              setPlayerState("error");
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              setError("Erreur média HLS");
              setPlayerState("error");
              break;
            default:
              setError(`Erreur HLS: ${data.details}`);
              setPlayerState("error");
              break;
          }
        }
      });

      hls.loadSource(url);
      hls.attachMedia(video);

    } catch (err) {
      const errorMessage = (err as Error).message;
      console.error("[trovo-player] HLS initialization failed:", errorMessage);
      setError(`HLS: ${errorMessage}`);
      setPlayerState("error");
    }
  };

  const initializeFlvPlayer = async (url: string) => {
    const video = videoRef.current;
    if (!video) return;

    try {
      console.log(`[trovo-player] Initializing FLV for: ${url.substring(0, 100)}...`);

      // Import dynamique de flv.js
      const flvjs = await import("flv.js").then(module => module.default);

      if (!flvjs.isSupported()) {
        throw new Error("FLV non supporté par ce navigateur");
      }

      // Nettoyer l'instance précédente
      if (videoRef.current && (videoRef.current as any)._flvPlayer) {
        (videoRef.current as any)._flvPlayer.destroy();
        (videoRef.current as any)._flvPlayer = null;
      }

      // Créer player FLV
      const flvPlayer = flvjs.createPlayer({
        type: "flv",
        url: url,
        isLive: true,
        cors: true,
        withCredentials: false,
        hasAudio: true,
        hasVideo: true,
      });

      (videoRef.current as any)._flvPlayer = flvPlayer;

      flvPlayer.attachMediaElement(video);
      flvPlayer.load();
      flvPlayer.play();

      flvPlayer.on(flvjs.Events.ERROR, (errorType, errorDetail) => {
        console.error("[trovo-player] FLV error:", errorType, errorDetail);
        setError(`FLV: ${errorType}`);
        setPlayerState("error");
      });

      flvPlayer.on(flvjs.Events.LOADING_COMPLETE, () => {
        console.log("[trovo-player] FLV loading complete");
      });

      // Écouter les événements vidéo
      video.addEventListener("play", () => setPlayerState("playing"));
      video.addEventListener("pause", () => setPlayerState("paused"));
      video.addEventListener("ended", () => setPlayerState("paused"));

      await attemptPlay(video);

    } catch (err) {
      const errorMessage = (err as Error).message;
      console.error("[trovo-player] FLV initialization failed:", errorMessage);
      setError(`FLV: ${errorMessage}`);
      setPlayerState("error");
    }
  };

  const attemptPlay = async (video: HTMLVideoElement) => {
    try {
      await video.play();
      setPlayerState("playing");
      console.log("[trovo-player] Playback started successfully");
    } catch (playError) {
      console.error("[trovo-player] Play failed:", playError);
      setError(`Lecture: ${(playError as Error).message}`);
      setPlayerState("error");
    }
  };

  const handlePlay = () => {
    if (videoRef.current) {
      videoRef.current.play().then(() => setPlayerState("playing")).catch(err => {
        setError(`Play: ${(err as Error).message}`);
        setPlayerState("error");
      });
    }
  };

  const handlePause = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      setPlayerState("paused");
    }
  };

  const handleStop = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
      setPlayerState("paused");
    }
  };

  const handleSourceChange = (source: "timeshift" | "main") => {
    setSelectedSource(source);
  };

  React.useEffect(() => {
    initializePlayer();
  }, [currentUrl]);

  React.useEffect(() => {
    return () => {
      // Cleanup
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (videoRef.current && (videoRef.current as any)._flvPlayer) {
        (videoRef.current as any)._flvPlayer.destroy();
        (videoRef.current as any)._flvPlayer = null;
      }
    };
  }, []);

  const getStatusColor = () => {
    switch (playerState) {
      case "loading": return "#ffc107";
      case "playing": return "#4caf50";
      case "paused": return "#ff9800";
      case "error": return "#f44336";
      case "not_implemented": return "#9e9e9e";
      default: return "#9e9e9e";
    }
  };

  const getStatusText = () => {
    switch (playerState) {
      case "loading": return "Chargement...";
      case "playing": return "Lecture en cours";
      case "paused": return "En pause";
      case "error": return "Erreur";
      case "not_implemented": return "Non implémenté";
      default: return "Inconnu";
    }
  };

  return (
    <div style={{ width: "100%" }}>
      {/* Sélecteur de source */}
      <div style={{ marginBottom: "12px" }}>
        <strong style={{ color: "#fff", display: "block", marginBottom: "4px" }}>Source vidéo:</strong>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {timeShiftUrl && (
            <button
              onClick={() => handleSourceChange("timeshift")}
              disabled={playerState === "loading"}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: selectedSource === "timeshift" ? "1px solid #4caf50" : "1px solid rgba(255, 255, 255, 0.3)",
                background: selectedSource === "timeshift" ? "rgba(76, 175, 80, 0.3)" : "rgba(255, 255, 255, 0.1)",
                color: "#fff",
                fontSize: "12px",
                cursor: playerState === "loading" ? "not-allowed" : "pointer",
                opacity: playerState === "loading" ? 0.6 : 1
              }}
            >
              Timeshift HLS (.m3u8)
            </button>
          )}
          {playUrl && (
            <button
              onClick={() => handleSourceChange("main")}
              disabled={playerState === "loading"}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: selectedSource === "main" ? "1px solid #4caf50" : "1px solid rgba(255, 255, 255, 0.3)",
                background: selectedSource === "main" ? "rgba(76, 175, 80, 0.3)" : "rgba(255, 255, 255, 0.1)",
                color: "#fff",
                fontSize: "12px",
                cursor: playerState === "loading" ? "not-allowed" : "pointer",
                opacity: playerState === "loading" ? 0.6 : 1
              }}
            >
              Main FLV (.flv)
            </button>
          )}
        </div>
      </div>

      {/* Contrôles du player */}
      <div style={{ marginBottom: "12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button
          onClick={handlePlay}
          disabled={playerState === "loading" || playerState === "playing"}
          style={{
            padding: "4px 8px",
            borderRadius: "4px",
            border: "1px solid rgba(255, 255, 255, 0.3)",
            background: "rgba(255, 255, 255, 0.1)",
            color: "#fff",
            fontSize: "11px",
            cursor: (playerState === "loading" || playerState === "playing") ? "not-allowed" : "pointer"
          }}
        >
          Play
        </button>
        <button
          onClick={handlePause}
          disabled={playerState !== "playing"}
          style={{
            padding: "4px 8px",
            borderRadius: "4px",
            border: "1px solid rgba(255, 255, 255, 0.3)",
            background: "rgba(255, 255, 255, 0.1)",
            color: "#fff",
            fontSize: "11px",
            cursor: playerState !== "playing" ? "not-allowed" : "pointer"
          }}
        >
          Pause
        </button>
        <button
          onClick={handleStop}
          disabled={!videoRef.current || playerState === "loading"}
          style={{
            padding: "4px 8px",
            borderRadius: "4px",
            border: "1px solid rgba(255, 255, 255, 0.3)",
            background: "rgba(255, 255, 255, 0.1)",
            color: "#fff",
            fontSize: "11px",
            cursor: !videoRef.current || playerState === "loading" ? "not-allowed" : "pointer"
          }}
        >
          Stop
        </button>
      </div>

      {/* Zone du player */}
      <div style={{
        background: "rgba(0, 0, 0, 0.4)",
        border: "1px solid rgba(255, 255, 255, 0.2)",
        borderRadius: "8px",
        padding: "20px",
        textAlign: "center"
      }}>
        {/* Status indicator */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          marginBottom: "12px"
        }}>
          <div style={{
            width: "12px",
            height: "12px",
            borderRadius: "50%",
            background: getStatusColor(),
            animation: playerState === "loading" ? "pulse 1.5s infinite" : "none"
          }} />
          <div style={{ 
            color: getStatusColor(), 
            fontSize: "16px", 
            fontWeight: "bold"
          }}>
            {getStatusText()}
          </div>
          {detectedType !== "unknown" && (
            <div style={{ 
              fontSize: "14px", 
              color: "rgba(255, 255, 255, 0.8)"
            }}>
              ({detectedType.toUpperCase()})
            </div>
          )}
        </div>

        {/* Élément vidéo */}
        <video
          ref={videoRef}
          style={{
            width: "100%",
            maxWidth: "640px",
            height: "auto",
            maxHeight: "360px",
            background: "black",
            borderRadius: "8px",
            border: "1px solid rgba(255, 255, 255, 0.1)"
          }}
          controls
          playsInline
          muted={false}
        />

        {/* URL source */}
        {actualSource && (
          <div style={{ 
            fontSize: "11px", 
            color: "rgba(255, 255, 255, 0.6)",
            marginTop: "12px",
            wordBreak: "break-all",
            padding: "8px",
            background: "rgba(0, 0, 0, 0.2)",
            borderRadius: "4px",
            fontFamily: "monospace"
          }}>
            Source: {actualSource.length > 100 ? `${actualSource.substring(0, 100)}...` : actualSource}
          </div>
        )}

        {/* Message d'erreur */}
        {error && (
          <div style={{ 
            color: "#f44336",
            fontSize: "14px",
            marginTop: "12px",
            padding: "8px",
            background: "rgba(244, 67, 54, 0.1)",
            border: "1px solid rgba(244, 67, 54, 0.3)",
            borderRadius: "4px"
          }}>
            {error}
          </div>
        )}

        {/* Informations techniques */}
        {playerState === "playing" && (
          <div style={{
            fontSize: "12px",
            color: "rgba(255, 255, 255, 0.6)",
            marginTop: "12px"
          }}>
            <div>Format: {detectedType.toUpperCase()}</div>
            <div>Source: {selectedSource === "timeshift" ? "Timeshift" : "Main"}</div>
            {videoRef.current && (
              <>
                <div>Durée: {videoRef.current.duration ? videoRef.current.duration.toFixed(1) + "s" : "Live"}</div>
                <div>Temps: {videoRef.current.currentTime.toFixed(1)}s</div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Style pour l'animation de loading */}
      <style>{`
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
