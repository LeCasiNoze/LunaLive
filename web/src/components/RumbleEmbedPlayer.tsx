// web/src/components/RumbleEmbedPlayer.tsx
// Composant temporaire pour l'intégration Rumble de LeCasiNoze uniquement

import * as React from "react";

export type RumbleEmbedPlayerProps = {
  embedUrl: string;
  title?: string | null;
  isLive?: boolean;
};

export default function RumbleEmbedPlayer({ 
  embedUrl, 
  title, 
  isLive 
}: RumbleEmbedPlayerProps) {
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const handleLoad = React.useCallback(() => {
    setLoading(false);
    setError(null);
  }, []);

  const handleError = React.useCallback(() => {
    setError("Impossible de charger le lecteur Rumble");
    setLoading(false);
  }, []);

  return (
    <div 
      style={{ 
        position: "relative",
        width: "100%",
        aspectRatio: "16/9",
        background: "#000",
        borderRadius: "12px",
        overflow: "hidden",
        border: "1px solid rgba(124,92,252,.28)",
        boxShadow: "0 8px 24px rgba(124,92,252,.22)"
      }}
    >
      {/* Loader */}
      {loading && (
        <div style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(0,0,0,0.8)",
          zIndex: 1,
          color: "rgba(196,181,253,.90)",
          fontFamily: "'Syne',system-ui,sans-serif",
          fontSize: "14px"
        }}>
          Chargement du lecteur Rumble...
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(239,68,68,0.1)",
          zIndex: 2,
          color: "rgba(252,165,165,.90)",
          fontFamily: "'Syne',system-ui,sans-serif",
          fontSize: "14px",
          textAlign: "center",
          padding: "20px"
        }}>
          <div>
            <div style={{ marginBottom: "8px", fontSize: "16px", fontWeight: 600 }}>
              Erreur de chargement
            </div>
            <div>{error}</div>
          </div>
        </div>
      )}

      {/* Rumble embed iframe */}
      <iframe
        src={embedUrl}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          border: "none",
          borderRadius: "12px",
          background: "#000"
        }}
        onLoad={handleLoad}
        onError={handleError}
        allowFullScreen
        scrolling="no"
        frameBorder="0"
        title={title ? `Rumble Live - ${title}` : "Rumble Live"}
      />

      {/* Live indicator */}
      {isLive && !loading && !error && (
        <div style={{
          position: "absolute",
          top: "12px",
          left: "12px",
          background: "rgba(239,68,68,.90)",
          color: "#fff",
          padding: "4px 8px",
          borderRadius: "6px",
          fontSize: "11px",
          fontWeight: 700,
          fontFamily: "'Syne',system-ui,sans-serif",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          zIndex: 3,
          boxShadow: "0 2px 8px rgba(239,68,68,.40)"
        }}>
          <span style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: "#fff",
            animation: "pulse 2s ease-in-out infinite"
          }} />
          LIVE
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
