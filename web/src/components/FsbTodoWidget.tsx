// web/src/components/FsbTodoWidget.tsx
//
// Widget Todo affiché sur la home du FSB Board. Liste les todos pending,
// permet de les cocher (status='done') ou supprimer.
// Création principalement via la commande Discord /todo, mais on a aussi un
// petit input pour créer en place si besoin.

import * as React from "react";

type Todo = {
  id: number;
  message: string;
  attachmentUrl: string | null;
  attachmentName: string | null;
  createdByName: string | null;
  status: "pending" | "done";
  createdAt: string | null;
  completedAt: string | null;
};

type Props = { token: string | null };

export function FsbTodoWidget({ token }: Props) {
  const [items, setItems] = React.useState<Todo[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [newMessage, setNewMessage] = React.useState("");
  const [showDone, setShowDone] = React.useState(false);

  const auth = React.useMemo<Record<string, string>>(
    () => token ? { Authorization: `Bearer ${token}` } : {},
    [token]
  );

  const reload = React.useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const url = "/api/fsb/todos?status=" + (showDone ? "all" : "pending");
      const r = await fetch(url, { headers: auth });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data?.error || `HTTP ${r.status}`);
      setItems(data.items || []);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [token, showDone, auth]);

  React.useEffect(() => { void reload(); }, [reload]);

  const toggle = async (t: Todo) => {
    if (!token) return;
    const next = t.status === "done" ? "pending" : "done";
    try {
      const r = await fetch(`/api/fsb/todos/${t.id}`, {
        method: "PATCH",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data?.error || `HTTP ${r.status}`);
      void reload();
    } catch (e: any) { setError(String(e?.message || e)); }
  };

  const remove = async (id: number) => {
    if (!token) return;
    if (!confirm("Supprimer ce todo ?")) return;
    try {
      const r = await fetch(`/api/fsb/todos/${id}`, { method: "DELETE", headers: auth });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data?.error || `HTTP ${r.status}`);
      void reload();
    } catch (e: any) { setError(String(e?.message || e)); }
  };

  const create = async () => {
    if (!token || !newMessage.trim()) return;
    try {
      const r = await fetch(`/api/fsb/todos`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ message: newMessage.trim() }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data?.error || `HTTP ${r.status}`);
      setNewMessage("");
      void reload();
    } catch (e: any) { setError(String(e?.message || e)); }
  };

  const pendingCount = items.filter(t => t.status === "pending").length;

  return (
    <div className="fsb-card fsb-module" style={{ gridColumn: "1 / -1" }}>
      <div className="fsb-sectionhead">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="fsb-module-icon" style={{ background: "rgba(157,75,255,.15)", color: "#9D4BFF" }}>📝</span>
          <div>
            <strong>Todo équipe</strong>
            <div className="fsb-copy">
              Créés via <code>/todo</code> sur Discord ou ici. {pendingCount} en attente.
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 13, color: "#bba", display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
            Voir les terminés
          </label>
          <button className="fsb-btn" onClick={() => void reload()} disabled={loading}>↻</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input
          type="text"
          placeholder="Ajouter rapidement un todo…"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void create(); }}
          style={{
            flex: 1, padding: "8px 12px", borderRadius: 8,
            border: "1px solid rgba(255,255,255,.15)", background: "rgba(255,255,255,.04)", color: "#fff",
          }}
        />
        <button className="fsb-btn fsb-btn-primary" onClick={() => void create()} disabled={!newMessage.trim()}>
          + Ajouter
        </button>
      </div>

      {error ? <div style={{ color: "#ff6b6b", fontSize: 13, marginTop: 8 }}>❌ {error}</div> : null}

      <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0 0", display: "flex", flexDirection: "column", gap: 6 }}>
        {items.length === 0 && !loading ? (
          <li style={{ color: "#bba", fontStyle: "italic", padding: "12px 0" }}>
            {showDone ? "Aucun todo." : "Rien à faire 🎉"}
          </li>
        ) : null}
        {items.map((t) => (
          <li key={t.id}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 12px", borderRadius: 8,
                background: t.status === "done" ? "rgba(76,175,80,.06)" : "rgba(255,255,255,.03)",
                border: "1px solid rgba(255,255,255,.06)",
              }}>
            <input
              type="checkbox"
              checked={t.status === "done"}
              onChange={() => void toggle(t)}
              style={{ flexShrink: 0 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                color: t.status === "done" ? "#888" : "#fff",
                textDecoration: t.status === "done" ? "line-through" : "none",
                wordBreak: "break-word",
              }}>
                {t.message}
                {t.attachmentUrl ? (
                  <>
                    {" "}
                    <a href={t.attachmentUrl} target="_blank" rel="noopener" style={{ color: "#9D4BFF", fontSize: 12 }}>
                      📎 {t.attachmentName || "fichier"}
                    </a>
                  </>
                ) : null}
              </div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                {t.createdByName ? `par ${t.createdByName} · ` : ""}
                {t.createdAt ? new Date(t.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
              </div>
            </div>
            <button
              className="fsb-btn"
              onClick={() => void remove(t.id)}
              title="Supprimer"
              style={{ flexShrink: 0, padding: "4px 10px", fontSize: 13 }}>
              🗑️
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
