// web/src/components/admin/UsersAdminSection.tsx
import * as React from "react";
import {
  adminAdjustUserRubis,
  adminGetUserDetails,
  adminListUsers,
  adminSetUserRole,
  adminImpersonateUser,
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

const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");
const MAIN_SITE = (import.meta.env.VITE_MAIN_SITE_BASE ?? "https://lunalive.onrender.com/").replace(/\/$/, "");

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
            background: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
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

async function adminPostJson<T>(adminKey: string, path: string, body: any): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-key": adminKey,
    },
    body: JSON.stringify(body ?? {}),
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // ignore
  }

  if (!res.ok) {
    const msg = data?.error || data?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

function toIsoUntil(duration: string): string | null {
  // duration values: "perm" | "10m" | "1h" | "24h" | "7d" | "30d"
  if (duration === "perm") return null;

  const now = Date.now();
  const addMs =
    duration === "10m"
      ? 10 * 60 * 1000
      : duration === "1h"
        ? 60 * 60 * 1000
        : duration === "24h"
          ? 24 * 60 * 60 * 1000
          : duration === "7d"
            ? 7 * 24 * 60 * 60 * 1000
            : duration === "30d"
              ? 30 * 24 * 60 * 60 * 1000
              : 0;

  return new Date(now + addMs).toISOString();
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
  const [detail, setDetail] = React.useState<AdminUserDetails | null>(null);
  const [detailErr, setDetailErr] = React.useState<string | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);

  // rubis controls
  const [rubMode, setRubMode] = React.useState<"add" | "remove" | "set">("add");
  const [rubAmount, setRubAmount] = React.useState<number>(500);
  const [rubOrigin, setRubOrigin] = React.useState<string>("paid_topup");
  const [rubNote, setRubNote] = React.useState<string>("");

  // ban controls (site + ip)
  const [banBusy, setBanBusy] = React.useState(false);
  const [banReason, setBanReason] = React.useState<string>("");
  const [banDuration, setBanDuration] = React.useState<"perm" | "10m" | "1h" | "24h" | "7d" | "30d">("perm");
  const [banIpText, setBanIpText] = React.useState<string>("");

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

  const filtered = rows.filter((u) => u.username.toLowerCase().includes(q.toLowerCase()) || String(u.id).includes(q));

  async function openDetails(userId: number) {
    setOpenUserId(userId);
    setDetail(null);
    setDetailErr(null);
    setDetailLoading(true);
    try {
      const r = await adminGetUserDetails(adminKey, userId);
      setDetail(r);

      // essaye de pré-remplir une IP si le backend la fournit
      const anyr = r as any;
      const ipGuess =
        anyr?.lastIp ||
        anyr?.lastIP ||
        anyr?.ip ||
        anyr?.lastLoginIp ||
        (Array.isArray(anyr?.recentIps) ? anyr.recentIps?.[0] : null) ||
        (Array.isArray(anyr?.ips) ? anyr.ips?.[0] : null) ||
        "";

      setBanIpText(String(ipGuess || ""));
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
      if (openedUser?.id) await openDetails(openedUser.id);
      setRubNote("");
    } catch (e: any) {
      setDetailErr(String(e?.message || e));
    } finally {
      setDetailLoading(false);
    }
  }

  async function banUserAccountQuick() {
    if (!openedUser) return;

    setBanBusy(true);
    setDetailErr(null);
    try {
      const until = toIsoUntil(banDuration);
      await adminPostJson(adminKey, "/admin/bans/user", {
        userId: openedUser.id,
        until, // null => permanent
        reason: banReason?.trim() || "ban admin",
      });

      await load();
      await openDetails(openedUser.id);
    } catch (e: any) {
      setDetailErr(String(e?.message || e));
    } finally {
      setBanBusy(false);
    }
  }

  async function banIpAngry() {
    if (!openedUser) return;

    const ip = String(banIpText || "").trim();
    if (!ip) {
      setDetailErr("IP introuvable. (Le backend doit renvoyer une IP dans les détails, ou tu la saisis à la main)");
      return;
    }

    // “version énervée”
    const ok = window.confirm(`BAN IP (ÉNERVÉ) : tu confirmes que tu veux bannir l'IP "${ip}" ?`);
    if (!ok) return;

    setBanBusy(true);
    setDetailErr(null);
    try {
      const until = toIsoUntil(banDuration);
      await adminPostJson(adminKey, "/admin/bans/ip", {
        ip,
        until, // null => permanent
        reason: banReason?.trim() || "ban ip admin",
        // optionnel: pour tracer à qui c'était lié
        userId: openedUser.id,
      });

      await openDetails(openedUser.id);
    } catch (e: any) {
      setDetailErr(String(e?.message || e));
    } finally {
      setBanBusy(false);
    }
  }

  async function unbanUser() {
    if (!openedUser) return;

    setBanBusy(true);
    setDetailErr(null);
    try {
      await adminPostJson(adminKey, "/admin/bans/user/unban", { userId: openedUser.id });
      await openDetails(openedUser.id);
    } catch (e: any) {
      setDetailErr(String(e?.message || e));
    } finally {
      setBanBusy(false);
    }
  }

  async function unbanIp() {
    const ip = String(banIpText || "").trim();
    if (!ip) {
      setDetailErr("IP vide.");
      return;
    }

    setBanBusy(true);
    setDetailErr(null);
    try {
      await adminPostJson(adminKey, "/admin/bans/ip/unban", { ip });
      await openDetails(openedUser!.id);
    } catch (e: any) {
      setDetailErr(String(e?.message || e));
    } finally {
      setBanBusy(false);
    }
  }

  const anyDetail = detail as any;
  const bannedUserUntil: string | null = anyDetail?.ban?.user?.until ?? anyDetail?.banUserUntil ?? anyDetail?.bannedUntil ?? null;
  const bannedIpUntil: string | null = anyDetail?.ban?.ip?.until ?? anyDetail?.banIpUntil ?? null;

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

              <select value={role} onChange={(e) => setEdit((m) => ({ ...m, [u.id]: e.target.value as AdminUserRow["role"] }))}>
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

        {openedUser ? (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button
              className="btnPrimary"
              type="button"
              disabled={detailLoading}
              onClick={async () => {
                try {
                  setDetailErr(null);
                  const r = await adminImpersonateUser(adminKey, openedUser.id);
                  const url = `${MAIN_SITE}/impersonate?token=${encodeURIComponent(r.token)}`;
                  window.open(url, "_blank", "noopener,noreferrer");
                } catch (e: any) {
                  setDetailErr(String(e?.message || e));
                }
              }}
              title="Ouvre le site principal en étant connecté comme cet utilisateur"
            >
              🔐 Se connecter avec ce compte
            </button>

            <div className="mutedSmall" style={{ opacity: 0.85 }}>
              (token court ~2 min)
            </div>
          </div>
        ) : null}

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
              <br />
              IP (si dispo) : <b>{String((anyDetail?.lastIp || anyDetail?.lastLoginIp || anyDetail?.ip || "—") ?? "—")}</b>
              <br />
              Ban compte :{" "}
              <b>{bannedUserUntil ? `jusqu'au ${new Date(bannedUserUntil).toLocaleString()}` : anyDetail?.banUser === true ? "oui" : "—"}</b>
              <br />
              Ban IP :{" "}
              <b>{bannedIpUntil ? `jusqu'au ${new Date(bannedIpUntil).toLocaleString()}` : anyDetail?.banIp === true ? "oui" : "—"}</b>
            </div>
          </div>

          {/* BAN CARD */}
          <div
            style={{
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.03)",
              padding: 12,
            }}
          >
            <div style={{ fontWeight: 950, marginBottom: 10 }}>Bannissements (admin)</div>

            <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 10, alignItems: "center" }}>
              <label className="mutedSmall" style={uiLabelStyle}>
                Durée
              </label>
              <select style={uiSelectStyle} value={banDuration} onChange={(e) => setBanDuration(e.target.value as any)} disabled={banBusy}>
                <option value="perm">Permanent</option>
                <option value="10m">10 minutes</option>
                <option value="1h">1 heure</option>
                <option value="24h">24 heures</option>
                <option value="7d">7 jours</option>
                <option value="30d">30 jours</option>
              </select>

              <label className="mutedSmall" style={uiLabelStyle}>
                Raison
              </label>
              <input
                style={uiInputStyle}
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="optionnel (ex: spam, arnaque, multi-compte...)"
                disabled={banBusy}
              />

              <label className="mutedSmall" style={uiLabelStyle}>
                IP à bannir
              </label>
              <input
                style={uiInputStyle}
                value={banIpText}
                onChange={(e) => setBanIpText(e.target.value)}
                placeholder="ex: 1.2.3.4 (auto si le backend l'envoie)"
                disabled={banBusy}
              />
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
              <button
                className="btnPrimary"
                type="button"
                disabled={!openedUser || banBusy}
                onClick={banUserAccountQuick}
                title="Bannir le compte du site (cash pistache)"
              >
                {banBusy ? "…" : "⛔ Bannir (cash pistache)"}
              </button>

              <button
                className="btnSecondary"
                type="button"
                disabled={!openedUser || banBusy}
                onClick={banIpAngry}
                title="Bannir l'IP (version énervée)"
              >
                {banBusy ? "…" : "💥 Bannir IP (ÉNERVÉ)"}
              </button>

              <button className="btnGhost" type="button" disabled={!openedUser || banBusy} onClick={unbanUser} title="Retire le ban compte">
                ✅ Unban compte
              </button>

              <button className="btnGhost" type="button" disabled={!openedUser || banBusy} onClick={unbanIp} title="Retire le ban IP">
                ✅ Unban IP
              </button>
            </div>

            <div className="mutedSmall" style={{ opacity: 0.85, marginTop: 10, lineHeight: 1.5 }}>
              Endpoints attendus côté API :
              <br />
              <b>POST /admin/bans/user</b> {"{ userId, until?, reason? }"}
              <br />
              <b>POST /admin/bans/ip</b> {"{ ip, until?, reason?, userId? }"}
              <br />
              <b>POST /admin/bans/user/unban</b> {"{ userId }"}
              <br />
              <b>POST /admin/bans/ip/unban</b> {"{ ip }"}
            </div>
          </div>

          {/* RUBIS CARD */}
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
              <label className="mutedSmall" style={uiLabelStyle}>
                Mode
              </label>
              <select style={uiSelectStyle} value={rubMode} onChange={(e) => setRubMode(e.target.value as any)}>
                <option value="add">Ajouter</option>
                <option value="remove">Retirer</option>
                <option value="set">Set (valeur exacte)</option>
              </select>

              <label className="mutedSmall" style={uiLabelStyle}>
                Montant
              </label>
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
                  <label className="mutedSmall" style={uiLabelStyle}>
                    Origine
                  </label>
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
                  <label className="mutedSmall" style={uiLabelStyle}>
                    Origine
                  </label>
                  <input style={uiInputStyle} value="(backend)" readOnly />
                </>
              )}

              <label className="mutedSmall" style={uiLabelStyle}>
                Note
              </label>
              <input style={uiInputStyle} value={rubNote} onChange={(e) => setRubNote(e.target.value)} placeholder="optionnel" />
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
