// web/src/pages/admin/AdminCasinoCommentsPage.tsx
import * as React from "react";
import {
  adminListPendingCasinoComments,
  adminModerateCasinoComment,
  type AdminPendingCasinoComment,
} from "../../lib/api_admin_casino_comments";

const BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");
function absApiUrl(u: string | null) {
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("/")) return `${BASE}${u}`;
  return `${BASE}/${u}`;
}

export default function AdminCasinoCommentsPage() {
  const [adminKey, setAdminKey] = React.useState(() => localStorage.getItem("ADMIN_KEY") || "");
  const [q, setQ] = React.useState("");
  const [casinoId, setCasinoId] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const [items, setItems] = React.useState<AdminPendingCasinoComment[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);

  const [noteById, setNoteById] = React.useState<Record<string, string>>({});

  function persistKey(v: string) {
    setAdminKey(v);
    try {
      localStorage.setItem("ADMIN_KEY", v);
    } catch {}
  }

  async function load(reset = true) {
    if (!adminKey.trim()) {
      setErr("ADMIN_KEY manquant.");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const r = await adminListPendingCasinoComments(adminKey.trim(), {
        q: q.trim() || undefined,
        casinoId: casinoId.trim() || undefined,
        limit: 50,
        cursor: reset ? null : nextCursor,
      });
      setNextCursor(r.nextCursor);
      setItems((prev) => (reset ? r.items : [...prev, ...r.items]));
    } catch (e: any) {
      setErr(e?.message || "Erreur");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    // chargement initial si la key existe déjà
    if (adminKey.trim()) load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function act(commentId: string, action: "approve" | "reject" | "delete") {
    const note = (noteById[commentId] ?? "").trim();
    try {
      await adminModerateCasinoComment(adminKey.trim(), commentId, action, note || null);
      // retire de la liste
      setItems((prev) => prev.filter((x) => x.id !== commentId));
    } catch (e: any) {
      alert(e?.message || "Erreur modération");
    }
  }

  return (
    <main className="container">
      <div className="pageTitle">
        <h1>Admin • Avis casinos en attente</h1>
        <p className="muted">Liste des commentaires “pending” (souvent ceux avec images).</p>
      </div>

      <div className="panel" style={{ marginBottom: 12 }}>
        <div className="toolbarRow" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            className="searchInput"
            style={{ minWidth: 260 }}
            value={adminKey}
            onChange={(e) => persistKey(e.target.value)}
            placeholder="ADMIN_KEY"
            type="password"
          />

          <input
            className="searchInput"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Recherche (casino / user / texte)…"
            style={{ minWidth: 320 }}
            onKeyDown={(e) => {
              if (e.key === "Enter") load(true);
            }}
          />

          <input
            className="searchInput"
            value={casinoId}
            onChange={(e) => setCasinoId(e.target.value)}
            placeholder="Filtre casinoId (optionnel)"
            style={{ width: 220 }}
            onKeyDown={(e) => {
              if (e.key === "Enter") load(true);
            }}
          />

          <button className="btnPrimary" onClick={() => load(true)} disabled={loading}>
            Rechercher
          </button>
        </div>
      </div>

      {err && <div className="alert">{err}</div>}
      {loading && items.length === 0 && <div className="muted">Chargement…</div>}

      {items.length === 0 && !loading && !err && (
        <div className="panel">
          <div className="mutedSmall">Aucun avis en attente 🎉</div>
        </div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {items.map((c) => {
          const logo = absApiUrl(c.casinoLogoUrl);
          return (
            <div key={c.id} className="panel">
              <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, overflow: "hidden", background: "rgba(255,255,255,0.06)" }}>
                    {logo ? <img src={logo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                  </div>
                  <div>
                    <div style={{ fontWeight: 800 }}>
                      {c.casinoName}{" "}
                      <span className="mutedSmall" style={{ fontWeight: 600 }}>
                        • {new Date(c.createdAt).toLocaleString("fr-FR")}
                      </span>
                    </div>
                    <div className="mutedSmall">
                      par <b>{c.username}</b> • commentId <span style={{ opacity: 0.8 }}>{c.id}</span> • casinoId{" "}
                      <span style={{ opacity: 0.8 }}>{c.casinoId}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btnSecondary" onClick={() => act(c.id, "reject")}>
                    Refuser
                  </button>
                  <button className="btnPrimary" onClick={() => act(c.id, "approve")}>
                    Valider
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>{c.body}</div>

              {c.images?.length > 0 && (
                <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {c.images.map((im, i) => {
                    const src = absApiUrl(im.url) || im.url;
                    return (
                      <a key={i} href={src} target="_blank" rel="noreferrer" style={{ width: 120, height: 90, borderRadius: 12, overflow: "hidden", background: "rgba(255,255,255,0.06)" }}>
                        <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </a>
                    );
                  })}
                </div>
              )}

              <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  className="searchInput"
                  value={noteById[c.id] ?? ""}
                  onChange={(e) => setNoteById((p) => ({ ...p, [c.id]: e.target.value }))}
                  placeholder="Note de modération (optionnel)…"
                  style={{ flex: 1 }}
                />
                <button className="btnSecondary" onClick={() => act(c.id, "delete")}>
                  Supprimer
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {nextCursor && (
        <div style={{ marginTop: 12 }}>
          <button className="btnSecondary" onClick={() => load(false)} disabled={loading}>
            Charger plus
          </button>
        </div>
      )}
    </main>
  );
}
