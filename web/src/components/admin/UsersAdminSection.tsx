import * as React from "react";
import {
  adminAdjustUserRubis,
  adminGetUserDetails,
  adminListUsers,
  adminSetUserRole,
  type AdminUserRow,
  type AdminUserDetails,
} from "../../lib/api";

const ORIGINS: { origin: string; label: string }[] = [
  { origin: "paid_topup", label: "paid_topup (1.00)" },
  { origin: "farm_watch", label: "farm_watch (0.35)" },
  { origin: "wheel_daily", label: "wheel_daily (0.30)" },
  { origin: "achievement", label: "achievement (0.30)" },
  { origin: "chest_auto", label: "chest_auto (0.25)" },
  { origin: "chest_streamer", label: "chest_streamer (0.20)" },
  { origin: "event_platform", label: "event_platform (0.10)" },
];

const uiInputStyle: React.CSSProperties = {
  width: "100%",
  height: 38,
  padding: "0 12px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.92)",
  outline: "none",
  boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.15)",
};

const uiSelectStyle: React.CSSProperties = {
  ...uiInputStyle,
  cursor: "pointer",
};

const uiLabelStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.85,
};

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.06)",
        fontSize: 12,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function Drawer({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(6px)",
        zIndex: 1000,
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "min(760px, 100%)",
          maxHeight: "min(88vh, 920px)",
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(16, 14, 26, 0.96)",
          boxShadow: "0 30px 110px rgba(0,0,0,0.75)",
          overflow: "hidden",
          transform: "translateZ(0)",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: 14,
            borderBottom: "1px solid rgba(255,255,255,0.10)",
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            alignItems: "center",
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
          }}
        >
          <div style={{ fontWeight: 950 }}>{title}</div>
          <button className="btnGhostSmall" onClick={onClose} type="button" title="Fermer">
            ✖
          </button>
        </div>

        <div
          style={{
            padding: 14,
            overflow: "auto",
            maxHeight: "calc(min(88vh, 920px) - 56px)",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function UsersAdminSection({ adminKey }: { adminKey: string }) {
  const [q, setQ] = React.useState("");
  const [rows, setRows] = React.useState<AdminUserRow[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [edit, setEdit] = React.useState<Record<number, AdminUserRow["role"]>>({});

  const [openUserId, setOpenUserId] = React.useState<number | null>(null);
  const openedUser = React.useMemo(
    () => rows.find((u) => u.id === openUserId) || null,
    [rows, openUserId]
  );

  // details state
  const [detail, setDetail] = React.useState<AdminUserDetails | null>(null);
  const [detailErr, setDetailErr] = React.useState<string | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);

  // rubis controls
  const [rubMode, setRubMode] = React.useState<"add" | "remove" | "set">("add");
  const [rubAmount, setRubAmount] = React.useState<number>(500);
  const [rubOrigin, setRubOrigin] = React.useState<string>("paid_topup");
  const [rubNote, setRubNote] = React.useState<string>("");

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey]);

  const filtered = rows.filter(
    (u) => u.username.toLowerCase().includes(q.toLowerCase()) || String(u.id).includes(q)
  );

  async function openDetails(userId: number) {
    setOpenUserId(userId);
    setDetail(null);
    setDetailErr(null);
    setDetailLoading(true);
    try {
      const r = await adminGetUserDetails(adminKey, userId);
      setDetail(r);
    } catch (e: any) {
      setDetailErr(String(e?.message || e));
    } finally {
      setDetailLoading(false);
    }
  }

  async function applyRubis() {
    if (!openedUser) return;

    const amt = Math.floor(Number(rubAmount || 0));
    if (!Number.isFinite(amt) || amt <= 0) {
      setDetailErr("Montant invalide.");
      return;
    }

    setDetailErr(null);
    setDetailLoading(true);
    try {
      await adminAdjustUserRubis(adminKey, {
        userId: openedUser.id,
        mode: rubMode,
        amount: amt,
        origin: rubMode === "add" ? rubOrigin : undefined,
        note: rubNote.trim() ? rubNote.trim() : null,
      });

      await load(); // refresh balance/roles list
      setRubNote("");
    } catch (e: any) {
      setDetailErr(String(e?.message || e));
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="panel" style={{ marginTop: 14 }}>
      <div className="panelTitle">Comptes</div>

      <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
        <div className="field" style={{ flex: 1, minWidth: 260 }}>
          <label>Search</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="pseudo ou id…" />
        </div>
        <button className="btnSecondary" type="button" onClick={load} disabled={busy}>
          {busy ? "…" : "Refresh"}
        </button>
        <Pill>{busy ? "Chargement…" : `${filtered.length} comptes`}</Pill>
      </div>

      {err && <div className="hint">⚠️ {err}</div>}

      <div style={{ marginTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        {filtered.map((u) => {
          const role = edit[u.id] ?? u.role;
          const dirty = role !== u.role;

          return (
            <div
              key={u.id}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(220px, 1fr) 160px 120px 110px",
                gap: 10,
                alignItems: "center",
                padding: "10px 0",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                  <b style={{ fontSize: 14 }}>{u.username}</b>
                  <span className="mutedSmall">#{u.id}</span>
                  <span className="mutedSmall">
                    rubis: <b>{Number(u.rubis || 0).toLocaleString()}</b>
                  </span>
                </div>
                <div className="mutedSmall" style={{ opacity: 0.85 }}>
                  role: <b>{u.role}</b> — request: {u.requestStatus ?? "-"} — streamer: {u.streamerSlug ?? "-"}
                </div>
              </div>

              <select
                value={role}
                onChange={(e) => setEdit((m) => ({ ...m, [u.id]: e.target.value as AdminUserRow["role"] }))}
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

              <button className="btnSecondary" type="button" onClick={() => openDetails(u.id)}>
                Détails
              </button>
            </div>
          );
        })}
      </div>

      <Drawer
        open={openUserId != null}
        title={
          openedUser ? (
            <span style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              👤 {openedUser.username} <span className="mutedSmall">#{openedUser.id}</span>
              <Pill>
                rubis: <b>{Number(openedUser.rubis || 0).toLocaleString()}</b>
              </Pill>
            </span>
          ) : (
            "Utilisateur"
          )
        }
        onClose={() => setOpenUserId(null)}
      >
        {detailErr ? <div className="hint">⚠️ {detailErr}</div> : null}
        {detailLoading && !detail ? <div className="mutedSmall">Chargement…</div> : null}

        <div style={{ display: "grid", gap: 12 }}>
          <div
            style={{
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.03)",
              padding: 12,
            }}
          >
            <div style={{ fontWeight: 950, marginBottom: 8 }}>Infos</div>
            <div className="mutedSmall" style={{ lineHeight: 1.6 }}>
              Date création : <b>{detail?.createdAt ? new Date(detail.createdAt).toLocaleString() : "—"}</b>
              <br />
              Dernière connexion : <b>{detail?.lastLoginAt ? new Date(detail.lastLoginAt).toLocaleString() : "—"}</b>
              <br />
              Nombre de messages : <b>{detail?.messagesCount ?? "—"}</b>
              <br />
              Rubis dépensés : <b>{detail?.rubisSpent ?? "—"}</b>
              <br />
              Dépenses € (todo) : <b>{detail?.siteSpentEur ?? "—"}</b>
            </div>
          </div>

          <div
            style={{
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.03)",
              padding: 12,
            }}
          >
            <div style={{ fontWeight: 950, marginBottom: 10 }}>Rubis (admin)</div>
            <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 10, alignItems: "center" }}>
              <label className="mutedSmall" style={uiLabelStyle}>Mode</label>
              <select style={uiSelectStyle} value={rubMode} onChange={(e) => setRubMode(e.target.value as any)}>
                <option value="add">Ajouter</option>
                <option value="remove">Retirer</option>
                <option value="set">Set (valeur exacte)</option>
              </select>

              <label className="mutedSmall" style={uiLabelStyle}>Montant</label>
              <input
                style={uiInputStyle}
                type="number"
                value={rubAmount}
                onChange={(e) => setRubAmount(Number(e.target.value))}
                min={1}
                step={1}
              />

              {rubMode === "add" ? (
                <>
                  <label className="mutedSmall" style={uiLabelStyle}>Origine</label>
                  <select style={uiSelectStyle} value={rubOrigin} onChange={(e) => setRubOrigin(String(e.target.value))}>
                    {ORIGINS.map((o) => (
                      <option key={o.origin} value={o.origin}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  <label className="mutedSmall" style={uiLabelStyle}>Origine</label>
                  <input style={uiInputStyle} value="(backend)" readOnly />
                </>
              )}

              <label className="mutedSmall" style={uiLabelStyle}>Note</label>
              <input
                style={uiInputStyle}
                value={rubNote}
                onChange={(e) => setRubNote(e.target.value)}
                placeholder="optionnel"
              />
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
              <button className="btnPrimary" onClick={applyRubis} disabled={detailLoading}>
                {detailLoading ? "…" : "Appliquer"}
              </button>
              <div className="mutedSmall" style={{ opacity: 0.85 }}>
                “Retirer/Set” nécessite l’endpoint admin côté API : <b>POST /admin/rubis/adjust</b>
              </div>
            </div>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
