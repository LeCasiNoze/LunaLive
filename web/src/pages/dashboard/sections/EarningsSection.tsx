import * as React from "react";
import type { ApiMyStreamer } from "../../../lib/api";
import { useAuth } from "../../../auth/AuthProvider";

const BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");
const RUBIS_PER_EUR = 100;

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

function eurFromRubisValue(rubisValue: number) {
  return rubisValue / RUBIS_PER_EUR;
}

export function EarningsSection({ streamer }: { streamer: ApiMyStreamer }) {
  const auth = useAuth() as any;
  const token = auth?.token ?? null;

  const [loading, setLoading] = React.useState(true);
  const [data, setData] = React.useState<EarningsResp | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [cashoutEur, setCashoutEur] = React.useState<string>("");

  // mods %
  const [modsPct, setModsPct] = React.useState<string>("0");
  const [modsSaving, setModsSaving] = React.useState(false);
  const [modsError, setModsError] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const r = await j<EarningsResp>("/streamer/me/earnings", {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      setData(r);

      const pct = Number(r?.streamer?.modsPercent ?? 0);
      setModsPct(String(Number.isFinite(pct) ? pct : 0));
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

  const available = Number(data?.wallet?.availableRubis ?? 0);
  const lifetime = Number(data?.wallet?.lifetimeRubis ?? 0);
  const reserved = Number(data?.wallet?.reservedRubis ?? 0);

  const approxEur = eurFromRubisValue(available);

  const eurWanted = Number(String(cashoutEur).replace(",", "."));
  const isEurValid = Number.isFinite(eurWanted) && eurWanted > 0;

  const breakdownByWeight = data?.wallet?.breakdownByWeight ?? {};
  const weightEntries = Object.entries(breakdownByWeight)
    .map(([w, v]) => [Number(w), Number(v)] as const)
    .filter(([w, v]) => Number.isFinite(w) && Number.isFinite(v) && v > 0)
    .sort((a, b) => b[0] - a[0]);

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
          <div className="panel" style={{ marginTop: 12 }}>
            <div className="mutedSmall">Solde dispo</div>
            <div style={{ fontWeight: 950, fontSize: 22 }}>{available.toLocaleString()} rubis</div>

            <div className="mutedSmall" style={{ marginTop: 6 }}>
              Équivalence affichée (indicative) :{" "}
              <strong style={{ color: "rgba(255,255,255,0.9)" }}>{approxEur.toFixed(2)} €</strong>
            </div>

            <div className="mutedSmall" style={{ marginTop: 6, opacity: 0.8 }}>
              Lifetime: <strong style={{ color: "rgba(255,255,255,0.9)" }}>{lifetime.toLocaleString()}</strong> •
              Réservé cashout: <strong style={{ color: "rgba(255,255,255,0.9)" }}>{reserved.toLocaleString()}</strong>
            </div>
          </div>

          {/* ✅ Répartition du solde (poids -> rubis) */}
          <div className="panel" style={{ marginTop: 12 }}>
            <div className="mutedSmall" style={{ marginBottom: 8 }}>Répartition du solde (poids → rubis)</div>

            {weightEntries.length ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
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
              <div className="mutedSmall" style={{ opacity: 0.75 }}>—</div>
            )}
          </div>

          {/* ✅ % modos */}
          <div className="panel" style={{ marginTop: 12 }}>
            <div className="mutedSmall" style={{ marginBottom: 6 }}>Part des modos (%)</div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <input
                value={modsPct}
                onChange={(e) => setModsPct(e.target.value)}
                className="input"
                inputMode="decimal"
                placeholder="ex: 12.5"
                style={{ width: 140 }}
              />

              <button
                type="button"
                className="btnPrimarySmall"
                disabled={modsSaving}
                onClick={async () => {
                  if (!token) return;

                  setModsError(null);
                  const pct = Number(String(modsPct).replace(",", "."));
                  if (!Number.isFinite(pct) || pct < 0) {
                    setModsError("Montant invalide.");
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
              <div className="mutedSmall" style={{ marginTop: 8, color: "rgba(255,90,90,0.95)" }}>
                {modsError}
              </div>
            ) : null}
          </div>

          {/* Répartition 30 dernières entrées (déjà ok) */}
          <div className="panel" style={{ marginTop: 12 }}>
            <div className="mutedSmall" style={{ marginBottom: 8 }}>Répartition (30 dernières entrées)</div>

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

          <div className="panel" style={{ marginTop: 12 }}>
            <div className="mutedSmall">Cashout (MVP UI)</div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
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
          </div>

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
