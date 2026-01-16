// web/src/components/dashboard/sections/SettingsSection.tsx
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

      <div
        style={{
          marginTop: 10,
          padding: 14,
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(0,0,0,0.12)",
        }}
      >
        <div className="mutedSmall">
          On verra plus tard ce qu’on met ici (sécurité, reset stream key, etc.).
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <button className="btnGhostSmall" onClick={onReload}>
            🔄 Recharger
          </button>
        </div>

        <div className="mutedSmall" style={{ marginTop: 10, opacity: 0.8 }}>
          Chaîne : <b>@{streamer.slug}</b>
        </div>
      </div>
    </div>
  );
}
