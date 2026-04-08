// web/src/components/RumbleStreamPlayer.tsx
// Player Rumble pour la page streamer de LeCasiNoze

import * as React from "react";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");
const HLS_BASE = (import.meta.env.VITE_HLS_BASE ?? API_BASE).replace(/\/$/, "");

function toProxiedHls(url: string): string {
  return `${HLS_BASE}/hls?u=${encodeURIComponent(url)}`;
}

export type RumbleStreamPlayerProps = {
  hlsUrl?: string | null;
  thumbnailUrl?: string | null;
  title?: string | null;
  isLive?: boolean;
};

type PlayerState = "idle" | "loading" | "playing" | "paused" | "ended" | "error";

export default function RumbleStreamPlayer({ 
  hlsUrl, 
  thumbnailUrl, 
  title, 
  isLive 
}: RumbleStreamPlayerProps) {
  const [playerState, setPlayerState] = React.useState<PlayerState>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [usingNativeHls, setUsingNativeHls] = React.useState(false);
  const [debugInfo, setDebugInfo] = React.useState({
    nativeSupport: false,
    hlsSupported: false,
    manifestLoaded: false,
    mediaAttached: false,
    lastError: null as string | null
  });

  const videoRef = React.useRef<HTMLVideoElement>(null);
  const hlsRef = React.useRef<any>(null);

  const addLog = (message: string) => {
    console.log(`[rumble-stream-player] ${message}`);
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
        setDebugInfo(prev => ({ ...prev, lastError: errorMsg }));
        reject(new Error(errorMsg));
      };

      // Ajouter les événements
      video.addEventListener("loadedmetadata", handleLoadedMetadata);
      video.addEventListener("canplay", handleCanPlay);
      video.addEventListener("playing", handlePlaying);
      video.addEventListener("pause", handlePause);
      video.addEventListener("ended", handleEnded);
      video.addEventListener("error", handleError);

      // Cleanup function
      return () => {
        video.removeEventListener("loadedmetadata", handleLoadedMetadata);
        video.removeEventListener("canplay", handleCanPlay);
        video.removeEventListener("playing", handlePlaying);
        video.removeEventListener("pause", handlePause);
        video.removeEventListener("ended", handleEnded);
        video.removeEventListener("error", handleError);
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
      setDebugInfo(prev => ({ ...prev, lastError: errorMsg }));
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

      // Configuration des événements HLS.js
      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        addLog("HLS event: MEDIA_ATTACHED");
        setDebugInfo(prev => ({ ...prev, mediaAttached: true }));
      });

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        addLog(`HLS event: MANIFEST_PARSED - ${data.levels?.length || 0} levels available`);
        setDebugInfo(prev => ({ ...prev, manifestLoaded: true }));
        setPlayerState("loading");
        attemptPlay(video);
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

  // Initialisation du player
  React.useEffect(() => {
    if (!isLive || !hlsUrl) {
      setPlayerState("idle");
      return;
    }

    const video = videoRef.current;
    if (!video) {
      setPlayerState("error");
      setError("Élément vidéo non trouvé");
      return;
    }

    addLog(`Initializing Rumble stream player: ${title || 'Live Rumble'}`);
    setPlayerState("loading");
    setError(null);

    // Passer par le proxy HLS pour éviter les CORS (même logique que DlivePlayer)
    const proxiedUrl = toProxiedHls(hlsUrl);
    addLog(`Using proxied HLS: ${proxiedUrl}`);

    initHlsPlayer(proxiedUrl, video);

    // Cleanup
    return () => {
      cleanupPlayer();
    };
  }, [isLive, hlsUrl, title]);

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
      case "idle": return "En attente";
      case "loading": return "Chargement...";
      case "playing": return "Lecture en cours";
      case "paused": return "En pause";
      case "ended": return "Terminé";
      case "error": return "Erreur";
      default: return "Inconnu";
    }
  };

  if (!isLive) {
    return (
      <div style={{
        width: "100%",
        height: "450px",
        background: "#000",
        borderRadius: "8px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative"
      }}>
        {thumbnailUrl && (
          <img
            src={thumbnailUrl}
            alt="Stream offline"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              borderRadius: "8px",
              opacity: 0.7
            }}
          />
        )}
        <div style={{
          position: "absolute",
          color: "#fff",
          fontSize: "18px",
          fontWeight: "bold",
          textAlign: "center",
          textShadow: "2px 2px 4px rgba(0,0,0,0.8)"
        }}>
          Stream Offline
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%" }}>
      {/* Header avec titre et statut */}
      <div style={{ marginBottom: "16px", textAlign: "center" }}>
        <div style={{ 
          color: "#fff", 
          fontSize: "20px", 
          fontWeight: "bold", 
          marginBottom: "8px" 
        }}>
          {title || "Live Rumble"}
        </div>
        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "center", 
          gap: "8px" 
        }}>
          <div style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: playerState === "playing" ? "#4caf50" : getStatusColor(),
            animation: playerState === "playing" ? "pulse 2s infinite" : "none"
          }} />
          <span style={{ 
            color: getStatusColor(), 
            fontSize: "14px" 
          }}>
            {getStatusText()}
          </span>
          <span style={{ 
            color: "rgba(255, 255, 255, 0.7)", 
            fontSize: "12px" 
          }}>
            Rumble
          </span>
        </div>
      </div>

      {/* Élément vidéo */}
      <div style={{ position: "relative" }}>
        <video
          ref={videoRef}
          style={{
            width: "100%",
            height: "450px",
            background: "#000",
            borderRadius: "8px",
            border: "1px solid rgba(255, 255, 255, 0.2)"
          }}
          controls
          playsInline
          muted={false}
          poster={thumbnailUrl || undefined}
        />
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
          fontSize: "14px",
          textAlign: "center"
        }}>
          <strong>Erreur:</strong> {error}
        </div>
      )}

      {/* Debug info (optionnel) */}
      {import.meta.env.DEV && (
        <div style={{ 
          marginTop: "16px", 
          background: "rgba(0, 0, 0, 0.3)", 
          padding: "12px", 
          borderRadius: "4px", 
          fontSize: "12px",
          color: "rgba(255, 255, 255, 0.8)"
        }}>
          <div>Provider: Rumble</div>
          <div>Technology: {usingNativeHls ? "HLS Natif" : "HLS.js"}</div>
          <div>Native support: {debugInfo.nativeSupport ? "YES" : "NO"}</div>
          <div>Manifest loaded: {debugInfo.manifestLoaded ? "YES" : "NO"}</div>
          {debugInfo.lastError && (
            <div style={{ color: "#ff9800", marginTop: "8px" }}>
              Last error: {debugInfo.lastError}
            </div>
          )}
        </div>
      )}

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
