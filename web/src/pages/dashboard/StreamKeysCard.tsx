import * as React from "react";
import type { ApiStreamConnection } from "../../lib/api";

function maskKey(key: string) {
  if (!key) return "";
  if (key.length <= 6) return "••••••";
  return "•".repeat(Math.min(24, key.length));
}

async function copyText(v: string) {
  try {
    await navigator.clipboard.writeText(v);
    return true;
  } catch {
    try {
      window.prompt("Copie / colle :", v);
      return true;
    } catch {
      return false;
    }
  }
}

export function StreamKeysCard({
  connection,
}: {
  connection: ApiStreamConnection | null;
}) {
  const [show, setShow] = React.useState(false);
  const [hint, setHint] = React.useState<string | null>(null);

  async function onCopy(v: string) {
    const ok = await copyText(v);
    setHint(ok ? "Copié" : "Impossible de copier");
    window.setTimeout(() => setHint(null), 1200);
  }

  return (
    <div className="panel">
      <div className="panelTitle">Clés de stream</div>

      {!connection ? (
        <div className="muted">
          Aucune plateforme de stream configurée pour l'instant.
        </div>
      ) : (
        <>
          {connection.enabled === false ? (
            <div className="hint">Cette connexion est actuellement désactivée.</div>
          ) : null}

          <div className="field">
            <label htmlFor="dashboard-stream-provider">Plateforme</label>
            <input id="dashboard-stream-provider" value={connection.provider === "dlive" ? "DLive" : "Rumble"} readOnly />
          </div>

          <div className="field">
            <label htmlFor="dashboard-rtmp-url">URL RTMP</label>
            <input id="dashboard-rtmp-url" value={connection.rtmpUrl} readOnly />
            <button className="btnGhost" onClick={() => onCopy(connection.rtmpUrl)}>Copier l'URL</button>
          </div>

          <div className="field">
            <label htmlFor="dashboard-stream-key">Clé de stream</label>
            <input id="dashboard-stream-key" value={show ? connection.streamKey : maskKey(connection.streamKey)} readOnly />
            <div className="studio-secret-actions">
              <button className="btnGhost" onClick={() => setShow((v) => !v)}>
                {show ? "Masquer" : "Afficher"}
              </button>
              <button className="btnGhost" onClick={() => onCopy(connection.streamKey)}>Copier la clé</button>
            </div>
          </div>

          {hint && <div className="hint" role="status">{hint}</div>}
        </>
      )}
    </div>
  );
}
