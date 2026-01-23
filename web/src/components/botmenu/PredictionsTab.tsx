// web/src/components/botmenu/PredictionsTab.tsx
import * as React from "react";
import { createPortal } from "react-dom";

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
  streamer_id: number;
  question: string;
  option1_label: string;
  option2_label: string;
  fixed_stake: number;
  status: "open" | "locked" | "resolved";
  total_pool_1: number;
  total_pool_2: number;
  created_at: string;
  bets_close_at: string;
  resolved_option: 1 | 2 | null;
};

type StakeStatus = {
  ok: boolean;
  level: number;
  allowed: number[];
  selected: number;
  reason?: string;
};

type StreamerPublic = {
  id: string;
  slug: string;
  displayName: string;
  isLive: boolean;
  hostTargetIsLive?: boolean;
};

function uiToast(kind: "success" | "error" | "info", title: string, message?: string) {
  window.dispatchEvent(
    new CustomEvent("ui:toast", {
      detail: { kind, title, message, slot: "bottom" },
    })
  );
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function msLeft(iso: string | null | undefined) {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, t - Date.now());
}

function fmtMmSs(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

function ModalShell(p: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { open, title, onClose, children } = p;
  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483646,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(8px)",
        display: "grid",
        placeItems: "center",
        padding: 18,
      }}
    >
      <div
        style={{
          width: "min(560px, 100%)",
          borderRadius: 18,
          background: "rgba(12,10,18,0.92)",
          border: "1px solid rgba(255,255,255,0.10)",
          boxShadow: "0 30px 110px rgba(0,0,0,0.65)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "14px 14px",
            display: "flex",
            gap: 10,
            alignItems: "center",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            background: "linear-gradient(180deg, rgba(124,77,255,0.14), rgba(0,0,0,0))",
          }}
        >
          <div style={{ fontWeight: 950, letterSpacing: 0.2 }}>{title}</div>
          <button
            type="button"
            onClick={onClose}
            style={{
              marginLeft: "auto",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.06)",
              color: "white",
              fontWeight: 900,
              cursor: "pointer",
              padding: "6px 8px",
            }}
            aria-label="Fermer"
            title="Fermer"
          >
            ✕
          </button>
        </div>

        <div style={{ padding: 14 }}>{children}</div>
      </div>
    </div>,
    document.body
  );
}

export function PredictionsTab({ token, slug, canMod, onRequireLogin }: Props) {
  const [pred, setPred] = React.useState<ApiPrediction | null>(null);
  const [isLive, setIsLive] = React.useState<boolean | null>(null);
  const [streamerId, setStreamerId] = React.useState<number | null>(null);

  const [stake, setStake] = React.useState<number>(10);
  const [allowedStakes, setAllowedStakes] = React.useState<number[]>([10]);
  const [stakeLevel, setStakeLevel] = React.useState<number>(0);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [o1, setO1] = React.useState("");
  const [o2, setO2] = React.useState("");

  const [tick, setTick] = React.useState(0);

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
        const allowed = Array.isArray(r.allowed) && r.allowed.length ? r.allowed : [10];
        setAllowedStakes(allowed);
        setStake(Number(r.selected || allowed[0] || 10));
        setStakeLevel(Number(r.level || 0));
      } else {
        uiToast("error", "Prédictions", "Impossible de charger ton niveau de mise.");
      }
    } catch {
      uiToast("error", "Prédictions", "Erreur réseau (stake).");
    }
  }

  async function setStakeRemote(v: number) {
    if (!token) return onRequireLogin();
    try {
      const r = await api<any>(`${apiBase()}/api/bot/predictions/stake`, { stake: v });
      if (r?.ok) {
        const allowed = Array.isArray(r.allowed) && r.allowed.length ? r.allowed : [10];
        setStake(Number(r.selected || v));
        setAllowedStakes(allowed);
        setStakeLevel(Number(r.level || 0));
        uiToast("success", "Mise", `Mise par défaut : ${Number(r.selected || v)} rubis`);
      } else {
        uiToast("error", "Mise", "Mise non autorisée");
      }
    } catch {
      uiToast("error", "Mise", "Erreur mise");
    }
  }

  async function loadAll() {
    try {
      const s = await api<any>(`${apiBase()}/streamers/${encodeURIComponent(slug)}`);
      const pub = s as StreamerPublic;
      setIsLive(!!pub?.isLive);
      const sid = Number(pub?.id || 0);
      setStreamerId(sid > 0 ? sid : null);

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

  // tick timer
  React.useEffect(() => {
    const id = window.setInterval(() => setTick((x) => x + 1), 250);
    return () => window.clearInterval(id);
  }, []);

  async function bet(choice: 1 | 2) {
    if (!token) return onRequireLogin();

    try {
      const r = await api<any>(`${apiBase()}/api/bot/predictions/bet`, {
        streamerSlug: slug,
        choice,
        stake,
      });

      if (!r?.ok) {
        const reason = String(r?.reason || "");
        if (reason === "not_enough_rubis") return uiToast("error", "Pari", "Pas assez de rubis");
        if (reason === "stake_not_allowed") return uiToast("error", "Pari", "Mise non autorisée");
        if (reason === "stream_not_live") return uiToast("error", "Pari", "Uniquement en live");
        if (reason === "no_active_prediction") return uiToast("error", "Pari", "Aucune prédiction en cours");
        if (reason === "bets_closed") return uiToast("error", "Pari", "Paris fermés");
        return uiToast("error", "Pari", "Pari refusé");
      }

      uiToast("success", "Pari accepté", `${r.stake} rubis`);

      // resync stake si backend a fallback
      if (Number.isFinite(Number(r.stake))) setStake(Number(r.stake));
      // reload totals
      void loadAll();
    } catch {
      uiToast("error", "Pari", "Erreur réseau");
    }
  }

  async function createPrediction() {
    if (!token) return onRequireLogin();
    if (!streamerId) return uiToast("error", "Prédictions", "Streamer introuvable");
    if (!isLive) return uiToast("error", "Prédictions", "Uniquement en live");

    const question = String(q || "").trim();
    const opt1 = String(o1 || "").trim();
    const opt2 = String(o2 || "").trim();

    if (question.length < 5) return uiToast("error", "Création", "Question trop courte");
    if (opt1.length < 1 || opt2.length < 1) return uiToast("error", "Création", "Deux options requises");
    if (opt1.toLowerCase() === opt2.toLowerCase()) return uiToast("error", "Création", "Options identiques");

    setCreating(true);
    try {
      const r = await api<any>(`${apiBase()}/api/bot/predictions/create`, {
        streamerId,
        question,
        option1: opt1,
        option2: opt2,
        durationSec: 120, // ✅ 2 minutes comme demandé
        fixedStake: 10,
      });

      if (!r?.ok) {
        const reason = String(r?.reason || "");
        if (reason === "already_active") return uiToast("error", "Création", "Déjà une prédiction active");
        if (reason === "daily_limit_reached") return uiToast("error", "Création", "Limite journalière atteinte");
        if (reason === "stream_not_live") return uiToast("error", "Création", "Uniquement en live");
        return uiToast("error", "Création", "Impossible de créer");
      }

      uiToast("success", "Prédiction", "Prédiction créée");
      setCreateOpen(false);
      setQ("");
      setO1("");
      setO2("");
      void loadAll();
    } catch {
      uiToast("error", "Création", "Erreur réseau");
    } finally {
      setCreating(false);
    }
  }

  async function resolve(winning: 1 | 2) {
    if (!token) return onRequireLogin();
    if (!streamerId) return uiToast("error", "Prédictions", "Streamer introuvable");
    if (!pred) return uiToast("error", "Prédictions", "Aucune prédiction");
    if (!isLive) return uiToast("error", "Prédictions", "Uniquement en live");

    try {
      const r = await api<any>(`${apiBase()}/api/bot/predictions/resolve`, {
        streamerId,
        winning,
      });

      if (!r?.ok) {
        const reason = String(r?.reason || "");
        if (reason === "stream_not_live") return uiToast("error", "Résolution", "Uniquement en live");
        if (reason === "no_active_prediction") return uiToast("error", "Résolution", "Aucune prédiction active");
        return uiToast("error", "Résolution", "Impossible de terminer");
      }

      uiToast("success", "Prédiction", "Prédiction terminée");
      void loadAll();
    } catch {
      uiToast("error", "Résolution", "Erreur réseau");
    }
  }

  const canChangeStake = allowedStakes.length > 1;
  const total = (pred?.total_pool_1 || 0) + (pred?.total_pool_2 || 0);
  const leftMs = pred ? msLeft(pred.bets_close_at) : 0;
  const progress = pred ? clamp01(1 - leftMs / (120_000)) : 0;

  return (
    <div style={{ padding: 16 }}>
      {/* 🔒 MOD UI */}
      {canMod && (
        <div
          style={{
            marginBottom: 12,
            padding: 12,
            borderRadius: 14,
            border: "1px dashed rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.03)",
            fontSize: 12,
          }}
        >
          {!isLive ? (
            <div>🔴 Les prédictions sont disponibles uniquement en live</div>
          ) : !pred ? (
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                style={{
                  padding: "9px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(124,77,255,0.18)",
                  color: "white",
                  fontWeight: 950,
                  cursor: "pointer",
                }}
                onClick={() => setCreateOpen(true)}
              >
                ➕ Créer une prédiction
              </button>
              <div style={{ opacity: 0.75, fontWeight: 800 }}>
                Durée des paris : <span style={{ fontWeight: 950 }}>2 minutes</span>
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ opacity: 0.8, fontWeight: 900 }}>Prédiction active – actions streamer/modo/admin</div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => resolve(1)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(80,255,160,0.12)",
                    color: "white",
                    fontWeight: 950,
                    cursor: "pointer",
                  }}
                >
                  ✅ Gagnant : {pred.option1_label}
                </button>

                <button
                  type="button"
                  onClick={() => resolve(2)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(80,255,160,0.12)",
                    color: "white",
                    fontWeight: 950,
                    cursor: "pointer",
                  }}
                >
                  ✅ Gagnant : {pred.option2_label}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 🟣 AUCUNE PRED */}
      {!pred && <div style={{ opacity: 0.75, fontWeight: 800 }}>Aucune prédiction en cours.</div>}

      {/* 🟢 PRED ACTIVE */}
      {pred && (
        <>
          <div style={{ fontWeight: 950, marginBottom: 10 }}>
            📊 {pred.question}
            <span style={{ marginLeft: 10, fontSize: 12, opacity: 0.8, fontWeight: 900 }}>
              • {pred.status === "open" ? `Paris: ${fmtMmSs(leftMs)}` : pred.status}
            </span>
          </div>

          {/* Timer bar */}
          {pred.status === "open" && (
            <div
              style={{
                height: 10,
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.04)",
                overflow: "hidden",
                marginBottom: 12,
              }}
              title={`${fmtMmSs(leftMs)} restantes`}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.round(progress * 100)}%`,
                  background: "linear-gradient(90deg, rgba(124,77,255,0.75), rgba(255,255,255,0.12))",
                }}
              />
            </div>
          )}

          {/* Mise */}
          <div
            style={{
              marginBottom: 12,
              padding: 12,
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.04)",
            }}
          >
            <div style={{ fontWeight: 950, marginBottom: 8 }}>Montant du pari</div>

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
                  fontWeight: 950,
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
                <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900, whiteSpace: "nowrap" }}>
                  Niveau {stakeLevel} • 10 uniquement
                </div>
              ) : (
                <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900, whiteSpace: "nowrap" }}>
                  Débloqué: {allowedStakes.join(" / ")}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {[1, 2].map((n) => {
              const label = n === 1 ? pred.option1_label : pred.option2_label;
              const pool = n === 1 ? pred.total_pool_1 : pred.total_pool_2;
              const pct = total > 0 ? Math.round((pool / total) * 100) : 0;

              return (
                <div
                  key={n}
                  style={{
                    padding: 12,
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(0,0,0,0.18)",
                  }}
                >
                  <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                    <div style={{ fontWeight: 950 }}>
                      {n}️⃣ {label}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 900 }}>
                      {pool} rubis • {pct}%
                    </div>
                  </div>

                  {pred.status === "open" && (
                    <button
                      onClick={() => bet(n as 1 | 2)}
                      style={{
                        marginTop: 8,
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.12)",
                        background: "rgba(124,77,255,0.20)",
                        color: "white",
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

      {/* MODAL CREATE */}
      <ModalShell open={createOpen} title="Créer une prédiction" onClose={() => (!creating ? setCreateOpen(false) : null)}>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 900 }}>
            Les paris sont ouverts <span style={{ fontWeight: 950 }}>2 minutes</span> (120s).
          </div>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 900 }}>Question</div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ex: On hit un max win ?"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(0,0,0,0.25)",
                color: "white",
                fontWeight: 900,
                outline: "none",
              }}
            />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 900 }}>Option 1</div>
              <input
                value={o1}
                onChange={(e) => setO1(e.target.value)}
                placeholder="Ex: OUI"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(0,0,0,0.25)",
                  color: "white",
                  fontWeight: 900,
                  outline: "none",
                }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 900 }}>Option 2</div>
              <input
                value={o2}
                onChange={(e) => setO2(e.target.value)}
                placeholder="Ex: NON"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(0,0,0,0.25)",
                  color: "white",
                  fontWeight: 900,
                  outline: "none",
                }}
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button
              type="button"
              disabled={creating}
              onClick={createPrediction}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(124,77,255,0.22)",
                color: "white",
                fontWeight: 950,
                cursor: creating ? "not-allowed" : "pointer",
                opacity: creating ? 0.7 : 1,
              }}
            >
              {creating ? "Création..." : "Créer"}
            </button>

            <button
              type="button"
              disabled={creating}
              onClick={() => setCreateOpen(false)}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.06)",
                color: "white",
                fontWeight: 900,
                cursor: creating ? "not-allowed" : "pointer",
                opacity: creating ? 0.7 : 1,
              }}
            >
              Annuler
            </button>
          </div>
        </div>
      </ModalShell>

      {/* force tick use */}
      <span style={{ display: "none" }}>{tick}</span>
    </div>
  );
}
