import * as React from "react";
import type { ApiMyStreamer } from "../../../lib/api";
import { useAuth } from "../../../auth/AuthProvider";
import {
  // MODS
  addModerator,
  getMyModerators,
  removeModerator,
  searchUsersForModerator,

  // BANS
  banUserFromDashboard,
  getMyBans,
  searchUsersForBan,
  unbanUserFromDashboard,

  // EVENTS
  getModerationEventDetail,
  getModerationEvents,
  unmuteTimeoutFromDashboard,

  type ApiModerationEventDetail,
  type ApiModerationEventRow,
  type ApiModeratorRow,
  type ApiUserSearchRow,
  type ApiBannedRow,
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
  const m = raw.match(/^([a-z_]+)(?:\||~)(.+)$/i); // accepte "ban|6" ou "ban~6"
  if (!m) return null;
  return { kind: m[1], key: m[2] };
}

function AvatarPlaceholder({ name }: { name: string }) {
  const letter = (name || "?").slice(0, 1).toUpperCase();
  return (
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: 999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 950,
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

export function ModerationSection({ streamer }: { streamer: ApiMyStreamer }) {
  const { token } = useAuth();

  const [mods, setMods] = React.useState<ApiModeratorRow[]>([]);
  const [bans, setBans] = React.useState<ApiBannedRow[]>([]);
  const [events, setEvents] = React.useState<ApiModerationEventRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  // Search MODS
  const [qMod, setQMod] = React.useState("");
  const [modResults, setModResults] = React.useState<ApiUserSearchRow[]>([]);
  const [searchingMod, setSearchingMod] = React.useState(false);

  // Search BANS
  const [qBan, setQBan] = React.useState("");
  const [banResults, setBanResults] = React.useState<ApiUserSearchRow[]>([]);
  const [searchingBan, setSearchingBan] = React.useState(false);

  // Details modal
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<ApiModerationEventDetail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);

  // Actions (modal)
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
        getModerationEvents(token, 40),
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

  // Debounce search MODS
  React.useEffect(() => {
    if (!token) return;
    const qq = qMod.trim();
    if (qq.length < 2) {
      setModResults([]);
      setSearchingMod(false);
      return;
    }

    setSearchingMod(true);
    const id = window.setTimeout(async () => {
      try {
        const r = await searchUsersForModerator(token, qq);
        setModResults(r.users);
      } catch {
        setModResults([]);
      } finally {
        setSearchingMod(false);
      }
    }, 250);

    return () => window.clearTimeout(id);
  }, [qMod, token]);

  // Debounce search BANS
  React.useEffect(() => {
    if (!token) return;
    const qq = qBan.trim();
    if (qq.length < 2) {
      setBanResults([]);
      setSearchingBan(false);
      return;
    }

    setSearchingBan(true);
    const id = window.setTimeout(async () => {
      try {
        const r = await searchUsersForBan(token, qq);
        setBanResults(r.users);
      } catch {
        setBanResults([]);
      } finally {
        setSearchingBan(false);
      }
    }, 250);

    return () => window.clearTimeout(id);
  }, [qBan, token]);

  async function onAddMod(userId: number) {
    if (!token) return;
    try {
      await addModerator(token, userId);
      setQMod("");
      setModResults([]);
      await loadAll();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    }
  }

  async function onRemoveMod(userId: number) {
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

  async function doUnbanFromModal() {
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

  async function doUnmuteFromModal() {
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

  const layout: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1.2fr",
    gap: 14,
    alignItems: "start",
  };

  const mobileLayout: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 14,
  };

  const useMobile =
    typeof window !== "undefined" && window.matchMedia?.("(max-width: 980px)")?.matches;

  // ---- Status “actif ?” (basé sur meta du détail)
  const parsedOpen = openId ? parseEventId(openId) : null;
  const metaAny: any = detail?.meta || {};
  const banRevokedAt = metaAny?.revokedAt ? String(metaAny.revokedAt) : null;
  const timeoutLiftedAt = metaAny?.liftedAt ? String(metaAny.liftedAt) : null;
  const timeoutExpiresAt = metaAny?.expiresAt ? String(metaAny.expiresAt) : null;

  const banIsActive = !!detail && parsedOpen?.kind === "ban" && !banRevokedAt;
  const muteIsActive =
    !!detail &&
    parsedOpen?.kind === "mute" &&
    !timeoutLiftedAt &&
    !!timeoutExpiresAt &&
    new Date(timeoutExpiresAt).getTime() > Date.now();

  return (
    <div>
      <div className="panel">
        <div className="panelTitle">Modération</div>
        <div className="muted">Chaîne : @{streamer.slug}</div>
        {err ? (
          <div className="hint" style={{ opacity: 0.9 }}>
            ⚠️ {err}
          </div>
        ) : null}
      </div>

      {loading ? <div className="muted">Chargement…</div> : null}

      <div style={useMobile ? mobileLayout : layout}>
        {/* LEFT: MODS + BANS */}
        <div className="panel">
          <div className="panelTitle">Modérateurs</div>

          {/* ADD MOD */}
          <div className="field" style={{ marginTop: 10 }}>
            <label>Ajouter un modérateur</label>
            <input
              value={qMod}
              onChange={(e) => setQMod(e.target.value)}
              placeholder="Rechercher un utilisateur…"
            />
          </div>

          {searchingMod ? <div className="hint">Recherche…</div> : null}

          {modResults.length > 0 ? (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {modResults.map((u) => (
                <div
                  key={u.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "10px 10px",
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.03)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <AvatarPlaceholder name={u.username} />
                    <div style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {u.username}
                    </div>
                  </div>

                  <button
                    className="btnPrimarySmall"
                    disabled={isAlreadyMod(u.id)}
                    onClick={() => onAddMod(u.id)}
                    title={isAlreadyMod(u.id) ? "Déjà modérateur" : "Ajouter"}
                  >
                    Ajouter
                  </button>
                </div>
              ))}
            </div>
          ) : qMod.trim().length >= 2 && !searchingMod ? (
            <div className="hint">Aucun résultat.</div>
          ) : null}

          <div style={{ marginTop: 14, fontWeight: 950 }}>Liste</div>

          {mods.length === 0 ? (
            <div className="hint">Aucun modérateur pour le moment.</div>
          ) : (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {mods.map((m) => (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "10px 10px",
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.03)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <AvatarPlaceholder name={m.username} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {m.username}
                      </div>
                      <div className="mutedSmall">Ajouté le {fmtDate(m.createdAt)}</div>
                    </div>
                  </div>

                  <button className="btnGhostSmall" onClick={() => onRemoveMod(m.id)}>
                    Retirer
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Divider */}
          <div
            style={{
              marginTop: 18,
              marginBottom: 10,
              height: 1,
              background: "rgba(255,255,255,0.08)",
            }}
          />

          {/* BANS SECTION */}
          <div className="panelTitle" style={{ fontSize: 16 }}>
            Bannis
          </div>

          {/* ADD BAN */}
          <div className="field" style={{ marginTop: 10 }}>
            <label>Bannir un utilisateur</label>
            <input
              value={qBan}
              onChange={(e) => setQBan(e.target.value)}
              placeholder="Rechercher un utilisateur…"
            />
          </div>

          {searchingBan ? <div className="hint">Recherche…</div> : null}

          {banResults.length > 0 ? (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {banResults.map((u) => (
                <div
                  key={u.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "10px 10px",
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.03)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <AvatarPlaceholder name={u.username} />
                    <div style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {u.username}
                    </div>
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
          ) : qBan.trim().length >= 2 && !searchingBan ? (
            <div className="hint">Aucun résultat.</div>
          ) : null}

          <div style={{ marginTop: 14, fontWeight: 950 }}>Liste</div>

          {bans.length === 0 ? (
            <div className="hint">Aucun banni pour le moment.</div>
          ) : (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {bans.map((b) => (
                <div
                  key={b.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "10px 10px",
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.03)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <AvatarPlaceholder name={b.username} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {b.username}
                      </div>
                      <div className="mutedSmall">
                        Banni le {fmtDate(b.createdAt)}
                        {b.reason ? <span style={{ opacity: 0.85 }}> · “{b.reason}”</span> : null}
                      </div>
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

        {/* RIGHT: EVENTS */}
        <div className="panel">
          <div className="panelTitle">Events modération</div>

          {events.length === 0 ? (
            <div className="hint">Aucun event pour le moment.</div>
          ) : (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {events.map((e) => (
                <div
                  key={e.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "10px 10px",
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.03)",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 950 }}>
                      {typeLabel(e.type)}
                      <span style={{ opacity: 0.6, fontWeight: 800 }}> · {fmtDate(e.createdAt)}</span>
                    </div>

                    <div className="mutedSmall" style={{ marginTop: 2 }}>
                      {e.actorUsername ? (
                        <span>
                          <b>{e.actorUsername}</b>
                        </span>
                      ) : (
                        <span>—</span>
                      )}
                      {e.targetUsername ? (
                        <span>
                          {" "}
                          → <b>{e.targetUsername}</b>
                        </span>
                      ) : null}
                    </div>

                    {e.messagePreview ? (
                      <div className="mutedSmall" style={{ marginTop: 6, opacity: 0.8 }}>
                        “{e.messagePreview}”
                      </div>
                    ) : null}
                  </div>

                  <button className="btnGhostSmall" onClick={() => openDetails(e.id)}>
                    Plus de détail
                  </button>
                </div>
              ))}
            </div>
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
                  <div className="panel" style={{ marginTop: 0 }}>
                    <div style={{ fontWeight: 950 }}>{typeLabel(detail.type)}</div>
                    <div className="mutedSmall">{fmtDate(detail.createdAt)}</div>
                    <div className="mutedSmall" style={{ marginTop: 6 }}>
                      {detail.actorUsername ? (
                        <span>
                          <b>{detail.actorUsername}</b>
                        </span>
                      ) : (
                        <span>—</span>
                      )}
                      {detail.targetUsername ? (
                        <span>
                          {" "}
                          → <b>{detail.targetUsername}</b>
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* ACTIONS MODAL */}
                  {parsedOpen?.kind === "ban" || parsedOpen?.kind === "mute" ? (
                    <div className="panel" style={{ marginTop: 0 }}>
                      <div style={{ fontWeight: 950 }}>Actions</div>

                      {actionErr ? (
                        <div className="hint" style={{ opacity: 0.95, marginTop: 8 }}>
                          ⚠️ {actionErr}
                        </div>
                      ) : null}

                      <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                        {parsedOpen?.kind === "ban" ? (
                          <button
                            className="btnPrimarySmall"
                            onClick={doUnbanFromModal}
                            disabled={actionLoading || !banIsActive}
                            title={!banIsActive ? "Déjà débanni" : "Déban"}
                          >
                            {banIsActive ? "Déban" : "Déjà débanni"}
                          </button>
                        ) : null}

                        {parsedOpen?.kind === "mute" ? (
                          <button
                            className="btnPrimarySmall"
                            onClick={doUnmuteFromModal}
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
                          {timeoutLiftedAt ? (
                            <>
                              {" "}
                              · Levé : <b>{fmtDate(timeoutLiftedAt)}</b>
                            </>
                          ) : null}
                        </div>
                      ) : null}

                      {parsedOpen?.kind === "ban" && banRevokedAt ? (
                        <div className="mutedSmall" style={{ marginTop: 10, opacity: 0.85 }}>
                          Débanni : <b>{fmtDate(banRevokedAt)}</b>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {detail.messageContent ? (
                    <div className="panel" style={{ marginTop: 0 }}>
                      <div style={{ fontWeight: 950 }}>Message concerné</div>
                      <div
                        style={{
                          marginTop: 8,
                          padding: 10,
                          borderRadius: 14,
                          border: "1px solid rgba(255,255,255,0.10)",
                          background: "rgba(0,0,0,0.18)",
                          whiteSpace: "pre-wrap",
                          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                          fontSize: 13,
                        }}
                      >
                        {detail.messageContent}
                      </div>
                    </div>
                  ) : null}

                  {detail.meta ? (
                    <div className="panel" style={{ marginTop: 0 }}>
                      <div style={{ fontWeight: 950 }}>Meta</div>
                      <pre
                        style={{
                          marginTop: 8,
                          fontSize: 12,
                          opacity: 0.9,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {JSON.stringify(detail.meta, null, 2)}
                      </pre>
                    </div>
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
