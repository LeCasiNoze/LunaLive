// web/src/components/TrovoPlayer.tsx
// Composant de player Trovo avec lecture vidéo réelle

import * as React from "react";

export type TrovoPlayerProps = {
  playUrl?: string | null;
  timeShiftUrl?: string | null;
};

type PlayerState = "idle" | "loading" | "playing" | "paused" | "ended" | "error" | "not_implemented";

export default function TrovoPlayer({ playUrl, timeShiftUrl }: TrovoPlayerProps) {
  const [selectedSource, setSelectedSource] = React.useState<"timeshift" | "main" | "auto">("auto");
  const [playerState, setPlayerState] = React.useState<PlayerState>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [detectedType, setDetectedType] = React.useState<"hls" | "flv" | "unknown">("unknown");
  const [actualSource, setActualSource] = React.useState<string>("");
  const [usingNativeHls, setUsingNativeHls] = React.useState(false);
  const [hlsDebugInfo, setHlsDebugInfo] = React.useState({
    nativeSupport: false,
    hlsSupported: false,
    manifestLoaded: false,
    mediaAttached: false,
    lastError: null as string | null,
    lastVideoError: null as string | null
  });

  const videoRef = React.useRef<HTMLVideoElement>(null);
  const hlsRef = React.useRef<any>(null);
  const flvRef = React.useRef<any>(null);

  // Auto-sélection de la source - PRIORITÉ HLS TIMESHIFT
  React.useEffect(() => {
    if (timeShiftUrl && timeShiftUrl.includes(".m3u8")) {
      setSelectedSource("timeshift"); // PRIORITÉ 1: HLS timeshift (fonctionnel)
    } else if (playUrl && playUrl.includes(".flv")) {
      setSelectedSource("main"); // PRIORITÉ 2: FLV principal (expérimental)
    } else {
      setSelectedSource("auto"); // Auto-détection
    }
  }, [timeShiftUrl, playUrl]);

  const currentUrl = selectedSource === "main" ? playUrl : selectedSource === "timeshift" ? timeShiftUrl : (playUrl || timeShiftUrl);

  const cleanupPlayers = () => {
    // Cleanup HLS
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
        console.log("[trovo-player] HLS instance destroyed");
      } catch (err) {
        console.warn("[trovo-player] Error destroying HLS:", err);
      }
      hlsRef.current = null;
    }

    // Cleanup FLV
    if (flvRef.current) {
      try {
        flvRef.current.destroy();
        console.log("[trovo-player] FLV instance destroyed");
      } catch (err) {
        console.warn("[trovo-player] Error destroying FLV:", err);
      }
      flvRef.current = null;
    }

    // Cleanup video
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = "";
      videoRef.current.load();
    }
  };

  const initializeHlsPlayer = async (url: string) => {
    const video = videoRef.current;
    if (!video) return;

    try {
      console.log(`[trovo-player] Initializing HLS for: ${url.substring(0, 100)}...`);

      // Import dynamique de hls.js
      const Hls = await import("hls.js").then(module => module.default);

      const initHlsPlayer = async (url: string, video: HTMLVideoElement) => {
        try {
          if (!url || !video) {
            throw new Error("URL ou vidéo manquante");
          }

          // Vérifier le support natif HLS
          const nativeSupport = !!video.canPlayType("application/vnd.apple.mpegurl");
          const hlsSupported = Hls.isSupported();
          
          setHlsDebugInfo(prev => ({
            ...prev,
            nativeSupport,
            hlsSupported
          }));

          console.log("[trovo-player] HLS debug:", {
            url: url.substring(0, 100) + "...",
            nativeSupport,
            hlsSupported,
            videoElement: !!video
          });

          // Support natif HLS (Safari)
          if (nativeSupport) {
            console.log("[trovo-player] Using native HLS support");
            setUsingNativeHls(true);
            video.src = url;
            await attachVideoEvents(video);
            return;
          }

          if (!hlsSupported) {
            throw new Error("HLS non supporté par ce navigateur");
          }

          // Créer instance HLS.js
          const hls = new Hls({
            debug: true, // Activer le debug pour voir tous les événements
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

          // Configuration des événements HLS.js
          hls.on(Hls.Events.MEDIA_ATTACHED, () => {
            console.log("[trovo-player] HLS event: MEDIA_ATTACHED");
            setHlsDebugInfo(prev => ({ ...prev, mediaAttached: true }));
          });

          hls.on(Hls.Events.MEDIA_DETACHED, () => {
            console.log("[trovo-player] HLS event: MEDIA_DETACHED");
            setHlsDebugInfo(prev => ({ ...prev, mediaAttached: false }));
          });

          hls.on(Hls.Events.MANIFEST_LOADING, (_, data) => {
            console.log("[trovo-player] HLS event: MANIFEST_LOADING", { url: data.url });
          });

          hls.on(Hls.Events.MANIFEST_LOADED, (_, data) => {
            console.log("[trovo-player] HLS event: MANIFEST_LOADED", { 
              levels: data.levels?.length || 0,
              url: data.url
            });
          });

          hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
            console.log("[trovo-player] HLS event: MANIFEST_PARSED", { 
              levels: data.levels?.length || 0,
              stats: data.stats
            });
            setHlsDebugInfo(prev => ({ ...prev, manifestLoaded: true }));
            setPlayerState("loading");
            attemptPlay(video);
          });

          hls.on(Hls.Events.LEVEL_LOADING, (_, data) => {
            console.log("[trovo-player] HLS event: LEVEL_LOADING", { level: data.level });
          });

          hls.on(Hls.Events.LEVEL_LOADED, (_, data) => {
            console.log("[trovo-player] HLS event: LEVEL_LOADED", { 
              level: data.level,
              details: data.details
            });
          });

          hls.on(Hls.Events.FRAG_LOADED, (_, data) => {
            console.log("[trovo-player] HLS event: FRAG_LOADED", { 
              frag: data.frag.url?.substring(0, 50) + "..."
            });
          });

          hls.on(Hls.Events.ERROR, (_, data) => {
            console.error("[trovo-player] HLS event: ERROR", {
              type: data.type,
              details: data.details,
              fatal: data.fatal,
              error: data.error?.message
            });
            
            const errorMsg = `HLS Error: ${data.type} - ${data.details}`;
            setHlsDebugInfo(prev => ({ ...prev, lastError: errorMsg }));
            
            if (data.fatal) {
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  setError("Erreur réseau HLS: " + data.details);
                  setPlayerState("error");
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  setError("Erreur média HLS: " + data.details);
                  setPlayerState("error");
                  break;
                default:
                  setError("Erreur HLS fatale: " + data.details);
                  setPlayerState("error");
                  break;
              }
            }
          });

          // Attacher la vidéo et charger la source
          hls.attachMedia(video);
          hls.loadSource(url);

          console.log("[trovo-player] HLS setup complete");
        } catch (err) {
          const errorMessage = (err as Error).message;
          console.error("[trovo-player] HLS initialization failed:", errorMessage);
          setError("HLS: " + errorMessage);
          setPlayerState("error");
        }
      };

      await initHlsPlayer(url, video);
    } catch (err) {
      const errorMessage = (err as Error).message;
      console.error("[trovo-player] HLS initialization failed:", errorMessage);
      setError("HLS: " + errorMessage);
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

      flvRef.current = flvPlayer;

      flvPlayer.on(flvjs.Events.ERROR, (errorType, errorDetail) => {
        console.error("[trovo-player] FLV error:", errorType, errorDetail);
        setError("FLV: " + errorType + " - " + errorDetail);
        setPlayerState("error");
      });

      flvPlayer.on(flvjs.Events.LOADING_COMPLETE, () => {
        console.log("[trovo-player] FLV loading complete");
      });

      flvPlayer.attachMediaElement(video);
      flvPlayer.load();
      
      await attachVideoEvents(video);

    } catch (err) {
      const errorMessage = (err as Error).message;
      console.error("[trovo-player] FLV initialization failed:", errorMessage);
      setError("FLV: " + errorMessage);
      setPlayerState("error");
    }
  };

  const attachVideoEvents = (video: HTMLVideoElement) => {
    return new Promise<void>((resolve) => {
      const handlePlay = () => {
        console.log("[trovo-player] Video play event");
        setPlayerState("playing");
      };

      const handlePause = () => {
        console.log("[trovo-player] Video pause event");
        setPlayerState("paused");
      };

      const handleEnded = () => {
        console.log("[trovo-player] Video ended event");
        setPlayerState("ended");
      };

      const handleError = (e: Event) => {
        console.error("[trovo-player] Video error event:", e);
        const videoError = (e.target as HTMLVideoElement).error;
        if (videoError) {
          setError("Vidéo: " + videoError.message);
        } else {
          setError("Erreur vidéo inconnue");
        }
        setPlayerState("error");
      };

      const handleCanPlay = () => {
        console.log("[trovo-player] Video can play");
        resolve();
      };

      video.addEventListener("play", handlePlay);
      video.addEventListener("pause", handlePause);
      video.addEventListener("ended", handleEnded);
      video.addEventListener("error", handleError);
      video.addEventListener("canplay", handleCanPlay);

      // Cleanup function
      return () => {
        video.removeEventListener("play", handlePlay);
        video.removeEventListener("pause", handlePause);
        video.removeEventListener("ended", handleEnded);
        video.removeEventListener("error", handleError);
        video.removeEventListener("canplay", handleCanPlay);
      };
    });
  };

  const attemptPlay = async (video: HTMLVideoElement) => {
    try {
      await video.play();
      console.log("[trovo-player] Playback started successfully");
      setPlayerState("playing");
    } catch (playError) {
      console.error("[trovo-player] Play failed:", playError);
      const errorMessage = (playError as Error).message;
      if (errorMessage.includes("autoplay")) {
        setError("Autoplay bloqué - cliquez sur le bouton Play");
        setPlayerState("paused");
      } else {
        setError("Lecture: " + errorMessage);
        setPlayerState("error");
      }
    }
  };

  const initializePlayer = async () => {
    if (!currentUrl || !videoRef.current) {
      setPlayerState("error");
      setError("Aucune URL disponible ou élément vidéo non prêt");
      return;
    }

    cleanupPlayers();
    setPlayerState("loading");
    setError(null);
    setActualSource(currentUrl);
    setUsingNativeHls(false);

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

  const handlePlay = async () => {
    if (videoRef.current) {
      try {
        await videoRef.current.play();
        setPlayerState("playing");
      } catch (err) {
        setError("Play: " + (err as Error).message);
        setPlayerState("error");
      }
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

  const handleReload = () => {
    initializePlayer();
  };

  const handleSourceChange = (source: "timeshift" | "main") => {
    setSelectedSource(source);
  };

  React.useEffect(() => {
    if (currentUrl) {
      initializePlayer();
    }
  }, [currentUrl]);

  React.useEffect(() => {
    return cleanupPlayers;
  }, []);

  const getStatusColor = () => {
    switch (playerState) {
      case "idle": return "#9e9e9e";
      case "loading": return "#ffc107";
      case "playing": return "#4caf50";
      case "paused": return "#ff9800";
      case "ended": return "#9e9e9e";
      case "error": return "#f44336";
      case "not_implemented": return "#9e9e9e";
      default: return "#9e9e9e";
    }
  };

  const getStatusText = () => {
    switch (playerState) {
      case "idle": return "En attente";
      case "loading": return "Chargement...";
      case "playing": return "Lecture en cours";
      case "paused": return "En pause";
      case "ended": return "Terminé";
      case "error": return "Erreur";
      case "not_implemented": return "Non implémenté";
      default: return "Inconnu";
    }
  };

  const getSourceDescription = () => {
    if (selectedSource === "timeshift") return "Timeshift HLS (PRIMAIRE)";
    if (selectedSource === "main") return "Main FLV (EXPÉRIMENTAL)";
    return "Auto";
  };

  const getTechnologyDescription = () => {
    if (detectedType === "hls") {
      return usingNativeHls ? "HLS Natif" : "HLS.js";
    }
    if (detectedType === "flv") {
      return "flv.js";
    }
    return "Inconnu";
  };

  const getPriorityBadge = () => {
    if (selectedSource === "main" && detectedType === "flv") {
      return " (PRIMAIRE)";
    }
    if (selectedSource === "timeshift" && detectedType === "hls") {
      return " (FALLBACK)";
    }
    return "";
  };

  return (
    <div style={{ width: "100%" }}>
      {/* Sélecteur de source */}
      <div style={{ marginBottom: "12px" }}>
        <strong style={{ color: "#fff", display: "block", marginBottom: "4px" }}>Source vidéo:</strong>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          {playUrl && playUrl.includes(".flv") && (
            <button
              onClick={() => handleSourceChange("main")}
              disabled={playerState === "loading"}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: selectedSource === "main" ? "2px solid #4caf50" : "1px solid rgba(255, 255, 255, 0.3)",
                background: selectedSource === "main" ? "rgba(76, 175, 80, 0.3)" : "rgba(255, 255, 255, 0.1)",
                color: "#fff",
                fontSize: "12px",
                cursor: playerState === "loading" ? "not-allowed" : "pointer",
                opacity: playerState === "loading" ? 0.6 : 1,
                fontWeight: selectedSource === "main" ? "bold" : "normal"
              }}
            >
              Main FLV (PRIMAIRE)
            </button>
          )}
          {timeShiftUrl && timeShiftUrl.includes(".m3u8") && (
            <button
              onClick={() => handleSourceChange("timeshift")}
              disabled={playerState === "loading"}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: selectedSource === "timeshift" ? "1px solid #ff9800" : "1px solid rgba(255, 255, 255, 0.3)",
                background: selectedSource === "timeshift" ? "rgba(255, 152, 0, 0.3)" : "rgba(255, 255, 255, 0.1)",
                color: "#fff",
                fontSize: "12px",
                cursor: playerState === "loading" ? "not-allowed" : "pointer",
                opacity: playerState === "loading" ? 0.6 : 1
              }}
            >
              Timeshift HLS (FALLBACK)
            </button>
          )}
          <div style={{ color: "rgba(255, 255, 255, 0.8)", fontSize: "12px", marginLeft: "8px" }}>
            Actuel: <strong>{getSourceDescription()}</strong> {getPriorityBadge()}
          </div>
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
        <button
          onClick={handleReload}
          disabled={playerState === "loading"}
          style={{
            padding: "4px 8px",
            borderRadius: "4px",
            border: "1px solid rgba(255, 255, 255, 0.3)",
            background: "rgba(255, 255, 255, 0.1)",
            color: "#fff",
            fontSize: "11px",
            cursor: playerState === "loading" ? "not-allowed" : "pointer"
          }}
        >
          Reload Source
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
        {/* Élément vidéo */}
        <video
          ref={videoRef}
          style={{
            width: "100%",
            maxWidth: "800px",
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
        {playerState === "playing" && videoRef.current && (
          <div style={{
            fontSize: "12px",
            color: "rgba(255, 255, 255, 0.6)",
            marginTop: "12px"
          }}>
            <div>Format: {detectedType.toUpperCase()}</div>
            <div>Source: {getSourceDescription()}</div>
            <div>Technologie: {getTechnologyDescription()}</div>
            <div>Durée: {videoRef.current.duration ? videoRef.current.duration.toFixed(1) + "s" : "Live"}</div>
            <div>Temps: {videoRef.current.currentTime.toFixed(1)}s</div>
            <div style={{ color: getStatusColor() }}>État: {playerState}</div>
          </div>
        )}

        {/* Debug HLS */}
        {detectedType === "hls" && (
          <div style={{
            fontSize: "11px",
            color: "rgba(255, 255, 255, 0.6)",
            marginTop: "12px",
            background: "rgba(0, 0, 0, 0.2)",
            padding: "8px",
            borderRadius: "4px"
          }}>
            <strong>Debug HLS:</strong>
            <div>Native support: {hlsDebugInfo.nativeSupport ? "YES" : "NO"}</div>
            <div>HLS.js supported: {hlsDebugInfo.hlsSupported ? "YES" : "NO"}</div>
            <div>Manifest loaded: {hlsDebugInfo.manifestLoaded ? "YES" : "NO"}</div>
            <div>Media attached: {hlsDebugInfo.mediaAttached ? "YES" : "NO"}</div>
            {hlsDebugInfo.lastError && (
              <div style={{ color: "#ff9800" }}>
                Last HLS error: {hlsDebugInfo.lastError}
              </div>
            )}
            {hlsDebugInfo.lastVideoError && (
              <div style={{ color: "#ff9800" }}>
                Last video error: {hlsDebugInfo.lastVideoError}
              </div>
            )}
          </div>
        )}

        {/* Debug FLV */}
        {detectedType === "flv" && (
          <div style={{
            fontSize: "11px",
            color: "rgba(255, 255, 255, 0.6)",
            marginTop: "12px",
            background: "rgba(0, 0, 0, 0.2)",
            padding: "8px",
            borderRadius: "4px"
          }}>
            <strong>Debug FLV:</strong>
            <div>FLV.js supported: YES</div>
            <div>Mode: Experimental</div>
            <div>Note: May be blocked by 403 in browser</div>
          </div>
        )}

        {/* Affichage de l'état du player */}
        {playerState !== "playing" && (
          <div style={{
            fontSize: "12px",
            color: getStatusColor(),
            marginTop: "12px",
            fontWeight: "bold"
          }}>
            {getStatusText()}
            {error && `: ${error}`}
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
