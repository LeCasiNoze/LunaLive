// CommandsModule.tsx
// ══════════════════════════════════════════════════════════════
//  PURPLE VELVET — CommandsModule
//  Ergonomie : toolbar sticky, inline edit, cards glass, badges
// ══════════════════════════════════════════════════════════════
import * as React from "react";
import { BOT_TEXT_MAX, normalizeMultiline } from "../text";
import {
  createMyBotCommand, deleteMyBotCommand, updateMyBotCommand,
  type ApiBotCommand,
} from "../api";

const norm = (s: any) => String(s ?? "").trim();

const CMD_CSS = `
.cmd-root { display:flex; flex-direction:column; height:100%; }

/* Toolbar sticky */
.cmd-toolbar {
  position:sticky; top:0; z-index:10; padding:14px; background:rgba(11,9,22,.98);
  border-bottom:1px solid rgba(124,92,252,.10); backdrop-filter:blur(12px);
  display:flex; flex-direction:column; gap:12px;
}
.cmd-toolbar-row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.cmd-search {
  flex:1; min-width:220px; height:38px; padding:0 13px; border-radius:12px;
  border:1px solid rgba(124,92,252,.16); background:rgba(124,92,252,.08);
  color:rgba(235,232,255,.92); font-size:13px; font-weight:700; outline:none;
  transition:all 140ms ease;
}
.cmd-search::placeholder { color:rgba(167,139,250,.38); }
.cmd-search:focus { border-color:rgba(124,92,252,.44); box-shadow:0 0 0 3px rgba(124,92,252,.12); }
.cmd-btn {
  padding:8px 14px; border-radius:12px; cursor:pointer; font-weight:800; font-size:12px;
  border:1px solid rgba(124,92,252,.22); background:rgba(124,92,252,.10);
  color:rgba(196,181,253,.85); transition:all 130ms ease; white-space:nowrap;
}
.cmd-btn:hover { background:rgba(124,92,252,.18); border-color:rgba(124,92,252,.36); }
.cmd-btn:disabled { opacity:.45; cursor:not-allowed; }
.cmd-btn.active { border-color:rgba(124,92,252,.40); background:rgba(124,92,252,.18); }
.cmd-badge {
  padding:5px 10px; border-radius:999px; font-size:11px; font-weight:800;
  border:1px solid rgba(124,92,252,.14); background:rgba(124,92,252,.06);
  color:rgba(167,139,250,.75); white-space:nowrap;
}

/* Add form expandable */
.cmd-add-toggle {
  width:100%; padding:12px 14px; border-radius:14px; text-align:left; cursor:pointer;
  border:1px solid rgba(124,92,252,.18); background:rgba(124,92,252,.08);
  color:rgba(196,181,253,.85); font-weight:800; font-size:13px;
  transition:all 140ms ease; display:flex; justify-content:space-between; align-items:center;
}
.cmd-add-toggle:hover { background:rgba(124,92,252,.14); border-color:rgba(124,92,252,.28); }
.cmd-add-form {
  margin-top:12px; padding:14px; border-radius:14px;
  border:1px solid rgba(124,92,252,.18); background:rgba(124,92,252,.06);
}
.cmd-input-wrap { display:flex; flex-direction:column; gap:6px; }
.cmd-label { font-size:11px; font-weight:800; color:rgba(167,139,250,.60); letter-spacing:.04em; }
.cmd-input {
  width:100%; padding:10px 13px; border-radius:12px; outline:none;
  border:1px solid rgba(124,92,252,.16); background:rgba(124,92,252,.08);
  color:rgba(235,232,255,.92); font-size:13px; font-weight:700;
  transition:all 140ms ease;
}
.cmd-input::placeholder { color:rgba(167,139,250,.38); }
.cmd-input:focus { border-color:rgba(124,92,252,.44); box-shadow:0 0 0 3px rgba(124,92,252,.12); }
.cmd-textarea {
  width:100%; padding:10px 13px; border-radius:12px; outline:none;
  border:1px solid rgba(124,92,252,.16); background:rgba(124,92,252,.08);
  color:rgba(235,232,255,.92); font-size:13px; font-weight:700; resize:vertical;
  line-height:1.4; min-height:80px; transition:all 140ms ease;
}
.cmd-textarea::placeholder { color:rgba(167,139,250,.38); }
.cmd-textarea:focus { border-color:rgba(124,92,252,.44); box-shadow:0 0 0 3px rgba(124,92,252,.12); }

/* List scrollable */
.cmd-list { flex:1; overflow-y:auto; padding:14px; display:flex; flex-direction:column; gap:10px; }
.cmd-empty { padding:20px; text-align:center; font-size:13px; font-weight:700; color:rgba(167,139,250,.55); }

/* Card */
.cmd-card {
  padding:14px; border-radius:16px; border:1px solid rgba(124,92,252,.12);
  background:rgba(124,92,252,.05); transition:all 140ms ease;
}
.cmd-card:hover { border-color:rgba(124,92,252,.22); background:rgba(124,92,252,.09); }
.cmd-card.disabled { opacity:.65; }
.cmd-card-head { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; flex-wrap:wrap; }
.cmd-card-title { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.cmd-card-trigger {
  font-weight:800; font-size:14px; color:rgba(235,232,255,.92);
  display:flex; align-items:center; gap:6px;
}
.cmd-card-trigger-prefix { opacity:.7; }
.cmd-card-status {
  padding:4px 9px; border-radius:999px; font-size:10px; font-weight:800; letter-spacing:.04em;
}
.cmd-card-status.active {
  border:1px solid rgba(52,211,153,.28); background:rgba(52,211,153,.10);
  color:rgba(110,231,183,.90);
}
.cmd-card-status.inactive {
  border:1px solid rgba(124,92,252,.18); background:rgba(124,92,252,.06);
  color:rgba(167,139,250,.70);
}
.cmd-card-actions { display:flex; gap:6px; flex-wrap:wrap; }
.cmd-card-btn {
  padding:6px 11px; border-radius:10px; cursor:pointer; font-weight:800; font-size:11px;
  border:1px solid rgba(124,92,252,.18); background:rgba(124,92,252,.06);
  color:rgba(196,181,253,.80); transition:all 130ms ease;
}
.cmd-card-btn:hover { background:rgba(124,92,252,.14); border-color:rgba(124,92,252,.28); }
.cmd-card-btn:disabled { opacity:.40; cursor:not-allowed; }
.cmd-card-btn.danger { border-color:rgba(239,68,68,.24); background:rgba(239,68,68,.08); color:rgba(252,165,165,.85); }
.cmd-card-btn.danger:hover { background:rgba(239,68,68,.14); border-color:rgba(239,68,68,.36); }
.cmd-card-response {
  margin-top:12px; padding:10px 13px; border-radius:12px;
  border:1px solid rgba(124,92,252,.10); background:rgba(124,92,252,.04);
  font-size:12px; font-weight:700; color:rgba(235,232,255,.85);
  line-height:1.45; white-space:pre-wrap; overflow-wrap:anywhere; word-break:break-word;
  max-height:200px; overflow:auto;
}
.cmd-card-response.collapsed {
  max-height:80px; position:relative; overflow:hidden;
}
.cmd-card-response.collapsed::after {
  content:""; position:absolute; left:0; right:0; bottom:0; height:32px;
  background:linear-gradient(to bottom,rgba(124,92,252,0),rgba(124,92,252,.08) 60%,rgba(124,92,252,.12));
  pointer-events:none;
}
.cmd-card-expand { margin-top:8px; padding:6px 11px; border-radius:10px; cursor:pointer;
  font-weight:800; font-size:11px; border:1px solid rgba(124,92,252,.14);
  background:rgba(124,92,252,.05); color:rgba(196,181,253,.75);
}
.cmd-card-expand:hover { background:rgba(124,92,252,.12); }

/* Edit inline */
.cmd-edit-form { margin-top:12px; display:flex; flex-direction:column; gap:10px; }
.cmd-edit-actions { display:flex; gap:8px; flex-wrap:wrap; }

/* Hint error */
.cmd-hint {
  padding:10px 13px; border-radius:13px; border:1px solid rgba(239,68,68,.26);
  background:rgba(239,68,68,.10); font-size:12px; font-weight:700;
  color:rgba(252,165,165,.90);
}
`;

export function CommandsModule({ token, commands, onReload }: {
  token: string; commands: ApiBotCommand[]; onReload: () => Promise<void>;
}) {
  const [newTrigger, setNewTrigger] = React.useState("");
  const [newResp, setNewResp] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editTrigger, setEditTrigger] = React.useState("");
  const [editResp, setEditResp] = React.useState("");
  const [savingId, setSavingId] = React.useState<string | null>(null);

  const [search, setSearch] = React.useState("");
  const [onlyEnabled, setOnlyEnabled] = React.useState(false);
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [showAdd, setShowAdd] = React.useState(false);

  const safeSetCopied = React.useCallback((id: string) => {
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(x => x === id ? null : x), 900);
  }, []);

  const counts = React.useMemo(() => ({
    total: commands.length,
    enabled: commands.filter(c => c.enabled).length,
  }), [commands]);

  const sortedFiltered = React.useMemo(() => {
    const q = norm(search).toLowerCase();
    let list = [...commands];
    if (onlyEnabled) list = list.filter(c => c.enabled);
    if (q) list = list.filter(c => `${c.trigger ?? ""}\n${c.response ?? ""}`.toLowerCase().includes(q));
    list.sort((a, b) => {
      const ea = a.enabled ? 0 : 1, eb = b.enabled ? 0 : 1;
      if (ea !== eb) return ea - eb;
      return String(a.trigger ?? "").localeCompare(String(b.trigger ?? ""), "fr");
    });
    return list;
  }, [commands, search, onlyEnabled]);

  async function add() {
    setErr(null);
    const trigger = norm(newTrigger), response = normalizeMultiline(newResp);
    if (!trigger) return setErr("Trigger manquant.");
    if (trigger.includes(" ")) return setErr("Pas d'espaces dans le trigger.");
    if (!response.trim()) return setErr("Réponse manquante.");
    setBusy(true);
    try {
      await createMyBotCommand(token, { trigger, response, enabled: true });
      setNewTrigger(""); setNewResp(""); setShowAdd(false); await onReload();
    } catch (e: any) { setErr(String(e?.message || "Erreur")); }
    finally { setBusy(false); }
  }

  function startEdit(c: ApiBotCommand) {
    setErr(null); setEditingId(c.id); setEditTrigger(c.trigger); setEditResp(c.response ?? "");
  }
  function cancelEdit() {
    setEditingId(null); setEditTrigger(""); setEditResp("");
  }

  async function saveEdit(id: string) {
    setErr(null);
    const trigger = norm(editTrigger), response = normalizeMultiline(editResp);
    if (!trigger) return setErr("Trigger manquant.");
    if (trigger.includes(" ")) return setErr("Pas d'espaces dans le trigger.");
    if (!response.trim()) return setErr("Réponse manquante.");
    setSavingId(id);
    try {
      await updateMyBotCommand(token, id, { trigger, response }); setEditingId(null); await onReload();
    } catch (e: any) { setErr(String(e?.message || "Erreur")); }
    finally { setSavingId(null); }
  }

  async function toggleEnabled(c: ApiBotCommand) {
    if (busy || savingId) return; setErr(null); setSavingId(c.id);
    try { await updateMyBotCommand(token, c.id, { enabled: !c.enabled }); await onReload(); }
    catch (e: any) { setErr(String(e?.message || "Erreur")); }
    finally { setSavingId(null); }
  }

  async function removeCmd(c: ApiBotCommand) {
    if (busy || savingId) return; setErr(null);
    if (!window.confirm(`Supprimer !${c.trigger} ?`)) return;
    setSavingId(c.id);
    try { await deleteMyBotCommand(token, c.id); await onReload(); }
    catch (e: any) { setErr(String(e?.message || "Erreur")); }
    finally { setSavingId(null); }
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CMD_CSS }} />
      <div className="cmd-root">
        {/* Toolbar sticky */}
        <div className="cmd-toolbar">
          <div className="cmd-toolbar-row">
            <input
              className="cmd-search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="🔎 Rechercher trigger ou réponse…"
            />
            <button
              className={`cmd-btn${onlyEnabled ? " active" : ""}`}
              onClick={() => setOnlyEnabled(x => !x)}
            >
              {onlyEnabled ? "✓ Actives" : "Toutes"}
            </button>
            <span className="cmd-badge">{counts.enabled}/{counts.total} actives</span>
            <span className="cmd-badge">Max: {BOT_TEXT_MAX}</span>
          </div>

          {err && <div className="cmd-hint">⚠️ {err}</div>}

          {/* Add form toggle */}
          <button className="cmd-add-toggle" onClick={() => setShowAdd(x => !x)}>
            <span>➕ Nouvelle commande</span>
            <span>{showAdd ? "▲" : "▼"}</span>
          </button>

          {showAdd && (
            <div className="cmd-add-form">
              <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                <div style={{ flex:"0 0 200px", minWidth:180 }}>
                  <div className="cmd-input-wrap">
                    <div className="cmd-label">TRIGGER</div>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <div style={{
                        padding:"10px 11px", borderRadius:12, border:"1px solid rgba(124,92,252,.16)",
                        background:"rgba(124,92,252,.08)", fontWeight:800, color:"rgba(196,181,253,.75)"
                      }}>!</div>
                      <input
                        className="cmd-input"
                        value={newTrigger}
                        onChange={e => setNewTrigger(e.target.value)}
                        placeholder="discord"
                        maxLength={32}
                        disabled={busy}
                      />
                    </div>
                    <div style={{ fontSize:10, fontWeight:700, color:"rgba(167,139,250,.55)", marginTop:4 }}>
                      Sans espaces
                    </div>
                  </div>
                </div>

                <div style={{ flex:1, minWidth:240 }}>
                  <div className="cmd-input-wrap">
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
                      <div className="cmd-label">RÉPONSE</div>
                      <div className="cmd-label">{newResp.length}/{BOT_TEXT_MAX}</div>
                    </div>
                    <textarea
                      className="cmd-textarea"
                      value={newResp}
                      onChange={e => setNewResp(e.target.value)}
                      placeholder="Texte de la réponse…"
                      maxLength={BOT_TEXT_MAX}
                      disabled={busy}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display:"flex", gap:8, marginTop:10 }}>
                <button className="cmd-btn" onClick={add} disabled={busy}>
                  {busy ? "⏳" : "✓ Ajouter"}
                </button>
                <button className="cmd-btn" onClick={() => { setNewTrigger(""); setNewResp(""); setErr(null); }} disabled={busy}>
                  Reset
                </button>
              </div>
            </div>
          )}
        </div>

        {/* List scrollable */}
        <div className="cmd-list">
          {sortedFiltered.length === 0 ? (
            <div className="cmd-empty">Aucune commande trouvée.</div>
          ) : (
            sortedFiltered.map(c => {
              const isEditing = editingId === c.id;
              const isSaving = savingId === c.id;
              const isLong = String(c.response ?? "").length > 200;
              const isExpanded = !!expanded[c.id];

              return (
                <div key={c.id} className={`cmd-card${!c.enabled ? " disabled" : ""}`}>
                  {!isEditing ? (
                    <>
                      <div className="cmd-card-head">
                        <div className="cmd-card-title">
                          <div className="cmd-card-trigger">
                            <span className="cmd-card-trigger-prefix">!</span>
                            <span>{c.trigger}</span>
                          </div>
                          <div className={`cmd-card-status ${c.enabled ? "active" : "inactive"}`}>
                            {c.enabled ? "ACTIVE" : "DÉSACTIVÉE"}
                          </div>
                        </div>

                        <div className="cmd-card-actions">
                          <button className="cmd-card-btn" onClick={() => toggleEnabled(c)} disabled={isSaving || busy}>
                            {isSaving ? "…" : c.enabled ? "Désactiver" : "Activer"}
                          </button>
                          <button className="cmd-card-btn" onClick={() => startEdit(c)} disabled={isSaving || busy}>
                            Modifier
                          </button>
                          <button
                            className="cmd-card-btn"
                            onClick={async () => {
                              try { await navigator.clipboard.writeText(`!${c.trigger}\n${c.response ?? ""}`); safeSetCopied(c.id); } catch {}
                            }}
                            disabled={isSaving || busy}
                          >
                            {copiedId === c.id ? "✓ Copié" : "Copier"}
                          </button>
                          <button className="cmd-card-btn danger" onClick={() => removeCmd(c)} disabled={isSaving || busy}>
                            Supprimer
                          </button>
                        </div>
                      </div>

                      <div className={`cmd-card-response${!isExpanded && isLong ? " collapsed" : ""}`}>
                        {c.response || <span style={{ opacity:.5 }}>(vide)</span>}
                      </div>

                      {isLong && (
                        <button className="cmd-card-expand" onClick={() => setExpanded(m => ({ ...m, [c.id]: !m[c.id] }))}>
                          {isExpanded ? "▲ Réduire" : "▼ Voir plus"}
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="cmd-card-head">
                        <div className="cmd-card-title">
                          <div style={{ fontWeight:800, fontSize:13, color:"rgba(235,232,255,.85)" }}>✏️ Édition</div>
                          <div className={`cmd-card-status ${c.enabled ? "active" : "inactive"}`}>
                            {c.enabled ? "ACTIVE" : "DÉSACTIVÉE"}
                          </div>
                        </div>
                        <div className="cmd-card-actions">
                          <button className="cmd-card-btn" onClick={() => saveEdit(c.id)} disabled={isSaving}>
                            {isSaving ? "⏳" : "✓ Enregistrer"}
                          </button>
                          <button className="cmd-card-btn" onClick={cancelEdit} disabled={isSaving}>Annuler</button>
                        </div>
                      </div>

                      <div className="cmd-edit-form">
                        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                          <div style={{ flex:"0 0 200px", minWidth:180 }}>
                            <div className="cmd-input-wrap">
                              <div className="cmd-label">TRIGGER</div>
                              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                                <div style={{
                                  padding:"10px 11px", borderRadius:12, border:"1px solid rgba(124,92,252,.16)",
                                  background:"rgba(124,92,252,.08)", fontWeight:800, color:"rgba(196,181,253,.75)"
                                }}>!</div>
                                <input
                                  className="cmd-input"
                                  value={editTrigger}
                                  onChange={e => setEditTrigger(e.target.value)}
                                  maxLength={32}
                                  disabled={isSaving}
                                />
                              </div>
                            </div>
                          </div>

                          <div style={{ flex:1, minWidth:240 }}>
                            <div className="cmd-input-wrap">
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
                                <div className="cmd-label">RÉPONSE</div>
                                <div className="cmd-label">{editResp.length}/{BOT_TEXT_MAX}</div>
                              </div>
                              <textarea
                                className="cmd-textarea"
                                value={editResp}
                                onChange={e => setEditResp(e.target.value)}
                                maxLength={BOT_TEXT_MAX}
                                disabled={isSaving}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}