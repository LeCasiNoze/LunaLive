import * as React from "react";
import type { ApiMyStreamer } from "../../../lib/api";
import { useAuth } from "../../../auth/AuthProvider";
import {
  addModerator,
  getModerationEventDetail,
  getModerationEvents,
  getMyModerators,
  removeModerator,
  searchUsersForModerator,
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
      return "Mute";
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
  const [events, setEvents] = React.useState<ApiModerationEventRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  // Search
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<ApiUserSearchRow[]>([]);
  const [searching, setSearching] = React.useState(false);

  // Details modal
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<ApiModerationEventDetail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);

  async function loadAll() {
    if (!token) return;
    setLoading(true);
    setErr(null);
    try {
      const [m, e] = await Promise.all([getMyModerators(token), getModerationEvents(token, 40)]);
      setMods(m.moderators);
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

  // Debounce search
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

  async function openDetails(id: string) {
    if (!token) return;
    setOpenId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const r = await getModerationEventDetail(token, id);
      setDetail(r.event);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  const isAlreadyMod = React.useMemo(() => {
    const s = new Set(mods.map((m) => m.id));
    return (id: number) => s.has(id);
  }, [mods]);

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

  const useMobile = typeof window !== "undefined" && window.matchMedia?.("(max-width: 980px)")?.matches;

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
        {/* MODERATORS */}
        <div className="panel">
          <div className="panelTitle">Modérateurs</div>

          <div className="field" style={{ marginTop: 10 }}>
            <label>Ajouter un modérateur</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher un utilisateur…"
            />
          </div>

          {searching ? <div className="hint">Recherche…</div> : null}

          {results.length > 0 ? (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {results.map((u) => (
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
                    onClick={() => onAdd(u.id)}
                    title={isAlreadyMod(u.id) ? "Déjà modérateur" : "Ajouter"}
                  >
                    Ajouter
                  </button>
                </div>
              ))}
            </div>
          ) : q.trim().length >= 2 && !searching ? (
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

                  <button className="btnGhostSmall" onClick={() => onRemove(m.id)}>
                    Retirer
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* EVENTS */}
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
                      {e.actorUsername ? <span><b>{e.actorUsername}</b></span> : <span>—</span>}
                      {e.targetUsername ? <span> → <b>{e.targetUsername}</b></span> : null}
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
                      {detail.actorUsername ? <span><b>{detail.actorUsername}</b></span> : <span>—</span>}
                      {detail.targetUsername ? <span> → <b>{detail.targetUsername}</b></span> : null}
                    </div>
                  </div>

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
