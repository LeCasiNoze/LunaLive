// web/src/pages/dashboard/sections/bot/modules/PredictionsModule.tsx
import * as React from "react";

type Props = {
  token: string;
  streamerId: number;
  streamerSlug: string;
};

type Prediction = {
  id: number;
  question: string;
  option1_label: string;
  option2_label: string;
  fixed_stake: number;
  status: "open" | "locked" | "resolved";
  total_pool_1: number;
  total_pool_2: number;
};

export function PredictionsModule({ token, streamerId, streamerSlug }: Props) {
  const [pred, setPred] = React.useState<Prediction | null>(null);
  const [isLive, setIsLive] = React.useState<boolean | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);

  // création
  const [question, setQuestion] = React.useState("");
  const [opt1, setOpt1] = React.useState("");
  const [opt2, setOpt2] = React.useState("");
  const [duration, setDuration] = React.useState(180);
  const [stake, setStake] = React.useState(10);

  async function api<T>(url: string, body?: any): Promise<T> {
    const r = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return r.json();
  }

  async function refresh() {
    try {
      const live = await api<any>(`/api/streamers/${streamerSlug}/live`);
      setIsLive(!!live?.isLive);

      const r = await api<any>(
        `/api/bot/predictions/current?streamerId=${streamerId}`
      );
      setPred(r.ok ? r.prediction : null);
    } catch {
      // silencieux
    }
  }

  React.useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createPrediction() {
    const r = await api<any>("/api/bot/predictions/create", {
      streamerId,
      question,
      option1: opt1,
      option2: opt2,
      durationSec: duration,
      fixedStake: stake,
    });

    if (!r.ok) {
      setToast("Création refusée");
      return;
    }

    setQuestion("");
    setOpt1("");
    setOpt2("");
    setToast("Prédiction créée");
    setPred(r.prediction);
  }

  async function resolve(choice: 1 | 2) {
    const r = await api<any>("/api/bot/predictions/resolve", {
      streamerId,
      winning: choice,
    });

    if (!r.ok) {
      setToast("Résolution refusée");
      return;
    }

    setToast("Prédiction résolue");
    refresh();
  }

  const total =
    (pred?.total_pool_1 || 0) + (pred?.total_pool_2 || 0);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* LIVE STATUS */}
      {isLive === false && (
        <div className="hint">
          🔴 Les prédictions sont disponibles uniquement en live
        </div>
      )}

      {/* CREATE */}
      {!pred && isLive && (
        <div className="panel" style={{ padding: 14 }}>
          <div style={{ fontWeight: 950, marginBottom: 8 }}>
            ➕ Créer une prédiction
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Question"
            />
            <input
              value={opt1}
              onChange={(e) => setOpt1(e.target.value)}
              placeholder="Option 1"
            />
            <input
              value={opt2}
              onChange={(e) => setOpt2(e.target.value)}
              placeholder="Option 2"
            />

            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="number"
                value={duration}
                min={30}
                onChange={(e) => setDuration(Number(e.target.value))}
                style={{ width: 120 }}
              />
              <span className="muted">Durée (sec)</span>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="number"
                value={stake}
                min={1}
                onChange={(e) => setStake(Number(e.target.value))}
                style={{ width: 120 }}
              />
              <span className="muted">Mise (rubis)</span>
            </div>

            <button
              className="btnPrimary"
              onClick={createPrediction}
              disabled={!question || !opt1 || !opt2}
            >
              Créer
            </button>
          </div>
        </div>
      )}

      {/* ACTIVE PRED */}
      {pred && (
        <div className="panel" style={{ padding: 14 }}>
          <div style={{ fontWeight: 950 }}>{pred.question}</div>

          {[1, 2].map((n) => {
            const label =
              n === 1 ? pred.option1_label : pred.option2_label;
            const pool =
              n === 1 ? pred.total_pool_1 : pred.total_pool_2;
            const pct =
              total > 0 ? Math.round((pool / total) * 100) : 0;

            return (
              <div
                key={n}
                style={{
                  marginTop: 8,
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.10)",
                }}
              >
                <b>{label}</b> — {pool} rubis ({pct}%)
                {pred.status === "open" && (
                  <button
                    style={{ marginLeft: 10 }}
                    className="btnGhostInline"
                    onClick={() => resolve(n as 1 | 2)}
                  >
                    Résoudre
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {toast && <div className="hint">{toast}</div>}
    </div>
  );
}
