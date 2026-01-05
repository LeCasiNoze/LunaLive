import type { ApiMyStreamer } from "../../../lib/api";

export function LunaBotSection({ streamer }: { streamer: ApiMyStreamer }) {
  return (
    <div className="panel">
      <div className="panelTitle" style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <span>LunaBot</span>
        <span style={{ opacity: 0.7, fontSize: 12, fontWeight: 800 }}>
          @{streamer.slug}
        </span>
      </div>

      <div className="muted" style={{ marginTop: 10 }}>
        Ici on va brancher la gestion :
        <br />• Commandes personnalisées (offline OK)
        <br />• Auto-messages (live-only)
        <br />• Logs / événements bot
      </div>

      <div style={{ marginTop: 12 }} className="hint">
        ✅ Prochaine étape : endpoints API <code>/me/bot/*</code> + UI (Commands/Autoposts/Logs).
      </div>
    </div>
  );
}
