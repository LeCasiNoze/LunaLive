// AutopostsModule.tsx
import * as React from "react";
import { BOT_TEXT_MAX, normalizeMultiline } from "../text";
import {
  createMyBotAutopost,
  deleteMyBotAutopost,
  updateMyBotAutopost,
  type ApiBotAutopost,
} from "../api";

function norm(s: any) {
  return String(s ?? "").trim();
}

function clampText(s: string, maxChars: number) {
  const t = String(s ?? "");
  if (t.length <= maxChars) return { text: t, clipped: false };
  return { text: t.slice(0, Math.max(0, maxChars)).trimEnd() + "…", clipped: true };
}

const FIXED_EVERY_SEC = 600;

export function AutopostsModule({
  token,
  autoposts,
  onReload,
}: {
  token: string;
  autoposts: ApiBotAutopost[];
  onReload: () => Promise<void>;
}) {
  const [newMsg, setNewMsg] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  // ✅ édition (message only)
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editMsg, setEditMsg] = React.useState("");
  const [savingId, setSavingId] = React.useState<string | null>(null);

  // ✅ UI helpers
  const [search, setSearch] = React.useState("");
  const [onlyEnabled, setOnlyEnabled] = React.useState(false);
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const safeSetCopied = React.useCallback((id: string) => {
    setCopiedId(id);
    window.setTimeout(() => setCopiedId((x) => (x === id ? null : x)), 900);
  }, []);

  const counts = React.useMemo(() => {
    const total = autoposts.length;
    const enabledCount = autoposts.filter((p) => p.enabled).length;
    return { total, enabledCount };
  }, [autoposts]);

  const sortedFiltered = React.useMemo(() => {
    const q = norm(search).toLowerCase();
    const list = [...autoposts];

    const filtered = list.filter((p) => {
      if (onlyEnabled && !p.enabled) return false;
      if (!q) return true;
      const hay = `${p.message ?? ""}\n${p.enabled ? "enabled" : "disabled"}`.toLowerCase();
      return hay.includes(q);
    });

    filtered.sort((a, b) => {
      const ea = a.enabled ? 0 : 1;
      const eb = b.enabled ? 0 : 1;
      if (ea !== eb) return ea - eb;
      return String(b.id).localeCompare(String(a.id), "fr", { sensitivity: "base" });
    });

    return filtered;
  }, [autoposts, search, onlyEnabled]);

  async function add() {
    setErr(null);

    const message = normalizeMultiline(newMsg);
    if (!message.trim()) return setErr("Message manquant.");

    setBusy(true);
    try {
      await createMyBotAutopost(token, {
        message,
        everySec: FIXED_EVERY_SEC,
        enabled: true,
      });
      setNewMsg("");
      await onReload();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBusy(false);
    }
  }

  function startEdit(p: ApiBotAutopost) {
    setErr(null);
    setEditingId(p.id);
    setEditMsg(p.message ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditMsg("");
  }

  async function saveEdit(id: string) {
    setErr(null);

    const message = normalizeMultiline(editMsg);
    if (!message.trim()) return setErr("Message manquant.");

    setSavingId(id);
    try {
      await updateMyBotAutopost(token, id, {
        message,
        everySec: FIXED_EVERY_SEC,
      });
      setEditingId(null);
      await onReload();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setSavingId(null);
    }
  }

  async function toggleEnabled(p: ApiBotAutopost) {
    if (busy || savingId) return;
    setErr(null);
    setSavingId(p.id);
    try {
      await updateMyBotAutopost(token, p.id, { enabled: !p.enabled });
      await onReload();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setSavingId(null);
    }
  }

  async function removeAuto(p: ApiBotAutopost) {
    if (busy || savingId) return;
    setErr(null);

    const ok = window.confirm("Supprimer ce message automatique ?");
    if (!ok) return;

    setSavingId(p.id);
    try {
      await deleteMyBotAutopost(token, p.id);
      await onReload();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setSavingId(null);
    }
  }

  function pillStyle(tone: "green" | "gray" | "pink") {
    const map = {
      green: {
        bg: "rgba(70, 220, 140, 0.15)",
        bd: "rgba(70, 220, 140, 0.35)",
        tx: "rgba(210, 255, 230, 0.95)",
      },
      gray: {
        bg: "rgba(255,255,255,0.06)",
        bd: "rgba(255,255,255,0.12)",
        tx: "rgba(255,255,255,0.78)",
      },
      pink: {
        bg: "rgba(255, 90, 170, 0.14)",
        bd: "rgba(255, 90, 170, 0.35)",
        tx: "rgba(255, 225, 240, 0.95)",
      },
    }[tone];

    return {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "6px 10px",
      borderRadius: 999,
      border: `1px solid ${map.bd}`,
      background: map.bg,
      color: map.tx,
      fontSize: 12,
      fontWeight: 900 as const,
      letterSpacing: 0.2,
      userSelect: "none" as const,
      whiteSpace: "nowrap" as const,
    };
  }

  const cardBase: React.CSSProperties = {
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(0,0,0,0.10)",
    padding: 12,
  };

  const everyLabel = React.useMemo(() => {
    const m = Math.round(FIXED_EVERY_SEC / 60);
    return `${m} min`;
  }, []);

  // ✅ IMPORTANT: wrap des longues chaînes sans espaces
  const longTextBoxStyle: React.CSSProperties = {
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    lineHeight: 1.35,
    padding: 10,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(0,0,0,0.14)",
    position: "relative",
    overflow: "hidden",
  };

  return (
    <div className="panel" style={{ padding: 14, borderRadius: 18 }}>
      {/* HEADER */}
      <div
        className="panelTitle"
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span>Messages automatiques</span>
          <span className="muted" style={{ fontSize: 12, opacity: 0.85 }}>
            Intervalle fixe: <b>{everyLabel}</b> — {counts.enabledCount}/{counts.total} actifs
          </span>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={pillStyle("gray")}>Max message: {BOT_TEXT_MAX}</span>
          <span style={pillStyle("pink")}>Live-only géré côté bot</span>
        </div>
      </div>

      {err && (
        <div className="hint" style={{ marginTop: 10 }}>
          ⚠️ {err}
        </div>
      )}

      {/* ADD */}
      <div style={{ marginTop: 12, ...cardBase }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ flex: "1 1 420px", minWidth: 240 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                alignItems: "baseline",
                marginBottom: 6,
              }}
            >
              <div className="muted" style={{ fontSize: 12, fontWeight: 900, opacity: 0.8 }}>
                Message
              </div>
              <div className="muted" style={{ fontSize: 12, fontWeight: 900, opacity: 0.8 }}>
                {newMsg.length}/{BOT_TEXT_MAX}
              </div>
            </div>

            <textarea
              value={newMsg}
              onChange={(e) => setNewMsg(e.target.value)}
              placeholder="Message automatique… (retours à la ligne OK)"
              maxLength={BOT_TEXT_MAX}
              rows={3}
              disabled={busy}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(0,0,0,0.12)",
                color: "inherit",
                resize: "vertical",
                lineHeight: 1.25,
                outline: "none",
              }}
            />

            <div
              className="muted"
              style={{
                marginTop: 8,
                fontSize: 12,
                display: "flex",
                justifyContent: "space-between",
                opacity: 0.8,
                fontWeight: 900,
              }}
            >
              <span>Intervalle</span>
              <span>
                {FIXED_EVERY_SEC}s ({everyLabel})
              </span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btnGhostInline" disabled={busy} onClick={add} style={{ fontWeight: 1000 }}>
              {busy ? "Ajout…" : "Ajouter"}
            </button>
            <button
              className="btnGhostInline"
              disabled={busy || !newMsg}
              onClick={() => {
                setNewMsg("");
                setErr(null);
              }}
              title="Vider"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* TOOLBAR */}
      <div style={{ marginTop: 12, ...cardBase }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher dans les messages…"
            style={{
              flex: "1 1 320px",
              minWidth: 220,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(0,0,0,0.12)",
              color: "inherit",
              outline: "none",
            }}
          />

          <button
            className="btnGhostInline"
            onClick={() => setOnlyEnabled((x) => !x)}
            title="Filtrer"
            style={{
              opacity: onlyEnabled ? 1 : 0.85,
              borderColor: onlyEnabled ? "rgba(70, 220, 140, 0.45)" : undefined,
            }}
          >
            {onlyEnabled ? "Actifs uniquement" : "Tous"}
          </button>

          <span style={pillStyle("gray")}>
            Affichés: {sortedFiltered.length}/{autoposts.length}
          </span>
        </div>
      </div>

      {/* LIST */}
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {sortedFiltered.length === 0 ? (
          <div className="muted" style={{ opacity: 0.9 }}>
            Aucun auto-message.
          </div>
        ) : (
          sortedFiltered.map((p) => {
            const isEditing = editingId === p.id;
            const isSaving = savingId === p.id;

            const isLong = String(p.message ?? "").length > 220;
            const isExpanded = !!expanded[p.id];
            const display = isExpanded
              ? { text: String(p.message ?? ""), clipped: false }
              : clampText(String(p.message ?? ""), 220);

            const disabledStyle = !p.enabled
              ? ({
                  opacity: 0.72,
                  filter: "saturate(0.8)",
                } as React.CSSProperties)
              : undefined;

            return (
              <div key={p.id} style={{ ...cardBase, ...disabledStyle }}>
                {!isEditing ? (
                  <>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        alignItems: "flex-start",
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 1000, fontSize: 14 }}>Auto-post</div>

                        <span style={pillStyle("gray")}>
                          {FIXED_EVERY_SEC}s ({everyLabel})
                        </span>
                        <span style={pillStyle(p.enabled ? "green" : "gray")}>
                          {p.enabled ? "Actif" : "Désactivé"}
                        </span>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button className="btnGhostInline" disabled={isSaving || busy} onClick={() => toggleEnabled(p)}>
                          {isSaving ? "…" : p.enabled ? "Désactiver" : "Activer"}
                        </button>

                        <button className="btnGhostInline" disabled={isSaving || busy} onClick={() => startEdit(p)}>
                          Modifier
                        </button>

                        <button
                          className="btnGhostInline"
                          disabled={isSaving || busy}
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(p.message ?? "");
                              safeSetCopied(p.id);
                            } catch {
                              // ignore
                            }
                          }}
                          title="Copier le message"
                        >
                          {copiedId === p.id ? "Copié ✅" : "Copier"}
                        </button>

                        <button className="btnGhostInline" disabled={isSaving || busy} onClick={() => removeAuto(p)}>
                          Supprimer
                        </button>
                      </div>
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <div className="muted" style={longTextBoxStyle}>
                        {display.text || <span style={{ opacity: 0.7 }}>(vide)</span>}

                        {!isExpanded && isLong && (
                          <div
                            style={{
                              position: "absolute",
                              left: 0,
                              right: 0,
                              bottom: 0,
                              height: 36,
                              background:
                                "linear-gradient(to bottom, rgba(0,0,0,0.0), rgba(0,0,0,0.30), rgba(0,0,0,0.55))",
                              pointerEvents: "none",
                            }}
                          />
                        )}
                      </div>

                      {(isLong || display.clipped) && (
                        <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <button
                            className="btnGhostInline"
                            onClick={() => setExpanded((m) => ({ ...m, [p.id]: !m[p.id] }))}
                            style={{ opacity: 0.95 }}
                          >
                            {isExpanded ? "Réduire" : "Voir plus"}
                          </button>

                          <div className="muted" style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>
                            {String(p.message ?? "").length}/{BOT_TEXT_MAX}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        alignItems: "flex-start",
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 1000 }}>Édition</div>
                        <span style={pillStyle("gray")}>
                          Intervalle fixe: {FIXED_EVERY_SEC}s ({everyLabel})
                        </span>
                        <span style={pillStyle(p.enabled ? "green" : "gray")}>
                          {p.enabled ? "Actif" : "Désactivé"}
                        </span>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          className="btnGhostInline"
                          disabled={isSaving}
                          onClick={() => saveEdit(p.id)}
                          style={{ fontWeight: 1000 }}
                        >
                          {isSaving ? "Sauvegarde…" : "Enregistrer"}
                        </button>
                        <button className="btnGhostInline" disabled={isSaving} onClick={cancelEdit}>
                          Annuler
                        </button>
                      </div>
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                          alignItems: "baseline",
                          marginBottom: 6,
                        }}
                      >
                        <div className="muted" style={{ fontSize: 12, fontWeight: 900, opacity: 0.8 }}>
                          Message
                        </div>
                        <div className="muted" style={{ fontSize: 12, fontWeight: 900, opacity: 0.8 }}>
                          {editMsg.length}/{BOT_TEXT_MAX}
                        </div>
                      </div>

                      <textarea
                        value={editMsg}
                        onChange={(e) => setEditMsg(e.target.value)}
                        placeholder="message"
                        maxLength={BOT_TEXT_MAX}
                        rows={4}
                        disabled={isSaving}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.12)",
                          background: "rgba(0,0,0,0.12)",
                          color: "inherit",
                          resize: "vertical",
                          lineHeight: 1.25,
                          outline: "none",
                        }}
                      />
                      <div
                        className="muted"
                        style={{
                          marginTop: 6,
                          fontSize: 12,
                          display: "flex",
                          justifyContent: "space-between",
                          fontWeight: 900,
                          opacity: 0.8,
                        }}
                      >
                        <span>Astuce: retours à la ligne OK</span>
                        <span>
                          {FIXED_EVERY_SEC}s ({everyLabel})
                        </span>
                      </div>
                    </div>

                    <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        className="btnGhostInline"
                        disabled={isSaving}
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(normalizeMultiline(editMsg));
                            safeSetCopied(p.id);
                          } catch {
                            // ignore
                          }
                        }}
                      >
                        {copiedId === p.id ? "Copié ✅" : "Copier le message"}
                      </button>

                      <button
                        className="btnGhostInline"
                        disabled={isSaving}
                        onClick={() => setEditMsg(String(p.message ?? ""))}
                        title="Revenir à la version sauvegardée"
                      >
                        Revenir
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
