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
  streamer_id: number;
  question: string;
  option1_label: string;
  option2_label: string;
  fixed_stake: number;
  status: "open" | "locked" | "resolved";
  total_pool_1: number;
  total_pool_2: number;
  created_at?: string;
  bets_close_at?: string;
  resolved_option?: 1 | 2 | null;
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
  isLive: boolean;
  displayName?: string;
  hostTargetIsLive?: boolean;
};

type PredictionSummary = {
  ok: boolean;
  predictionId: number;
  count1: number;
  count2: number;
  total1: number;
  total2: number;
  // liste (qui a parié / combien / quel camp)
  bets: Array<{
    userId: number;
    username: string;
    choice: 1 | 2;
    amount: number;
    createdAt: string;
  }>;
};

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}
function fmtMs(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

function BackdropModal({
  open,
  title,
  subtitle,
  onClose,
  children,
  maxWidth = 560,
}: {
  open: boolean;
  title: string;
  subtitle?: string | null;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: number;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onMouseDown={(e) => {
        // click backdrop => close
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.60)",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth,
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.12)",
          background:
            "radial-gradient(1200px 500px at 20% 0%, rgba(124,77,255,0.18), transparent 45%)," +
            "radial-gradient(900px 500px at 100% 0%, rgba(0,229,255,0.12), transparent 40%)," +
            "rgba(10,10,14,0.88)",
          boxShadow: "0 30px 90px rgba(0,0,0,0.55)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: 16, borderBottom: "1px solid rgba(255,255,255,0.10)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 1000, letterSpacing: 0.2 }}>{title}</div>
              {subtitle ? (
                <div style={{ marginTop: 4, fontSize: 12, opacity: 0.78, fontWeight: 700 }}>{subtitle}</div>
              ) : null}
            </div>

            <button
              onClick={onClose}
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.06)",
                color: "white",
                borderRadius: 12,
                padding: "8px 10px",
                cursor: "pointer",
                fontWeight: 900,
              }}
            >
              ✕
            </button>
          </div>
        </div>

        <div style={{ padding: 16 }}>{children}</div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
        <div style={{ fontWeight: 950, fontSize: 12 }}>{label}</div>
        {maxLength ? (
          <div style={{ fontSize: 11, opacity: 0.6, fontWeight: 800 }}>
            {value.length}/{maxLength}
          </div>
        ) : hint ? (
          <div style={{ fontSize: 11, opacity: 0.6, fontWeight: 800 }}>{hint}</div>
        ) : null}
      </div>

      <input
        value={value}
        onChange={(e) => onChange(String(e.target.value || ""))}
        placeholder={placeholder}
        maxLength={maxLength}
        style={{
          width: "100%",
          padding: "12px 12px",
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(0,0,0,0.30)",
          color: "white",
          fontWeight: 850,
          outline: "none",
        }}
      />
    </div>
  );
}

export function PredictionsTab({ token, slug, canMod, onRequireLogin }: Props) {
  const [pred, setPred] = React.useState<ApiPrediction | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);

  const [isLive, setIsLive] = React.useState<boolean | null>(null);
  const [streamerId, setStreamerId] = React.useState<number | null>(null);

  const [stake, setStake] = React.useState<number>(10);
  const [allowedStakes, setAllowedStakes] = React.useState<number[]>([10]);
  const [stakeLevel, setStakeLevel] = React.useState<number>(0);

  // viewer modal (bet + details)
  const [viewerOpen, setViewerOpen] = React.useState(false);
  const [summary, setSummary] = React.useState<PredictionSummary | null>(null);

  // create modal
  const [createOpen, setCreateOpen] = React.useState(false);
  const [cQuestion, setCQuestion] = React.useState("");
  const [cOpt1, setCOpt1] = React.useState("");
  const [cOpt2, setCOpt2] = React.useState("");
  const [createBusy, setCreateBusy] = React.useState(false);

  async function api<T>(url: string, body?: any): Promise<T> {
    const r = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => null);
    return j as T;
  }

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 2500);
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
        showToast("Mise non autorisée");
      }
    } catch {
      showToast("Erreur mise");
    }
  }

  async function loadAll() {
    try {
      const s = await api<StreamerPublic>(`${apiBase()}/streamers/${encodeURIComponent(slug)}`);
      const live = !!(s as any)?.isLive;
      setIsLive(live);
      const sid = Number((s as any)?.id || 0);
      setStreamerId(sid > 0 ? sid : null);

      const predRes = await api<any>(
        `${apiBase()}/api/bot/predictions/current?streamerSlug=${encodeURIComponent(slug)}`
      );
      setPred(predRes?.ok ? (predRes.prediction as ApiPrediction) : null);
    } catch {
      // silencieux
    }
  }

  async function loadSummary(predictionId: number) {
    if (!token) return;
    try {
      const s = await api<PredictionSummary>(
        `${apiBase()}/api/bot/predictions/summary?predictionId=${encodeURIComponent(String(predictionId))}&limit=200`
      );
      if (s?.ok) setSummary(s);
    } catch {}
  }

  React.useEffect(() => {
    void loadStakeStatus();
    void loadAll();
    const id = window.setInterval(loadAll, 2000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, slug]);

  // Poll summary only when viewer modal is open and pred exists
  React.useEffect(() => {
    if (!viewerOpen) return;
    if (!token) return;
    if (!pred?.id) return;

    void loadSummary(pred.id);
    const id = window.setInterval(() => loadSummary(pred.id), 1500);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerOpen, token, pred?.id]);

  async function bet(choice: 1 | 2) {
    if (!token) return onRequireLogin();

    const r = await api<any>(`${apiBase()}/api/bot/predictions/bet`, {
      streamerSlug: slug,
      choice,
      stake,
    });

    if (!r?.ok) {
      showToast(r?.reason === "not_enough_rubis" ? "Pas assez de rubis" : "Pari refusé");
    } else {
      showToast(`Pari accepté (${r.stake} rubis)`);
      if (Number.isFinite(Number(r.stake))) setStake(Number(r.stake));
      // refresh summary/pred quickly
      void loadAll();
      if (pred?.id) void loadSummary(pred.id);
    }
  }

  async function openCreate() {
    if (!canMod) return;
    if (!token) return onRequireLogin();
    if (!isLive) return showToast("Disponible uniquement en live");
    if (!streamerId) return showToast("Streamer introuvable");
    if (pred) return showToast("Une prédiction est déjà active");

    // default nice values
    setCQuestion("");
    setCOpt1("");
    setCOpt2("");
    setCreateOpen(true);
  }

  async function submitCreate() {
    if (!token) return onRequireLogin();
    if (!streamerId) return showToast("Streamer introuvable");

    const q = String(cQuestion || "").trim();
    const o1 = String(cOpt1 || "").trim();
    const o2 = String(cOpt2 || "").trim();

    if (q.length < 4) return showToast("Question trop courte");
    if (o1.length < 1 || o2.length < 1) return showToast("Réponses obligatoires");
    if (o1.toLowerCase() === o2.toLowerCase()) return showToast("Réponses identiques");

    setCreateBusy(true);
    try {
      const r = await api<any>(`${apiBase()}/api/bot/predictions/create`, {
        streamerId,
        question: q,
        option1: o1,
        option2: o2,
        durationSec: 120, // ✅ 2 minutes imposées
        fixedStake: 10, // informatif / default
      });

      if (!r?.ok) {
        const reason = String(r?.reason || "");
        if (reason === "stream_not_live") showToast("Tu dois être en live");
        else if (reason === "already_active") showToast("Déjà une prédiction active");
        else if (reason === "daily_limit_reached") showToast("Limite journalière atteinte");
        else if (reason === "forbidden") showToast("Pas autorisé");
        else showToast("Création refusée");
        return;
      }

      showToast("Prédiction créée ✅");
      setCreateOpen(false);
      void loadAll();
      // ouvrir directement la modale viewer (pratique pour contrôler)
      window.setTimeout(() => setViewerOpen(true), 150);
    } catch {
      showToast("Erreur création");
    } finally {
      setCreateBusy(false);
    }
  }

  const canChangeStake = allowedStakes.length > 1;

  // timer
  const closeAtMs = pred?.bets_close_at ? new Date(pred.bets_close_at).getTime() : null;
  const [nowTick, setNowTick] = React.useState(Date.now());
  React.useEffect(() => {
    if (!viewerOpen && !pred) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [viewerOpen, !!pred]);

  const remainingMs = closeAtMs != null ? Math.max(0, closeAtMs - nowTick) : null;
  const totalDurationMs = 120 * 1000;
  const progress = remainingMs == null ? 0 : clamp01(1 - remainingMs / totalDurationMs);

  const totalPool = (pred?.total_pool_1 || 0) + (pred?.total_pool_2 || 0);
  const pct1 = totalPool > 0 ? Math.round(((pred?.total_pool_1 || 0) / totalPool) * 100) : 0;
  const pct2 = totalPool > 0 ? 100 - pct1 : 0;

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
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div>🔴</div>
              <div style={{ fontWeight: 900 }}>Les prédictions sont disponibles uniquement en live</div>
            </div>
          ) : !pred ? (
            <button
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.16)",
                background:
                  "linear-gradient(135deg, rgba(124,77,255,0.35), rgba(0,229,255,0.18))",
                color: "white",
                fontWeight: 1000,
                cursor: "pointer",
              }}
              onClick={openCreate}
            >
              ➕ Créer une prédiction
            </button>
          ) : (
            <div style={{ opacity: 0.85, fontWeight: 900 }}>
              Prédiction active – tu peux la résoudre dans l’outil (resolve route) plus tard.
            </div>
          )}
        </div>
      )}

      {/* 🟣 AUCUNE PRED */}
      {!pred && (
        <div style={{ opacity: 0.72, fontWeight: 800 }}>
          Aucune prédiction en cours.
        </div>
      )}

      {/* 🟢 PRED ACTIVE (card preview) */}
      {pred && (
        <div
          style={{
            borderRadius: 18,
            border: "1px solid rgba(255,255,255,0.12)",
            background:
              "radial-gradient(900px 500px at 10% 0%, rgba(124,77,255,0.16), transparent 45%), rgba(255,255,255,0.03)",
            padding: 14,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 1000, marginBottom: 6, fontSize: 13 }}>📊 {pred.question}</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12, opacity: 0.85, fontWeight: 800 }}>
                <div>Statut: <span style={{ fontWeight: 1000 }}>{pred.status}</span></div>
                {remainingMs != null && pred.status !== "resolved" ? (
                  <div>⏳ {fmtMs(remainingMs)}</div>
                ) : null}
                <div>Pot: <span style={{ fontWeight: 1000 }}>{totalPool}</span> rubis</div>
              </div>
            </div>

            <button
              onClick={() => {
                if (!token) return onRequireLogin();
                setViewerOpen(true);
              }}
              style={{
                whiteSpace: "nowrap",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(255,255,255,0.06)",
                color: "white",
                fontWeight: 1000,
                cursor: "pointer",
              }}
            >
              Voir & parier
            </button>
          </div>

          {/* bar */}
          {remainingMs != null && pred.status !== "resolved" && (
            <div style={{ marginTop: 10 }}>
              <div
                style={{
                  height: 10,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.08)",
                  overflow: "hidden",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.round(progress * 100)}%`,
                    background: "linear-gradient(90deg, rgba(124,77,255,0.70), rgba(0,229,255,0.55))",
                  }}
                />
              </div>
            </div>
          )}

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12, opacity: 0.9, fontWeight: 900 }}>
                <div>1️⃣ {pred.option1_label}</div>
                <div>{pred.total_pool_1} rubis • {pct1}%</div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12, opacity: 0.9, fontWeight: 900 }}>
                <div>2️⃣ {pred.option2_label}</div>
                <div>{pred.total_pool_2} rubis • {pct2}%</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== CREATE MODAL ===================== */}
      <BackdropModal
        open={createOpen}
        title="Créer une prédiction"
        subtitle="2 minutes de paris • visible en live • mod/admin/owner"
        onClose={() => (createBusy ? null : setCreateOpen(false))}
        maxWidth={640}
      >
        <div style={{ display: "grid", gap: 12 }}>
          <Field
            label="Question"
            hint="Ex: “Est-ce qu’il va hit le bonus ?”"
            value={cQuestion}
            onChange={setCQuestion}
            maxLength={140}
            placeholder="Ta question…"
          />

          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
            <Field
              label="Option 1"
              hint="Réponse 1"
              value={cOpt1}
              onChange={setCOpt1}
              maxLength={60}
              placeholder="Oui"
            />
            <Field
              label="Option 2"
              hint="Réponse 2"
              value={cOpt2}
              onChange={setCOpt2}
              maxLength={60}
              placeholder="Non"
            />
          </div>

          <div
            style={{
              padding: 12,
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(0,0,0,0.22)",
              fontSize: 12,
              opacity: 0.9,
              fontWeight: 850,
            }}
          >
            ⏱️ Durée fixe : <b>120 secondes</b> • Les viewers peuvent choisir leur mise selon leur upgrade.
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              onClick={() => setCreateOpen(false)}
              disabled={createBusy}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.06)",
                color: "white",
                fontWeight: 950,
                cursor: createBusy ? "not-allowed" : "pointer",
                opacity: createBusy ? 0.7 : 1,
              }}
            >
              Annuler
            </button>

            <button
              onClick={submitCreate}
              disabled={createBusy}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.16)",
                background:
                  "linear-gradient(135deg, rgba(124,77,255,0.45), rgba(0,229,255,0.22))",
                color: "white",
                fontWeight: 1100,
                cursor: createBusy ? "not-allowed" : "pointer",
                opacity: createBusy ? 0.7 : 1,
              }}
            >
              {createBusy ? "Création…" : "Créer"}
            </button>
          </div>
        </div>
      </BackdropModal>

      {/* ===================== VIEWER MODAL ===================== */}
      <BackdropModal
        open={viewerOpen}
        title={pred ? `📊 ${pred.question}` : "Prédiction"}
        subtitle={pred ? `Pot total: ${totalPool} rubis • ${pred.status}` : null}
        onClose={() => setViewerOpen(false)}
        maxWidth={760}
      >
        {!pred ? (
          <div style={{ opacity: 0.75, fontWeight: 850 }}>Aucune prédiction active.</div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {/* timer + status */}
            <div
              style={{
                padding: 12,
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <div style={{ fontWeight: 1000, fontSize: 12, opacity: 0.9 }}>Fenêtre de pari</div>
                {remainingMs != null && pred.status !== "resolved" ? (
                  <div style={{ fontWeight: 1100, letterSpacing: 0.2 }}>{fmtMs(remainingMs)}</div>
                ) : (
                  <div style={{ fontWeight: 1100, letterSpacing: 0.2 }}>—</div>
                )}
              </div>

              {remainingMs != null && pred.status !== "resolved" && (
                <div style={{ marginTop: 10 }}>
                  <div
                    style={{
                      height: 10,
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.08)",
                      overflow: "hidden",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.round(progress * 100)}%`,
                        background: "linear-gradient(90deg, rgba(124,77,255,0.70), rgba(0,229,255,0.55))",
                      }}
                    />
                  </div>
                </div>
              )}

              <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12, opacity: 0.85, fontWeight: 900 }}>
                <div>1️⃣ {pred.option1_label}: <b>{pred.total_pool_1}</b> ({pct1}%)</div>
                <div>2️⃣ {pred.option2_label}: <b>{pred.total_pool_2}</b> ({pct2}%)</div>
              </div>
            </div>

            {/* stake selector */}
            <div
              style={{
                padding: 12,
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(0,0,0,0.22)",
              }}
            >
              <div style={{ fontWeight: 1000, marginBottom: 8 }}>Montant du pari</div>

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

            {/* actions */}
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
              <button
                onClick={() => bet(1)}
                disabled={pred.status !== "open" || (remainingMs != null && remainingMs <= 0)}
                style={{
                  padding: "12px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(124,77,255,0.18)",
                  color: "white",
                  fontWeight: 1100,
                  cursor: pred.status === "open" ? "pointer" : "not-allowed",
                  opacity: pred.status === "open" ? 1 : 0.6,
                }}
              >
                1️⃣ Parier sur {pred.option1_label} ({stake})
              </button>

              <button
                onClick={() => bet(2)}
                disabled={pred.status !== "open" || (remainingMs != null && remainingMs <= 0)}
                style={{
                  padding: "12px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(0,229,255,0.14)",
                  color: "white",
                  fontWeight: 1100,
                  cursor: pred.status === "open" ? "pointer" : "not-allowed",
                  opacity: pred.status === "open" ? 1 : 0.6,
                }}
              >
                2️⃣ Parier sur {pred.option2_label} ({stake})
              </button>
            </div>

            {/* bettors list */}
            <div
              style={{
                padding: 12,
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <div style={{ fontWeight: 1100 }}>Qui a parié ?</div>
                {summary?.ok ? (
                  <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 900 }}>
                    {summary.count1 + summary.count2} bets • {summary.total1 + summary.total2} rubis
                  </div>
                ) : (
                  <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>Chargement…</div>
                )}
              </div>

              <div style={{ marginTop: 10, display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
                {[1, 2].map((c) => {
                  const title = c === 1 ? `1️⃣ ${pred.option1_label}` : `2️⃣ ${pred.option2_label}`;
                  const list = (summary?.bets || []).filter((b) => b.choice === (c as 1 | 2));
                  const pot = c === 1 ? (pred.total_pool_1 || 0) : (pred.total_pool_2 || 0);

                  return (
                    <div
                      key={c}
                      style={{
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(0,0,0,0.20)",
                        overflow: "hidden",
                      }}
                    >
                      <div style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                        <div style={{ fontWeight: 1100 }}>{title}</div>
                        <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 900 }}>{pot} rubis</div>
                      </div>

                      <div style={{ maxHeight: 240, overflow: "auto" }}>
                        {list.length === 0 ? (
                          <div style={{ padding: 10, fontSize: 12, opacity: 0.75, fontWeight: 900 }}>
                            Personne pour l’instant.
                          </div>
                        ) : (
                          list.map((b, i) => (
                            <div
                              key={`${b.userId}-${b.createdAt}-${i}`}
                              style={{
                                padding: "10px 10px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 10,
                                borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.06)",
                                fontSize: 12,
                              }}
                            >
                              <div style={{ fontWeight: 1000, overflow: "hidden", textOverflow: "ellipsis" }}>
                                {b.username}
                              </div>
                              <div style={{ fontWeight: 1100, opacity: 0.9, whiteSpace: "nowrap" }}>
                                {b.amount} rubis
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: 10, fontSize: 11, opacity: 0.7, fontWeight: 850 }}>
                (La liste se met à jour en live pendant que la modale est ouverte)
              </div>
            </div>
          </div>
        )}
      </BackdropModal>

      {/* toast */}
      {toast && (
        <div
          style={{
            marginTop: 12,
            fontSize: 12,
            padding: 10,
            borderRadius: 12,
            border: "1px solid rgba(124,77,255,0.25)",
            background: "rgba(124,77,255,0.15)",
            fontWeight: 900,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
