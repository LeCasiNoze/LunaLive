// web/src/components/botmenu/RainTab.tsx
import * as React from "react";

function apiBase() {
  return (import.meta as any).env?.VITE_API_BASE || "https://lunalive-api.onrender.com";
}

type PublicRainState = {
  ok: boolean;
  error?: string;

  slug: string;
  enabled: boolean;
  intervalMin: 10 | 30 | 60;
  rubiesPerUser: number;

  isLive: boolean;
  phase: "disabled" | "offline" | "waiting" | "open";

  serverNowMs: number;
  nextAtMs: number | null; // prochaine ouverture (waiting)
  joinCloseAtMs: number | null; // fin inscription (open)

  roundId: number | null;
  joined: boolean;
  participants: number;
  canManage: boolean;
};

const PRESETS = [
  { intervalMin: 10 as const, rubiesPerUser: 1 },
  { intervalMin: 30 as const, rubiesPerUser: 5 },
  { intervalMin: 60 as const, rubiesPerUser: 15 },
];

function msToClock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

export function RainTab({
  token,
  slug,
  canMod,
  onClose,
  onRequireLogin,
}: {
  token: string | null;
  slug: string;
  canMod: boolean;
  onClose: () => void;
  onRequireLogin: () => void;
}) {
  const [loading, setLoading] = React.useState(false);
  const [state, setState] = React.useState<PublicRainState | null>(null);

  const [saving, setSaving] = React.useState(false);
  const [cfgEnabled, setCfgEnabled] = React.useState(false);
  const [cfgInterval, setCfgInterval] = React.useState<10 | 30 | 60>(30);

  const [nowMs, setNowMs] = React.useState(Date.now());

  const isAuthed = !!token;

  function toast(kind: "success" | "error" | "info", title: string, message?: string) {
    window.dispatchEvent(new CustomEvent("ui:toast", { detail: { kind, title, message } }));
  }

  async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
    const r = await fetch(`${apiBase()}${url}`, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const j = await r.json();
    return j;
  }

  async function refresh() {
    setLoading(true);
    try {
      const j = await getJson<PublicRainState>(`/me/bot/bot_rain/public?slug=${encodeURIComponent(slug)}`);
      if (!j?.ok) throw new Error(j?.error || "rain_state_failed");
      setState(j);

      // seed cfg UI
      if (j.canManage) {
        setCfgEnabled(!!j.enabled);
        setCfgInterval(j.intervalMin);
      }
    } catch (e: any) {
      setState(null);
      toast("error", "Rain", String(e?.message || "Erreur"));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void refresh();
    // refresh réseau toutes les 5s (le compteur local se fait chaque 250ms)
    const t = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, token]);

  // horloge locale (affichage mm:ss fluide)
  React.useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);

  async function join() {
    if (!isAuthed) return onRequireLogin();
    try {
      const j = await getJson<any>(`/me/bot/bot_rain/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });

      if (!j?.ok) {
        const err = String(j?.error || "join_failed");
        if (err === "already_joined") toast("info", "Rain", "Tu es déjà inscrit ✅");
        else if (err === "not_open") toast("error", "Rain", "Inscription fermée.");
        else if (err === "offline") toast("error", "Rain", "Stream offline.");
        else if (err === "disabled") toast("error", "Rain", "Rain désactivée.");
        else toast("error", "Rain", err);
        return;
      }

      toast("success", "Rain", "Inscription validée ✅");
      await refresh();
    } catch (e: any) {
      toast("error", "Rain", String(e?.message || "Erreur"));
    }
  }

  async function saveCfg() {
    if (!isAuthed) return onRequireLogin();
    if (!canMod) return toast("error", "Rain", "Permissions insuffisantes.");
    setSaving(true);
    try {
      const j = await getJson<any>(`/me/bot/bot_rain/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, enabled: cfgEnabled, intervalMin: cfgInterval }),
      });
      if (!j?.ok) throw new Error(String(j?.error || "save_failed"));
      toast("success", "Rain", "Configuration enregistrée ✅");
      await refresh();
    } catch (e: any) {
      toast("error", "Rain", String(e?.message || "Erreur"));
    } finally {
      setSaving(false);
    }
  }

  const effective = state;
  const preset = PRESETS.find((p) => p.intervalMin === (effective?.intervalMin ?? cfgInterval)) ?? PRESETS[1];

  const phase = effective?.phase ?? "waiting";
  const live = !!effective?.isLive;

  const remainToNext =
    effective?.nextAtMs != null
      ? effective.nextAtMs - (effective.serverNowMs + (nowMs - Date.now()))
      : null;

  const remainJoin =
    effective?.joinCloseAtMs != null
      ? effective.joinCloseAtMs - (effective.serverNowMs + (nowMs - Date.now()))
      : null;

  return (
    <div style={{ padding: 14 }}>
      <div style={{ fontWeight: 950, marginBottom: 10 }}>🌧️ Rain</div>

      {loading && !effective ? (
        <div style={{ opacity: 0.75, fontWeight: 800, fontSize: 13 }}>Chargement…</div>
      ) : null}

      {effective ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* status card */}
          <div
            style={{
              padding: 12,
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.04)",
            }}
          >
            <div style={{ fontWeight: 950 }}>
              {phase === "disabled"
                ? "Désactivée"
                : !live || phase === "offline"
                ? "Stream offline (timer en pause)"
                : phase === "open"
                ? "Rain en cours — inscription ouverte"
                : "Prochaine rain"}
            </div>

            <div style={{ marginTop: 8, fontSize: 13, opacity: 0.90, fontWeight: 800 }}>
              {phase === "open" && remainJoin != null ? (
                <>
                  Temps restant pour rejoindre : <span style={{ fontWeight: 950 }}>{msToClock(remainJoin)}</span>
                </>
              ) : phase === "waiting" && remainToNext != null ? (
                <>
                  Dans : <span style={{ fontWeight: 950 }}>{msToClock(remainToNext)}</span>
                </>
              ) : phase === "disabled" ? (
                <>Active le module pour lancer des rains automatiquement.</>
              ) : null}
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
              {phase === "open" ? (
                <button
                  type="button"
                  onClick={join}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(80,255,160,0.25)",
                    background: "rgba(80,255,160,0.14)",
                    color: "white",
                    fontWeight: 950,
                    cursor: "pointer",
                  }}
                >
                  {effective.joined ? "Déjà inscrit ✅" : "Rejoindre la rain"}
                </button>
              ) : null}

              <div style={{ alignSelf: "center", fontSize: 12, opacity: 0.80, fontWeight: 900 }}>
                Gain: {preset.rubiesPerUser} rubis • Fréquence: {preset.intervalMin} min • Participants:{" "}
                {effective.participants}
              </div>
            </div>
          </div>

          {/* config mod */}
          {effective.canManage ? (
            <div
              style={{
                padding: 12,
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(124,77,255,0.10)",
              }}
            >
              <div style={{ fontWeight: 950, marginBottom: 10 }}>Configuration (streamer/mod)</div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setCfgEnabled((v) => !v)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: cfgEnabled ? "rgba(80,255,160,0.16)" : "rgba(255,255,255,0.06)",
                    color: "white",
                    fontWeight: 950,
                    cursor: "pointer",
                  }}
                >
                  {cfgEnabled ? "ON" : "OFF"}
                </button>

                <select
                  value={cfgInterval}
                  onChange={(e) => setCfgInterval(Number(e.target.value) as any)}
                  disabled={!cfgEnabled}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(0,0,0,0.25)",
                    color: "white",
                    fontWeight: 900,
                    outline: "none",
                    opacity: cfgEnabled ? 1 : 0.6,
                  }}
                >
                  <option value={10}>10 min (1 rubis)</option>
                  <option value={30}>30 min (5 rubis)</option>
                  <option value={60}>60 min (15 rubis)</option>
                </select>

                <button
                  type="button"
                  onClick={saveCfg}
                  disabled={saving}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.08)",
                    color: "white",
                    fontWeight: 950,
                    cursor: saving ? "not-allowed" : "pointer",
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? "Enregistrement…" : "Enregistrer"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                  }}
                  style={{
                    marginLeft: "auto",
                    padding: "10px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.06)",
                    color: "white",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  Fermer
                </button>
              </div>

              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.80, fontWeight: 800 }}>
                Note: la rain ne tourne que quand le stream est live. Si offline trop longtemps, le compteur se reset.
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
