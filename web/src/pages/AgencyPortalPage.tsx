import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { login } from "../lib/api";
import { getFsbAgencyStreamerPreview, getMyAgencyStats } from "../lib/api_agency";
import { canAccessFsbBoard } from "../lib/fsb_access";

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

function visibleMoney(value: number | null | undefined, visible: boolean) {
  return visible ? eur(value) : "Masque";
}

const PAGE_CSS = `
.agency-portal{--bg:#081120;--panel:rgba(10,18,34,.92);--line:rgba(255,255,255,.08);--text:#eef5ff;--muted:rgba(214,225,242,.72);min-height:100vh;background:
radial-gradient(circle at top left,rgba(255,178,107,.14),transparent 28%),
radial-gradient(circle at top right,rgba(113,213,210,.12),transparent 24%),
linear-gradient(180deg,#07101d,#091426 55%,#0b1627);color:var(--text)}
.agency-wrap{width:min(1120px,calc(100% - 28px));margin:0 auto;padding:26px 0 40px}
.agency-shell{border:1px solid var(--line);border-radius:28px;background:var(--panel);box-shadow:0 30px 90px rgba(0,0,0,.42);backdrop-filter:blur(16px);padding:22px}
.agency-head,.agency-row,.agency-actions,.agency-links{display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between}
.agency-title{margin:0;font-size:30px;letter-spacing:-.04em}
.agency-muted{color:var(--muted);line-height:1.6}
.agency-btn,.agency-linkbtn{border-radius:14px;border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--text);padding:11px 15px;font:inherit;font-weight:700;cursor:pointer;text-decoration:none}
.agency-btn-primary{background:linear-gradient(135deg,rgba(255,178,107,.24),rgba(255,141,141,.14));border-color:rgba(255,178,107,.3)}
.agency-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:18px}
.agency-stat,.agency-card{border:1px solid var(--line);border-radius:20px;background:rgba(255,255,255,.03);padding:16px}
.agency-stat small{display:block;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;font-size:11px;font-weight:800}
.agency-stat strong{display:block;margin-top:10px;font-size:28px;letter-spacing:-.04em}
.agency-stat span{display:block;margin-top:8px;color:var(--muted);font-size:13px}
.agency-list{display:grid;gap:14px;margin-top:18px}
.agency-cardhead{display:flex;gap:10px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap}
.agency-pill{display:inline-flex;align-items:center;padding:7px 10px;border-radius:999px;border:1px solid var(--line);background:rgba(255,255,255,.04);font-size:12px;font-weight:700}
.agency-pill-ok{background:rgba(120,231,180,.12)}
.agency-pill-off{background:rgba(255,178,107,.12)}
.agency-mini{display:grid;gap:10px;margin-top:14px}
.agency-subgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-top:14px}
.agency-subcard{border:1px solid rgba(255,255,255,.06);border-radius:16px;background:rgba(255,255,255,.03);padding:12px}
.agency-subcard small{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:800}
.agency-subcard strong{display:block;margin-top:7px;font-size:20px}
.agency-links{margin-top:12px;justify-content:flex-start}
.agency-linkbtn{padding:9px 12px}
.agency-auth{width:min(440px,100%);margin:8vh auto 0}
.agency-field{display:grid;gap:8px;margin-top:14px}
.agency-field label{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:800}
.agency-input{width:100%;box-sizing:border-box;border-radius:14px;border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--text);font:inherit;padding:12px 13px}
.agency-alert{margin-top:14px;padding:13px 15px;border-radius:16px;border:1px solid rgba(255,141,141,.22);background:rgba(255,141,141,.08);color:#ffd9d9}
@media (max-width:740px){.agency-wrap{width:min(100% - 16px,1120px)}.agency-shell{padding:16px}.agency-title{font-size:24px}}
`;

export default function AgencyPortalPage() {
  const [searchParams] = useSearchParams();
  const { user, setAuth, logout } = useAuth();
  const [monthKey, setMonthKey] = React.useState(currentMonthKey);
  const [loading, setLoading] = React.useState(false);
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
  const [agency, setAgency] = React.useState<Awaited<ReturnType<typeof getMyAgencyStats>>["agency"] | null>(null);
  const assignments = agency?.assignments ?? [];
  const cpaVisible = assignments.some((assignment) => assignment.stats.showCpaToStreamer);
  const rsVisible = assignments.some((assignment) => assignment.stats.showRsToStreamer);
  const hasVisibleAmounts = cpaVisible || rsVisible;

  React.useEffect(() => {
    setUsername(prefilledUsername);
  }, [prefilledUsername]);

  const load = React.useCallback(async (targetMonth: string) => {
    if (!user && !canPreview) return;
    setLoading(true);
    setError(null);
    try {
      const response =
        canPreview && previewId
          ? await getFsbAgencyStreamerPreview(previewId, targetMonth)
          : await getMyAgencyStats(targetMonth);
      setAgency(response.agency);
    } catch (err: any) {
      setError(String(err?.message || "Impossible de charger les stats agence."));
    } finally {
      setLoading(false);
    }
  }, [canPreview, previewId, user]);

  React.useEffect(() => {
    if (!user && !canPreview) {
      setAgency(null);
      return;
    }
    void load(monthKey);
  }, [canPreview, load, monthKey, user]);

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
      <main className="agency-portal">
        <style>{PAGE_CSS}</style>
        <div className="agency-wrap">
          <section className="agency-shell agency-auth">
            <h1 className="agency-title">Portail Agence</h1>
            <div className="agency-muted" style={{ marginTop: 10 }}>
              Ouvre ton lien de consultation, le username est pre-rempli, puis entre le code d acces transmis par l agence.
            </div>
            {error ? <div className="agency-alert">{error}</div> : null}
            <form onSubmit={handleLogin}>
              <div className="agency-field">
                <label>Username</label>
                <input className="agency-input" value={username} onChange={(e) => setUsername(e.target.value)} required />
              </div>
              <div className="agency-field">
                <label>Code d acces</label>
                <input
                  className="agency-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="agency-actions" style={{ marginTop: 18, justifyContent: "flex-end" }}>
                <Link className="agency-linkbtn" to="/">
                  Retour LunaLive
                </Link>
                <button className="agency-btn agency-btn-primary" type="submit" disabled={loginBusy}>
                  {loginBusy ? "Connexion..." : "Se connecter"}
                </button>
              </div>
            </form>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="agency-portal">
      <style>{PAGE_CSS}</style>
      <div className="agency-wrap">
        <section className="agency-shell">
          <div className="agency-head">
            <div>
              <h1 className="agency-title">Portail Agence</h1>
              <div className="agency-muted">
                {agency
                  ? `${agency.streamer.displayName} | ${monthLabel(monthKey)}`
                  : "Aucune statistique agence liee a ce compte pour le moment."}
              </div>
              {canPreview ? (
                <div className="agency-muted" style={{ marginTop: 6 }}>
                  Preview admin actif. Cette page reproduit ce que l affi voit.
                </div>
              ) : null}
            </div>
            <div className="agency-actions">
              <button className="agency-btn" onClick={() => setMonthKey(addMonths(monthKey, -1))}>
                Mois precedent
              </button>
              <span className="agency-pill">{monthLabel(monthKey)}</span>
              <button className="agency-btn" onClick={() => setMonthKey(addMonths(monthKey, 1))}>
                Mois suivant
              </button>
              <button className="agency-btn" onClick={() => void load(monthKey)}>
                {loading ? "Actualisation..." : "Rafraichir"}
              </button>
              {canPreview ? (
                <Link className="agency-linkbtn" to="/FSB_Board">
                  Retour board
                </Link>
              ) : (
                <button className="agency-btn" onClick={logout}>
                  Se deconnecter
                </button>
              )}
            </div>
          </div>

          {agency?.historyMonths?.length ? (
            <div className="agency-actions" style={{ marginTop: 16, justifyContent: "flex-start" }}>
              {agency.historyMonths.slice(0, 8).map((item) => (
                <button
                  key={item}
                  className={`agency-btn ${item === monthKey ? "agency-btn-primary" : ""}`}
                  onClick={() => setMonthKey(item)}
                >
                  {monthLabel(item)}
                </button>
              ))}
            </div>
          ) : null}

          {error ? <div className="agency-alert">{error}</div> : null}

          {!agency ? (
            <div className="agency-card" style={{ marginTop: 18 }}>
              <div className="agency-muted">
                Ce compte n a pas encore de fiche agence ou les donnees n ont pas encore ete reliees.
              </div>
            </div>
          ) : (
            <>
              <div className="agency-grid">
                <div className="agency-stat">
                  <small>Inscrits</small>
                  <strong>{num(agency.summary.signups)}</strong>
                  <span>Sur {monthLabel(monthKey)}</span>
                </div>
                <div className="agency-stat">
                  <small>Nombre de depots</small>
                  <strong>{num(agency.summary.depositCount)}</strong>
                  <span>Sur {monthLabel(monthKey)}</span>
                </div>
                <div className="agency-stat">
                  <small>FTD</small>
                  <strong>{num(agency.summary.ftdCount)}</strong>
                  <span>Base de calcul CPA</span>
                </div>
                <div className="agency-stat">
                  <small>Depot total</small>
                  <strong>{eur(agency.summary.totalDeposits)}</strong>
                  <span>Volume declare</span>
                </div>
                <div className="agency-stat">
                  <small>CPA visible</small>
                  <strong>{visibleMoney(agency.summary.visibleCpa, cpaVisible)}</strong>
                  <span>{cpaVisible ? "Affiche sur la page affi" : "Masque ce mois"}</span>
                </div>
                <div className="agency-stat">
                  <small>RS visible</small>
                  <strong>{visibleMoney(agency.summary.visibleRs, rsVisible)}</strong>
                  <span>{rsVisible ? "Affiche sur la page affi" : "Masque ce mois"}</span>
                </div>
                <div className="agency-stat">
                  <small>Total visible</small>
                  <strong>{visibleMoney(agency.summary.visibleTotal, hasVisibleAmounts)}</strong>
                  <span>Maj {dateTime(agency.updatedAt)}</span>
                </div>
                {canPreview ? (
                  <>
                    <div className="agency-stat">
                      <small>Marge agence</small>
                      <strong>{eur(agency.summary.agencyTotal)}</strong>
                      <span>CPA + RS agence</span>
                    </div>
                    <div className="agency-stat">
                      <small>Total genere</small>
                      <strong>{eur(agency.summary.grossTotal)}</strong>
                      <span>Net affi + marge agence</span>
                    </div>
                  </>
                ) : null}
              </div>

              <div className="agency-list">
                {agency.assignments.map((assignment) => (
                  <article key={assignment.id} className="agency-card">
                    <div className="agency-cardhead">
                      <div>
                        <h2 style={{ margin: 0, fontSize: 22 }}>
                          {assignment.casino.name} - {assignment.deal.name}
                        </h2>
                        <div className="agency-muted" style={{ marginTop: 6 }}>
                          Du {dateOnly(assignment.startDate)}
                          {assignment.endDate ? ` au ${dateOnly(assignment.endDate)}` : " sans date de fin"}
                        </div>
                      </div>
                      <span className={`agency-pill ${assignment.activeDuringMonth ? "agency-pill-ok" : "agency-pill-off"}`}>
                        {assignment.activeDuringMonth ? "Actif ce mois" : "Hors plage"}
                      </span>
                    </div>

                    <div className="agency-subgrid">
                      <div className="agency-subcard">
                        <small>Inscrits</small>
                        <strong>{num(assignment.stats.signups)}</strong>
                      </div>
                      <div className="agency-subcard">
                        <small>Nombre de depots</small>
                        <strong>{num(assignment.stats.depositCount)}</strong>
                      </div>
                      <div className="agency-subcard">
                        <small>FTD</small>
                        <strong>{num(assignment.stats.ftdCount)}</strong>
                      </div>
                      <div className="agency-subcard">
                        <small>Depot total</small>
                        <strong>{eur(assignment.stats.totalDeposits)}</strong>
                      </div>
                      <div className="agency-subcard">
                        <small>CPA</small>
                        <strong>{visibleMoney(assignment.earnings.visibleCpa, assignment.stats.showCpaToStreamer)}</strong>
                      </div>
                      <div className="agency-subcard">
                        <small>RS</small>
                        <strong>{visibleMoney(assignment.earnings.visibleRs, assignment.stats.showRsToStreamer)}</strong>
                      </div>
                      <div className="agency-subcard">
                        <small>Total visible</small>
                        <strong>
                          {visibleMoney(
                            assignment.earnings.visibleTotal,
                            assignment.stats.showCpaToStreamer || assignment.stats.showRsToStreamer
                          )}
                        </strong>
                      </div>
                      {canPreview ? (
                        <>
                          <div className="agency-subcard">
                            <small>Marge agence</small>
                            <strong>{eur(assignment.earnings.agencyTotal)}</strong>
                          </div>
                          <div className="agency-subcard">
                            <small>Total genere</small>
                            <strong>{eur(assignment.earnings.grossTotal)}</strong>
                          </div>
                        </>
                      ) : null}
                    </div>

                    <div className="agency-mini">
                      <div className="agency-muted">
                        CPA {assignment.stats.showCpaToStreamer ? "visible" : "masque"} | RS{" "}
                        {assignment.stats.showRsToStreamer ? "visible" : "masque"} | Maj {dateTime(assignment.updatedAt)}
                      </div>
                      {canPreview ? (
                        <div className="agency-muted">
                          Marge agence: CPA {eur(assignment.earnings.agencyCpa)} | RS {eur(assignment.earnings.agencyRs)}
                        </div>
                      ) : null}
                      {assignment.notes ? <div className="agency-muted">{assignment.notes}</div> : null}
                      {parseLinks(assignment.linksText).length ? (
                        <div className="agency-links">
                          {parseLinks(assignment.linksText).map((item, index) =>
                            item.url ? (
                              <a
                                key={`${item.url}-${index}`}
                                className="agency-linkbtn"
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {item.label || "Ouvrir le lien"}
                              </a>
                            ) : (
                              <span key={`${item.label}-${index}`} className="agency-pill">
                                {item.label}
                              </span>
                            )
                          )}
                        </div>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
