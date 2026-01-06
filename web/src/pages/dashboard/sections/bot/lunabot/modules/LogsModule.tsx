import * as React from "react";
import { clearMyBotLogs, type ApiBotLogRow } from "../api";

export function LogsModule({
  token,
  logs,
  onReload,
}: {
  token: string;
  logs: ApiBotLogRow[];
  onReload: () => Promise<void>;
}) {
  return (
    <div className="panel" style={{ padding: 14, borderRadius: 18 }}>
      <div
        className="panelTitle"
        style={{ display: "flex", justifyContent: "space-between", gap: 10 }}
      >
        <span>Logs</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btnGhostInline" onClick={onReload}>
            Rafraîchir
          </button>
          <button
            className="btnGhostInline"
            onClick={async () => {
              await clearMyBotLogs(token);
              await onReload();
            }}
          >
            Clear
          </button>
        </div>
      </div>

      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
        {logs.length === 0 ? (
          <div className="muted">Aucun log.</div>
        ) : (
          logs.map((l) => (
            <div key={l.id} className="muted" style={{ fontSize: 12, opacity: 0.9 }}>
              <b style={{ opacity: 0.9 }}>{String(l.level).toUpperCase()}</b> — {l.message}{" "}
              <span style={{ opacity: 0.6 }}>
                ({new Date(l.createdAt).toLocaleString()})
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
