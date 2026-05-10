import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { login } from "../lib/api";
import {
  getFsbAgencyStreamerPreview,
  getMyAgencyStats,
  getMyAgencyStatsPeriod,
} from "../lib/api_agency";
import type { AgencyPeriodAggregate } from "../lib/api_agency";
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

// ─── Period selector type ──────────────────────────────────────────────────────

type PeriodMode = "week" | "month" | "prev-month";

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
.ap-period-toggle{display:flex;gap:4px;padding:4px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid var(--line);flex-wrap:nowrap}
.ap-period-opt{padding:8px 16px;border-radius:10px;border:none;background:transparent;color:var(--muted);font:inherit;font-size:13px;font-weight:700;cursor:pointer;transition:background .12s,color .12s;white-space:nowrap}
.ap-period-opt:hover{color:var(--text)}
.ap-period-opt-active{background:rgba(255,178,107,.15);border:1px solid rgba(255,178,107,.25);color:var(--accent)}
.ap-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.ap-stat{border:1px solid var(--line);border-radius:18px;background:var(--soft);padding:16px}
.ap-stat small{display:block;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;font-size:10px;font-weight:800;margin-bottom:10px}
.ap-stat strong{display:block;font-size:26px;letter-spacing:-.04em}
.ap-stat span{display:block;margin-top:6px;color:var(--muted);font-size:12px}
.ap-stat-accent strong{color:var(--accent)}
.ap-stat-skel strong{color:transparent;background:rgba(255,255,255,.06);border-radius:6px;animation:ap-pulse 1.4s ease-in-out infinite}
.ap-stat-skel small{color:transparent;background:rgba(255,255,255,.04);border-radius:4px}
@keyframes ap-pulse{0%,100%{opacity:.5}50%{opacity:1}}
.ap-note{margin-top:14px;padding:14px 16px;border-radius:16px;background:rgba(113,213,210,.07);border:1px solid rgba(113,213,210,.14);color:var(--muted);line-height:1.6;font-size:14px}
.ap-banner{margin-bottom:16px;padding:11px 14px;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid var(--line);color:var(--muted);font-size:13px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.ap-list{display:grid;gap:12px;margin-top:20px}
.ap-card{border:1px solid var(--line);border-radius:18px;background:rgba(255,255,255,.025);padding:16px;transition:border-color .15s}
.ap-card-active{border-color:rgba(113,213,210,.18)}
.ap-card-period{border-color:rgba(255,178,107,.14)}
.ap-cardhead{display:flex;gap:10px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap}
.ap-card h3{margin:0;font-size:18px;letter-spacing:-.02em}
.ap-cardmeta{margin:5px 0 0;color:var(--muted);font-size:13px;line-height:1.5}
.ap-pill{display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;border:1px solid var(--line);background:rgba(255,255,255,.04);font-size:11px;font-weight:800;letter-spacing:.02em}
.ap-pill-ok{background:rgba(120,231,180,.10);border-color:rgba(120,231,180,.18);color:#8cf5c8}
.ap-pill-off{background:rgba(255,178,107,.08);border-color:rgba(255,178,107,.16);color:#ffc46a}
.ap-pill-new{background:rgba(255,178,107,.14);border-color:rgba(255,178,107,.25);color:var(--accent)}
.ap-subgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-top:12px}
.ap-substat{border:1px solid rgba(255,255,255,.05);border-radius:12px;background:rgba(255,255,255,.025);padding:10px 12px}
.ap-substat small{display:block;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.07em;font-weight:800;margin-bottom:6px}
.ap-substat strong{font-size:17px}
.ap-substat-accent strong{color:var(--accent)}
.ap-substat-skel strong{color:transparent;background:rgba(255,255,255,.06);border-radius:4px;animation:ap-pulse 1.4s ease-in-out infinite}
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
.ap-skel-card{border:1px solid var(--line);border-radius:18px;background:rgba(255,255,255,.025);padding:16px;animation:ap-pulse 1.4s ease-in-out infinite}
.ap-skel-line{height:14px;border-radius:6px;background:rgba(255,255,255,.06);margin-bottom:8px}
.ap-skel-title{height:20px;width:55%;border-radius:8px;background:rgba(255,255,255,.08);margin-bottom:10px}
.ap-period-badge{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:10px;background:rgba(255,178,107,.08);border:1px solid rgba(255,178,107,.14);color:rgba(255,178,107,.85);font-size:12px;font-weight:700}
@media(max-width:680px){.ap-wrap{width:calc(100% - 16px)}.ap-shell{padding:16px}.ap-title{font-size:22px}.ap-period-toggle{flex-wrap:wrap}}
`;

// ─── Component ─────────────────────────────────────────────────────────────────

export default function AgencyPortalPage() {
  const [searchParams] = useSearchParams();
  const { user, setAuth, logout } = useAuth();

  const [tab, setTab] = React.useState<"period" | "global">("period");

  // Period selector
  const [periodMode, setPeriodMode] = React.useState<PeriodMode>("month");

  // Month key used when periodMode = "month" or "prev-month"
  const [monthKey, setMonthKey] = React.useState(currentMonthKey);
  const prevMonthKey = addMonths(currentMonthKey(), -1);

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

  const assignments = agency?.assignments ?? [];
  const historyMonths = agency?.historyMonths ?? [];

  // Active assignments for period view
  const periodAssignments = React.useMemo(() => {
    const active = assignments.filter((a) => a.activeDuringMonth);
    return active.length ? active : assignments;
  }, [assignments]);

  const cpaVisible = assignments.some((a) => a.stats.showCpaToStreamer);
  const rsVisible = assignments.some((a) => a.stats.showRsToStreamer);
  const globalSummary = React.useMemo(() => aggregateGlobal(allMonthsData), [allMonthsData]);
  const globalCpaVisible = allMonthsData.some((d) => d.assignments.some((a) => a.stats.showCpaToStreamer));
  const globalRsVisible = allMonthsData.some((d) => d.assignments.some((a) => a.stats.showRsToStreamer));

  // Derive the API call params from periodMode
  const periodApiParams = React.useMemo((): { apiPeriod: "week" | "month"; apiMonthKey: string | null } => {
    if (periodMode === "week") return { apiPeriod: "week", apiMonthKey: null };
    if (periodMode === "prev-month") return { apiPeriod: "month", apiMonthKey: prevMonthKey };
    return { apiPeriod: "month", apiMonthKey: monthKey };
  }, [periodMode, monthKey, prevMonthKey]);

  const loadPeriod = React.useCallback(async (apiPeriod: "week" | "month", apiMonthKey: string | null) => {
    if (!user && !canPreview) return;
    setLoading(true);
    setError(null);
    try {
      // Preview mode uses old API (no period support), fall back to getMyAgencyStats
      const response = canPreview && previewId
        ? await getFsbAgencyStreamerPreview(previewId, apiMonthKey ?? undefined)
        : await getMyAgencyStatsPeriod(apiPeriod, apiMonthKey, null);
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

  // Load period data when selector changes
  React.useEffect(() => {
    if (!user && !canPreview) { setAgency(null); return; }
    if (tab === "period") {
      void loadPeriod(periodApiParams.apiPeriod, periodApiParams.apiMonthKey);
    }
  }, [canPreview, loadPeriod, periodApiParams, tab, user]);

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

  // Period label for display
  const periodDisplayLabel = React.useMemo(() => {
    if (periodMode === "week") return "Cette semaine";
    if (periodMode === "prev-month") return monthLabel(prevMonthKey);
    return monthLabel(monthKey);
  }, [periodMode, monthKey, prevMonthKey]);

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
              <button
                className="ap-btn"
                onClick={() => void loadPeriod(periodApiParams.apiPeriod, periodApiParams.apiMonthKey)}
                disabled={loading}
              >
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
                <button className={`ap-tab ${tab === "period" ? "ap-tab-active" : ""}`} onClick={() => setTab("period")}>
                  Stats
                </button>
                <button className={`ap-tab ${tab === "global" ? "ap-tab-active" : ""}`} onClick={() => setTab("global")}>
                  Historique {historyMonths.length > 0 ? `(${historyMonths.length})` : ""}
                </button>
              </div>

              {/* ── PERIOD VIEW ────────────────────────────────────────────── */}
              {tab === "period" && (
                <div className="ap-tab-content">

                  {/* Period selector */}
                  <div className="ap-period">
                    <div className="ap-period-toggle">
                      <button
                        className={`ap-period-opt ${periodMode === "week" ? "ap-period-opt-active" : ""}`}
                        onClick={() => setPeriodMode("week")}
                      >
                        Semaine
                      </button>
                      <button
                        className={`ap-period-opt ${periodMode === "month" ? "ap-period-opt-active" : ""}`}
                        onClick={() => setPeriodMode("month")}
                      >
                        Mois en cours
                      </button>
                      <button
                        className={`ap-period-opt ${periodMode === "prev-month" ? "ap-period-opt-active" : ""}`}
                        onClick={() => setPeriodMode("prev-month")}
                      >
                        Mois precedent
                      </button>
                    </div>

                    {/* Month navigator (only in "month" mode) */}
                    {periodMode === "month" && (
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <button className="ap-btn" style={{ padding: "7px 11px" }} onClick={() => setMonthKey((mk) => addMonths(mk, -1))}>{"<"}</button>
                        <span className="ap-period-label">{monthLabel(monthKey)}</span>
                        <button className="ap-btn" style={{ padding: "7px 11px" }} onClick={() => setMonthKey((mk) => addMonths(mk, 1))}>{">"}</button>
                        {monthKey !== currentMonthKey() && (
                          <button className="ap-btn ap-btn-active" onClick={() => setMonthKey(currentMonthKey())}>Ce mois</button>
                        )}
                      </div>
                    )}

                    {periodMode !== "month" && (
                      <span className="ap-period-badge">{periodDisplayLabel}</span>
                    )}
                  </div>

                  {/* Month history quick-nav */}
                  {periodMode === "month" && historyMonths.length > 1 && (
                    <div className="ap-actions" style={{ marginBottom: 18 }}>
                      {historyMonths.slice(0, 8).map((mk) => (
                        <button key={mk} className={`ap-btn ${mk === monthKey ? "ap-btn-primary" : ""}`} onClick={() => setMonthKey(mk)}>
                          {monthLabel(mk)}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Skeleton loading */}
                  {loading ? (
                    <PeriodSkeleton />
                  ) : (
                    <>
                      {/* Global summary grid */}
                      <div className="ap-grid">
                        <MonthStatCard label="Inscrits" value={num(agency.summary.signups)} sub={periodDisplayLabel} />
                        <MonthStatCard label="FTD" value={num(agency.summary.ftdCount)} sub="Premiers depots" />
                        <MonthStatCard label="Nb depots" value={num(agency.summary.depositCount)} sub="Total" />
                        <MonthStatCard label="Volume" value={eur(agency.summary.totalDeposits)} sub="Declare" />
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

                      {/* Per-assignment cards */}
                      {periodAssignments.length === 0 ? (
                        <div className="ap-empty">Aucune assignation active sur cette periode.</div>
                      ) : (
                        <>
                          <div className="ap-section-label">Detail par casino</div>
                          <div className="ap-list" style={{ marginTop: 0 }}>
                            {periodAssignments.map((a) => (
                              <PeriodAssignmentCard key={a.id} assignment={a} canPreview={canPreview} />
                            ))}
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ── GLOBAL / HISTORY VIEW ──────────────────────────────────── */}
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
                        {allMonthsData.length === 0 && (
                          <div className="ap-empty">Aucun historique disponible.</div>
                        )}
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

// ─── Skeleton ──────────────────────────────────────────────────────────────────

function PeriodSkeleton() {
  return (
    <>
      <div className="ap-grid" style={{ marginTop: 4 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="ap-stat ap-stat-skel">
            <small>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</small>
            <strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</strong>
          </div>
        ))}
      </div>
      <div className="ap-section-label">Detail par casino</div>
      <div className="ap-list" style={{ marginTop: 0 }}>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="ap-skel-card">
            <div className="ap-skel-title" />
            <div className="ap-skel-line" style={{ width: "35%" }} />
            <div className="ap-subgrid" style={{ marginTop: 10 }}>
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="ap-substat ap-substat-skel">
                  <small>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</small>
                  <strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</strong>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
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

/** Period-aware assignment card: prefers periodAggregate.adjustedTotals when available. */
function PeriodAssignmentCard({
  assignment,
  canPreview,
}: {
  assignment: Assignment;
  canPreview: boolean;
}) {
  const agg: AgencyPeriodAggregate | null | undefined = assignment.periodAggregate;
  const adj = agg?.adjustedTotals;

  // Whether we have new-format period aggregate data
  const hasPeriodData = adj != null;

  // Earnings derived from adjustedTotals (streamer-side only)
  const cpaPerFtd = assignment.deal.cpaPerFtd ?? 0;
  const rsPercent = assignment.deal.rsPercent ?? 0;
  const derivedCpa = adj != null ? (adj.ftd * cpaPerFtd) : null;
  const derivedRs = adj != null ? (adj.rsAmount * rsPercent / 100) : null;
  const derivedTotal = derivedCpa != null && derivedRs != null ? (derivedCpa + derivedRs) : null;

  // Fallback to old earnings
  const cpaV = assignment.stats.showCpaToStreamer;
  const rsV = assignment.stats.showRsToStreamer;

  const links = parseLinks(assignment.linksText);
  const isActive = assignment.activeDuringMonth;

  // Snapshot freshness hint
  const latestSnap = assignment.latestSnapshot;
  const snapDate = latestSnap?.capturedAt ? latestSnap.capturedAt.slice(0, 10) : null;

  return (
    <article className={`ap-card ${isActive ? "ap-card-active" : ""} ${hasPeriodData ? "ap-card-period" : ""}`}>
      <div className="ap-cardhead">
        <div>
          <h3>
            {assignment.casino.name}
            <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 14 }}> · {assignment.deal.name}</span>
          </h3>
          <div className="ap-cardmeta">
            Depuis {dateOnly(assignment.startDate)}
            {assignment.endDate ? ` jusqu au ${dateOnly(assignment.endDate)}` : ""}
            {snapDate && (
              <span style={{ marginLeft: 8, color: "rgba(113,213,210,.7)", fontSize: 11 }}>
                · Snapshot {shortDate(snapDate)}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {hasPeriodData && <span className="ap-pill ap-pill-new">Periode</span>}
          <span className={`ap-pill ${isActive ? "ap-pill-ok" : "ap-pill-off"}`}>
            {isActive ? "Actif" : "Inactif"}
          </span>
        </div>
      </div>

      {canPreview && assignment.notes ? (
        <div className="ap-cardmeta" style={{ marginTop: 8 }}>{assignment.notes}</div>
      ) : null}

      {/* Period aggregate stats (new format) */}
      {hasPeriodData && adj && (
        <div className="ap-subgrid">
          <div className="ap-substat">
            <small>Inscrits</small>
            <strong>{num(adj.signups)}</strong>
          </div>
          <div className="ap-substat">
            <small>FTD</small>
            <strong>{num(adj.ftd)}</strong>
          </div>
          {adj.sumDep > 0 && (
            <div className="ap-substat">
              <small>Depot FTD</small>
              <strong>{eur(adj.sumDep)}</strong>
            </div>
          )}
          {adj.totalDeposits > 0 && (
            <div className="ap-substat">
              <small>Total depots</small>
              <strong>{eur(adj.totalDeposits)}</strong>
            </div>
          )}
          {cpaPerFtd > 0 && derivedCpa !== null && (
            <div className="ap-substat">
              <small>CPA ({eur(cpaPerFtd)}/FTD)</small>
              <strong>{eur(derivedCpa)}</strong>
            </div>
          )}
          {rsPercent > 0 && derivedRs !== null && adj.rsAmount > 0 && (
            <div className="ap-substat">
              <small>RS ({rsPercent}%)</small>
              <strong>{eur(derivedRs)}</strong>
            </div>
          )}
          {derivedTotal !== null && (derivedCpa !== null || derivedRs !== null) && (
            <div className="ap-substat ap-substat-accent">
              <small>Total periode</small>
              <strong>{eur(derivedTotal)}</strong>
            </div>
          )}
          {canPreview && agg?.agencyTotals && (
            <>
              <div className="ap-substat">
                <small>Marge agence</small>
                <strong>{eur(agg.agencyTotals.total)}</strong>
              </div>
            </>
          )}
        </div>
      )}

      {/* Fallback: old stats format (when no period aggregate) */}
      {!hasPeriodData && (canPreview || cpaV || rsV) && (
        <div className="ap-subgrid">
          {(canPreview || cpaV) && (
            <div className="ap-substat">
              <small>CPA</small>
              <strong>{eur(canPreview ? assignment.earnings.cpa : assignment.earnings.visibleCpa)}</strong>
            </div>
          )}
          {(canPreview || rsV) && (
            <div className="ap-substat">
              <small>RS</small>
              <strong>{eur(canPreview ? assignment.earnings.rs : assignment.earnings.visibleRs)}</strong>
            </div>
          )}
          <div className="ap-substat ap-substat-accent">
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
