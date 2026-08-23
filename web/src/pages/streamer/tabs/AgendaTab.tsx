// web/src/pages/streamer/tabs/AgendaTab.tsx
// ══════════════════════════════════════════════════════════════
//  PURPLE VELVET — AgendaTab
//  Refonte UX : sections claires, slots enrichis, légende en card
// ══════════════════════════════════════════════════════════════
import * as React from "react";
import {
  Bell,
  CalendarDays,
  Info,
  Pencil,
  Plus,
  Repeat2,
  Save,
  Star,
  Trash2,
  X,
} from "lucide-react";
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
  return ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"][d.getDay()];
}
function isToday(d: Date) {
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}
function timeToMin(s: string) {
  const m = String(s || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return 0;
  return Math.max(0, Math.min(23, Number(m[1]))) * 60 + Math.max(0, Math.min(59, Number(m[2])));
}

const COLOR_PRESETS = [
  { name: "Violet",  color: "#8b5cf6" },
  { name: "Bleu",   color: "#3b82f6" },
  { name: "Cyan",   color: "#06b6d4" },
  { name: "Vert",   color: "#22c55e" },
  { name: "Jaune",  color: "#eab308" },
  { name: "Orange", color: "#f97316" },
  { name: "Rouge",  color: "#ef4444" },
  { name: "Rose",   color: "#ec4899" },
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

/* ─── CSS ────────────────────────────────────────────────────── */
const AGENDA_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');

@keyframes agenda-fade-in {
  from { opacity:0; transform:translateY(8px); }
  to   { opacity:1; transform:translateY(0); }
}

.agenda-root {
  font-family:'Syne',system-ui,sans-serif;
  animation:agenda-fade-in 280ms ease both;
}

.agenda-header {
  display:flex; align-items:center; justify-content:space-between; gap:14px;
  margin-bottom:18px; padding-bottom:14px;
  border-bottom:1px solid rgba(124,92,252,.10);
}

.agenda-title {
  font-family:'Syne',system-ui,sans-serif;
  font-weight:800; font-size:18px; letter-spacing:-.3px;
  background:linear-gradient(90deg,#c4b5fd 0%,#a78bfa 50%,#5b8ef8 100%);
  -webkit-background-clip:text; background-clip:text; color:transparent;
}

.agenda-subtitle {
  margin-top:4px;
  font-size:10px; font-weight:650;
  color:rgba(167,139,250,.52);
}

.agenda-layout {
  display:grid;
  grid-template-columns:minmax(0,1fr) 220px;
  gap:14px;
  align-items:start;
}

.agenda-days {
  min-width:0;
  display:flex; flex-direction:column; gap:10px;
}

.agenda-legend-wrap {
  min-width:0;
  position:sticky;
  top:90px;
}

/* ── Calendrier ── */
.agenda-day-card {
  padding:14px; border-radius:16px;
  border:1px solid rgba(124,92,252,.12);
  background:rgba(124,92,252,.04);
  transition:all 160ms ease;
}

.agenda-day-card.today {
  border-color:rgba(124,92,252,.28);
  background:rgba(124,92,252,.08);
}

.agenda-day-head {
  display:flex; align-items:baseline; justify-content:space-between; gap:10px;
  margin-bottom:12px;
}

.agenda-day-name {
  font-family:'Syne',system-ui,sans-serif;
  font-weight:800; font-size:14px;
  color:rgba(235,232,255,.90);
}

.agenda-day-name.today {
  background:linear-gradient(90deg,#c4b5fd,#a78bfa);
  -webkit-background-clip:text; background-clip:text; color:transparent;
}

.agenda-day-count {
  font-family:'Syne',system-ui,sans-serif;
  font-size:11px; font-weight:600;
  color:rgba(167,139,250,.55);
}

.agenda-today-badge {
  display:inline-flex; align-items:center;
  padding:3px 8px; border-radius:999px;
  border:1px solid rgba(124,92,252,.28);
  background:rgba(124,92,252,.14);
  font-family:'Syne',system-ui,sans-serif;
  font-size:10px; font-weight:800;
  color:rgba(196,181,253,.90);
  letter-spacing:.04em; text-transform:uppercase;
}

/* ── Slot ── */
.agenda-slot {
  display:flex; gap:12px; align-items:center;
  padding:12px 14px; border-radius:14px;
  border:1px solid rgba(124,92,252,.10);
  background:rgba(124,92,252,.04);
  border-left-width:4px;
  transition:all 140ms ease;
}

.agenda-slot:hover {
  background:rgba(124,92,252,.08);
  border-color:rgba(124,92,252,.20);
}

.agenda-slot-time {
  min-width:88px; flex-shrink:0;
  font-family:'Syne',system-ui,sans-serif;
  font-weight:800; font-size:13px;
  color:rgba(235,232,255,.90);
}

.agenda-slot-info { flex:1; min-width:0; }

.agenda-slot-title {
  font-family:'Syne',system-ui,sans-serif;
  font-weight:800; font-size:13px;
  color:rgba(235,232,255,.90);
  display:flex; align-items:center; gap:6px;
}

.agenda-slot-kind {
  font-family:'Syne',system-ui,sans-serif;
  font-size:11px; font-weight:600;
  color:rgba(167,139,250,.55);
  margin-top:3px;
}

.agenda-slot-empty {
  padding:10px 0;
  font-family:'Syne',system-ui,sans-serif;
  font-size:12px; font-weight:600;
  color:rgba(167,139,250,.45);
}

/* ── Légende ── */
.agenda-legend {
  border-radius:16px;
  border:1px solid rgba(124,92,252,.12);
  background:rgba(124,92,252,.04);
  padding:14px;
}

.agenda-legend-title {
  font-family:'Syne',system-ui,sans-serif;
  font-weight:800; font-size:14px;
  background:linear-gradient(90deg,#c4b5fd,#a78bfa);
  -webkit-background-clip:text; background-clip:text; color:transparent;
  margin-bottom:14px;
}

.agenda-legend-section {
  margin-bottom:12px;
}

.agenda-legend-section:last-child { margin-bottom:0; }

.agenda-legend-label {
  font-family:'Syne',system-ui,sans-serif;
  font-size:11px; font-weight:700; letter-spacing:.04em; text-transform:uppercase;
  color:rgba(167,139,250,.55);
  margin-bottom:8px;
}

.agenda-legend-item {
  display:flex; align-items:center; gap:10px;
  margin-bottom:6px;
}

.agenda-legend-dot {
  width:12px; height:12px; border-radius:4px; flex-shrink:0;
  border:1px solid rgba(255,255,255,.18);
}

.agenda-legend-name {
  font-family:'Syne',system-ui,sans-serif;
  font-weight:800; font-size:13px;
  color:rgba(235,232,255,.85);
}

/* ── Notif hint ── */
.agenda-notif-hint {
  padding:12px 14px; border-radius:14px;
  border:1px solid rgba(124,92,252,.14);
  background:rgba(124,92,252,.06);
  font-family:'Syne',system-ui,sans-serif;
  font-size:12px; font-weight:600;
  color:rgba(167,139,250,.70);
  margin-bottom:14px;
}

/* ── Edit mode ── */
.agenda-edit-card {
  padding:16px; border-radius:16px;
  border:1px solid rgba(124,92,252,.16);
  background:rgba(124,92,252,.06);
}

.agenda-edit-hint {
  padding:10px 12px; border-radius:12px;
  border:1px solid rgba(124,92,252,.12);
  background:rgba(124,92,252,.04);
  font-family:'Syne',system-ui,sans-serif;
  font-size:12px; font-weight:600;
  color:rgba(167,139,250,.65);
  margin-bottom:16px;
}

.agenda-rule-card {
  padding:14px; border-radius:14px;
  border:1px solid rgba(124,92,252,.14);
  background:rgba(124,92,252,.07);
  display:flex; flex-direction:column; gap:12px;
  position:relative;
}

.agenda-rule-header {
  display:flex; gap:10px; flex-wrap:wrap; align-items:center;
}

.agenda-rule-footer {
  display:flex; gap:10px; flex-wrap:wrap; align-items:center;
}

.agenda-color-btn {
  display:inline-flex; align-items:center; gap:6px;
  padding:7px 10px; border-radius:10px;
  border:1px solid rgba(124,92,252,.14);
  background:rgba(124,92,252,.06);
  font-family:'Syne',system-ui,sans-serif;
  font-size:11px; font-weight:700;
  color:rgba(196,181,253,.80);
  cursor:pointer; transition:all 130ms ease;
}

.agenda-color-btn:hover {
  background:rgba(124,92,252,.12);
  border-color:rgba(124,92,252,.26);
}

.agenda-color-btn.active {
  border-color:rgba(255,255,255,.40);
  background:rgba(255,255,255,.08);
  color:rgba(235,232,255,.96);
}

.agenda-input {
  padding:11px 13px; border-radius:12px;
  border:1px solid rgba(124,92,252,.20);
  background:rgba(124,92,252,.08);
  color:rgba(235,232,255,.92);
  font-family:'Syne',system-ui,sans-serif;
  font-weight:700; font-size:14px;
  outline:none;
  transition:all 150ms ease;
}

.agenda-input:focus {
  border-color:rgba(124,92,252,.42);
  background:rgba(124,92,252,.12);
  box-shadow:0 0 0 3px rgba(124,92,252,.10);
}

.agenda-error {
  padding:12px 14px; border-radius:12px;
  border:1px solid rgba(239,68,68,.28);
  background:rgba(239,68,68,.08);
  font-family:'Syne',system-ui,sans-serif;
  font-size:12px; font-weight:600;
  color:rgba(252,165,165,.92);
  margin-bottom:12px;
}

/* Clean stream-page treatment */
.agenda-root { color:#f4f0fc; font-family:'Manrope',sans-serif; }
.agenda-root :is(button,input,select,textarea) { font-family:'Manrope',sans-serif !important; font-variant-numeric:tabular-nums; }
.agenda-header { align-items:flex-end; margin-bottom:18px; padding:0; border:0; }
.agenda-kicker { display:flex; align-items:center; gap:7px; color:#9388ab; font-size:9px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; }
.agenda-title { display:block; margin-top:5px; color:#f5f2ff; background:none; font-family:'Manrope',sans-serif; font-size:20px; font-weight:800; letter-spacing:-.045em; }
.agenda-subtitle { margin-top:5px; color:#847b96; font-size:10px; font-weight:600; }
.agenda-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.agenda-action,.agenda-subscribe { min-height:36px; display:inline-flex; align-items:center; justify-content:center; gap:7px; padding:8px 12px; border:1px solid rgba(167,139,250,.16); border-radius:11px; background:rgba(255,255,255,.035); color:#c9c1d7; font:750 10px 'Manrope',sans-serif; cursor:pointer; }
.agenda-action:hover,.agenda-subscribe:hover { border-color:rgba(167,139,250,.32); background:rgba(139,92,246,.1); color:#f4efff; }
.agenda-action.primary,.agenda-subscribe.active { border-color:rgba(139,92,246,.38); background:#7c3aed; color:white; }
.agenda-action.danger { color:#f7a7b2; }
.agenda-action:disabled,.agenda-subscribe:disabled { opacity:.45; cursor:not-allowed; }
.agenda-state { min-height:150px; display:grid; place-items:center; padding:28px; border:1px dashed rgba(167,139,250,.14); border-radius:17px; color:#81788f; font-size:11px; font-weight:650; text-align:center; }
.agenda-error { border-color:rgba(248,113,113,.24); background:rgba(248,113,113,.06); color:#f4a4ad; font:650 10px 'Manrope',sans-serif; }
.agenda-layout { grid-template-columns:minmax(0,1fr) 210px; gap:14px; }
.agenda-days { gap:8px; }
.agenda-notif-hint { display:flex; align-items:center; gap:8px; margin-bottom:6px; border-color:rgba(167,139,250,.12); border-radius:13px; background:rgba(139,92,246,.055); color:#9389a5; font:650 10px 'Manrope',sans-serif; }
.agenda-day-card { padding:13px 14px; border-color:rgba(167,139,250,.11); border-radius:15px; background:rgba(255,255,255,.022); }
.agenda-day-card.today { border-color:rgba(167,139,250,.3); background:rgba(139,92,246,.07); }
.agenda-day-head { align-items:center; margin-bottom:10px; }
.agenda-day-name { color:#dcd6e8; font:800 11px 'Manrope',sans-serif; font-variant-numeric:tabular-nums; }
.agenda-day-name.today { color:#f1ebff; background:none; }
.agenda-day-count { color:#71687e; font:700 9px 'Manrope',sans-serif; }
.agenda-today-badge { border-color:rgba(167,139,250,.25); background:rgba(139,92,246,.12); color:#c7b8f5; font:800 8px 'Manrope',sans-serif; }
.agenda-slot { display:grid; grid-template-columns:82px minmax(0,1fr) auto; gap:12px; padding:10px 11px; border-color:rgba(167,139,250,.09); border-radius:11px; background:rgba(5,3,11,.34); }
.agenda-slot:hover { border-color:rgba(167,139,250,.18); background:rgba(139,92,246,.05); }
.agenda-slot-time { min-width:0; color:#eee9f6; font:800 10px 'Manrope',sans-serif; font-variant-numeric:tabular-nums; }
.agenda-slot-title { color:#ddd7e7; font:750 10px 'Manrope',sans-serif; }
.agenda-slot-icon { display:grid; place-items:center; color:#9c8be2; }
.agenda-slot-kind { margin-top:2px; color:#746b82; font:650 8px 'Manrope',sans-serif; }
.agenda-slot-empty { padding:8px 0 2px; color:#6d6479; font:600 9px 'Manrope',sans-serif; }
.agenda-legend-wrap { top:82px; }
.agenda-legend { border-color:rgba(167,139,250,.11); border-radius:15px; background:rgba(255,255,255,.022); }
.agenda-legend-title { margin-bottom:12px; color:#eee9f6; background:none; font:800 11px 'Manrope',sans-serif; }
.agenda-legend-label { color:#746b82; font:800 8px 'Manrope',sans-serif; }
.agenda-legend-name { color:#c9c2d4; font:700 9px 'Manrope',sans-serif; }
.agenda-legend-dot { width:9px; height:9px; border-radius:3px; }
.agenda-edit-card { border-color:rgba(167,139,250,.12); background:rgba(255,255,255,.02); }
.agenda-edit-hint { display:flex; align-items:center; gap:7px; border-color:rgba(167,139,250,.11); background:rgba(139,92,246,.045); color:#81778f; font:650 9px 'Manrope',sans-serif; }
.agenda-rule-card { border-color:rgba(167,139,250,.12); background:rgba(5,3,11,.3); }
.agenda-input { border-color:rgba(167,139,250,.16); background:rgba(5,3,11,.42); color:#eee9f6; font:650 10px 'Manrope',sans-serif; }
.agenda-color-btn { border-color:rgba(167,139,250,.12); background:rgba(255,255,255,.025); color:#a9a0b6; font:700 9px 'Manrope',sans-serif; }
.agenda-edit-footer { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:14px; }
.agenda-auth-hint { color:#f4a4ad; font-size:9px; font-weight:650; }

@media (max-width:700px) {
  .agenda-header { align-items:flex-start; margin-bottom:14px; }
  .agenda-layout { grid-template-columns:1fr; }
  .agenda-legend-wrap { position:static; }
  .agenda-day-card { padding:12px; }
  .agenda-slot { display:grid; grid-template-columns:1fr auto; gap:8px; }
  .agenda-slot-time { min-width:0; grid-column:1 / -1; font-size:12px; }
  .agenda-slot-info { min-width:0; }
  .agenda-slot button { align-self:center; }
  .agenda-action-label { display:none; }
}
`;

/* ─── Composant ──────────────────────────────────────────────── */
export function AgendaTab({ slug, token, canEdit }: { slug: string; token: string | null; canEdit: boolean }) {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving]   = React.useState(false);
  const [error, setError]     = React.useState<string | null>(null);
  const [edit, setEdit]       = React.useState(false);
  const [rules, setRules]     = React.useState<AgendaRule[]>([]);
  const [subsLoading, setSubsLoading] = React.useState(false);
  const [mySubs, setMySubs]   = React.useState<Set<number>>(new Set());

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
    setRules(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }

  function setKind(i: number, kind: "regular" | "event") {
    const now = new Date();
    setRules(prev => prev.map((r, idx) => {
      if (idx !== i) return r;
      if (kind === "event") return { ...r, kind: "event", date: String(r.date || "").trim() || toLocalYMD(now), dayOfWeek: null };
      return { ...r, kind: "regular", dayOfWeek: Number.isFinite(Number(r.dayOfWeek)) ? Number(r.dayOfWeek) : now.getDay(), date: null };
    }));
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
        const base = { id: r.id, kind, title: String(r.title || "").trim().slice(0, 80) || "Stream", color, startTime: String(r.startTime || "00:00").trim(), endTime: String(r.endTime || "00:00").trim() };
        if (kind === "event") return { ...base, date: String(r.date || "").trim() || today, dayOfWeek: null };
        const dow = Number(r.dayOfWeek);
        return { ...base, dayOfWeek: Number.isFinite(dow) ? dow : 0, date: null };
      });
      const rr = await putStreamerAgenda(slug, token, payload);
      if (!("ok" in rr) || !rr.ok) throw new Error((rr as any)?.error || "Erreur");
      setEdit(false); await load(); await loadSubs();
    } catch (e: any) { setError(String(e?.message || "Erreur")); }
    finally { setSaving(false); }
  }

  const next7 = React.useMemo(() => {
    const out: Date[] = [];
    const d0 = new Date(); d0.setHours(0, 0, 0, 0);
    for (let i = 0; i < 7; i++) { const d = new Date(d0); d.setDate(d0.getDate() + i); out.push(d); }
    return out;
  }, []);

  const occurrences = React.useMemo(() => {
    const byDay: Record<string, Array<AgendaRule & { _special?: boolean }>> = {};
    for (const d of next7) {
      const ymd = toLocalYMD(d);
      const dow = d.getDay();
      const arr: Array<AgendaRule & { _special?: boolean }> = [];
      for (const r of rules) {
        if (r.kind === "regular") {
          const v = Number(r.dayOfWeek);
          if (v === -1 || v === dow) arr.push({ ...r, _special: false });
          continue;
        }
        if (r.kind === "event" && String(r.date || "") === ymd) {
          arr.push({ ...r, _special: true });
        }
      }

      arr.sort((a, b) => timeToMin(a.startTime) - timeToMin(b.startTime));
      byDay[ymd] = arr;
    }
    return byDay;
  }, [next7, rules]);

  const legend = React.useMemo(() => {
    const reg = new Map<string, string>();
    const ev  = new Map<string, string>();
    for (const d of next7) {
      for (const r of occurrences[toLocalYMD(d)] || []) {
        const t = String(r.title || "").trim();
        if (!t) continue;
        const c = ensurePresetColor(r.color);
        if (r._special) ev.set(t, c); else reg.set(t, c);
      }
    }
    return {
      regular: Array.from(reg.entries()).map(([title, color]) => ({ title, color })),
      event:   Array.from(ev.entries()).map(([title, color]) => ({ title, color })),
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

  /* ─── Render ─────────────────────────────────────────────── */
  return (
    <div className="agenda-root">
      <style>{AGENDA_STYLES}</style>

      {/* Header */}
      <div className="agenda-header">
        <div>
          <div className="agenda-kicker"><CalendarDays size={13} /> Programmation</div>
          <span className="agenda-title">Les 7 prochains jours</span>
          <div className="agenda-subtitle">Prochains directs et rappels de la chaîne</div>
        </div>
        {canEdit ? (
          <div className="agenda-actions">
            {!edit ? (
              <button type="button" className="agenda-action" onClick={() => setEdit(true)}><Pencil size={13} /><span className="agenda-action-label">Modifier</span></button>
            ) : (
              <>
                <button type="button" className="agenda-action" disabled={saving} onClick={() => { setEdit(false); load(); }}><X size={13} /><span className="agenda-action-label">Annuler</span></button>
                <button type="button" className="agenda-action primary" disabled={saving || !token} onClick={save}>
                  <Save size={13} /> {saving ? "Enregistrement…" : "Enregistrer"}
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>

      {/* Error */}
      {error ? <div className="agenda-error" role="alert">{error}</div> : null}

      {/* Loading */}
      {loading ? (
        <div className="agenda-state">Chargement de l'agenda…</div>
      ) : null}

      {/* ── Vue calendrier ── */}
      {!loading && !edit ? (
        <div className="agenda-layout">

          {/* Colonne principale */}
          <div className="agenda-days">

            {!token ? (
              <div className="agenda-notif-hint">
                <Bell size={14} /> Connecte-toi pour t'inscrire et recevoir une notification <strong>10 minutes avant</strong>.
              </div>
            ) : null}

            {next7.map(d => {
              const ymd  = toLocalYMD(d);
              const arr  = occurrences[ymd] || [];
              const today = isToday(d);
              return (
                <div key={ymd} className={`agenda-day-card${today ? " today" : ""}`}>
                  <div className="agenda-day-head">
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span className={`agenda-day-name${today ? " today" : ""}`}>
                        {frDayLabel(d)} {pad2(d.getDate())}/{pad2(d.getMonth() + 1)}
                      </span>
                      {today ? <span className="agenda-today-badge">Aujourd'hui</span> : null}
                    </div>
                    <span className="agenda-day-count">
                      {arr.length ? `${arr.length} slot${arr.length > 1 ? "s" : ""}` : "—"}
                    </span>
                  </div>

                  {arr.length ? (
                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                      {arr.map((r, i) => {
                        const rid    = Number(r.id);
                        const canSub = !!(token && Number.isFinite(rid) && rid > 0);
                        const isSub  = canSub ? mySubs.has(rid) : false;
                        const color  = ensurePresetColor(r.color);
                        return (
                          <div key={(r.id ?? i) + "_" + ymd} className="agenda-slot"
                            style={{ borderLeftColor: color }}>
                            <div className="agenda-slot-time">{r.startTime}–{r.endTime}</div>
                            <div className="agenda-slot-info">
                              <div className="agenda-slot-title">
                                <span className="agenda-slot-icon">{r._special ? <Star size={11} /> : <Repeat2 size={11} />}</span>
                                <span>{r.title}</span>
                              </div>
                              <div className="agenda-slot-kind">
                                {r._special ? "Événement" : "Régulier hebdo"}
                              </div>
                            </div>
                            {token ? (
                              <button type="button"
                                className={`agenda-subscribe${isSub ? " active" : ""}`}
                                disabled={!canSub || subsLoading}
                                onClick={() => toggleSub(rid)}
                                title="Notif 10 min avant"
                                style={{ whiteSpace:"nowrap", flexShrink:0 }}>
                                <Bell size={11} /> {isSub ? "Inscrit" : "S'inscrire"}
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="agenda-slot-empty">Rien de prévu</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Légende */}
          {(legend.regular.length || legend.event.length) ? (
            <div className="agenda-legend-wrap">
              <div className="agenda-legend">
                <div className="agenda-legend-title">Légende</div>
                {legend.regular.length ? (
                  <div className="agenda-legend-section">
                    <div className="agenda-legend-label">Réguliers</div>
                    {legend.regular.map(x => (
                      <div key={"r_" + x.title} className="agenda-legend-item">
                        <span className="agenda-legend-dot" style={{ background: x.color }} />
                        <span className="agenda-legend-name">{x.title}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                {legend.event.length ? (
                  <div className="agenda-legend-section">
                    <div className="agenda-legend-label">Événements</div>
                    {legend.event.map(x => (
                      <div key={"e_" + x.title} className="agenda-legend-item">
                        <span className="agenda-legend-dot" style={{ background: x.color }} />
                        <span className="agenda-legend-name">{x.title}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── Vue édition ── */}
      {!loading && edit ? (
        <div className="agenda-edit-card">
          <div className="agenda-edit-hint">
            <Info size={13} /> Ajoute des rendez-vous hebdomadaires ou des événements ponctuels avec une date précise.
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {rules.map((r, i) => (
              <div key={r.id ?? i} className="agenda-rule-card">

                {/* Header règle */}
                <div className="agenda-rule-header">
                  <select value={r.kind} onChange={e => setKind(i, e.target.value as any)}
                    className="agenda-input" style={{ flex:"0 0 auto", fontWeight:800 }}>
                    <option value="regular">Régulier</option>
                    <option value="event">Événement</option>
                  </select>
                  <input className="agenda-input" value={String(r.title ?? "")}
                    onChange={e => updateRule(i, { title: e.target.value })}
                    placeholder="Titre du stream" style={{ flex:1, minWidth:160, fontWeight:800 }} />
                  <input type="time" className="agenda-input" value={String(r.startTime ?? "00:00")}
                    onChange={e => updateRule(i, { startTime: e.target.value })} style={{ fontWeight:800 }} />
                  <span style={{ color:"rgba(167,139,250,.55)", fontWeight:700, fontSize:13 }}>→</span>
                  <input type="time" className="agenda-input" value={String(r.endTime ?? "00:00")}
                    onChange={e => updateRule(i, { endTime: e.target.value })} style={{ fontWeight:800 }} />
                  <button type="button" className="agenda-action danger" onClick={() => removeRule(i)}
                    style={{ marginLeft:"auto", flexShrink:0 }}>
                    <Trash2 size={13} /> Supprimer
                  </button>
                </div>

                {/* Footer règle */}
                <div className="agenda-rule-footer">
                  {r.kind === "regular" ? (
                    <select
                      value={Number(r.dayOfWeek ?? 0)}
                      onChange={e => updateRule(i, { dayOfWeek: Number(e.target.value), date: null })}
                      className="agenda-input"
                      style={{ fontWeight: 800, flex: "0 0 auto" }}
                    >
                      <option value={-1}>Tous les jours</option>
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
                      onChange={e => updateRule(i, { date: e.target.value, dayOfWeek: null })}
                      style={{ fontWeight:800, flex:"0 0 auto" }} />
                  )}

                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    {COLOR_PRESETS.map(p => {
                      const active = ensurePresetColor(r.color).toLowerCase() === p.color.toLowerCase();
                      return (
                        <button key={p.color} type="button"
                          className={`agenda-color-btn${active ? " active" : ""}`}
                          onClick={() => updateRule(i, { color: p.color })}
                          title={p.name}>
                          <span style={{ width:11, height:11, borderRadius:3, background:p.color, border:"1px solid rgba(255,255,255,.18)", display:"inline-block", flexShrink:0 }} />
                          <span>{p.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="agenda-edit-footer">
            <button type="button" className="agenda-action"
              onClick={() => setRules(p => [...p, emptyRule()])}>
              <Plus size={13} /> Ajouter une règle
            </button>
            {!token ? (
              <div className="agenda-auth-hint">
                Connecte-toi pour enregistrer.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

    </div>
  );
}
