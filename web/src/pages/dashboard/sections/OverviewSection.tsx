import { Link } from "react-router-dom";
import type { ApiMyStreamer, ApiStreamConnection } from "../../../lib/api";
import { DliveLinkPanel } from "./DliveLinkPanel";

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
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="panel">
        <div className="panelTitle">Résumé</div>

        <div style={{ display: "grid", gap: 8 }}>
          <div><b>Chaîne :</b> {streamer.displayName} (@{streamer.slug})</div>
          <div><b>Titre :</b> {streamer.title || <span className="muted">—</span>}</div>
          <div>
            <b>Statut :</b>{" "}
            {streamer.isLive ? (
              <span style={{ fontWeight: 900, color: "rgba(255,80,120,0.95)" }}>LIVE</span>
            ) : (
              <span className="muted" style={{ fontWeight: 900 }}>OFFLINE</span>
            )}{" "}
            <span className="muted">•</span>{" "}
            <b>Viewers :</b> {Number(streamer.viewers || 0).toLocaleString()}
          </div>
        </div>
        <DliveLinkPanel />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          <button className="btnGhostInline" onClick={onGoStream}>⚙️ Modifier titre / clés</button>
          <button className="btnGhostInline" onClick={onGoModeration}>🛡️ Gérer la modération</button>
          <Link className="btnGhostInline" to={`/s/${streamer.slug}`}>👀 Voir ma page</Link>
        </div>
      </div>

      <div className="panel">
        <div className="panelTitle">Connexion stream (RTMP)</div>
        {!connection ? (
          <div className="muted">Aucune connexion trouvée (compte provider non assigné ?)</div>
        ) : (
          <div className="muted">
            Provider : <b>{connection.provider}</b> — Channel : <b>{connection.channelSlug}</b>
          </div>
        )}
      </div>
    </div>
  );
}
