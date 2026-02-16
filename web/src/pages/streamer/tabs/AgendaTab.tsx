// web/src/pages/streamer/tabs/AgendaTab.tsx
// ══════════════════════════════════════════════════════════════
//  PURPLE VELVET — AgendaTab
// ══════════════════════════════════════════════════════════════
import * as React from "react";
import {
  getStreamerAgenda,
  putStreamerAgenda,
  getStreamerAgendaMySubs,
  subscribeStreamerAgenda,
  unsubscribeStreamerAgenda,
  type AgendaRule,
} from "../../../lib/api_streamer_tabs";
import { enablePushNotifications } from "../../../lib/push";

function pad2(n: number) { return String(n).padStart(2, "0"); }
function toLocalYMD(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function frDayLabel(d: Date) {
  const days = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  return days[d.getDay()];
}
function timeToMin(s: string) {
  const m = String(s || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return 0;
  const hh = Math.max(0, Math.min(23, Number(m[1])));
  const mm = Math.max(0, Math.min(59, Number(m[2])));
  return hh * 60 + mm;
}

const COLOR_PRESETS = [
  { name: "Violet", color: "#8b5cf6" },
  { name: "Bleu", color: "#3b82f6" },
  { name: "Cyan", color: "#06b6d4" },
  { name: "Vert", color: "#22c55e" },
  { name: "Jaune", color: "#eab308" },
  { name: "Orange", color: "#f97316" },
  { name: "Rouge", color: "#ef4444" },
  { name: "Rose", color: "#ec4899" },
] as const;

function ensurePresetColor(c: string) {
  const s = String(c || "").trim().toLowerCase();
  const found = COLOR_PRESETS.find(p => p.color.toLowerCase() === s);
  return found ? found.color : COLOR_PRESETS[0].color;
}
function emptyRule(): AgendaRule {
  const d = new Date();
  return { kind: "regular", title: "Stream", color: COLOR_PRESETS[0].color, dayOfWeek: d.getDay(), startTime: "21:00", endTime: "23:00" };
}

const AGENDA_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@500;700;800&display=swap');

.agenda-root { font-family:'Syne',system-ui,sans-serif; }
.agenda-header {
  display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px;
}
.agenda-title {
  font-family:'Syne',system-ui,sans-serif; font-weight:800; font-size:16px; letter-spacing:-.2px;
  background:linear-gradient(90deg,#c4b5fd,#a78bfa 55%,#5b8ef8);
  -webkit-background-clip:text; background-clip:text; color:transparent;
}
.agenda-input {
  padding:10px 12px; border-radius:12px;
  border:1px solid rgba(124,92,252,.18);
  background:rgba(124,92,252,.07);
  color:rgba(235,232,255,.92);
  font-family:'Syne',system-ui,sans-serif; font-weight:700; font-size:14px;
  outline:none;
}
.agenda-input:focus {
  border-color:rgba(124,92,252,.38);
  box-shadow:0 0 0 3px rgba(124,92,252,.08);
}
.agenda-card {
  padding:12px; border-radius:14px;
  border:1px solid rgba(124,92,252,.10);
  background:rgba(124,92,252,.04);
}
.agenda-slot {
  border-radius:12px; padding:10px;
  border:1px solid rgba(124,92,252,.08);
  background:rgba(124,92,252,.03);
  display:flex; gap:10px; align-items:center;
}
`;

export function AgendaTab({ slug, token, canEdit }: { slug: string; token: string | null; canEdit: boolean }) {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [edit, setEdit] = React.useState(false);
  const [rules, setRules] = React.useState<AgendaRule[]>([]);
  const [subsLoading, setSubsLoading] = React.useState(false);
  const [mySubs, setMySubs] = React.useState<Set<number>>(new Set());

  async function load() {
    setLoading(true); setError(null);
    try {
      const r = await getStreamerAgenda(slug);
      if (!("ok" in r) || !r.ok) throw new Error((r as any)?.error || "Erreur");
      setRules(Array.isArray(r.rules) ? r.rules : []);
    } catch (e: any) { setError(String(e?.message || "Erreur")); }
    finally { setLoading(false); }
  }

  async function loadSubs() {
    if (!token) { setMySubs(new Set()); return; }
    setSubsLoading(true);
    try {
      const r = await getStreamerAgendaMySubs(slug, token);
      if (!("ok" in r) || !r.ok) throw new Error((r as any)?.error || "Erreur");
      const ids = Array.isArray((r as any).ruleIds) ? (r as any).ruleIds : [];
      setMySubs(new Set(ids.map((x: any) => Number(x)).filter((n: any) => Number.isFinite(n))));
    } catch { setMySubs(new Set()); }
    finally { setSubsLoading(false); }
  }

  React.useEffect(() => { setEdit(false); load(); /* eslint-disable-next-line */ }, [slug]);
  React.useEffect(() => { loadSubs(); /* eslint-disable-next-line */ }, [slug, token]);

  function updateRule(i: number, patch: Partial<AgendaRule>) {
    setRules(prev => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function setKind(i: number, kind: "regular" | "event") {
    const now = new Date();
    const today = toLocalYMD(now);
    const dow = now.getDay();
    setRules(prev =>
      prev.map((r, idx) => {
        if (idx !== i) return r;
        if (kind === "event") return { ...r, kind: "event", date: String(r.date || "").trim() || today, dayOfWeek: null };
        return { ...r, kind: "regular", dayOfWeek: Number.isFinite(Number(r.dayOfWeek)) ? Number(r.dayOfWeek) : dow, date: null };
      })
    );
  }
  function removeRule(i: number) { setRules(prev => prev.filter((_, idx) => idx !== i)); }

  async function save() {
    if (!token) return;
    setSaving(true); setError(null);
    try {
      const today = toLocalYMD(new Date());
      const payload = rules.map(r => {
        const kind = r.kind;
        const color = ensurePresetColor(r.color);
        const base = {
          id: r.id,
          kind,
          title: String(r.title || "").trim().slice(0, 80) || "Stream",
          color,
          startTime: String(r.startTime || "00:00").trim(),
          endTime: String(r.endTime || "00:00").trim(),
        };
        if (kind === "event") {
          const d = String(r.date || "").trim() || today;
          return { ...base, date: d, dayOfWeek: null };
        }
        const dow = Number(r.dayOfWeek);
        return { ...base, dayOfWeek: Number.isFinite(dow) ? dow : 0, date: null };
      });
      const rr = await putStreamerAgenda(slug, token, payload);
      if (!("ok" in rr) || !rr.ok) throw new Error((rr as any)?.error || "Erreur");
      setEdit(false);
      await load();
      await loadSubs();
    } catch (e: any) { setError(String(e?.message || "Erreur")); }
    finally { setSaving(false); }
  }

  const next7 = React.useMemo(() => {
    const out: Date[] = [];
    const d0 = new Date();
    d0.setHours(0, 0, 0, 0);
    for (let i = 0; i < 7; i++) {
      const d = new Date(d0);
      d.setDate(d0.getDate() + i);
      out.push(d);
    }
    return out;
  }, []);

  const occurrences = React.useMemo(() => {
    const byDay: Record<string, Array<AgendaRule & { _special?: boolean }>> = {};
    for (const d of next7) {
      const ymd = toLocalYMD(d);
      const dow = d.getDay();
      const arr: Array<AgendaRule & { _special?: boolean }> = [];
      for (const r of rules) {
        if (r.kind === "regular" && Number(r.dayOfWeek) === dow) arr.push({ ...r, _special: false });
        else if (r.kind === "event" && String(r.date || "") === ymd) arr.push({ ...r, _special: true });
      }
      arr.sort((a, b) => timeToMin(a.startTime) - timeToMin(b.startTime));
      byDay[ymd] = arr;
    }
    return byDay;
  }, [next7, rules]);

  const legend = React.useMemo(() => {
    const reg = new Map<string, string>();
    const ev = new Map<string, string>();
    for (const d of next7) {
      const ymd = toLocalYMD(d);
      const arr = occurrences[ymd] || [];
      for (const r of arr) {
        const t = String(r.title || "").trim();
        if (!t) continue;
        const c = ensurePresetColor(r.color);
        if (r._special) ev.set(t, c);
        else reg.set(t, c);
      }
    }
    return {
      regular: Array.from(reg.entries()).map(([title, color]) => ({ title, color })),
      event: Array.from(ev.entries()).map(([title, color]) => ({ title, color })),
    };
  }, [next7, occurrences]);

  async function toggleSub(ruleId: number | null | undefined) {
    const rid = Number(ruleId);
    if (!token || !Number.isFinite(rid) || rid <= 0) return;
    const was = mySubs.has(rid);
    setMySubs(prev => { const n = new Set(prev); if (was) n.delete(rid); else n.add(rid); return n; });
    try {
      if (!was) await enablePushNotifications(token);
      if (was) {
        const r = await unsubscribeStreamerAgenda(slug, token, rid);
        if (!("ok" in r) || !r.ok) throw new Error((r as any)?.error || "Erreur");
      } else {
        const r = await subscribeStreamerAgenda(slug, token, rid);
        if (!("ok" in r) || !r.ok) throw new Error((r as any)?.error || "Erreur");
      }
    } catch {
      setMySubs(prev => { const n = new Set(prev); if (was) n.add(rid); else n.delete(rid); return n; });
    }
  }

  return (
    <div className="agenda-root">
      <style>{AGENDA_STYLES}</style>

      <div className="agenda-header">
        <span className="agenda-title">Agenda (7 jours)</span>
        {canEdit ? (
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {!edit ? (
              <button type="button" className="btnGhostSmall" onClick={() => setEdit(true)}>Modifier</button>
            ) : (
              <>
                <button type="button" className="btnGhostSmall" disabled={saving} onClick={() => { setEdit(false); load(); }}>Annuler</button>
                <button type="button" className="btnPrimarySmall" disabled={saving || !token} onClick={save}>
                  {saving ? "…" : "Enregistrer"}
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>

      {error ? <div style={{ marginTop:8, fontSize:12, color:"rgba(252,165,165,.90)", fontFamily:"'Syne',system-ui,sans-serif" }}>{error}</div> : null}
      {loading ? <div style={{ marginTop:10, fontSize:13, color:"rgba(196,181,253,.65)", fontFamily:"'Syne',system-ui,sans-serif" }}>Chargement…</div> : null}

      {!loading && !edit ? (
        <div style={{ marginTop:12, display:"flex", gap:12, flexWrap:"wrap" }}>
          {/* Calendrier */}
          <div style={{ flex:1, minWidth:320 }}>
            {!token ? (
              <div style={{ marginBottom:10, fontSize:12, color:"rgba(167,139,250,.60)", fontFamily:"'Syne',system-ui,sans-serif" }}>
                Connecte-toi pour t'inscrire et recevoir une notif 10 minutes avant.
              </div>
            ) : null}
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {next7.map(d => {
                const ymd = toLocalYMD(d);
                const arr = occurrences[ymd] || [];
                return (
                  <div key={ymd} className="agenda-card">
                    <div style={{ display:"flex", justifyContent:"space-between", gap:10, alignItems:"baseline" }}>
                      <div style={{ fontWeight:800, fontSize:14, fontFamily:"'Syne',system-ui,sans-serif" }}>
                        {frDayLabel(d)} {pad2(d.getDate())}/{pad2(d.getMonth() + 1)}
                      </div>
                      <div style={{ fontSize:11, color:"rgba(167,139,250,.55)" }}>
                        {arr.length ? `${arr.length} slot${arr.length > 1 ? "s" : ""}` : "—"}
                      </div>
                    </div>
                    {arr.length ? (
                      <div style={{ marginTop:10, display:"flex", flexDirection:"column", gap:8 }}>
                        {arr.map((r, i) => {
                          const rid = Number(r.id);
                          const canSub = token && Number.isFinite(rid) && rid > 0;
                          const isSub = canSub ? mySubs.has(rid) : false;
                          return (
                            <div key={(r.id ?? i) + "_" + ymd} className="agenda-slot"
                              style={{ borderLeft: `5px solid ${ensurePresetColor(r.color)}` }}>
                              <div style={{ minWidth:80, fontWeight:800, fontSize:13, fontFamily:"'Syne',system-ui,sans-serif" }}>
                                {r.startTime}–{r.endTime}
                              </div>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontWeight:800, fontSize:13, display:"flex", gap:6, alignItems:"center", fontFamily:"'Syne',system-ui,sans-serif" }}>
                                  {r._special ? <span title="Événement">⭐</span> : <span title="Régulier">🟣</span>}
                                  <span>{r.title}</span>
                                </div>
                                <div style={{ fontSize:11, color:"rgba(167,139,250,.55)", marginTop:2 }}>
                                  {r._special ? "Événement (date précise)" : "Régulier (hebdo)"}
                                </div>
                              </div>
                              {token ? (
                                <button type="button"
                                  className={isSub ? "btnPrimarySmall" : "btnGhostSmall"}
                                  disabled={!canSub || subsLoading}
                                  onClick={() => toggleSub(rid)}
                                  title="Recevoir une notif 10 minutes avant"
                                  style={{ whiteSpace:"nowrap", fontFamily:"'Syne',system-ui,sans-serif", fontWeight:700 }}>
                                  {isSub ? "Inscrit ✓" : "S'inscrire"}
                                </button>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ marginTop:10, fontSize:12, color:"rgba(167,139,250,.55)" }}>Rien de prévu.</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Légende */}
          <div style={{ width:280, flexShrink:0 }}>
            <div style={{ fontWeight:800, fontSize:14, marginBottom:12, fontFamily:"'Syne',system-ui,sans-serif",
              background:"linear-gradient(90deg,#c4b5fd,#a78bfa)", WebkitBackgroundClip:"text", backgroundClip:"text", color:"transparent" }}>
              Légende
            </div>
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, color:"rgba(167,139,250,.55)", marginBottom:6, fontFamily:"'Syne',system-ui,sans-serif" }}>Réguliers</div>
              {legend.regular.length ? (
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  {legend.regular.map(x => (
                    <div key={"r_" + x.title} style={{ display:"flex", gap:10, alignItems:"center" }}>
                      <span style={{ width:12, height:12, borderRadius:4, background:x.color, display:"inline-block",
                        border:"1px solid rgba(255,255,255,.15)" }} />
                      <span style={{ fontWeight:800, fontSize:13, fontFamily:"'Syne',system-ui,sans-serif" }}>{x.title}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize:12, color:"rgba(167,139,250,.50)" }}>—</div>
              )}
            </div>
            <div>
              <div style={{ fontSize:11, color:"rgba(167,139,250,.55)", marginBottom:6, fontFamily:"'Syne',system-ui,sans-serif" }}>Événements</div>
              {legend.event.length ? (
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  {legend.event.map(x => (
                    <div key={"e_" + x.title} style={{ display:"flex", gap:10, alignItems:"center" }}>
                      <span style={{ width:12, height:12, borderRadius:4, background:x.color, display:"inline-block",
                        border:"1px solid rgba(255,255,255,.15)" }} />
                      <span style={{ fontWeight:800, fontSize:13, fontFamily:"'Syne',system-ui,sans-serif" }}>{x.title}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize:12, color:"rgba(167,139,250,.50)" }}>—</div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {!loading && edit ? (
        <div style={{ marginTop:12 }}>
          <div className="agenda-card">
            <div style={{ fontSize:12, color:"rgba(167,139,250,.60)", marginBottom:12, fontFamily:"'Syne',system-ui,sans-serif" }}>
              Règles (réguliers) + événements (date précise). Palette de couleurs uniquement.
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {rules.map((r, i) => (
                <div key={r.id ?? i} className="agenda-card" style={{ background:"rgba(124,92,252,.06)" }}>
                  <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center", marginBottom:10 }}>
                    <select value={r.kind} onChange={e => setKind(i, e.target.value as any)} className="agenda-input" style={{ fontWeight:800 }}>
                      <option value="regular">Régulier</option>
                      <option value="event">Événement</option>
                    </select>
                    <input className="agenda-input" value={String(r.title ?? "")}
                      onChange={e => updateRule(i, { title: e.target.value })}
                      placeholder="Nom" style={{ flex:1, minWidth:180, fontWeight:800 }} />
                    <input type="time" className="agenda-input" value={String(r.startTime ?? "00:00")}
                      onChange={e => updateRule(i, { startTime: e.target.value })} style={{ fontWeight:800 }} />
                    <input type="time" className="agenda-input" value={String(r.endTime ?? "00:00")}
                      onChange={e => updateRule(i, { endTime: e.target.value })} style={{ fontWeight:800 }} />
                    <button type="button" className="btnGhostSmall" onClick={() => removeRule(i)} style={{ marginLeft:"auto", fontFamily:"'Syne',system-ui,sans-serif", fontWeight:700 }}>
                      Supprimer
                    </button>
                  </div>
                  <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
                    {r.kind === "regular" ? (
                      <select value={Number(r.dayOfWeek ?? 0)}
                        onChange={e => updateRule(i, { dayOfWeek: Number(e.target.value), date: null })}
                        className="agenda-input" style={{ fontWeight:800 }}>
                        <option value={0}>Dimanche</option>
                        <option value={1}>Lundi</option>
                        <option value={2}>Mardi</option>
                        <option value={3}>Mercredi</option>
                        <option value={4}>Jeudi</option>
                        <option value={5}>Vendredi</option>
                        <option value={6}>Samedi</option>
                      </select>
                    ) : (
                      <input type="date" className="agenda-input" value={String(r.date ?? "")}
                        onChange={e => updateRule(i, { date: e.target.value, dayOfWeek: null })} style={{ fontWeight:800 }} />
                    )}
                    {COLOR_PRESETS.map(p => {
                      const active = ensurePresetColor(r.color).toLowerCase() === p.color.toLowerCase();
                      return (
                        <button key={p.color} type="button" className="btnGhostSmall"
                          onClick={() => updateRule(i, { color: p.color })}
                          style={{ display:"inline-flex", alignItems:"center", gap:6, border: active ? "1px solid rgba(255,255,255,.45)" : undefined,
                            fontFamily:"'Syne',system-ui,sans-serif", fontWeight:700 }}
                          title={p.name}>
                          <span style={{ width:12, height:12, borderRadius:4, background:p.color, border:"1px solid rgba(255,255,255,.15)", display:"inline-block" }} />
                          <span>{p.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:12 }}>
              <button type="button" className="btnGhostSmall" onClick={() => setRules(p => [...p, emptyRule()])}
                style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:700 }}>
                + Ajouter une règle
              </button>
            </div>
            {!token ? (
              <div style={{ marginTop:10, fontSize:11, color:"rgba(167,139,250,.55)", fontFamily:"'Syne',system-ui,sans-serif" }}>
                Connecte-toi pour enregistrer.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}