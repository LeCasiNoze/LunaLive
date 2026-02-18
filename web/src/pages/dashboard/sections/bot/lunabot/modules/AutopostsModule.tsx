// AutopostsModule.tsx
// ══════════════════════════════════════════════════════════════
//  PURPLE VELVET — AutopostsModule
//  Ergonomie : toolbar sticky, inline edit, cards glass, badges
// ══════════════════════════════════════════════════════════════
import * as React from "react";
import { BOT_TEXT_MAX, normalizeMultiline } from "../text";
import {
  createMyBotAutopost, deleteMyBotAutopost, updateMyBotAutopost,
  type ApiBotAutopost,
} from "../api";

const norm = (s: any) => String(s ?? "").trim();
const FIXED_EVERY_SEC = 600;

const AUTO_CSS = `
.auto-root { display:flex; flex-direction:column; height:100%; }

/* Toolbar sticky */
.auto-toolbar {
  position:sticky; top:0; z-index:10; padding:14px; background:rgba(11,9,22,.98);
  border-bottom:1px solid rgba(124,92,252,.10); backdrop-filter:blur(12px);
  display:flex; flex-direction:column; gap:12px;
}
.auto-toolbar-row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.auto-search {
  flex:1; min-width:220px; height:38px; padding:0 13px; border-radius:12px;
  border:1px solid rgba(124,92,252,.16); background:rgba(124,92,252,.08);
  color:rgba(235,232,255,.92); font-size:13px; font-weight:700; outline:none;
  transition:all 140ms ease;
}
.auto-search::placeholder { color:rgba(167,139,250,.38); }
.auto-search:focus { border-color:rgba(124,92,252,.44); box-shadow:0 0 0 3px rgba(124,92,252,.12); }
.auto-btn {
  padding:8px 14px; border-radius:12px; cursor:pointer; font-weight:800; font-size:12px;
  border:1px solid rgba(124,92,252,.22); background:rgba(124,92,252,.10);
  color:rgba(196,181,253,.85); transition:all 130ms ease; white-space:nowrap;
}
.auto-btn:hover { background:rgba(124,92,252,.18); border-color:rgba(124,92,252,.36); }
.auto-btn:disabled { opacity:.45; cursor:not-allowed; }
.auto-btn.active { border-color:rgba(124,92,252,.40); background:rgba(124,92,252,.18); }
.auto-badge {
  padding:5px 10px; border-radius:999px; font-size:11px; font-weight:800;
  border:1px solid rgba(124,92,252,.14); background:rgba(124,92,252,.06);
  color:rgba(167,139,250,.75); white-space:nowrap;
}

/* Add form expandable */
.auto-add-toggle {
  width:100%; padding:12px 14px; border-radius:14px; text-align:left; cursor:pointer;
  border:1px solid rgba(124,92,252,.18); background:rgba(124,92,252,.08);
  color:rgba(196,181,253,.85); font-weight:800; font-size:13px;
  transition:all 140ms ease; display:flex; justify-content:space-between; align-items:center;
}
.auto-add-toggle:hover { background:rgba(124,92,252,.14); border-color:rgba(124,92,252,.28); }
.auto-add-form {
  margin-top:12px; padding:14px; border-radius:14px;
  border:1px solid rgba(124,92,252,.18); background:rgba(124,92,252,.06);
}
.auto-input-wrap { display:flex; flex-direction:column; gap:6px; }
.auto-label { font-size:11px; font-weight:800; color:rgba(167,139,250,.60); letter-spacing:.04em; }
.auto-textarea {
  width:100%; padding:10px 13px; border-radius:12px; outline:none;
  border:1px solid rgba(124,92,252,.16); background:rgba(124,92,252,.08);
  color:rgba(235,232,255,.92); font-size:13px; font-weight:700; resize:vertical;
  line-height:1.4; min-height:80px; transition:all 140ms ease;
}
.auto-textarea::placeholder { color:rgba(167,139,250,.38); }
.auto-textarea:focus { border-color:rgba(124,92,252,.44); box-shadow:0 0 0 3px rgba(124,92,252,.12); }

/* List scrollable */
.auto-list { flex:1; overflow-y:auto; padding:14px; display:flex; flex-direction:column; gap:10px; }
.auto-empty { padding:20px; text-align:center; font-size:13px; font-weight:700; color:rgba(167,139,250,.55); }

/* Card */
.auto-card {
  padding:14px; border-radius:16px; border:1px solid rgba(124,92,252,.12);
  background:rgba(124,92,252,.05); transition:all 140ms ease;
}
.auto-card:hover { border-color:rgba(124,92,252,.22); background:rgba(124,92,252,.09); }
.auto-card.disabled { opacity:.65; }
.auto-card-head { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; flex-wrap:wrap; }
.auto-card-title { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.auto-card-label { font-weight:800; font-size:14px; color:rgba(235,232,255,.92); }
.auto-card-status {
  padding:4px 9px; border-radius:999px; font-size:10px; font-weight:800; letter-spacing:.04em;
}
.auto-card-status.active {
  border:1px solid rgba(52,211,153,.28); background:rgba(52,211,153,.10);
  color:rgba(110,231,183,.90);
}
.auto-card-status.inactive {
  border:1px solid rgba(124,92,252,.18); background:rgba(124,92,252,.06);
  color:rgba(167,139,250,.70);
}
.auto-card-interval {
  padding:4px 9px; border-radius:999px; font-size:10px; font-weight:800;
  border:1px solid rgba(251,191,36,.24); background:rgba(251,191,36,.08);
  color:rgba(253,230,138,.85);
}
.auto-card-actions { display:flex; gap:6px; flex-wrap:wrap; }
.auto-card-btn {
  padding:6px 11px; border-radius:10px; cursor:pointer; font-weight:800; font-size:11px;
  border:1px solid rgba(124,92,252,.18); background:rgba(124,92,252,.06);
  color:rgba(196,181,253,.80); transition:all 130ms ease;
}
.auto-card-btn:hover { background:rgba(124,92,252,.14); border-color:rgba(124,92,252,.28); }
.auto-card-btn:disabled { opacity:.40; cursor:not-allowed; }
.auto-card-btn.danger { border-color:rgba(239,68,68,.24); background:rgba(239,68,68,.08); color:rgba(252,165,165,.85); }
.auto-card-btn.danger:hover { background:rgba(239,68,68,.14); border-color:rgba(239,68,68,.36); }
.auto-card-message {
  margin-top:12px; padding:10px 13px; border-radius:12px;
  border:1px solid rgba(124,92,252,.10); background:rgba(124,92,252,.04);
  font-size:12px; font-weight:700; color:rgba(235,232,255,.85);
  line-height:1.45; white-space:pre-wrap; overflow-wrap:anywhere; word-break:break-word;
  max-height:200px; overflow:auto;
}
.auto-card-message.collapsed {
  max-height:80px; position:relative; overflow:hidden;
}
.auto-card-message.collapsed::after {
  content:""; position:absolute; left:0; right:0; bottom:0; height:32px;
  background:linear-gradient(to bottom,rgba(124,92,252,0),rgba(124,92,252,.08) 60%,rgba(124,92,252,.12));
  pointer-events:none;
}
.auto-card-expand { margin-top:8px; padding:6px 11px; border-radius:10px; cursor:pointer;
  font-weight:800; font-size:11px; border:1px solid rgba(124,92,252,.14);
  background:rgba(124,92,252,.05); color:rgba(196,181,253,.75);
}
.auto-card-expand:hover { background:rgba(124,92,252,.12); }

/* Edit inline */
.auto-edit-form { margin-top:12px; display:flex; flex-direction:column; gap:10px; }

/* Hint error */
.auto-hint {
  padding:10px 13px; border-radius:13px; border:1px solid rgba(239,68,68,.26);
  background:rgba(239,68,68,.10); font-size:12px; font-weight:700;
  color:rgba(252,165,165,.90);
}
`;

export function AutopostsModule({ token, autoposts, onReload }: {
  token: string; autoposts: ApiBotAutopost[]; onReload: () => Promise<void>;
}) {
  const [newMsg, setNewMsg] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editMsg, setEditMsg] = React.useState("");
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
    total: autoposts.length,
    enabled: autoposts.filter(p => p.enabled).length,
  }), [autoposts]);

  const sortedFiltered = React.useMemo(() => {
    const q = norm(search).toLowerCase();
    let list = [...autoposts];
    if (onlyEnabled) list = list.filter(p => p.enabled);
    if (q) list = list.filter(p => `${p.message ?? ""}`.toLowerCase().includes(q));
    list.sort((a, b) => {
      const ea = a.enabled ? 0 : 1, eb = b.enabled ? 0 : 1;
      if (ea !== eb) return ea - eb;
      return String(b.id).localeCompare(String(a.id), "fr");
    });
    return list;
  }, [autoposts, search, onlyEnabled]);

  const everyLabel = React.useMemo(() => `${Math.round(FIXED_EVERY_SEC / 60)} min`, []);

  async function add() {
    setErr(null);
    const message = normalizeMultiline(newMsg);
    if (!message.trim()) return setErr("Message manquant.");
    setBusy(true);
    try {
      await createMyBotAutopost(token, { message, everySec: FIXED_EVERY_SEC, enabled: true });
      setNewMsg(""); setShowAdd(false); await onReload();
    } catch (e: any) { setErr(String(e?.message || "Erreur")); }
    finally { setBusy(false); }
  }

  function startEdit(p: ApiBotAutopost) {
    setErr(null); setEditingId(p.id); setEditMsg(p.message ?? "");
  }
  function cancelEdit() {
    setEditingId(null); setEditMsg("");
  }

  async function saveEdit(id: string) {
    setErr(null);
    const message = normalizeMultiline(editMsg);
    if (!message.trim()) return setErr("Message manquant.");
    setSavingId(id);
    try {
      await updateMyBotAutopost(token, id, { message, everySec: FIXED_EVERY_SEC });
      setEditingId(null); await onReload();
    } catch (e: any) { setErr(String(e?.message || "Erreur")); }
    finally { setSavingId(null); }
  }

  async function toggleEnabled(p: ApiBotAutopost) {
    if (busy || savingId) return; setErr(null); setSavingId(p.id);
    try { await updateMyBotAutopost(token, p.id, { enabled: !p.enabled }); await onReload(); }
    catch (e: any) { setErr(String(e?.message || "Erreur")); }
    finally { setSavingId(null); }
  }

  async function removeAuto(p: ApiBotAutopost) {
    if (busy || savingId) return; setErr(null);
    if (!window.confirm("Supprimer ce message automatique ?")) return;
    setSavingId(p.id);
    try { await deleteMyBotAutopost(token, p.id); await onReload(); }
    catch (e: any) { setErr(String(e?.message || "Erreur")); }
    finally { setSavingId(null); }
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: AUTO_CSS }} />
      <div className="auto-root">
        {/* Toolbar sticky */}
        <div className="auto-toolbar">
          <div className="auto-toolbar-row">
            <input
              className="auto-search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="🔎 Rechercher dans les messages…"
            />
            <button
              className={`auto-btn${onlyEnabled ? " active" : ""}`}
              onClick={() => setOnlyEnabled(x => !x)}
            >
              {onlyEnabled ? "✓ Actifs" : "Tous"}
            </button>
            <span className="auto-badge">{counts.enabled}/{counts.total} actifs</span>
            <span className="auto-badge">Intervalle: {everyLabel}</span>
            <span className="auto-badge">Max: {BOT_TEXT_MAX}</span>
          </div>

          {err && <div className="auto-hint">⚠️ {err}</div>}

          {/* Add form toggle */}
          <button className="auto-add-toggle" onClick={() => setShowAdd(x => !x)}>
            <span>➕ Nouveau message auto</span>
            <span>{showAdd ? "▲" : "▼"}</span>
          </button>

          {showAdd && (
            <div className="auto-add-form">
              <div className="auto-input-wrap">
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
                  <div className="auto-label">MESSAGE</div>
                  <div className="auto-label">{newMsg.length}/{BOT_TEXT_MAX}</div>
                </div>
                <textarea
                  className="auto-textarea"
                  value={newMsg}
                  onChange={e => setNewMsg(e.target.value)}
                  placeholder="Message automatique… (retours à la ligne OK)"
                  maxLength={BOT_TEXT_MAX}
                  disabled={busy}
                />
                <div style={{ fontSize:10, fontWeight:700, color:"rgba(167,139,250,.55)", marginTop:4 }}>
                  Intervalle fixe: {everyLabel} (live-only)
                </div>
              </div>

              <div style={{ display:"flex", gap:8, marginTop:10 }}>
                <button className="auto-btn" onClick={add} disabled={busy}>
                  {busy ? "⏳" : "✓ Ajouter"}
                </button>
                <button className="auto-btn" onClick={() => { setNewMsg(""); setErr(null); }} disabled={busy}>
                  Reset
                </button>
              </div>
            </div>
          )}
        </div>

        {/* List scrollable */}
        <div className="auto-list">
          {sortedFiltered.length === 0 ? (
            <div className="auto-empty">Aucun message automatique trouvé.</div>
          ) : (
            sortedFiltered.map(p => {
              const isEditing = editingId === p.id;
              const isSaving = savingId === p.id;
              const isLong = String(p.message ?? "").length > 200;
              const isExpanded = !!expanded[p.id];

              return (
                <div key={p.id} className={`auto-card${!p.enabled ? " disabled" : ""}`}>
                  {!isEditing ? (
                    <>
                      <div className="auto-card-head">
                        <div className="auto-card-title">
                          <div className="auto-card-label">Auto-post</div>
                          <div className="auto-card-interval">{everyLabel}</div>
                          <div className={`auto-card-status ${p.enabled ? "active" : "inactive"}`}>
                            {p.enabled ? "ACTIF" : "DÉSACTIVÉ"}
                          </div>
                        </div>

                        <div className="auto-card-actions">
                          <button className="auto-card-btn" onClick={() => toggleEnabled(p)} disabled={isSaving || busy}>
                            {isSaving ? "…" : p.enabled ? "Désactiver" : "Activer"}
                          </button>
                          <button className="auto-card-btn" onClick={() => startEdit(p)} disabled={isSaving || busy}>
                            Modifier
                          </button>
                          <button
                            className="auto-card-btn"
                            onClick={async () => {
                              try { await navigator.clipboard.writeText(p.message ?? ""); safeSetCopied(p.id); } catch {}
                            }}
                            disabled={isSaving || busy}
                          >
                            {copiedId === p.id ? "✓ Copié" : "Copier"}
                          </button>
                          <button className="auto-card-btn danger" onClick={() => removeAuto(p)} disabled={isSaving || busy}>
                            Supprimer
                          </button>
                        </div>
                      </div>

                      <div className={`auto-card-message${!isExpanded && isLong ? " collapsed" : ""}`}>
                        {p.message || <span style={{ opacity:.5 }}>(vide)</span>}
                      </div>

                      {isLong && (
                        <button className="auto-card-expand" onClick={() => setExpanded(m => ({ ...m, [p.id]: !m[p.id] }))}>
                          {isExpanded ? "▲ Réduire" : "▼ Voir plus"}
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="auto-card-head">
                        <div className="auto-card-title">
                          <div style={{ fontWeight:800, fontSize:13, color:"rgba(235,232,255,.85)" }}>✏️ Édition</div>
                          <div className="auto-card-interval">{everyLabel}</div>
                          <div className={`auto-card-status ${p.enabled ? "active" : "inactive"}`}>
                            {p.enabled ? "ACTIF" : "DÉSACTIVÉ"}
                          </div>
                        </div>
                        <div className="auto-card-actions">
                          <button className="auto-card-btn" onClick={() => saveEdit(p.id)} disabled={isSaving}>
                            {isSaving ? "⏳" : "✓ Enregistrer"}
                          </button>
                          <button className="auto-card-btn" onClick={cancelEdit} disabled={isSaving}>Annuler</button>
                        </div>
                      </div>

                      <div className="auto-edit-form">
                        <div className="auto-input-wrap">
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
                            <div className="auto-label">MESSAGE</div>
                            <div className="auto-label">{editMsg.length}/{BOT_TEXT_MAX}</div>
                          </div>
                          <textarea
                            className="auto-textarea"
                            value={editMsg}
                            onChange={e => setEditMsg(e.target.value)}
                            maxLength={BOT_TEXT_MAX}
                            disabled={isSaving}
                          />
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