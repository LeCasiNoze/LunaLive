import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { login } from "../lib/api";
import { getFsbAgencyStreamerPreview, getMyAgencyStats } from "../lib/api_agency";
import { canAccessFsbBoard } from "../lib/fsb_access";

type AgencyData = Awaited<ReturnType<typeof getMyAgencyStats>>["agency"];
type Assignment = NonNullable<AgencyData>["assignments"][number];

// ─── Date helpers ──────────────────────────────────────────────────────────────

function currentParisDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function currentMonthKey() {
  return currentParisDateKey().slice(0, 7);
}

/** Return the Monday of the ISO week containing dateKey (YYYY-MM-DD). */
function getWeekMonday(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  const dow = d.getUTCDay(); // 0=Sun, 1=Mon, …6=Sat
  const diffToMonday = (dow === 0 ? -6 : 1 - dow);
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function addDays(dateKey: string, n: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + n));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function dateKeyToMonthKey(dateKey: string): string {
  return dateKey.slice(0, 7);
}

function addMonths(monthKey: string, delta: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", month: "long", year: "numeric" })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

function shortDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "numeric", month: "short" })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

function eur(value: number | null | undefined) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(value || 0));
}

function num(value: number | null | undefined) {
  if (value == null) return "-";
  return Number(value).toLocaleString("fr-FR");
}

function dateOnly(value: string | null | undefined) {
  if (!value) return "-";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

function dateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }).format(date);
}

function parseLinks(text: string | null | undefined) {
  return String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/https?:\/\/\S+/i);
      if (!match) return { label: line, url: null as string | null };
      const url = match[0];
      const label = line.replace(url, "").replace(/[:\-]\s*$/, "").trim() || url;
      return { label, url };
    });
}

/** Is the assignment active during [weekStart, weekEnd] ? */
function isActiveInWeek(a: Assignment, weekStart: string, weekEnd: string): boolean {
  const start = a.startDate ?? "0000-01-01";
  const end = a.endDate ?? "9999-12-31";
  return start <= weekEnd && end >= weekStart;
}

// ─── Global aggregation ────────────────────────────────────────────────────────

type GlobalSummary = {
  signups: number; depositCount: number; ftdCount: number; totalDeposits: number;
  cpa: number; rs: number; total: number;
  agencyCpa: number; agencyRs: number; agencyTotal: number; grossTotal: number;
  visibleCpa: number; visibleRs: number; visibleTotal: number;
  monthCount: number;
};

function aggregateGlobal(list: NonNullable<AgencyData>[]): GlobalSummary {
  const acc: GlobalSummary = {
    signups: 0, depositCount: 0, ftdCount: 0, totalDeposits: 0,
    cpa: 0, rs: 0, total: 0,
    agencyCpa: 0, agencyRs: 0, agencyTotal: 0, grossTotal: 0,
    visibleCpa: 0, visibleRs: 0, visibleTotal: 0,
    monthCount: list.length,
  };
  for (const d of list) {
    if (!d?.summary) continue;
    const s = d.summary;
    acc.signups += Number(s.signups || 0);
    acc.depositCount += Number(s.depositCount || 0);
    acc.ftdCount += Number(s.ftdCount || 0);
    acc.totalDeposits += Number(s.totalDeposits || 0);
    acc.cpa += Number(s.cpa || 0);
    acc.rs += Number(s.rs || 0);
    acc.total += Number(s.total || 0);
    acc.agencyCpa += Number(s.agencyCpa || 0);
    acc.agencyRs += Number(s.agencyRs || 0);
    acc.agencyTotal += Number(s.agencyTotal || 0);
    acc.grossTotal += Number(s.grossTotal || 0);
    acc.visibleCpa += Number(s.visibleCpa || 0);
    acc.visibleRs += Number(s.visibleRs || 0);
    acc.visibleTotal += Number(s.visibleTotal || 0);
  }
  return acc;
}

// ─── CSS ───────────────────────────────────────────────────────────────────────

const PAGE_CSS = `
.ap{--bg:#081120;--panel:rgba(10,18,34,.94);--soft:rgba(255,255,255,.03);--line:rgba(255,255,255,.08);--text:#eef5ff;--muted:rgba(214,225,242,.68);--accent:rgba(255,178,107,1);min-height:100vh;background:radial-gradient(circle at top left,rgba(255,178,107,.12),transparent 26%),radial-gradient(circle at top right,rgba(113,213,210,.10),transparent 22%),linear-gradient(180deg,#07101d,#091426 55%,#0b1627);color:var(--text);font-family:inherit}
.ap-wrap{width:min(1080px,calc(100% - 24px));margin:0 auto;padding:24px 0 48px}
.ap-shell{border:1px solid var(--line);border-radius:24px;background:var(--panel);box-shadow:0 28px 80px rgba(0,0,0,.4);backdrop-filter:blur(18px);padding:24px}
.ap-head{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start;justify-content:space-between}
.ap-title{margin:0;font-size:28px;letter-spacing:-.04em}
.ap-subtitle{margin:6px 0 0;color:var(--muted);line-height:1.5;font-size:14px}
.ap-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.ap-btn{border-radius:12px;border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--text);padding:10px 14px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;transition:filter .12s}
.ap-btn:hover{filter:brightness(1.08)}
.ap-btn-primary{background:linear-gradient(135deg,rgba(255,178,107,.22),rgba(255,141,141,.12));border-color:rgba(255,178,107,.28)}
.ap-btn-active{background:rgba(113,213,210,.12);border-color:rgba(113,213,210,.22);color:#7dd8d8}
.ap-tabs{display:flex;gap:4px;margin-top:20px;border-bottom:1px solid var(--line);padding-bottom:0}
.ap-tab{padding:10px 18px;border-radius:10px 10px 0 0;border:1px solid transparent;border-bottom:none;background:transparent;color:var(--muted);font:inherit;font-size:14px;font-weight:700;cursor:pointer;transition:color .12s}
.ap-tab:hover{color:var(--text)}
.ap-tab-active{background:rgba(255,255,255,.04);border-color:var(--line);border-bottom-color:var(--panel);color:var(--text);margin-bottom:-1px}
.ap-tab-content{padding-top:22px}
.ap-period{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:18px}
.ap-period-label{font-weight:800;font-size:15px}
.ap-period-sub{font-size:12px;color:var(--muted);margin-left:4px}
.ap-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.ap-stat{border:1px solid var(--line);border-radius:18px;background:var(--soft);padding:16px}
.ap-stat small{display:block;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;font-size:10px;font-weight:800;margin-bottom:10px}
.ap-stat strong{display:block;font-size:26px;letter-spacing:-.04em}
.ap-stat span{display:block;margin-top:6px;color:var(--muted);font-size:12px}
.ap-stat-accent strong{color:var(--accent)}
.ap-note{margin-top:14px;padding:14px 16px;border-radius:16px;background:rgba(113,213,210,.07);border:1px solid rgba(113,213,210,.14);color:var(--muted);line-height:1.6;font-size:14px}
.ap-banner{margin-bottom:16px;padding:11px 14px;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid var(--line);color:var(--muted);font-size:13px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.ap-list{display:grid;gap:12px;margin-top:20px}
.ap-card{border:1px solid var(--line);border-radius:18px;background:rgba(255,255,255,.025);padding:16px}
.ap-card-week{border-color:rgba(113,213,210,.18)}
.ap-cardhead{display:flex;gap:10px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap}
.ap-card h3{margin:0;font-size:18px;letter-spacing:-.02em}
.ap-cardmeta{margin:5px 0 0;color:var(--muted);font-size:13px;line-height:1.5}
.ap-pill{display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;border:1px solid var(--line);background:rgba(255,255,255,.04);font-size:11px;font-weight:800;letter-spacing:.02em}
.ap-pill-ok{background:rgba(120,231,180,.10);border-color:rgba(120,231,180,.18);color:#8cf5c8}
.ap-pill-off{background:rgba(255,178,107,.08);border-color:rgba(255,178,107,.16);color:#ffc46a}
.ap-subgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-top:12px}
.ap-substat{border:1px solid rgba(255,255,255,.05);border-radius:12px;background:rgba(255,255,255,.025);padding:10px 12px}
.ap-substat small{display:block;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.07em;font-weight:800;margin-bottom:6px}
.ap-substat strong{font-size:17px}
.ap-links{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.ap-linkbtn{border-radius:10px;border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--text);padding:8px 12px;font:inherit;font-size:12px;font-weight:700;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}
.ap-auth{width:min(420px,100%);margin:8vh auto 0}
.ap-field{display:grid;gap:8px;margin-top:14px}
.ap-field label{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:800}
.ap-input{width:100%;box-sizing:border-box;border-radius:12px;border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--text);font:inherit;padding:11px 13px}
.ap-alert{margin-top:14px;padding:12px 14px;border-radius:14px;border:1px solid rgba(255,141,141,.2);background:rgba(255,141,141,.07);color:#ffd5d5;font-size:14px}
.ap-empty{padding:28px;text-align:center;color:var(--muted);font-size:14px}
.ap-loading{padding:28px;text-align:center;color:var(--muted);font-size:14px}
.ap-section-label{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:20px 0 10px}
@media(max-width:680px){.ap-wrap{width:calc(100% - 16px)}.ap-shell{padding:16px}.ap-title{font-size:22px}}
`;

// ─── Component ─────────────────────────────────────────────────────────────────

export default function AgencyPortalPage() {
  const [searchParams] = useSearchParams();
  const { user, setAuth, logout } = useAuth();

  const [tab, setTab] = React.useState<"week" | "month" | "global">("week");

  // Month view state
  const [monthKey, setMonthKey] = React.useState(currentMonthKey);

  // Week view state — Monday of the current week
  const [weekStart, setWeekStart] = React.useState(() => getWeekMonday(currentParisDateKey()));
  const weekEnd = addDays(weekStart, 6); // Sunday
  // The month we load for the week: month of Thursday (ISO week's anchor)
  const weekMonthKey = dateKeyToMonthKey(addDays(weekStart, 3));

  const [loading, setLoading] = React.useState(false);
  const [globalLoading, setGlobalLoading] = React.useState(false);
  const [loginBusy, setLoginBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const previewId = React.useMemo(() => {
    const raw = Number(searchParams.get("preview") || 0);
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }, [searchParams]);
  const prefilledUsername = React.useMemo(() => searchParams.get("username") || "", [searchParams]);
  const canPreview = Boolean(previewId && canAccessFsbBoard(user));

  const [username, setUsername] = React.useState(prefilledUsername);
  const [password, setPassword] = React.useState("");
  const [agency, setAgency] = React.useState<AgencyData | null>(null);
  const [allMonthsData, setAllMonthsData] = React.useState<NonNullable<AgencyData>[]>([]);
  const [globalLoaded, setGlobalLoaded] = React.useState(false);

  React.useEffect(() => { setUsername(prefilledUsername); }, [prefilledUsername]);

  // Which month key to actually load (driven by active tab)
  const activeMonthKey = tab === "week" ? weekMonthKey : monthKey;

  const assignments = agency?.assignments ?? [];
  const historyMonths = agency?.historyMonths ?? [];

  // Weekly: filter assignments active during the week
  const weekAssignments = React.useMemo(
    () => assignments.filter((a) => isActiveInWeek(a, weekStart, weekEnd)),
    [assignments, weekStart, weekEnd]
  );

  // Monthly: active deals or fallback to all
  const relevantAssignments = React.useMemo(() => {
    const active = assignments.filter((a) => a.activeDuringMonth);
    return active.length ? active : assignments;
  }, [assignments]);

  const cpaVisible = assignments.some((a) => a.stats.showCpaToStreamer);
  const rsVisible = assignments.some((a) => a.stats.showRsToStreamer);
  const globalSummary = React.useMemo(() => aggregateGlobal(allMonthsData), [allMonthsData]);
  const globalCpaVisible = allMonthsData.some((d) => d.assignments.some((a) => a.stats.showCpaToStreamer));
  const globalRsVisible = allMonthsData.some((d) => d.assignments.some((a) => a.stats.showRsToStreamer));

  const loadMonth = React.useCallback(async (mk: string) => {
    if (!user && !canPreview) return;
    setLoading(true);
    setError(null);
    try {
      const response = canPreview && previewId
        ? await getFsbAgencyStreamerPreview(previewId, mk)
        : await getMyAgencyStats(mk);
      setAgency(response.agency);
    } catch (err: any) {
      setError(String(err?.message || "Impossible de charger les stats."));
    } finally {
      setLoading(false);
    }
  }, [canPreview, previewId, user]);

  const loadGlobal = React.useCallback(async (months: string[]) => {
    if (!user && !canPreview) return;
    if (!months.length) return;
    setGlobalLoading(true);
    setError(null);
    try {
      const results = await Promise.all(
        months.map((mk) =>
          canPreview && previewId
            ? getFsbAgencyStreamerPreview(previewId, mk)
            : getMyAgencyStats(mk)
        )
      );
      setAllMonthsData(results.map((r) => r.agency).filter(Boolean) as NonNullable<AgencyData>[]);
      setGlobalLoaded(true);
    } catch (err: any) {
      setError(String(err?.message || "Impossible de charger les stats globales."));
    } finally {
      setGlobalLoading(false);
    }
  }, [canPreview, previewId, user]);

  // Load month data when activeMonthKey changes
  React.useEffect(() => {
    if (!user && !canPreview) { setAgency(null); return; }
    void loadMonth(activeMonthKey);
  }, [canPreview, loadMonth, activeMonthKey, user]);

  // Load global when switching to global tab
  React.useEffect(() => {
    if (tab === "global" && !globalLoaded && historyMonths.length > 0) {
      void loadGlobal(historyMonths);
    }
  }, [tab, globalLoaded, historyMonths, loadGlobal]);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginBusy(true);
    setError(null);
    try {
      const response = await login(username.trim(), password);
      setAuth(response.token, response.user);
      setPassword("");
    } catch (err: any) {
      setError(String(err?.message || "Connexion impossible."));
    } finally {
      setLoginBusy(false);
    }
  }

  // ─── Login screen ───────────────────────────────────────────────────────────

  if (!user && !canPreview) {
    return (
      <main className="ap">
        <style>{PAGE_CSS}</style>
        <div className="ap-wrap">
          <section className="ap-shell ap-auth">
            <h1 className="ap-title">Portail Affilie</h1>
            <p className="ap-subtitle">Entre ton identifiant et le code d acces transmis par l agence.</p>
            {error ? <div className="ap-alert">{error}</div> : null}
            <form onSubmit={handleLogin}>
              <div className="ap-field">
                <label>Identifiant</label>
                <input className="ap-input" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
              </div>
              <div className="ap-field">
                <label>Code d acces</label>
                <input className="ap-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
                <Link className="ap-btn" to="/">Retour</Link>
                <button className="ap-btn ap-btn-primary" type="submit" disabled={loginBusy}>
                  {loginBusy ? "Connexion..." : "Acceder"}
                </button>
              </div>
            </form>
          </section>
        </div>
      </main>
    );
  }

  // ─── Main portal ────────────────────────────────────────────────────────────

  return (
    <main className="ap">
      <style>{PAGE_CSS}</style>
      <div className="ap-wrap">
        <section className="ap-shell">

          {/* Header */}
          <div className="ap-head">
            <div>
              <h1 className="ap-title">{agency?.streamer?.displayName || "Portail Affilie"}</h1>
              <p className="ap-subtitle">
                {canPreview ? "Preview admin · " : ""}
                {agency ? "Tableau de bord affiliation" : "Aucune donnee liee a ce compte."}
              </p>
            </div>
            <div className="ap-actions">
              <button className="ap-btn" onClick={() => void loadMonth(activeMonthKey)} disabled={loading}>
                {loading ? "..." : "Rafraichir"}
              </button>
              {canPreview
                ? <Link className="ap-btn" to="/FSB_Board">Retour board</Link>
                : <button className="ap-btn" onClick={logout}>Deconnexion</button>}
            </div>
          </div>

          {error ? <div className="ap-alert" style={{ marginTop: 14 }}>{error}</div> : null}

          {agency ? (
            <>
              {/* Tabs */}
              <div className="ap-tabs">
                <button className={`ap-tab ${tab === "week" ? "ap-tab-active" : ""}`} onClick={() => setTab("week")}>
                  Semaine
                </button>
                <button className={`ap-tab ${tab === "month" ? "ap-tab-active" : ""}`} onClick={() => setTab("month")}>
                  Mois
                </button>
                <button className={`ap-tab ${tab === "global" ? "ap-tab-active" : ""}`} onClick={() => setTab("global")}>
                  Global {historyMonths.length > 0 ? `(${historyMonths.length})` : ""}
                </button>
              </div>

              {/* ── WEEKLY VIEW ────────────────────────────────────────────── */}
              {tab === "week" && (
                <div className="ap-tab-content">
                  {/* Week navigator */}
                  <div className="ap-period">
                    <button className="ap-btn" onClick={() => setWeekStart((ws) => addDays(ws, -7))}>{"<"}</button>
                    <span>
                      <span className="ap-period-label">
                        Lun {shortDate(weekStart)} → Dim {shortDate(weekEnd)}
                      </span>
                      <span className="ap-period-sub">{monthLabel(weekMonthKey)}</span>
                    </span>
                    <button className="ap-btn" onClick={() => setWeekStart((ws) => addDays(ws, 7))}>{">"}</button>
                    <button
                      className="ap-btn ap-btn-active"
                      onClick={() => setWeekStart(getWeekMonday(currentParisDateKey()))}
                    >
                      Cette semaine
                    </button>
                  </div>

                  {loading ? (
                    <div className="ap-loading">Chargement...</div>
                  ) : (
                    <>
                      <div className="ap-banner">
                        Les chiffres ci-dessous correspondent au mois entier de {monthLabel(weekMonthKey)}.
                        Les stats hebdomadaires granulaires ne sont pas encore disponibles.
                      </div>

                      {/* Weekly summary (monthly data) */}
                      {weekAssignments.length > 0 && (
                        <>
                          <div className="ap-section-label">Deals actifs cette semaine</div>
                          <div className="ap-list" style={{ marginTop: 0 }}>
                            {weekAssignments.map((assignment) => (
                              <WeekAssignmentCard
                                key={assignment.id}
                                assignment={assignment}
                                canPreview={canPreview}
                                weekStart={weekStart}
                                weekEnd={weekEnd}
                              />
                            ))}
                          </div>
                        </>
                      )}

                      {weekAssignments.length === 0 && (
                        <div className="ap-empty">Aucun deal actif cette semaine.</div>
                      )}

                      {/* Monthly totals for context */}
                      {weekAssignments.length > 0 && (
                        <>
                          <div className="ap-section-label">Totaux du mois ({monthLabel(weekMonthKey)})</div>
                          <div className="ap-grid">
                            <MonthStatCard label="Inscrits" value={num(agency.summary.signups)} sub={monthLabel(weekMonthKey)} />
                            <MonthStatCard label="FTD" value={num(agency.summary.ftdCount)} sub="Premiers depots" />
                            <MonthStatCard label="Nb depots" value={num(agency.summary.depositCount)} sub="Total" />
                            <MonthStatCard label="Volume" value={eur(agency.summary.totalDeposits)} sub="Cumul mois" />
                            {(canPreview || cpaVisible) && (
                              <MonthStatCard label="CPA" value={eur(canPreview ? agency.summary.cpa : agency.summary.visibleCpa)} sub="Net affilie" />
                            )}
                            {(canPreview || rsVisible) && (
                              <MonthStatCard label="RS" value={eur(canPreview ? agency.summary.rs : agency.summary.visibleRs)} sub="Revenue share" />
                            )}
                            <MonthStatCard label={canPreview ? "A payer" : "Total"} accent value={eur(canPreview ? agency.summary.total : agency.summary.visibleTotal)} sub={`Maj ${dateTime(agency.updatedAt)}`} />
                          </div>
                        </>
                      )}

                      {agency.streamer.publicNote && (
                        <div className="ap-note" style={{ marginTop: 18 }}>{agency.streamer.publicNote}</div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ── MONTHLY VIEW ───────────────────────────────────────────── */}
              {tab === "month" && (
                <div className="ap-tab-content">
                  <div className="ap-period">
                    <button className="ap-btn" onClick={() => setMonthKey((mk) => addMonths(mk, -1))}>{"<"}</button>
                    <span className="ap-period-label">{monthLabel(monthKey)}</span>
                    <button className="ap-btn" onClick={() => setMonthKey((mk) => addMonths(mk, 1))}>{">"}</button>
                    <button className="ap-btn ap-btn-active" onClick={() => setMonthKey(currentMonthKey())}>Ce mois</button>
                  </div>

                  {historyMonths.length > 1 && (
                    <div className="ap-actions" style={{ marginBottom: 18 }}>
                      {historyMonths.slice(0, 8).map((mk) => (
                        <button key={mk} className={`ap-btn ${mk === monthKey ? "ap-btn-primary" : ""}`} onClick={() => setMonthKey(mk)}>
                          {monthLabel(mk)}
                        </button>
                      ))}
                    </div>
                  )}

                  {loading ? (
                    <div className="ap-loading">Chargement...</div>
                  ) : (
                    <>
                      <div className="ap-grid">
                        <MonthStatCard label="Inscrits" value={num(agency.summary.signups)} sub={monthLabel(monthKey)} />
                        <MonthStatCard label="FTD" value={num(agency.summary.ftdCount)} sub="Premiers depots" />
                        <MonthStatCard label="Nb depots" value={num(agency.summary.depositCount)} sub="Transactions" />
                        <MonthStatCard label="Volume depots" value={eur(agency.summary.totalDeposits)} sub="Declare" />
                        {(canPreview || cpaVisible) && (
                          <MonthStatCard label="CPA" value={eur(canPreview ? agency.summary.cpa : agency.summary.visibleCpa)} sub="Net affilie" />
                        )}
                        {(canPreview || rsVisible) && (
                          <MonthStatCard label="Revenue Share" value={eur(canPreview ? agency.summary.rs : agency.summary.visibleRs)} sub="Part RS" />
                        )}
                        <MonthStatCard label={canPreview ? "A payer" : "Total"} accent value={eur(canPreview ? agency.summary.total : agency.summary.visibleTotal)} sub={`Maj ${dateTime(agency.updatedAt)}`} />
                        {canPreview && (
                          <>
                            <MonthStatCard label="Marge agence" value={eur(agency.summary.agencyTotal)} sub="Part agence" />
                            <MonthStatCard label="Total genere" value={eur(agency.summary.grossTotal)} sub="Gross casino" />
                          </>
                        )}
                      </div>

                      {agency.streamer.publicNote && (
                        <div className="ap-note">{agency.streamer.publicNote}</div>
                      )}

                      <div className="ap-list">
                        {relevantAssignments.map((a) => (
                          <AssignmentCard key={a.id} assignment={a} canPreview={canPreview} />
                        ))}
                        {relevantAssignments.length === 0 && (
                          <div className="ap-empty">Aucun deal actif sur ce mois.</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── GLOBAL VIEW ────────────────────────────────────────────── */}
              {tab === "global" && (
                <div className="ap-tab-content">
                  {globalLoading ? (
                    <div className="ap-loading">Agregation de {historyMonths.length} mois...</div>
                  ) : !globalLoaded ? (
                    <div className="ap-empty">
                      <button className="ap-btn ap-btn-primary" onClick={() => void loadGlobal(historyMonths)}>
                        Charger les stats globales
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="ap-banner">
                        {globalSummary.monthCount} mois analyses
                        {historyMonths.length > 0
                          ? ` · ${monthLabel(historyMonths[historyMonths.length - 1])} → ${monthLabel(historyMonths[0])}`
                          : ""}
                        <button className="ap-btn" style={{ marginLeft: "auto" }} onClick={() => { setGlobalLoaded(false); void loadGlobal(historyMonths); }}>
                          Actualiser
                        </button>
                      </div>

                      <div className="ap-grid">
                        <MonthStatCard label="Inscrits total" value={num(globalSummary.signups)} sub={`${globalSummary.monthCount} mois`} />
                        <MonthStatCard label="FTD total" value={num(globalSummary.ftdCount)} sub="Tous mois" />
                        <MonthStatCard label="Nb depots total" value={num(globalSummary.depositCount)} sub="Toutes periodes" />
                        <MonthStatCard label="Volume total" value={eur(globalSummary.totalDeposits)} sub="Tous mois" />
                        {(canPreview || globalCpaVisible) && (
                          <MonthStatCard label="CPA cumulee" value={eur(canPreview ? globalSummary.cpa : globalSummary.visibleCpa)} sub="Net affilie" />
                        )}
                        {(canPreview || globalRsVisible) && (
                          <MonthStatCard label="RS cumulee" value={eur(canPreview ? globalSummary.rs : globalSummary.visibleRs)} sub="Revenue share" />
                        )}
                        <MonthStatCard label="Gains cumules" accent value={eur(canPreview ? globalSummary.total : globalSummary.visibleTotal)} sub="Tous mois" />
                        {canPreview && (
                          <>
                            <MonthStatCard label="Marge agence" value={eur(globalSummary.agencyTotal)} sub="Total" />
                            <MonthStatCard label="Gross total" value={eur(globalSummary.grossTotal)} sub="Casino" />
                          </>
                        )}
                      </div>

                      {/* Per-month breakdown */}
                      <div className="ap-section-label" style={{ marginTop: 24 }}>Detail par mois</div>
                      <div className="ap-list" style={{ marginTop: 0 }}>
                        {allMonthsData.map((d, i) => {
                          const mk = historyMonths[i];
                          if (!d) return null;
                          const cpaV = d.assignments.some((a) => a.stats.showCpaToStreamer);
                          const rsV = d.assignments.some((a) => a.stats.showRsToStreamer);
                          return (
                            <div key={mk} className="ap-card">
                              <div className="ap-cardhead">
                                <div>
                                  <div style={{ fontWeight: 700, fontSize: 15 }}>{monthLabel(mk)}</div>
                                  <div className="ap-cardmeta">
                                    {num(d.summary.signups)} inscrits · {num(d.summary.ftdCount)} FTD
                                  </div>
                                </div>
                                <div style={{ fontWeight: 800, fontSize: 18, color: "var(--accent)" }}>
                                  {eur(canPreview ? d.summary.total : d.summary.visibleTotal)}
                                </div>
                              </div>
                              {(canPreview || cpaV || rsV) && (
                                <div className="ap-subgrid">
                                  {(canPreview || cpaV) && (
                                    <div className="ap-substat"><small>CPA</small><strong>{eur(canPreview ? d.summary.cpa : d.summary.visibleCpa)}</strong></div>
                                  )}
                                  {(canPreview || rsV) && (
                                    <div className="ap-substat"><small>RS</small><strong>{eur(canPreview ? d.summary.rs : d.summary.visibleRs)}</strong></div>
                                  )}
                                  {canPreview && (
                                    <div className="ap-substat"><small>Marge agence</small><strong>{eur(d.summary.agencyTotal)}</strong></div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="ap-empty" style={{ marginTop: 20 }}>
              {loading ? "Chargement..." : "Aucune fiche agence liee a ce compte."}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function MonthStatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`ap-stat ${accent ? "ap-stat-accent" : ""}`}>
      <small>{label}</small>
      <strong>{value}</strong>
      {sub ? <span>{sub}</span> : null}
    </div>
  );
}

/** Weekly deal card: shows deal info + active date range overlap + monthly stats */
function WeekAssignmentCard({
  assignment,
  canPreview,
  weekStart,
  weekEnd,
}: {
  assignment: Assignment;
  canPreview: boolean;
  weekStart: string;
  weekEnd: string;
}) {
  const cpaV = assignment.stats.showCpaToStreamer;
  const rsV = assignment.stats.showRsToStreamer;
  const links = parseLinks(assignment.linksText);

  // Visible overlap between deal active range and week
  const overlapStart = (assignment.startDate ?? weekStart) > weekStart ? assignment.startDate! : weekStart;
  const overlapEnd = assignment.endDate && assignment.endDate < weekEnd ? assignment.endDate : weekEnd;
  const fullWeek = overlapStart === weekStart && overlapEnd === weekEnd;

  return (
    <article className="ap-card ap-card-week">
      <div className="ap-cardhead">
        <div>
          <h3>
            {assignment.casino.name}
            <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 14 }}> · {assignment.deal.name}</span>
          </h3>
          <div className="ap-cardmeta">
            {fullWeek
              ? "Actif toute la semaine"
              : `Actif du ${shortDate(overlapStart)} au ${shortDate(overlapEnd)}`}
          </div>
        </div>
        <span className="ap-pill ap-pill-ok">Actif</span>
      </div>

      {(canPreview || cpaV || rsV) && (
        <>
          <div className="ap-cardmeta" style={{ marginTop: 10, fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em" }}>
            Stats du mois (chiffres mensuels)
          </div>
          <div className="ap-subgrid">
            <div className="ap-substat"><small>Inscrits</small><strong>{assignment.stats.signups ?? "-"}</strong></div>
            <div className="ap-substat"><small>FTD</small><strong>{assignment.stats.ftdCount ?? "-"}</strong></div>
            {(canPreview || cpaV) && (
              <div className="ap-substat"><small>CPA</small><strong>{eur(canPreview ? assignment.earnings.cpa : assignment.earnings.visibleCpa)}</strong></div>
            )}
            {(canPreview || rsV) && (
              <div className="ap-substat"><small>RS</small><strong>{eur(canPreview ? assignment.earnings.rs : assignment.earnings.visibleRs)}</strong></div>
            )}
            <div className="ap-substat">
              <small>{canPreview ? "A payer" : "Total"}</small>
              <strong>{eur(canPreview ? assignment.earnings.total : assignment.earnings.visibleTotal)}</strong>
            </div>
          </div>
        </>
      )}

      {links.length > 0 && (
        <div className="ap-links">
          {links.map((item, index) =>
            item.url ? (
              <a key={`${item.url}-${index}`} className="ap-linkbtn" href={item.url} target="_blank" rel="noreferrer">
                {item.label || "Lien"}
              </a>
            ) : (
              <span key={`${item.label}-${index}`} className="ap-pill">{item.label}</span>
            )
          )}
        </div>
      )}
    </article>
  );
}

function AssignmentCard({ assignment, canPreview }: { assignment: Assignment; canPreview: boolean }) {
  const cpaV = assignment.stats.showCpaToStreamer;
  const rsV = assignment.stats.showRsToStreamer;
  const links = parseLinks(assignment.linksText);

  return (
    <article className="ap-card">
      <div className="ap-cardhead">
        <div>
          <h3>
            {assignment.casino.name}
            <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 14 }}> · {assignment.deal.name}</span>
          </h3>
          <div className="ap-cardmeta">
            Depuis {dateOnly(assignment.startDate)}
            {assignment.endDate ? ` jusqu au ${dateOnly(assignment.endDate)}` : ""}
          </div>
        </div>
        <span className={`ap-pill ${assignment.activeDuringMonth ? "ap-pill-ok" : "ap-pill-off"}`}>
          {assignment.activeDuringMonth ? "Actif" : "Inactif"}
        </span>
      </div>

      {canPreview && assignment.notes ? (
        <div className="ap-cardmeta" style={{ marginTop: 8 }}>{assignment.notes}</div>
      ) : null}

      {(canPreview || cpaV || rsV) && (
        <div className="ap-subgrid">
          {(canPreview || cpaV) && (
            <div className="ap-substat"><small>CPA</small><strong>{eur(canPreview ? assignment.earnings.cpa : assignment.earnings.visibleCpa)}</strong></div>
          )}
          {(canPreview || rsV) && (
            <div className="ap-substat"><small>RS</small><strong>{eur(canPreview ? assignment.earnings.rs : assignment.earnings.visibleRs)}</strong></div>
          )}
          <div className="ap-substat">
            <small>{canPreview ? "A payer" : "Total"}</small>
            <strong>{eur(canPreview ? assignment.earnings.total : assignment.earnings.visibleTotal)}</strong>
          </div>
          {canPreview && (
            <>
              <div className="ap-substat"><small>Marge agence</small><strong>{eur(assignment.earnings.agencyTotal)}</strong></div>
              <div className="ap-substat"><small>Gross</small><strong>{eur(assignment.earnings.grossTotal)}</strong></div>
            </>
          )}
        </div>
      )}

      {links.length > 0 && (
        <div className="ap-links">
          {links.map((item, index) =>
            item.url ? (
              <a key={`${item.url}-${index}`} className="ap-linkbtn" href={item.url} target="_blank" rel="noreferrer">
                {item.label || "Lien"}
              </a>
            ) : (
              <span key={`${item.label}-${index}`} className="ap-pill">{item.label}</span>
            )
          )}
        </div>
      )}
    </article>
  );
}
