import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  createExpense,
  deleteExpense,
  listExpenses,
  updateExpense,
  type Expense,
  type ExpenseCategory,
  type ExpenseInput,
} from "../lib/api_expenses";
import {
  getFsbInstagramDashboard,
  type FsbInstagramDashboardResponse,
  type FsbInstagramItem,
} from "../lib/api_fsb_dashboard";
import { canAccessFsbBoard } from "../lib/fsb_access";
import { FsbAgencySection } from "./fsb/FsbAgencySection";

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  giveaway: "Giveaway",
  offres: "Offres",
  parrainage: "Parrainage",
  abonnement: "Abonnement",
  personnalise: "Personnalise",
};

type BoardSection = "home" | "expenses" | "instagram" | "agency" | "tools";
type SortBy = "date" | "amount";
type SortDirection = "asc" | "desc";
type InstagramView = "week" | "month";

type FormState = {
  description: string;
  category: ExpenseCategory;
  amount: string;
  date: string;
  isRecurring: boolean;
  recurrenceEndDate: string;
  notes: string;
};

type VisibleExpense = {
  source: Expense;
  occurrenceDate: string;
  isProjected: boolean;
  status: "paid" | "due";
};

const SECTION_LABELS: Record<BoardSection, string> = {
  home: "Accueil",
  expenses: "Frais societe",
  instagram: "Agenda Instagram",
  agency: "Agence",
  tools: "Outils",
};

const PAGE_CSS = `
.fsb{--bg:#0e1526;--panel:#121b31;--soft:#16213c;--soft2:#0d1424;--bd:rgba(255,255,255,.08);--text:#eef4ff;--muted:rgba(210,223,245,.72);color:var(--text)}
.fsb-shell{border:1px solid var(--bd);border-radius:24px;background:radial-gradient(circle at top left,rgba(255,178,107,.16),transparent 30%),radial-gradient(circle at top right,rgba(113,213,210,.14),transparent 26%),var(--bg);box-shadow:0 28px 80px rgba(0,0,0,.38);padding:20px}
.fsb-card,.fsb-empty,.fsb-modal{border:1px solid var(--bd);border-radius:20px;background:var(--panel);box-shadow:0 18px 44px rgba(0,0,0,.22);padding:18px}
.fsb-card+.fsb-card,.fsb-card+.fsb-empty,.fsb-empty+.fsb-card{margin-top:18px}
.fsb-row,.fsb-sectionhead{display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between}
.fsb-actions,.fsb-inline,.fsb-tags,.fsb-nav,.fsb-pills{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.fsb-nav{margin-top:14px}
.fsb-btn,.fsb-icon,.fsb-table button,.fsb-navbtn,.fsb-jump{border-radius:12px;border:1px solid var(--bd);font:inherit;background:rgba(255,255,255,.04);color:var(--text);cursor:pointer;transition:transform .14s ease,filter .14s ease}
.fsb-btn:hover,.fsb-icon:hover,.fsb-table button:hover,.fsb-navbtn:hover,.fsb-jump:hover{transform:translateY(-1px);filter:brightness(1.05)}
.fsb-btn,.fsb-navbtn,.fsb-jump{padding:11px 14px;font-weight:700;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}
.fsb-btn-primary,.fsb-navbtn-active{background:linear-gradient(135deg,rgba(255,178,107,.24),rgba(255,141,141,.14));border-color:rgba(255,178,107,.26)}
.fsb-icon{width:44px;height:44px;display:grid;place-items:center}
.fsb-copy,.fsb-muted{color:var(--muted);line-height:1.6}
.fsb-sectiontitle{margin:0;font-size:24px;letter-spacing:-.03em}
.fsb-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-top:18px}
.fsb-stat{border:1px solid var(--bd);border-radius:18px;background:var(--soft);padding:16px}
.fsb-stat small{display:block;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;font-size:11px;font-weight:800}
.fsb-stat strong{display:block;margin-top:10px;font-size:30px;letter-spacing:-.04em}
.fsb-stat span{display:block;margin-top:8px;color:var(--muted);font-size:13px}
.fsb-grid-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
.fsb-grid-2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
.fsb-module{display:flex;flex-direction:column;gap:14px;min-height:220px}
.fsb-module strong{font-size:22px;letter-spacing:-.03em}
.fsb-pill,.fsb-tag{display:inline-flex;align-items:center;padding:7px 10px;border-radius:999px;border:1px solid var(--bd);background:rgba(255,255,255,.04);font-size:12px;font-weight:700}
.fsb-pill-soft,.fsb-tag-scheduled,.fsb-tag-rec{background:rgba(113,213,210,.12)}
.fsb-pill-warn,.fsb-tag-due,.fsb-tag-uploading{background:rgba(255,178,107,.12)}
.fsb-pill-bad,.fsb-tag-error{background:rgba(255,141,141,.12)}
.fsb-tag-paid,.fsb-tag-done{background:rgba(120,231,180,.12)}
.fsb-list{display:grid;gap:10px;margin-top:14px}
.fsb-listitem{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:12px 14px;border-radius:16px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.03)}
.fsb-listmain{min-width:0}
.fsb-listmain strong,.fsb-listmain a{display:block;color:var(--text);text-decoration:none}
.fsb-listmeta{margin-top:4px;color:var(--muted);font-size:12px;line-height:1.45}
.fsb-toolbar{margin-top:18px}
.fsb-tablewrap{margin-top:18px;border:1px solid var(--bd);border-radius:20px;overflow:hidden;background:var(--panel)}
.fsb-table{width:100%;border-collapse:collapse}
.fsb-table th,.fsb-table td{padding:15px 16px;text-align:left;vertical-align:top}
.fsb-table th{background:rgba(255,255,255,.03);font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.fsb-table td{border-top:1px solid rgba(255,255,255,.06)}
.fsb-table strong{display:block}
.fsb-sub{margin-top:6px;color:var(--muted);font-size:12px;line-height:1.55}
.fsb-alert{margin-top:16px;padding:13px 15px;border-radius:14px;border:1px solid rgba(255,141,141,.22);background:rgba(255,141,141,.08);color:#ffd7d7}
.fsb-backdrop{position:fixed;inset:0;background:rgba(4,8,20,.74);backdrop-filter:blur(10px);display:grid;place-items:center;padding:16px;z-index:120}
.fsb-modal{width:min(720px,100%);max-height:88vh;overflow:auto}
.fsb-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:16px}
.fsb-field{display:grid;gap:8px}
.fsb-field-full{grid-column:1/-1}
.fsb-field label{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:800}
.fsb-input,.fsb-select,.fsb-textarea{width:100%;box-sizing:border-box;border-radius:12px;border:1px solid var(--bd);background:rgba(255,255,255,.04);color:var(--text);font:inherit;padding:12px 13px}
.fsb-textarea{min-height:120px;resize:vertical}
.fsb-check{display:flex;gap:10px;align-items:center;font-weight:700}
.fsb-modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}
.fsb-calendar{margin-top:18px;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:12px}
.fsb-calendar-head{padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.fsb-day,.fsb-daylist{border-radius:18px;border:1px solid rgba(255,255,255,.06);background:var(--soft2);padding:12px;display:flex;flex-direction:column;gap:10px}
.fsb-day{min-height:190px}
.fsb-daylist{min-height:240px}
.fsb-day-out{opacity:.58}
.fsb-day-today{border-color:rgba(255,178,107,.32);box-shadow:0 0 0 1px rgba(255,178,107,.16) inset}
.fsb-day-top{display:flex;align-items:center;justify-content:space-between;gap:8px}
.fsb-day-title{font-weight:800}
.fsb-day-sub{font-size:12px;color:var(--muted)}
.fsb-day-items{display:grid;gap:8px}
.fsb-mini{display:grid;gap:5px;padding:10px 11px;border-radius:14px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.04);color:var(--text);text-decoration:none}
.fsb-mini strong{font-size:13px;line-height:1.35}
.fsb-mini small{color:var(--muted);font-size:11px;line-height:1.35}
.fsb-mini-scheduled{border-color:rgba(113,213,210,.18)}
.fsb-mini-done{border-color:rgba(120,231,180,.18)}
.fsb-mini-error{border-color:rgba(255,141,141,.18)}
.fsb-mini-uploading{border-color:rgba(255,178,107,.18)}
.fsb-more{color:var(--muted);font-size:12px}
.fsb-week{margin-top:18px;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:12px}
.fsb-emptyblock{display:grid;place-items:center;min-height:120px;border-radius:16px;border:1px dashed rgba(255,255,255,.08);color:var(--muted);font-size:13px}
.fsb-thumbrow{display:flex;gap:12px;align-items:center}
.fsb-thumb{width:68px;height:68px;border-radius:16px;object-fit:cover;background:rgba(255,255,255,.04);flex-shrink:0}
.fsb-thumb-placeholder{display:grid;place-items:center;background:linear-gradient(135deg,rgba(255,178,107,.22),rgba(113,213,210,.16));font-weight:800}
.fsb-coming{display:grid;gap:10px;margin-top:14px}
.fsb-coming div{padding:12px 14px;border-radius:16px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06)}
.fsb-coming strong{display:block}
@media (max-width:1100px){.fsb-grid-3,.fsb-grid-2,.fsb-week{grid-template-columns:1fr}.fsb-calendar{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:860px){.fsb-grid{grid-template-columns:1fr}.fsb-calendar{grid-template-columns:1fr}.fsb-calendar-head{display:none}}
@media (max-width:740px){.fsb-tablewrap{overflow:auto}.fsb-table{min-width:760px}}
`;

function normalizeSection(value: string | null): BoardSection {
  if (value === "expenses" || value === "instagram" || value === "agency" || value === "tools") return value;
  return "home";
}

function todayKey() {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(p.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function currentMonthKey() {
  return todayKey().slice(0, 7);
}

function addMonths(monthKey: string, delta: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function dateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function dayLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function shortDayName(index: number) {
  const base = new Date(Date.UTC(2026, 0, 5 + index));
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", weekday: "short" }).format(base);
}

function eur(value: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(dateKeyValue: string, delta: number) {
  const date = parseDateOnly(dateKeyValue);
  date.setUTCDate(date.getUTCDate() + delta);
  return toDateKey(date);
}

function addMonthsToDate(dateKeyValue: string, delta: number) {
  const [year, month, day] = dateKeyValue.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1 + delta, 1));
  const safeDay = Math.min(day, daysInMonth(next.getUTCFullYear(), next.getUTCMonth() + 1));
  next.setUTCDate(safeDay);
  return toDateKey(next);
}

function startOfWeek(dateKeyValue: string) {
  const date = parseDateOnly(dateKeyValue);
  const dayIndex = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayIndex);
  return toDateKey(date);
}

function endOfWeek(dateKeyValue: string) {
  return addDays(startOfWeek(dateKeyValue), 6);
}

function startOfMonthDate(dateKeyValue: string) {
  return `${dateKeyValue.slice(0, 7)}-01`;
}

function endOfMonthDate(dateKeyValue: string) {
  const [year, month] = dateKeyValue.slice(0, 7).split("-").map(Number);
  return `${dateKeyValue.slice(0, 7)}-${String(daysInMonth(year, month)).padStart(2, "0")}`;
}

function startOfCalendarMonth(dateKeyValue: string) {
  return startOfWeek(startOfMonthDate(dateKeyValue));
}

function endOfCalendarMonth(dateKeyValue: string) {
  const end = parseDateOnly(endOfMonthDate(dateKeyValue));
  const dayIndex = (end.getUTCDay() + 6) % 7;
  end.setUTCDate(end.getUTCDate() + (6 - dayIndex));
  return toDateKey(end);
}

function buildMonthGrid(dateKeyValue: string) {
  const start = startOfCalendarMonth(dateKeyValue);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function weekRangeLabel(dateKeyValue: string) {
  const from = startOfWeek(dateKeyValue);
  const to = endOfWeek(dateKeyValue);
  return `${dayLabel(from)} - ${dayLabel(to)}`;
}

function instagramDisplayRange(view: InstagramView, focusDate: string) {
  if (view === "week") return { from: startOfWeek(focusDate), to: endOfWeek(focusDate) };
  return { from: startOfMonthDate(focusDate), to: endOfMonthDate(focusDate) };
}

function instagramFetchRange(view: InstagramView, focusDate: string) {
  if (view === "week") {
    return { from: startOfWeek(focusDate), toExclusive: addDays(endOfWeek(focusDate), 1) };
  }
  return { from: startOfCalendarMonth(focusDate), toExclusive: addDays(endOfCalendarMonth(focusDate), 1) };
}

function makeVisible(expense: Expense, monthKeyValue: string, today: string): VisibleExpense | null {
  if (!expense.isRecurring) {
    if (!expense.date.startsWith(monthKeyValue)) return null;
    return {
      source: expense,
      occurrenceDate: expense.date,
      isProjected: false,
      status: expense.date < today ? "paid" : "due",
    };
  }

  if (monthKeyValue < expense.date.slice(0, 7)) return null;

  const [year, month] = monthKeyValue.split("-").map(Number);
  const anchorDay = Number(expense.date.slice(8, 10));
  const occurrenceDay = Math.min(anchorDay, daysInMonth(year, month));
  const occurrenceDate = `${monthKeyValue}-${String(occurrenceDay).padStart(2, "0")}`;

  if (expense.recurrenceEndDate && occurrenceDate > expense.recurrenceEndDate) return null;

  return {
    source: expense,
    occurrenceDate,
    isProjected: occurrenceDate !== expense.date,
    status: occurrenceDate < today ? "paid" : "due",
  };
}

function defaultForm(): FormState {
  return {
    description: "",
    category: "abonnement",
    amount: "",
    date: todayKey(),
    isRecurring: false,
    recurrenceEndDate: "",
    notes: "",
  };
}

function expenseToForm(expense: Expense): FormState {
  return {
    description: expense.description,
    category: expense.category,
    amount: String(expense.amount),
    date: expense.date,
    isRecurring: expense.isRecurring,
    recurrenceEndDate: expense.recurrenceEndDate || "",
    notes: expense.notes || "",
  };
}

function toPayload(form: FormState): ExpenseInput {
  return {
    description: form.description.trim(),
    category: form.category,
    amount: Number(form.amount),
    date: form.date,
    isRecurring: form.isRecurring,
    recurrenceEndDate: form.isRecurring && form.recurrenceEndDate ? form.recurrenceEndDate : null,
    notes: form.notes.trim() ? form.notes.trim() : null,
  };
}

function getInstagramItemDay(item: FsbInstagramItem) {
  return item.scheduledDay || item.scheduledAt?.slice(0, 10) || "";
}

function getInstagramItemTime(item: FsbInstagramItem) {
  if (item.scheduledTime) return item.scheduledTime;
  if (item.scheduledAt) return item.scheduledAt.slice(11, 16);
  return "--:--";
}

function getInstagramItemHref(item: FsbInstagramItem) {
  return item.platformUrl || item.outputUrl || null;
}

function isAbsoluteUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function instagramStatusLabel(status: string) {
  if (status === "done") return "Publie";
  if (status === "error") return "Erreur";
  if (status === "uploading") return "En cours";
  return "Programme";
}

function instagramStatusClass(status: string) {
  if (status === "done") return "fsb-tag-done";
  if (status === "error") return "fsb-tag-error";
  if (status === "uploading") return "fsb-tag-uploading";
  return "fsb-tag-scheduled";
}

function groupInstagramItems(items: FsbInstagramItem[]) {
  return items.reduce<Record<string, FsbInstagramItem[]>>((acc, item) => {
    const day = getInstagramItemDay(item);
    if (!day) return acc;
    if (!acc[day]) acc[day] = [];
    acc[day].push(item);
    return acc;
  }, {});
}

function computeInstagramStats(items: FsbInstagramItem[]) {
  return items.reduce(
    (acc, item) => {
      acc.total += 1;
      if (item.status === "done") acc.published += 1;
      else if (item.status === "error") acc.errors += 1;
      else if (item.status === "uploading") acc.uploading += 1;
      else acc.scheduled += 1;
      return acc;
    },
    { total: 0, scheduled: 0, published: 0, errors: 0, uploading: 0 }
  );
}

function ExpenseModal({
  editing,
  form,
  saving,
  error,
  onClose,
  onChange,
  onSubmit,
}: {
  editing: Expense | null;
  form: FormState;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onChange: (patch: Partial<FormState>) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fsb-backdrop" onClick={onClose}>
      <div className="fsb-modal" onClick={(event) => event.stopPropagation()}>
        <h2 style={{ margin: 0 }}>{editing ? "Modifier le frais" : "Nouveau frais"}</h2>
        <p className="fsb-copy" style={{ marginTop: 10 }}>
          {editing?.isRecurring
            ? "La date modifie l'ancre de la serie recurrente."
            : "Version rapide : EUR uniquement et recurrence mensuelle simple."}
        </p>
        {error ? <div className="fsb-alert">{error}</div> : null}
        <form onSubmit={onSubmit}>
          <div className="fsb-grid">
            <div className="fsb-field fsb-field-full">
              <label>Description</label>
              <input
                className="fsb-input"
                value={form.description}
                onChange={(event) => onChange({ description: event.target.value })}
                maxLength={160}
                required
              />
            </div>
            <div className="fsb-field">
              <label>Categorie</label>
              <select
                className="fsb-select"
                value={form.category}
                onChange={(event) => onChange({ category: event.target.value as ExpenseCategory })}
              >
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="fsb-field">
              <label>Montant (EUR)</label>
              <input
                className="fsb-input"
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={(event) => onChange({ amount: event.target.value })}
                required
              />
            </div>
            <div className="fsb-field">
              <label>Date</label>
              <input
                className="fsb-input"
                type="date"
                value={form.date}
                onChange={(event) => onChange({ date: event.target.value })}
                required
              />
            </div>
            <div className="fsb-field">
              <label>Fin de recurrence</label>
              <input
                className="fsb-input"
                type="date"
                value={form.recurrenceEndDate}
                onChange={(event) => onChange({ recurrenceEndDate: event.target.value })}
                disabled={!form.isRecurring}
                min={form.date}
              />
            </div>
            <div className="fsb-field fsb-field-full">
              <label>Recurrence</label>
              <label className="fsb-check">
                <input
                  type="checkbox"
                  checked={form.isRecurring}
                  onChange={(event) =>
                    onChange({
                      isRecurring: event.target.checked,
                      recurrenceEndDate: event.target.checked ? form.recurrenceEndDate : "",
                    })
                  }
                />
                Recalculer ce frais tous les mois sur le meme jour
              </label>
            </div>
            <div className="fsb-field fsb-field-full">
              <label>Notes</label>
              <textarea
                className="fsb-textarea"
                value={form.notes}
                onChange={(event) => onChange({ notes: event.target.value })}
                maxLength={2000}
              />
            </div>
          </div>
          <div className="fsb-modal-actions">
            <button className="fsb-btn" type="button" onClick={onClose}>
              Annuler
            </button>
            <button className="fsb-btn fsb-btn-primary" type="submit" disabled={saving}>
              {saving ? "Enregistrement..." : editing ? "Mettre a jour" : "Creer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function FsbBoardPage() {
  const { user, token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const section = normalizeSection(searchParams.get("section"));
  const canAccess = canAccessFsbBoard(user);
  const editorHref = `/editorFSN?returnTo=${encodeURIComponent("/FSB_Board?section=tools")}`;

  const [expenses, setExpenses] = React.useState<Expense[]>([]);
  const [expensesLoading, setExpensesLoading] = React.useState(false);
  const [expensesError, setExpensesError] = React.useState<string | null>(null);
  const [monthKeyValue, setMonthKeyValue] = React.useState(currentMonthKey);
  const [sortBy, setSortBy] = React.useState<SortBy>("date");
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("asc");
  const [modalOpen, setModalOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [modalError, setModalError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<Expense | null>(null);
  const [form, setForm] = React.useState<FormState>(defaultForm);

  const [instagramView, setInstagramView] = React.useState<InstagramView>("week");
  const [instagramFocusDate, setInstagramFocusDate] = React.useState(todayKey);
  const [instagramData, setInstagramData] = React.useState<FsbInstagramDashboardResponse | null>(null);
  const [instagramLoading, setInstagramLoading] = React.useState(false);
  const [instagramError, setInstagramError] = React.useState<string | null>(null);

  React.useEffect(() => {
    document.title = "FSB Board | LunaLive";
  }, []);

  const setSection = React.useCallback(
    (next: BoardSection) => {
      const params = new URLSearchParams(searchParams);
      if (next === "home") params.delete("section");
      else params.set("section", next);
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const reloadExpenses = React.useCallback(async () => {
    if (!token || !canAccess) return;
    setExpensesLoading(true);
    setExpensesError(null);
    try {
      const response = await listExpenses();
      setExpenses(response.expenses);
    } catch (err: any) {
      setExpensesError(String(err?.message || "Chargement impossible."));
    } finally {
      setExpensesLoading(false);
    }
  }, [canAccess, token]);

  React.useEffect(() => {
    void reloadExpenses();
  }, [reloadExpenses]);

  const instagramRange = React.useMemo(
    () => ({
      display: instagramDisplayRange(instagramView, instagramFocusDate),
      fetch: instagramFetchRange(instagramView, instagramFocusDate),
    }),
    [instagramFocusDate, instagramView]
  );

  const reloadInstagram = React.useCallback(async () => {
    if (!token || !canAccess) return;
    setInstagramLoading(true);
    setInstagramError(null);
    try {
      const response = await getFsbInstagramDashboard({
        from: instagramRange.fetch.from,
        to: instagramRange.fetch.toExclusive,
      });
      setInstagramData(response);
    } catch (err: any) {
      setInstagramError(String(err?.message || "Chargement Instagram impossible."));
    } finally {
      setInstagramLoading(false);
    }
  }, [canAccess, instagramRange.fetch.from, instagramRange.fetch.toExclusive, token]);

  React.useEffect(() => {
    void reloadInstagram();
  }, [reloadInstagram]);

  const today = React.useMemo(() => todayKey(), []);

  const expenseRows = React.useMemo(() => {
    const visible = expenses
      .map((expense) => makeVisible(expense, monthKeyValue, today))
      .filter(Boolean) as VisibleExpense[];

    return visible.sort((a, b) => {
      if (sortBy === "amount") {
        const delta = a.source.amount - b.source.amount;
        return sortDirection === "asc" ? delta : -delta;
      }
      const delta = a.occurrenceDate.localeCompare(b.occurrenceDate);
      return sortDirection === "asc" ? delta : -delta;
    });
  }, [expenses, monthKeyValue, sortBy, sortDirection, today]);

  const expenseStats = React.useMemo(
    () =>
      expenseRows.reduce(
        (acc, row) => {
          acc.total += row.source.amount;
          if (row.status === "paid") acc.paid += row.source.amount;
          else acc.due += row.source.amount;
          return acc;
        },
        { total: 0, paid: 0, due: 0 }
      ),
    [expenseRows]
  );

  const instagramDisplayItems = React.useMemo(() => {
    const items = instagramData?.items || [];
    return items
      .filter((item) => {
        const day = getInstagramItemDay(item);
        return day >= instagramRange.display.from && day <= instagramRange.display.to;
      })
      .sort((a, b) => {
        const left = `${getInstagramItemDay(a)} ${getInstagramItemTime(a)}`;
        const right = `${getInstagramItemDay(b)} ${getInstagramItemTime(b)}`;
        return left.localeCompare(right);
      });
  }, [instagramData?.items, instagramRange.display.from, instagramRange.display.to]);

  const instagramItemsByDay = React.useMemo(
    () => groupInstagramItems(instagramData?.items || []),
    [instagramData?.items]
  );

  const instagramStats = React.useMemo(
    () => computeInstagramStats(instagramDisplayItems),
    [instagramDisplayItems]
  );

  const upcomingInstagram = React.useMemo(
    () => instagramDisplayItems.filter((item) => getInstagramItemDay(item) >= today).slice(0, 6),
    [instagramDisplayItems, today]
  );

  const instagramTimeline = React.useMemo(
    () =>
      (instagramData?.timeline || []).filter(
        (point) => point.day >= instagramRange.display.from && point.day <= instagramRange.display.to
      ),
    [instagramData?.timeline, instagramRange.display.from, instagramRange.display.to]
  );

  function openCreate() {
    setEditing(null);
    setForm(defaultForm());
    setModalError(null);
    setModalOpen(true);
  }

  function openEdit(expense: Expense) {
    setEditing(expense);
    setForm(expenseToForm(expense));
    setModalError(null);
    setModalOpen(true);
  }

  async function onSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setModalError(null);
    try {
      const payload = toPayload(form);
      if (!payload.description) throw new Error("La description est obligatoire.");
      if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
        throw new Error("Le montant doit etre superieur a 0.");
      }
      if (payload.recurrenceEndDate && payload.recurrenceEndDate < payload.date) {
        throw new Error("La fin de recurrence doit etre posterieure a la date.");
      }

      if (editing) {
        const response = await updateExpense(editing.id, payload);
        setExpenses((current) =>
          current.map((expense) => (expense.id === editing.id ? response.expense : expense))
        );
      } else {
        const response = await createExpense(payload);
        setExpenses((current) => [response.expense, ...current]);
      }

      setModalOpen(false);
      setEditing(null);
      setForm(defaultForm());
    } catch (err: any) {
      setModalError(String(err?.message || "Enregistrement impossible."));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(expense: Expense) {
    const message = expense.isRecurring
      ? "Supprimer cette serie recurrente ?"
      : "Supprimer ce frais ?";
    if (!window.confirm(message)) return;
    try {
      await deleteExpense(expense.id);
      setExpenses((current) => current.filter((row) => row.id !== expense.id));
    } catch (err: any) {
      setExpensesError(String(err?.message || "Suppression impossible."));
    }
  }

  function moveInstagram(delta: number) {
    setInstagramFocusDate((current) =>
      instagramView === "week" ? addDays(current, delta * 7) : addMonthsToDate(current, delta)
    );
  }

  function renderInstagramItem(item: FsbInstagramItem) {
    const href = getInstagramItemHref(item);
    const content = (
      <>
        <strong>{item.title || "Clip Instagram"}</strong>
        <small>
          {getInstagramItemTime(item)} | {instagramStatusLabel(item.status)}
          {item.streamerName ? ` | ${item.streamerName}` : ""}
        </small>
      </>
    );

    if (!href) {
      return (
        <div key={item.id} className={`fsb-mini fsb-mini-${item.status || "scheduled"}`}>
          {content}
        </div>
      );
    }

    return (
      <a
        key={item.id}
        className={`fsb-mini fsb-mini-${item.status || "scheduled"}`}
        href={href}
        target={isAbsoluteUrl(href) ? "_blank" : undefined}
        rel={isAbsoluteUrl(href) ? "noreferrer" : undefined}
      >
        {content}
      </a>
    );
  }

  if (!user) {
    return (
      <main className="container">
        <div className="pageTitle">
          <h1>FSB Board</h1>
          <p className="muted">Connecte-toi pour acceder au dashboard interne.</p>
        </div>
      </main>
    );
  }

  if (!canAccess) {
    return (
      <main className="container">
        <div className="pageTitle">
          <h1>FSB Board</h1>
          <p className="muted">Acces reserve aux comptes autorises pour ce board.</p>
          <Link to="/profile" className="btnGhostInline">
            Retour au profil
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="container fsb" style={{ paddingBottom: 36 }}>
      <style>{PAGE_CSS}</style>
      <div className="pageTitle">
        <h1>FSB Board</h1>
        <div className="fsb-nav">
          {(["home", "expenses", "instagram", "agency", "tools"] as BoardSection[]).map((item) => (
            <button
              key={item}
              className={`fsb-navbtn ${section === item ? "fsb-navbtn-active" : ""}`}
              onClick={() => setSection(item)}
            >
              {SECTION_LABELS[item]}
            </button>
          ))}
        </div>
      </div>

      <section className="fsb-shell">
        {section === "home" ? (
          <>
            <section className="fsb-grid-3">
              <div className="fsb-card fsb-module">
                <div className="fsb-sectionhead">
                  <div>
                    <strong>Frais societe</strong>
                    <div className="fsb-copy">Vue mensuelle, stats rapides et CRUD interne.</div>
                  </div>
                  <span className="fsb-pill">{monthLabel(monthKeyValue)}</span>
                </div>
                <div className="fsb-stats" style={{ marginTop: 0 }}>
                  <div className="fsb-stat">
                    <small>Total</small>
                    <strong>{eur(expenseStats.total)}</strong>
                    <span>{expenseRows.length} ligne(s)</span>
                  </div>
                </div>
                <div className="fsb-actions" style={{ marginTop: "auto" }}>
                  <button className="fsb-btn fsb-btn-primary" onClick={() => setSection("expenses")}>
                    Ouvrir les frais
                  </button>
                  <button className="fsb-btn" onClick={openCreate}>
                    Nouveau frais
                  </button>
                </div>
              </div>

              <div className="fsb-card fsb-module">
                <div className="fsb-sectionhead">
                  <div>
                    <strong>Agenda Instagram</strong>
                    <div className="fsb-copy">
                      Programmations detectees depuis les publish jobs.
                    </div>
                  </div>
                  <span className="fsb-pill fsb-pill-soft">
                    {instagramView === "week" ? "Vue semaine" : "Vue mois"}
                  </span>
                </div>
                <div className="fsb-pills">
                  <span className="fsb-pill">{instagramStats.total} element(s)</span>
                  <span className="fsb-pill fsb-pill-soft">{instagramStats.scheduled} a venir</span>
                  <span className="fsb-pill">{instagramStats.published} publies</span>
                </div>
                <div className="fsb-list">
                  {upcomingInstagram.length ? (
                    upcomingInstagram.slice(0, 3).map((item) => (
                      <div key={item.id} className="fsb-listitem">
                        <div className="fsb-listmain">
                          <strong>{item.title}</strong>
                          <div className="fsb-listmeta">
                            {dayLabel(getInstagramItemDay(item))} a {getInstagramItemTime(item)}
                          </div>
                        </div>
                        <span className={`fsb-tag ${instagramStatusClass(item.status)}`}>
                          {instagramStatusLabel(item.status)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="fsb-emptyblock">Aucune programmation sur la plage chargee.</div>
                  )}
                </div>
                <div className="fsb-actions" style={{ marginTop: "auto" }}>
                  <button className="fsb-btn fsb-btn-primary" onClick={() => setSection("instagram")}>
                    Ouvrir l agenda
                  </button>
                </div>
              </div>

              <div className="fsb-card fsb-module">
                <div className="fsb-sectionhead">
                  <div>
                    <strong>Outils</strong>
                    <div className="fsb-copy">
                      Redirections rapides vers les outils internes deja en place.
                    </div>
                  </div>
                  <span className="fsb-pill">Hub</span>
                </div>
                <div className="fsb-list">
                  <div className="fsb-listitem">
                    <div className="fsb-listmain">
                      <strong>Editeur des modeles</strong>
                      <div className="fsb-listmeta">Acces direct a /editorFSN avec retour au board.</div>
                    </div>
                  </div>
                  <div className="fsb-listitem">
                    <div className="fsb-listmain">
                      <strong>Structure stats videos</strong>
                      <div className="fsb-listmeta">Place reservee pour vues, tops et historiques.</div>
                    </div>
                  </div>
                </div>
                <div className="fsb-actions" style={{ marginTop: "auto" }}>
                  <Link className="fsb-btn fsb-btn-primary" to={editorHref}>
                    Ouvrir l editeur
                  </Link>
                  <button className="fsb-btn" onClick={() => setSection("tools")}>
                    Voir les outils
                  </button>
                </div>
              </div>

              <div className="fsb-card fsb-module">
                <div className="fsb-sectionhead">
                  <div>
                    <strong>Agence</strong>
                    <div className="fsb-copy">
                      Casinos, deals, streamers subaffiliation et calculs des gains.
                    </div>
                  </div>
                  <span className="fsb-pill fsb-pill-soft">Interne</span>
                </div>
                <div className="fsb-copy">
                  Module de gestion agence avec separation du net streamer et de la marge agence.
                </div>
                <div className="fsb-actions" style={{ marginTop: "auto" }}>
                  <button className="fsb-btn fsb-btn-primary" onClick={() => setSection("agency")}>
                    Ouvrir agence
                  </button>
                </div>
              </div>
            </section>

            <section className="fsb-grid-2" style={{ marginTop: 18 }}>
              <div className="fsb-card">
                <div className="fsb-sectionhead">
                  <div>
                    <h2 className="fsb-sectiontitle">Planning proche</h2>
                    <div className="fsb-muted">{weekRangeLabel(instagramFocusDate)}</div>
                  </div>
                  <button className="fsb-btn" onClick={() => setSection("instagram")}>
                    Aller a l agenda
                  </button>
                </div>
                {instagramError ? <div className="fsb-alert">{instagramError}</div> : null}
                <div className="fsb-list">
                  {upcomingInstagram.length ? (
                    upcomingInstagram.map((item) => {
                      const href = getInstagramItemHref(item);
                      return (
                        <div key={item.id} className="fsb-listitem">
                          <div className="fsb-listmain">
                            <strong>{item.title}</strong>
                            <div className="fsb-listmeta">
                              {dayLabel(getInstagramItemDay(item))} a {getInstagramItemTime(item)}
                              {item.streamerName ? ` | ${item.streamerName}` : ""}
                            </div>
                          </div>
                          <div className="fsb-actions">
                            {href ? (
                              <a
                                className="fsb-btn"
                                href={href}
                                target={isAbsoluteUrl(href) ? "_blank" : undefined}
                                rel={isAbsoluteUrl(href) ? "noreferrer" : undefined}
                              >
                                Ouvrir
                              </a>
                            ) : null}
                            <span className={`fsb-tag ${instagramStatusClass(item.status)}`}>
                              {instagramStatusLabel(item.status)}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="fsb-emptyblock">Aucune publication programmee pour le moment.</div>
                  )}
                </div>
              </div>

              <div className="fsb-card">
                <div className="fsb-sectionhead">
                  <div>
                    <h2 className="fsb-sectiontitle">A venir</h2>
                    <div className="fsb-muted">Structure deja prete pour les prochains modules.</div>
                  </div>
                </div>
                <div className="fsb-coming">
                  <div>
                    <strong>Stats Instagram</strong>
                    Vues totales, vues par video et cadence de publication.
                  </div>
                  <div>
                    <strong>Classement des meilleures videos</strong>
                    Top clips publies avec acces direct a la video source.
                  </div>
                  <div>
                    <strong>Historique editorial</strong>
                    Suivi des clips publies, en erreur ou en attente d upload.
                  </div>
                </div>
              </div>
            </section>
          </>
        ) : null}
        {section === "expenses" ? (
          <>
            {expensesError ? <div className="fsb-alert">{expensesError}</div> : null}

            <section className="fsb-card">
              <div className="fsb-row">
                <div>
                  <h2 className="fsb-sectiontitle" style={{ textTransform: "capitalize" }}>
                    {monthLabel(monthKeyValue)}
                  </h2>
                  <div className="fsb-muted" style={{ marginTop: 6 }}>
                    Les recurrentes sont reprojetees a partir du jour du mois de la depense source.
                  </div>
                </div>
                <div className="fsb-actions">
                  <button className="fsb-icon" onClick={() => setMonthKeyValue((current) => addMonths(current, -1))}>
                    {"<"}
                  </button>
                  <button className="fsb-btn" onClick={() => setMonthKeyValue(currentMonthKey())}>
                    Ce mois-ci
                  </button>
                  <button className="fsb-icon" onClick={() => setMonthKeyValue((current) => addMonths(current, 1))}>
                    {">"}
                  </button>
                </div>
              </div>

              <div className="fsb-stats">
                <div className="fsb-stat">
                  <small>Total du mois</small>
                  <strong>{eur(expenseStats.total)}</strong>
                  <span>{expenseRows.length} ligne(s) visibles</span>
                </div>
                <div className="fsb-stat">
                  <small>Deja paye</small>
                  <strong>{eur(expenseStats.paid)}</strong>
                  <span>Statut derive des dates deja passees</span>
                </div>
                <div className="fsb-stat">
                  <small>A payer</small>
                  <strong>{eur(expenseStats.due)}</strong>
                  <span>Inclut les echeances d aujourd hui et futures</span>
                </div>
              </div>
            </section>

            <section className="fsb-card fsb-toolbar">
              <div className="fsb-row">
                <div className="fsb-actions">
                  <button className="fsb-btn" onClick={() => void reloadExpenses()}>
                    {expensesLoading ? "Actualisation..." : "Rafraichir"}
                  </button>
                  <button className="fsb-btn fsb-btn-primary" onClick={openCreate}>
                    Nouveau frais
                  </button>
                </div>
                <div className="fsb-actions">
                  <button
                    className={`fsb-btn ${sortBy === "date" ? "fsb-btn-primary" : ""}`}
                    onClick={() => setSortBy("date")}
                  >
                    Trier par date
                  </button>
                  <button
                    className={`fsb-btn ${sortBy === "amount" ? "fsb-btn-primary" : ""}`}
                    onClick={() => setSortBy("amount")}
                  >
                    Trier par montant
                  </button>
                  <button
                    className="fsb-btn"
                    onClick={() => setSortDirection((current) => (current === "asc" ? "desc" : "asc"))}
                  >
                    Sens : {sortDirection === "asc" ? "Croissant" : "Decroissant"}
                  </button>
                </div>
              </div>
            </section>

            {expenseRows.length === 0 && !expensesLoading ? (
              <section className="fsb-empty">
                <h3 style={{ margin: 0 }}>Aucun frais sur ce mois</h3>
                <p className="fsb-copy" style={{ marginTop: 10 }}>
                  Ajoute un premier frais ou change de mois pour inspecter les occurrences recurrentes.
                </p>
              </section>
            ) : (
              <section className="fsb-tablewrap">
                <table className="fsb-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Frais</th>
                      <th>Categorie</th>
                      <th>Montant</th>
                      <th>Statut</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenseRows.map((row) => (
                      <tr key={`${row.source.id}:${row.occurrenceDate}`}>
                        <td>
                          <strong>{dateLabel(row.occurrenceDate)}</strong>
                          <div className="fsb-sub">Source : {dateLabel(row.source.date)}</div>
                        </td>
                        <td>
                          <strong>{row.source.description}</strong>
                          <div className="fsb-sub">{row.source.notes || "Aucune note"}</div>
                        </td>
                        <td>
                          <div className="fsb-tags">
                            <span className="fsb-tag">{CATEGORY_LABELS[row.source.category]}</span>
                            {row.source.isRecurring ? (
                              <span className="fsb-tag fsb-tag-rec">
                                {row.isProjected ? "Recurrent projete" : "Recurrent"}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          <strong>{eur(row.source.amount)}</strong>
                        </td>
                        <td>
                          <span className={`fsb-tag ${row.status === "paid" ? "fsb-tag-paid" : "fsb-tag-due"}`}>
                            {row.status === "paid" ? "Paye" : "A payer"}
                          </span>
                        </td>
                        <td>
                          <div className="fsb-inline">
                            <button onClick={() => openEdit(row.source)}>Modifier</button>
                            <button onClick={() => void onDelete(row.source)}>Supprimer</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </>
        ) : null}
        {section === "instagram" ? (
          <>
            <section className="fsb-card">
              <div className="fsb-sectionhead">
                <div>
                  <h2 className="fsb-sectiontitle">
                    {instagramView === "week"
                      ? weekRangeLabel(instagramFocusDate)
                      : monthLabel(instagramFocusDate.slice(0, 7))}
                  </h2>
                  <div className="fsb-muted" style={{ marginTop: 6 }}>
                    Agenda interne des publications Instagram detectees via les jobs programmes.
                  </div>
                </div>
                <div className="fsb-actions">
                  <button className="fsb-btn" onClick={() => moveInstagram(-1)}>
                    Precedent
                  </button>
                  <button className="fsb-btn" onClick={() => setInstagramFocusDate(today)}>
                    Aujourd hui
                  </button>
                  <button className="fsb-btn" onClick={() => moveInstagram(1)}>
                    Suivant
                  </button>
                </div>
              </div>

              <div className="fsb-row" style={{ marginTop: 16 }}>
                <div className="fsb-actions">
                  <button
                    className={`fsb-btn ${instagramView === "week" ? "fsb-btn-primary" : ""}`}
                    onClick={() => setInstagramView("week")}
                  >
                    Vue semaine
                  </button>
                  <button
                    className={`fsb-btn ${instagramView === "month" ? "fsb-btn-primary" : ""}`}
                    onClick={() => setInstagramView("month")}
                  >
                    Vue mois
                  </button>
                </div>
                <div className="fsb-actions">
                  <button className="fsb-btn" onClick={() => void reloadInstagram()}>
                    {instagramLoading ? "Actualisation..." : "Rafraichir"}
                  </button>
                </div>
              </div>

              <div className="fsb-stats">
                <div className="fsb-stat">
                  <small>Planifies</small>
                  <strong>{instagramStats.scheduled}</strong>
                  <span>Sur la plage affichee</span>
                </div>
                <div className="fsb-stat">
                  <small>Publies</small>
                  <strong>{instagramStats.published}</strong>
                  <span>Sur la plage affichee</span>
                </div>
                <div className="fsb-stat">
                  <small>Erreurs</small>
                  <strong>{instagramStats.errors}</strong>
                  <span>Jobs a surveiller</span>
                </div>
                <div className="fsb-stat">
                  <small>A venir</small>
                  <strong>{instagramData?.summary.upcomingAllTime ?? 0}</strong>
                  <span>Toutes plages confondues</span>
                </div>
              </div>
            </section>

            {instagramError ? <div className="fsb-alert">{instagramError}</div> : null}

            {instagramView === "month" ? (
              <div className="fsb-calendar">
                {Array.from({ length: 7 }, (_, index) => (
                  <div key={index} className="fsb-calendar-head">
                    {shortDayName(index)}
                  </div>
                ))}
                {buildMonthGrid(instagramFocusDate).map((day) => {
                  const items = instagramItemsByDay[day] || [];
                  const inMonth = day.startsWith(instagramFocusDate.slice(0, 7));
                  return (
                    <div
                      key={day}
                      className={`fsb-day ${inMonth ? "" : "fsb-day-out"} ${day === today ? "fsb-day-today" : ""}`}
                    >
                      <div className="fsb-day-top">
                        <div>
                          <div className="fsb-day-title">{dayLabel(day)}</div>
                          <div className="fsb-day-sub">{items.length} element(s)</div>
                        </div>
                        <button
                          className="fsb-jump"
                          onClick={() => {
                            setInstagramFocusDate(day);
                            setInstagramView("week");
                          }}
                        >
                          Semaine
                        </button>
                      </div>
                      {items.length ? (
                        <div className="fsb-day-items">
                          {items.slice(0, 3).map((item) => renderInstagramItem(item))}
                          {items.length > 3 ? <div className="fsb-more">+{items.length - 3} autre(s)</div> : null}
                        </div>
                      ) : (
                        <div className="fsb-emptyblock">Aucune publication</div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="fsb-week">
                {Array.from({ length: 7 }, (_, index) => {
                  const day = addDays(startOfWeek(instagramFocusDate), index);
                  const items = instagramItemsByDay[day] || [];
                  return (
                    <div key={day} className={`fsb-daylist ${day === today ? "fsb-day-today" : ""}`}>
                      <div className="fsb-day-top">
                        <div>
                          <div className="fsb-day-title">{dayLabel(day)}</div>
                          <div className="fsb-day-sub">{items.length} publication(s)</div>
                        </div>
                      </div>
                      {items.length ? (
                        <div className="fsb-day-items">{items.map((item) => renderInstagramItem(item))}</div>
                      ) : (
                        <div className="fsb-emptyblock">Rien de planifie</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <section className="fsb-grid-2" style={{ marginTop: 18 }}>
              <div className="fsb-card">
                <div className="fsb-sectionhead">
                  <div>
                    <h2 className="fsb-sectiontitle">Dernieres publications</h2>
                    <div className="fsb-muted">Acces direct aux derniers clips deja publies.</div>
                  </div>
                </div>
                <div className="fsb-list">
                  {instagramData?.recentPublished?.length ? (
                    instagramData.recentPublished.map((item) => {
                      const href = item.platformUrl;
                      const title = item.title || "Clip Instagram";
                      return (
                        <div key={item.id} className="fsb-listitem">
                          <div className="fsb-thumbrow">
                            {item.thumbnailUrl ? (
                              <img className="fsb-thumb" src={item.thumbnailUrl} alt={title} />
                            ) : (
                              <div className="fsb-thumb fsb-thumb-placeholder">IG</div>
                            )}
                            <div className="fsb-listmain">
                              <strong>{title}</strong>
                              <div className="fsb-listmeta">
                                {item.finishedAt ? `Publie le ${dateLabel(item.finishedAt.slice(0, 10))}` : "Publie"}
                              </div>
                            </div>
                          </div>
                          {href ? (
                            <a
                              className="fsb-btn"
                              href={href}
                              target={isAbsoluteUrl(href) ? "_blank" : undefined}
                              rel={isAbsoluteUrl(href) ? "noreferrer" : undefined}
                            >
                              Ouvrir
                            </a>
                          ) : (
                            <span className="fsb-tag fsb-tag-done">Publie</span>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="fsb-emptyblock">Aucune publication recente a afficher.</div>
                  )}
                </div>
              </div>

              <div className="fsb-card">
                <div className="fsb-sectionhead">
                  <div>
                    <h2 className="fsb-sectiontitle">Stats de publication</h2>
                    <div className="fsb-muted">Volumes par jour et repartition par streamer sur la plage chargee.</div>
                  </div>
                </div>
                <div className="fsb-list">
                  {instagramTimeline.length ? (
                    instagramTimeline.map((point) => (
                      <div key={point.day} className="fsb-listitem">
                        <div className="fsb-listmain">
                          <strong>{dayLabel(point.day)}</strong>
                          <div className="fsb-listmeta">
                            {point.publishedCount} publie(s), {point.scheduledCount} programme(s), {point.errorCount} erreur(s)
                          </div>
                        </div>
                        <span className="fsb-tag">{point.totalCount} total</span>
                      </div>
                    ))
                  ) : (
                    <div className="fsb-emptyblock">Aucune activite sur la plage chargee.</div>
                  )}
                </div>
                <div className="fsb-list" style={{ marginTop: 18 }}>
                  {(instagramData?.topStreamers || []).length ? (
                    instagramData!.topStreamers.map((item, index) => (
                      <div key={`${item.streamerSlug || item.streamerName || "streamer"}:${index}`} className="fsb-listitem">
                        <div className="fsb-listmain">
                          <strong>{item.streamerName || "Sans streamer"}</strong>
                          <div className="fsb-listmeta">
                            {item.publishedCount} publie(s), {item.scheduledCount} programme(s), {item.errorCount} erreur(s)
                          </div>
                        </div>
                        <span className="fsb-tag">{item.totalCount} total</span>
                      </div>
                    ))
                  ) : (
                    <div className="fsb-emptyblock">Aucune repartition streamer disponible.</div>
                  )}
                </div>
              </div>
            </section>

            <section className="fsb-card">
              <div className="fsb-sectionhead">
                <div>
                  <h2 className="fsb-sectiontitle">Dernieres erreurs</h2>
                  <div className="fsb-muted">Les jobs Instagram en erreur les plus recents.</div>
                </div>
              </div>
              <div className="fsb-list">
                {instagramData?.recentErrors?.length ? (
                  instagramData.recentErrors.map((item) => {
                    const href = item.platformUrl || item.outputUrl;
                    return (
                      <div key={item.id} className="fsb-listitem">
                        <div className="fsb-listmain">
                          <strong>{item.title}</strong>
                          <div className="fsb-listmeta">
                            {item.streamerName ? `${item.streamerName} | ` : ""}
                            {item.scheduledAt ? `${dateLabel(item.scheduledAt.slice(0, 10))} | ` : ""}
                            {item.errorMessage || "Erreur non detaillee"}
                          </div>
                        </div>
                        <div className="fsb-actions">
                          {href ? (
                            <a
                              className="fsb-btn"
                              href={href}
                              target={isAbsoluteUrl(href) ? "_blank" : undefined}
                              rel={isAbsoluteUrl(href) ? "noreferrer" : undefined}
                            >
                              Ouvrir
                            </a>
                          ) : null}
                          <span className="fsb-tag fsb-tag-error">Erreur</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="fsb-emptyblock">Aucune erreur recente.</div>
                )}
              </div>
            </section>
          </>
        ) : null}
        {section === "agency" ? <FsbAgencySection /> : null}
        {section === "tools" ? (
          <section className="fsb-grid-3">
            <div className="fsb-card fsb-module">
              <div className="fsb-sectionhead">
                <div>
                  <strong>Editeur des modeles</strong>
                  <div className="fsb-copy">Acces direct a l outil /editorFSN.</div>
                </div>
                <span className="fsb-pill">Actif</span>
              </div>
              <div className="fsb-copy">
                Outil dedie a la preparation des modeles HTML avec retour direct vers le board.
              </div>
              <div className="fsb-actions" style={{ marginTop: "auto" }}>
                <Link className="fsb-btn fsb-btn-primary" to={editorHref}>
                  Ouvrir l editeur
                </Link>
              </div>
            </div>

            <div className="fsb-card fsb-module">
              <div className="fsb-sectionhead">
                <div>
                  <strong>Stats videos Instagram</strong>
                  <div className="fsb-copy">Emplacement reserve pour les metrics de publication.</div>
                </div>
                <span className="fsb-pill fsb-pill-warn">Bientot</span>
              </div>
              <div className="fsb-coming">
                <div>
                  <strong>Nombre de videos publiees</strong>
                  Volume par semaine, mois et total.
                </div>
                <div>
                  <strong>Classement des tops clips</strong>
                  Les meilleures videos avec acces direct.
                </div>
              </div>
            </div>

            <div className="fsb-card fsb-module">
              <div className="fsb-sectionhead">
                <div>
                  <strong>Autres modules internes</strong>
                  <div className="fsb-copy">Place reservee pour les prochains outils du board.</div>
                </div>
                <span className="fsb-pill fsb-pill-soft">Structure prete</span>
              </div>
              <div className="fsb-coming">
                <div>
                  <strong>Agenda editorial complet</strong>
                  Reels, clips et suivis multi-plateformes.
                </div>
                <div>
                  <strong>Suivi automation</strong>
                  Etat des jobs, erreurs et prochaines publications.
                </div>
                <div>
                  <strong>Vue performance</strong>
                  Stats par video, tops et historiques.
                </div>
              </div>
            </div>
          </section>
        ) : null}
      </section>

      {modalOpen ? (
        <ExpenseModal
          editing={editing}
          form={form}
          saving={saving}
          error={modalError}
          onClose={() => !saving && setModalOpen(false)}
          onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
          onSubmit={onSave}
        />
      ) : null}
    </main>
  );
}
