// web/src/pages/debug/RumbleDebugPage.tsx
// Page debug isolée pour tester la lecture HLS Rumble

import RumblePlayer from "../../components/RumblePlayer";

// URL de test Rumble HLS fournie par l'utilisateur
const RUMBLE_TEST_URL = "https://1a-1791.com/live/mu10xuf3/live-hls/nlxl-3xcw/chunklist_i1.m3u8";

export default function RumbleDebugPage() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
      padding: "20px"
    }}>
      {/* Marqueur visuel pour confirmer la bonne page */}
      <div style={{
        background: "rgba(255, 165, 0, 0.2)",
        border: "2px solid #ffa500",
        borderRadius: "8px",
        padding: "16px",
        marginBottom: "20px",
        textAlign: "center"
      }}>
        <div style={{
          color: "#ffa500",
          fontSize: "24px",
          fontWeight: "bold",
          marginBottom: "8px"
        }}>
          RUMBLE DEBUG PAGE ACTIVE
        </div>
        <div style={{
          color: "rgba(255, 255, 255, 0.8)",
          fontSize: "14px"
        }}>
          POC HLS Rumble - Test de lecture dans le navigateur
        </div>
      </div>

      {/* Player Rumble */}
      <RumblePlayer hlsUrl={RUMBLE_TEST_URL} />

      {/* Instructions */}
      <div style={{
        background: "rgba(255, 255, 255, 0.1)",
        border: "1px solid rgba(255, 255, 255, 0.2)",
        borderRadius: "8px",
        padding: "20px",
        marginTop: "20px",
        color: "rgba(255, 255, 255, 0.8)"
      }}>
        <h3 style={{ color: "#fff", marginBottom: "12px" }}>Instructions de test:</h3>
        <ul style={{ margin: 0, paddingLeft: "20px" }}>
          <li>Ouvrez la console du navigateur (F12)</li>
          <li>Surveillez les logs avec le préfixe <code>[rumble-player]</code></li>
          <li>Vérifiez l'onglet Network pour les requêtes HLS</li>
          <li>Le player devrait auto-charger le flux au chargement de la page</li>
          <li>Utilisez "Reload Stream" pour relancer si nécessaire</li>
        </ul>
        
        <div style={{ marginTop: "16px", fontSize: "12px", color: "rgba(255, 255, 255, 0.6)" }}>
          <strong>URL testée:</strong> {RUMBLE_TEST_URL}
        </div>
      </div>
    </div>
  );
}
