// web/src/components/admin/LunaClipAdminSection.tsx
// Section LunaClip dans AdminPage — architecture multi-streamers automatique.
// Le scheduler Node détecte les lives et démarre les workers tout seul.
// Ce dashboard affiche l'état en temps réel de tous les workers actifs.

import * as React from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");
const API      = `${API_BASE}/admin/lunaclip`;
const POLL_MS  = 3000;

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface FrameData {
  provider: string; in_bonus: boolean;
  bet_value: string|null; bet_numeric: number|null;
  win_value: string|null; win_numeric: number|null;
  win_total_value: string|null; win_total_numeric: number|null;
  free_spins: number|null; multiplier: number|null;
  multiplier_source: string|null; ts_sec: number;
}
interface WorkerInfo {
  streamer_id: number; streamer_slug: string; dlive_slug: string;
  session_id: string; status: string; started_at: string;
  hls_url: string; provider: string|null; last_frame: FrameData|null;
}
interface GlobalStatus {
  ok: boolean; active_count: number; alert_multi: number;
  workers: WorkerInfo[];
}
interface LunaEvent {
  id: number; ts_sec: number; provider: string; in_bonus: boolean;
  multiplier: number; bet_value: string|null;
  win_value: string|null; win_total_value: string|null;
  triggered_at: string; streamer_slug: string; streamer_name: string;
}
interface LunaClip {
  id: number; title: string|null; at_sec: number;
  created_ts: number; vod_url: string|null;
  streamer_slug: string; streamer_name: string;
}

// ─────────────────────────────────────────────
// Pill (même style AdminPage)
// ─────────────────────────────────────────────
function Pill({ children, tone = "neutral" }: {
  children: React.ReactNode;
  tone?: "neutral"|"good"|"warn"|"bad"|"info"|"brand";
}) {
  const c: Record<string,{bg:string;border:string}> = {
    good:    { bg:"rgba(34,197,94,0.14)",   border:"rgba(34,197,94,0.30)"   },
    warn:    { bg:"rgba(245,158,11,0.14)",  border:"rgba(245,158,11,0.30)"  },
    bad:     { bg:"rgba(239,68,68,0.14)",   border:"rgba(239,68,68,0.30)"   },
    info:    { bg:"rgba(56,189,248,0.14)",  border:"rgba(56,189,248,0.30)"  },
    brand:   { bg:"rgba(167,139,250,0.16)", border:"rgba(167,139,250,0.32)" },
    neutral: { bg:"rgba(255,255,255,0.08)", border:"rgba(255,255,255,0.12)" },
  };
  const s = c[tone] ?? c.neutral;
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:6,
      padding:"6px 10px", borderRadius:999,
      background:s.bg, border:`1px solid ${s.border}`,
      fontSize:12, lineHeight:1, whiteSpace:"nowrap",
    }}>{children}</span>
  );
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function hhmmss(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), r = s%60;
  return (h>0?`${String(h).padStart(2,"0")}:`:"")
    +`${String(m).padStart(2,"0")}:${String(r).padStart(2,"0")}`;
}
function fmtDuration(startedAt: string|null) {
  if (!startedAt) return "—";
  const d = Math.floor((Date.now()-new Date(startedAt).getTime())/1000);
  return `${Math.floor(d/3600)}h ${Math.floor((d%3600)/60)}m ${d%60}s`;
}

// ─────────────────────────────────────────────
// WorkerCard — un streamer en live
// ─────────────────────────────────────────────
function WorkerCard({ w, adminKey, alertMulti }: {
  w: WorkerInfo; adminKey: string; alertMulti: number;
}) {
  const [chart, setChart]   = React.useState<{ts:number;multi:number}[]>([]);
  const [events, setEvents] = React.useState<LunaEvent[]>([]);
  const [open, setOpen]     = React.useState(false);
  const [clipMsg, setClipMsg] = React.useState<string|null>(null);
  const authH = { "x-admin-key": adminKey };

  // Mettre à jour chart depuis last_frame (passé en prop, re-render à chaque poll)
  React.useEffect(() => {
    const f = w.last_frame;
    if (!f?.multiplier) return;
    setChart(prev => {
      const last = prev[prev.length-1];
      if (last?.ts === f.ts_sec) return prev;
      return [...prev.slice(-299), { ts: f.ts_sec, multi: f.multiplier! }];
    });
  }, [w.last_frame]);

  const loadEvents = async () => {
    if (!w.session_id) return;
    const r = await fetch(`${API}/sessions/${w.session_id}/events`, { headers: authH });
    const d = await r.json();
    if (d.ok) setEvents(d.events ?? []);
  };

  const handleManualClip = async () => {
    const r = await fetch(`${API}/clips/manual`, {
      method:"POST",
      headers:{ ...authH, "Content-Type":"application/json" },
      body: JSON.stringify({ streamer_id: w.streamer_id }),
    });
    const d = await r.json();
    setClipMsg(d.ok ? "✅ Clip créé !" : `⚠️ ${d.reason ?? d.error}`);
    setTimeout(() => setClipMsg(null), 3000);
  };

  const f = w.last_frame;

  return (
    <div style={{
      borderRadius:16, border:"1px solid rgba(255,255,255,0.10)",
      background:"rgba(255,255,255,0.03)", overflow:"hidden",
    }}>
      {/* Header */}
      <div
        onClick={() => { setOpen(o=>!o); if (!open) loadEvents(); }}
        style={{
          padding:"12px 16px", cursor:"pointer",
          display:"flex", gap:12, alignItems:"center", flexWrap:"wrap",
          borderBottom: open ? "1px solid rgba(255,255,255,0.08)" : "none",
          background:"rgba(255,255,255,0.02)",
        }}
      >
        <Pill tone="good">● LIVE</Pill>
        <span style={{ fontWeight:950 }}>{w.streamer_slug}</span>
        <span className="mutedSmall" style={{ opacity:0.7 }}>({w.dlive_slug})</span>
        {w.provider && <Pill tone="brand">{w.provider.toUpperCase()}</Pill>}
        {f?.in_bonus && <Pill tone="info">🎁 BONUS</Pill>}
        {f?.multiplier != null && (
          <Pill tone={f.multiplier >= alertMulti ? "bad" : "good"}>
            x{f.multiplier}
          </Pill>
        )}
        {f?.win_total_value && (
          <span className="mutedSmall">WIN TOT = {f.win_total_value}</span>
        )}
        {f?.bet_value && (
          <span className="mutedSmall">BET = {f.bet_value}</span>
        )}
        <span className="mutedSmall" style={{ marginLeft:"auto", opacity:0.6 }}>
          ⏱ {fmtDuration(w.started_at)}
        </span>
        <span style={{ opacity:0.5 }}>{open ? "▲" : "▼"}</span>
      </div>

      {/* Détails dépliables */}
      {open && (
        <div style={{ padding:14, display:"grid", gap:12 }}>

          {/* Graphe */}
          {chart.length > 1 && (
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)"/>
                <XAxis dataKey="ts" tickFormatter={hhmmss} stroke="#6B7280" tick={{fontSize:10}}/>
                <YAxis stroke="#6B7280" tick={{fontSize:10}}/>
                <Tooltip
                  contentStyle={{background:"#111827",border:"none",borderRadius:8,fontSize:11}}
                  formatter={(v:number) => [`x${v}`,"Multi"]}
                  labelFormatter={(ts:number) => hhmmss(ts)}
                />
                <ReferenceLine y={alertMulti} stroke="#EF4444" strokeDasharray="4 4"
                  label={{value:`x${alertMulti}`,fill:"#EF4444",fontSize:10}}/>
                <Line type="monotone" dataKey="multi" stroke="#10B981" strokeWidth={2} dot={false}/>
              </LineChart>
            </ResponsiveContainer>
          )}

          {/* EVENTs de la session */}
          {events.length > 0 && (
            <div style={{ display:"grid", gap:6 }}>
              <div style={{ fontWeight:950, fontSize:13 }}>🚨 EVENTs</div>
              {[...events].reverse().slice(0,5).map(e => (
                <div key={e.id} style={{
                  display:"flex", gap:10, alignItems:"center", flexWrap:"wrap",
                  padding:"8px 12px", borderRadius:12,
                  border:"1px solid rgba(239,68,68,0.20)",
                  background:"rgba(239,68,68,0.05)",
                }}>
                  <span style={{ fontWeight:950, color:"#fca5a5" }}>x{e.multiplier}</span>
                  {e.in_bonus && <Pill tone="info">BONUS</Pill>}
                  <span className="mutedSmall">WIN = {e.win_total_value ?? e.win_value ?? "—"}</span>
                  <span className="mutedSmall" style={{ marginLeft:"auto" }}>
                    {new Date(e.triggered_at).toLocaleTimeString("fr-FR")}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Clip manuel */}
          <div style={{ display:"flex", gap:10, alignItems:"center" }}>
            <button
              className="btnSecondary" type="button"
              onClick={handleManualClip}
              disabled={!f}
              style={{ borderRadius:12 }}
            >
              🎬 Clip maintenant
            </button>
            {clipMsg && <span className="mutedSmall">{clipMsg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Section principale
// ─────────────────────────────────────────────
export function LunaClipAdminSection({ adminKey }: { adminKey: string }) {
  const [globalStatus, setGlobalStatus] = React.useState<GlobalStatus|null>(null);
  const [recentEvents, setRecentEvents] = React.useState<LunaEvent[]>([]);
  const [recentClips,  setRecentClips]  = React.useState<LunaClip[]>([]);
  const [activeTab,    setActiveTab]    = React.useState<"live"|"events"|"clips">("live");
  const authH = { "x-admin-key": adminKey };
  const pollRef = React.useRef<ReturnType<typeof setInterval>|null>(null);

  const fetchStatus = React.useCallback(async () => {
    try {
      const r = await fetch(`${API}/status`, { headers: authH });
      const d = await r.json() as GlobalStatus;
      if (d.ok) setGlobalStatus(d);
    } catch { /* silencieux */ }
  }, [adminKey]);

  const fetchRecentEvents = async () => {
    try {
      const r = await fetch(`${API}/events/recent?limit=20`, { headers: authH });
      const d = await r.json();
      if (d.ok) setRecentEvents(d.events ?? []);
    } catch { /* silencieux */ }
  };

  const fetchRecentClips = async () => {
    try {
      const r = await fetch(`${API}/clips?limit=50`, { headers: authH });
      const d = await r.json();
      if (d.ok) setRecentClips(d.clips ?? []);
    } catch { /* silencieux */ }
  };

  // Polling status
  React.useEffect(() => {
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, POLL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchStatus]);

  // Charger events/clips quand on change d'onglet
  React.useEffect(() => {
    if (activeTab === "events") fetchRecentEvents();
    if (activeTab === "clips")  fetchRecentClips();
  }, [activeTab]);

  const workers     = globalStatus?.workers ?? [];
  const alertMulti  = globalStatus?.alert_multi ?? 300;
  const activeCount = globalStatus?.active_count ?? 0;

  return (
    <div style={{ display:"grid", gap:14 }}>

      {/* ── Résumé global ── */}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
        <Pill tone={activeCount > 0 ? "good" : "neutral"}>
          {activeCount > 0 ? `● ${activeCount} stream${activeCount>1?"s":""} en live` : "Aucun stream en live"}
        </Pill>
        <Pill tone="brand">Seuil EVENT : x{alertMulti}</Pill>
        <div className="mutedSmall" style={{ opacity:0.6 }}>
          Le scheduler détecte automatiquement les lives toutes les 60s.
        </div>
      </div>

      {/* ── Onglets ── */}
      <div style={{ display:"flex", gap:8 }}>
        {(["live","events","clips"] as const).map(t => (
          <button key={t} type="button"
            className={activeTab===t ? "btnPrimary" : "btnSecondary"}
            onClick={() => setActiveTab(t)}
            style={{ borderRadius:12, padding:"8px 16px" }}
          >
            {t==="live"   && `📡 En live (${activeCount})`}
            {t==="events" && "🚨 EVENTs récents"}
            {t==="clips"  && "🎬 Clips LunaClip"}
          </button>
        ))}
      </div>

      {/* ── TAB : Live ── */}
      {activeTab === "live" && (
        <div style={{ display:"grid", gap:10 }}>
          {workers.length === 0 ? (
            <div style={{
              padding:24, textAlign:"center", opacity:0.5,
              borderRadius:14, border:"1px solid rgba(255,255,255,0.08)",
            }} className="mutedSmall">
              Aucun streamer en live actuellement.<br/>
              Le scheduler vérifie toutes les 60s.
            </div>
          ) : (
            workers.map(w => (
              <WorkerCard
                key={w.streamer_id}
                w={w}
                adminKey={adminKey}
                alertMulti={alertMulti}
              />
            ))
          )}
        </div>
      )}

      {/* ── TAB : EVENTs récents ── */}
      {activeTab === "events" && (
        <div style={{ display:"grid", gap:10 }}>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <button className="btnSecondary" type="button"
              onClick={fetchRecentEvents} style={{ borderRadius:12 }}>
              🔄 Rafraîchir
            </button>
            <Pill tone="warn">{recentEvents.length} event{recentEvents.length>1?"s":""}</Pill>
          </div>
          {recentEvents.length === 0 ? (
            <div className="mutedSmall" style={{ opacity:0.5, padding:12 }}>
              Aucun EVENT récent.
            </div>
          ) : (
            recentEvents.map(e => (
              <div key={e.id} style={{
                borderRadius:14,
                border:"1px solid rgba(239,68,68,0.25)",
                background:"rgba(239,68,68,0.06)",
                padding:"10px 14px",
                display:"flex", gap:12, alignItems:"center", flexWrap:"wrap",
              }}>
                <span style={{ fontWeight:950, fontSize:18, color:"#fca5a5" }}>
                  x{e.multiplier}
                </span>
                <Pill tone="brand">{e.provider?.toUpperCase()}</Pill>
                {e.in_bonus && <Pill tone="info">BONUS</Pill>}
                <span style={{ fontWeight:700 }}>{e.streamer_name || e.streamer_slug}</span>
                <span className="mutedSmall">WIN = {e.win_total_value ?? e.win_value ?? "—"}</span>
                <span className="mutedSmall">BET = {e.bet_value ?? "—"}</span>
                <span className="mutedSmall" style={{ marginLeft:"auto" }}>
                  {new Date(e.triggered_at).toLocaleString("fr-FR")}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── TAB : Clips ── */}
      {activeTab === "clips" && (
        <div style={{ display:"grid", gap:10 }}>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <button className="btnSecondary" type="button"
              onClick={fetchRecentClips} style={{ borderRadius:12 }}>
              🔄 Rafraîchir
            </button>
            <Pill tone="info">{recentClips.length} clip{recentClips.length>1?"s":""}</Pill>
          </div>
          {recentClips.length === 0 ? (
            <div className="mutedSmall" style={{ opacity:0.5, padding:12 }}>
              Aucun clip LunaClip pour le moment.
            </div>
          ) : (
            recentClips.map(c => (
              <div key={c.id} style={{
                borderRadius:14,
                border:"1px solid rgba(255,255,255,0.10)",
                background:"rgba(255,255,255,0.03)",
                padding:"10px 14px",
                display:"flex", gap:12, alignItems:"center", flexWrap:"wrap",
              }}>
                <span>🎬</span>
                <span style={{ fontWeight:700 }}>
                  {c.streamer_name || c.streamer_slug}
                </span>
                <span style={{ flex:1, minWidth:0 }} className="mutedSmall">
                  {c.title ?? "(sans titre)"}
                </span>
                <Pill tone="neutral">@ {hhmmss(c.at_sec)}</Pill>
                {c.vod_url ? (
                  <a href={c.vod_url} target="_blank" rel="noreferrer"
                    className="btnGhostSmall"
                    style={{
                      borderRadius:10, padding:"4px 10px", fontSize:12,
                      border:"1px solid rgba(56,189,248,0.30)",
                      background:"rgba(56,189,248,0.08)",
                    }}
                  >▶ VOD</a>
                ) : (
                  <Pill tone="neutral">Pas de VOD</Pill>
                )}
                <span className="mutedSmall" style={{ opacity:0.6 }}>
                  {new Date(c.created_ts).toLocaleString("fr-FR")}
                </span>
              </div>
            ))
          )}
        </div>
      )}

    </div>
  );
}