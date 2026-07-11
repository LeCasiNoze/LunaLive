import * as React from "react";
import { Check, Radio, Save } from "lucide-react";
import type { ApiMyStreamer } from "../../lib/api";

export function TitleEditorCard({ streamer, onSave }: { streamer: ApiMyStreamer; onSave: (title: string) => Promise<void> }) {
  const [title, setTitle] = React.useState(streamer.title || "");
  const [busy, setBusy] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  React.useEffect(() => setTitle(streamer.title || ""), [streamer.title]);
  const dirty = title.trim() !== (streamer.title || "").trim();

  async function submit() {
    if (!dirty || !title.trim()) return;
    setBusy(true); setErr(null); setSaved(false);
    try { await onSave(title.trim()); setSaved(true); window.setTimeout(() => setSaved(false), 2200); }
    catch (e: any) { setErr(String(e?.message || "Impossible d’enregistrer le titre")); }
    finally { setBusy(false); }
  }

  return <section className="streamSetupCard streamTitleCard">
    <div className="streamCardHead">
      <div className={`streamCardIcon ${streamer.isLive ? "isLive" : ""}`}><Radio size={20}/></div>
      <div><span>ÉTAPE 1</span><h3>Prépare ton direct</h3><p>Ce titre sera visible par tous les spectateurs.</p></div>
      <div className={`streamLiveBadge ${streamer.isLive ? "isLive" : ""}`}>{streamer.isLive ? `● LIVE · ${(streamer.viewers ?? 0).toLocaleString("fr-FR")} viewers` : "Hors ligne"}</div>
    </div>
    <label className="streamTitleLabel" htmlFor="stream-title">Titre du stream</label>
    <div className="streamTitleInput"><input id="stream-title" value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === "Enter") submit(); }} placeholder="Ex : Bonus Hunt — objectif x1000" maxLength={140}/><span>{title.length}/140</span></div>
    <div className="streamCardFooter">
      <p>{dirty ? "Modifications non enregistrées" : saved ? "Titre mis à jour" : "Ton titre est à jour"}</p>
      <button className="streamSaveButton" onClick={submit} disabled={busy || !dirty || !title.trim()}>{saved ? <Check size={17}/> : <Save size={17}/>} {busy ? "Enregistrement…" : saved ? "Enregistré" : "Enregistrer le titre"}</button>
    </div>
    {err && <div className="dashNotice dashNotice--error">{err}</div>}
  </section>;
}
