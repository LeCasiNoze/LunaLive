// web/src/components/BotMenu.tsx
import * as React from "react";

function apiBase() {
  return (import.meta as any).env?.VITE_API_BASE || "https://lunalive-api.onrender.com";
}

type SlotItem = { name: string; provider: string | null };
type CallItem = {
  id: string;
  slotName: string;
  provider: string | null;
  username: string;
  pos: number;
};

export function BotMenu({
  open,
  onClose,
  slug,
  token,
  role,
  canMod,
  onRequireLogin,
  sendBang,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  token: string | null;
  role?: "guest" | "viewer" | "mod" | "streamer" | "admin";
  canMod: boolean;
  onRequireLogin: () => void;
  // envoie via socket -> "!call ..." etc.
  sendBang: (text: string) => void;
}) {
  const [q, setQ] = React.useState("");
  const [items, setItems] = React.useState<SlotItem[]>([]);
  const [loading, setLoading] = React.useState(false);

  const [calls, setCalls] = React.useState<CallItem[]>([]);
  const [callsLoading, setCallsLoading] = React.useState(false);

  const [tab, setTab] = React.useState<"call" | "queue" | "settings">("call");

  React.useEffect(() => {
    if (!open) return;
    setQ("");
    setItems([]);
    setTab("call");
  }, [open]);

  async function fetchSuggestions(text: string) {
    const s = String(text || "").trim();
    if (s.length < 2) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(`${apiBase()}/slots/search?q=${encodeURIComponent(s)}&limit=10`);
      const j = await r.json();
      if (j?.ok) setItems(j.items || []);
      else setItems([]);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  // debounce
  React.useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      fetchSuggestions(q).catch(() => {});
    }, 120);
    return () => window.clearTimeout(t);
  }, [q, open]);

  async function loadQueue() {
    if (!token) return;
    setCallsLoading(true);
    try {
      const r = await fetch(`${apiBase()}/calls/${encodeURIComponent(slug)}/list?limit=80`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await r.json();
      if (j?.ok) setCalls(j.items || []);
      else setCalls([]);
    } catch {
      setCalls([]);
    } finally {
      setCallsLoading(false);
    }
  }

  async function doReset() {
    if (!token) return onRequireLogin();
    const ok = window.confirm("Reset la file de calls ?");
    if (!ok) return;

    const r = await fetch(`${apiBase()}/calls/${encodeURIComponent(slug)}/reset`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).then((x) => x.json());

    if (r?.ok) {
      window.dispatchEvent(new CustomEvent("ui:toast", { detail: { kind: "success", title: "Calls reset ✅" } }));
      await loadQueue();
    } else {
      window.dispatchEvent(
        new CustomEvent("ui:toast", { detail: { kind: "error", title: "Erreur", message: r?.error || "reset_failed" } })
      );
    }
  }

  async function doDelete(id: string) {
    if (!token) return onRequireLogin();

    const r = await fetch(`${apiBase()}/calls/${encodeURIComponent(slug)}/item/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }).then((x) => x.json());

    if (r?.ok) {
      await loadQueue();
    } else {
      window.dispatchEvent(
        new CustomEvent("ui:toast", { detail: { kind: "error", title: "Erreur", message: r?.error || "delete_failed" } })
      );
    }
  }

  if (!open) return null;

  const isAuthed = !!token;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 120,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: 14,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 560,
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(18,14,26,0.98)",
          boxShadow: "0 20px 80px rgba(0,0,0,0.55)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div style={{ fontWeight: 950 }}>🤖 LunaBot</div>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 10px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.06)",
              color: "white",
              fontWeight: 900,
              cursor: "pointer",
            }}
            aria-label="Fermer"
            title="Fermer"
          >
            ✕
          </button>
        </div>

        {/* tabs */}
        <div style={{ display: "flex", gap: 8, padding: 12, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {(["call", "queue"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={async () => {
                if (k === "queue" && canMod && token) await loadQueue();
                setTab(k);
              }}
              style={{
                padding: "10px 12px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.10)",
                background: tab === k ? "rgba(124,77,255,0.20)" : "rgba(255,255,255,0.05)",
                color: "white",
                fontWeight: 950,
                cursor: "pointer",
              }}
            >
              {k === "call" ? "Call" : "File"}
            </button>
          ))}

          {!canMod ? (
            <div style={{ marginLeft: "auto", fontSize: 12, opacity: 0.75, fontWeight: 800, alignSelf: "center" }}>
              {role ? `Rôle: ${role}` : ""}
            </div>
          ) : null}
        </div>

        {/* content */}
        <div style={{ padding: 12 }}>
          {tab === "call" ? (
            <>
              {!isAuthed ? (
                <div style={{ padding: 12, borderRadius: 14, border: "1px solid rgba(255,255,255,0.10)", opacity: 0.9 }}>
                  <div style={{ fontWeight: 950 }}>Connecte-toi pour utiliser le bot</div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onRequireLogin();
                    }}
                    style={{
                      marginTop: 10,
                      width: "100%",
                      padding: "12px 12px",
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(124,77,255,0.22)",
                      color: "white",
                      fontWeight: 950,
                      cursor: "pointer",
                    }}
                  >
                    Se connecter
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ fontWeight: 900, opacity: 0.9, marginBottom: 8 }}>Choisis une machine :</div>

                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Tape le nom…"
                    style={{
                      width: "100%",
                      padding: "12px 12px",
                      borderRadius: 14,
                      outline: "none",
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(0,0,0,0.25)",
                      color: "white",
                      fontWeight: 800,
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const text = q.trim();
                        if (!text) return;
                        sendBang(`!call ${text}`);
                        onClose();
                      }
                    }}
                  />

                  <div style={{ marginTop: 10 }}>
                    {loading ? (
                      <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Suggestions…</div>
                    ) : null}

                    {items.length ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                        {items.map((it) => (
                          <button
                            key={it.name}
                            type="button"
                            onClick={() => {
                              sendBang(`!call ${it.name}`);
                              onClose();
                            }}
                            style={{
                              width: "100%",
                              padding: "10px 12px",
                              borderRadius: 14,
                              border: "1px solid rgba(255,255,255,0.10)",
                              background: "rgba(255,255,255,0.05)",
                              color: "white",
                              textAlign: "left",
                              fontWeight: 900,
                              cursor: "pointer",
                            }}
                          >
                            {it.name}
                            {it.provider ? <span style={{ opacity: 0.75, fontWeight: 800 }}> — {it.provider}</span> : null}
                          </button>
                        ))}
                      </div>
                    ) : q.trim().length >= 2 ? (
                      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7, fontWeight: 800 }}>
                        Aucune suggestion.
                      </div>
                    ) : null}
                  </div>

                  <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => sendBang("!listec")}
                      style={{
                        flex: 1,
                        padding: "12px 12px",
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(255,255,255,0.06)",
                        color: "white",
                        fontWeight: 950,
                        cursor: "pointer",
                      }}
                    >
                      Voir la liste (!listec)
                    </button>

                    {canMod ? (
                      <button
                        type="button"
                        onClick={() => sendBang("!resetc")}
                        style={{
                          padding: "12px 12px",
                          borderRadius: 14,
                          border: "1px solid rgba(255,255,255,0.10)",
                          background: "rgba(255,120,150,0.10)",
                          color: "white",
                          fontWeight: 950,
                          cursor: "pointer",
                        }}
                      >
                        Reset (!resetc)
                      </button>
                    ) : null}
                  </div>
                </>
              )}
            </>
          ) : null}

          {tab === "queue" ? (
            <>
              {!canMod ? (
                <div style={{ fontSize: 13, opacity: 0.8, fontWeight: 800 }}>
                  Accès réservé aux modérateurs / streamer / admin.
                </div>
              ) : !token ? (
                <div style={{ fontSize: 13, opacity: 0.8, fontWeight: 800 }}>
                  Connecte-toi pour accéder à la file.
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                    <button
                      type="button"
                      onClick={() => loadQueue()}
                      style={{
                        flex: 1,
                        padding: "10px 12px",
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(255,255,255,0.06)",
                        color: "white",
                        fontWeight: 950,
                        cursor: "pointer",
                      }}
                    >
                      Rafraîchir
                    </button>
                    <button
                      type="button"
                      onClick={() => doReset()}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(255,120,150,0.12)",
                        color: "white",
                        fontWeight: 950,
                        cursor: "pointer",
                      }}
                    >
                      Reset
                    </button>
                  </div>

                  {callsLoading ? (
                    <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Chargement…</div>
                  ) : !calls.length ? (
                    <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Aucun call.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {calls.map((c) => (
                        <div
                          key={c.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 10,
                            padding: "10px 12px",
                            borderRadius: 14,
                            border: "1px solid rgba(255,255,255,0.10)",
                            background: "rgba(255,255,255,0.05)",
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {c.pos}. {c.slotName}
                              {c.provider ? <span style={{ opacity: 0.75, fontWeight: 800 }}> — {c.provider}</span> : null}
                            </div>
                            <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75, fontWeight: 800 }}>
                              @ {c.username}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => doDelete(c.id)}
                            style={{
                              padding: "10px 12px",
                              borderRadius: 14,
                              border: "1px solid rgba(255,255,255,0.10)",
                              background: "rgba(255,120,150,0.12)",
                              color: "white",
                              fontWeight: 950,
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Supprimer
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
