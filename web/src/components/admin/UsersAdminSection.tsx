import * as React from "react";
import { adminListUsers, adminSetUserRole, type AdminUserRow } from "../../lib/api";

export function UsersAdminSection({ adminKey }: { adminKey: string }) {
  const [q, setQ] = React.useState("");
  const [rows, setRows] = React.useState<AdminUserRow[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [edit, setEdit] = React.useState<Record<number, AdminUserRow["role"]>>({});

  async function load() {
    setBusy(true);
    setErr(null);
    try {
      const r = await adminListUsers(adminKey);
      setRows(r.users);
      setEdit({});
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  React.useEffect(() => {
    load();
  }, [adminKey]);

  const filtered = rows.filter((u) =>
    u.username.toLowerCase().includes(q.toLowerCase()) || String(u.id).includes(q)
  );

  return (
    <div className="panel" style={{ marginTop: 14 }}>
      <div className="panelTitle">Comptes</div>

      <div className="field">
        <label>Search</label>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="pseudo ou id…" />
      </div>

      {err && <div className="hint">⚠️ {err}</div>}
      <div className="mutedSmall" style={{ marginBottom: 8 }}>
        {busy ? "Chargement…" : `${filtered.length} comptes`}
      </div>

      {filtered.map((u) => {
        const role = edit[u.id] ?? u.role;
        const dirty = role !== u.role;

        return (
          <div
            key={u.id}
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              padding: "10px 0",
              borderTop: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div style={{ flex: 1 }}>
              <b>{u.username}</b> <span className="mutedSmall">#{u.id}</span>
              <div className="mutedSmall">
                role: <b>{u.role}</b> — request: {u.requestStatus ?? "-"} — streamer: {u.streamerSlug ?? "-"}
              </div>
            </div>

            <select
              value={role}
              onChange={(e) =>
                setEdit((m) => ({ ...m, [u.id]: e.target.value as AdminUserRow["role"] }))
              }
            >
              <option value="viewer">viewer</option>
              <option value="streamer">streamer</option>
              <option value="admin">admin</option>
            </select>

            <button
              className={dirty ? "btnPrimarySmall" : "btnGhostSmall"}
              disabled={!dirty}
              onClick={async () => {
                await adminSetUserRole(adminKey, u.id, role);
                await load();
              }}
            >
              Save
            </button>
          </div>
        );
      })}
    </div>
  );
}
