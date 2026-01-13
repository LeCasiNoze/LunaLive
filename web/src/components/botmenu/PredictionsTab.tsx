// web/src/components/botmenu/PredictionsTab.tsx
import * as React from "react";

function apiBase() {
  return (import.meta as any).env?.VITE_API_BASE || "https://lunalive-api.onrender.com";
}

type Props = {
  token: string | null;
  slug: string;
  canMod: boolean;
  onRequireLogin: () => void;
};

type ApiPrediction = {
  id: number;
  question: string;
  option1_label: string;
  option2_label: string;
  fixed_stake: number;
  status: "open" | "locked" | "resolved";
  total_pool_1: number;
  total_pool_2: number;
};

type StakeStatus = {
  ok: boolean;
  level: number;
  allowed: number[];
  selected: number;
  reason?: string;
};

export function PredictionsTab({ token, slug, canMod, onRequireLogin }: Props) {
  const [pred, setPred] = React.useState<ApiPrediction | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const [isLive, setIsLive] = React.useState<boolean | null>(null);

  const [stake, setStake] = React.useState<number>(10);
  const [allowedStakes, setAllowedStakes] = React.useState<number[]>([10]);
  const [stakeLevel, setStakeLevel] = React.useState<number>(0);

  async function api<T>(url: string, body?: any): Promise<T> {
    const r = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return r.json();
  }

  async function loadStakeStatus() {
    if (!token) {
      setAllowedStakes([10]);
      setStake(10);
      setStakeLevel(0);
      return;
    }
    try {
      const r = await api<StakeStatus>(`${apiBase()}/api/bot/predictions/stake`);
      if (r?.ok) {
        setAllowedStakes(Array.isArray(r.allowed) && r.allowed.length ? r.allowed : [10]);
        setStake(Number(r.selected || 10));
        setStakeLevel(Number(r.level || 0));
      }
    } catch {}
  }

  async function setStakeRemote(v: number) {
    if (!token) return onRequireLogin();
    try {
      const r = await api<any>(`${apiBase()}/api/bot/predictions/stake`, { stake: v });
      if (r?.ok) {
        setStake(Number(r.selected || v));
        setAllowedStakes(Array.isArray(r.allowed) && r.allowed.length ? r.allowed : [10]);
        setStakeLevel(Number(r.level || 0));
      } else {
        setToast("Mise non autorisée");
      }
    } catch {
      setToast("Erreur mise");
    }
  }

  async function loadAll() {
    try {
      const liveRes = await api<any>(`${apiBase()}/api/streamers/${encodeURIComponent(slug)}/live`);
      setIsLive(!!liveRes?.isLive);

      const predRes = await api<any>(
        `${apiBase()}/api/bot/predictions/current?streamerSlug=${encodeURIComponent(slug)}`
      );

      setPred(predRes?.ok ? (predRes.prediction as ApiPrediction) : null);
    } catch {
      // silencieux
    }
  }

  React.useEffect(() => {
    void loadStakeStatus();
    void loadAll();
    const id = window.setInterval(loadAll, 2000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, slug]);

  async function bet(choice: 1 | 2) {
    if (!token) return onRequireLogin();

    const r = await api<any>(`${apiBase()}/api/bot/predictions/bet`, {
      streamerSlug: slug,
      choice,
      stake,
    });

    if (!r?.ok) {
      setToast(r?.reason === "not_enough_rubis" ? "Pas assez de rubis" : "Pari refusé");
    } else {
      setToast(`Pari accepté (${r.stake} rubis)`);
      // si backend corrige stake (fallback), on resync
      if (Number.isFinite(Number(r.stake))) setStake(Number(r.stake));
    }
  }

  const canChangeStake = allowedStakes.length > 1;

  return (
    <div style={{ padding: 16 }}>
      {/* 🔒 MOD UI */}
      {canMod && (
        <div
          style={{
            marginBottom: 12,
            padding: 10,
            borderRadius: 12,
            border: "1px dashed rgba(255,255,255,0.2)",
            fontSize: 12,
          }}
        >
          {!isLive ? (
            <div>🔴 Les prédictions sont disponibles uniquement en live</div>
          ) : !pred ? (
            <button
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: "none",
                fontWeight: 900,
                cursor: "pointer",
              }}
              onClick={() => setToast("TODO: ouvrir modal création prédiction")}
            >
              ➕ Créer une prédiction
            </button>
          ) : (
            <div style={{ opacity: 0.7 }}>Prédiction active – actions disponibles</div>
          )}
        </div>
      )}

      {/* 🟣 AUCUNE PRED */}
      {!pred && <div style={{ opacity: 0.7 }}>Aucune prédiction en cours.</div>}

      {/* 🟢 PRED ACTIVE */}
      {pred && (
        <>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>📊 {pred.question}</div>

          {/* Mise */}
          <div
            style={{
              marginBottom: 10,
              padding: 12,
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.04)",
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Montant du pari</div>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <select
                value={stake}
                disabled={!canChangeStake}
                onChange={(e) => setStakeRemote(Number(e.target.value))}
                style={{
                  width: "100%",
                  padding: "10px 10px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(0,0,0,0.25)",
                  color: "white",
                  fontWeight: 900,
                  outline: "none",
                  opacity: canChangeStake ? 1 : 0.7,
                  cursor: canChangeStake ? "pointer" : "not-allowed",
                }}
              >
                {allowedStakes.map((v) => (
                  <option key={v} value={v}>
                    {v} rubis
                  </option>
                ))}
              </select>

              {!canChangeStake ? (
                <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800, whiteSpace: "nowrap" }}>
                  Niveau {stakeLevel} • 10 uniquement
                </div>
              ) : (
                <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800, whiteSpace: "nowrap" }}>
                  Débloqué: {allowedStakes.join(" / ")}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {[1, 2].map((n) => {
              const label = n === 1 ? pred.option1_label : pred.option2_label;
              const pool = n === 1 ? pred.total_pool_1 : pred.total_pool_2;
              const total = pred.total_pool_1 + pred.total_pool_2;
              const pct = total > 0 ? Math.round((pool / total) * 100) : 0;

              return (
                <div
                  key={n}
                  style={{
                    padding: 12,
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  <div style={{ fontWeight: 800 }}>
                    {n}️⃣ {label}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    {pool} rubis • {pct}%
                  </div>

                  {pred.status === "open" && (
                    <button
                      onClick={() => bet(n as 1 | 2)}
                      style={{
                        marginTop: 6,
                        padding: "8px 12px",
                        borderRadius: 10,
                        border: "none",
                        fontWeight: 950,
                        cursor: "pointer",
                      }}
                    >
                      Parier ({stake})
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {toast && (
        <div
          style={{
            marginTop: 12,
            fontSize: 12,
            padding: 8,
            borderRadius: 10,
            background: "rgba(124,77,255,0.15)",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
