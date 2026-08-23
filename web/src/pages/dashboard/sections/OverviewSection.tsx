import { ArrowUpRight, Radio, Settings2, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import type { ApiMyStreamer, ApiStreamConnection } from "../../../lib/api";
import { RumbleLinkPanel } from "./RumbleLinkPanel";

function StatusBadge({ tone, children }: { tone: "live" | "ready" | "neutral"; children: React.ReactNode }) {
  return <span className={`studio-status-badge is-${tone}`}>{children}</span>;
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
  const connectionReady = Boolean(connection && connection.enabled !== false && connection.rtmpUrl && connection.streamKey);

  return (
    <div className="studio-overview">
      <section className="studio-overview-lead">
        <div className="studio-overview-copy">
          <div className="studio-section-kicker">Maintenant</div>
          <h2>{streamer.displayName}</h2>
          <p>{streamer.title || "Aucun titre de direct n'est encore defini."}</p>
          <div className="studio-overview-badges">
            <StatusBadge tone={streamer.isLive ? "live" : "neutral"}>{streamer.isLive ? "En direct" : "Hors ligne"}</StatusBadge>
            <StatusBadge tone={connectionReady ? "ready" : "neutral"}>{connectionReady ? "RTMP connecte" : "RTMP a configurer"}</StatusBadge>
          </div>
        </div>
        <div className="studio-live-number">
          <span>Audience actuelle</span>
          <strong>{Number(streamer.viewers || 0).toLocaleString("fr-FR")}</strong>
          <small>spectateurs</small>
        </div>
      </section>

      <section className="studio-action-grid" aria-label="Actions rapides">
        <button type="button" onClick={onGoStream}>
          <span className="studio-action-icon"><Radio size={20} /></span>
          <span><strong>Preparer le stream</strong><small>Titre, cle et connexion</small></span>
          <ArrowUpRight size={17} />
        </button>
        <button type="button" onClick={onGoModeration}>
          <span className="studio-action-icon"><ShieldCheck size={20} /></span>
          <span><strong>Gerer le chat</strong><small>Equipe et sanctions</small></span>
          <ArrowUpRight size={17} />
        </button>
        <Link to={`/s/${streamer.slug}`}>
          <span className="studio-action-icon"><Settings2 size={20} /></span>
          <span><strong>Voir la chaine</strong><small>Ouvrir la page publique</small></span>
          <ArrowUpRight size={17} />
        </Link>
      </section>

      <section className="studio-provider-block">
        <div className="studio-provider-heading">
          <div>
            <div className="studio-section-kicker">Source externe</div>
            <h3>Connexion Rumble</h3>
          </div>
          <p>Lie ta chaine pour synchroniser automatiquement le direct et ses informations.</p>
        </div>
        <RumbleLinkPanel />
      </section>
    </div>
  );
}
