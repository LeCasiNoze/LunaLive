// web/src/components/botmenu/PredictionsTab.tsx
import * as React from "react";

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

export function PredictionsTab({
  token,
  slug,
  canMod,
  onRequireLogin,
}: Props) {
  const [pred, setPred] = React.useState<ApiPrediction | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const [isLive, setIsLive] = React.useState<boolean | null>(null);

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

    async function loadAll() {
    try {
        const liveRes = await api<any>(`/api/streamers/${slug}/live`);
        setIsLive(!!liveRes?.isLive);

        const predRes = await api<any>(
        `/api/bot/predictions/current?streamerSlug=${encodeURIComponent(slug)}`
        );

        setPred(predRes.ok ? predRes.prediction : null);
    } catch {
        // silencieux : on garde l’état affiché
    }
    }

  React.useEffect(() => {
    loadAll();
    const id = setInterval(loadAll, 2000);
    return () => clearInterval(id);
  }, []);

  async function bet(choice: 1 | 2) {
    if (!token) return onRequireLogin();

    const r = await api<any>("/api/bot/predictions/bet", {
      streamerSlug: slug,
      choice,
    });

    if (!r.ok) {
      setToast(
        r.reason === "not_enough_rubis"
          ? "Pas assez de rubis"
          : "Pari refusé"
      );
    } else {
      setToast(`Pari accepté (${r.stake} rubis)`);
    }
  }

  // ───────────────────────────────
  // RENDER
  // ───────────────────────────────

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
              onClick={() => {
                setToast("TODO: ouvrir modal création prédiction");
              }}
            >
              ➕ Créer une prédiction
            </button>
          ) : (
            <div style={{ opacity: 0.7 }}>
              Prédiction active – actions disponibles
            </div>
          )}
        </div>
      )}

      {/* 🟣 AUCUNE PRED */}
      {!pred && (
        <div style={{ opacity: 0.7 }}>
          Aucune prédiction en cours.
        </div>
      )}

      {/* 🟢 PRED ACTIVE */}
      {pred && (
        <>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>
            📊 {pred.question}
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {[1, 2].map((n) => {
              const label =
                n === 1 ? pred.option1_label : pred.option2_label;
              const pool =
                n === 1 ? pred.total_pool_1 : pred.total_pool_2;
              const total = pred.total_pool_1 + pred.total_pool_2;
              const pct =
                total > 0 ? Math.round((pool / total) * 100) : 0;

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
                        padding: "6px 10px",
                        borderRadius: 10,
                        border: "none",
                        fontWeight: 900,
                        cursor: "pointer",
                      }}
                    >
                      Parier
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
