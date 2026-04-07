// web/src/components/TrovoPlayer.tsx
// Composant de player Trovo avec lecture vidéo réelle

import * as React from "react";

export type TrovoPlayerProps = {
  playUrl?: string | null;
  timeShiftUrl?: string | null;
};

type PlayerState = "idle" | "loading" | "playing" | "paused" | "ended" | "error" | "not_implemented";

// Fonction pour obtenir l'URL proxifiée
const getProxiedUrl = async (originalUrl: string, type: 'flv' | 'hls'): Promise<string> => {
  try {
    const encodedUrl = encodeURIComponent(originalUrl);
    const response = await fetch(`/api/trovo/${type}/${encodedUrl}`);
    
    if (!response.ok) {
      throw new Error(`Proxy request failed: ${response.status}`);
    }
    
    const data = await response.json();
    return data.proxiedUrl;
  } catch (error) {
    console.error('[trovo-player] Proxy error:', error);
    throw new Error(`Proxy failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

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
    lastVideoError: null as string | null,
    usingProxy: false
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

    // Cleanup vidéo
    if (videoRef.current) {
      const video = videoRef.current;
      video.pause();
      video.src = "";
      video.load();
    }
  };

  const attachVideoEvents = (video: HTMLVideoElement) => {
    return new Promise<void>((resolve, reject) => {
      const handleLoadedMetadata = () => {
        console.log("[trovo-player] Video metadata loaded");
        setPlayerState("loading");
      };

      const handleCanPlay = () => {
        console.log("[trovo-player] Video can play");
        setPlayerState("playing");
        resolve();
      };

      const handlePlaying = () => {
        console.log("[trovo-player] Video is playing");
        setPlayerState("playing");
      };

      const handlePause = () => {
        console.log("[trovo-player] Video is paused");
        setPlayerState("paused");
      };

      const handleEnded = () => {
        console.log("[trovo-player] Video ended");
        setPlayerState("ended");
      };

      const handleError = (e: Event) => {
        const video = e.target as HTMLVideoElement;
        const errorMsg = `Video error: ${video.error?.message || 'Unknown error'}`;
        console.error("[trovo-player]", errorMsg);
        setError(errorMsg);
        setPlayerState("error");
        setHlsDebugInfo(prev => ({ ...prev, lastVideoError: errorMsg }));
        reject(new Error(errorMsg));
      };

      const handleStalled = () => {
        console.log("[trovo-player] Video stalled");
      };

      const handleWaiting = () => {
        console.log("[trovo-player] Video waiting");
      };

      // Ajouter les événements
      video.addEventListener("loadedmetadata", handleLoadedMetadata);
      video.addEventListener("canplay", handleCanPlay);
      video.addEventListener("playing", handlePlaying);
      video.addEventListener("pause", handlePause);
      video.addEventListener("ended", handleEnded);
      video.addEventListener("error", handleError);
      video.addEventListener("stalled", handleStalled);
      video.addEventListener("waiting", handleWaiting);

      // Cleanup function
      return () => {
        video.removeEventListener("loadedmetadata", handleLoadedMetadata);
        video.removeEventListener("canplay", handleCanPlay);
        video.removeEventListener("playing", handlePlaying);
        video.removeEventListener("pause", handlePause);
        video.removeEventListener("ended", handleEnded);
        video.removeEventListener("error", handleError);
        video.removeEventListener("stalled", handleStalled);
        video.removeEventListener("waiting", handleWaiting);
      };
    });
  };

  const attemptPlay = async (video: HTMLVideoElement) => {
    try {
      await video.play();
      console.log("[trovo-player] Video play() succeeded");
    } catch (err) {
      const errorMsg = `Video play() failed: ${(err as Error).message}`;
      console.error("[trovo-player]", errorMsg);
      setError(errorMsg);
      setPlayerState("error");
      setHlsDebugInfo(prev => ({ ...prev, lastVideoError: errorMsg }));
    }
  };

  const initHlsPlayer = async (url: string, video: HTMLVideoElement) => {
    if (!url || !video) {
      throw new Error("URL ou vidéo manquante");
    }

    try {
      // Import dynamique de hls.js
      const Hls = await import("hls.js").then(module => module.default);

      // Vérifier le support natif HLS
      const nativeSupport = !!video.canPlayType("application/vnd.apple.mpegurl");
      const hlsSupported = Hls.isSupported();
      
      setHlsDebugInfo(prev => ({
        ...prev,
        nativeSupport,
        hlsSupported,
        usingProxy: true
      }));

      console.log("[trovo-player] HLS debug:", {
        url: url.substring(0, 100) + "...",
        nativeSupport,
        hlsSupported,
        videoElement: !!video,
        usingProxy: true
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
        // Ajouter les headers pour le proxy
        xhrSetup: (xhr) => {
          xhr.setRequestHeader('Referer', 'https://trovo.live/');
          xhr.setRequestHeader('Origin', 'https://trovo.live');
          xhr.setRequestHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        }
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

  const initFlvPlayer = async (url: string, video: HTMLVideoElement) => {
    if (!url || !video) {
      throw new Error("URL ou vidéo manquante");
    }

    // Import dynamique de flv.js
    const flvjs = await import("flv.js").then(module => module.default);

    if (!flvjs.isSupported()) {
      throw new Error("FLV non supporté par ce navigateur");
    }

    const flvPlayer = flvjs.createPlayer({
      type: "flv",
      url: url,
      isLive: true,
      hasVideo: true,
      hasAudio: true
      // Note: Les headers sont gérés par le proxy backend
    });

    flvRef.current = flvPlayer;

    flvPlayer.attachMediaElement(video);
    flvPlayer.load();

    console.log("[trovo-player] FLV player created and loaded");
  };

  // Initialisation du player
  React.useEffect(() => {
    if (!currentUrl) {
      setPlayerState("error");
      setError("Aucune URL disponible");
      return;
    }

    const video = videoRef.current;
    if (!video) {
      setPlayerState("error");
      setError("Élément vidéo non trouvé");
      return;
    }

    const initializePlayer = async () => {
      cleanupPlayers();
      setPlayerState("loading");
      setError(null);
      setActualSource(currentUrl);

      try {
        const isHls = currentUrl.includes(".m3u8");
        const isFlv = currentUrl.includes(".flv");

        console.log(`[trovo-player] Initializing player for: ${currentUrl.substring(0, 100)}...`);
        console.log(`[trovo-player] Source: ${selectedSource}, Type: ${isHls ? "HLS" : isFlv ? "FLV" : "Unknown"}`);

        // Obtenir l'URL proxifiée
        const proxiedUrl = await getProxiedUrl(currentUrl, isHls ? "hls" : "flv");
        console.log(`[trovo-player] Using proxied URL: ${proxiedUrl.substring(0, 100)}...`);

        if (isHls) {
          setDetectedType("hls");
          await initHlsPlayer(proxiedUrl, video);
        } else if (isFlv) {
          setDetectedType("flv");
          await initFlvPlayer(proxiedUrl, video);
          await attachVideoEvents(video);
          await attemptPlay(video);
        } else {
          throw new Error("Type de flux non supporté");
        }
      } catch (err) {
        const errorMessage = (err as Error).message;
        console.error("[trovo-player] Player initialization failed:", errorMessage);
        setError(errorMessage);
        setPlayerState("error");
      }
    };

    initializePlayer();

    // Cleanup
    return () => {
      cleanupPlayers();
    };
  }, [currentUrl]);

  const handlePlay = async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      await video.play();
      setPlayerState("playing");
    } catch (err) {
      const errorMessage = (err as Error).message;
      setError(errorMessage);
      setPlayerState("error");
    }
  };

  const handlePause = () => {
    const video = videoRef.current;
    if (!video) return;

    video.pause();
    setPlayerState("paused");
  };

  const handleStop = () => {
    const video = videoRef.current;
    if (!video) return;

    video.pause();
    video.currentTime = 0;
    setPlayerState("idle");
  };

  const handleReload = () => {
    // Force re-initialization
    setPlayerState("loading");
    const video = videoRef.current;
    if (video) {
      video.load();
    }
  };

  const handleSourceChange = (source: "timeshift" | "main") => {
    setSelectedSource(source);
  };

  // UI helpers
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
      case "idle": return "Inactif";
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
      return usingNativeHls ? "HLS Natif (Proxy)" : "HLS.js (Proxy)";
    }
    if (detectedType === "flv") {
      return "flv.js (Proxy)";
    }
    return "Inconnu";
  };

  const getPriorityBadge = () => {
    if (selectedSource === "timeshift") {
      return { text: "PRIMAIRE", color: "#4caf50" };
    }
    if (selectedSource === "main") {
      return { text: "EXPÉRIMENTAL", color: "#ff9800" };
    }
    return { text: "AUTO", color: "#666" };
  };

  return (
    <div style={{ padding: "16px", background: "rgba(0, 0, 0, 0.2)", borderRadius: "8px" }}>
      {/* Contrôles de source */}
      <div style={{ marginBottom: "16px" }}>
        <div style={{ marginBottom: "8px", color: "#fff", fontWeight: "bold" }}>
          Source: {getSourceDescription()}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {timeShiftUrl && (
            <button
              onClick={() => handleSourceChange("timeshift")}
              style={{
                padding: "6px 12px",
                borderRadius: "4px",
                border: selectedSource === "timeshift" ? "1px solid #4caf50" : "1px solid rgba(255, 255, 255, 0.3)",
                background: selectedSource === "timeshift" ? "rgba(76, 175, 80, 0.3)" : "rgba(255, 255, 255, 0.1)",
                color: "#fff",
                fontSize: "12px",
                cursor: "pointer"
              }}
            >
              Timeshift HLS
            </button>
          )}
          {playUrl && (
            <button
              onClick={() => handleSourceChange("main")}
              style={{
                padding: "6px 12px",
                borderRadius: "4px",
                border: selectedSource === "main" ? "1px solid #ff9800" : "1px solid rgba(255, 255, 255, 0.3)",
                background: selectedSource === "main" ? "rgba(255, 152, 0, 0.3)" : "rgba(255, 255, 255, 0.1)",
                color: "#fff",
                fontSize: "12px",
                cursor: "pointer"
              }}
            >
              Main FLV
            </button>
          )}
        </div>
      </div>

      {/* Élément vidéo */}
      <div style={{ marginBottom: "16px" }}>
        <video
          ref={videoRef}
          style={{
            width: "100%",
            maxWidth: "800px",
            height: "450px",
            background: "#000",
            borderRadius: "4px"
          }}
          controls
          playsInline
          muted={false}
        />
      </div>

      {/* Contrôles de lecture */}
      <div style={{ marginBottom: "16px" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={handlePlay}
            disabled={playerState === "playing"}
            style={{
              padding: "8px 16px",
              borderRadius: "4px",
              border: "1px solid rgba(255, 255, 255, 0.3)",
              background: playerState === "playing" ? "rgba(255, 255, 255, 0.1)" : "rgba(76, 175, 80, 0.3)",
              color: "#fff",
              cursor: playerState === "playing" ? "not-allowed" : "pointer"
            }}
          >
            Play
          </button>
          <button
            onClick={handlePause}
            disabled={playerState !== "playing"}
            style={{
              padding: "8px 16px",
              borderRadius: "4px",
              border: "1px solid rgba(255, 255, 255, 0.3)",
              background: playerState === "playing" ? "rgba(33, 150, 243, 0.3)" : "rgba(255, 255, 255, 0.1)",
              color: "#fff",
              cursor: playerState === "playing" ? "pointer" : "not-allowed"
            }}
          >
            Pause
          </button>
          <button
            onClick={handleStop}
            style={{
              padding: "8px 16px",
              borderRadius: "4px",
              border: "1px solid rgba(255, 255, 255, 0.3)",
              background: "rgba(244, 67, 54, 0.3)",
              color: "#fff",
              cursor: "pointer"
            }}
          >
            Stop
          </button>
          <button
            onClick={handleReload}
            style={{
              padding: "8px 16px",
              borderRadius: "4px",
              border: "1px solid rgba(255, 255, 255, 0.3)",
              background: "rgba(156, 39, 176, 0.3)",
              color: "#fff",
              cursor: "pointer"
            }}
          >
            Reload
          </button>
        </div>
      </div>

      {/* Informations de debug */}
      <div style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.8)" }}>
        <div style={{ marginBottom: "8px" }}>
          <strong>État:</strong> <span style={{ color: getStatusColor() }}>{getStatusText()}</span>
          {getPriorityBadge().text && (
            <span style={{ 
              marginLeft: "8px", 
              padding: "2px 6px", 
              borderRadius: "3px", 
              background: getPriorityBadge().color,
              fontSize: "10px",
              fontWeight: "bold"
            }}>
              {getPriorityBadge().text}
            </span>
          )}
        </div>
        
        {actualSource && (
          <div style={{ marginBottom: "8px" }}>
            <strong>URL:</strong> {actualSource.substring(0, 80)}...
          </div>
        )}
        
        <div style={{ marginBottom: "8px" }}>
          <strong>Format:</strong> {detectedType.toUpperCase()}
        </div>
        
        <div style={{ marginBottom: "8px" }}>
          <strong>Technologie:</strong> {getTechnologyDescription()}
        </div>

        {/* Debug HLS */}
        {detectedType === "hls" && (
          <div style={{ marginBottom: "8px", background: "rgba(0, 0, 0, 0.3)", padding: "8px", borderRadius: "4px" }}>
            <strong>Debug HLS:</strong>
            <div>Native support: {hlsDebugInfo.nativeSupport ? "YES" : "NO"}</div>
            <div>HLS.js supported: {hlsDebugInfo.hlsSupported ? "YES" : "NO"}</div>
            <div>Manifest loaded: {hlsDebugInfo.manifestLoaded ? "YES" : "NO"}</div>
            <div>Media attached: {hlsDebugInfo.mediaAttached ? "YES" : "NO"}</div>
            <div>Using proxy: {hlsDebugInfo.usingProxy ? "YES" : "NO"}</div>
            {hlsDebugInfo.lastError && (
              <div style={{ color: "#f44336" }}>
                Last HLS error: {hlsDebugInfo.lastError}
              </div>
            )}
            {hlsDebugInfo.lastVideoError && (
              <div style={{ color: "#f44336" }}>
                Last video error: {hlsDebugInfo.lastVideoError}
              </div>
            )}
          </div>
        )}

        {/* Debug FLV */}
        {detectedType === "flv" && (
          <div style={{ marginBottom: "8px", background: "rgba(0, 0, 0, 0.3)", padding: "8px", borderRadius: "4px" }}>
            <strong>Debug FLV:</strong>
            <div>FLV.js supported: YES</div>
            <div>Using proxy: YES</div>
            <div>Mode: Experimental</div>
            <div>Note: 403 should be bypassed via proxy</div>
          </div>
        )}
      </div>

      {/* Erreur */}
      {error && (
        <div style={{ 
          marginTop: "16px", 
          padding: "12px", 
          background: "rgba(244, 67, 54, 0.2)", 
          border: "1px solid rgba(244, 67, 54, 0.5)", 
          borderRadius: "4px", 
          color: "#f44336",
          fontSize: "12px"
        }}>
          <strong>Erreur:</strong> {error}
        </div>
      )}

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
