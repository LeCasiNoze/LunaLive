import * as React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

const API = (import.meta.env.VITE_API_BASE as string | undefined) ?? "https://lunalive-api.onrender.com";
type Call = { id: string; slotName: string; provider: string | null; pos: number };

export default function RumbleCallsManagePage() {
  const { token, user } = useAuth();
  const [calls, setCalls] = React.useState<Call[]>([]);
  const [linked, setLinked] = React.useState(false);
  const [rumbleUsername, setRumbleUsername] = React.useState("");
  const [code, setCode] = React.useState("");
  const [edits, setEdits] = React.useState<Record<string, string>>({});
  const [suggestions, setSuggestions] = React.useState<Record<string, Array<{ name: string; provider?: string | null }>>>({});
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState("");

  const request = React.useCallback(async (path: string, method = "GET", body?: unknown) => {
    const response = await fetch(`${API}/me/calls/rumble${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json.error || "Action impossible.");
    return json;
  }, [token]);

  const refresh = React.useCallback(async () => {
    if (!token) return;
    const result = await request("/");
    setLinked(!!result.linked);
    setRumbleUsername(result.rumbleUsername || "");
    setCalls(result.calls || []);
    setEdits(Object.fromEntries((result.calls || []).map((c: Call) => [c.id, c.slotName])));
  }, [request, token]);

  React.useEffect(() => { void refresh().catch((e) => setNotice(e.message)); }, [refresh]);
  const action = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setNotice("");
    try { await fn(); await refresh(); setNotice(ok); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Action impossible."); }
    finally { setBusy(false); }
  };
  const searchSlots = (id: string, query: string) => {
    setEdits((x) => ({ ...x, [id]: query }));
    if (query.trim().length < 2) { setSuggestions((x) => ({ ...x, [id]: [] })); return; }
    void fetch(`${API}/api/public/slots/search?q=${encodeURIComponent(query)}&limit=8`, { cache: "no-store" })
      .then((r) => r.json()).then((r) => setSuggestions((x) => ({ ...x, [id]: r.items || [] }))).catch(() => {});
  };

  if (!user) return <main style={page}><section style={card}><h1>Gérer mes calls Rumble</h1><p>Connecte-toi à LunaLive pour lier ton pseudo Rumble et gérer uniquement tes calls en attente.</p><Link to="/profile">Ouvrir mon compte LunaLive →</Link></section></main>;

  return <main style={page}><style>{`@media(max-width:640px){.rumble-call-row{grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important}.rumble-call-row>div:first-child{grid-column:1/-1}.rumble-call-row input{min-width:0;width:100%;box-sizing:border-box}.rumble-call-row button{min-height:42px}.rumble-call-card{padding:14px!important}}`}</style><section style={card}>
    <Link to="/" style={{ color: "#a5b4fc" }}>← LunaLive</Link>
    <p style={eyebrow}>ESPACE PERSONNEL · RUMBLE</p><h1>Mes calls</h1>
    <p style={{ color: "#b9c1d7", lineHeight: 1.6 }}>Liaison temporaire et vérifiée par commande Rumble. Tu peux uniquement modifier ou retirer tes propres calls encore en attente.</p>
    {!linked ? <div style={linkBox}>
      <h2>Lier ton pseudo Rumble</h2><p>Génère un code, puis poste la commande affichée dans le chat du live LeCasiNoze. Le code expire après 10 minutes.</p>
      {code ? <div style={codeBox}><strong>{code}</strong><code>!lier {code}</code><button disabled={busy} onClick={() => navigator.clipboard?.writeText(`!lier ${code}`)}>Copier la commande</button></div> : null}
      <button style={primary} disabled={busy} onClick={() => void action(async () => { const r = await request("/link-code", "POST"); setCode(r.code); }, "Code généré. Poste la commande dans le chat Rumble.")}>Générer mon code temporaire</button>
      <button disabled={busy} onClick={() => void refresh().catch((e) => setNotice(e.message))}>J’ai posté la commande · vérifier</button>
    </div> : <>
      <div style={linkBox}>Compte Rumble lié : <strong>@{rumbleUsername}</strong><button disabled={busy} onClick={() => void action(() => request("/link", "DELETE"), "Compte Rumble délié.")}>Délier</button></div>
      <h2>Calls en attente ({calls.length})</h2>
      {!calls.length ? <p>Aucun call en attente pour ce pseudo.</p> : calls.map((call) => <article key={call.id} className="rumble-call-row rumble-call-card" style={row}>
        <div style={{ minWidth: 0 }}><strong>#{call.pos} · {call.slotName}</strong><small>{call.provider || "Provider inconnu"}</small></div>
        <input aria-label={`Nouvelle machine pour ${call.slotName}`} list={`slots-${call.id}`} value={edits[call.id] ?? call.slotName} onChange={(e) => searchSlots(call.id, e.target.value)} />
        <datalist id={`slots-${call.id}`}>{(suggestions[call.id] || []).map((slot) => <option key={`${slot.provider}-${slot.name}`} value={slot.name}>{slot.provider}</option>)}</datalist>
        <button disabled={busy || !edits[call.id]?.trim()} onClick={() => void action(() => request(`/queue/${encodeURIComponent(call.id)}`, "PATCH", { slotName: edits[call.id] }), "Call modifié.")}>Modifier</button>
        <button style={danger} disabled={busy} onClick={() => void action(() => request(`/queue/${encodeURIComponent(call.id)}`, "DELETE"), "Call retiré de la file.")}>Retirer</button>
      </article>)}
    </>}
    {notice && <p role="status" style={{ color: notice.includes("impossible") ? "#fca5a5" : "#a7f3d0" }}>{notice}</p>}
  </section></main>;
}

const page: React.CSSProperties = { minHeight: "100vh", padding: "32px 16px", color: "#f8fafc", background: "radial-gradient(ellipse at top,#202449,#0b1020 64%)", fontFamily: "system-ui,sans-serif" };
const card: React.CSSProperties = { width: "min(880px,100%)", margin: "0 auto", padding: "clamp(20px,5vw,40px)", border: "1px solid #ffffff20", borderRadius: 24, background: "#11182beF", boxShadow: "0 24px 90px #0008" };
const eyebrow: React.CSSProperties = { marginTop: 28, color: "#a5b4fc", fontSize: 12, fontWeight: 800, letterSpacing: ".16em" };
const linkBox: React.CSSProperties = { display: "grid", gap: 12, padding: 20, marginTop: 20, borderRadius: 18, background: "#1b2340", border: "1px solid #8b5cf666" };
const codeBox: React.CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, padding: 16, borderRadius: 12, background: "#080d19" };
const row: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(140px,1fr) minmax(150px,1fr) auto auto", alignItems: "center", gap: 10, padding: 12, borderBottom: "1px solid #ffffff18" };
const primary: React.CSSProperties = { padding: "12px 18px", border: 0, borderRadius: 10, color: "white", fontWeight: 800, background: "linear-gradient(100deg,#7c3aed,#2563eb)" };
const danger: React.CSSProperties = { color: "#fecaca", borderColor: "#ef444455" };
