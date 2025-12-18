import type { ApiMyStreamer } from "../../../lib/api";

export function StatsSection({ streamer }: { streamer: ApiMyStreamer }) {
  return (
    <div className="panel">
      <div className="panelTitle">Stats</div>
      <div className="muted">
        MVP plus tard : peak viewers, watchtime, derniers lives, stats chat…
      </div>
      <div className="muted">Chaîne : @{streamer.slug}</div>
    </div>
  );
}
