// web/src/components/dashboard/sections/ModerationSection.tsx
import * as React from "react";
import type { ApiMyStreamer } from "../../../lib/api";
import { useAuth } from "../../../auth/AuthProvider";
import {
  addModerator,
  banUserFromDashboard,
  getModerationEventDetail,
  getModerationEvents,
  getMyBans,
  getMyModerators,
  removeModerator,
  searchUsersForBan,
  searchUsersForModerator,
  unbanUserFromDashboard,
  unmuteTimeoutFromDashboard,
  type ApiBannedRow,
  type ApiModerationEventDetail,
  type ApiModerationEventRow,
  type ApiModeratorRow,
  type ApiUserSearchRow,
} from "../../../lib/api";

function typeLabel(t: string) {
  switch (t) {
    case "mod_add":
      return "Modo ajouté";
    case "mod_remove":
      return "Modo retiré";
    case "message_delete":
      return "Message supprimé";
    case "ban":
      return "Ban";
    case "mute":
      return "Mute / Timeout";
    case "unban":
      return "Unban";
    case "unmute":
      return "Unmute";
    default:
      return t;
  }
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString();
}

function parseEventId(id: string): { kind: string; key: string } | null {
  const raw = String(id || "");
  const m = raw.match(/^([a-z_]+)(?:~|\|)(.+)$/i);
  if (!m) return null;
  return { kind: m[1], key: m[2] };
}

function AvatarPlaceholder({ name }: { name: string }) {
  const letter = (name || "?").slice(0, 1).toUpperCase();
  return (
    <div
      className="studio-avatar-placeholder"
      style={{
        width: 34,
        height: 34,
        borderRadius: 999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 1050,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(255,255,255,0.06)",
        flex: "0 0 34px",
      }}
      title="Avatar (TODO)"
    >
      {letter}
    </div>
  );
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="studio-card-shell"
      style={{
        padding: 12,
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(0,0,0,0.12)",
      }}
    >
      {children}
    </div>
  );
}

export function ModerationSection({ streamer }: { streamer: ApiMyStreamer }) {
  const { token } = useAuth();

  const [mods, setMods] = React.useState<ApiModeratorRow[]>([]);
  const [bans, setBans] = React.useState<ApiBannedRow[]>([]);
  const [events, setEvents] = React.useState<ApiModerationEventRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<ApiUserSearchRow[]>([]);
  const [searching, setSearching] = React.useState(false);

  const [qBan, setQBan] = React.useState("");
  const [banResults, setBanResults] = React.useState<ApiUserSearchRow[]>([]);
  const [banSearching, setBanSearching] = React.useState(false);

  const [openId, setOpenId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<ApiModerationEventDetail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);

  const [actionLoading, setActionLoading] = React.useState(false);
  const [actionErr, setActionErr] = React.useState<string | null>(null);

  async function loadAll() {
    if (!token) return;
    setLoading(true);
    setErr(null);
    try {
      const [m, b, e] = await Promise.all([
        getMyModerators(token),
        getMyBans(token),
        getModerationEvents(token, 60),
      ]);
      setMods(m.moderators);
      setBans(b.bans);
      setEvents(e.events);
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  React.useEffect(() => {
    if (!token) return;
    const qq = q.trim();
    if (qq.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const id = window.setTimeout(async () => {
      try {
        const r = await searchUsersForModerator(token, qq);
        setResults(r.users);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => window.clearTimeout(id);
  }, [q, token]);

  React.useEffect(() => {
    if (!token) return;
    const qq = qBan.trim();
    if (qq.length < 2) {
      setBanResults([]);
      setBanSearching(false);
      return;
    }

    setBanSearching(true);
    const id = window.setTimeout(async () => {
      try {
        const r = await searchUsersForBan(token, qq);
        setBanResults(r.users);
      } catch {
        setBanResults([]);
      } finally {
        setBanSearching(false);
      }
    }, 250);

    return () => window.clearTimeout(id);
  }, [qBan, token]);

  async function onAdd(userId: number) {
    if (!token) return;
    try {
      await addModerator(token, userId);
      setQ("");
      setResults([]);
      await loadAll();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    }
  }

  async function onRemove(userId: number) {
    if (!token) return;
    if (!window.confirm("Retirer ce modérateur ?")) return;
    try {
      await removeModerator(token, userId);
      await loadAll();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    }
  }

  async function onBan(userId: number) {
    if (!token) return;
    if (!window.confirm("Bannir cet utilisateur ?")) return;
    try {
      await banUserFromDashboard(token, userId);
      setQBan("");
      setBanResults([]);
      await loadAll();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    }
  }

  async function onUnban(userId: number) {
    if (!token) return;
    if (!window.confirm("Débannir cet utilisateur ?")) return;
    try {
      await unbanUserFromDashboard(token, userId);
      await loadAll();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    }
  }

  async function openDetails(id: string) {
    if (!token) return;
    setOpenId(id);
    setDetail(null);
    setDetailLoading(true);
    setActionErr(null);
    try {
      const r = await getModerationEventDetail(token, id);
      setDetail(r.event);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function doUnban() {
    if (!token || !openId) return;
    const parsed = parseEventId(openId);
    if (!parsed || parsed.kind !== "ban") return;

    const userId = Number(parsed.key);
    if (!userId) return;

    setActionLoading(true);
    setActionErr(null);
    try {
      await unbanUserFromDashboard(token, userId);
      await loadAll();
      await openDetails(openId);
    } catch (e: any) {
      setActionErr(String(e?.message || "Erreur"));
    } finally {
      setActionLoading(false);
    }
  }

  async function doUnmute() {
    if (!token || !openId) return;
    const parsed = parseEventId(openId);
    if (!parsed || parsed.kind !== "mute") return;

    const timeoutId = Number(parsed.key);
    if (!timeoutId) return;

    setActionLoading(true);
    setActionErr(null);
    try {
      await unmuteTimeoutFromDashboard(token, timeoutId);
      await loadAll();
      await openDetails(openId);
    } catch (e: any) {
      setActionErr(String(e?.message || "Erreur"));
    } finally {
      setActionLoading(false);
    }
  }

  const isAlreadyMod = React.useMemo(() => {
    const s = new Set(mods.map((m) => m.id));
    return (id: number) => s.has(id);
  }, [mods]);

  const isAlreadyBanned = React.useMemo(() => {
    const s = new Set(bans.map((b) => b.id));
    return (id: number) => s.has(id);
  }, [bans]);

  const useMobile = typeof window !== "undefined" && window.matchMedia?.("(max-width: 980px)")?.matches;

  const parsedOpen = openId ? parseEventId(openId) : null;
  const metaAny: any = detail?.meta || {};
  const timeoutExpiresAt = metaAny?.expiresAt ? String(metaAny.expiresAt) : null;

  const banIsActive = !!detail && parsedOpen?.kind === "ban" && (metaAny?.isActive ?? true);
  const muteIsActive =
    !!detail && parsedOpen?.kind === "mute" && !!timeoutExpiresAt && new Date(timeoutExpiresAt).getTime() > Date.now();

  return (
    <div>
      <style>{`
        .llGridMod{
          display:grid;
          grid-template-columns: 1fr 1.1fr;
          gap: 14px;
          align-items:start;
          margin-top: 12px;
        }
        @media (max-width: 980px){
          .llGridMod{ grid-template-columns: 1fr; }
        }
        .llInput{
          width: 100%;
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.20);
          color: white;
          outline: none;
          font-weight: 850;
        }
        .llInput:focus{
          border-color: rgba(124,77,255,0.45);
          box-shadow: 0 0 0 2px rgba(124,77,255,0.10);
        }
        .llList{
          display:flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 10px;
        }
        .llRow{
          display:flex;
          align-items:center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 10px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.03);
        }
        .llRow:hover{
          border-color: rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.06);
        }
        .llScroll{
          display:flex;
          flex-direction: column;
          gap: 8px;
          max-height: ${useMobile ? 360 : 620}px;
          overflow-y: auto;
          padding-right: 6px;
          WebkitOverflowScrolling: touch;
          overscroll-behavior: contain;
        }
      `}</style>

      <div className="panel">
        <div className="panelTitle">Modération</div>
        <div className="mutedSmall" style={{ marginTop: 6 }}>
          Chaîne : <b>@{streamer.slug}</b>
        </div>
        {err ? (
          <div className="hint" style={{ opacity: 0.95, marginTop: 10 }}>
            ⚠️ {err}
          </div>
        ) : null}
      </div>

      {loading ? <div className="muted" style={{ marginTop: 10 }}>Chargement…</div> : null}

      <div className="llGridMod" style={loading ? { opacity: 0.85 } : undefined}>
        {/* LEFT */}
        <div className="panel">
          <div className="panelTitle">Modérateurs</div>

          <CardShell>
            <div className="mutedSmall" style={{ marginBottom: 8 }}>
              Ajouter un modérateur
            </div>

            <input
              className="llInput"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher un utilisateur…"
            />

            {searching ? <div className="mutedSmall" style={{ marginTop: 10 }}>Recherche…</div> : null}

            {results.length > 0 ? (
              <div className="llList">
                {results.map((u) => (
                  <div key={u.id} className="llRow">
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <AvatarPlaceholder name={u.username} />
                      <div style={{ fontWeight: 1000, overflow: "hidden", textOverflow: "ellipsis" }}>{u.username}</div>
                    </div>

                    <button
                      className="btnPrimarySmall"
                      disabled={isAlreadyMod(u.id)}
                      onClick={() => onAdd(u.id)}
                      title={isAlreadyMod(u.id) ? "Déjà modérateur" : "Ajouter"}
                    >
                      Ajouter
                    </button>
                  </div>
                ))}
              </div>
            ) : q.trim().length >= 2 && !searching ? (
              <div className="hint" style={{ marginTop: 10 }}>Aucun résultat.</div>
            ) : null}
          </CardShell>

          <div style={{ marginTop: 12, fontWeight: 1100 }}>Liste</div>

          {mods.length === 0 ? (
            <div className="hint" style={{ marginTop: 10 }}>Aucun modérateur pour le moment.</div>
          ) : (
            <div className="llList">
              {mods.map((m) => (
                <div key={m.id} className="llRow">
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <AvatarPlaceholder name={m.username} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 1050, overflow: "hidden", textOverflow: "ellipsis" }}>{m.username}</div>
                      <div className="mutedSmall" style={{ opacity: 0.8 }}>
                        Ajouté le {fmtDate(m.createdAt)}
                      </div>
                    </div>
                  </div>

                  <button className="btnGhostSmall" onClick={() => onRemove(m.id)}>
                    Retirer
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* BANS */}
          <div style={{ marginTop: 16, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 14 }}>
            <div className="panelTitle">Bannis</div>

            <CardShell>
              <div className="mutedSmall" style={{ marginBottom: 8 }}>
                Bannir un utilisateur
              </div>

              <input
                className="llInput"
                value={qBan}
                onChange={(e) => setQBan(e.target.value)}
                placeholder="Rechercher un utilisateur…"
              />

              {banSearching ? <div className="mutedSmall" style={{ marginTop: 10 }}>Recherche…</div> : null}

              {banResults.length > 0 ? (
                <div className="llList">
                  {banResults.map((u) => (
                    <div key={u.id} className="llRow">
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <AvatarPlaceholder name={u.username} />
                        <div style={{ fontWeight: 1000, overflow: "hidden", textOverflow: "ellipsis" }}>{u.username}</div>
                      </div>

                      <button
                        className="btnPrimarySmall"
                        disabled={isAlreadyBanned(u.id)}
                        onClick={() => onBan(u.id)}
                        title={isAlreadyBanned(u.id) ? "Déjà banni" : "Bannir"}
                      >
                        Bannir
                      </button>
                    </div>
                  ))}
                </div>
              ) : qBan.trim().length >= 2 && !banSearching ? (
                <div className="hint" style={{ marginTop: 10 }}>Aucun résultat.</div>
              ) : null}
            </CardShell>

            <div style={{ marginTop: 12, fontWeight: 1100 }}>Liste</div>

            {bans.length === 0 ? (
              <div className="hint" style={{ marginTop: 10 }}>Aucun banni pour le moment.</div>
            ) : (
              <div className="llList">
                {bans.map((b) => (
                  <div key={b.id} className="llRow">
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <AvatarPlaceholder name={b.username} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 1050, overflow: "hidden", textOverflow: "ellipsis" }}>{b.username}</div>
                        <div className="mutedSmall" style={{ opacity: 0.8 }}>
                          Banni le {fmtDate(b.createdAt)}
                        </div>
                        {b.reason ? (
                          <div className="mutedSmall" style={{ opacity: 0.75 }}>
                            Raison : {b.reason}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <button className="btnGhostSmall" onClick={() => onUnban(b.id)}>
                      Débannir
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT */}
        <div className="panel">
          <div className="panelTitle">Events modération</div>

          {events.length === 0 ? (
            <div className="hint" style={{ marginTop: 10 }}>Aucun event pour le moment.</div>
          ) : (
            <CardShell>
              <div className="llScroll">
                {events.map((e) => (
                  <div key={e.id} className="llRow">
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 1050 }}>
                        {typeLabel(e.type)}{" "}
                        <span style={{ opacity: 0.65, fontWeight: 900 }}>· {fmtDate(e.createdAt)}</span>
                      </div>

                      <div className="mutedSmall" style={{ marginTop: 2, opacity: 0.85 }}>
                        {e.actorUsername ? <b>{e.actorUsername}</b> : "—"}
                        {e.targetUsername ? (
                          <span>
                            {" "}
                            → <b>{e.targetUsername}</b>
                          </span>
                        ) : null}
                      </div>

                      {e.messagePreview ? (
                        <div className="mutedSmall" style={{ marginTop: 6, opacity: 0.78 }}>
                          “{e.messagePreview}”
                        </div>
                      ) : null}
                    </div>

                    <button className="btnGhostSmall" onClick={() => openDetails(e.id)}>
                      Détails
                    </button>
                  </div>
                ))}
              </div>
            </CardShell>
          )}
        </div>
      </div>

      {/* MODAL DETAILS */}
      {openId ? (
        <div className="modalBackdrop" onMouseDown={() => setOpenId(null)}>
          <div className="modalBox" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div className="modalTitle">Détail event</div>
              <button className="btnGhostSmall" onClick={() => setOpenId(null)}>
                Fermer
              </button>
            </div>

            <div className="modalBody">
              {detailLoading ? (
                <div className="muted">Chargement…</div>
              ) : !detail ? (
                <div className="hint">Impossible de charger le détail.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <CardShell>
                    <div style={{ fontWeight: 1050 }}>{typeLabel(detail.type)}</div>
                    <div className="mutedSmall" style={{ opacity: 0.8 }}>
                      {fmtDate(detail.createdAt)}
                    </div>
                    <div className="mutedSmall" style={{ marginTop: 6, opacity: 0.85 }}>
                      {detail.actorUsername ? <b>{detail.actorUsername}</b> : "—"}
                      {detail.targetUsername ? (
                        <span>
                          {" "}
                          → <b>{detail.targetUsername}</b>
                        </span>
                      ) : null}
                    </div>
                  </CardShell>

                  {parsedOpen?.kind === "ban" || parsedOpen?.kind === "mute" ? (
                    <CardShell>
                      <div style={{ fontWeight: 1050 }}>Actions</div>

                      {actionErr ? (
                        <div className="hint" style={{ opacity: 0.95, marginTop: 10 }}>
                          ⚠️ {actionErr}
                        </div>
                      ) : null}

                      <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
                        {parsedOpen?.kind === "ban" ? (
                          <button
                            className="btnPrimarySmall"
                            onClick={doUnban}
                            disabled={actionLoading || !banIsActive}
                            title={!banIsActive ? "Déjà débanni" : "Déban"}
                          >
                            {banIsActive ? "Déban" : "Déjà débanni"}
                          </button>
                        ) : null}

                        {parsedOpen?.kind === "mute" ? (
                          <button
                            className="btnPrimarySmall"
                            onClick={doUnmute}
                            disabled={actionLoading || !muteIsActive}
                            title={!muteIsActive ? "Déjà démute / expiré" : "Démute"}
                          >
                            {muteIsActive ? "Démute" : "Déjà démute / expiré"}
                          </button>
                        ) : null}

                        {actionLoading ? <div className="mutedSmall">Action en cours…</div> : null}
                      </div>

                      {parsedOpen?.kind === "mute" && timeoutExpiresAt ? (
                        <div className="mutedSmall" style={{ marginTop: 10, opacity: 0.85 }}>
                          Expire : <b>{fmtDate(timeoutExpiresAt)}</b>
                        </div>
                      ) : null}
                    </CardShell>
                  ) : null}

                  {detail.messageContent ? (
                    <CardShell>
                      <div style={{ fontWeight: 1050 }}>Message concerné</div>
                      <div
                        style={{
                          marginTop: 10,
                          padding: 12,
                          borderRadius: 16,
                          border: "1px solid rgba(255,255,255,0.10)",
                          background: "rgba(0,0,0,0.18)",
                          whiteSpace: "pre-wrap",
                          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                          fontSize: 13,
                        }}
                      >
                        {detail.messageContent}
                      </div>
                    </CardShell>
                  ) : null}

                  {detail.meta ? (
                    <CardShell>
                      <div style={{ fontWeight: 1050 }}>Meta</div>
                      <pre
                        style={{
                          marginTop: 10,
                          fontSize: 12,
                          opacity: 0.9,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {JSON.stringify(detail.meta, null, 2)}
                      </pre>
                    </CardShell>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
