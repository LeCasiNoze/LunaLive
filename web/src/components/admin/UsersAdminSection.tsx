import * as React from "react";
import {
  adminListUsers,
  adminSetUserRole,
  adminMintRubis, // existant chez toi
  type AdminUserRow,
} from "../../lib/api";

// ⚠️ À BRANCHER (backend à ajouter)
// - adminGetUserDetails(adminKey, userId)
// - adminAdjustUserRubis(adminKey, { userId, mode: "add"|"remove"|"set", amount, origin?, note? })
async function adminGetUserDetails(_adminKey: string, userId: number) {
  // fallback minimal : on a déjà la ligne user
  return {
    ok: true,
    userId,
    createdAt: null,
    lastLoginAt: null,
    messagesCount: null,
    rubisSpent: null,
    siteSpentEur: null, // todo
  };
}
async function adminAdjustUserRubis(adminKey: string, p: { userId: number; mode: "add" | "remove" | "set"; amount: number; origin?: string; note?: string | null }) {
  // mode add => on peut utiliser adminMintRubis existant (wallet-engine earn)
  if (p.mode === "add") {
    return adminMintRubis(adminKey, {
      userId: p.userId,
      amount: p.amount,
      origin: p.origin || "paid_topup",
      weightBp: 10000,
      note: p.note ?? null,
    } as any);
  }
  // remove/set => nécessite backend.
  throw new Error("adminAdjustUserRubis(remove/set) backend manquant (à implémenter)");
}

const ORIGINS: { origin: string; label: string }[] = [
  { origin: "paid_topup", label: "paid_topup (1.00)" },
  { origin: "farm_watch", label: "farm_watch (0.35)" },
  { origin: "wheel_daily", label: "wheel_daily (0.30)" },
  { origin: "achievement", label: "achievement (0.30)" },
  { origin: "chest_auto", label: "chest_auto (0.25)" },
  { origin: "chest_streamer", label: "chest_streamer (0.20)" },
  { origin: "event_platform", label: "event_platform (0.10)" },
];

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
        background: "rgba(0,0,0,0.55)",
        zIndex: 50,
        display: "grid",
        placeItems: "end",
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "min(720px, 100%)",
          height: "min(92vh, 900px)",
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          border: "1px solid rgba(255,255,255,0.12)",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.03) 55%, rgba(0,0,0,0.2) 100%)",
          boxShadow: "0 30px 100px rgba(0,0,0,0.6)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: 14,
            borderBottom: "1px solid rgba(255,255,255,0.10)",
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            alignItems: "center",
          }}
        >
          <div style={{ fontWeight: 950 }}>{title}</div>
          <button className="btnGhostSmall" onClick={onClose} type="button">
            ✖
          </button>
        </div>
        <div style={{ padding: 14, overflow: "auto", height: "100%" }}>{children}</div>
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
  const openedUser = React.useMemo(() => rows.find((u) => u.id === openUserId) || null, [rows, openUserId]);

  // details state
  const [detail, setDetail] = React.useState<any | null>(null);
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
      const d = await adminGetUserDetails(adminKey, userId);
      setDetail(d);
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
      if (rubMode === "add") {
        await adminAdjustUserRubis(adminKey, {
          userId: openedUser.id,
          mode: "add",
          amount: amt,
          origin: rubOrigin,
          note: rubNote.trim() ? rubNote.trim() : null,
        });
      } else if (rubMode === "remove") {
        await adminAdjustUserRubis(adminKey, {
          userId: openedUser.id,
          mode: "remove",
          amount: amt,
          note: rubNote.trim() ? rubNote.trim() : null,
        });
      } else {
        await adminAdjustUserRubis(adminKey, {
          userId: openedUser.id,
          mode: "set",
          amount: amt,
          note: rubNote.trim() ? rubNote.trim() : null,
        });
      }

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
                  <span className="mutedSmall">rubis: <b>{Number(u.rubis || 0).toLocaleString()}</b></span>
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
              <Pill>rubis: <b>{Number(openedUser.rubis || 0).toLocaleString()}</b></Pill>
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
              <label className="mutedSmall">Mode</label>
              <select value={rubMode} onChange={(e) => setRubMode(e.target.value as any)}>
                <option value="add">Ajouter</option>
                <option value="remove">Retirer</option>
                <option value="set">Set (valeur exacte)</option>
              </select>

              <label className="mutedSmall">Montant</label>
              <input type="number" value={rubAmount} onChange={(e) => setRubAmount(Number(e.target.value))} min={1} step={1} />

              {rubMode === "add" ? (
                <>
                  <label className="mutedSmall">Origine</label>
                  <select value={rubOrigin} onChange={(e) => setRubOrigin(String(e.target.value))}>
                    {ORIGINS.map((o) => (
                      <option key={o.origin} value={o.origin}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  <label className="mutedSmall">Origine</label>
                  <input value="(backend)" readOnly />
                </>
              )}

              <label className="mutedSmall">Note</label>
              <input value={rubNote} onChange={(e) => setRubNote(e.target.value)} placeholder="optionnel" />
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
              <button className="btnPrimary" onClick={applyRubis} disabled={detailLoading}>
                {detailLoading ? "…" : "Appliquer"}
              </button>
              <div className="mutedSmall" style={{ opacity: 0.85 }}>
                “Retirer/Set” nécessite un endpoint admin côté API (je te liste les fichiers à modifier plus bas).
              </div>
            </div>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
