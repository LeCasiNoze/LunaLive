import type { ApiMyStreamer } from "../../../lib/api";

export function SettingsSection({
  streamer,
  onReload,
}: {
  streamer: ApiMyStreamer;
  onReload: () => void;
}) {
  return (
    <div className="panel">
      <div className="panelTitle">Paramètres</div>
      <div className="muted">
        On verra plus tard ce qu’on met ici (sécurité, reset stream key, etc.).
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
        <button className="btnGhostInline" onClick={onReload}>
          🔄 Recharger
        </button>
      </div>

      <div className="muted" style={{ marginTop: 10 }}>Chaîne : @{streamer.slug}</div>
    </div>
  );
}
