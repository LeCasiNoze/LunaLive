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
    setHint(ok ? "Copié ✅" : "Impossible de copier");
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
          <div className="field">
            <label>Plateforme</label>
            <input value={connection.provider === "dlive" ? "DLive" : "Rumble"} readOnly />
          </div>

          {connection.provider === "dlive" && (
            <div className="field">
              <label>Activer DLive</label>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="checkbox"
                  checked={connection.enabled !== false}
                  onChange={(e) => {
                    // TODO: Implémenter l'API pour activer/désactiver
                    console.log("Toggle DLive enabled:", e.target.checked);
                  }}
                />
                <span className="muted">
                  {connection.enabled !== false ? "DLive activé" : "DLive désactivé (utilisera Rumble)"}
                </span>
              </div>
            </div>
          )}

          <div className="field">
            <label>RTMP URL</label>
            <input value={connection.rtmpUrl} readOnly />
            <button className="btnGhost" onClick={() => onCopy(connection.rtmpUrl)}>
              Copier
            </button>
          </div>

          <div className="field">
            <label>Stream Key</label>
            <input value={show ? connection.streamKey : maskKey(connection.streamKey)} readOnly />
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button className="btnGhost" onClick={() => setShow((v) => !v)}>
                {show ? "Masquer" : "Afficher"}
              </button>
              <button className="btnGhost" onClick={() => onCopy(connection.streamKey)}>
                Copier
              </button>
            </div>
          </div>

          {hint && <div className="hint" style={{ opacity: 0.9 }}>{hint}</div>}
        </>
      )}
    </div>
  );
}
