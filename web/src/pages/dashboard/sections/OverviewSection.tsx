// web/src/components/dashboard/sections/OverviewSection.tsx
import * as React from "react";
import { Link } from "react-router-dom";
import type { ApiMyStreamer, ApiStreamConnection } from "../../../lib/api";
import { RumbleLinkPanel } from "./RumbleLinkPanel";

function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "pink" | "green" | "blue";
  children: React.ReactNode;
}) {
  const tones: Record<string, { bg: string; bd: string }> = {
    neutral: { bg: "rgba(255,255,255,0.06)", bd: "rgba(255,255,255,0.10)" },
    pink: { bg: "rgba(255,90,180,0.14)", bd: "rgba(255,90,180,0.26)" },
    green: { bg: "rgba(80,240,170,0.12)", bd: "rgba(80,240,170,0.22)" },
    blue: { bg: "rgba(80,160,255,0.14)", bd: "rgba(80,160,255,0.26)" },
  };
  const t = tones[tone] ?? tones.neutral;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 12px",
        borderRadius: 999,
        border: `1px solid ${t.bd}`,
        background: t.bg,
        fontWeight: 950,
        fontSize: 12,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export function OverviewSection({
  streamer,
  connection,
  onGoStream,
  onGoModeration,
}: {
  streamer: ApiMyStreamer;
  connection: ApiStreamConnection | null;
  onGoStream: () => void;
  onGoModeration: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <style>{`
        .llRowCard{
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.10);
          padding: 14px;
        }
        .llRowGrid{
          display:grid;
          grid-template-columns: 1.3fr 1fr;
          gap: 12px;
          align-items:start;
        }
        @media (max-width: 980px){
          .llRowGrid{ grid-template-columns: 1fr; }
        }
        .llKey{
          opacity: 0.72;
          font-weight: 900;
          font-size: 12px;
        }
        .llVal{
          font-weight: 950;
          margin-top: 2px;
        }
      `}</style>

      <div className="panel">
        <div className="panelTitle">Résumé</div>

        <div className="llRowCard" style={{ marginTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ minWidth: 260 }}>
              <div style={{ fontSize: 18, fontWeight: 1200, letterSpacing: -0.3 }}>
                {streamer.displayName} <span style={{ opacity: 0.7, fontWeight: 900 }}>@{streamer.slug}</span>
              </div>
              <div className="mutedSmall" style={{ marginTop: 6, maxWidth: 720 }}>
                {streamer.title || "—"}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <Badge tone={streamer.isLive ? "pink" : "neutral"}>
                {streamer.isLive ? "🔴 LIVE" : "⚫ OFFLINE"}
              </Badge>
              <Badge tone="blue">👀 {Number(streamer.viewers || 0).toLocaleString()} viewers</Badge>
              <Badge tone={connection ? "green" : "neutral"}>{connection ? "✅ RTMP OK" : "⚠️ RTMP ?"}</Badge>
            </div>
          </div>

          <div className="llRowGrid" style={{ marginTop: 12 }}>
            <div>
              <div className="llKey">Chaîne</div>
              <div className="llVal">{streamer.displayName}</div>
              <div className="mutedSmall" style={{ marginTop: 4 }}>
                URL : <span style={{ fontFamily: "monospace" }}>/s/{streamer.slug}</span>
              </div>
            </div>

            <div>
              <div className="llKey">Titre actuel</div>
              <div className="llVal" style={{ opacity: streamer.title ? 1 : 0.65 }}>
                {streamer.title || "—"}
              </div>
              <div className="mutedSmall" style={{ marginTop: 4 }}>
                (modifiable dans l’onglet Stream)
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
            <button className="btnPrimarySmall" onClick={onGoStream}>
              ⚙️ Stream
            </button>
            <button className="btnGhostSmall" onClick={onGoModeration}>
              🛡️ Modération
            </button>
            <Link className="btnGhostInline" to={`/s/${streamer.slug}`}>
              👀 Voir ma page
            </Link>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <RumbleLinkPanel />
        </div>
      </div>
    </div>
  );
}
