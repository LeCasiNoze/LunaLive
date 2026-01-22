// web/src/pages/dashboard/sections/bot/modules/BotRainModule.tsx
import * as React from "react";
import { CloudRain, Save } from "lucide-react";

type RainState = {
  ok: true;
  slug: string;
  enabled: boolean;
  intervalMin: 10 | 30 | 60 | 120;
  rubiesPerUser: number;
  joinWindowSec: number;
  isLive: boolean;
  phase: "disabled" | "offline" | "waiting" | "open";
  nextAtMs: number | null;
  joinCloseAtMs: number | null;
  participants: number;
  joined: boolean;
  canManage: boolean;
};

const PRESETS = [
  { intervalMin: 10 as const, rubiesPerUser: 1 },
  { intervalMin: 30 as const, rubiesPerUser: 5 },
  { intervalMin: 60 as const, rubiesPerUser: 15 },
  { intervalMin: 120 as const, rubiesPerUser: 50 },
];

const LOCKED_INTERVALS = new Set<number>([10, 120]);

function apiBase() {
  return (import.meta as any).env?.VITE_API_BASE || "https://lunalive-api.onrender.com";
}

type SubItem = {
  plan_code?: string;
  status?: string;
  current_period_end?: string | null;
};

function isActiveSub(s: SubItem): boolean {
  const st = String(s?.status || "").toLowerCase();
  if (st !== "active" && st !== "trialing") return false;
  const end = s?.current_period_end ? new Date(s.current_period_end).getTime() : null;
  return !end || end > Date.now();
}

export function BotRainModule({
  token,
  streamerSlug,
}: {
  token: string;
  streamerSlug: string;
}) {
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [state, setState] = React.useState<RainState | null>(null);

  const [streamerSubActive, setStreamerSubActive] = React.useState<boolean>(false);

  async function loadMeSubs() {
    try {
      const r = await fetch(`${apiBase()}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await r.json();
      const subs: SubItem[] = j?.user?.user_subscriptions || [];
      const ok = Array.isArray(subs)
        ? subs.some((s) => String(s?.plan_code || "") === "streamer" && isActiveSub(s))
        : false;
      setStreamerSubActive(ok);
    } catch {
      // si /me casse, on préfère ne PAS débloquer
      setStreamerSubActive(false);
    }
  }

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(
        `${apiBase()}/me/bot/bot_rain/public?slug=${encodeURIComponent(streamerSlug)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "load_failed");
      setState(j);
    } catch (e: any) {
      setErr(String(e?.message || "Erreur chargement"));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
    void loadMeSubs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setPreset(intervalMin: 10 | 30 | 60 | 120) {
    const p = PRESETS.find((x) => x.intervalMin === intervalMin)!;
    setState((old) =>
      old
        ? {
            ...old,
            intervalMin: p.intervalMin,
            rubiesPerUser: p.rubiesPerUser,
          }
        : old
    );
  }

  function isPresetLocked(intervalMin: number) {
    return LOCKED_INTERVALS.has(intervalMin) && !streamerSubActive;
  }

  async function save() {
    if (!state) return;

    if (isPresetLocked(state.intervalMin)) {
      setErr("🔒 Les rain 10 min et 120 min sont réservées à l’abonnement streamer.");
      return;
    }

    setSaving(true);
    setErr(null);
    try {
      const r = await fetch(`${apiBase()}/me/bot/bot_rain/config`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          slug: streamerSlug,
          enabled: state.enabled,
          intervalMin: state.intervalMin,
        }),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "save_failed");
      await load(); // recharge l’état serveur
      await loadMeSubs(); // au cas où statut sub change
    } catch (e: any) {
      setErr(String(e?.message || "Erreur sauvegarde"));
    } finally {
      setSaving(false);
    }
  }

  const perHour =
    state && state.intervalMin
      ? Math.round((state.rubiesPerUser * 60) / state.intervalMin)
      : 0;

  return (
    <div className="panel" style={{ padding: 14, borderRadius: 18, display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <CloudRain className="h-5 w-5" />
        <div style={{ fontWeight: 950, fontSize: 14 }}>🌧️ Rain automatique</div>
      </div>

      {loading || !state ? (
        <div className="muted" style={{ fontSize: 12 }}>
          Chargement…
        </div>
      ) : (
        <>
          {err ? <div className="hint">⚠️ {err}</div> : null}

          {!streamerSubActive ? (
            <div className="muted" style={{ fontSize: 12 }}>
              🔒 Les presets <b>10 min</b> et <b>120 min</b> sont réservés à l’abonnement streamer.
            </div>
          ) : null}

          {/* Activation */}
          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={state.enabled}
              disabled={!state.canManage}
              onChange={(e) =>
                setState((old) => (old ? { ...old, enabled: e.target.checked } : old))
              }
            />
            <span style={{ fontWeight: 900 }}>
              {state.enabled ? "Rain activée" : "Rain désactivée"}
            </span>
          </label>

          {/* Presets */}
          <div style={{ display: "grid", gap: 8 }}>
            {PRESETS.map((p) => {
              const active = state.intervalMin === p.intervalMin;
              const locked = isPresetLocked(p.intervalMin);
              const disabled = !state.canManage || locked;

              return (
                <button
                  key={p.intervalMin}
                  className="btnGhostInline"
                  disabled={disabled}
                  onClick={() => setPreset(p.intervalMin)}
                  style={{
                    borderRadius: 14,
                    padding: "10px 12px",
                    fontWeight: 900,
                    opacity: locked ? 0.55 : 1,
                    cursor: disabled ? "not-allowed" : "pointer",
                    border: active ? "1px solid rgba(34,197,94,0.6)" : undefined,
                    background: active ? "rgba(34,197,94,0.08)" : undefined,
                  }}
                  title={locked ? "Réservé à l’abonnement streamer" : undefined}
                >
                  {locked ? "🔒 " : ""}
                  {p.rubiesPerUser} rubis toutes les {p.intervalMin} minutes
                </button>
              );
            })}
          </div>

          {/* Résumé */}
          <div
            style={{
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 14,
              padding: 12,
              fontSize: 12,
            }}
          >
            <div>
              🎁 <b>{state.rubiesPerUser} rubis</b> par viewer
            </div>
            <div className="muted">
              ≈ <b>{perHour} rubis / heure</b> par viewer actif
            </div>
            <div className="muted">Fenêtre d’inscription : {state.joinWindowSec}s</div>
            <div className="muted">
              État : <b>{state.phase}</b>
            </div>
          </div>

          {/* Save */}
          {state.canManage && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                className="btnGhostInline"
                onClick={save}
                disabled={saving}
                style={{ borderRadius: 14, padding: "10px 14px", fontWeight: 950 }}
              >
                <Save className="h-4 w-4" style={{ verticalAlign: "middle", marginRight: 6 }} />
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
