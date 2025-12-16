import * as React from "react";
import type { ApiMyStreamer } from "../../lib/api";

export function TitleEditorCard({
  streamer,
  onSave,
}: {
  streamer: ApiMyStreamer;
  onSave: (title: string) => Promise<void>;
}) {
  const [title, setTitle] = React.useState(streamer.title || "");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => setTitle(streamer.title || ""), [streamer.title]);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await onSave(title);
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <div className="panelTitle">En direct</div>

      <div className="muted" style={{ marginBottom: 10 }}>
        Statut : <b>{streamer.isLive ? "LIVE" : "OFFLINE"}</b>
        {"  "}— viewers : <b>{(streamer.viewers ?? 0).toLocaleString("fr-FR")}</b>
      </div>

      <div className="field">
        <label>Titre (MVP)</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex: Bonus hunt — chill session"
          maxLength={140}
        />
      </div>

      {err && <div className="hint" style={{ opacity: 0.9 }}>⚠️ {err}</div>}

      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
        <button className="btnPrimary" onClick={submit} disabled={busy}>
          {busy ? "…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
