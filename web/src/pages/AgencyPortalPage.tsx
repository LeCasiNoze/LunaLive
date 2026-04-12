import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { login } from "../lib/api";
import { getFsbAgencyStreamerPreview, getMyAgencyStats } from "../lib/api_agency";
import { canAccessFsbBoard } from "../lib/fsb_access";

type AgencyData = Awaited<ReturnType<typeof getMyAgencyStats>>["agency"];
type Assignment = NonNullable<AgencyData>["assignments"][number];

function currentMonthKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}`;
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
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function dateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(date);
}

function parseLinks(text: string | null | undefined) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/https?:\/\/\S+/i);
      if (!match) return { label: line, url: null as string | null };
      const url = match[0];
      const label = line.replace(url, "").replace(/[:\-]\s*$/, "").trim() || url;
      return { label, url };
    });
}

type GlobalSummary = {
  signups: number;
  depositCount: number;
  ftdCount: number;
  totalDeposits: number;
  cpa: number;
  rs: number;
  total: number;
  agencyCpa: number;
  agencyRs: number;
  agencyTotal: number;
  grossTotal: number;
  visibleCpa: number;
  visibleRs: number;
  visibleTotal: number;
  monthCount: number;
};

function aggregateGlobal(monthDataList: NonNullable<AgencyData>[]): GlobalSummary {
  const acc: GlobalSummary = {
    signups: 0, depositCount: 0, ftdCount: 0, totalDeposits: 0,
    cpa: 0, rs: 0, total: 0,
    agencyCpa: 0, agencyRs: 0, agencyTotal: 0, grossTotal: 0,
    visibleCpa: 0, visibleRs: 0, visibleTotal: 0,
    monthCount: monthDataList.length,
  };
  for (const d of monthDataList) {
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
.ap-period{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:20px}
.ap-period-label{font-size:13px;color:var(--muted);font-weight:700}
.ap-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}
.ap-stat{border:1px solid var(--line);border-radius:18px;background:var(--soft);padding:16px}
.ap-stat small{display:block;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;font-size:10px;font-weight:800;margin-bottom:10px}
.ap-stat strong{display:block;font-size:26px;letter-spacing:-.04em}
.ap-stat span{display:block;margin-top:6px;color:var(--muted);font-size:12px}
.ap-stat-accent strong{color:var(--accent)}
.ap-note{margin-top:14px;padding:14px 16px;border-radius:16px;background:rgba(113,213,210,.07);border:1px solid rgba(113,213,210,.14);color:var(--muted);line-height:1.6;font-size:14px}
.ap-list{display:grid;gap:12px;margin-top:20px}
.ap-card{border:1px solid var(--line);border-radius:18px;background:rgba(255,255,255,.025);padding:16px}
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
.ap-globalinfo{display:flex;gap:8px;align-items:center;margin-bottom:16px;padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid var(--line);color:var(--muted);font-size:13px}
.ap-loading{padding:28px;text-align:center;color:var(--muted);font-size:14px}
@media(max-width:680px){.ap-wrap{width:calc(100% - 16px)}.ap-shell{padding:16px}.ap-title{font-size:22px}}
`;

export default function AgencyPortalPage() {
  const [searchParams] = useSearchParams();
  const { user, setAuth, logout } = useAuth();
  const [monthKey, setMonthKey] = React.useState(currentMonthKey);
  const [tab, setTab] = React.useState<"month" | "global">("month");
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

  const assignments = agency?.assignments ?? [];
  const cpaVisible = assignments.some((a) => a.stats.showCpaToStreamer);
  const rsVisible = assignments.some((a) => a.stats.showRsToStreamer);
  const relevantAssignments = React.useMemo(() => {
    const active = assignments.filter((a) => a.activeDuringMonth);
    return active.length ? active : assignments;
  }, [assignments]);

  const historyMonths = agency?.historyMonths ?? [];
  const globalSummary = React.useMemo(() => aggregateGlobal(allMonthsData), [allMonthsData]);
  const globalCpaVisible = allMonthsData.some((d) => d.assignments.some((a) => a.stats.showCpaToStreamer));
  const globalRsVisible = allMonthsData.some((d) => d.assignments.some((a) => a.stats.showRsToStreamer));

  React.useEffect(() => { setUsername(prefilledUsername); }, [prefilledUsername]);

  const loadMonth = React.useCallback(async (targetMonth: string) => {
    if (!user && !canPreview) return;
    setLoading(true);
    setError(null);
    try {
      const response = canPreview && previewId
        ? await getFsbAgencyStreamerPreview(previewId, targetMonth)
        : await getMyAgencyStats(targetMonth);
      setAgency(response.agency);
    } catch (err: any) {
      setError(String(err?.message || "Impossible de charger les stats."));
    } finally {
      setLoading(false);
    }
  }, [canPreview, previewId, user]);

  const loadGlobal = React.useCallback(async () => {
    if (!user && !canPreview) return;
    if (!historyMonths.length) return;
    setGlobalLoading(true);
    setError(null);
    try {
      const results = await Promise.all(
        historyMonths.map((mk) =>
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
  }, [canPreview, previewId, user, historyMonths]);

  React.useEffect(() => {
    if (!user && !canPreview) { setAgency(null); return; }
    void loadMonth(monthKey);
  }, [canPreview, loadMonth, monthKey, user]);

  React.useEffect(() => {
    if (tab === "global" && !globalLoaded && historyMonths.length > 0) {
      void loadGlobal();
    }
  }, [tab, globalLoaded, historyMonths.length, loadGlobal]);

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

  const streamerName = agency?.streamer?.displayName ?? "";

  return (
    <main className="ap">
      <style>{PAGE_CSS}</style>
      <div className="ap-wrap">
        <section className="ap-shell">
          {/* Header */}
          <div className="ap-head">
            <div>
              <h1 className="ap-title">{streamerName || "Portail Affilie"}</h1>
              <p className="ap-subtitle">
                {agency ? "Tableau de bord affiliation" : "Aucune donnee agence liee a ce compte."}
                {canPreview ? " · Preview admin" : null}
              </p>
            </div>
            <div className="ap-actions">
              <button className="ap-btn" type="button" onClick={() => void loadMonth(monthKey)} disabled={loading}>
                {loading ? "..." : "Rafraichir"}
              </button>
              {canPreview
                ? <Link className="ap-btn" to="/FSB_Board">Retour board</Link>
                : <button className="ap-btn" onClick={logout}>Deconnexion</button>}
            </div>
          </div>

          {error ? <div className="ap-alert">{error}</div> : null}

          {agency ? (
            <>
              {/* Tabs */}
              <div className="ap-tabs">
                <button className={`ap-tab ${tab === "month" ? "ap-tab-active" : ""}`} onClick={() => setTab("month")}>
                  Vue mensuelle
                </button>
                <button className={`ap-tab ${tab === "global" ? "ap-tab-active" : ""}`} onClick={() => setTab("global")}>
                  Vue globale {historyMonths.length > 0 ? `(${historyMonths.length} mois)` : ""}
                </button>
              </div>

              {/* Monthly view */}
              {tab === "month" && (
                <div className="ap-tab-content">
                  {/* Month navigation */}
                  <div className="ap-period">
                    <button className="ap-btn" onClick={() => setMonthKey((mk) => addMonths(mk, -1))}>{"<"}</button>
                    <span className="ap-period-label">{monthLabel(monthKey)}</span>
                    <button className="ap-btn" onClick={() => setMonthKey((mk) => addMonths(mk, 1))}>{">"}</button>
                    <button className="ap-btn ap-btn-active" onClick={() => setMonthKey(currentMonthKey())}>Ce mois</button>
                  </div>

                  {/* History month shortcuts */}
                  {historyMonths.length > 1 && (
                    <div className="ap-actions" style={{ marginBottom: 18 }}>
                      {historyMonths.slice(0, 8).map((mk) => (
                        <button
                          key={mk}
                          className={`ap-btn ${mk === monthKey ? "ap-btn-primary" : ""}`}
                          onClick={() => setMonthKey(mk)}
                        >
                          {monthLabel(mk)}
                        </button>
                      ))}
                    </div>
                  )}

                  {loading ? (
                    <div className="ap-loading">Chargement...</div>
                  ) : (
                    <>
                      {/* Stats grid */}
                      <div className="ap-grid">
                        <div className="ap-stat">
                          <small>Inscrits</small>
                          <strong>{num(agency.summary.signups)}</strong>
                          <span>{monthLabel(monthKey)}</span>
                        </div>
                        <div className="ap-stat">
                          <small>FTD</small>
                          <strong>{num(agency.summary.ftdCount)}</strong>
                          <span>Premiers depots</span>
                        </div>
                        <div className="ap-stat">
                          <small>Nb depots</small>
                          <strong>{num(agency.summary.depositCount)}</strong>
                          <span>Total transactions</span>
                        </div>
                        <div className="ap-stat">
                          <small>Volume depots</small>
                          <strong>{eur(agency.summary.totalDeposits)}</strong>
                          <span>Declare</span>
                        </div>
                        {(canPreview || cpaVisible) && (
                          <div className="ap-stat">
                            <small>CPA</small>
                            <strong>{eur(canPreview ? agency.summary.cpa : agency.summary.visibleCpa)}</strong>
                            <span>Net affilie</span>
                          </div>
                        )}
                        {(canPreview || rsVisible) && (
                          <div className="ap-stat">
                            <small>Revenue Share</small>
                            <strong>{eur(canPreview ? agency.summary.rs : agency.summary.visibleRs)}</strong>
                            <span>Part RS</span>
                          </div>
                        )}
                        <div className="ap-stat ap-stat-accent">
                          <small>{canPreview ? "Total a payer" : "Total"}</small>
                          <strong>{eur(canPreview ? agency.summary.total : agency.summary.visibleTotal)}</strong>
                          <span>Maj {dateTime(agency.updatedAt)}</span>
                        </div>
                        {canPreview && (
                          <>
                            <div className="ap-stat">
                              <small>Marge agence</small>
                              <strong>{eur(agency.summary.agencyTotal)}</strong>
                              <span>Part agence</span>
                            </div>
                            <div className="ap-stat">
                              <small>Total genere</small>
                              <strong>{eur(agency.summary.grossTotal)}</strong>
                              <span>Gross casino</span>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Public note */}
                      {agency.streamer.publicNote && (
                        <div className="ap-note">{agency.streamer.publicNote}</div>
                      )}

                      {/* Assignment cards */}
                      <div className="ap-list">
                        {relevantAssignments.map((assignment) => (
                          <AssignmentCard
                            key={assignment.id}
                            assignment={assignment}
                            canPreview={canPreview}
                          />
                        ))}
                        {relevantAssignments.length === 0 && (
                          <div className="ap-empty">Aucun deal actif sur ce mois.</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Global view */}
              {tab === "global" && (
                <div className="ap-tab-content">
                  {globalLoading ? (
                    <div className="ap-loading">Agregation de {historyMonths.length} mois en cours...</div>
                  ) : !globalLoaded ? (
                    <div className="ap-empty">
                      <button className="ap-btn ap-btn-primary" onClick={() => void loadGlobal()}>
                        Charger les stats globales
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="ap-globalinfo">
                        {globalSummary.monthCount} mois analyses (
                        {historyMonths.length > 0 ? `${monthLabel(historyMonths[historyMonths.length - 1])} → ${monthLabel(historyMonths[0])}` : ""}
                        )
                        <button className="ap-btn" style={{ marginLeft: "auto" }} onClick={() => { setGlobalLoaded(false); void loadGlobal(); }}>
                          Actualiser
                        </button>
                      </div>

                      <div className="ap-grid">
                        <div className="ap-stat">
                          <small>Inscrits total</small>
                          <strong>{num(globalSummary.signups)}</strong>
                          <span>{globalSummary.monthCount} mois</span>
                        </div>
                        <div className="ap-stat">
                          <small>FTD total</small>
                          <strong>{num(globalSummary.ftdCount)}</strong>
                          <span>Tous mois confondus</span>
                        </div>
                        <div className="ap-stat">
                          <small>Nb depots total</small>
                          <strong>{num(globalSummary.depositCount)}</strong>
                          <span>Toutes periodes</span>
                        </div>
                        <div className="ap-stat">
                          <small>Volume total</small>
                          <strong>{eur(globalSummary.totalDeposits)}</strong>
                          <span>Tous mois</span>
                        </div>
                        {(canPreview || globalCpaVisible) && (
                          <div className="ap-stat">
                            <small>CPA cumulee</small>
                            <strong>{eur(canPreview ? globalSummary.cpa : globalSummary.visibleCpa)}</strong>
                            <span>Net affilie</span>
                          </div>
                        )}
                        {(canPreview || globalRsVisible) && (
                          <div className="ap-stat">
                            <small>RS cumulee</small>
                            <strong>{eur(canPreview ? globalSummary.rs : globalSummary.visibleRs)}</strong>
                            <span>Part RS</span>
                          </div>
                        )}
                        <div className="ap-stat ap-stat-accent">
                          <small>Gains cumulés</small>
                          <strong>{eur(canPreview ? globalSummary.total : globalSummary.visibleTotal)}</strong>
                          <span>Tous mois</span>
                        </div>
                        {canPreview && (
                          <>
                            <div className="ap-stat">
                              <small>Marge agence totale</small>
                              <strong>{eur(globalSummary.agencyTotal)}</strong>
                              <span>Tous mois</span>
                            </div>
                            <div className="ap-stat">
                              <small>Gross total</small>
                              <strong>{eur(globalSummary.grossTotal)}</strong>
                              <span>Casino total</span>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Per-month breakdown */}
                      <div className="ap-list" style={{ marginTop: 22 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".07em" }}>
                          Detail par mois
                        </div>
                        {allMonthsData.map((d, i) => {
                          const mk = historyMonths[i];
                          if (!d) return null;
                          const cpaV = d.assignments.some((a) => a.stats.showCpaToStreamer);
                          const rsV = d.assignments.some((a) => a.stats.showRsToStreamer);
                          return (
                            <div key={mk} className="ap-card" style={{ padding: "14px 16px" }}>
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
                                    <div className="ap-substat">
                                      <small>CPA</small>
                                      <strong>{eur(canPreview ? d.summary.cpa : d.summary.visibleCpa)}</strong>
                                    </div>
                                  )}
                                  {(canPreview || rsV) && (
                                    <div className="ap-substat">
                                      <small>RS</small>
                                      <strong>{eur(canPreview ? d.summary.rs : d.summary.visibleRs)}</strong>
                                    </div>
                                  )}
                                  {canPreview && (
                                    <div className="ap-substat">
                                      <small>Marge agence</small>
                                      <strong>{eur(d.summary.agencyTotal)}</strong>
                                    </div>
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
            {assignment.endDate ? ` jusqu'au ${dateOnly(assignment.endDate)}` : ""}
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
            <div className="ap-substat">
              <small>CPA net</small>
              <strong>{eur(canPreview ? assignment.earnings.cpa : assignment.earnings.visibleCpa)}</strong>
            </div>
          )}
          {(canPreview || rsV) && (
            <div className="ap-substat">
              <small>RS net</small>
              <strong>{eur(canPreview ? assignment.earnings.rs : assignment.earnings.visibleRs)}</strong>
            </div>
          )}
          <div className="ap-substat">
            <small>{canPreview ? "A payer" : "Total"}</small>
            <strong>{eur(canPreview ? assignment.earnings.total : assignment.earnings.visibleTotal)}</strong>
          </div>
          {canPreview && (
            <>
              <div className="ap-substat">
                <small>Marge agence</small>
                <strong>{eur(assignment.earnings.agencyTotal)}</strong>
              </div>
              <div className="ap-substat">
                <small>Gross</small>
                <strong>{eur(assignment.earnings.grossTotal)}</strong>
              </div>
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
