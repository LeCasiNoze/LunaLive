// web/src/components/admin/LunaClipAdminSection.tsx
// Section LunaClip intégrée dans AdminPage.tsx — même style que les autres sections.
// Polling /admin/lunaclip/status toutes les 3s quand la section est visible.

import * as React from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────
const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");
const API      = `${API_BASE}/admin/lunaclip`;
const POLL_MS  = 3000;

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface FrameData {
  provider:          string;
  in_bonus:          boolean;
  bet_value:         string | null;
  bet_numeric:       number | null;
  win_value:         string | null;
  win_numeric:       number | null;
  win_total_value:   string | null;
  win_total_numeric: number | null;
  free_spins:        number | null;
  multiplier:        number | null;
  multiplier_source: string | null;
  ts_sec:            number;
}

interface WorkerStatus {
  ok:         boolean;
  status:     "idle" | "running" | "stopped" | "error";
  session_id: string | null;
  provider:   string | null;
  started_at: string | null;
  hls_url:    string | null;
  last_frame: FrameData | null;
}

interface LunaEvent {
  id:               number;
  ts_sec:           number;
  provider:         string;
  in_bonus:         boolean;
  multiplier:       number;
  multiplier_source: string;
  bet_value:        string | null;
  win_value:        string | null;
  win_total_value:  string | null;
  screenshot_path:  string | null;
  triggered_at:     string;
}

interface LunaClip {
  id:         number;
  title:      string | null;
  at_sec:     number;
  created_ts: number;
  vod_url:    string | null;
}

interface ChartPoint {
  ts:    number;
  multi: number;
  bonus: boolean;
}

// ─────────────────────────────────────────────
// Pill local (même style que AdminPage)
// ─────────────────────────────────────────────
function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad" | "info" | "brand";
}) {
  const colors: Record<string, { bg: string; border: string }> = {
    good:    { bg: "rgba(34,197,94,0.14)",   border: "rgba(34,197,94,0.30)"   },
    warn:    { bg: "rgba(245,158,11,0.14)",  border: "rgba(245,158,11,0.30)"  },
    bad:     { bg: "rgba(239,68,68,0.14)",   border: "rgba(239,68,68,0.30)"   },
    info:    { bg: "rgba(56,189,248,0.14)",  border: "rgba(56,189,248,0.30)"  },
    brand:   { bg: "rgba(167,139,250,0.16)", border: "rgba(167,139,250,0.32)" },
    neutral: { bg: "rgba(255,255,255,0.08)", border: "rgba(255,255,255,0.12)" },
  };
  const c = colors[tone] ?? colors.neutral;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "6px 10px", borderRadius: 999,
      background: c.bg, border: `1px solid ${c.border}`,
      fontSize: 12, lineHeight: 1, whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function hhmmss(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return (h > 0 ? `${String(h).padStart(2, "0")}:` : "")
    + `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function fmtDuration(startedAt: string | null) {
  if (!startedAt) return "—";
  const diff = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  return `${h}h ${m}m ${s}s`;
}

// ─────────────────────────────────────────────
// Sub-component: status bar
// ─────────────────────────────────────────────
function StatBox({ label, value, highlight = false }: {
  label: string; value: string; highlight?: boolean;
}) {
  return (
    <div style={{
      padding: "10px 14px", borderRadius: 14,
      border: highlight ? "1px solid rgba(239,68,68,0.5)" : "1px solid rgba(255,255,255,0.10)",
      background: highlight ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.03)",
    }}>
      <div className="mutedSmall" style={{ opacity: 0.85, marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 950, fontSize: 16, color: highlight ? "#fca5a5" : "inherit" }}>{value}</div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main section
// ─────────────────────────────────────────────
export function LunaClipAdminSection({ adminKey }: { adminKey: string }) {
  const [status,      setStatus]      = React.useState<WorkerStatus | null>(null);
  const [events,      setEvents]      = React.useState<LunaEvent[]>([]);
  const [clips,       setClips]       = React.useState<LunaClip[]>([]);
  const [chart,       setChart]       = React.useState<ChartPoint[]>([]);
  const [hlsUrl,      setHlsUrl]      = React.useState("");
  const [alertMulti,  setAlertMulti]  = React.useState(300);
  const [intervalSec, setIntervalSec] = React.useState(1.0);
  const [loading,     setLoading]     = React.useState(false);
  const [err,         setErr]         = React.useState<string | null>(null);
  const [duration,    setDuration]    = React.useState("—");
  const [activeTab,   setActiveTab]   = React.useState<"live" | "history" | "clips">("live");

  const sessionRef = React.useRef<string | null>(null);
  const pollRef    = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const authHeader = { "x-admin-key": adminKey };

  // ── Fetch status ──
  const fetchStatus = React.useCallback(async () => {
    try {
      const r = await fetch(`${API}/status`, { headers: authHeader });
      const d = await r.json() as WorkerStatus;
      if (!d.ok) return;
      setStatus(d);

      // Nouvelle session → charger events, frames, clips
      if (d.session_id && d.session_id !== sessionRef.current) {
        sessionRef.current = d.session_id;
        fetchSessionData(d.session_id);
      }

      // Mise à jour chart depuis last_frame
      const f = d.last_frame;
      if (f?.multiplier != null) {
        setChart(prev => {
          const last = prev[prev.length - 1];
          if (last && last.ts === f.ts_sec) return prev;
          return [...prev.slice(-499), { ts: f.ts_sec, multi: f.multiplier!, bonus: f.in_bonus }];
        });
      }
    } catch { /* silencieux */ }
  }, [adminKey]);

  const fetchSessionData = async (sessionId: string) => {
    try {
      const [evR, frR, clR] = await Promise.all([
        fetch(`${API}/sessions/${sessionId}/events`, { headers: authHeader }),
        fetch(`${API}/sessions/${sessionId}/frames?limit=500`, { headers: authHeader }),
        fetch(`${API}/clips`, { headers: authHeader }),
      ]);
      const evD = await evR.json();
      const frD = await frR.json();
      const clD = await clR.json();
      if (evD.ok) setEvents(evD.events ?? []);
      if (frD.ok) setChart((frD.frames ?? []).map((f: any) => ({
        ts: parseFloat(f.ts_sec), multi: parseFloat(f.multiplier), bonus: f.in_bonus,
      })));
      if (clD.ok) setClips(clD.clips ?? []);
    } catch { /* silencieux */ }
  };

  const refreshClips = async () => {
    try {
      const r = await fetch(`${API}/clips`, { headers: authHeader });
      const d = await r.json();
      if (d.ok) setClips(d.clips ?? []);
    } catch { /* silencieux */ }
  };

  // ── Polling ──
  React.useEffect(() => {
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, POLL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchStatus]);

  // ── Timer durée ──
  React.useEffect(() => {
    const t = setInterval(() => setDuration(fmtDuration(status?.started_at ?? null)), 1000);
    return () => clearInterval(t);
  }, [status?.started_at]);

  // ── Actions ──
  const handleStart = async () => {
    if (!hlsUrl.trim()) { setErr("URL HLS requise"); return; }
    setErr(null);
    setLoading(true);
    try {
      const r = await fetch(`${API}/start`, {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ hls_url: hlsUrl, alert_multi: alertMulti, interval_sec: intervalSec }),
      });
      const d = await r.json();
      if (!d.ok) setErr(`Erreur: ${d.error}`);
      else { setEvents([]); setChart([]); setClips([]); sessionRef.current = null; }
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally { setLoading(false); }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      await fetch(`${API}/stop`, { method: "POST", headers: authHeader });
    } finally { setLoading(false); }
  };

  const handleManualClip = async () => {
    try {
      const r = await fetch(`${API}/clips/manual`, { method: "POST", headers: authHeader });
      const d = await r.json();
      if (d.ok) { await refreshClips(); }
      else setErr(`Clip: ${d.reason ?? d.error}`);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  };

  const isRunning = status?.status === "running";
  const frame     = status?.last_frame ?? null;

  return (
    <div style={{ display: "grid", gap: 14 }}>

      {/* ── Status badges ── */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {status?.status === "running"  && <Pill tone="good">● LIVE</Pill>}
        {status?.status === "stopped"  && <Pill tone="neutral">STOPPED</Pill>}
        {status?.status === "error"    && <Pill tone="bad">ERROR</Pill>}
        {status?.status === "idle"     && <Pill tone="neutral">IDLE</Pill>}
        {status?.provider && <Pill tone="brand">{status.provider.toUpperCase()}</Pill>}
        {frame?.in_bonus  && <Pill tone="info">🎁 BONUS</Pill>}
        {frame?.multiplier != null && (
          <Pill tone={frame.multiplier >= alertMulti ? "bad" : "good"}>
            x{frame.multiplier}
          </Pill>
        )}
        {isRunning && <Pill tone="neutral">⏱ {duration}</Pill>}
        <div style={{ flex: 1 }} />
        {events.length > 0 && (
          <Pill tone="warn">🚨 {events.length} EVENT{events.length > 1 ? "S" : ""}</Pill>
        )}
        {clips.length > 0 && (
          <Pill tone="info">🎬 {clips.length} clip{clips.length > 1 ? "s" : ""}</Pill>
        )}
      </div>

      {/* ── Statboxes temps réel ── */}
      {isRunning && frame && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          <StatBox label="BET"        value={frame.bet_value ?? "—"} />
          <StatBox label="WIN"        value={frame.win_value ?? "—"} />
          <StatBox label="WIN TOTAL"  value={frame.win_total_value ?? "—"} />
          <StatBox
            label="Multiplicateur"
            value={frame.multiplier != null ? `x${frame.multiplier}` : "—"}
            highlight={(frame.multiplier ?? 0) >= alertMulti}
          />
          {frame.free_spins != null && (
            <StatBox label="Free Spins" value={String(frame.free_spins)} />
          )}
        </div>
      )}

      {/* ── Onglets ── */}
      <div style={{ display: "flex", gap: 8 }}>
        {(["live", "history", "clips"] as const).map(t => (
          <button
            key={t}
            type="button"
            className={activeTab === t ? "btnPrimary" : "btnSecondary"}
            onClick={() => setActiveTab(t)}
            style={{ borderRadius: 12, padding: "8px 16px" }}
          >
            {t === "live"    ? "📡 Temps réel"  : null}
            {t === "history" ? "📋 EVENTs"       : null}
            {t === "clips"   ? "🎬 Clips LunaClip" : null}
          </button>
        ))}
      </div>

      {/* ── TAB : Temps réel (graphe) ── */}
      {activeTab === "live" && (
        <div style={{ display: "grid", gap: 14 }}>
          {chart.length > 1 ? (
            <div style={{
              borderRadius: 16, border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.02)", padding: 14,
            }}>
              <div style={{ fontWeight: 950, marginBottom: 10 }}>📈 Multiplicateur</div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
                  <XAxis
                    dataKey="ts"
                    tickFormatter={(v) => hhmmss(v)}
                    stroke="#6B7280" tick={{ fontSize: 10 }}
                  />
                  <YAxis stroke="#6B7280" tick={{ fontSize: 10 }} />
                    <Tooltip
                    contentStyle={{ background: "#111827", border: "none", borderRadius: 8, fontSize: 12 }}
                    formatter={(value: unknown) => {
                        const n =
                        typeof value === "number" ? value :
                        typeof value === "string" ? Number(value) :
                        NaN;

                        const txt = Number.isFinite(n) ? `x${n}` : "—";
                        return [txt, "Multi"] as const;
                    }}
                    labelFormatter={(label: unknown) => {
                        const t =
                        typeof label === "number" ? label :
                        typeof label === "string" ? Number(label) :
                        0;

                        return hhmmss(Number.isFinite(t) ? t : 0);
                    }}
                    />

                  <ReferenceLine
                    y={alertMulti}
                    stroke="#EF4444"
                    strokeDasharray="4 4"
                    label={{ value: `x${alertMulti}`, fill: "#EF4444", fontSize: 10 }}
                  />
                  <Line
                    type="monotone" dataKey="multi"
                    stroke="#10B981" strokeWidth={2} dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="mutedSmall" style={{
              padding: 20, textAlign: "center", opacity: 0.6,
              borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)",
            }}>
              {isRunning ? "En attente de données OCR…" : "Lance une analyse pour voir le graphe."}
            </div>
          )}

          {/* Bouton clip manuel si running */}
          {isRunning && (
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                className="btnSecondary"
                type="button"
                onClick={handleManualClip}
                disabled={!frame}
                style={{ borderRadius: 12 }}
              >
                🎬 Créer clip maintenant
              </button>
              <div className="mutedSmall" style={{ opacity: 0.7 }}>
                Crée un clip au timecode actuel (sans attendre un EVENT).
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB : EVENTs ── */}
      {activeTab === "history" && (
        <div style={{ display: "grid", gap: 10 }}>
          {events.length === 0 ? (
            <div className="mutedSmall" style={{ opacity: 0.6, padding: 12 }}>
              Aucun EVENT déclenché dans cette session.
            </div>
          ) : (
            [...events].reverse().map((e) => (
              <div key={e.id} style={{
                borderRadius: 14,
                border: "1px solid rgba(239,68,68,0.25)",
                background: "rgba(239,68,68,0.06)",
                padding: "10px 14px",
                display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
              }}>
                <span style={{ fontWeight: 950, fontSize: 18, color: "#fca5a5" }}>
                  x{e.multiplier}
                </span>
                <Pill tone="brand">{e.provider?.toUpperCase()}</Pill>
                {e.in_bonus && <Pill tone="info">BONUS</Pill>}
                <span className="mutedSmall">
                  WIN = {e.win_total_value ?? e.win_value ?? "—"}
                </span>
                <span className="mutedSmall">
                  BET = {e.bet_value ?? "—"}
                </span>
                <span className="mutedSmall" style={{ marginLeft: "auto" }}>
                  {hhmmss(e.ts_sec)} · {new Date(e.triggered_at).toLocaleTimeString("fr-FR")}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── TAB : Clips LunaClip ── */}
      {activeTab === "clips" && (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              className="btnSecondary" type="button"
              onClick={refreshClips}
              style={{ borderRadius: 12 }}
            >
              🔄 Rafraîchir
            </button>
            <Pill tone="info">{clips.length} clip{clips.length > 1 ? "s" : ""}</Pill>
          </div>

          {clips.length === 0 ? (
            <div className="mutedSmall" style={{ opacity: 0.6, padding: 12 }}>
              Aucun clip LunaClip pour le moment.
            </div>
          ) : (
            clips.map((c) => (
              <div key={c.id} style={{
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.03)",
                padding: "10px 14px",
                display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
              }}>
                <span style={{ fontWeight: 950 }}>🎬</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  {c.title ?? "(sans titre)"}
                </span>
                <Pill tone="neutral">@ {hhmmss(c.at_sec)}</Pill>
                {c.vod_url ? (
                  <a
                    href={c.vod_url}
                    target="_blank"
                    rel="noreferrer"
                    className="btnGhostSmall"
                    style={{
                      borderRadius: 10,
                      border: "1px solid rgba(56,189,248,0.30)",
                      background: "rgba(56,189,248,0.08)",
                      padding: "4px 10px", fontSize: 12,
                    }}
                  >
                    ▶ VOD
                  </a>
                ) : (
                  <Pill tone="neutral">Pas de VOD</Pill>
                )}
                <span className="mutedSmall" style={{ opacity: 0.7 }}>
                  {new Date(c.created_ts).toLocaleString("fr-FR")}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Config + Contrôles ── */}
      <div style={{
        borderRadius: 16, border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.02)", padding: 14,
        display: "grid", gap: 12,
      }}>
        <div style={{ fontWeight: 950 }}>⚙️ Configuration</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, alignItems: "end" }}>
          <div className="field" style={{ margin: 0 }}>
            <label>URL HLS</label>
            <input
              value={hlsUrl}
              onChange={e => setHlsUrl(e.target.value)}
              placeholder="https://ton-site.com/hls?u=..."
              disabled={isRunning}
            />
          </div>
          <div className="field" style={{ margin: 0, width: 110 }}>
            <label>Seuil EVENT (x)</label>
            <input
              type="number" min={10} max={9999} step={10}
              value={alertMulti}
              onChange={e => setAlertMulti(Number(e.target.value))}
              disabled={isRunning}
            />
          </div>
          <div className="field" style={{ margin: 0, width: 110 }}>
            <label>Intervalle (s)</label>
            <input
              type="number" min={0.5} max={5} step={0.5}
              value={intervalSec}
              onChange={e => setIntervalSec(Number(e.target.value))}
              disabled={isRunning}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {!isRunning ? (
            <button
              className="btnPrimary" type="button"
              onClick={handleStart} disabled={loading}
            >
              {loading ? "Démarrage…" : "▶ Démarrer l'analyse"}
            </button>
          ) : (
            <button
              className="btnSecondary" type="button"
              onClick={handleStop} disabled={loading}
              style={{ border: "1px solid rgba(239,68,68,0.40)", background: "rgba(239,68,68,0.10)" }}
            >
              {loading ? "Arrêt…" : "■ Stopper"}
            </button>
          )}
          {err && (
            <div className="mutedSmall" style={{
              padding: "8px 12px", borderRadius: 10,
              border: "1px solid rgba(239,68,68,0.25)",
              background: "rgba(239,68,68,0.10)",
            }}>
              ⚠️ {err}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}