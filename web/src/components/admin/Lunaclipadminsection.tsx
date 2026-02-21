// web/src/components/admin/LunaClipAdminSection.tsx
// ═══ LunaClip Control Center v1.8 ═══
import * as React from "react";
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");
const API      = `${API_BASE}/admin/lunaclip`;
const POLL_MS  = 2000;

// ─────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────
const T = {
  bg0:    "#08080a",
  bg1:    "#0f0f12",
  bg2:    "#161619",
  bg3:    "#1c1c21",
  bg4:    "#232328",
  border: "rgba(255,255,255,0.06)",
  bord2:  "rgba(255,255,255,0.11)",
  text:   "#e2e2ea",
  muted:  "rgba(226,226,234,0.40)",
  dim:    "rgba(226,226,234,0.22)",
  green:  "#22c55e",
  yellow: "#f59e0b",
  red:    "#ef4444",
  blue:   "#38bdf8",
  purple: "#a78bfa",
  orange: "#fb923c",
  accent: "#00ff88",
  mono:   "'JetBrains Mono','Fira Code',monospace",
};

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface ParseDebug {
  provider_detected: string;
  in_bonus: boolean;
  bet_raw: string|null;
  win_raw: string|null;
  win_total_raw: string|null;
  bet_reason: string;
  win_reason: string;
  win_total_reason: string;
  removed_lines?: string[];   // ✅ v1.8
}
interface FrameData {
  provider: string; in_bonus: boolean;
  bet_value: string|null; bet_numeric: number|null;
  win_value: string|null; win_numeric: number|null;
  win_total_value: string|null; win_total_numeric: number|null;
  free_spins: number|null; multiplier: number|null;
  multiplier_source: string|null; ts_sec: number;
  has_value: boolean;
  raw_ocr: string|null;
  filtered_ocr: string|null;   // ✅ v1.8 : texte après filtrage
  parse_debug: ParseDebug|null;
}
interface WorkerStats {
  mode: string; consecutive_unknown: number;
  frames_total: number; frames_with_value: number; last_value_secs_ago: number;
}
interface WorkerInfo {
  streamer_id: number; streamer_slug: string; dlive_slug: string;
  session_id: string; status: string; started_at: string;
  elapsed_sec: number; hls_url: string; provider: string|null;
  last_frame: FrameData|null; worker_stats: WorkerStats;
}
interface SchedulerState {
  max_workers: number; min_watch_sec: number;
  ram_limit_mb: number;
  waiting: string[]; skipped_ram: string[];
  alert_multi?: number;
  locked?: boolean;
  locked_streamer_id?: number|null;
  locked_until_ms?: number|null;
}
interface GlobalStatus {
  ok: boolean;
  active_count: number;
  alert_multi: number;
  workers: WorkerInfo[];
  memory_mb: number;
  ram_limit_mb: number;
  cpu_pct?: number;
  cpu_limit_cores?: number|null;
  skipped_ram: string[];
  waiting_slugs: string[];
  scheduler: SchedulerState;
  bot_unreachable?: boolean;
  bot_error?: string|null;
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
interface LogEntry {
  ts: number; slug: string; source: string; msg: string;
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
function fmtAgo(startedAt: string|null) {
  if (!startedAt) return "—";
  const d = Math.floor((Date.now()-new Date(startedAt).getTime())/1000);
  if (d < 60) return `${d}s`;
  if (d < 3600) return `${Math.floor(d/60)}m ${d%60}s`;
  return `${Math.floor(d/3600)}h ${Math.floor((d%3600)/60)}m`;
}
function fmtTs(ts: number) {
  return new Date(ts).toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit", second:"2-digit" });
}

// ─────────────────────────────────────────────
// Micro-composants
// ─────────────────────────────────────────────
function Badge({ children, color = T.muted, bg }: {
  children: React.ReactNode; color?: string; bg?: string;
}) {
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:4,
      padding:"2px 8px", borderRadius:4,
      background: bg ?? `${color}18`,
      border:`1px solid ${color}44`,
      color, fontSize:11, fontWeight:700,
      letterSpacing:"0.04em", whiteSpace:"nowrap",
      fontFamily: T.mono,
    }}>{children}</span>
  );
}

function Btn({ children, onClick, disabled, color, small, danger }: {
  children: React.ReactNode; onClick?: () => void;
  disabled?: boolean; color?: string; small?: boolean; danger?: boolean;
}) {
  const c = danger ? T.red : color ?? T.bord2;
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: disabled ? T.bg3 : `${c}11`,
      border: `1px solid ${disabled ? T.border : c}`,
      color: disabled ? T.dim : (danger ? T.red : T.text),
      borderRadius: 7, cursor: disabled ? "not-allowed" : "pointer",
      padding: small ? "3px 10px" : "6px 14px",
      fontSize: small ? 11 : 12,
      fontWeight: 700, transition: "all 0.15s",
      opacity: disabled ? 0.5 : 1,
    }}>{children}</button>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: T.bg2, border:`1px solid ${T.border}`,
      borderRadius: 10, overflow:"hidden",
      ...style,
    }}>{children}</div>
  );
}

function CardHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding:"8px 14px",
      borderBottom:`1px solid ${T.border}`,
      background: T.bg3,
      display:"flex", alignItems:"center", gap:8,
      fontSize:11, fontWeight:800,
      letterSpacing:"0.1em", textTransform:"uppercase" as const,
      color: T.muted,
    }}>{children}</div>
  );
}

function RamBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, (used/limit)*100) : 0;
  const col = pct > 90 ? T.red : pct > 70 ? T.yellow : T.green;
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:3, minWidth:160 }}>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:10 }}>
        <span style={{ color:T.muted, fontWeight:700, letterSpacing:"0.08em" }}>RAM</span>
        <span style={{ color:col, fontFamily:T.mono, fontWeight:700, fontSize:11 }}>
          {used.toFixed(0)}/{limit.toFixed(0)}MB
        </span>
      </div>
      <div style={{ height:3, background:T.bg4, borderRadius:99, overflow:"hidden" }}>
        <div style={{ width:`${pct}%`, height:"100%", background:col, borderRadius:99,
          boxShadow:`0 0 6px ${col}88`, transition:"width 0.5s ease" }}/>
      </div>
    </div>
  );
}

function CpuBar({ pct, cores }: { pct: number; cores?: number|null }) {
  const p = Math.max(0, Math.min(100, pct ?? 0));
  const col = p > 90 ? T.red : p > 70 ? T.yellow : T.green;
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:3, minWidth:160 }}>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:10 }}>
        <span style={{ color:T.muted, fontWeight:700, letterSpacing:"0.08em" }}>CPU</span>
        <span style={{ color:col, fontFamily:T.mono, fontWeight:700, fontSize:11 }}>
          {p.toFixed(0)}%{cores ? ` · ${cores.toFixed(2)}c` : ""}
        </span>
      </div>
      <div style={{ height:3, background:T.bg4, borderRadius:99, overflow:"hidden" }}>
        <div style={{ width:`${p}%`, height:"100%", background:col, borderRadius:99,
          boxShadow:`0 0 6px ${col}88`, transition:"width 0.5s ease" }}/>
      </div>
    </div>
  );
}

function Dot({ color, pulse }: { color: string; pulse?: boolean }) {
  return (
    <span style={{
      display:"inline-block", width:7, height:7, borderRadius:99,
      background: color, boxShadow:`0 0 5px ${color}`,
      animation: pulse ? "pulse 2s ease-in-out infinite" : "none",
      flexShrink:0,
    }}/>
  );
}

// ─────────────────────────────────────────────
// OCR Debug Block — ✅ v1.8 : raw + filtered + removed_lines
// ─────────────────────────────────────────────
function OcrDebugBlock({ f }: { f: FrameData }) {
  const [showRemoved, setShowRemoved] = React.useState(false);
  const pd = f.parse_debug;
  const removedLines = pd?.removed_lines ?? [];
  const hasFiltered = f.filtered_ocr != null && f.filtered_ocr !== f.raw_ocr;

  return (
    <Card>
      <CardHeader>
        🔬 OCR Debug — dernière frame
        {removedLines.length > 0 && (
          <Badge color={T.orange} bg={`${T.orange}15`}>
            {removedLines.length} ligne{removedLines.length > 1 ? "s" : ""} filtrée{removedLines.length > 1 ? "s" : ""}
          </Badge>
        )}
      </CardHeader>
      <div style={{ padding:12, display:"grid", gap:10 }}>

        {/* Texte brut */}
        <div>
          <div style={{ fontSize:10, color:T.muted, fontWeight:700, letterSpacing:"0.08em", marginBottom:4 }}>
            TEXTE BRUT OCR
          </div>
          <pre style={{
            fontFamily:T.mono, fontSize:10, color:T.text, lineHeight:1.6,
            background:T.bg3, border:`1px solid ${T.border}`,
            borderRadius:6, padding:"8px 10px", margin:0,
            whiteSpace:"pre-wrap", wordBreak:"break-all", maxHeight:100, overflowY:"auto",
          }}>{f.raw_ocr || "(vide)"}</pre>
        </div>

        {/* Texte filtré — affiché seulement si différent du brut */}
        {hasFiltered && (
          <div>
            <div style={{ fontSize:10, color:T.green, fontWeight:700, letterSpacing:"0.08em", marginBottom:4 }}>
              TEXTE APRÈS FILTRAGE (ce que le parser voit)
            </div>
            <pre style={{
              fontFamily:T.mono, fontSize:10, color:T.green, lineHeight:1.6,
              background:`${T.green}08`, border:`1px solid ${T.green}33`,
              borderRadius:6, padding:"8px 10px", margin:0,
              whiteSpace:"pre-wrap", wordBreak:"break-all", maxHeight:100, overflowY:"auto",
            }}>{f.filtered_ocr || "(vide après filtrage)"}</pre>
          </div>
        )}

        {/* Lignes supprimées */}
        {removedLines.length > 0 && (
          <div>
            <button onClick={() => setShowRemoved(v => !v)} style={{
              background:"none", border:"none", cursor:"pointer",
              color:T.orange, fontSize:10, fontWeight:700,
              fontFamily:T.mono, padding:0, marginBottom:4,
              display:"flex", alignItems:"center", gap:5,
            }}>
              {showRemoved ? "▼" : "▶"} LIGNES SUPPRIMÉES PAR LE FILTRE ({removedLines.length})
            </button>
            {showRemoved && (
              <div style={{
                background:T.bg3, border:`1px solid ${T.orange}33`,
                borderRadius:6, overflow:"hidden",
              }}>
                {removedLines.map((line, i) => {
                  const isPromo = line.startsWith("[PROMO]");
                  const isNoise = line.startsWith("[NOISE]");
                  const tag  = isPromo ? "[PROMO]" : isNoise ? "[NOISE]" : "[?]";
                  const text = line.replace(/^\[(PROMO|NOISE|\?)\]\s*/, "");
                  const col  = isPromo ? T.red : T.dim;
                  return (
                    <div key={i} style={{
                      padding:"3px 10px",
                      borderBottom: i < removedLines.length-1 ? `1px solid ${T.border}` : "none",
                      display:"grid", gridTemplateColumns:"55px 1fr", gap:8, alignItems:"center",
                    }}>
                      <span style={{ fontFamily:T.mono, fontSize:9, fontWeight:700, color:col }}>{tag}</span>
                      <span style={{ fontFamily:T.mono, fontSize:10, color:T.muted, wordBreak:"break-all" }}>{text}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Valeurs parsées */}
        {pd && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
            {[
              { l:"BET brut",       v: pd.bet_raw ?? "—",       r: pd.bet_reason },
              { l:"WIN brut",       v: pd.win_raw ?? "—",       r: pd.win_reason },
              { l:"WIN TOTAL brut", v: pd.win_total_raw ?? "—", r: pd.win_total_reason },
            ].map(x => (
              <div key={x.l} style={{
                background:T.bg3, borderRadius:6, padding:"8px 10px",
                border:`1px solid ${x.r==="ok" ? T.green+"33" : T.border}`,
              }}>
                <div style={{ fontSize:9, color:T.muted, fontWeight:700, letterSpacing:"0.08em" }}>{x.l}</div>
                <div style={{ fontFamily:T.mono, fontSize:12, marginTop:2 }}>{x.v}</div>
                <div style={{ fontSize:9, color: x.r==="ok" ? T.green : T.yellow, marginTop:3 }}>{x.r}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────
// Focus Overlay
// ─────────────────────────────────────────────
function FocusOverlay({ w, adminKey, alertMulti, onClose }: {
  w: WorkerInfo; adminKey: string; alertMulti: number; onClose: () => void;
}) {
  const [chart,   setChart]   = React.useState<{ts:number;multi:number}[]>([]);
  const [events,  setEvents]  = React.useState<LunaEvent[]>([]);
  const [clipMsg, setClipMsg] = React.useState<string|null>(null);
  const authH = { "x-admin-key": adminKey };

  React.useEffect(() => {
    fetch(`${API}/sessions/${w.session_id}/events`, { headers:authH })
      .then(r=>r.json()).then(d=>{ if(d.ok) setEvents(d.events??[]); }).catch(()=>{});
  }, [w.session_id]);

  React.useEffect(() => {
    const f = w.last_frame;
    if (!f?.multiplier) return;
    setChart(prev => {
      const last = prev[prev.length-1];
      if (last?.ts === f.ts_sec) return prev;
      return [...prev.slice(-499), { ts:f.ts_sec, multi:f.multiplier! }];
    });
  }, [w.last_frame]);

  const f     = w.last_frame;
  const stats = w.worker_stats ?? { mode:"ACTIVE", consecutive_unknown:0, frames_total:0, frames_with_value:0, last_value_secs_ago:0 };
  const modeCol  = stats.mode==="ACTIVE" ? T.green : stats.mode==="WATCHING" ? T.yellow : T.muted;
  const valuePct = stats.frames_total>0 ? Math.round((stats.frames_with_value/stats.frames_total)*100) : 0;

  const handleClip = async () => {
    const r = await fetch(`${API}/clips/manual`, {
      method:"POST", headers:{...authH,"Content-Type":"application/json"},
      body:JSON.stringify({ streamer_id:w.streamer_id }),
    });
    const d = await r.json();
    setClipMsg(d.ok ? "✅ Clip créé" : `⚠ ${d.reason??d.error}`);
    setTimeout(()=>setClipMsg(null), 3000);
  };

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:9999,
      background:"rgba(0,0,0,0.85)", backdropFilter:"blur(6px)",
      display:"flex", alignItems:"center", justifyContent:"center", padding:20,
    }} onClick={onClose}>
      <div style={{
        width:"100%", maxWidth:960, maxHeight:"92vh", overflowY:"auto",
        background:T.bg1, border:`1px solid ${T.bord2}`,
        borderRadius:14, boxShadow:"0 40px 100px rgba(0,0,0,0.8)",
      }} onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div style={{
          padding:"14px 20px", borderBottom:`1px solid ${T.border}`,
          display:"flex", gap:10, alignItems:"center", flexWrap:"wrap",
          background:T.bg2,
        }}>
          <Dot color={T.green} pulse/>
          <span style={{ fontWeight:900, fontSize:17 }}>{w.streamer_slug}</span>
          <span style={{ color:T.muted, fontSize:12 }}>/ {w.dlive_slug}</span>
          {w.provider && <Badge color={T.purple}>{w.provider.toUpperCase()}</Badge>}
          {f?.in_bonus && <Badge color={T.blue}>🎁 BONUS</Badge>}
          {f?.multiplier != null && (
            <Badge color={f.multiplier>=alertMulti ? T.red : T.green}>×{f.multiplier}</Badge>
          )}
          <span style={{ marginLeft:"auto", color:T.muted, fontSize:12 }}>⏱ {fmtAgo(w.started_at)}</span>
          <Btn onClick={onClose} small>✕ Fermer</Btn>
        </div>

        <div style={{ padding:16, display:"grid", gap:14 }}>

          {/* Stats grid */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))", gap:8 }}>
            {[
              { l:"Mode",         v:<Badge color={modeCol}>{stats.mode}</Badge> },
              { l:"Frames",       v:<span style={{ fontFamily:T.mono }}>{stats.frames_total}</span> },
              { l:"Détection",    v:<span style={{ fontFamily:T.mono, color:valuePct>30?T.green:T.yellow }}>{valuePct}%</span> },
              { l:"Dernière val", v:<span style={{ fontFamily:T.mono }}>{stats.last_value_secs_ago}s</span> },
              { l:"BET",          v:<span style={{ fontFamily:T.mono }}>{f?.bet_value ?? "—"}</span> },
              { l:"WIN",          v:<span style={{ fontFamily:T.mono }}>{f?.win_total_value ?? f?.win_value ?? "—"}</span> },
            ].map(s => (
              <Card key={s.l} style={{ padding:"8px 12px" }}>
                <div style={{ fontSize:10, color:T.muted, fontWeight:700, letterSpacing:"0.08em", marginBottom:4 }}>{s.l}</div>
                <div style={{ fontSize:13, fontWeight:700 }}>{s.v}</div>
              </Card>
            ))}
          </div>

          {/* Graphe */}
          {chart.length > 1 && (
            <Card>
              <CardHeader>📈 Multiplicateur — session</CardHeader>
              <div style={{ padding:"12px 4px 4px" }}>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={chart}>
                    <defs>
                      <linearGradient id="fg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={T.green} stopOpacity={0.25}/>
                        <stop offset="95%" stopColor={T.green} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)"/>
                    <XAxis dataKey="ts" tickFormatter={hhmmss} stroke={T.dim} tick={{fontSize:9,fill:T.dim}}/>
                    <YAxis stroke={T.dim} tick={{fontSize:9,fill:T.dim}}/>
                    <Tooltip
                      contentStyle={{background:T.bg3,border:`1px solid ${T.bord2}`,borderRadius:7,fontSize:11}}
                      labelFormatter={v=>`@${hhmmss(Number(v))}`}
                    />
                    <ReferenceLine y={alertMulti} stroke={T.red} strokeDasharray="4 4"
                      label={{value:`×${alertMulti}`,fill:T.red,fontSize:9}}/>
                    <Area type="monotone" dataKey="multi" stroke={T.green} strokeWidth={2} fill="url(#fg)" dot={false}/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {/* ✅ OCR Debug block v1.8 */}
          {f && <OcrDebugBlock f={f}/>}

          {/* Events */}
          {events.length > 0 && (
            <Card>
              <CardHeader>🚨 Events session ({events.length})</CardHeader>
              <div style={{ maxHeight:200, overflowY:"auto" }}>
                {[...events].reverse().map(e => (
                  <div key={e.id} style={{
                    padding:"7px 14px", borderBottom:`1px solid ${T.border}`,
                    display:"flex", gap:10, alignItems:"center", flexWrap:"wrap",
                  }}>
                    <span style={{ fontFamily:T.mono, fontWeight:900, color:T.red, fontSize:15 }}>×{e.multiplier}</span>
                    <Badge color={T.purple}>{e.provider?.toUpperCase()}</Badge>
                    {e.in_bonus && <Badge color={T.blue}>BONUS</Badge>}
                    <span style={{ color:T.muted, fontSize:11 }}>WIN = {e.win_total_value??e.win_value??"—"}</span>
                    <span style={{ marginLeft:"auto", color:T.dim, fontSize:10 }}>
                      {new Date(e.triggered_at).toLocaleTimeString("fr-FR")}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Clip manuel */}
          <div style={{ display:"flex", gap:10, alignItems:"center" }}>
            <Btn onClick={handleClip} disabled={!f}>🎬 Clip maintenant</Btn>
            {clipMsg && <span style={{ color:T.green, fontSize:12 }}>{clipMsg}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// WorkerRow
// ─────────────────────────────────────────────
function WorkerRow({ w, alertMulti, onFocus, onForceSwitch, onSkip, onLockToggle, isWaiting, isLocked }: {
  w: WorkerInfo; alertMulti: number;
  onFocus: () => void;
  onForceSwitch?: () => void;
  onSkip: () => void;
  onLockToggle: () => void;
  isWaiting: boolean;
  isLocked: boolean;
}) {
  const [sparkline, setSparkline] = React.useState<{ts:number;multi:number}[]>([]);

  React.useEffect(() => {
    const f = w.last_frame;
    if (!f?.multiplier) return;
    setSparkline(prev => {
      const last = prev[prev.length-1];
      if (last?.ts === f.ts_sec) return prev;
      return [...prev.slice(-39), { ts:f.ts_sec, multi:f.multiplier! }];
    });
  }, [w.last_frame]);

  const f       = w.last_frame;
  const stats   = w.worker_stats ?? { mode:"ACTIVE", consecutive_unknown:0, frames_total:0, frames_with_value:0, last_value_secs_ago:0 };
  const modeCol = stats.mode==="ACTIVE" ? T.green : stats.mode==="WATCHING" ? T.yellow : T.muted;
  const multi   = f?.multiplier;
  const isBig   = multi != null && multi >= alertMulti;
  const isActive = w.status === "running";

  // ✅ Indicateur filtre OCR : si removed_lines > 0 dans la dernière frame
  const filteredCount = f?.parse_debug?.removed_lines?.length ?? 0;

  return (
    <div style={{
      background: T.bg2,
      border:`1px solid ${isLocked ? T.blue+"77" : isBig ? T.red+"55" : isWaiting ? T.yellow+"33" : T.border}`,
      borderRadius:9, overflow:"hidden",
      boxShadow: isLocked ? `0 0 20px ${T.blue}22` : isBig ? `0 0 20px ${T.red}22` : "none",
      transition:"all 0.2s",
    }}>
      <div style={{
        padding:"10px 14px",
        display:"grid",
        gridTemplateColumns:"8px auto 1fr 80px 110px 150px auto",
        gap:12, alignItems:"center",
      }}>
        {/* Dot statut */}
        <Dot color={isActive ? T.green : isWaiting ? T.yellow : T.muted} pulse={isActive}/>

        {/* Identity + badges */}
        <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
          <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
            <span style={{ fontWeight:900, fontSize:13 }}>{w.streamer_slug}</span>
            {w.provider && <Badge color={T.purple}>{w.provider.toUpperCase()}</Badge>}
            {f?.in_bonus && <Badge color={T.blue}>BONUS</Badge>}
            {isLocked && <Badge color={T.blue}>🔒 LOCK</Badge>}
            {isWaiting && !isActive && <Badge color={T.yellow}>EN ATTENTE</Badge>}
            {/* ✅ v1.8 : badge filtre si des lignes ont été supprimées */}
            {filteredCount > 0 && (
              <Badge color={T.orange}>🔍 {filteredCount} filtrée{filteredCount>1?"s":""}</Badge>
            )}
          </div>
          <div style={{ display:"flex", gap:6, alignItems:"center" }}>
            <Badge color={modeCol}>{stats.mode}</Badge>
            <span style={{ color:T.dim, fontSize:10, fontFamily:T.mono }}>
              {stats.frames_total}f · {stats.last_value_secs_ago}s · ⏱{fmtAgo(w.started_at)}
            </span>
          </div>
        </div>

        {/* Sparkline */}
        {sparkline.length > 2 ? (
          <div style={{ height:32 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkline}>
                <ReferenceLine y={alertMulti} stroke={T.red} strokeDasharray="2 2"/>
                <Line type="monotone" dataKey="multi"
                  stroke={isBig ? T.red : T.green} strokeWidth={1.5} dot={false}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : <div/>}

        {/* Multiplicateur */}
        <div style={{ textAlign:"right" }}>
          {multi != null ? (
            <span style={{
              fontFamily:T.mono, fontSize:20, fontWeight:900,
              color:isBig ? T.red : T.text,
              textShadow:isBig ? `0 0 14px ${T.red}` : "none",
            }}>×{multi}</span>
          ) : <span style={{ color:T.dim, fontFamily:T.mono }}>—</span>}
        </div>

        {/* BET / WIN */}
        <div style={{ display:"flex", flexDirection:"column", gap:1 }}>
          <span style={{ color:T.dim, fontSize:10 }}>
            BET <span style={{ color:T.text, fontFamily:T.mono }}>{f?.bet_value??"—"}</span>
          </span>
          <span style={{ color:T.dim, fontSize:10 }}>
            WIN <span style={{ color:T.text, fontFamily:T.mono }}>
              {f?.win_total_value??f?.win_value??"—"}
            </span>
          </span>
        </div>

        {/* Actions */}
        <div style={{ display:"flex", gap:5, justifyContent:"flex-end", flexWrap:"wrap" }}>
          <Btn onClick={onFocus} small>🔍 Focus</Btn>
          {!isActive && onForceSwitch && (
            <Btn onClick={onForceSwitch} small color={T.blue}>⚡ Regarder</Btn>
          )}
          <Btn onClick={onLockToggle} small color={T.blue}>
            {isLocked ? "🔓 Unlock" : "🔒 Lock"}
          </Btn>
          <Btn onClick={onSkip} small danger>⏭ Passer</Btn>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Tab : Live
// ─────────────────────────────────────────────
function TabLive({ status, adminKey, onControl }: {
  status: GlobalStatus; adminKey: string;
  onControl: (action: string, params?: any) => Promise<void>;
}) {
  const [focusedId,   setFocusedId]   = React.useState<number|null>(null);
  const [alertInput,  setAlertInput]  = React.useState<number>(status.alert_multi ?? 300);

  React.useEffect(() => {
    setAlertInput(status.alert_multi ?? 300);
  }, [status.alert_multi]);

  const allWorkers   = status.workers ?? [];
  const waitingSlugs = new Set(status.waiting_slugs ?? []);
  const sched        = status.scheduler;
  const lockedId     = sched?.locked_streamer_id ?? null;

  const focusedWorker = allWorkers.find(w => w.streamer_id === focusedId);

  return (
    <>
      {focusedWorker && (
        <FocusOverlay w={focusedWorker} adminKey={adminKey}
          alertMulti={status.alert_multi} onClose={() => setFocusedId(null)}/>
      )}

      <div style={{ display:"grid", gap:10 }}>
        <Card>
          <CardHeader>⚙️ Contrôles scheduler</CardHeader>
          <div style={{ padding:"12px 14px", display:"flex", gap:20, flexWrap:"wrap", alignItems:"center" }}>

            {/* Workers simultanés */}
            <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
              <span style={{ fontSize:10, color:T.muted, fontWeight:700, letterSpacing:"0.08em" }}>
                WORKERS SIMULTANÉS
              </span>
              <div style={{ display:"flex", gap:4 }}>
                {[1,2,3,4].map(n => (
                  <button key={n} onClick={() => onControl("set_max_workers", { value:n })} style={{
                    background: sched?.max_workers === n ? `${T.green}22` : T.bg3,
                    border:`1px solid ${sched?.max_workers === n ? T.green : T.border}`,
                    color: sched?.max_workers === n ? T.green : T.muted,
                    borderRadius:6, padding:"4px 12px", cursor:"pointer",
                    fontSize:13, fontWeight:900, transition:"all 0.15s",
                  }}>{n}</button>
                ))}
              </div>
            </div>

            <div style={{ width:1, height:32, background:T.border }}/>

            {/* Durée min */}
            <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
              <span style={{ fontSize:10, color:T.muted, fontWeight:700, letterSpacing:"0.08em" }}>
                DURÉE MIN PAR STREAMER
              </span>
              <div style={{ display:"flex", gap:4 }}>
                {[1200, 1800, 3600].map(s => (
                  <button key={s} onClick={() => onControl("set_min_watch_sec", { value:s })} style={{
                    background: sched?.min_watch_sec === s ? `${T.blue}22` : T.bg3,
                    border:`1px solid ${sched?.min_watch_sec === s ? T.blue : T.border}`,
                    color: sched?.min_watch_sec === s ? T.blue : T.muted,
                    borderRadius:6, padding:"4px 10px", cursor:"pointer",
                    fontSize:11, fontWeight:700, transition:"all 0.15s",
                  }}>{`${Math.round(s/60)}min`}</button>
                ))}
              </div>
            </div>

            <div style={{ width:1, height:32, background:T.border }}/>

            {/* Seuil event */}
            <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
              <span style={{ fontSize:10, color:T.muted, fontWeight:700, letterSpacing:"0.08em" }}>
                SEUIL EVENT (×)
              </span>
              <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
                {[100,200,300,500,1000].map(x => (
                  <button key={x} onClick={() => onControl("set_alert_multi", { value:x })} style={{
                    background: status.alert_multi===x ? `${T.red}22` : T.bg3,
                    border:`1px solid ${status.alert_multi===x ? T.red : T.border}`,
                    color: status.alert_multi===x ? T.red : T.muted,
                    borderRadius:6, padding:"4px 10px", cursor:"pointer",
                    fontSize:11, fontWeight:800, transition:"all 0.15s",
                    fontFamily:T.mono,
                  }}>×{x}</button>
                ))}
                <input
                  value={alertInput}
                  onChange={e => setAlertInput(Number(e.target.value))}
                  type="number" min={10} max={100000}
                  style={{
                    width:90, background:T.bg4, border:`1px solid ${T.border}`,
                    color:T.text, borderRadius:6, padding:"4px 8px",
                    fontSize:11, fontFamily:T.mono,
                  }}
                />
                <Btn small onClick={() => onControl("set_alert_multi", { value: alertInput })} color={T.red}>
                  Appliquer
                </Btn>
              </div>
            </div>

            <div style={{ width:1, height:32, background:T.border }}/>

            {/* RAM + CPU */}
            <RamBar used={status.memory_mb ?? 0} limit={status.ram_limit_mb ?? 420}/>
            <CpuBar pct={status.cpu_pct ?? 0} cores={status.cpu_limit_cores ?? null}/>

            {/* Résumé droite */}
            <div style={{ marginLeft:"auto", display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
              {sched?.locked && lockedId && (
                <Badge color={T.blue}>🔒 LOCK: #{lockedId}</Badge>
              )}
              {(status.waiting_slugs??[]).length > 0 && (
                <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                  <span style={{ color:T.muted, fontSize:10 }}>EN ATTENTE :</span>
                  {(status.waiting_slugs??[]).map(s => <Badge key={s} color={T.yellow}>{s}</Badge>)}
                </div>
              )}
              {(status.skipped_ram??[]).length > 0 && (
                <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                  <Badge color={T.red}>⚠ RAM</Badge>
                  {(status.skipped_ram??[]).map(s => <Badge key={s} color={T.yellow}>{s}</Badge>)}
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Liste workers */}
        {allWorkers.length === 0 ? (
          <div style={{
            padding:40, textAlign:"center", color:T.muted, fontSize:13,
            background:T.bg2, borderRadius:9, border:`1px solid ${T.border}`,
          }}>
            Aucun streamer en live · scheduler vérifie toutes les 60s
          </div>
        ) : (
          allWorkers.map(w => (
            <WorkerRow
              key={w.streamer_id}
              w={w}
              alertMulti={status.alert_multi}
              onFocus={() => setFocusedId(w.streamer_id)}
              onForceSwitch={() => onControl("force_switch", { streamer_id: w.streamer_id })}
              onLockToggle={() => onControl("set_lock", {
                streamer_id: w.streamer_id,
                value: !(sched?.locked_streamer_id === w.streamer_id),
              })}
              onSkip={() => onControl("skip_streamer", { streamer_id: w.streamer_id })}
              isWaiting={waitingSlugs.has(w.streamer_slug)}
              isLocked={(sched?.locked_streamer_id ?? null) === w.streamer_id}
            />
          ))
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────
// Tab : Logs
// ─────────────────────────────────────────────
function TabLogs({ adminKey, workers }: { adminKey: string; workers: WorkerInfo[] }) {
  const [logs,   setLogs]   = React.useState<LogEntry[]>([]);
  const [filter, setFilter] = React.useState<string>("all");
  const [source, setSource] = React.useState<string>("all");
  const [paused, setPaused] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const authH = { "x-admin-key": adminKey };

  const fetchLogs = React.useCallback(async () => {
    if (paused) return;
    try {
      const slug = filter !== "all" ? `&slug=${filter}` : "";
      const r = await fetch(`${API}/logs?limit=150${slug}`, { headers:authH });
      const d = await r.json();
      if (d.ok) setLogs(d.logs ?? []);
    } catch {}
  }, [adminKey, filter, paused]);

  React.useEffect(() => {
    fetchLogs();
    const iv = setInterval(fetchLogs, 2000);
    return () => clearInterval(iv);
  }, [fetchLogs]);

  React.useEffect(() => {
    if (!paused) bottomRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [logs, paused]);

  const sourceColor: Record<string, string> = {
    node: T.blue, py: T.green, pyerr: T.red,
  };
  const slugs   = ["all", "scheduler", ...workers.map(w => w.streamer_slug)];
  const sources = ["all", "node", "py", "pyerr"];

  const filtered = logs.filter(l => {
    if (source !== "all" && l.source !== source) return false;
    if (search && !l.msg.toLowerCase().includes(search.toLowerCase()) &&
        !l.slug.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <Card style={{ height:"calc(100vh - 320px)", minHeight:400, display:"flex", flexDirection:"column" }}>
      <CardHeader>
        📋 Logs en direct
        <span style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center" }}>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Rechercher…" style={{
              background:T.bg4, border:`1px solid ${T.border}`,
              color:T.text, borderRadius:5, padding:"2px 8px",
              fontSize:11, fontFamily:T.mono, width:140,
            }}/>
          {sources.map(s => (
            <button key={s} onClick={()=>setSource(s)} style={{
              background: source===s ? `${sourceColor[s]??T.muted}22` : "none",
              border:`1px solid ${source===s ? (sourceColor[s]??T.muted) : T.border}`,
              color: source===s ? (sourceColor[s]??T.muted) : T.muted,
              borderRadius:4, padding:"2px 8px", cursor:"pointer", fontSize:10, fontWeight:700,
            }}>{s}</button>
          ))}
          <select value={filter} onChange={e=>setFilter(e.target.value)} style={{
            background:T.bg4, border:`1px solid ${T.border}`,
            color:T.text, borderRadius:5, padding:"2px 6px", fontSize:11,
          }}>
            {slugs.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={()=>setPaused(p=>!p)} style={{
            background: paused ? `${T.yellow}22` : "none",
            border:`1px solid ${paused ? T.yellow : T.border}`,
            color: paused ? T.yellow : T.muted,
            borderRadius:4, padding:"2px 8px", cursor:"pointer", fontSize:10, fontWeight:700,
          }}>{paused ? "▶ Reprendre" : "⏸ Pause"}</button>
        </span>
      </CardHeader>
      <div style={{ flex:1, overflowY:"auto", padding:"6px 0" }}>
        {filtered.map((l, i) => (
          <div key={i} style={{
            padding:"2px 12px",
            display:"grid", gridTemplateColumns:"60px 80px 70px 1fr",
            gap:8, alignItems:"start",
            background: l.source === "pyerr" ? "rgba(239,68,68,0.04)" : "none",
            borderLeft: l.source==="pyerr" ? `2px solid ${T.red}55` : "2px solid transparent",
          }}>
            <span style={{ fontFamily:T.mono, fontSize:9, color:T.dim, paddingTop:1 }}>
              {fmtTs(l.ts)}
            </span>
            <span style={{ fontFamily:T.mono, fontSize:9, fontWeight:700, color: sourceColor[l.source] ?? T.muted }}>
              [{l.source}]
            </span>
            <span style={{ fontFamily:T.mono, fontSize:9, color:T.purple,
              overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {l.slug}
            </span>
            <span style={{
              fontFamily:T.mono, fontSize:10,
              color: l.source==="pyerr" ? T.red : T.text,
              lineHeight:1.5, wordBreak:"break-all",
            }}>{l.msg}</span>
          </div>
        ))}
        <div ref={bottomRef}/>
      </div>
      <div style={{
        padding:"5px 12px", borderTop:`1px solid ${T.border}`,
        display:"flex", gap:8, alignItems:"center",
      }}>
        <span style={{ fontSize:10, color:T.dim }}>{filtered.length} lignes</span>
        {paused && <Badge color={T.yellow}>⏸ PAUSÉ</Badge>}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────
// Tab : Events
// ─────────────────────────────────────────────
function TabEvents({ adminKey }: { adminKey: string }) {
  const [events, setEvents] = React.useState<LunaEvent[]>([]);
  const authH = { "x-admin-key": adminKey };

  const fetch_ = async () => {
    try {
      const r = await fetch(`${API}/events/recent?limit=50`, { headers:authH });
      const d = await r.json();
      if (d.ok) setEvents(d.events ?? []);
    } catch {}
  };

  React.useEffect(() => { fetch_(); }, []);

  return (
    <div style={{ display:"grid", gap:8 }}>
      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
        <Btn onClick={fetch_}>🔄 Rafraîchir</Btn>
        <Badge color={T.yellow}>{events.length} event{events.length!==1?"s":""}</Badge>
      </div>
      {events.length === 0 ? (
        <div style={{ padding:40, textAlign:"center", color:T.muted, fontSize:13,
          background:T.bg2, borderRadius:9, border:`1px solid ${T.border}` }}>
          Aucun EVENT récent.
        </div>
      ) : events.map(e => (
        <div key={e.id} style={{
          background:T.bg2, border:`1px solid ${T.red}33`,
          borderRadius:9, padding:"10px 14px",
          display:"flex", gap:12, alignItems:"center", flexWrap:"wrap",
        }}>
          <span style={{ fontFamily:T.mono, fontWeight:900, fontSize:22, color:T.red }}>×{e.multiplier}</span>
          <Badge color={T.purple}>{e.provider?.toUpperCase()}</Badge>
          {e.in_bonus && <Badge color={T.blue}>BONUS</Badge>}
          <span style={{ fontWeight:700 }}>{e.streamer_name || e.streamer_slug}</span>
          <span style={{ color:T.muted, fontSize:12 }}>WIN = {e.win_total_value??e.win_value??"—"}</span>
          <span style={{ color:T.muted, fontSize:12 }}>BET = {e.bet_value??"—"}</span>
          <span style={{ marginLeft:"auto", color:T.dim, fontSize:11 }}>
            {new Date(e.triggered_at).toLocaleString("fr-FR")}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// Tab : Clips
// ─────────────────────────────────────────────
function TabClips({ adminKey }: { adminKey: string }) {
  const [clips, setClips] = React.useState<LunaClip[]>([]);
  const authH = { "x-admin-key": adminKey };

  const fetch_ = async () => {
    try {
      const r = await fetch(`${API}/clips?limit=50`, { headers:authH });
      const d = await r.json();
      if (d.ok) setClips(d.clips ?? []);
    } catch {}
  };

  React.useEffect(() => { fetch_(); }, []);

  return (
    <div style={{ display:"grid", gap:8 }}>
      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
        <Btn onClick={fetch_}>🔄 Rafraîchir</Btn>
        <Badge color={T.blue}>{clips.length} clip{clips.length!==1?"s":""}</Badge>
      </div>
      {clips.length === 0 ? (
        <div style={{ padding:40, textAlign:"center", color:T.muted, fontSize:13,
          background:T.bg2, borderRadius:9, border:`1px solid ${T.border}` }}>
          Aucun clip LunaClip.
        </div>
      ) : clips.map(c => (
        <div key={c.id} style={{
          background:T.bg2, border:`1px solid ${T.border}`,
          borderRadius:9, padding:"9px 14px",
          display:"flex", gap:12, alignItems:"center", flexWrap:"wrap",
        }}>
          <span style={{ fontSize:16 }}>🎬</span>
          <span style={{ fontWeight:700 }}>{c.streamer_name || c.streamer_slug}</span>
          <span style={{ color:T.muted, fontSize:12, flex:1, minWidth:0,
            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {c.title ?? "(sans titre)"}
          </span>
          <Badge color={T.muted}>@ {hhmmss(c.at_sec)}</Badge>
          {c.vod_url ? (
            <a href={c.vod_url} target="_blank" rel="noreferrer" style={{
              borderRadius:6, padding:"3px 10px", fontSize:11, fontWeight:700,
              border:`1px solid ${T.blue}44`, background:`${T.blue}11`,
              color:T.blue, textDecoration:"none",
            }}>▶ VOD</a>
          ) : <Badge color={T.dim}>Pas de VOD</Badge>}
          <span style={{ color:T.dim, fontSize:10 }}>
            {new Date(c.created_ts).toLocaleString("fr-FR")}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// Section principale
// ─────────────────────────────────────────────
export function LunaClipAdminSection({ adminKey }: { adminKey: string }) {
  const [status,    setStatus]    = React.useState<GlobalStatus|null>(null);
  const [activeTab, setActiveTab] = React.useState<"live"|"logs"|"events"|"clips">("live");
  const [ctrlMsg,   setCtrlMsg]   = React.useState<string|null>(null);
  const authH   = { "x-admin-key": adminKey };
  const pollRef = React.useRef<ReturnType<typeof setInterval>|null>(null);

  const fetchStatus = React.useCallback(async () => {
    try {
      const r = await fetch(`${API}/status`, { headers:authH });
      const d = await r.json() as GlobalStatus;
      if (d.ok) setStatus(d);
    } catch {}
  }, [adminKey]);

  React.useEffect(() => {
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, POLL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchStatus]);

  const handleControl = React.useCallback(async (action: string, params: any = {}) => {
    try {
      const r = await fetch(`${API}/control`, {
        method:"POST",
        headers:{ ...authH, "Content-Type":"application/json" },
        body:JSON.stringify({ action, ...params }),
      });
      const d = await r.json();
      if (d.ok) {
        setCtrlMsg(`✅ ${action} appliqué`);
        await fetchStatus();
      } else {
        setCtrlMsg(`⚠ ${d.error}`);
      }
    } catch {
      setCtrlMsg("⚠ Bot injoignable");
    }
    setTimeout(() => setCtrlMsg(null), 3000);
  }, [adminKey, fetchStatus]);

  const activeCount = status?.active_count ?? 0;
  const memMb       = status?.memory_mb ?? 0;
  const ramLimit    = status?.ram_limit_mb ?? 420;
  const cpuPct      = status?.cpu_pct ?? 0;
  const cpuCores    = status?.cpu_limit_cores ?? null;
  const workers     = status?.workers ?? [];

  const tabs = [
    { id:"live",   label:`📡 Live (${activeCount})` },
    { id:"logs",   label:"📋 Logs" },
    { id:"events", label:"🚨 Events" },
    { id:"clips",  label:"🎬 Clips" },
  ] as const;

  return (
    <div style={{
      display:"grid", gap:10,
      fontFamily:"system-ui,-apple-system,sans-serif",
      color:T.text,
    }}>

      {/* Barre de statut */}
      <div style={{
        display:"flex", gap:10, flexWrap:"wrap", alignItems:"center",
        padding:"10px 14px", borderRadius:9,
        background:T.bg2, border:`1px solid ${T.border}`,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:7 }}>
          <Dot color={activeCount>0 ? T.green : T.muted} pulse={activeCount>0}/>
          <span style={{ fontWeight:700, fontSize:13 }}>
            {activeCount>0 ? `${activeCount} stream${activeCount>1?"s":""} en live` : "Aucun stream en live"}
          </span>
        </div>
        <div style={{ width:1, height:16, background:T.border }}/>
        <Badge color={T.purple}>Seuil ×{status?.alert_multi ?? 300}</Badge>
        {memMb > 0 && <RamBar used={memMb} limit={ramLimit}/>}
        <CpuBar pct={cpuPct} cores={cpuCores}/>
        {status?.bot_unreachable && (
          <Badge color={T.red}>⚠ BOT INJOIGNABLE{status.bot_error ? ` · ${status.bot_error}` : ""}</Badge>
        )}
        {ctrlMsg && (
          <span style={{ fontSize:12, color:ctrlMsg.startsWith("✅") ? T.green : T.yellow }}>
            {ctrlMsg}
          </span>
        )}
        <span style={{ marginLeft:"auto", color:T.dim, fontSize:10 }}>
          Polling 2s · scheduler 60s
        </span>
      </div>

      {/* Onglets */}
      <div style={{ display:"flex", gap:5 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            background: activeTab===t.id ? T.bg3 : "none",
            border:`1px solid ${activeTab===t.id ? T.bord2 : T.border}`,
            color: activeTab===t.id ? T.text : T.muted,
            borderRadius:7, padding:"6px 16px", cursor:"pointer",
            fontSize:12, fontWeight:700, transition:"all 0.15s",
          }}>{t.label}</button>
        ))}
      </div>

      {activeTab === "live" && status && (
        <TabLive status={status} adminKey={adminKey} onControl={handleControl}/>
      )}
      {activeTab === "logs" && (
        <TabLogs adminKey={adminKey} workers={workers}/>
      )}
      {activeTab === "events" && (
        <TabEvents adminKey={adminKey}/>
      )}
      {activeTab === "clips" && (
        <TabClips adminKey={adminKey}/>
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.35} }
      `}</style>
    </div>
  );
}