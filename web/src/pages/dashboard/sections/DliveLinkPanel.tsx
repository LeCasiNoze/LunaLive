// web/src/components/dashboard/sections/DliveLinkPanel.tsx
// ══════════════════════════════════════════════════════════════
//  PURPLE VELVET — DliveLinkPanel
//  Refonte UI : machine d'états claire, countdown, code pill
//  Logique: inchangée (request / verify / toggle / unlink)
// ══════════════════════════════════════════════════════════════
import * as React from "react";
import { useAuth } from "../../../auth/AuthProvider";
import {
  dliveLinkMe,
  dliveLinkRequest,
  dliveLinkVerify,
  dliveLinkToggle,
  dliveLinkUnlink,
} from "../../../lib/api";

/* ─── Helpers ─────────────────────────────────────────────── */
function safeNowIso() { try { return new Date().toISOString(); } catch { return String(Date.now()); } }
function getErrMsg(e: any) { return String(e?.message || e?.error || "ERROR"); }

/* ─── CSS ─────────────────────────────────────────────────── */
const DLIVE_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@500;700;800&display=swap');

@keyframes dlive-pulse {
  0%,100% { box-shadow:0 0 0 0 rgba(124,92,252,.30); }
  50%      { box-shadow:0 0 0 8px rgba(124,92,252,.00); }
}
@keyframes dlive-countdown {
  from { width:100%; }
  to   { width:0%; }
}

.dlive-card {
  padding:16px; border-radius:18px;
  border:1px solid rgba(124,92,252,.16);
  background:rgba(0,0,0,.18);
  margin-top:14px;
}

.dlive-step {
  display:flex; gap:12px; align-items:flex-start;
  padding:12px 14px; border-radius:16px;
  border:1px solid rgba(124,92,252,.14);
  background:rgba(124,92,252,.06);
}

.dlive-step-num {
  width:28px; height:28px; flex-shrink:0; border-radius:50%;
  display:grid; place-items:center;
  font-family:'Syne',system-ui,sans-serif; font-weight:800; font-size:13px;
  border:1px solid rgba(124,92,252,.30); background:rgba(124,92,252,.16);
  color:rgba(196,181,253,.90);
}

.dlive-code-pill {
  display:inline-flex; align-items:center; gap:10px;
  padding:12px 18px; border-radius:16px;
  border:1px solid rgba(124,92,252,.30); background:rgba(124,92,252,.12);
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  font-weight:800; font-size:20px; letter-spacing:.08em;
  color:rgba(235,232,255,.96);
  animation:dlive-pulse 2.4s ease-in-out infinite;
}

.dlive-input {
  min-width:300px; padding:11px 13px; border-radius:13px;
  border:1px solid rgba(124,92,252,.20); background:rgba(124,92,252,.08);
  color:rgba(235,232,255,.92); outline:none;
  font-family:'Syne',system-ui,sans-serif; font-weight:700; font-size:14px;
}
.dlive-input:focus {
  border-color:rgba(124,92,252,.42); background:rgba(124,92,252,.12);
  box-shadow:0 0 0 3px rgba(124,92,252,.10);
}

.dlive-mono {
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  font-size:12px; color:rgba(167,139,250,.75); word-break:break-all;
}

.dlive-countdown-bar {
  height:3px; border-radius:99px; overflow:hidden;
  background:rgba(124,92,252,.14); margin-top:10px;
}
.dlive-countdown-fill {
  height:100%; border-radius:99px;
  background:linear-gradient(90deg,#7c5cfc,#5b8ef8);
  transition:none;
}
`;

/* ─── Chip Purple Velvet ──────────────────────────────────── */
type ChipTone = "neutral" | "pink" | "green" | "blue" | "gold";
function Chip({ tone="neutral", children }: { tone?:ChipTone; children:React.ReactNode }) {
  const tones: Record<ChipTone, { bg:string; bd:string; color:string }> = {
    neutral: { bg:"rgba(124,92,252,.08)",  bd:"rgba(124,92,252,.18)",  color:"rgba(196,181,253,.80)" },
    pink:    { bg:"rgba(236,72,153,.12)",  bd:"rgba(236,72,153,.26)",  color:"rgba(249,168,212,.90)" },
    green:   { bg:"rgba(52,211,153,.10)",  bd:"rgba(52,211,153,.22)",  color:"rgba(110,231,183,.90)" },
    blue:    { bg:"rgba(91,142,248,.12)",  bd:"rgba(91,142,248,.24)",  color:"rgba(147,197,253,.90)" },
    gold:    { bg:"rgba(251,191,36,.12)",  bd:"rgba(251,191,36,.24)",  color:"rgba(253,230,138,.90)" },
  };
  const t = tones[tone];
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:7,
      padding:"6px 12px", borderRadius:999,
      border:`1px solid ${t.bd}`, background:t.bg,
      fontSize:11, fontWeight:800, whiteSpace:"nowrap",
      color:t.color, fontFamily:"'Syne',system-ui,sans-serif",
    }}>{children}</span>
  );
}

/* ─── SectionLabel ────────────────────────────────────────── */
function SectionLabel({ children }: { children:React.ReactNode }) {
  return (
    <div style={{ fontSize:11, fontWeight:700, letterSpacing:".06em", textTransform:"uppercase", color:"rgba(167,139,250,.55)", fontFamily:"'Syne',system-ui,sans-serif", marginBottom:8 }}>
      {children}
    </div>
  );
}

/* ─── Main component ──────────────────────────────────────── */
export function DliveLinkPanel() {
  const { token } = useAuth();

  const logIdRef = React.useRef(`DliveLinkPanel:${Math.random().toString(16).slice(2, 8)}`);
  const LOG = React.useCallback((event:string, data?:any) => {
    try { /* eslint-disable-next-line no-console */ console.log(`[${logIdRef.current}] ${safeNowIso()} ${event}`, data ?? ""); } catch {}
  }, []);

  const VERIFY_WINDOW_MS = 120_000;

  const [me,       setMe]       = React.useState<any>(null);
  const [loading,  setLoading]  = React.useState(false);
  const [channel,  setChannel]  = React.useState("");
  const [err,      setErr]      = React.useState<string|null>(null);
  const [phase,    setPhase]    = React.useState<string|null>(null);

  const [verifying,     setVerifying]     = React.useState(false);
  const [verifyEndsAt,  setVerifyEndsAt]  = React.useState<number|null>(null);
  const [verifyLeftSec, setVerifyLeftSec] = React.useState<number>(0);

  const autoStartedForCodeRef = React.useRef<string|null>(null);
  const seqRef = React.useRef(0);

  /* ── Countdown ── */
  React.useEffect(() => {
    if (!verifyEndsAt) { setVerifyLeftSec(0); return; }
    const tick = () => {
      const leftMs = Math.max(0, verifyEndsAt - Date.now());
      setVerifyLeftSec(Math.ceil(leftMs / 1000));
    };
    tick();
    const it = setInterval(tick, 250);
    return () => clearInterval(it);
  }, [verifyEndsAt]);

  /* ── Reload ── */
  const reload = React.useCallback(async () => {
    const seq = ++seqRef.current;
    setErr(null);
    if (!token) { setMe(null); LOG("reload:skip:no-token",{ seq }); return null; }
    LOG("reload:start",{ seq });
    const t0 = performance.now();
    try {
      const data = await dliveLinkMe(token);
      const ms = Math.round(performance.now() - t0);
      setMe(data);
      LOG("reload:ok",{ seq, ms, ok:!!data?.ok, linkedDisplayname:data?.linkedDisplayname??null, linkedUsername:data?.linkedUsername??null, useLinked:!!data?.useLinked, pending:data?.pending?{ requestedDisplayname:data.pending.requestedDisplayname, requestedUsername:data.pending.requestedUsername, code:data.pending.code, expiresAt:data.pending.expiresAt }:null });
      return data;
    } catch(e:any) {
      const ms = Math.round(performance.now() - t0);
      const msg = getErrMsg(e);
      setErr(msg); LOG("reload:err",{ seq, ms, msg, e }); return null;
    }
  }, [token, LOG]);

  React.useEffect(() => { LOG("mount"); reload(); /* eslint-disable-next-line */ }, []);
  React.useEffect(() => { reload(); }, [reload]);

  /* ── Listen window ── */
  const startListenWindow = React.useCallback(async (opts:{ reason:string; expectedCode?:string|null }) => {
    if (!token) return;
    const seq = ++seqRef.current;
    LOG("dlive:listen:start",{ seq, reason:opts.reason, expectedCode:opts.expectedCode??null });
    setErr(null); setPhase("listening_chat"); setVerifying(true); setVerifyEndsAt(Date.now() + VERIFY_WINDOW_MS);
    const t0 = performance.now();
    try {
      await dliveLinkVerify(token, { timeoutMs: VERIFY_WINDOW_MS });
      const ms = Math.round(performance.now() - t0);
      LOG("dlive:listen:ok",{ seq, ms, reason:opts.reason });
      setPhase("verified"); setVerifying(false); setVerifyEndsAt(null);
      await reload();
    } catch(e:any) {
      const ms = Math.round(performance.now() - t0);
      const msg = getErrMsg(e);
      LOG("dlive:listen:err",{ seq, ms, msg, reason:opts.reason, e });
      setVerifying(false); setVerifyEndsAt(null);
      if (String(msg).toUpperCase().includes("TIMEOUT")) {
        setPhase("timeout_need_regen");
        setErr("On n'a pas vu le code dans les 2 minutes. Regénère un code, puis renvoie-le dans ton chat DLive.");
      } else { setPhase("error_listen"); setErr(msg); }
      await reload();
    }
  }, [VERIFY_WINDOW_MS, LOG, reload, token]);

  /* ── Auto-listen on pending ── */
  React.useEffect(() => {
    if (!token || !me?.ok) return;
    if (!!me?.linkedDisplayname) return;
    const pending = me?.pending;
    if (!pending?.code || verifying) return;
    const code = String(pending.code || "").trim();
    if (!code || autoStartedForCodeRef.current === code) return;
    autoStartedForCodeRef.current = code;
    LOG("dlive:autoListen:trigger",{ code, requestedDisplayname:pending?.requestedDisplayname, requestedUsername:pending?.requestedUsername });
    startListenWindow({ reason:"auto-on-pending", expectedCode:code });
  }, [me, token, verifying, LOG, startListenWindow]);

  /* ── Actions ── */
  async function onRequest() {
    if (!token) return;
    const seq = ++seqRef.current;
    const input = String(channel || "").trim();
    LOG("dlive:request+listen:click",{ seq, input });
    setLoading(true); setErr(null); setPhase("requesting_code");
    const t0 = performance.now();
    try {
      await dliveLinkRequest(token, channel);
      const ms = Math.round(performance.now() - t0);
      LOG("dlive:request:ok",{ seq, ms });
      setPhase("code_ready");
      const data = await reload();
      const code = String(data?.pending?.code || "").trim();
      if (code) autoStartedForCodeRef.current = code;
      await startListenWindow({ reason:"after-request", expectedCode:code||null });
    } catch(e:any) {
      const ms = Math.round(performance.now() - t0);
      const msg = getErrMsg(e);
      setErr(msg); setPhase("error_request");
      LOG("dlive:request:err",{ seq, ms, msg, e });
    } finally { setLoading(false); }
  }

  async function onToggle(v: boolean) {
    if (!token) return;
    const seq = ++seqRef.current;
    LOG("dlive:toggle:click",{ seq, v });
    setLoading(true); setErr(null); setPhase("toggling");
    const t0 = performance.now();
    try {
      await dliveLinkToggle(token, v);
      const ms = Math.round(performance.now() - t0);
      LOG("dlive:toggle:ok",{ seq, ms, v });
      setPhase("idle"); await reload();
    } catch(e:any) {
      const ms = Math.round(performance.now() - t0);
      const msg = getErrMsg(e);
      setErr(msg); setPhase("error_toggle");
      LOG("dlive:toggle:err",{ seq, ms, msg, e });
    } finally { setLoading(false); }
  }

  async function onUnlink() {
    if (!token) return;
    const seq = ++seqRef.current;
    LOG("dlive:unlink:click",{ seq });
    setLoading(true); setErr(null); setPhase("unlinking");
    const t0 = performance.now();
    try {
      await dliveLinkUnlink(token);
      const ms = Math.round(performance.now() - t0);
      LOG("dlive:unlink:ok",{ seq, ms });
      setPhase("idle"); autoStartedForCodeRef.current = null; await reload();
    } catch(e:any) {
      const ms = Math.round(performance.now() - t0);
      const msg = getErrMsg(e);
      setErr(msg); setPhase("error_unlink");
      LOG("dlive:unlink:err",{ seq, ms, msg, e });
    } finally { setLoading(false); }
  }

  /* ── Empty states ── */
  if (!token) return (
    <div className="panel">
      <style>{DLIVE_CSS}</style>
      <div className="panelTitle" style={{ fontFamily:"'Syne',system-ui,sans-serif" }}>Chaîne DLive</div>
      <div className="muted">Connecte-toi pour lier ta chaîne DLive.</div>
    </div>
  );

  if (!me?.ok) return (
    <div className="panel">
      <style>{DLIVE_CSS}</style>
      <div className="panelTitle" style={{ fontFamily:"'Syne',system-ui,sans-serif" }}>Chaîne DLive</div>
      <div style={{ fontSize:13, color:"rgba(196,181,253,.55)", fontFamily:"'Syne',system-ui,sans-serif" }}>⏳ Chargement…</div>
      {err ? <div className="hint" style={{ marginTop:10, opacity:.95 }}>⚠️ {err}</div> : null}
    </div>
  );

  const linked  = !!me.linkedDisplayname;
  const pending = me.pending;

  const countdownPct = verifyEndsAt
    ? Math.max(0, Math.min(100, ((verifyEndsAt - Date.now()) / VERIFY_WINDOW_MS) * 100))
    : 0;

  return (
    <div className="panel">
      <style>{DLIVE_CSS}</style>

      {/* ── Header ── */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap", marginBottom:4 }}>
        <div>
          <div className="panelTitle" style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:800 }}>Chaîne DLive</div>
          <div style={{ marginTop:4, fontSize:11, color:"rgba(167,139,250,.55)", fontFamily:"'Syne',system-ui,sans-serif", fontWeight:700 }}>
            Restream DLive → LunaLive
          </div>
        </div>
        <div style={{ display:"flex", gap:7, flexWrap:"wrap", alignItems:"center" }}>
          <Chip tone={linked ? "green" : "neutral"}>{linked ? "✅ Liée" : "⚠️ Non liée"}</Chip>
          <Chip tone={me.useLinked ? "blue" : "neutral"}>
            {me.useLinked ? `📡 DLive : ${me.linkedDisplayname}` : "🏷️ LunaLive only"}
          </Chip>
          {verifying ? <Chip tone="pink">🎧 Écoute… {verifyLeftSec}s</Chip> : null}
          {phase     ? <Chip tone="neutral">🔧 {phase}</Chip> : null}
        </div>
      </div>

      {/* ── Main card ── */}
      <div className="dlive-card">

        {/* Toggle Utiliser DLive */}
        <div style={{ display:"flex", alignItems:"center", gap:14, flexWrap:"wrap" }}>
          <label style={{ display:"flex", alignItems:"center", gap:10, cursor: (!linked||loading||verifying) ? "not-allowed":"pointer" }}>
            <input type="checkbox" checked={!!me.useLinked} disabled={!linked||loading||verifying}
              style={{ accentColor:"#7c5cfc", width:16, height:16 }}
              onChange={e => onToggle(e.target.checked)} />
            <span style={{ fontWeight:800, fontSize:14, fontFamily:"'Syne',system-ui,sans-serif", opacity:(!linked||loading||verifying)?.60:1 }}>
              Utiliser ma chaîne DLive
            </span>
          </label>
          {!linked ? <span style={{ fontSize:12, color:"rgba(167,139,250,.55)", fontFamily:"'Syne',system-ui,sans-serif" }}>— Disponible après liaison</span> : null}
        </div>

        {/* Liée — infos + dissocier */}
        {linked ? (
          <div style={{ marginTop:14, padding:"12px 14px", borderRadius:14, border:"1px solid rgba(52,211,153,.18)", background:"rgba(52,211,153,.07)" }}>
            <div style={{ fontWeight:800, fontSize:13, fontFamily:"'Syne',system-ui,sans-serif", color:"rgba(110,231,183,.90)" }}>
              ✅ Liée à <strong>{me.linkedDisplayname}</strong>
            </div>
            <div style={{ marginTop:10 }}>
              <button className="btnGhostSmall" onClick={onUnlink} disabled={loading||verifying}
                style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:800 }}>
                ❌ Dissocier
              </button>
            </div>
          </div>
        ) : (
          <div style={{ marginTop:14, fontSize:12, color:"rgba(167,139,250,.60)", fontFamily:"'Syne',system-ui,sans-serif" }}>
            Aucune chaîne DLive liée pour le moment.
          </div>
        )}

        {/* Séparateur */}
        <div style={{ marginTop:16, paddingTop:16, borderTop:"1px solid rgba(124,92,252,.10)" }}>

          {pending ? (
            /* ── En attente de vérification ── */
            <div>
              <SectionLabel>Vérification en cours</SectionLabel>

              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {/* Step 1 */}
                <div className="dlive-step">
                  <div className="dlive-step-num">1</div>
                  <div>
                    <div style={{ fontWeight:800, fontSize:13, fontFamily:"'Syne',system-ui,sans-serif" }}>
                      Ouvre le chat de <strong>{pending.requestedDisplayname}</strong> sur DLive
                    </div>
                    <div style={{ marginTop:4, fontSize:12, color:"rgba(167,139,250,.65)", fontFamily:"'Syne',system-ui,sans-serif" }}>
                      <a href={`https://dlive.tv/${pending.requestedDisplayname}`} target="_blank" rel="noopener noreferrer"
                        style={{ color:"rgba(167,139,250,.85)", textDecoration:"underline" }}>
                        dlive.tv/{pending.requestedDisplayname}
                      </a>
                    </div>
                  </div>
                </div>

                {/* Step 2 — code */}
                <div className="dlive-step">
                  <div className="dlive-step-num">2</div>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontWeight:800, fontSize:13, fontFamily:"'Syne',system-ui,sans-serif", marginBottom:10 }}>
                      Envoie ce code <strong>depuis ton compte streamer</strong>
                    </div>
                    <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
                      <div className="dlive-code-pill">{pending.code}</div>
                      <button className="btnGhostSmall"
                        onClick={() => { LOG("dlive:code:copy",{ code:pending.code }); navigator.clipboard?.writeText(String(pending.code||"")); }}
                        style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:800 }}>
                        📋 Copier
                      </button>
                    </div>
                  </div>
                </div>

                {/* Step 3 — auto */}
                <div className="dlive-step">
                  <div className="dlive-step-num">3</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:800, fontSize:13, fontFamily:"'Syne',system-ui,sans-serif" }}>
                      LunaLive écoute automatiquement <strong>2 minutes</strong>
                    </div>
                    {verifying ? (
                      <>
                        <div style={{ marginTop:8, display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                          <Chip tone="pink">🎧 Écoute active</Chip>
                          <span style={{ fontFamily:"ui-monospace,SFMono-Regular,Menlo,monospace", fontWeight:800, fontSize:18, color:"rgba(235,232,255,.95)" }}>
                            {verifyLeftSec}s
                          </span>
                        </div>
                        {/* Countdown bar */}
                        <div className="dlive-countdown-bar">
                          <div className="dlive-countdown-fill" style={{ width:`${countdownPct}%`, transition:`width 250ms linear` }} />
                        </div>
                      </>
                    ) : (
                      <div style={{ marginTop:6, fontSize:12, color:"rgba(167,139,250,.60)", fontFamily:"'Syne',system-ui,sans-serif" }}>
                        {phase === "verified" ? "✅ Vérifié !" : "Fenêtre d'écoute terminée — regénère un code si besoin."}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions secondaires */}
              <div style={{ display:"flex", gap:8, marginTop:14, flexWrap:"wrap" }}>
                <button className="btnGhostSmall" onClick={() => { LOG("reload:manual:click"); reload(); }} disabled={loading||verifying}
                  style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:800 }}>
                  🔄 Rafraîchir
                </button>
              </div>

              {/* Debug pending */}
              <div className="dlive-mono" style={{ marginTop:10, fontSize:11, opacity:.55 }}>
                pending: {String(pending.requestedDisplayname||"")} · {String(pending.requestedUsername||"")} · {String(pending.expiresAt||"")}
              </div>
            </div>
          ) : (
            /* ── Formulaire liaison ── */
            <div>
              <SectionLabel>Lier ta chaîne DLive</SectionLabel>

              <div style={{ fontSize:13, color:"rgba(167,139,250,.70)", fontFamily:"'Syne',system-ui,sans-serif", marginBottom:12 }}>
                Entre ton <strong>nom de chaîne DLive</strong> ou l'URL complète.
                <span className="dlive-mono" style={{ marginLeft:6, opacity:.75 }}>ex: https://dlive.tv/LeCasinoze</span>
              </div>

              <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
                <input value={channel} onChange={e => { const v=e.target.value; setChannel(v); LOG("dlive:channel:change",{ v }); }}
                  placeholder="LeCasinoze ou https://dlive.tv/LeCasinoze"
                  className="dlive-input" disabled={loading||verifying} />
                <button className="btnPrimarySmall" onClick={onRequest}
                  disabled={loading||verifying||channel.trim().length<2}
                  title="Génère un code et lance l'écoute 2 min"
                  style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:800 }}>
                  {loading ? "⏳ Génération…" : "🔗 Générer + vérifier (2 min)"}
                </button>
                <button className="btnGhostSmall" onClick={() => { LOG("reload:manual:click"); reload(); }} disabled={loading||verifying}>
                  🔄
                </button>
              </div>

              <div style={{ marginTop:12, padding:"12px 14px", borderRadius:14, border:"1px solid rgba(124,92,252,.12)", background:"rgba(124,92,252,.06)" }}>
                <div style={{ fontSize:12, fontFamily:"'Syne',system-ui,sans-serif", color:"rgba(167,139,250,.70)", lineHeight:1.65 }}>
                  <strong>Comment ça marche :</strong><br/>
                  1) Tu entres ton channel DLive et cliques <em>Générer</em>.<br/>
                  2) Un code apparaît — tu l'envoies dans ton chat DLive depuis ton compte streamer.<br/>
                  3) LunaLive écoute 2 minutes et valide automatiquement.
                </div>
              </div>
            </div>
          )}
        </div>

        {err ? <div className="hint" style={{ marginTop:14, opacity:.95 }}>⚠️ {err}</div> : null}
      </div>
    </div>
  );
}