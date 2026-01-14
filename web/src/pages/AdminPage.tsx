// web/src/pages/AdminPage.tsx
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

  // ✅ NEW: casino comments moderation
  adminListCasinoComments,
  adminApproveCasinoComment,
  adminRejectCasinoComment,
  type AdminCasinoCommentRow,
} from "../lib/api";
import { UsersAdminSection } from "../components/admin/UsersAdminSection";
import { ProviderAccountsAdminSection } from "../components/admin/ProviderAccountsAdminSection";
import { RubisMintAdminSection } from "../components/admin/RubisMintAdminSection";
import { CasinosAdminSection } from "../components/admin/CasinosAdminSection";
import { Link } from "react-router-dom";

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

function absApiUrl(u: string | null) {
  const BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("/")) return `${BASE}${u}`;
  return `${BASE}/${u}`;
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

  // ✅ Casino comments moderation
  const [showCasinoComments, setShowCasinoComments] = React.useState(false);
  const [ccStatus, setCcStatus] = React.useState<"pending" | "published" | "rejected">("pending");
  const [ccLoading, setCcLoading] = React.useState(false);
  const [ccItems, setCcItems] = React.useState<AdminCasinoCommentRow[]>([]);

  // ✅ Manual slots update
  const [slotsLoading, setSlotsLoading] = React.useState(false);
  const [slotsRes, setSlotsRes] = React.useState<AdminSlotsUpdateResp | null>(null);

  async function refresh() {
    const r = await adminListRequests(key);
    setRequests(r.requests);
    const s = await getStreamers();
    setStreamers(s);
  }

  async function refreshCasinoComments() {
    if (!key) return;
    setCcLoading(true);
    try {
      const r = await adminListCasinoComments(key, ccStatus, 80);
      setCcItems(r.items || []);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setCcLoading(false);
    }
  }

  React.useEffect(() => {
    if (!key) return;
    refresh().catch((e) => setErr(String(e?.message || e)));
  }, [key]);

  React.useEffect(() => {
    if (!key) return;
    if (!showCasinoComments) return;
    refreshCasinoComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, showCasinoComments, ccStatus]);

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

      {/* TrustPilot / Casinos */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <button className="btnPrimary" onClick={() => setShowCasinos((v) => !v)} type="button">
          {showCasinos ? "Fermer gestion Casinos" : "Gérer Casinos (TrustPilot)"}
        </button>

        <button className="btnSecondary" onClick={() => setShowCasinoComments((v) => !v)} type="button">
          {showCasinoComments ? "Fermer validation avis" : "Valider avis casinos"}
        </button>
      </div>

      {showCasinos && <CasinosAdminSection adminKey={key} />}

      {showCasinoComments ? (
        <div className="panel" style={{ marginTop: 14 }}>
          <div className="panelTitle">Avis casinos — validation</div>
          <div className="mutedSmall" style={{ marginBottom: 10 }}>
            Les commentaires avec images peuvent être en <b>pending</b> (validation requise).
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <select className="select" value={ccStatus} onChange={(e) => setCcStatus(e.target.value as any)}>
              <option value="pending">En attente</option>
              <option value="published">Publiés</option>
              <option value="rejected">Refusés</option>
            </select>

            <button className="btnPrimary" onClick={refreshCasinoComments} disabled={ccLoading} type="button">
              {ccLoading ? "Chargement…" : "Rafraîchir"}
            </button>

            <div className="mutedSmall" style={{ opacity: 0.8 }}>
              {ccItems.length} item(s)
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            {ccItems.length === 0 && !ccLoading ? (
              <div className="mutedSmall">Aucun avis.</div>
            ) : null}

            {ccItems.map((c) => {
              const created = new Date(c.createdAt).toLocaleString("fr-FR");
              return (
                <div
                  key={c.id}
                  style={{
                    padding: "12px 0",
                    borderTop: "1px solid rgba(255,255,255,0.06)",
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div>
                      <b>{c.casinoName}</b>{" "}
                      <span className="mutedSmall" style={{ opacity: 0.8 }}>
                        • {c.casinoSlug} • {created}
                      </span>
                      <div className="mutedSmall" style={{ opacity: 0.85 }}>
                        par <b>{c.username}</b> (userId {c.userId}) • status: <b>{c.status}</b>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <Link className="btnSmall" to={`/casinos/${encodeURIComponent(c.casinoSlug)}`}>
                        Ouvrir page
                      </Link>

                      {c.status === "pending" ? (
                        <>
                          <button
                            className="btnGhostSmall"
                            onClick={async () => {
                              setErr(null);
                              await adminApproveCasinoComment(key, c.id);
                              await refreshCasinoComments();
                            }}
                            type="button"
                          >
                            Approve
                          </button>
                          <button
                            className="btnGhostSmall"
                            onClick={async () => {
                              setErr(null);
                              await adminRejectCasinoComment(key, c.id);
                              await refreshCasinoComments();
                            }}
                            type="button"
                          >
                            Reject
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div style={{ whiteSpace: "pre-wrap" }}>{c.body}</div>

                  {Array.isArray(c.images) && c.images.length > 0 ? (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {c.images.slice(0, 6).map(
                        (
                          im: { url: string; w: number | null; h: number | null; sizeBytes: number | null },
                          i: number
                        ) => {
                          const src = absApiUrl(im.url) || im.url;
                          return (
                            <a
                              key={i}
                              href={src}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                width: 110,
                                height: 80,
                                borderRadius: 10,
                                overflow: "hidden",
                                border: "1px solid rgba(255,255,255,0.10)",
                                display: "block",
                                background: "rgba(255,255,255,0.03)",
                              }}
                            >
                              <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            </a>
                          );
                        }
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {err ? (
            <div className="hint" style={{ marginTop: 10 }}>
              ⚠️ {err}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ✅ Slots updater */}
      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panelTitle">Slots — mise à jour (Shuffle)</div>
        <div className="mutedSmall" style={{ marginBottom: 10 }}>
          Met à jour la DB depuis Shuffle: <b>tous les providers</b> (sauf Shuffle originals, Evolution, Pragmatic Live).
          Retourne uniquement les <b>nouvelles</b> machines insérées.
        </div>

        <button
          className="btnPrimary"
          disabled={slotsLoading}
          onClick={async () => {
            setErr(null);
            setSlotsRes(null);
            setSlotsLoading(true);
            try {
              const r = await adminSlotsUpdate(key);
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

        {slotsRes?.ok ? (
          <div style={{ marginTop: 12 }}>
            <div className="mutedSmall" style={{ marginBottom: 10 }}>
              ✅ Fetched: <b>{slotsRes.fetched}</b> • Nouvelles machines ajoutées: <b>{slotsRes.added}</b>
            </div>

            {slotsRes.added > 0 ? (
              Object.entries(slotsRes.byProvider || {})
                .filter(([, arr]) => (arr?.length || 0) > 0)
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([prov, arr]) => (
                  <div
                    key={prov}
                    style={{
                      padding: "10px 0",
                      borderTop: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <div style={{ fontWeight: 900 }}>
                      {prov} — <span className="mutedSmall">{arr.length} nouvelles</span>
                    </div>
                    <div className="mutedSmall" style={{ marginTop: 6, lineHeight: 1.35 }}>
                      {arr.slice(0, 120).map((s, i) => (
                        <div key={`${s.name}-${i}`}>
                          • {s.name}
                          {s.slotKey ? <span style={{ opacity: 0.6 }}> ({s.slotKey})</span> : null}
                        </div>
                      ))}
                      {arr.length > 120 ? (
                        <div style={{ opacity: 0.65, marginTop: 6 }}>… +{arr.length - 120} autres</div>
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

        {err ? (
          <div className="hint" style={{ marginTop: 10 }}>
            ⚠️ {err}
          </div>
        ) : null}
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
              type="button"
            >
              Approve
            </button>
            <button
              className="btnGhostSmall"
              onClick={async () => {
                await adminRejectRequest(key, r.id);
                await refresh();
              }}
              type="button"
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
          type="button"
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
              type="button"
            >
              Supprimer
            </button>
          </div>
        ))}

        <UsersAdminSection adminKey={key} />
        <ProviderAccountsAdminSection adminKey={key} />
      </div>

      <RubisMintAdminSection adminKey={key} />
    </main>
  );
}
