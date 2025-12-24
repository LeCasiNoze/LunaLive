// web/src/components/Dashboard/sections/EarningsSection.tsx
import * as React from "react";
import type { ApiMyStreamer } from "../../../lib/api";
import { useAuth } from "../../../auth/AuthProvider";

const BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

type EarningsResp = {
  ok: true;
  streamer: null | {
    id: string;
    slug: string;
    modsPercentBp: number;
    modsPercent: number; // ex: 12.5
  };
  wallet: {
    availableRubis: number;
    lifetimeRubis: number;
    reservedRubis: number;
    breakdownByWeight: Record<string, number>; // { "10000": 123, "3500": 45 }
  };
  last: Array<{
    spend_type: string;
    spent_rubis: number;
    support_rubis: number;
    streamer_earn_rubis: number;
    platform_cut_rubis: number;
    created_at: string;
  }>;
};

async function j<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${BASE}${path}`, init);
  const text = await r.text().catch(() => "");
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!r.ok) {
    const msg = data?.error || data?.message || (text && text.length < 200 ? text : null) || `API ${r.status}`;
    throw new Error(String(msg));
  }
  return data as T;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function fmtEur(n: number) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ✅ valeur € pondérée (1 rubis @ weight=1.00 => 0.01€)
function computeWeightedValue(breakdownByWeight: Record<string, number> | null | undefined) {
  let totalRubis = 0;
  let valueCents = 0;

  for (const [wStr, amtRaw] of Object.entries(breakdownByWeight || {})) {
    const weightBp = Number(wStr);
    const amt = Number(amtRaw);
    if (!Number.isFinite(weightBp) || !Number.isFinite(amt) || amt <= 0) continue;

    totalRubis += amt;
    valueCents += Math.floor((amt * weightBp) / 10000);
  }

  return { totalRubis, valueCents, valueEur: valueCents / 100 };
}

/**
 * ✅ Estimation cashout:
 * - le streamer demande un montant en € (cents)
 * - on “retire” des rubis en priorité des poids élevés (comme dans l’économie)
 * - on estime combien de rubis seront consommés + combien resteront
 */
function simulateCashout(
  breakdownByWeight: Record<string, number> | null | undefined,
  centsWanted: number
) {
  const entries = Object.entries(breakdownByWeight || {})
    .map(([w, v]) => [Number(w), Number(v)] as const)
    .filter(([w, v]) => Number.isFinite(w) && Number.isFinite(v) && v > 0)
    .sort((a, b) => b[0] - a[0]); // poids élevés d'abord

  const totalRubis = entries.reduce((acc, [, v]) => acc + v, 0);
  let remainingCents = Math.max(0, Math.floor(centsWanted));

  let rubisSpent = 0;
  let centsCovered = 0;

  for (const [wBp, amt] of entries) {
    if (remainingCents <= 0) break;

    const maxCentsFromBucket = Math.floor((amt * wBp) / 10000);
    if (maxCentsFromBucket <= 0) continue;

    const targetCentsHere = Math.min(remainingCents, maxCentsFromBucket);

    // rubis minimal pour atteindre au moins targetCentsHere (avec le floor)
    let needRubis = Math.ceil((targetCentsHere * 10000) / wBp);
    needRubis = Math.min(needRubis, amt);

    const gotCents = Math.floor((needRubis * wBp) / 10000);
    if (gotCents <= 0) continue;

    rubisSpent += needRubis;
    centsCovered += gotCents;
    remainingCents -= gotCents;
  }

  const canCover = remainingCents <= 0 && centsWanted > 0;
  const remainingRubis = Math.max(0, totalRubis - rubisSpent);

  return {
    totalRubis,
    rubisSpent,
    remainingRubis,
    centsCovered,
    eurCovered: centsCovered / 100,
    canCover,
    remainingCents,
  };
}

const WEIGHT_HELP: Array<{ bp: number; label: string }> = [
  { bp: 10000, label: "Top-up (rubis achetés)" },
  { bp: 3500, label: "Farm watch (watchtime)" },
  { bp: 3000, label: "Roue quotidienne / achievements" },
  { bp: 2500, label: "Coffre auto" },
  { bp: 2000, label: "Coffre streamer / dons streamers" },
  { bp: 1000, label: "Événements plateforme" },
];

function InfoTip({
  open,
  onToggle,
  title,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <button
        type="button"
        onClick={onToggle}
        aria-label="Information"
        title={title ?? "Info"}
        style={{
          width: 18,
          height: 18,
          borderRadius: 999,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 900,
          color: "rgba(255,255,255,0.9)",
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.12)",
          cursor: "pointer",
          lineHeight: 1,
        }}
      >
        i
      </button>

      {open ? (
        <div
          style={{
            position: "absolute",
            top: 26,
            right: 0,
            width: 360,
            maxWidth: "min(360px, 80vw)",
            padding: 12,
            borderRadius: 12,
            background: "rgba(10,10,14,0.95)",
            border: "1px solid rgba(255,255,255,0.12)",
            boxShadow: "0 12px 36px rgba(0,0,0,0.35)",
            zIndex: 50,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
            <div style={{ fontWeight: 900, fontSize: 12, color: "rgba(255,255,255,0.92)" }}>
              {title ?? "Info"}
            </div>
            <button
              type="button"
              onClick={onToggle}
              className="btnPrimarySmall"
              style={{ padding: "4px 8px" }}
            >
              Fermer
            </button>
          </div>
          <div className="mutedSmall" style={{ marginTop: 8, lineHeight: 1.4 }}>
            {children}
          </div>
        </div>
      ) : null}
    </span>
  );
}

export function EarningsSection({ streamer }: { streamer: ApiMyStreamer }) {
  const auth = useAuth() as any;
  const token = auth?.token ?? null;

  const [loading, setLoading] = React.useState(true);
  const [data, setData] = React.useState<EarningsResp | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // 💸 Cashout input
  const [cashoutEur, setCashoutEur] = React.useState<string>("");
  const eurWanted = Number(String(cashoutEur).replace(",", "."));
  const isEurValid = Number.isFinite(eurWanted) && eurWanted > 0;

  // 👮‍♂️ Mods %
  const [modsPct, setModsPct] = React.useState<number>(0);
  const [modsSaving, setModsSaving] = React.useState(false);
  const [modsError, setModsError] = React.useState<string | null>(null);

  // ℹ️ tooltips
  const [weightsInfoOpen, setWeightsInfoOpen] = React.useState(false);

  const reload = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const r = await j<EarningsResp>("/streamer/me/earnings", {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      setData(r);

      const pct = Number(r?.streamer?.modsPercent ?? 0);
      setModsPct(Number.isFinite(pct) ? clamp(pct, 0, 100) : 0);
    } catch (e: any) {
      setError(String(e?.message || "Erreur"));
    } finally {
      setLoading(false);
    }
  }, [token]);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      if (!mounted) return;
      await reload();
    })();
    return () => {
      mounted = false;
    };
  }, [reload]);

  const breakdownByWeight = data?.wallet?.breakdownByWeight ?? {};
  const weighted = React.useMemo(
    () => computeWeightedValue(breakdownByWeight),
    [JSON.stringify(breakdownByWeight)]
  );

  // ✅ solde dispo : priorité API, sinon fallback user
  const available =
    Number(data?.wallet?.availableRubis ?? 0) > 0
      ? Number(data?.wallet?.availableRubis ?? 0)
      : Number(auth?.user?.rubis ?? 0);

  // ✅ € : priorité au calcul pondéré, sinon fallback “1.00”
  const approxEur = weighted.valueCents > 0 ? weighted.valueEur : available / 100;

  const lifetime = Number(data?.wallet?.lifetimeRubis ?? 0);
  const reserved = Number(data?.wallet?.reservedRubis ?? 0);

  const weightEntries = Object.entries(breakdownByWeight)
    .map(([w, v]) => [Number(w), Number(v)] as const)
    .filter(([w, v]) => Number.isFinite(w) && Number.isFinite(v) && v > 0)
    .sort((a, b) => b[0] - a[0]);

  // provenance (dernières 30 entrées)
  const buckets = React.useMemo(() => {
    const out = { sub: 0, tip: 0, event: 0, other: 0 };
    for (const row of data?.last ?? []) {
      const t = String(row.spend_type || "").toLowerCase();
      const v = Number(row.streamer_earn_rubis ?? 0);
      if (t.includes("sub")) out.sub += v;
      else if (t.includes("tip") || t.includes("don")) out.tip += v;
      else if (t.includes("event")) out.event += v;
      else out.other += v;
    }
    return out;
  }, [data]);

  const maxBucket = Math.max(1, ...Object.values(buckets));

  // Estimation cashout
  const wantedCents = isEurValid ? Math.round(eurWanted * 100) : 0;
  const cashoutSim = React.useMemo(() => {
    if (!wantedCents) return null;
    return simulateCashout(breakdownByWeight, wantedCents);
  }, [wantedCents, JSON.stringify(breakdownByWeight)]);

  const maxCashoutEur = weighted.valueEur > 0 ? weighted.valueEur : approxEur;

  return (
    <div className="panel">
      <div className="panelTitle">Revenus</div>
      <div className="mutedSmall">Chaîne : @{streamer.slug}</div>

      {loading ? <div className="muted" style={{ marginTop: 10 }}>Chargement…</div> : null}
      {error ? (
        <div className="mutedSmall" style={{ marginTop: 10, color: "rgba(255,90,90,0.95)" }}>
          {error}
        </div>
      ) : null}

      {!loading && data?.ok ? (
        <>
          {/* 1) ✅ Part des modos (slider) */}
          <div className="panel" style={{ marginTop: 12 }}>
            <div className="mutedSmall" style={{ marginBottom: 6 }}>
              Part des modos
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ fontWeight: 950, fontSize: 18 }}>{modsPct.toFixed(1)}%</div>
                <div className="mutedSmall" style={{ opacity: 0.8 }}>
                  (0% → 100%)
                </div>
              </div>

              <input
                type="range"
                min={0}
                max={100}
                step={0.5}
                value={modsPct}
                onChange={(e) => setModsPct(clamp(Number(e.target.value), 0, 100))}
                style={{ width: "100%" }}
              />

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btnPrimarySmall"
                  disabled={modsSaving}
                  onClick={async () => {
                    if (!token) return;
                    setModsError(null);

                    const pct = clamp(Number(modsPct), 0, 100);
                    if (!Number.isFinite(pct)) {
                      setModsError("Valeur invalide.");
                      return;
                    }

                    setModsSaving(true);
                    try {
                      await j("/streamer/me/mods-percent", {
                        method: "POST",
                        headers: {
                          Authorization: `Bearer ${token}`,
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify({ percent: pct }),
                      });
                      await reload();
                    } catch (e: any) {
                      setModsError(String(e?.message || "Erreur"));
                    } finally {
                      setModsSaving(false);
                    }
                  }}
                >
                  {modsSaving ? "…" : "Enregistrer"}
                </button>

                <div className="mutedSmall" style={{ opacity: 0.8 }}>
                  Actuel:{" "}
                  <strong style={{ color: "rgba(255,255,255,0.9)" }}>
                    {Number(data?.streamer?.modsPercent ?? 0).toLocaleString()}%
                  </strong>
                </div>
              </div>

              {modsError ? (
                <div className="mutedSmall" style={{ marginTop: 2, color: "rgba(255,90,90,0.95)" }}>
                  {modsError}
                </div>
              ) : null}
            </div>
          </div>

          {/* 2) ✅ Solde + Répartition + info */}
          <div className="panel" style={{ marginTop: 12 }}>
            <div className="mutedSmall">Solde du streamer</div>
            <div style={{ fontWeight: 950, fontSize: 22, marginTop: 2 }}>
              {available.toLocaleString()} rubis
            </div>

            <div className="mutedSmall" style={{ marginTop: 6 }}>
              Valeur estimée (pondérée) :{" "}
              <strong style={{ color: "rgba(255,255,255,0.9)" }}>{fmtEur(approxEur)} €</strong>
            </div>

            <div className="mutedSmall" style={{ marginTop: 6, opacity: 0.8 }}>
              Lifetime:{" "}
              <strong style={{ color: "rgba(255,255,255,0.9)" }}>{lifetime.toLocaleString()}</strong>{" "}
              • Réservé cashout:{" "}
              <strong style={{ color: "rgba(255,255,255,0.9)" }}>{reserved.toLocaleString()}</strong>
            </div>

            <div
              style={{
                height: 1,
                background: "rgba(255,255,255,0.08)",
                margin: "12px 0",
              }}
            />

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div className="mutedSmall" style={{ marginBottom: 4 }}>
                Répartition du solde (poids → rubis)
              </div>
              <InfoTip
                open={weightsInfoOpen}
                onToggle={() => setWeightsInfoOpen((v) => !v)}
                title="À propos des poids"
              >
                <div>
                  Chaque rubis n’a pas la même valeur selon sa provenance.
                  <br />
                  Le <strong>poids</strong> représente la “valeur de soutien” :
                  <br />
                  <span style={{ opacity: 0.9 }}>
                    • poids 1.00 ⇒ 1 rubis ≈ 0.01€<br />
                    • poids 0.35 ⇒ 1 rubis ≈ 0.0035€
                  </span>
                  <div style={{ marginTop: 10, fontWeight: 900, opacity: 0.9 }}>Repères (indicatifs)</div>
                  <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                    {WEIGHT_HELP.map((x) => (
                      <div key={x.bp} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <span style={{ opacity: 0.9 }}>{x.label}</span>
                        <span style={{ fontWeight: 900, opacity: 0.95 }}>{(x.bp / 10000).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 10, opacity: 0.9 }}>
                    (Le cashout retire en priorité les rubis au poids le plus élevé.)
                  </div>
                </div>
              </InfoTip>
            </div>

            {weightEntries.length ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                {weightEntries.map(([w, v]) => (
                  <div
                    key={String(w)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      fontSize: 12,
                    }}
                    title={`weight_bp=${w}`}
                  >
                    <strong>{(w / 10000).toFixed(2)}</strong> → {v.toLocaleString()}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mutedSmall" style={{ opacity: 0.75, marginTop: 6 }}>—</div>
            )}
          </div>

          {/* 3) ✅ Cashout */}
          <div className="panel" style={{ marginTop: 12 }}>
            <div className="mutedSmall" style={{ marginBottom: 6 }}>Cashout</div>

            <div className="mutedSmall" style={{ opacity: 0.85, lineHeight: 1.4 }}>
              Tu demandes un retrait en <strong>€</strong>. Le site retire des rubis de ton portefeuille{" "}
              <strong>en priorité sur les poids élevés</strong> (ceux qui “valent” le plus).
            </div>

            <div className="mutedSmall" style={{ marginTop: 8 }}>
              Valeur pondérée max estimée :{" "}
              <strong style={{ color: "rgba(255,255,255,0.9)" }}>{fmtEur(maxCashoutEur)} €</strong>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
              <input
                value={cashoutEur}
                onChange={(e) => setCashoutEur(e.target.value)}
                placeholder="Montant en € (ex: 45)"
                className="input"
                style={{ flex: 1 }}
              />

              <button
                type="button"
                className="btnPrimarySmall"
                disabled={!isEurValid}
                onClick={() => {
                  alert("Cashout API à brancher (tu l'as déjà côté backend).");
                }}
              >
                Demander
              </button>
            </div>

            {/* estimation */}
            <div style={{ marginTop: 10 }}>
              {!isEurValid ? (
                <div className="mutedSmall" style={{ opacity: 0.75 }}>
                  Saisis un montant pour voir l’estimation (rubis retirés / rubis restants).
                </div>
              ) : (
                <>
                  {cashoutSim ? (
                    <>
                      <div className="mutedSmall" style={{ opacity: 0.9 }}>
                        Montant demandé :{" "}
                        <strong style={{ color: "rgba(255,255,255,0.92)" }}>{fmtEur(eurWanted)} €</strong>
                        {" "}• Couvert estimé :{" "}
                        <strong style={{ color: "rgba(255,255,255,0.92)" }}>{fmtEur(cashoutSim.eurCovered)} €</strong>
                      </div>

                      <div className="mutedSmall" style={{ marginTop: 6, opacity: 0.9 }}>
                        Rubis retirés (estimation) :{" "}
                        <strong style={{ color: "rgba(255,255,255,0.92)" }}>{cashoutSim.rubisSpent.toLocaleString()}</strong>
                        {" "}• Rubis restants :{" "}
                        <strong style={{ color: "rgba(255,255,255,0.92)" }}>{cashoutSim.remainingRubis.toLocaleString()}</strong>
                      </div>

                      {!cashoutSim.canCover ? (
                        <div className="mutedSmall" style={{ marginTop: 8, color: "rgba(255,180,90,0.95)" }}>
                          Solde pondéré insuffisant pour couvrir ce montant (max ≈ {fmtEur(maxCashoutEur)} €).
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </>
              )}
            </div>
          </div>

          {/* 4) ✅ Provenance (sub/tip/event/other) */}
          <div className="panel" style={{ marginTop: 12 }}>
            <div className="mutedSmall" style={{ marginBottom: 8 }}>
              Provenance des rubis (30 dernières entrées)
            </div>

            {(["sub", "tip", "event", "other"] as const).map((k) => {
              const v = (buckets as any)[k] as number;
              const pct = Math.round((v / maxBucket) * 100);
              return (
                <div key={k} style={{ marginBottom: 10 }}>
                  <div className="mutedSmall" style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{k.toUpperCase()}</span>
                    <span>
                      <strong style={{ color: "rgba(255,255,255,0.9)" }}>{v.toLocaleString()}</strong> rubis
                    </span>
                  </div>
                  <div style={{ height: 10, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "rgba(255,255,255,0.25)" }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* (optionnel) Dernières entrées */}
          <div className="panel" style={{ marginTop: 12 }}>
            <div className="mutedSmall" style={{ marginBottom: 8 }}>Dernières entrées</div>
            <div style={{ display: "grid", gap: 8 }}>
              {(data.last ?? []).slice(0, 10).map((row, i) => (
                <div key={i} className="panel" style={{ padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 900 }}>{String(row.spend_type)}</div>
                    <div className="mutedSmall">{new Date(row.created_at).toLocaleString()}</div>
                  </div>
                  <div className="mutedSmall" style={{ marginTop: 6 }}>
                    Earn:{" "}
                    <strong style={{ color: "rgba(255,255,255,0.9)" }}>
                      {Number(row.streamer_earn_rubis ?? 0).toLocaleString()}
                    </strong>{" "}
                    • Platform: {Number(row.platform_cut_rubis ?? 0).toLocaleString()} • Spent:{" "}
                    {Number(row.spent_rubis ?? 0).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
