import type { ApiMyStreamer } from "../../../lib/api";

export function AppearanceSection({ streamer }: { streamer: ApiMyStreamer }) {
  return (
    <div className="panel">
      <div className="panelTitle">Apparence</div>
      <div className="muted">
        Ici : personnalisation du chat DLive (couleurs, badges, style pseudo, etc.) + branding chaîne.
        (On fera MVP simple, puis on branchera les cosmétiques rubis plus tard.)
      </div>
      <div className="muted">Chaîne : @{streamer.slug}</div>
    </div>
  );
}
