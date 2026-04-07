// web/src/components/RumbleStaticPlayer.tsx
// Player V1 pour LeCasiNoze - affiche le contenu Rumble statique

import * as React from "react";

export type RumbleStaticPlayerProps = {
  staticVideoUrl: string;
  title?: string | null;
  isLive?: boolean;
};

export default function RumbleStaticPlayer({ 
  staticVideoUrl, 
  title, 
  isLive 
}: RumbleStaticPlayerProps) {
  const [error, setError] = React.useState<string | null>(null);

  const addLog = (message: string) => {
    console.log(`[rumble-static-player] ${message}`);
  };

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
            background: isLive ? "#4caf50" : "#666",
            animation: isLive ? "pulse 2s infinite" : "none"
          }} />
          <span style={{ 
            color: isLive ? "#4caf50" : "#666", 
            fontSize: "14px" 
          }}>
            {isLive ? "LIVE" : "OFFLINE"}
          </span>
          <span style={{ 
            color: "rgba(255, 255, 255, 0.7)", 
            fontSize: "12px" 
          }}>
            Rumble
          </span>
        </div>
      </div>

      {/* Iframe Rumble statique */}
      <div style={{ position: "relative", width: "100%", height: "450px" }}>
        {isLive ? (
          <iframe
            src={staticVideoUrl}
            style={{
              width: "100%",
              height: "100%",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              borderRadius: "8px",
              background: "#000"
            }}
            allowFullScreen
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            onLoad={() => {
              addLog("Iframe loaded successfully");
              setError(null);
            }}
            onError={() => {
              addLog("Iframe failed to load");
              setError("Erreur de chargement du player Rumble");
            }}
          />
        ) : (
          <div style={{
            width: "100%",
            height: "450px",
            background: "#000",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: "18px",
            fontWeight: "bold"
          }}>
            Stream Offline
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
          fontSize: "14px",
          textAlign: "center"
        }}>
          <strong>Erreur:</strong> {error}
        </div>
      )}

      {/* Debug info */}
      {import.meta.env.DEV && (
        <div style={{ 
          marginTop: "16px", 
          background: "rgba(0, 0, 0, 0.3)", 
          padding: "12px", 
          borderRadius: "4px", 
          fontSize: "12px",
          color: "rgba(255, 255, 255, 0.8)"
        }}>
          <div>Provider: Rumble (Static)</div>
          <div>Static URL: {staticVideoUrl}</div>
          <div>Title: {title || "N/A"}</div>
          <div>Live Status: {isLive ? "LIVE" : "OFFLINE"}</div>
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
