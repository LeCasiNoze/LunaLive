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
} from "../lib/api";
import { UsersAdminSection } from "../components/admin/UsersAdminSection";
import { ProviderAccountsAdminSection } from "../components/admin/ProviderAccountsAdminSection";
import { RubisMintAdminSection } from "../components/admin/RubisMintAdminSection";
import { CasinosAdminSection } from "../components/admin/CasinosAdminSection";

const SS_KEY = "lunalive_admin_key_v1";
const BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

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

function absApiUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  const s = String(u);
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("/")) return `${BASE}${s}`;
  return `${BASE}/${s}`;
}

// ──────────────────────────────────────────
// ✅ Admin Casinos — Moderation (pending comments)
// ──────────────────────────────────────────
type AdminCasinoComment = {
  id: string;
  casinoId: string;
  casinoSlug: string;
  casinoName: string;

  userId: number;
  username: string;

  body: string;
  createdAt: string;

  status: "published" | "pending" | "rejected" | "deleted";
  hasImages: boolean;
  authorRating: number | null;

  images: Array<{ url: string; w: number | null; h: number | null; sizeBytes: number | null }>;
};

async function adminJ<T>(path: string, adminKey: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "x-admin-key": adminKey,
      ...(init.headers || {}),
    },
  });
  const text = await res.text().catch(() => "");
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok || (data && data.ok === false)) {
    throw new Error(String(data?.error || data?.message || (text && text.length < 200 ? text : null) || `HTTP ${res.status}`));
  }
  return data as T;
}

function CasinosCommentsModerationSection({ adminKey }: { adminKey: string }) {
  const [status, setStatus] = React.useState<"pending" | "published" | "rejected">("pending");
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<AdminCasinoComment[]>([]);
  const [q, setQ] = React.useState("");
  const [actingId, setActingId] = React.useState<string | null>(null);
  const [noteById, setNoteById] = React.useState<Record<string, string>>({});

  async function load() {
    setErr(null);
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("status", status);
      qs.set("limit", "50");
      if (q.trim()) qs.set("q", q.trim());

      // ⚠️ Backend attendu:
      // GET /admin/casinos/comments?status=pending|published|rejected&limit=50&q=
      // -> { ok:true, items:[...] }
      const r = await adminJ<{ ok: true; items: AdminCasinoComment[] }>(
        `/admin/casinos/comments?${qs.toString()}`,
        adminKey
      );
      setItems(Array.isArray(r.items) ? r.items : []);
    } catch (e: any) {
      setErr(String(e?.message || e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function approve(id: string) {
    setErr(null);
    setActingId(id);
    try {
      const note = (noteById[id] ?? "").trim() || null;

      // ⚠️ Backend attendu:
      // POST /admin/casinos/comments/:id/approve  body: { note?:string|null }
      await adminJ<{ ok: true }>(
        `/admin/casinos/comments/${encodeURIComponent(id)}/approve`,
        adminKey,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note }),
        }
      );

      // sortir de la liste (si on est en pending)
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setActingId(null);
    }
  }

  async function reject(id: string) {
    setErr(null);
    setActingId(id);
    try {
      const note = (noteById[id] ?? "").trim() || null;

      // ⚠️ Backend attendu:
      // POST /admin/casinos/comments/:id/reject  body: { note?:string|null }
      await adminJ<{ ok: true }>(
        `/admin/casinos/comments/${encodeURIComponent(id)}/reject`,
        adminKey,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note }),
        }
      );

      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="panel" style={{ marginTop: 14 }}>
      <div className="panelTitle">Avis casinos — modération</div>

      <div className="mutedSmall" style={{ marginBottom: 10 }}>
        Les avis avec images sont en <b>pending</b> (validation requise). Tu peux les <b>valider</b> ou <b>refuser</b> pour les faire sortir de la file.
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value as any)}>
          <option value="pending">En attente</option>
          <option value="published">Publiés</option>
          <option value="rejected">Refusés</option>
        </select>

        <div className="field" style={{ margin: 0, flex: 1, minWidth: 240 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Recherche (casino / user / contenu)…"
            onKeyDown={(e) => {
              if (e.key === "Enter") load();
            }}
          />
        </div>

        <button className="btnPrimary" onClick={load} disabled={loading} type="button">
          {loading ? "Chargement…" : "Rafraîchir"}
        </button>
      </div>

      {err ? <div className="hint" style={{ marginTop: 8 }}>⚠️ {err}</div> : null}

      {!loading && items.length === 0 ? (
        <div className="mutedSmall">Aucun élément.</div>
      ) : null}

      {items.map((c) => {
        const imgs = Array.isArray(c.images) ? c.images : [];
        const isActing = actingId === c.id;

        return (
          <div
            key={c.id}
            style={{
              padding: "12px 0",
              borderTop: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 260 }}>
                <div style={{ fontWeight: 900 }}>
                  {c.casinoName}{" "}
                  <span className="mutedSmall" style={{ fontWeight: 500 }}>
                    ({c.casinoSlug})
                  </span>
                </div>
                <div className="mutedSmall">
                  <b>{c.username}</b> • {new Date(c.createdAt).toLocaleString("fr-FR")}{" "}
                  {c.authorRating != null ? <span>• ⭐ {c.authorRating}/5</span> : null}{" "}
                  {c.hasImages ? <span>• 🖼️ {imgs.length}</span> : null}
                </div>
              </div>

              {/* actions */}
              {status === "pending" ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button className="btnGhostSmall" disabled={isActing} onClick={() => approve(c.id)} type="button">
                    Valider
                  </button>
                  <button className="btnGhostSmall" disabled={isActing} onClick={() => reject(c.id)} type="button">
                    Refuser
                  </button>
                </div>
              ) : null}
            </div>

            <div style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>{c.body}</div>

            {imgs.length > 0 ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                {imgs.slice(0, 12).map((im, i) => {
                  const src = absApiUrl(im.url) || im.url;
                  return (
                    <a
                      key={`${c.id}_${i}`}
                      href={src}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: "block",
                        width: 110,
                        height: 80,
                        borderRadius: 10,
                        overflow: "hidden",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                      title="Ouvrir"
                    >
                      <img
                        src={src}
                        alt=""
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      />
                    </a>
                  );
                })}
                {imgs.length > 12 ? (
                  <div className="mutedSmall" style={{ alignSelf: "center" }}>
                    +{imgs.length - 12}
                  </div>
                ) : null}
              </div>
            ) : null}

            {status === "pending" ? (
              <div style={{ marginTop: 10 }}>
                <div className="mutedSmall" style={{ marginBottom: 6 }}>
                  Note admin (optionnel) — visible dans l’historique de modération côté back (si tu la stockes).
                </div>
                <input
                  value={noteById[c.id] ?? ""}
                  onChange={(e) => setNoteById((m) => ({ ...m, [c.id]: e.target.value }))}
                  placeholder="Ex: preuve OK / faux retrait / insultes / etc."
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
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

  // ✅ Manual slots update
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          <button className="btnPrimary" onClick={onLogin} type="button">
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
        type="button"
      >
        {showCasinos ? "Fermer gestion Casinos" : "Gérer Casinos (TrustPilot)"}
      </button>

      {showCasinos ? (
        <>
          <CasinosAdminSection adminKey={key} />

          {/* ✅ NEW: moderation juste à côté du TrustPilot */}
          <CasinosCommentsModerationSection adminKey={key} />
        </>
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
