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
  intervalMin: 10 | 30 | 60 | 120;
  rubiesPerUser: number;

  isLive: boolean;
  phase: "disabled" | "offline" | "waiting" | "open";

  serverNowMs: number;
  nextAtMs: number | null;
  joinCloseAtMs: number | null;

  roundId: number | null;
  joined: boolean;
  participants: number;
};

function msToClock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

export function RainTab({
  token,
  slug,
  onRequireLogin,
}: {
  token: string | null;
  slug: string;
  onRequireLogin: () => void;
}) {
  const [loading, setLoading] = React.useState(false);
  const [state, setState] = React.useState<PublicRainState | null>(null);

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
    return r.json();
  }

  async function refresh() {
    setLoading(true);
    try {
      const j = await getJson<PublicRainState>(
        `/me/bot/bot_rain/public?slug=${encodeURIComponent(slug)}`
      );
      if (!j?.ok) throw new Error(j?.error || "rain_state_failed");
      setState(j);
    } catch (e: any) {
      setState(null);
      toast("error", "Rain", String(e?.message || "Erreur"));
    } finally {
      setLoading(false);
    }
  }

  // fetch initial + sync serveur toutes les 5s
  React.useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, token]);

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

  if (!state) {
    return (
      <div style={{ padding: 14 }}>
        <div style={{ fontWeight: 950 }}>🌧️ Rain</div>
        <div style={{ opacity: 0.75, marginTop: 8 }}>
          {loading ? "Chargement…" : "Indisponible"}
        </div>
      </div>
    );
  }

  const serverDeltaMs = Date.now() - state.serverNowMs;

  const remainToNext =
    state.nextAtMs != null
      ? state.nextAtMs - (Date.now() - serverDeltaMs)
      : null;

  const remainJoin =
    state.joinCloseAtMs != null
      ? state.joinCloseAtMs - (Date.now() - serverDeltaMs)
      : null;

  return (
    <div style={{ padding: 14 }}>
      <div style={{ fontWeight: 950, marginBottom: 10 }}>🌧️ Rain</div>

      <div
        style={{
          padding: 12,
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.04)",
        }}
      >
        <div style={{ fontWeight: 950 }}>
          {state.phase === "disabled"
            ? "Désactivée"
            : !state.isLive || state.phase === "offline"
            ? "Stream offline"
            : state.phase === "open"
            ? "Rain en cours — inscription ouverte"
            : "Prochaine rain"}
        </div>

        <div style={{ marginTop: 8, fontSize: 13, fontWeight: 800 }}>
          {state.phase === "open" && remainJoin != null
            ? <>Temps restant : <b>{msToClock(remainJoin)}</b></>
            : state.phase === "waiting" && remainToNext != null
            ? <>Dans : <b>{msToClock(remainToNext)}</b></>
            : null}
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
          {state.phase === "open" ? (
            <button
              onClick={join}
              disabled={state.joined}
              style={{
                padding: "10px 12px",
                borderRadius: 14,
                border: "1px solid rgba(80,255,160,0.25)",
                background: state.joined
                  ? "rgba(80,255,160,0.06)"
                  : "rgba(80,255,160,0.14)",
                color: "white",
                fontWeight: 950,
                cursor: state.joined ? "default" : "pointer",
              }}
            >
              {state.joined ? "Déjà inscrit ✅" : "Rejoindre la rain"}
            </button>
          ) : null}

          <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 900 }}>
            Gain: {state.rubiesPerUser} rubis • Fréquence: {state.intervalMin} min • Participants:{" "}
            {state.participants}
          </div>
        </div>
      </div>
    </div>
  );
}
