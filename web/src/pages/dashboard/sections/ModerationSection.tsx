import type { ApiMyStreamer } from "../../../lib/api";

export function ModerationSection({ streamer }: { streamer: ApiMyStreamer }) {
  return (
    <div className="panel">
      <div className="panelTitle">Modération</div>
      <div className="muted">
        Ici on mettra :
        <ul>
          <li>Liste des modérateurs (ajouter/retirer)</li>
          <li>Banlist + unban</li>
          <li>Timeouts actifs + untimeout</li>
          <li>Règles chat (slow mode, mots interdits, etc.)</li>
        </ul>
      </div>
      <div className="muted">Chaîne : @{streamer.slug}</div>
    </div>
  );
}
