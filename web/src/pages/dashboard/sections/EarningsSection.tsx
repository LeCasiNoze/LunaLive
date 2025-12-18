import type { ApiMyStreamer } from "../../../lib/api";

export function EarningsSection({ streamer }: { streamer: ApiMyStreamer }) {
  return (
    <div className="panel">
      <div className="panelTitle">Revenus</div>
      <div className="muted">
        Ici on mettra la partie revenus liés à LunaLive (subs, dons, etc.) quand on définira le modèle.
      </div>
      <div className="muted">Chaîne : @{streamer.slug}</div>
    </div>
  );
}
