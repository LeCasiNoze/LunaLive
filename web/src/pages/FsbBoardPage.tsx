import * as React from "react";
import { Link } from "react-router-dom";
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

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  giveaway: "Giveaway",
  offres: "Offres",
  parrainage: "Parrainage",
  abonnement: "Abonnement",
  personnalise: "Personnalise",
};

type SortBy = "date" | "amount";
type SortDirection = "asc" | "desc";

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

const FSB_ALLOWED_USER_IDS = new Set([4, 15, 71]);

const PAGE_CSS = `
.fsb{--bg:#0e1526;--panel:#121b31;--soft:#16213c;--bd:rgba(255,255,255,.08);--text:#eef4ff;--muted:rgba(210,223,245,.72);--accent:#ffb26b;color:var(--text)}
.fsb-shell{border:1px solid var(--bd);border-radius:24px;background:radial-gradient(circle at top left,rgba(255,178,107,.16),transparent 30%),radial-gradient(circle at top right,rgba(113,213,210,.14),transparent 26%),var(--bg);box-shadow:0 28px 80px rgba(0,0,0,.38);padding:20px}
.fsb-hero,.fsb-card,.fsb-empty,.fsb-modal{border:1px solid var(--bd);border-radius:20px;background:var(--panel);box-shadow:0 18px 44px rgba(0,0,0,.22)}
.fsb-hero,.fsb-card,.fsb-empty,.fsb-modal{padding:18px}
.fsb-title{margin:0;font-size:34px;line-height:.95;font-weight:800;letter-spacing:-.04em}
.fsb-title span{display:block;margin-top:8px;background:linear-gradient(105deg,#ffe2c5,#ffb26b 45%,#71d5d2);-webkit-background-clip:text;background-clip:text;color:transparent}
.fsb-copy,.fsb-muted{color:var(--muted);line-height:1.6}
.fsb-row{display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between}
.fsb-actions{display:flex;gap:10px;flex-wrap:wrap}
.fsb-btn,.fsb-icon,.fsb-tag,.fsb-table button{border-radius:12px;border:1px solid var(--bd);font:inherit}
.fsb-btn,.fsb-icon,.fsb-table button{cursor:pointer;transition:transform .14s ease,filter .14s ease;background:rgba(255,255,255,.04);color:var(--text)}
.fsb-btn:hover,.fsb-icon:hover,.fsb-table button:hover{transform:translateY(-1px);filter:brightness(1.05)}
.fsb-btn{padding:11px 14px;font-weight:700}
.fsb-btn-primary{background:linear-gradient(135deg,rgba(255,178,107,.24),rgba(255,141,141,.14));border-color:rgba(255,178,107,.26)}
.fsb-icon{width:44px;height:44px;display:grid;place-items:center}
.fsb-tags,.fsb-inline{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.fsb-tag{display:inline-flex;align-items:center;padding:7px 10px;background:rgba(255,255,255,.04);font-size:12px;font-weight:700}
.fsb-tag-paid{background:rgba(120,231,180,.12)}
.fsb-tag-due{background:rgba(255,178,107,.12)}
.fsb-tag-rec{background:rgba(113,213,210,.12)}
.fsb-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:18px}
.fsb-stat{border:1px solid var(--bd);border-radius:18px;background:var(--soft);padding:16px}
.fsb-stat small{display:block;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;font-size:11px;font-weight:800}
.fsb-stat strong{display:block;margin-top:10px;font-size:30px;letter-spacing:-.04em}
.fsb-stat span{display:block;margin-top:8px;color:var(--muted);font-size:13px}
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
@media (max-width:860px){.fsb-stats{grid-template-columns:1fr}.fsb-grid{grid-template-columns:1fr}}
@media (max-width:740px){.fsb-tablewrap{overflow:auto}.fsb-table{min-width:760px}}
`;

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

function eur(value: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function makeVisible(expense: Expense, monthKey: string, today: string): VisibleExpense | null {
  if (!expense.isRecurring) {
    if (!expense.date.startsWith(monthKey)) return null;
    return {
      source: expense,
      occurrenceDate: expense.date,
      isProjected: false,
      status: expense.date < today ? "paid" : "due",
    };
  }

  if (monthKey < expense.date.slice(0, 7)) return null;

  const [year, month] = monthKey.split("-").map(Number);
  const anchorDay = Number(expense.date.slice(8, 10));
  const occurrenceDay = Math.min(anchorDay, daysInMonth(year, month));
  const occurrenceDate = `${monthKey}-${String(occurrenceDay).padStart(2, "0")}`;

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

function Modal({
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
  const canAccess = !!user && FSB_ALLOWED_USER_IDS.has(Number(user.id || 0));
  const [expenses, setExpenses] = React.useState<Expense[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [monthKey, setMonthKey] = React.useState(currentMonthKey);
  const [sortBy, setSortBy] = React.useState<SortBy>("date");
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("asc");
  const [modalOpen, setModalOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [modalError, setModalError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<Expense | null>(null);
  const [form, setForm] = React.useState<FormState>(defaultForm);

  React.useEffect(() => {
    document.title = "FSB Board | LunaLive";
  }, []);

  const reload = React.useCallback(async () => {
    if (!token || !canAccess) return;
    setLoading(true);
    setError(null);
    try {
      const response = await listExpenses();
      setExpenses(response.expenses);
    } catch (err: any) {
      setError(String(err?.message || "Chargement impossible."));
    } finally {
      setLoading(false);
    }
  }, [canAccess, token]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const today = React.useMemo(() => todayKey(), []);

  const rows = React.useMemo(() => {
    const visible = expenses
      .map((expense) => makeVisible(expense, monthKey, today))
      .filter(Boolean) as VisibleExpense[];

    return visible.sort((a, b) => {
      if (sortBy === "amount") {
        const delta = a.source.amount - b.source.amount;
        return sortDirection === "asc" ? delta : -delta;
      }
      const delta = a.occurrenceDate.localeCompare(b.occurrenceDate);
      return sortDirection === "asc" ? delta : -delta;
    });
  }, [expenses, monthKey, sortBy, sortDirection, today]);

  const stats = React.useMemo(
    () =>
      rows.reduce(
        (acc, row) => {
          acc.total += row.source.amount;
          if (row.status === "paid") acc.paid += row.source.amount;
          else acc.due += row.source.amount;
          return acc;
        },
        { total: 0, paid: 0, due: 0 }
      ),
    [rows]
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
      setError(String(err?.message || "Suppression impossible."));
    }
  }

  if (!user) {
    return (
      <main className="container">
        <div className="pageTitle">
          <h1>FSB Board</h1>
          <p className="muted">Connecte-toi pour acceder au module Frais Societe.</p>
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
      </div>

      <section className="fsb-shell">
        {error ? <div className="fsb-alert">{error}</div> : null}

        <section className="fsb-card">
          <div className="fsb-row">
            <div>
              <h3 style={{ margin: 0, textTransform: "capitalize" }}>{monthLabel(monthKey)}</h3>
              <div className="fsb-muted" style={{ marginTop: 6 }}>
                Les frais recurrents sont reprojetes a partir du jour du mois de la depense source.
              </div>
            </div>
            <div className="fsb-actions">
              <button className="fsb-icon" onClick={() => setMonthKey((current) => addMonths(current, -1))}>
                ‹
              </button>
              <button className="fsb-btn" onClick={() => setMonthKey(currentMonthKey())}>
                Ce mois-ci
              </button>
              <button className="fsb-icon" onClick={() => setMonthKey((current) => addMonths(current, 1))}>
                ›
              </button>
            </div>
          </div>

          <div className="fsb-stats">
            <div className="fsb-stat">
              <small>Total du mois</small>
              <strong>{eur(stats.total)}</strong>
              <span>{rows.length} ligne(s) visibles</span>
            </div>
            <div className="fsb-stat">
              <small>Deja paye</small>
              <strong>{eur(stats.paid)}</strong>
              <span>Statut derive des dates deja passees</span>
            </div>
            <div className="fsb-stat">
              <small>A payer</small>
              <strong>{eur(stats.due)}</strong>
              <span>Inclut les echeances d'aujourd'hui et futures</span>
            </div>
          </div>
        </section>

        <section className="fsb-card fsb-toolbar">
          <div className="fsb-row">
            <div className="fsb-actions">
              <button className="fsb-btn" onClick={() => void reload()}>
                {loading ? "Actualisation..." : "Rafraichir"}
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

        {rows.length === 0 && !loading ? (
          <section className="fsb-empty" style={{ marginTop: 18 }}>
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
                {rows.map((row) => (
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
      </section>

      {modalOpen ? (
        <Modal
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
