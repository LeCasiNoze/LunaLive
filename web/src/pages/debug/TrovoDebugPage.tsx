// web/src/pages/debug/TrovoDebugPage.tsx
// Page debug isolée pour tester l'intégration Trovo

import * as React from "react";
import { useState } from "react";
import TrovoPlayer from "../../components/TrovoPlayer";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

type TrovoDebugInfo = {
  ok: boolean;
  spaceName: string;
  isLive: boolean;
  title: string | null;
  channelId: number | null;
  roomId: number | null;
  sourceWidth: number | null;
  sourceHeight: number | null;
  defaultLevelType: number | null;
  isAdaptiveBitrate: boolean | null;
  isLhlsStream: boolean | null;
  qualities: Array<{
    desc: string | null;
    levelType: number | null;
    bitrate: number | null;
    playUrl: string | null;
    playTimeShiftUrl: string | null;
  }>;
  bestPlayUrl: string | null;
  bestTimeShiftUrl: string | null;
  rawAvailable: boolean;
  notes: string[];
};

export default function TrovoDebugPage() {
  const [spaceName, setSpaceName] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TrovoDebugInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sampleSpaceNames = [
    "d1ckpik0vaya_dama",
    "luna_test",
    "test_stream"
  ];

  const loadTrovoInfo = async (name: string) => {
    if (!name.trim()) {
      setError("Veuillez saisir un spaceName");
      return;
    }

    setLoading(true);
    setError(null);
    setData(null);

    try {
      console.log(`[trovo-debug] Loading info for: ${name}`);
      const response = await fetch(`${API_BASE}/api/debug/trovo/${encodeURIComponent(name.trim())}`);
      const result = await response.json() as TrovoDebugInfo;
      
      console.log(`[trovo-debug] Response:`, result);
      
      if (!response.ok) {
        throw new Error(result.notes?.join(", ") || "Erreur serveur");
      }
      
      setData(result);
    } catch (err) {
      const errorMessage = (err as Error).message;
      setError(errorMessage);
      console.error(`[trovo-debug] Error:`, errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadTrovoInfo(spaceName);
  };

  const loadSample = () => {
    const sample = sampleSpaceNames[0];
    setSpaceName(sample);
    loadTrovoInfo(sample);
  };

  return (
    <div style={{ 
      padding: "20px", 
      maxWidth: "1200px", 
      margin: "0 auto",
      fontFamily: "system-ui, -apple-system, sans-serif"
    }}>
      {/* MARQUEUR VISUEL IMPOSSIBLE À RATÉ */}
      <div style={{
        background: "linear-gradient(135deg, #e91e63, #9c27b0)",
        border: "3px solid #ffeb3b",
        borderRadius: "12px",
        padding: "20px",
        marginBottom: "20px",
        textAlign: "center",
        boxShadow: "0 4px 20px rgba(233, 30, 99, 0.5)",
        animation: "pulse 2s infinite"
      }}>
        <h1 style={{
          margin: "0 0 8px 0",
          color: "#fff",
          fontSize: "28px",
          fontWeight: "bold",
          textShadow: "2px 2px 4px rgba(0,0,0,0.5)"
        }}>
          TROVO DEBUG PAGE ACTIVE
        </h1>
        <p style={{
          margin: "0",
          color: "#ffeb3b",
          fontSize: "16px",
          fontWeight: "bold"
        }}>
          Build contains Trovo debug route
        </p>
        <button
          onClick={() => alert("Trovo Debug Ping - Route active!")}
          style={{
            marginTop: "12px",
            padding: "8px 16px",
            borderRadius: "6px",
            border: "2px solid #fff",
            background: "rgba(255, 255, 255, 0.2)",
            color: "#fff",
            fontSize: "14px",
            fontWeight: "bold",
            cursor: "pointer"
          }}
        >
          Trovo Debug Ping
        </button>
      </div>

      <div style={{
        background: "rgba(124, 92, 252, 0.1)",
        border: "1px solid rgba(124, 92, 252, 0.3)",
        borderRadius: "12px",
        padding: "20px",
        marginBottom: "20px"
      }}>
        <h1 style={{ margin: "0 0 16px 0", color: "#fff" }}>Trovo Debug Page</h1>
        <p style={{ margin: "0", color: "rgba(255, 255, 255, 0.8)" }}>
          Page de test isolée pour l'intégration Trovo dans LunaLive
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ marginBottom: "20px" }}>
        <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: "200px" }}>
            <label style={{ display: "block", marginBottom: "4px", color: "#fff" }}>
              SpaceName Trovo:
            </label>
            <input
              type="text"
              value={spaceName}
              onChange={(e) => setSpaceName(e.target.value)}
              placeholder="ex: d1ckpik0vaya_dama"
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1px solid rgba(124, 92, 252, 0.3)",
                background: "rgba(0, 0, 0, 0.3)",
                color: "#fff",
                fontSize: "14px"
              }}
            />
          </div>
          
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "1px solid rgba(124, 92, 252, 0.5)",
              background: loading ? "rgba(124, 92, 252, 0.3)" : "rgba(124, 92, 252, 0.6)",
              color: "#fff",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: "14px"
            }}
          >
            {loading ? "Loading..." : "Load"}
          </button>
          
          <button
            type="button"
            onClick={loadSample}
            disabled={loading}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "1px solid rgba(76, 175, 80, 0.5)",
              background: loading ? "rgba(76, 175, 80, 0.3)" : "rgba(76, 175, 80, 0.6)",
              color: "#fff",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: "14px"
            }}
          >
            Load Sample
          </button>
        </div>
      </form>

      {error && (
        <div style={{
          background: "rgba(244, 67, 54, 0.2)",
          border: "1px solid rgba(244, 67, 54, 0.5)",
          borderRadius: "8px",
          padding: "12px",
          marginBottom: "20px",
          color: "#fff"
        }}>
          <strong>Erreur:</strong> {error}
        </div>
      )}

      {data && (
        <div style={{ display: "grid", gap: "20px" }}>
          {/* Métadonnées principales */}
          <div style={{
            background: "rgba(0, 0, 0, 0.3)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "8px",
            padding: "16px"
          }}>
            <h2 style={{ margin: "0 0 12px 0", color: "#fff" }}>Métadonnées</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
              <div><strong style={{ color: "#fff" }}>SpaceName:</strong> <span style={{ color: "rgba(255, 255, 255, 0.8)" }}>{data.spaceName}</span></div>
              <div><strong style={{ color: "#fff" }}>isLive:</strong> <span style={{ color: data.isLive ? "#4caf50" : "#f44336" }}>{data.isLive ? "OUI" : "NON"}</span></div>
              <div><strong style={{ color: "#fff" }}>Titre:</strong> <span style={{ color: "rgba(255, 255, 255, 0.8)" }}>{data.title || "N/A"}</span></div>
              <div><strong style={{ color: "#fff" }}>Channel ID:</strong> <span style={{ color: "rgba(255, 255, 255, 0.8)" }}>{data.channelId || "N/A"}</span></div>
              <div><strong style={{ color: "#fff" }}>Room ID:</strong> <span style={{ color: "rgba(255, 255, 255, 0.8)" }}>{data.roomId || "N/A"}</span></div>
              <div><strong style={{ color: "#fff" }}>Source:</strong> <span style={{ color: "rgba(255, 255, 255, 0.8)" }}>{data.sourceWidth}x{data.sourceHeight}</span></div>
              <div><strong style={{ color: "#fff" }}>Default Level:</strong> <span style={{ color: "rgba(255, 255, 255, 0.8)" }}>{data.defaultLevelType}</span></div>
              <div><strong style={{ color: "#fff" }}>Adaptive:</strong> <span style={{ color: "rgba(255, 255, 255, 0.8)" }}>{data.isAdaptiveBitrate ? "OUI" : "NON"}</span></div>
              <div><strong style={{ color: "#fff" }}>LHLS:</strong> <span style={{ color: "rgba(255, 255, 255, 0.8)" }}>{data.isLhlsStream ? "OUI" : "NON"}</span></div>
            </div>
          </div>

          {/* URLs de lecture */}
          <div style={{
            background: "rgba(0, 0, 0, 0.3)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "8px",
            padding: "16px"
          }}>
            <h2 style={{ margin: "0 0 12px 0", color: "#fff" }}>URLs de Lecture</h2>
            <div style={{ display: "grid", gap: "12px" }}>
              <div>
                <strong style={{ color: "#fff" }}>Best Play URL:</strong>
                <div style={{ 
                  wordBreak: "break-all", 
                  background: "rgba(0, 0, 0, 0.2)", 
                  padding: "8px", 
                  borderRadius: "4px",
                  marginTop: "4px",
                  fontSize: "12px",
                  color: "rgba(255, 255, 255, 0.8)"
                }}>
                  {data.bestPlayUrl || "N/A"}
                </div>
              </div>
              <div>
                <strong style={{ color: "#fff" }}>Best Timeshift URL:</strong>
                <div style={{ 
                  wordBreak: "break-all", 
                  background: "rgba(0, 0, 0, 0.2)", 
                  padding: "8px", 
                  borderRadius: "4px",
                  marginTop: "4px",
                  fontSize: "12px",
                  color: "rgba(255, 255, 255, 0.8)"
                }}>
                  {data.bestTimeShiftUrl || "N/A"}
                </div>
              </div>
            </div>
          </div>

          {/* Qualités disponibles */}
          <div style={{
            background: "rgba(0, 0, 0, 0.3)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "8px",
            padding: "16px"
          }}>
            <h2 style={{ margin: "0 0 12px 0", color: "#fff" }}>Qualités ({data.qualities.length})</h2>
            {data.qualities.length > 0 ? (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", color: "rgba(255, 255, 255, 0.8)" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.2)" }}>
                      <th style={{ padding: "8px", textAlign: "left" }}>Description</th>
                      <th style={{ padding: "8px", textAlign: "left" }}>Level</th>
                      <th style={{ padding: "8px", textAlign: "left" }}>Bitrate</th>
                      <th style={{ padding: "8px", textAlign: "left" }}>Play URL</th>
                      <th style={{ padding: "8px", textAlign: "left" }}>Timeshift URL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.qualities.map((quality, index) => (
                      <tr key={index} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.1)" }}>
                        <td style={{ padding: "8px" }}>{quality.desc}</td>
                        <td style={{ padding: "8px" }}>{quality.levelType}</td>
                        <td style={{ padding: "8px" }}>{quality.bitrate}</td>
                        <td style={{ padding: "8px", fontSize: "11px", wordBreak: "break-all" }}>
                          {quality.playUrl ? `${quality.playUrl.substring(0, 50)}...` : "N/A"}
                        </td>
                        <td style={{ padding: "8px", fontSize: "11px", wordBreak: "break-all" }}>
                          {quality.playTimeShiftUrl ? `${quality.playTimeShiftUrl.substring(0, 50)}...` : "N/A"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ color: "rgba(255, 255, 255, 0.6)" }}>Aucune qualité disponible</p>
            )}
          </div>

          {/* Notes */}
          {data.notes.length > 0 && (
            <div style={{
              background: "rgba(255, 193, 7, 0.1)",
              border: "1px solid rgba(255, 193, 7, 0.3)",
              borderRadius: "8px",
              padding: "16px"
            }}>
              <h2 style={{ margin: "0 0 12px 0", color: "#fff" }}>Notes</h2>
              <ul style={{ margin: 0, paddingLeft: "20px", color: "rgba(255, 255, 255, 0.8)" }}>
                {data.notes.map((note, index) => (
                  <li key={index}>{note}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Player de test */}
          {(data.bestPlayUrl || data.bestTimeShiftUrl) && (
            <div style={{
              background: "rgba(0, 0, 0, 0.3)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "8px",
              padding: "16px"
            }}>
              <h2 style={{ margin: "0 0 12px 0", color: "#fff" }}>Player de Test</h2>
              <React.Suspense fallback={<div style={{ color: "#fff" }}>Chargement du player...</div>}>
                <TrovoPlayer 
                  playUrl={data.bestPlayUrl}
                  timeShiftUrl={data.bestTimeShiftUrl}
                />
              </React.Suspense>
            </div>
          )}
        </div>
      )}

      {/* Style pour l'animation */}
      <style>{`
        @keyframes pulse {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.02); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

