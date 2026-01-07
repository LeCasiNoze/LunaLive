import * as React from "react";
import {
  adminListRequests,
  adminApproveRequest,
  adminRejectRequest,
  adminCreateStreamer,
  adminDeleteStreamer,
  getStreamers,
  adminSlotsUpdate,
  type AdminSlotsUpdateResp,
} from "../lib/api";
import { UsersAdminSection } from "../components/admin/UsersAdminSection";
import { ProviderAccountsAdminSection } from "../components/admin/ProviderAccountsAdminSection";
import { RubisMintAdminSection } from "../components/admin/RubisMintAdminSection";
import { CasinosAdminSection } from "../components/admin/CasinosAdminSection";

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
  const [showCasinos, setShowCasinos] = React.useState(false);

  // ✅ NEW: manual slots update
  const [slotsMode, setSlotsMode] = React.useState<"premium" | "free">("premium");
  const [slotsLoading, setSlotsLoading] = React.useState(false);
  const [slotsRes, setSlotsRes] = React.useState<AdminSlotsUpdateResp | null>(null);

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
    } catch {
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

      <button
        className="btnPrimary"
        style={{ marginBottom: 14 }}
        onClick={() => setShowCasinos((v) => !v)}
      >
        {showCasinos ? "Fermer gestion Casinos" : "Gérer Casinos (TrustPilot)"}
      </button>

      {showCasinos && <CasinosAdminSection adminKey={key} />}

      {/* ✅ NEW: Manual slots update */}
      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panelTitle">Slots — mise à jour manuelle</div>
        <div className="mutedSmall" style={{ marginBottom: 10 }}>
          Lance l’updater et retourne la liste des <b>nouvelles</b> machines trouvées, groupées par provider.
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="mutedSmall">Mode:</span>
            <button
              className="btnGhostSmall"
              onClick={() => setSlotsMode("premium")}
              style={{
                opacity: slotsMode === "premium" ? 1 : 0.65,
                border: slotsMode === "premium" ? "1px solid rgba(124,77,255,0.55)" : undefined,
              }}
              type="button"
            >
              premium
            </button>
            <button
              className="btnGhostSmall"
              onClick={() => setSlotsMode("free")}
              style={{
                opacity: slotsMode === "free" ? 1 : 0.65,
                border: slotsMode === "free" ? "1px solid rgba(124,77,255,0.55)" : undefined,
              }}
              type="button"
            >
              free
            </button>
          </div>

          <button
            className="btnPrimary"
            disabled={slotsLoading}
            onClick={async () => {
              setErr(null);
              setSlotsRes(null);
              setSlotsLoading(true);
              try {
                const r = await adminSlotsUpdate(key, slotsMode);
                setSlotsRes(r);
              } catch (e: any) {
                setErr(String(e?.message || e));
              } finally {
                setSlotsLoading(false);
              }
            }}
            type="button"
          >
            {slotsLoading ? "Mise à jour en cours…" : "Lancer la mise à jour slots"}
          </button>
        </div>

        {slotsRes?.ok ? (
          <div style={{ marginTop: 12 }}>
            <div className="mutedSmall" style={{ marginBottom: 10 }}>
              ✅ Mode: <b>{slotsRes.mode}</b> • Total nouvelles machines: <b>{slotsRes.totalAdded}</b>
            </div>

            {(slotsRes.byProvider || []).filter((p) => (p?.added || 0) > 0).length ? (
              (slotsRes.byProvider || [])
                .filter((p) => (p?.added || 0) > 0)
                .map((p) => (
                  <div
                    key={String(p.provider ?? "unknown")}
                    style={{
                      padding: "10px 0",
                      borderTop: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <div style={{ fontWeight: 900 }}>
                      {p.provider ?? "unknown"} — <span className="mutedSmall">{p.added} nouvelles</span>
                    </div>

                    <div className="mutedSmall" style={{ marginTop: 6, lineHeight: 1.35 }}>
                      {(p.slots || []).slice(0, 80).map((s, i) => (
                        <div key={String(s.slotKey || i)}>
                          • {s.name}
                          {s.slotKey ? <span style={{ opacity: 0.6 }}> ({s.slotKey})</span> : null}
                        </div>
                      ))}
                      {(p.slots || []).length > 80 ? (
                        <div style={{ opacity: 0.65, marginTop: 6 }}>
                          … +{(p.slots || []).length - 80} autres
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))
            ) : (
              <div className="mutedSmall" style={{ marginTop: 10 }}>
                Aucune nouvelle machine détectée.
              </div>
            )}
          </div>
        ) : null}

        {slotsRes && !(slotsRes as any).ok ? (
          <div className="hint" style={{ marginTop: 10 }}>
            ⚠️ {String((slotsRes as any).error || "Erreur")}
          </div>
        ) : null}

        {err ? <div className="hint" style={{ marginTop: 10 }}>⚠️ {err}</div> : null}
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
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
