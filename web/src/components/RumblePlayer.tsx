// web/src/components/RumblePlayer.tsx
// Composant de player Rumble HLS pour POC debug

import * as React from "react";

export type RumblePlayerProps = {
  hlsUrl?: string;
};

type PlayerState = "idle" | "loading" | "playing" | "paused" | "ended" | "error";

export default function RumblePlayer({ hlsUrl }: RumblePlayerProps) {
  const [playerState, setPlayerState] = React.useState<PlayerState>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [usingNativeHls, setUsingNativeHls] = React.useState(false);
  const [debugInfo, setDebugInfo] = React.useState({
    nativeSupport: false,
    hlsSupported: false,
    manifestLoaded: false,
    mediaAttached: false,
    lastError: null as string | null,
    lastVideoError: null as string | null,
    logs: [] as string[]
  });

  const videoRef = React.useRef<HTMLVideoElement>(null);
  const hlsRef = React.useRef<any>(null);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugInfo(prev => ({
      ...prev,
      logs: [...prev.logs, `[${timestamp}] ${message}`]
    }));
    console.log(`[rumble-player] ${message}`);
  };

  const attachVideoEvents = (video: HTMLVideoElement) => {
    return new Promise<void>((resolve, reject) => {
      const handleLoadedMetadata = () => {
        addLog("Video metadata loaded");
        setPlayerState("loading");
      };

      const handleCanPlay = () => {
        addLog("Video can play");
        setPlayerState("playing");
        resolve();
      };

      const handlePlaying = () => {
        addLog("Video is playing");
        setPlayerState("playing");
      };

      const handlePause = () => {
        addLog("Video is paused");
        setPlayerState("paused");
      };

      const handleEnded = () => {
        addLog("Video ended");
        setPlayerState("ended");
      };

      const handleError = (e: Event) => {
        const video = e.target as HTMLVideoElement;
        const errorMsg = `Video error: ${video.error?.message || 'Unknown error'}`;
        addLog(errorMsg);
        setError(errorMsg);
        setPlayerState("error");
        setDebugInfo(prev => ({ ...prev, lastVideoError: errorMsg }));
        reject(new Error(errorMsg));
      };

      const handleStalled = () => {
        addLog("Video stalled");
      };

      const handleWaiting = () => {
        addLog("Video waiting");
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
      addLog("Video play() succeeded");
    } catch (err) {
      const errorMsg = `Video play() failed: ${(err as Error).message}`;
      addLog(errorMsg);
      setError(errorMsg);
      setPlayerState("error");
      setDebugInfo(prev => ({ ...prev, lastVideoError: errorMsg }));
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
      
      setDebugInfo(prev => ({
        ...prev,
        nativeSupport,
        hlsSupported
      }));

      addLog(`HLS debug - Native support: ${nativeSupport}, HLS.js supported: ${hlsSupported}`);

      // Support natif HLS (Safari)
      if (nativeSupport) {
        addLog("Using native HLS support");
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
        debug: true,
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
        addLog("HLS event: MEDIA_ATTACHED");
        setDebugInfo(prev => ({ ...prev, mediaAttached: true }));
      });

      hls.on(Hls.Events.MEDIA_DETACHED, () => {
        addLog("HLS event: MEDIA_DETACHED");
        setDebugInfo(prev => ({ ...prev, mediaAttached: false }));
      });

      hls.on(Hls.Events.MANIFEST_LOADING, (_, data) => {
        addLog(`HLS event: MANIFEST_LOADING - ${data.url}`);
      });

      hls.on(Hls.Events.MANIFEST_LOADED, (_, data) => {
        addLog(`HLS event: MANIFEST_LOADED - ${data.levels?.length || 0} levels`);
      });

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        addLog(`HLS event: MANIFEST_PARSED - ${data.levels?.length || 0} levels available`);
        setDebugInfo(prev => ({ ...prev, manifestLoaded: true }));
        setPlayerState("loading");
        attemptPlay(video);
      });

      hls.on(Hls.Events.LEVEL_LOADING, (_, data) => {
        addLog(`HLS event: LEVEL_LOADING - level ${data.level}`);
      });

      hls.on(Hls.Events.LEVEL_LOADED, (_, data) => {
        addLog(`HLS event: LEVEL_LOADED - level ${data.level}`);
      });

      hls.on(Hls.Events.FRAG_LOADED, (_, data) => {
        addLog(`HLS event: FRAG_LOADED - ${data.frag.url?.substring(0, 50)}...`);
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        const errorMsg = `HLS Error: ${data.type} - ${data.details}`;
        addLog(`HLS event: ERROR - ${errorMsg}`);
        
        setDebugInfo(prev => ({ ...prev, lastError: errorMsg }));
        
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

      addLog("HLS setup complete");
    } catch (err) {
      const errorMessage = (err as Error).message;
      addLog(`HLS initialization failed: ${errorMessage}`);
      setError("HLS: " + errorMessage);
      setPlayerState("error");
    }
  };

  const cleanupPlayer = () => {
    // Cleanup HLS
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
        addLog("HLS instance destroyed");
      } catch (err) {
        addLog("Error destroying HLS: " + (err as Error).message);
      }
      hlsRef.current = null;
    }

    // Cleanup vidéo
    if (videoRef.current) {
      const video = videoRef.current;
      video.pause();
      video.src = "";
      video.load();
    }
  };

  const handleReload = () => {
    const video = videoRef.current;
    if (video && hlsUrl) {
      addLog("Manual reload requested");
      setPlayerState("loading");
      setError(null);
      initHlsPlayer(hlsUrl, video);
    }
  };

  // Initialisation du player
  React.useEffect(() => {
    if (!hlsUrl) {
      setPlayerState("error");
      setError("Aucune URL HLS fournie");
      return;
    }

    const video = videoRef.current;
    if (!video) {
      setPlayerState("error");
      setError("Élément vidéo non trouvé");
      return;
    }

    addLog(`Initializing Rumble HLS player for: ${hlsUrl}`);
    setPlayerState("loading");
    setError(null);

    initHlsPlayer(hlsUrl, video);

    // Cleanup
    return () => {
      cleanupPlayer();
    };
  }, [hlsUrl]);

  const getStatusColor = () => {
    switch (playerState) {
      case "idle": return "#666";
      case "loading": return "#ff9800";
      case "playing": return "#4caf50";
      case "paused": return "#2196f3";
      case "ended": return "#9c27b0";
      case "error": return "#f44336";
      default: return "#666";
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
      default: return "Inconnu";
    }
  };

  return (
    <div style={{ padding: "20px", background: "rgba(0, 0, 0, 0.2)", borderRadius: "8px" }}>
      {/* Header */}
      <div style={{ marginBottom: "20px", textAlign: "center" }}>
        <h1 style={{ color: "#fff", margin: "0 0 10px 0" }}>Debug Rumble HLS</h1>
        <div style={{ color: "rgba(255, 255, 255, 0.7)", fontSize: "14px" }}>
          Test de lecture HLS Rumble dans le navigateur
        </div>
      </div>

      {/* URL testée */}
      <div style={{ marginBottom: "20px" }}>
        <div style={{ color: "#fff", fontWeight: "bold", marginBottom: "8px" }}>URL testée:</div>
        <div style={{ 
          background: "rgba(0, 0, 0, 0.3)", 
          padding: "12px", 
          borderRadius: "4px", 
          fontFamily: "monospace", 
          fontSize: "12px",
          color: "rgba(255, 255, 255, 0.8)",
          wordBreak: "break-all"
        }}>
          {hlsUrl || "Aucune URL"}
        </div>
      </div>

      {/* Élément vidéo */}
      <div style={{ marginBottom: "20px", textAlign: "center" }}>
        <video
          ref={videoRef}
          style={{
            width: "100%",
            maxWidth: "800px",
            height: "450px",
            background: "#000",
            borderRadius: "8px",
            border: "1px solid rgba(255, 255, 255, 0.2)"
          }}
          controls
          playsInline
          muted={false}
        />
      </div>

      {/* Contrôles */}
      <div style={{ marginBottom: "20px", textAlign: "center" }}>
        <button
          onClick={handleReload}
          style={{
            padding: "10px 20px",
            borderRadius: "6px",
            border: "1px solid rgba(255, 255, 255, 0.3)",
            background: "rgba(33, 150, 243, 0.3)",
            color: "#fff",
            cursor: "pointer",
            fontSize: "14px"
          }}
        >
          Reload Stream
        </button>
      </div>

      {/* État du player */}
      <div style={{ marginBottom: "20px" }}>
        <div style={{ color: "#fff", fontWeight: "bold", marginBottom: "8px" }}>État du player:</div>
        <div style={{ 
          color: getStatusColor(), 
          fontSize: "16px", 
          fontWeight: "bold" 
        }}>
          {getStatusText()}
        </div>
        {error && (
          <div style={{ 
            color: "#f44336", 
            fontSize: "14px", 
            marginTop: "8px" 
          }}>
            {error}
          </div>
        )}
      </div>

      {/* Debug info */}
      <div style={{ marginBottom: "20px" }}>
        <div style={{ color: "#fff", fontWeight: "bold", marginBottom: "8px" }}>Debug HLS:</div>
        <div style={{ 
          background: "rgba(0, 0, 0, 0.3)", 
          padding: "12px", 
          borderRadius: "4px", 
          fontSize: "12px",
          color: "rgba(255, 255, 255, 0.8)"
        }}>
          <div>Native support: {debugInfo.nativeSupport ? "YES" : "NO"}</div>
          <div>HLS.js supported: {debugInfo.hlsSupported ? "YES" : "NO"}</div>
          <div>Manifest loaded: {debugInfo.manifestLoaded ? "YES" : "NO"}</div>
          <div>Media attached: {debugInfo.mediaAttached ? "YES" : "NO"}</div>
          <div>Technology: {usingNativeHls ? "HLS Natif" : "HLS.js"}</div>
          {debugInfo.lastError && (
            <div style={{ color: "#ff9800", marginTop: "8px" }}>
              Last HLS error: {debugInfo.lastError}
            </div>
          )}
          {debugInfo.lastVideoError && (
            <div style={{ color: "#ff9800", marginTop: "8px" }}>
              Last video error: {debugInfo.lastVideoError}
            </div>
          )}
        </div>
      </div>

      {/* Logs */}
      <div>
        <div style={{ color: "#fff", fontWeight: "bold", marginBottom: "8px" }}>Logs:</div>
        <div style={{ 
          background: "rgba(0, 0, 0, 0.3)", 
          padding: "12px", 
          borderRadius: "4px", 
          fontFamily: "monospace", 
          fontSize: "11px",
          color: "rgba(255, 255, 255, 0.8)",
          maxHeight: "200px",
          overflowY: "auto"
        }}>
          {debugInfo.logs.length > 0 ? (
            debugInfo.logs.map((log, index) => (
              <div key={index} style={{ marginBottom: "2px" }}>
                {log}
              </div>
            ))
          ) : (
            <div style={{ color: "rgba(255, 255, 255, 0.5)" }}>Aucun log pour le moment...</div>
          )}
        </div>
      </div>
    </div>
  );
}
