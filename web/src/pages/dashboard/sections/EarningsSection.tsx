import * as React from "react";
import type { ApiMyStreamer } from "../../../lib/api";
import { useAuth } from "../../../auth/AuthProvider";

const BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

type EarningsRow = {
  spend_type: string;
  spent_rubis: number;
  support_rubis: number;
  streamer_earn_rubis: number;
  platform_cut_rubis: number;
  created_at: string;
};

type EarningsResp = {
  ok: true;
  streamer: null | { id: string; slug: string; modsPercentBp: number; modsPercent: number };
  wallet: {
    availableRubis: number;
    lifetimeRubis: number;
    reservedRubis: number;
    breakdownByWeight: Record<string, number>;
  };
  last: EarningsRow[];
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE}${path}`, init);
  const text = await response.text().catch(() => "");
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) {
    const message = data?.error || data?.message || (text && text.length < 200 ? text : null) || `API ${response.status}`;
    throw new Error(String(message));
  }
  return data as T;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function fmtEur(value: number) {
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
}

function fmtInt(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.max(0, Math.floor(number)));
}

function computeWeightedValue(breakdown: Record<string, number>) {
  let valueCents = 0;
  for (const [weightRaw, amountRaw] of Object.entries(breakdown)) {
    const weight = Number(weightRaw);
    const amount = Number(amountRaw);
    if (!Number.isFinite(weight) || !Number.isFinite(amount) || weight <= 0 || amount <= 0) continue;
    valueCents += Math.floor((amount * weight) / 10_000);
  }
  return { valueCents, valueEur: valueCents / 100 };
}

function normalizeBreakdownToAvailable(source: Record<string, number>, availableRaw: number) {
  const available = Number.isFinite(availableRaw) ? Math.max(0, Math.floor(availableRaw)) : 0;
  const entries = Object.entries(source || {})
    .map(([weight, amount]) => [String(weight), Number(amount)] as const)
    .filter(([, amount]) => Number.isFinite(amount) && amount > 0);
  const sourceTotal = entries.reduce((sum, [, amount]) => sum + amount, 0);

  if (!entries.length) {
    return {
      breakdown: available > 0 ? { "0": available } : {},
      mode: available > 0 ? "added_untracked" as const : "ok" as const,
      untrackedAdded: available,
    };
  }

  if (sourceTotal > available) {
    const factor = available === 0 ? 0 : available / sourceTotal;
    const scaled = entries.map(([weight, amount]) => {
      const exact = amount * factor;
      return { weight, amount: Math.floor(exact), remainder: exact - Math.floor(exact) };
    });
    let missing = available - scaled.reduce((sum, item) => sum + item.amount, 0);
    scaled.sort((a, b) => b.remainder - a.remainder);
    for (const item of scaled) {
      if (missing <= 0) break;
      item.amount += 1;
      missing -= 1;
    }
    return {
      breakdown: Object.fromEntries(scaled.filter((item) => item.amount > 0).map((item) => [item.weight, item.amount])),
      mode: "scaled_down" as const,
      untrackedAdded: 0,
    };
  }

  const breakdown: Record<string, number> = Object.fromEntries(entries.map(([weight, amount]) => [weight, Math.floor(amount)]));
  const untrackedAdded = Math.max(0, available - sourceTotal);
  if (untrackedAdded > 0) breakdown["0"] = (breakdown["0"] || 0) + untrackedAdded;
  return {
    breakdown,
    mode: untrackedAdded > 0 ? "added_untracked" as const : "ok" as const,
    untrackedAdded,
  };
}

function simulateCashout(breakdown: Record<string, number>, centsWanted: number) {
  const entries = Object.entries(breakdown)
    .map(([weight, amount]) => [Number(weight), Number(amount)] as const)
    .filter(([weight, amount]) => Number.isFinite(weight) && Number.isFinite(amount) && weight > 0 && amount > 0)
    .sort((a, b) => b[0] - a[0]);
  const totalRubis = Object.values(breakdown).reduce((sum, amount) => sum + (Number(amount) || 0), 0);
  let remainingCents = Math.max(0, Math.floor(centsWanted));
  let rubisSpent = 0;
  let centsCovered = 0;

  for (const [weight, amount] of entries) {
    if (remainingCents <= 0) break;
    const bucketCents = Math.floor((amount * weight) / 10_000);
    if (bucketCents <= 0) continue;
    const target = Math.min(remainingCents, bucketCents);
    const needed = Math.min(amount, Math.ceil((target * 10_000) / weight));
    const covered = Math.floor((needed * weight) / 10_000);
    if (covered <= 0) continue;
    rubisSpent += needed;
    centsCovered += covered;
    remainingCents -= covered;
  }

  return {
    rubisSpent,
    remainingRubis: Math.max(0, Math.floor(totalRubis) - rubisSpent),
    eurCovered: centsCovered / 100,
    canCover: remainingCents <= 0 && centsWanted > 0,
  };
}

const WEIGHT_LABELS: Record<number, string> = {
  10000: "Rubis achetes",
  3500: "Temps de visionnage",
  3000: "Roue et succes",
  2500: "Coffre automatique",
  2000: "Coffre et dons streamer",
  1000: "Evenements plateforme",
  0: "Non classes",
};

function sourceLabel(source: string) {
  const value = String(source || "").toLowerCase();
  if (value.includes("sub")) return "Abonnement";
  if (value.includes("tip") || value.includes("don")) return "Don";
  if (value.includes("event")) return "Evenement";
  return source || "Autre";
}

function RevenueMetric({ label, value, note, accent = false }: {
  label: string;
  value: React.ReactNode;
  note: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={`earnings-metric${accent ? " is-accent" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

export function EarningsSection({ streamer }: { streamer: ApiMyStreamer }) {
  const auth = useAuth() as any;
  const token = auth?.token ?? null;
  const [loading, setLoading] = React.useState(true);
  const [data, setData] = React.useState<EarningsResp | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [cashoutEur, setCashoutEur] = React.useState("");
  const [modsPct, setModsPct] = React.useState(0);
  const [modsSaving, setModsSaving] = React.useState(false);
  const [modsError, setModsError] = React.useState<string | null>(null);
  const [modsSaved, setModsSaved] = React.useState(false);

  const reload = React.useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const result = await request<EarningsResp>("/streamer/me/earnings", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(result);
      setModsPct(clamp(Number(result.streamer?.modsPercent || 0), 0, 100));
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Impossible de charger les revenus.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  React.useEffect(() => { void reload(); }, [reload]);

  const apiAvailable = Number(data?.wallet?.availableRubis);
  const available = Number.isFinite(apiAvailable) ? Math.max(0, Math.floor(apiAvailable)) : Number(auth?.user?.rubis || 0);
  const normalized = normalizeBreakdownToAvailable(data?.wallet?.breakdownByWeight || {}, available);
  const breakdown = normalized.breakdown;
  const weighted = computeWeightedValue(breakdown);
  const lifetime = Math.max(0, Math.floor(Number(data?.wallet?.lifetimeRubis || 0)));
  const reserved = Math.max(0, Math.floor(Number(data?.wallet?.reservedRubis || 0)));
  const classified = Object.entries(breakdown).reduce((sum, [weight, amount]) => Number(weight) > 0 ? sum + Number(amount) : sum, 0);
  const classifiedPct = available > 0 ? Math.round((classified / available) * 100) : 0;
  const weightEntries = Object.entries(breakdown)
    .map(([weight, amount]) => [Number(weight), Number(amount)] as const)
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[0] - a[0]);

  const buckets = { sub: 0, tip: 0, event: 0, other: 0 };
  for (const row of data?.last || []) {
    const source = String(row.spend_type || "").toLowerCase();
    const amount = Math.max(0, Number(row.streamer_earn_rubis) || 0);
    if (source.includes("sub")) buckets.sub += amount;
    else if (source.includes("tip") || source.includes("don")) buckets.tip += amount;
    else if (source.includes("event")) buckets.event += amount;
    else buckets.other += amount;
  }
  const maxBucket = Math.max(1, ...Object.values(buckets));
  const wanted = Number(String(cashoutEur).replace(",", "."));
  const wantedCents = Number.isFinite(wanted) && wanted > 0 ? Math.round(wanted * 100) : 0;
  const cashout = wantedCents > 0 ? simulateCashout(breakdown, wantedCents) : null;

  async function saveModsPercent() {
    if (!token) return;
    setModsSaving(true);
    setModsError(null);
    setModsSaved(false);
    try {
      await request("/streamer/me/mods-percent", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ percent: clamp(Number(modsPct), 0, 100) }),
      });
      setModsSaved(true);
      await reload();
    } catch (saveError: unknown) {
      setModsError(saveError instanceof Error ? saveError.message : "Enregistrement impossible.");
    } finally {
      setModsSaving(false);
    }
  }

  return (
    <div className="earnings-dashboard">
      <div className="earnings-toolbar">
        <div>
          <div className="panelTitle">Revenus de @{streamer.slug}</div>
          <div className="mutedSmall">Soldes et transactions calcules directement depuis le portefeuille LunaLive.</div>
        </div>
        <button type="button" className="btnGhost" onClick={() => void reload()} disabled={loading}>
          {loading ? "Actualisation..." : "Actualiser"}
        </button>
      </div>

      {error ? <div className="dash-alert" role="alert">{error}</div> : null}

      <section className="earnings-primary-grid" aria-label="Synthese des revenus">
        <RevenueMetric accent label="Solde disponible" value={loading && !data ? "..." : `${fmtInt(available)} rubis`} note="Solde API utilisable" />
        <RevenueMetric label="Valeur estimee" value={loading && !data ? "..." : fmtEur(weighted.valueEur)} note={`${classifiedPct} % du solde est valorisable`} />
        <RevenueMetric label="Rubis recus au total" value={loading && !data ? "..." : fmtInt(lifetime)} note="Cumul historique" />
        <RevenueMetric label="Montant reserve" value={loading && !data ? "..." : `${fmtInt(reserved)} rubis`} note="Deja immobilise" />
      </section>

      {normalized.mode !== "ok" ? (
        <div className="earnings-notice">
          {normalized.mode === "scaled_down"
            ? "La repartition technique depassait le solde reel : elle a ete ramenee au solde API sans creer de rubis."
            : `${fmtInt(normalized.untrackedAdded)} rubis ne sont pas classes et restent exclus de l'estimation en euros.`}
        </div>
      ) : null}

      <section className="earnings-layout">
        <article className="earnings-card">
          <div className="earnings-card-head">
            <div><span>Composition du solde</span><strong>Valeur par provenance</strong></div>
            <span className="earnings-pill">{fmtInt(classified)} classes</span>
          </div>
          <div className="earnings-weight-list">
            {weightEntries.length ? weightEntries.map(([weight, amount]) => {
              const pct = available > 0 ? Math.max(2, (amount / available) * 100) : 0;
              return (
                <div className="earnings-weight-row" key={weight}>
                  <div><strong>{WEIGHT_LABELS[weight] || `Poids ${(weight / 10_000).toFixed(2)}`}</strong><span>{fmtInt(amount)} rubis</span></div>
                  <div className="earnings-progress"><span style={{ width: `${Math.min(100, pct)}%` }} /></div>
                  <small>{weight > 0 ? `${(weight / 10_000).toFixed(2)} centime par rubis` : "Non valorise"}</small>
                </div>
              );
            }) : <div className="earnings-empty">Aucun solde a repartir.</div>}
          </div>
        </article>

        <article className="earnings-card">
          <div className="earnings-card-head">
            <div><span>Equipe</span><strong>Part des moderateurs</strong></div>
            <span className="earnings-pill">{modsPct.toFixed(1)} %</span>
          </div>
          <p className="earnings-card-copy">Definis la part attribuee a ton equipe de moderation sur les revenus concernes.</p>
          <input className="earnings-range" type="range" min={0} max={100} step={0.5} value={modsPct} onChange={(event) => { setModsPct(clamp(Number(event.target.value), 0, 100)); setModsSaved(false); }} />
          <div className="earnings-range-scale"><span>0 %</span><span>50 %</span><span>100 %</span></div>
          <div className="earnings-actions">
            <button type="button" className="btnPrimarySmall" disabled={modsSaving} onClick={() => void saveModsPercent()}>{modsSaving ? "Enregistrement..." : "Enregistrer la part"}</button>
            {modsSaved ? <span className="earnings-success">Enregistre</span> : null}
            {modsError ? <span className="earnings-error">{modsError}</span> : null}
          </div>
        </article>

        <article className="earnings-card">
          <div className="earnings-card-head">
            <div><span>Projection</span><strong>Simuler un retrait</strong></div>
            <span className="earnings-pill">Max. {fmtEur(weighted.valueEur)}</span>
          </div>
          <p className="earnings-card-copy">Cette simulation utilise d'abord les rubis au poids le plus eleve. Elle n'envoie aucune demande de paiement.</p>
          <label className="earnings-amount-field">
            <span>Montant souhaite</span>
            <div><input inputMode="decimal" value={cashoutEur} onChange={(event) => setCashoutEur(event.target.value)} placeholder="0,00" /><b>EUR</b></div>
          </label>
          {cashout ? (
            <div className={`earnings-simulation${cashout.canCover ? " is-valid" : " is-warning"}`}>
              <div><span>Montant couvert</span><strong>{fmtEur(cashout.eurCovered)}</strong></div>
              <div><span>Rubis estimes</span><strong>{fmtInt(cashout.rubisSpent)}</strong></div>
              <div><span>Solde restant</span><strong>{fmtInt(cashout.remainingRubis)}</strong></div>
              {!cashout.canCover ? <p>Le solde valorisable ne couvre pas ce montant.</p> : null}
            </div>
          ) : <div className="earnings-empty">Saisis un montant pour obtenir une estimation.</div>}
        </article>

        <article className="earnings-card">
          <div className="earnings-card-head"><div><span>30 dernieres transactions</span><strong>Origine des revenus</strong></div></div>
          <div className="earnings-source-list">
            {([ ["sub", "Abonnements"], ["tip", "Dons"], ["event", "Evenements"], ["other", "Autres"] ] as const).map(([key, label]) => (
              <div key={key}>
                <div><span>{label}</span><strong>{fmtInt(buckets[key])} rubis</strong></div>
                <div className="earnings-progress"><span style={{ width: `${Math.round((buckets[key] / maxBucket) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="earnings-transactions">
        <div className="earnings-card-head">
          <div><span>Activite recente</span><strong>Dernieres entrees</strong></div>
          <span className="earnings-pill">{Math.min(10, data?.last?.length || 0)} affichees</span>
        </div>
        <div className="earnings-table-wrap">
          <table>
            <thead><tr><th>Origine</th><th>Date</th><th>Revenu streamer</th><th>Part plateforme</th><th>Total utilise</th></tr></thead>
            <tbody>
              {(data?.last || []).slice(0, 10).map((row, index) => (
                <tr key={`${row.created_at}-${index}`}>
                  <td><strong>{sourceLabel(row.spend_type)}</strong><small>{row.spend_type}</small></td>
                  <td>{new Date(row.created_at).toLocaleString("fr-FR")}</td>
                  <td className="is-positive">+ {fmtInt(row.streamer_earn_rubis)}</td>
                  <td>{fmtInt(row.platform_cut_rubis)}</td>
                  <td>{fmtInt(row.spent_rubis)}</td>
                </tr>
              ))}
              {!loading && !(data?.last || []).length ? <tr><td colSpan={5}><div className="earnings-empty">Aucune transaction recente.</div></td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="stats-footnote">La valeur en euros est une estimation prudente fondee uniquement sur les rubis classes. Le solde affiche provient toujours de l'API LunaLive.</div>
    </div>
  );
}
