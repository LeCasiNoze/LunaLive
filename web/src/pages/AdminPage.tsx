import * as React from "react";
import {
  adminListRequests,
  adminApproveRequest,
  adminRejectRequest,
  adminCreateStreamer,
  adminDeleteStreamer,
  getStreamers,
} from "../lib/api";
import { UsersAdminSection } from "../components/admin/UsersAdminSection";
import { ProviderAccountsAdminSection } from "../components/admin/ProviderAccountsAdminSection";
import { RubisMintAdminSection } from "../components/admin/RubisMintAdminSection";

const SS_KEY = "lunalive_admin_key_v1";

function loadAdminKey() {
  try {
    return sessionStorage.getItem(SS_KEY) || "";
  } catch {
    return "";
  }
}
function saveAdminKey(k: string) {
  try {
    sessionStorage.setItem(SS_KEY, k);
  } catch {}
}

export default function AdminPage() {
  const [key, setKey] = React.useState(() => loadAdminKey());
  const [input, setInput] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);

  const [requests, setRequests] = React.useState<any[]>([]);
  const [streamers, setStreamers] = React.useState<any[]>([]);

  const [newSlug, setNewSlug] = React.useState("");
  const [newName, setNewName] = React.useState("");

  async function refresh() {
    const r = await adminListRequests(key);
    setRequests(r.requests);
    const s = await getStreamers();
    setStreamers(s);
  }

  React.useEffect(() => {
    if (!key) return;
    refresh().catch((e) => setErr(String(e?.message || e)));
  }, [key]);

  async function onLogin() {
    setErr(null);
    const k = input.trim();
    if (!k) return;
    try {
      await adminListRequests(k);
      setKey(k);
      saveAdminKey(k);
    } catch (e: any) {
      setErr("Mot de passe incorrect");
    }
  }

  if (!key) {
    return (
      <main className="container">
        <div className="pageTitle">
          <h1>Admin</h1>
          <p className="muted">Accès protégé</p>
        </div>

        <div className="panel">
          <div className="panelTitle">Mot de passe</div>
          <div className="field">
            <label>Admin key</label>
            <input type="password" value={input} onChange={(e) => setInput(e.target.value)} />
          </div>
          {err && <div className="hint">⚠️ {err}</div>}
          <button className="btnPrimary" onClick={onLogin}>
            Entrer
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <div className="pageTitle">
        <h1>Admin</h1>
        <p className="muted">Demandes streamer + gestion streamers</p>
      </div>

      <div className="panel">
        <div className="panelTitle">Demandes “Devenir streamer”</div>
        <div className="muted" style={{ marginBottom: 10 }}>
          Clique Approve / Reject.
        </div>

        {requests.map((r) => (
          <div
            key={r.id}
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              padding: "10px 0",
              borderTop: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div style={{ flex: 1 }}>
              <b>{r.username}</b> — <span className="mutedSmall">{r.status}</span>
            </div>
            <button
              className="btnGhostSmall"
              onClick={async () => {
                await adminApproveRequest(key, r.id);
                await refresh();
              }}
            >
              Approve
            </button>
            <button
              className="btnGhostSmall"
              onClick={async () => {
                await adminRejectRequest(key, r.id);
                await refresh();
              }}
            >
              Reject
            </button>
          </div>
        ))}
        {!requests.length && <div className="mutedSmall">Aucune demande</div>}
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panelTitle">Créer un streamer</div>

        <div className="field">
          <label>Slug</label>
          <input value={newSlug} onChange={(e) => setNewSlug(e.target.value)} placeholder="ex: wayzebi" />
        </div>
        <div className="field">
          <label>Display name</label>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="ex: Wayzebi" />
        </div>

        <button
          className="btnPrimary"
          onClick={async () => {
            await adminCreateStreamer(key, newSlug, newName);
            setNewSlug("");
            setNewName("");
            await refresh();
          }}
        >
          Créer
        </button>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panelTitle">Streamers</div>

        {streamers.map((s) => (
          <div
            key={s.id}
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              padding: "10px 0",
              borderTop: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div style={{ flex: 1 }}>
              <b>{s.displayName}</b> <span className="mutedSmall">({s.slug})</span>
            </div>
            <button
              className="btnGhostSmall"
              onClick={async () => {
                await adminDeleteStreamer(key, s.slug);
                await refresh();
              }}
            >
              Supprimer
            </button>
          </div>
        ))}

        <UsersAdminSection adminKey={key} />
        <ProviderAccountsAdminSection adminKey={key} />
      </div>

      {/* ✅ NEW: mint rubis */}
      <RubisMintAdminSection adminKey={key} />
    </main>
  );
}
