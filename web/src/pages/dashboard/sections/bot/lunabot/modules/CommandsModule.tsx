// CommandsModule.tsx
import * as React from "react";
import { BOT_TEXT_MAX, normalizeMultiline } from "../text";
import {
  createMyBotCommand,
  deleteMyBotCommand,
  updateMyBotCommand,
  type ApiBotCommand,
} from "../api";

function norm(s: any) {
  return String(s ?? "").trim();
}

function clampText(s: string, maxChars: number) {
  const t = String(s ?? "");
  if (t.length <= maxChars) return { text: t, clipped: false };
  return { text: t.slice(0, Math.max(0, maxChars)).trimEnd() + "…", clipped: true };
}

export function CommandsModule({
  token,
  commands,
  onReload,
}: {
  token: string;
  commands: ApiBotCommand[];
  onReload: () => Promise<void>;
}) {
  const [newTrigger, setNewTrigger] = React.useState("");
  const [newResp, setNewResp] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  // ✅ édition
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editTrigger, setEditTrigger] = React.useState("");
  const [editResp, setEditResp] = React.useState("");
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

  const sortedFiltered = React.useMemo(() => {
    const q = norm(search).toLowerCase();
    const list = [...commands];

    const filtered = list.filter((c) => {
      if (onlyEnabled && !c.enabled) return false;
      if (!q) return true;
      const hay =
        `${c.trigger ?? ""}\n${c.response ?? ""}\n${c.enabled ? "enabled" : "disabled"}`.toLowerCase();
      return hay.includes(q);
    });

    filtered.sort((a, b) => {
      const ea = a.enabled ? 0 : 1;
      const eb = b.enabled ? 0 : 1;
      if (ea !== eb) return ea - eb;
      return String(a.trigger ?? "").localeCompare(String(b.trigger ?? ""), "fr", { sensitivity: "base" });
    });

    return filtered;
  }, [commands, search, onlyEnabled]);

  const counts = React.useMemo(() => {
    const total = commands.length;
    const enabledCount = commands.filter((c) => c.enabled).length;
    return { total, enabledCount };
  }, [commands]);

  async function add() {
    setErr(null);

    const trigger = norm(newTrigger);
    const response = normalizeMultiline(newResp);

    if (!trigger) return setErr("Trigger manquant.");
    if (trigger.includes(" ")) return setErr("Le trigger ne doit pas contenir d'espaces.");
    if (!response.trim()) return setErr("Réponse manquante.");

    setBusy(true);
    try {
      await createMyBotCommand(token, {
        trigger,
        response,
        enabled: true,
      });
      setNewTrigger("");
      setNewResp("");
      await onReload();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBusy(false);
    }
  }

  function startEdit(c: ApiBotCommand) {
    setErr(null);
    setEditingId(c.id);
    setEditTrigger(c.trigger);
    setEditResp(c.response ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTrigger("");
    setEditResp("");
  }

  async function saveEdit(id: string) {
    setErr(null);

    const trigger = norm(editTrigger);
    const response = normalizeMultiline(editResp);

    if (!trigger) return setErr("Trigger manquant.");
    if (trigger.includes(" ")) return setErr("Le trigger ne doit pas contenir d'espaces.");
    if (!response.trim()) return setErr("Réponse manquante.");

    setSavingId(id);
    try {
      await updateMyBotCommand(token, id, {
        trigger,
        response,
      });
      setEditingId(null);
      await onReload();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setSavingId(null);
    }
  }

  async function toggleEnabled(c: ApiBotCommand) {
    if (busy || savingId) return;
    setErr(null);
    setSavingId(c.id);
    try {
      await updateMyBotCommand(token, c.id, { enabled: !c.enabled });
      await onReload();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setSavingId(null);
    }
  }

  async function removeCmd(c: ApiBotCommand) {
    if (busy || savingId) return;
    setErr(null);

    const ok = window.confirm(`Supprimer la commande !${c.trigger} ?`);
    if (!ok) return;

    setSavingId(c.id);
    try {
      await deleteMyBotCommand(token, c.id);
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
          <span>Commandes personnalisées</span>
          <span className="muted" style={{ fontSize: 12, opacity: 0.85 }}>
            Prefix fixe: <b>!</b> — {counts.enabledCount}/{counts.total} actives
          </span>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={pillStyle("gray")}>Max réponse: {BOT_TEXT_MAX}</span>
          <span style={pillStyle("pink")}>Triggers: 32</span>
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
          <div style={{ flex: "0 0 220px", minWidth: 200 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 6, fontWeight: 900, opacity: 0.8 }}>
              Trigger
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div
                style={{
                  padding: "10px 10px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(0,0,0,0.12)",
                  fontWeight: 1000,
                  lineHeight: 1,
                  opacity: 0.9,
                }}
                title="Le préfixe est automatique"
              >
                !
              </div>
              <input
                value={newTrigger}
                onChange={(e) => setNewTrigger(e.target.value)}
                placeholder="ex: discord"
                maxLength={32}
                disabled={busy}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(0,0,0,0.12)",
                  color: "inherit",
                  outline: "none",
                }}
              />
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 6, opacity: 0.75 }}>
              Sans espaces. Exemple: <b>discord</b> → <b>!discord</b>
            </div>
          </div>

          <div style={{ flex: "1 1 360px", minWidth: 240 }}>
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
                Réponse
              </div>
              <div className="muted" style={{ fontSize: 12, fontWeight: 900, opacity: 0.8 }}>
                {newResp.length}/{BOT_TEXT_MAX}
              </div>
            </div>

            <textarea
              value={newResp}
              onChange={(e) => setNewResp(e.target.value)}
              placeholder="Ta réponse… (retours à la ligne OK)"
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
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btnGhostInline" disabled={busy} onClick={add} style={{ fontWeight: 1000 }}>
              {busy ? "Ajout…" : "Ajouter"}
            </button>
            <button
              className="btnGhostInline"
              disabled={busy || (!newTrigger && !newResp)}
              onClick={() => {
                setNewTrigger("");
                setNewResp("");
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
            placeholder="Rechercher (trigger ou contenu)…"
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
            {onlyEnabled ? "Actives uniquement" : "Toutes"}
          </button>

          <span style={pillStyle("gray")}>
            Affichées: {sortedFiltered.length}/{commands.length}
          </span>
        </div>
      </div>

      {/* LIST */}
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {sortedFiltered.length === 0 ? (
          <div className="muted" style={{ opacity: 0.9 }}>
            Aucune commande.
          </div>
        ) : (
          sortedFiltered.map((c) => {
            const isEditing = editingId === c.id;
            const isSaving = savingId === c.id;

            const isLong = String(c.response ?? "").length > 220;
            const isExpanded = !!expanded[c.id];
            const display = isExpanded
              ? { text: String(c.response ?? ""), clipped: false }
              : clampText(String(c.response ?? ""), 220);

            const disabledStyle = !c.enabled
              ? ({
                  opacity: 0.72,
                  filter: "saturate(0.8)",
                } as React.CSSProperties)
              : undefined;

            return (
              <div key={c.id} style={{ ...cardBase, ...disabledStyle }}>
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
                        <div
                          style={{
                            fontWeight: 1000,
                            fontSize: 14,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <span style={{ opacity: 0.9 }}>!</span>
                          <span>{c.trigger}</span>
                        </div>

                        <span style={pillStyle(c.enabled ? "green" : "gray")}>
                          {c.enabled ? "Active" : "Désactivée"}
                        </span>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button className="btnGhostInline" disabled={isSaving || busy} onClick={() => toggleEnabled(c)}>
                          {isSaving ? "…" : c.enabled ? "Désactiver" : "Activer"}
                        </button>

                        <button className="btnGhostInline" disabled={isSaving || busy} onClick={() => startEdit(c)}>
                          Modifier
                        </button>

                        <button
                          className="btnGhostInline"
                          disabled={isSaving || busy}
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(`!${c.trigger}\n${c.response ?? ""}`);
                              safeSetCopied(c.id);
                            } catch {
                              // ignore
                            }
                          }}
                          title="Copier trigger + réponse"
                        >
                          {copiedId === c.id ? "Copié ✅" : "Copier"}
                        </button>

                        <button className="btnGhostInline" disabled={isSaving || busy} onClick={() => removeCmd(c)}>
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
                            onClick={() => setExpanded((m) => ({ ...m, [c.id]: !m[c.id] }))}
                            style={{ opacity: 0.95 }}
                          >
                            {isExpanded ? "Réduire" : "Voir plus"}
                          </button>

                          <div className="muted" style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>
                            {String(c.response ?? "").length}/{BOT_TEXT_MAX}
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
                        <span style={pillStyle("gray")}>ID: {c.id}</span>
                        <span style={pillStyle(c.enabled ? "green" : "gray")}>
                          {c.enabled ? "Active" : "Désactivée"}
                        </span>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          className="btnGhostInline"
                          disabled={isSaving}
                          onClick={() => saveEdit(c.id)}
                          style={{ fontWeight: 1000 }}
                        >
                          {isSaving ? "Sauvegarde…" : "Enregistrer"}
                        </button>
                        <button className="btnGhostInline" disabled={isSaving} onClick={cancelEdit}>
                          Annuler
                        </button>
                      </div>
                    </div>

                    <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
                      <div style={{ flex: "0 0 240px", minWidth: 200 }}>
                        <div className="muted" style={{ fontSize: 12, marginBottom: 6, fontWeight: 900, opacity: 0.8 }}>
                          Trigger
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div
                            style={{
                              padding: "10px 10px",
                              borderRadius: 12,
                              border: "1px solid rgba(255,255,255,0.12)",
                              background: "rgba(0,0,0,0.12)",
                              fontWeight: 1000,
                              lineHeight: 1,
                              opacity: 0.9,
                            }}
                            title="Le préfixe est automatique"
                          >
                            !
                          </div>
                          <input
                            value={editTrigger}
                            onChange={(e) => setEditTrigger(e.target.value)}
                            placeholder="trigger"
                            maxLength={32}
                            disabled={isSaving}
                            style={{
                              width: "100%",
                              padding: "10px 12px",
                              borderRadius: 12,
                              border: "1px solid rgba(255,255,255,0.12)",
                              background: "rgba(0,0,0,0.12)",
                              color: "inherit",
                              outline: "none",
                            }}
                          />
                        </div>
                        <div className="muted" style={{ fontSize: 12, marginTop: 6, opacity: 0.75 }}>
                          Le “!” est automatique
                        </div>
                      </div>

                      <div style={{ flex: "1 1 360px", minWidth: 240 }}>
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
                            Réponse
                          </div>
                          <div className="muted" style={{ fontSize: 12, fontWeight: 900, opacity: 0.8 }}>
                            {editResp.length}/{BOT_TEXT_MAX}
                          </div>
                        </div>

                        <textarea
                          value={editResp}
                          onChange={(e) => setEditResp(e.target.value)}
                          placeholder="réponse"
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
                          <span>{c.enabled ? "Active" : "Désactivée"}</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        className="btnGhostInline"
                        disabled={isSaving}
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(normalizeMultiline(editResp));
                            safeSetCopied(c.id);
                          } catch {
                            // ignore
                          }
                        }}
                      >
                        {copiedId === c.id ? "Copié ✅" : "Copier la réponse"}
                      </button>

                      <button
                        className="btnGhostInline"
                        disabled={isSaving}
                        onClick={() => setEditResp(String(c.response ?? ""))}
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
