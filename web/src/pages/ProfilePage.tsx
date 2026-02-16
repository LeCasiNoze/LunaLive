// web/src/pages/ProfilePage.tsx
// ─── REWORK VISUEL Purple Velvet ─── logique 100% identique à l'original ───
import * as React from "react";
import { Link } from "react-router-dom";
import { myStreamerRequest } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";
import { AchievementsModal } from "../components/AchievementsModal";
import { PersonalisationSection } from "../components/profile/PersonalisationSection";
import {
  myFollowing,
  myProfileStats,
  type ApiFollowing,
  type ApiProfileStats,
} from "../lib/api_profile";
import { useIsMobile } from "../hooks/useIsMobile";
import ProfilePageMobile from "./ProfilePage.mobile";

const BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

const DISCORD_INVITE_URL = "https://discord.gg/93BFrsBWWB";
const DISCORD_STREAMER_REQUEST_URL = "https://discord.com/channels/1467139956249067717/1467142148431413370";

type Tab = "overview" | "personalisation" | "social" | "stats";

/* ── Helpers (identiques à l'original) ── */
function initials(name: string) {
  const s = (name || "?").trim();
  if (!s) return "?";
  const parts = s.split(/[\s._-]+/g).filter(Boolean);
  const a = parts[0]?.[0] ?? s[0];
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : s[1];
  return (a + (b ?? "")).toUpperCase();
}
function fmt(n: number) { return n.toLocaleString("fr-FR"); }
function fmtRubis(n: number | null | undefined) { if (n == null) return "—"; return fmt(n); }
function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }
function humanDuration(seconds: number | null | undefined) {
  if (seconds == null) return "—";
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60);
  if (h <= 0) return `${m} min`; if (m <= 0) return `${h} h`; return `${h} h ${m} min`;
}
function dowLabel(dow: number | null | undefined) {
  if (dow == null) return "—";
  return (["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"])[dow] ?? String(dow);
}
function hourLabel(hour: number | null | undefined) {
  if (hour == null) return "—";
  return `${String(clamp(Math.floor(hour),0,23)).padStart(2,"0")}:00`;
}
function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => { const t = setTimeout(() => setDebounced(value), delayMs); return () => clearTimeout(t); }, [value, delayMs]);
  return debounced;
}
function getAvatarUrl(u: any): string | null {
  const candidates = [u?.avatarUrl,u?.avatar_url,u?.avatar,u?.photoUrl,u?.photo_url,u?.picture,u?.imageUrl,u?.image_url].filter(Boolean);
  const v = candidates[0]; if (!v) return null; const s = String(v); if (!s) return null; return s;
}

/* ── UI Atoms — Purple Velvet ── */
function Pill({ children, tone = "neutral", title }: { children: React.ReactNode; tone?: "neutral"|"pink"|"blue"|"green"|"gold"; title?: string }) {
  const tones: Record<string, { bg: string; bd: string; color: string }> = {
    neutral: { bg: "rgba(124,92,252,.08)", bd: "rgba(124,92,252,.18)", color: "rgba(196,181,253,.80)" },
    pink:    { bg: "rgba(239,68,68,.10)",  bd: "rgba(239,68,68,.24)",  color: "rgba(252,165,165,.82)" },
    blue:    { bg: "rgba(91,142,248,.10)", bd: "rgba(91,142,248,.24)", color: "rgba(147,197,253,.82)" },
    green:   { bg: "rgba(52,211,153,.10)", bd: "rgba(52,211,153,.22)", color: "rgba(110,231,183,.82)" },
    gold:    { bg: "rgba(251,191,36,.10)", bd: "rgba(251,191,36,.24)", color: "rgba(253,230,138,.84)" },
  };
  const t = tones[tone] ?? tones.neutral;
  return (
    <span title={title} style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"8px 12px", borderRadius:999,
      border:`1px solid ${t.bd}`, background:t.bg, color:t.color,
      fontFamily:"'Syne',system-ui,sans-serif", fontSize:13, fontWeight:700, whiteSpace:"nowrap", backdropFilter:"blur(10px)" }}>
      {children}
    </span>
  );
}

function StatTile({ emoji, label, value, sub }: { emoji:string; label:string; value:React.ReactNode; sub?:React.ReactNode }) {
  return (
    <div style={{ borderRadius:18, border:"1px solid rgba(124,92,252,.14)", background:"rgba(11,9,22,.86)",
      padding:14, boxShadow:"0 14px 40px rgba(0,0,0,.30)", backdropFilter:"blur(12px)", display:"grid", gap:6, position:"relative", overflow:"hidden" }}>
      <div aria-hidden style={{ position:"absolute", top:0, left:"8%", right:"8%", height:1,
        background:"linear-gradient(90deg,transparent,rgba(167,139,250,.28) 45%,rgba(91,142,248,.18) 65%,transparent)", pointerEvents:"none" }} />
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <div style={{ width:36, height:36, borderRadius:14, display:"grid", placeItems:"center",
          background:"rgba(124,92,252,.10)", border:"1px solid rgba(124,92,252,.18)" }}>
          <span style={{ fontSize:18 }}>{emoji}</span>
        </div>
        <div style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:700, opacity:.90 }}>{label}</div>
      </div>
      <div style={{ fontSize:22, fontFamily:"'Syne',system-ui,sans-serif", fontWeight:800, letterSpacing:-0.2 }}>{value}</div>
      {sub ? <div className="muted">{sub}</div> : null}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active:boolean; onClick:()=>void; icon:string; label:string }) {
  return (
    <button onClick={onClick} style={{ display:"inline-flex", alignItems:"center", gap:10, padding:"10px 13px", borderRadius:999,
      border: active ? "1px solid rgba(124,92,252,.30)" : "1px solid rgba(124,92,252,.12)",
      background: active
        ? "linear-gradient(90deg,rgba(124,92,252,.22),rgba(59,77,200,.16),rgba(91,142,248,.12))"
        : "rgba(124,92,252,.05)",
      boxShadow: active ? "0 16px 40px rgba(0,0,0,.25)" : "none",
      color: active ? "rgba(235,232,255,.94)" : "rgba(196,181,253,.70)",
      fontFamily:"'Syne',system-ui,sans-serif", fontWeight:700, cursor:"pointer",
      backdropFilter:"blur(10px)", transition:"background 140ms ease, border-color 140ms ease" }}>
      <span style={{ fontSize:16 }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function GlassCard({ children, style }: { children:React.ReactNode; style?:React.CSSProperties }) {
  return (
    <div style={{ borderRadius:22, border:"1px solid rgba(124,92,252,.14)", background:"rgba(11,9,22,.86)",
      boxShadow:"0 18px 55px rgba(0,0,0,.32), 0 0 0 1px rgba(167,139,250,.04) inset",
      backdropFilter:"blur(14px)", position:"relative", overflow:"hidden", ...style }}>
      <div aria-hidden style={{ position:"absolute", top:0, left:"8%", right:"8%", height:1,
        background:"linear-gradient(90deg,transparent,rgba(167,139,250,.30) 40%,rgba(91,142,248,.20) 60%,transparent)", pointerEvents:"none" }} />
      {children}
    </div>
  );
}

function MiniBarList({ title, items, valueKey, onItemLink, emptyLabel }: {
  title:string; items:Array<any>; valueKey:"seconds"|"minutes"|"messages"; onItemLink:(slug:string)=>string; emptyLabel?:string;
}) {
  const max = Math.max(0, ...items.map(x => Number(x?.[valueKey]??0)||0));
  return (
    <GlassCard style={{ padding:16, minHeight:220 }}>
      <div style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:800, letterSpacing:-.3,
        display:"flex", justifyContent:"space-between", gap:10 }}>
        <span>{title}</span><span style={{ opacity:.55 }}>🏁</span>
      </div>
      {items.length === 0
        ? <div className="muted" style={{ marginTop:10 }}>{emptyLabel ?? "Pas de données pour le moment."}</div>
        : (
          <div style={{ display:"grid", gap:12, marginTop:12 }}>
            {items.map((x,idx) => {
              const v = Number(x?.[valueKey]??0)||0;
              const pct = max>0 ? (v/max)*100 : 0;
              const label = valueKey==="seconds" ? humanDuration(v) : valueKey==="minutes" ? `${fmt(v)} min` : fmt(v);
              return (
                <div key={`${x.slug??idx}`} style={{ display:"grid", gap:8 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", gap:10, alignItems:"center" }}>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:700,
                        whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", lineHeight:1.1 }}>
                        {x.displayName??x.slug}
                      </div>
                      <div className="muted" style={{ fontSize:13, marginTop:2 }}>@{x.slug}</div>
                    </div>
                    <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                      <span style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:700 }}>{label}</span>
                      <Link to={onItemLink(String(x.slug))} className="btnGhost">Voir</Link>
                    </div>
                  </div>
                  <div style={{ height:10, borderRadius:999, border:"1px solid rgba(124,92,252,.12)",
                    background:"rgba(124,92,252,.05)", overflow:"hidden" }}>
                    <div style={{ width:`${clamp(pct,0,100)}%`, height:"100%",
                      background:"linear-gradient(90deg,rgba(124,92,252,.85),rgba(59,77,200,.80),rgba(91,142,248,.75))" }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </GlassCard>
  );
}

/* ── AccountSettingsModal (identique à l'original, inputs Purple Velvet) ── */
function AccountSettingsModal({ open, onClose, token, onAfterChange }: {
  open:boolean; onClose:()=>void; token:string; onAfterChange:()=>Promise<void>|void;
}) {
  const [tab, setTab] = React.useState<"rename"|"password"|"discord">("rename");
  const [newUsername, setNewUsername] = React.useState("");
  const [renameCodeSent, setRenameCodeSent] = React.useState(false);
  const [renameCode, setRenameCode] = React.useState("");
  const [renamePay, setRenamePay] = React.useState(false);
  const [renameHint, setRenameHint] = React.useState<string|null>(null);
  const [renameBusy, setRenameBusy] = React.useState(false);
  const [passCodeSent, setPassCodeSent] = React.useState(false);
  const [passCode, setPassCode] = React.useState("");
  const [p1, setP1] = React.useState(""); const [p2, setP2] = React.useState("");
  const [showP1, setShowP1] = React.useState(false); const [showP2, setShowP2] = React.useState(false);
  const [passHint, setPassHint] = React.useState<string|null>(null);
  const [passBusy, setPassBusy] = React.useState(false);
  const [dLoading, setDLoading] = React.useState(false);
  const [dLinked, setDLinked] = React.useState(false);
  const [dInfo, setDInfo] = React.useState<any>(null);
  const [dCode, setDCode] = React.useState("");
  const [dBusy, setDBusy] = React.useState(false);
  const [dHint, setDHint] = React.useState<string|null>(null);

  React.useEffect(() => {
    if (!open) return;
    setTab("rename"); setRenameHint(null); setPassHint(null);
    setRenameCodeSent(false); setPassCodeSent(false);
    setRenameCode(""); setPassCode(""); setNewUsername(""); setRenamePay(false);
    setP1(""); setP2(""); setShowP1(false); setShowP2(false);
    setDCode(""); setDHint(null); setDLinked(false); setDInfo(null);
    loadDiscordStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  async function post(path: string, body: any) {
    const r = await fetch(`${BASE}${path}`, { method:"POST",
      headers:{"content-type":"application/json","authorization":`Bearer ${token}`}, body:JSON.stringify(body??{}) });
    const data = await r.json().catch(()=>({})); return { r, data };
  }
  async function get(path: string) {
    const r = await fetch(`${BASE}${path}`, { method:"GET", headers:{"authorization":`Bearer ${token}`} });
    const data = await r.json().catch(()=>({})); return { r, data };
  }

  async function loadDiscordStatus() {
    setDLoading(true); setDHint(null);
    try {
      const { r, data } = await get("/me/discord-link");
      if (!r.ok || data?.ok===false) throw new Error(data?.error||`HTTP ${r.status}`);
      setDLinked(!!data.linked); setDInfo(data.link||null);
    } catch (e:any) { setDHint(String(e?.message||"Erreur chargement statut Discord")); setDLinked(false); setDInfo(null); }
    finally { setDLoading(false); }
  }
  async function consumeDiscordCode() {
    setDBusy(true); setDHint(null);
    try {
      const code = String(dCode||"").trim();
      const { r, data } = await post("/me/discord-link/consume", { code });
      if (!r.ok||data?.ok===false) throw new Error(data?.error||`HTTP ${r.status}`);
      setDHint("Compte Discord lié ✅ Synchronisation en cours…"); setDCode("");
      await loadDiscordStatus(); await Promise.resolve(onAfterChange());
    } catch (e:any) {
      const msg = String(e?.message||"Erreur liaison Discord");
      if (msg==="code_not_found_or_expired") setDHint("Code invalide ou expiré.");
      else if (msg==="bad_code_format") setDHint("Format invalide. Exemple: LL-ABC123");
      else setDHint(msg);
    } finally { setDBusy(false); }
  }
  async function syncDiscordNow() {
    setDBusy(true); setDHint(null);
    try {
      const { r, data } = await post("/me/discord-link/sync", {});
      if (!r.ok||data?.ok===false) throw new Error(data?.error||`HTTP ${r.status}`);
      setDHint("Synchronisation lancée ✅"); await loadDiscordStatus();
    } catch (e:any) { setDHint(String(e?.message||"Erreur sync")); } finally { setDBusy(false); }
  }
  async function unlinkDiscord() {
    setDBusy(true); setDHint(null);
    try {
      const { r, data } = await post("/me/discord-link/unlink", {});
      if (!r.ok||data?.ok===false) throw new Error(data?.error||`HTTP ${r.status}`);
      setDHint("Compte Discord délié ✅"); await loadDiscordStatus();
    } catch (e:any) { setDHint(String(e?.message||"Erreur unlink")); } finally { setDBusy(false); }
  }
  async function sendRenameCode() {
    setRenameBusy(true); setRenameHint(null);
    try {
      const { r, data } = await post("/me/rename/request-code", { newUsername });
      if (!r.ok||(data&&data.ok===false)) throw new Error(data?.error||`HTTP ${r.status}`);
      setRenameCodeSent(true); setRenameHint("Code envoyé par email ✅");
    } catch (e:any) { setRenameHint(String(e?.message||"Erreur envoi code")); } finally { setRenameBusy(false); }
  }
  async function confirmRename() {
    setRenameBusy(true); setRenameHint(null);
    try {
      const { r, data } = await post("/me/rename/confirm", { newUsername, code:renameCode, payIfNeeded:renamePay });
      if (r.status===409&&data?.error==="cooldown") {
        setRenameHint(`Cooldown: encore ${data.remainingDays}j. Coche "payer ${data.price} rubis" pour rename maintenant.`); return;
      }
      if (!r.ok||(data&&data.ok===false)) throw new Error(data?.error||`HTTP ${r.status}`);
      try { localStorage.setItem("token",String(data.token||"")); } catch {}
      setRenameHint(`Pseudo mis à jour ✅${data.paid?` (payé ${data.paid} rubis)`:""} — refresh…`);
      await Promise.resolve(onAfterChange()); window.location.reload();
    } catch (e:any) { setRenameHint(String(e?.message||"Erreur rename")); } finally { setRenameBusy(false); }
  }
  async function sendPasswordCode() {
    setPassBusy(true); setPassHint(null);
    try {
      const { r, data } = await post("/me/password/request-code", {});
      if (!r.ok||(data&&data.ok===false)) throw new Error(data?.error||`HTTP ${r.status}`);
      setPassCodeSent(true); setPassHint("Code envoyé par email ✅");
    } catch (e:any) { setPassHint(String(e?.message||"Erreur envoi code")); } finally { setPassBusy(false); }
  }
  async function confirmPassword() {
    setPassBusy(true); setPassHint(null);
    try {
      if (!p1||p1.length<6) throw new Error("password_too_short");
      if (p1!==p2) throw new Error("password_mismatch");
      const { r, data } = await post("/me/password/confirm", { code:passCode, newPassword:p1 });
      if (!r.ok||(data&&data.ok===false)) throw new Error(data?.error||`HTTP ${r.status}`);
      setPassHint("Mot de passe mis à jour ✅"); setPassCode(""); setP1(""); setP2("");
    } catch (e:any) {
      const msg = String(e?.message||"Erreur mot de passe");
      if (msg==="password_mismatch") setPassHint("Les mots de passe ne matchent pas.");
      else if (msg==="password_too_short") setPassHint("Mot de passe trop court (min 6).");
      else setPassHint(msg);
    } finally { setPassBusy(false); }
  }

  const inputStyle: React.CSSProperties = { padding:"10px 12px", borderRadius:14, border:"1px solid rgba(124,92,252,.18)",
    background:"rgba(124,92,252,.06)", color:"inherit", outline:"none",
    fontFamily:"'Syne',system-ui,sans-serif", fontWeight:700 };

  return (
    <div role="dialog" aria-modal="true" onMouseDown={e => { if (e.target===e.currentTarget) onClose(); }}
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.60)", display:"grid", placeItems:"center", zIndex:9999, padding:14 }}>
      <div style={{ width:"min(720px, 96vw)", borderRadius:24, border:"1px solid rgba(124,92,252,.22)",
        background:"radial-gradient(900px 300px at 20% 0%,rgba(124,92,252,.28),transparent 60%), radial-gradient(700px 260px at 85% 20%,rgba(59,77,200,.18),transparent 55%), rgba(11,9,22,.92)",
        boxShadow:"0 28px 90px rgba(0,0,0,.50)", backdropFilter:"blur(18px)", padding:16, position:"relative", overflow:"hidden" }}>
        <div aria-hidden style={{ position:"absolute", top:0, left:"8%", right:"8%", height:1,
          background:"linear-gradient(90deg,transparent,rgba(167,139,250,.38) 40%,rgba(91,142,248,.28) 60%,transparent)", pointerEvents:"none" }} />
        <div style={{ display:"flex", justifyContent:"space-between", gap:10, alignItems:"center" }}>
          <div style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:800, letterSpacing:-.3, fontSize:18 }}>⚙️ Paramètres du compte</div>
          <button className="btnGhost" onClick={onClose}>✖</button>
        </div>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginTop:12 }}>
          <button className={tab==="rename"?"btnPrimary":"btnGhost"} onClick={()=>setTab("rename")}>✍️ Pseudo</button>
          <button className={tab==="password"?"btnPrimary":"btnGhost"} onClick={()=>setTab("password")}>🔒 Mot de passe</button>
          <button className={tab==="discord"?"btnPrimary":"btnGhost"} onClick={()=>setTab("discord")}>🔗 Discord</button>
        </div>

        {tab==="rename" ? (
          <div style={{ marginTop:14, display:"grid", gap:10 }}>
            <div className="muted">Rename gratuit tous les 30 jours. Sinon tu peux payer <b>1000 rubis</b>.</div>
            <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
              <input value={newUsername} onChange={e=>setNewUsername(e.target.value)} placeholder="Nouveau pseudo" style={{ flex:"1 1 240px", minWidth:220, ...inputStyle }} />
              <button className="btnGhost" onClick={sendRenameCode} disabled={renameBusy||!newUsername.trim()}>📩 Envoyer code</button>
            </div>
            {renameCodeSent ? (
              <div style={{ display:"grid", gap:10 }}>
                <input value={renameCode} onChange={e=>setRenameCode(e.target.value)} placeholder="Code (6 chiffres)" style={{ width:"min(280px,100%)", ...inputStyle }} />
                <label style={{ display:"flex", alignItems:"center", gap:10, fontFamily:"'Syne',system-ui,sans-serif", fontWeight:700 }}>
                  <input type="checkbox" checked={renamePay} onChange={e=>setRenamePay(e.target.checked)} />
                  Payer 1000 rubis si cooldown
                </label>
                <button className="btnPrimary" onClick={confirmRename} disabled={renameBusy||!renameCode.trim()||!newUsername.trim()}>✅ Valider le rename</button>
              </div>
            ) : null}
            {renameHint ? <div className="muted" style={{ opacity:.95 }}>{renameHint}</div> : null}
          </div>
        ) : null}

        {tab==="password" ? (
          <div style={{ marginTop:14, display:"grid", gap:10 }}>
            <div className="muted">Changement de mot de passe via code email.</div>
            <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
              <button className="btnGhost" onClick={sendPasswordCode} disabled={passBusy}>📩 Envoyer code</button>
              {passCodeSent ? <span className="muted">Code envoyé ✅</span> : null}
            </div>
            {passCodeSent ? (
              <div style={{ display:"grid", gap:10 }}>
                <input value={passCode} onChange={e=>setPassCode(e.target.value)} placeholder="Code (6 chiffres)" style={{ width:"min(280px,100%)", ...inputStyle }} />
                <div style={{ display:"grid", gap:8 }}>
                  <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
                    <input value={p1} onChange={e=>setP1(e.target.value)} type={showP1?"text":"password"} placeholder="Nouveau mot de passe" style={{ flex:"1 1 260px", minWidth:220, ...inputStyle }} />
                    <button className="btnGhost" onClick={()=>setShowP1(v=>!v)} type="button">{showP1?"🙈":"👁️"}</button>
                  </div>
                  <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
                    <input value={p2} onChange={e=>setP2(e.target.value)} type={showP2?"text":"password"} placeholder="Confirmer" style={{ flex:"1 1 260px", minWidth:220, ...inputStyle }} />
                    <button className="btnGhost" onClick={()=>setShowP2(v=>!v)} type="button">{showP2?"🙈":"👁️"}</button>
                  </div>
                </div>
                <button className="btnPrimary" onClick={confirmPassword} disabled={passBusy}>✅ Mettre à jour le mot de passe</button>
              </div>
            ) : null}
            {passHint ? <div className="muted" style={{ opacity:.95 }}>{passHint}</div> : null}
          </div>
        ) : null}

        {tab==="discord" ? (
          <div style={{ marginTop:14, display:"grid", gap:10 }}>
            <div className="muted">1) Sur Discord, fais <b>/link</b> pour recevoir un code par MP.<br/>2) Colle le code ici pour lier ton compte.</div>
            <div style={{ borderRadius:16, border:"1px solid rgba(124,92,252,.14)", background:"rgba(124,92,252,.05)", padding:12, display:"grid", gap:10 }}>
              {dLoading ? <div className="muted">Chargement statut…</div>
                : dLinked ? (
                  <>
                    <div style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:700 }}>Statut : lié ✅</div>
                    <div className="muted" style={{ fontSize:13 }}>
                      Discord user id : <b>{dInfo?.discordUserId}</b>
                      {dInfo?.lastSyncAt ? <> • Dernier sync : <b>{new Date(dInfo.lastSyncAt).toLocaleString("fr-FR")}</b></> : null}
                    </div>
                    <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                      <button className="btnGhost" onClick={syncDiscordNow} disabled={dBusy}>🔄 Synchroniser maintenant</button>
                      <button className="btnGhost" onClick={unlinkDiscord} disabled={dBusy}>❌ Délier</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:700 }}>Statut : non lié</div>
                    <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
                      <input value={dCode} onChange={e=>setDCode(e.target.value)} placeholder="Ex: LL-ABC123"
                        style={{ flex:"1 1 240px", minWidth:220, ...inputStyle, letterSpacing:.6, textTransform:"uppercase" }} />
                      <button className="btnPrimary" onClick={consumeDiscordCode} disabled={dBusy||!dCode.trim()}>✅ Lier</button>
                    </div>
                  </>
                )}
              {dHint ? <div className="muted" style={{ opacity:.95 }}>{dHint}</div> : null}
              <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginTop:6 }}>
                <a className="btnGhost" href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer">🔗 Rejoindre le Discord</a>
                <a className="btnGhost" href={DISCORD_STREAMER_REQUEST_URL} target="_blank" rel="noreferrer">🎥 Demande streamer</a>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ── ProfilePageDesktop — logique 100% identique à l'original ── */
function ProfilePageDesktop() {
  const { user, token, refreshMe } = useAuth();
  const [tab, setTab] = React.useState<Tab>("overview");
  const [achOpen, setAchOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [reqStatus, setReqStatus] = React.useState<string|null>(null);
  const [q, setQ] = React.useState("");
  const dq = useDebouncedValue(q, 250);
  const [following, setFollowing] = React.useState<ApiFollowing[]>([]);
  const [followLoading, setFollowLoading] = React.useState(false);
  const [followErr, setFollowErr] = React.useState<string|null>(null);
  const [stats, setStats] = React.useState<ApiProfileStats|null>(null);
  const [statsLoading, setStatsLoading] = React.useState(false);
  const [statsErr, setStatsErr] = React.useState<string|null>(null);
  const avatarUrl = user ? getAvatarUrl(user) : null;
  const [avatarOk, setAvatarOk] = React.useState(true);
  React.useEffect(() => setAvatarOk(true), [avatarUrl]);

  React.useEffect(() => {
    (async () => {
      if (!token) return setReqStatus(null);
      const r = await myStreamerRequest(token); setReqStatus(r.request?.status??null);
    })();
  }, [token]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token||tab!=="social") return;
      setFollowLoading(true); setFollowErr(null);
      try { const r = await myFollowing(token,{q:dq,limit:120}); if (cancelled) return; setFollowing(r.items); }
      catch (e:any) { if (cancelled) return; setFollowErr(e?.message??"Erreur chargement following"); setFollowing([]); }
      finally { if (!cancelled) setFollowLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [token, tab, dq]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token||tab!=="stats") return;
      setStatsLoading(true); setStatsErr(null);
      try { const r = await myProfileStats(token); if (cancelled) return; setStats(r); }
      catch (e:any) { if (cancelled) return; setStats(null); setStatsErr(e?.message??"Erreur chargement stats"); }
      finally { if (!cancelled) setStatsLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [token, tab]);

  const s: any = stats ?? {};
  const netRubis = typeof s.rubisEarnedTotal==="number"&&typeof s.rubisSpentTotal==="number" ? s.rubisEarnedTotal-s.rubisSpentTotal : null;
  const topWatchName = s.topStreamerByWatch?.displayName??null;
  const topWatchSecs = s.topStreamerByWatch?.seconds??null;
  const topByWatch: any[] = Array.isArray(s.topStreamersByWatch) ? s.topStreamersByWatch : [];
  const topByMsg:   any[] = Array.isArray(s.topStreamersByMessages) ? s.topStreamersByMessages : [];

  return (
    <main className="container" style={{ paddingBottom:28 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@500;700;800&display=swap');
        .pf-page::before {
          content:""; position:fixed; inset:0; z-index:0; pointer-events:none;
          background:
            radial-gradient(1100px 420px at 18% 0%,rgba(124,92,252,.20),transparent 62%),
            radial-gradient(1200px 500px at 80% 10%,rgba(91,142,248,.18),transparent 62%),
            radial-gradient(1200px 600px at 50% 95%,rgba(59,77,200,.16),transparent 64%);
        }
        @media (prefers-reduced-motion:no-preference) {
          .ll-float  { animation: llFloat  10s ease-in-out infinite; }
          .ll-float2 { animation: llFloat  13s ease-in-out infinite; }
          .ll-glow   { animation: llGlow    6s ease-in-out infinite; }
        }
        @keyframes llFloat { 0%,100% { transform:translateY(0px); } 50% { transform:translateY(-10px); } }
        @keyframes llGlow  { 0%,100% { filter:drop-shadow(0 0 0 rgba(255,255,255,0)); } 50% { filter:drop-shadow(0 12px 28px rgba(124,92,252,.35)); } }
        .pf-input {
          flex:1 1 240px; min-width:220px; padding:10px 12px; border-radius:14px;
          border:1px solid rgba(124,92,252,.18); background:rgba(124,92,252,.06);
          color:inherit; outline:none; font-family:'Syne',system-ui,sans-serif; font-weight:700;
          transition:border-color 150ms ease, box-shadow 150ms ease;
        }
        .pf-input:focus { border-color:rgba(124,92,252,.36); box-shadow:0 0 0 3px rgba(124,92,252,.08); }
        .pf-follow-item {
          display:flex; justify-content:space-between; align-items:center; gap:10;
          padding:12px; border-radius:16px;
          border:1px solid rgba(124,92,252,.10); background:rgba(0,0,0,.14);
          transition:background 130ms ease;
        }
        .pf-follow-item.live {
          border-color:rgba(239,68,68,.20);
          background:linear-gradient(90deg,rgba(239,68,68,.08),rgba(91,142,248,.06),rgba(11,9,22,.86));
        }
        .pf-suggestion {
          padding:12px; border-radius:16px;
          border:1px solid rgba(124,92,252,.12); background:rgba(124,92,252,.04);
        }
        @media (max-width:980px) { .pf-two-col { grid-template-columns:1fr !important; } }
      `}</style>

      <div className="pageTitle pf-page" style={{ position:"relative" }}>
        <h1 style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:800, letterSpacing:-.4,
          background:"linear-gradient(90deg,#c4b5fd,#a78bfa,#5b8ef8)", WebkitBackgroundClip:"text", backgroundClip:"text", color:"transparent" }}>
          Profil
        </h1>

        {!user ? (
          <p className="muted">Connecte-toi pour accéder à ton profil.</p>
        ) : (
          <>
            {/* HERO */}
            <div style={{ marginTop:12, borderRadius:26, border:"1px solid rgba(124,92,252,.18)",
              background:"radial-gradient(900px 280px at 15% 0%,rgba(124,92,252,.28),transparent 60%), radial-gradient(700px 260px at 85% 20%,rgba(91,142,248,.18),transparent 55%), rgba(11,9,22,.88)",
              padding:18, boxShadow:"0 24px 70px rgba(0,0,0,.40)", overflow:"hidden", position:"relative",
              backdropFilter:"blur(16px)" }}>
              <div aria-hidden style={{ position:"absolute", top:0, left:"8%", right:"8%", height:1,
                background:"linear-gradient(90deg,transparent,rgba(167,139,250,.40) 40%,rgba(91,142,248,.28) 60%,transparent)", pointerEvents:"none" }} />
              {/* déco flottante */}
              <div className="ll-float" style={{ position:"absolute", inset:"auto auto -40px -40px", width:180, height:180, borderRadius:999, pointerEvents:"none",
                background:"radial-gradient(circle at 30% 30%,rgba(59,77,200,.45),rgba(124,92,252,.08) 70%,transparent 72%)", transform:"rotate(12deg)" }} />
              <div className="ll-float2" style={{ position:"absolute", inset:"-60px -80px auto auto", width:220, height:220, borderRadius:999, pointerEvents:"none",
                background:"radial-gradient(circle at 40% 35%,rgba(91,142,248,.38),rgba(167,139,250,.08) 62%,transparent 72%)", transform:"rotate(-18deg)" }} />
              <div style={{ position:"absolute", top:14, right:18, display:"flex", gap:10, opacity:.88, pointerEvents:"none" }}>
                <span className="ll-float" style={{ fontSize:18 }}>✨</span>
                <span className="ll-float2" style={{ fontSize:18 }}>🌙</span>
                <span className="ll-float" style={{ fontSize:18 }}>💎</span>
              </div>

              <div style={{ display:"grid", gap:14, position:"relative" }}>
                {/* Identity */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:14, flexWrap:"wrap" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:14, minWidth:260 }}>
                    <div className="ll-glow" style={{ width:64, height:64, borderRadius:20,
                      border:"1px solid rgba(124,92,252,.26)", background:"linear-gradient(135deg,rgba(124,92,252,.22),rgba(59,77,200,.14),rgba(91,142,248,.10))",
                      display:"grid", placeItems:"center", overflow:"hidden", boxShadow:"0 18px 50px rgba(0,0,0,.35)" }} title={user.username}>
                      {avatarUrl&&avatarOk
                        ? <img src={avatarUrl} alt={user.username} onError={()=>setAvatarOk(false)} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                        : <div style={{ width:"100%", height:"100%", display:"grid", placeItems:"center",
                            fontFamily:"'Syne',system-ui,sans-serif", fontWeight:800, fontSize:18, letterSpacing:1,
                            background:"radial-gradient(circle at 30% 30%,rgba(255,255,255,.08),rgba(0,0,0,.20) 70%)" }}>
                            {initials(user.username)}
                          </div>}
                    </div>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontFamily:"'Syne',system-ui,sans-serif", fontSize:22, fontWeight:800, letterSpacing:-.4, lineHeight:1.1 }}>
                        {user.username} <span style={{ opacity:.75 }}>👋</span>
                      </div>
                      <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginTop:10 }}>
                        <Pill tone="blue" title="Ton rôle sur la plateforme">🛡️ <span style={{ opacity:.9 }}>Rôle</span> <b>{user.role}</b></Pill>
                        <Pill tone="gold" title="Ton solde rubis actuel">💎 <span style={{ opacity:.9 }}>Rubis</span> <b>{fmt(user.rubis)}</b></Pill>
                      </div>
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
                    <button className="btnGhost" onClick={()=>setAchOpen(true)}>🏆 Succès</button>
                    {token ? <button className="btnGhost" onClick={()=>setSettingsOpen(true)}>⚙️ Paramètres</button> : null}
                    {(user.role==="streamer"||user.role==="admin")
                      ? <Link to="/dashboard" className="btnPrimary">🚀 Dashboard streamer</Link>
                      : <a className="btnPrimary" href={DISCORD_STREAMER_REQUEST_URL} target="_blank" rel="noreferrer" title="La demande se fait sur Discord (pense à /link)">🎥 Devenir streamer</a>}
                  </div>
                </div>

                {/* Tabs */}
                <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                  <TabButton active={tab==="overview"}        onClick={()=>setTab("overview")}        icon="🌈" label="Aperçu" />
                  <TabButton active={tab==="personalisation"} onClick={()=>setTab("personalisation")} icon="🎨" label="Personnalisation" />
                  <TabButton active={tab==="social"}          onClick={()=>setTab("social")}          icon="🤝" label="Social" />
                  <TabButton active={tab==="stats"}           onClick={()=>setTab("stats")}           icon="📊" label="Stats" />
                </div>
              </div>
            </div>

            {/* ─── OVERVIEW ─── */}
            {tab==="overview" ? (
              <div className="pf-two-col" style={{ marginTop:16, display:"grid", gridTemplateColumns:"1.15fr 0.85fr", gap:14 }}>
                <div style={{ display:"grid", gap:14 }}>
                  <GlassCard style={{ padding:16 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", gap:10, flexWrap:"wrap" }}>
                      <div style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:800 }}>✨ Ton espace</div>
                      <div className="muted">Raccourcis & vibe</div>
                    </div>
                    <div style={{ marginTop:12, display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:12 }}>
                      <StatTile emoji="🏆" label="Succès" value="Collection" sub="Bronze / Silver / Gold / Master" />
                      <StatTile emoji="🎨" label="Style" value="Personnalise" sub="Pseudos, badges, frames…" />
                      <StatTile emoji="🤝" label="Following" value="Social" sub="Voir tes streamers favoris" />
                    </div>
                    <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginTop:12 }}>
                      <button className="btnPrimary" onClick={()=>setAchOpen(true)}>🏆 Ouvrir les succès</button>
                      <button className="btnGhost" onClick={()=>setTab("personalisation")}>🎨 Personnaliser</button>
                      <button className="btnGhost" onClick={()=>setTab("social")}>🤝 Voir following</button>
                      <button className="btnGhost" onClick={()=>setTab("stats")}>📊 Stats fun</button>
                    </div>
                  </GlassCard>

                  {/* Streamer card */}
                  {user.role!=="streamer"&&user.role!=="admin" ? (
                    <GlassCard style={{ padding:16, borderColor:"rgba(251,191,36,.16)",
                      background:"radial-gradient(600px 240px at 20% 0%,rgba(251,191,36,.14),transparent 55%), rgba(11,9,22,.88)" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", gap:10, flexWrap:"wrap" }}>
                        <div style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:800 }}>🎥 Devenir streamer</div>
                        <div className="muted">{reqStatus==="pending"?"En attente":reqStatus==="approved"?"Acceptée ✅":reqStatus==="rejected"?"Refusée":"Prêt ?"}</div>
                      </div>
                      <div className="muted" style={{ marginTop:10 }}>
                        {reqStatus==="pending"&&"Ta demande a été envoyée : on valide ça très vite."}
                        {reqStatus==="approved"&&"Bienvenue dans l'espace streamer 👑"}
                        {reqStatus==="rejected"&&"Demande refusée (tu peux réessayer plus tard)."}
                        {!reqStatus&&"Les demandes streamer se font sur Discord. Rejoins le serveur et poste ta demande dans le salon prévu."}
                      </div>
                      <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginTop:12, alignItems:"center" }}>
                        <a className="btnPrimary" href={DISCORD_STREAMER_REQUEST_URL} target="_blank" rel="noreferrer" title="Ouvre le salon Discord des demandes streamer">🚀 Faire une demande sur Discord</a>
                        <a className="btnGhost" href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer">🔗 Rejoindre le Discord</a>
                        <span className="muted" style={{ alignSelf:"center" }}>Pense à faire <b>/link</b> ✅</span>
                      </div>
                    </GlassCard>
                  ) : (
                    <GlassCard style={{ padding:16, borderColor:"rgba(52,211,153,.16)",
                      background:"radial-gradient(700px 260px at 20% 0%,rgba(52,211,153,.12),transparent 55%), rgba(11,9,22,.88)" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", gap:10, flexWrap:"wrap" }}>
                        <div style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:800 }}>🟢 Espace streamer</div>
                        <div className="muted">Tout est prêt</div>
                      </div>
                      <div className="muted" style={{ marginTop:10 }}>Gère ton live, ton bot, tes features et tes outils.</div>
                      <div style={{ marginTop:12 }}><Link to="/dashboard" className="btnPrimary">🚀 Ouvrir le Dashboard</Link></div>
                    </GlassCard>
                  )}
                </div>

                {/* RIGHT */}
                <div style={{ display:"grid", gap:14 }}>
                  <GlassCard style={{ padding:16 }}>
                    <div style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:800, letterSpacing:-.2,
                      display:"flex", justifyContent:"space-between" }}>
                      <span>🧭 Suggestions</span><span className="muted">petites idées</span>
                    </div>
                    <div style={{ marginTop:12, display:"grid", gap:10 }}>
                      {[
                        { icon:"🎨", title:"Personnalise ton profil", sub:"Ça rend ton pseudo + ton style beaucoup plus \"LunaLive\".", action:()=>setTab("personalisation"), label:"Aller" },
                        { icon:"🤝", title:"Fais ton \"feed\"", sub:"Suis 2-3 streamers, et reviens checker les lives 🔴", action:()=>setTab("social"), label:"Voir following" },
                        { icon:"📊", title:"Stats fun", sub:"Watchtime, messages, wheel, rubis… (clean & joli)", action:()=>setTab("stats"), label:"Ouvrir" },
                      ].map(s => (
                        <div key={s.title} className="pf-suggestion">
                          <div style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:700 }}>{s.icon} {s.title}</div>
                          <div className="muted" style={{ marginTop:4 }}>{s.sub}</div>
                          <button className="btnGhost" style={{ marginTop:10 }} onClick={s.action}>{s.label}</button>
                        </div>
                      ))}
                    </div>
                  </GlassCard>

                  <GlassCard style={{ padding:16, borderColor:"rgba(91,142,248,.16)",
                    background:"radial-gradient(600px 260px at 10% 0%,rgba(91,142,248,.16),transparent 55%), rgba(11,9,22,.88)" }}>
                    <div style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:800 }}>💡 Mini tips</div>
                    <ul style={{ margin:"10px 0 0", paddingLeft:18, lineHeight:1.8 }}>
                      <li>✨ Une belle photo = plus "premium"</li>
                      <li>🏆 Les succès donnent du rythme à ton profil</li>
                      <li>💎 Tes rubis servent pour shop + support</li>
                      <li>🌙 On ajoutera une vraie "activity timeline" ensuite</li>
                      <li>🔗 Pour devenir streamer : passe par Discord <a href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer">(lien)</a></li>
                    </ul>
                  </GlassCard>
                </div>
              </div>
            ) : null}

            {/* ─── PERSONALISATION ─── */}
            {tab==="personalisation" ? (
              <div style={{ marginTop:16 }}>
                <GlassCard style={{ padding:16, borderColor:"rgba(167,139,250,.18)",
                  background:"radial-gradient(800px 260px at 20% 0%,rgba(124,92,252,.18),transparent 55%), rgba(11,9,22,.88)" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", gap:10, flexWrap:"wrap" }}>
                    <div style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:800 }}>🎨 Personnalisation</div>
                    <div className="muted">Fais-toi plaisir ✨</div>
                  </div>
                  <div style={{ marginTop:12 }}><PersonalisationSection username={user.username} /></div>
                  <div className="muted" style={{ marginTop:12 }}>Tip: si tu ajoutes un vrai avatar côté backend, il s'affichera ici automatiquement.</div>
                </GlassCard>
              </div>
            ) : null}

            {/* ─── SOCIAL ─── */}
            {tab==="social" ? (
              <div style={{ marginTop:16 }}>
                <GlassCard style={{ padding:16, borderColor:"rgba(52,211,153,.16)",
                  background:"radial-gradient(800px 280px at 20% 0%,rgba(52,211,153,.12),transparent 55%), rgba(11,9,22,.88)" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", gap:10, flexWrap:"wrap" }}>
                    <div style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:800 }}>🤝 Following</div>
                    <div className="muted">Recherche + accès rapide</div>
                  </div>
                  <div style={{ marginTop:12, display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
                    <input value={q} onChange={e=>setQ(e.target.value)} placeholder="🔎 Rechercher…" className="pf-input" />
                    <button className="btnGhost" onClick={()=>setQ("")} disabled={!q}>Reset</button>
                  </div>
                  <div style={{ marginTop:12, borderRadius:18, border:"1px solid rgba(124,92,252,.10)",
                    background:"rgba(0,0,0,.14)", padding:10, maxHeight:420, overflow:"auto" }}>
                    {followLoading ? <div className="muted" style={{ padding:10 }}>Chargement… ⏳</div>
                      : followErr   ? <div className="muted" style={{ padding:10 }}>{followErr}</div>
                      : following.length===0 ? <div className="muted" style={{ padding:10 }}>Aucun résultat.</div>
                      : (
                        <div style={{ display:"grid", gap:10 }}>
                          {following.map((f:any) => {
                            const fAvatar = getAvatarUrl(f);
                            const live = typeof f.isLive==="boolean" ? f.isLive : null;
                            return (
                              <div key={f.id??f.slug} className={`pf-follow-item${live===true?" live":""}`}>
                                <div style={{ display:"flex", alignItems:"center", gap:12, minWidth:0 }}>
                                  <div style={{ width:44, height:44, borderRadius:16, flex:"0 0 auto",
                                    border:"1px solid rgba(124,92,252,.18)", background:"rgba(124,92,252,.08)", overflow:"hidden", display:"grid", placeItems:"center" }} title={f.displayName??f.slug}>
                                    {fAvatar ? <img src={fAvatar} alt={f.displayName??f.slug} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                                      : <div style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:700 }}>{initials(f.displayName??f.slug)}</div>}
                                  </div>
                                  <div style={{ minWidth:0 }}>
                                    <div style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:700, lineHeight:1.2,
                                      whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                                      {f.displayName??f.slug} {live===true?<span style={{ marginLeft:6 }}>🔴</span>:null}
                                    </div>
                                    <div className="muted" style={{ fontSize:13, marginTop:2 }}>@{f.slug}{live===true?" • live":live===false?" • offline":""}</div>
                                  </div>
                                </div>
                                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                                  <Link to={`/s/${f.slug}`} className="btnGhost">👀 Voir</Link>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                  </div>
                </GlassCard>
              </div>
            ) : null}

            {/* ─── STATS ─── */}
            {tab==="stats" ? (
              <div style={{ marginTop:16 }}>
                <GlassCard style={{ padding:16, borderColor:"rgba(91,142,248,.16)",
                  background:"radial-gradient(900px 300px at 20% 0%,rgba(91,142,248,.16),transparent 60%), rgba(11,9,22,.88)" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", gap:10, flexWrap:"wrap" }}>
                    <div style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:800 }}>📊 Stats fun</div>
                    <button className="btnGhost" onClick={() => {
                      setStatsLoading(true); setStatsErr(null);
                      (async () => { if (!token) return;
                        try { const r = await myProfileStats(token); setStats(r); }
                        catch (e:any) { setStats(null); setStatsErr(e?.message??"Erreur"); }
                        finally { setStatsLoading(false); }
                      })();
                    }} disabled={statsLoading} title="Rafraîchir">🔄 Rafraîchir</button>
                  </div>
                  <div className="muted" style={{ marginTop:8 }}>
                    Watchtime, messages, rubis, wheel, bonus… {statsErr?<span style={{ opacity:.9 }}>({statsErr})</span>:null}
                  </div>
                  <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginTop:12 }}>
                    <Pill title="Depuis combien de temps ton compte existe" tone="neutral">📅 {s.accountAgeDays!=null?`${fmt(s.accountAgeDays)} jours`:"—"}</Pill>
                    <Pill title="Nombre de streamers suivis" tone="neutral">👥 {s.followingCount!=null?fmt(s.followingCount):"—"} suivis</Pill>
                    <Pill title="Ton heure la plus active (messages)" tone="neutral">⏰ {hourLabel(s.mostActiveChatHour)}</Pill>
                    <Pill title="Ton jour le plus actif (messages)" tone="neutral">🗓️ {dowLabel(s.mostActiveChatDow)}</Pill>
                    <Pill title="Ton top streamer en watchtime" tone="gold">⭐ {topWatchName?topWatchName:"—"}</Pill>
                  </div>
                </GlassCard>

                <div style={{ marginTop:14, display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:14 }}>
                  {statsLoading ? (
                    <GlassCard style={{ padding:16 }}><div className="muted">Chargement des stats…</div></GlassCard>
                  ) : !stats ? (
                    <>
                      <StatTile emoji="⏱️" label="Watchtime total"   value="—" sub="(à brancher)" />
                      <StatTile emoji="💬" label="Messages envoyés"  value="—" sub="(à brancher)" />
                      <StatTile emoji="💎" label="Rubis gagnés"      value="—" sub="(à brancher)" />
                      <StatTile emoji="🔥" label="Rubis dépensés"    value="—" sub="(à brancher)" />
                    </>
                  ) : (
                    <>
                      <StatTile emoji="⏱️" label="Watchtime total" value={humanDuration(s.watchSecondsTotal)} sub={topWatchName?<>Top: <b>{topWatchName}</b> ({humanDuration(topWatchSecs)})</>:"—"} />
                      <StatTile emoji="💬" label="Messages envoyés" value={s.chatMessagesTotal!=null?fmt(s.chatMessagesTotal):"—"} sub={s.mostActiveChatHour!=null||s.mostActiveChatDow!=null?<>Pic: <b>{dowLabel(s.mostActiveChatDow)}</b> à <b>{hourLabel(s.mostActiveChatHour)}</b></>:undefined} />
                      <StatTile emoji="💎" label="Rubis gagnés" value={fmtRubis(s.rubisEarnedTotal)} sub={typeof s.dailyWheelRubisTotal==="number"||typeof s.chestRubisWonTotal==="number"?<>Wheel: <b>{fmtRubis(s.dailyWheelRubisTotal)}</b> • Coffres: <b>{fmtRubis(s.chestRubisWonTotal)}</b></>:undefined} />
                      <StatTile emoji="🔥" label="Rubis dépensés" value={fmtRubis(s.rubisSpentTotal)} sub={typeof s.rubisSupportTotal==="number"||typeof s.rubisBurnTotal==="number"?<>Support: <b>{fmtRubis(s.rubisSupportTotal)}</b> • Sink/Burn: <b>{fmtRubis(s.rubisBurnTotal)}</b></>:undefined} />
                      <StatTile emoji="🧮" label="Net rubis" value={netRubis==null?"—":fmt(netRubis)} sub="Fun stat (pas un solde)." />
                      <StatTile emoji="🎡" label="Daily Wheel" value={typeof s.dailyWheelSpinsTotal==="number"?`${fmt(s.dailyWheelSpinsTotal)} spins`:"—"} sub={typeof s.dailyWheelRubisTotal==="number"?<>Total gagné: <b>{fmt(s.dailyWheelRubisTotal)}</b> rubis</>:undefined} />
                      <StatTile emoji="🗓️" label="Bonus quotidien" value={typeof s.dailyBonusClaimsTotal==="number"?`${fmt(s.dailyBonusClaimsTotal)} claims`:"—"} sub="Nombre de jours où tu as claim." />
                      <StatTile emoji="🎁" label="Collectibles" value={typeof s.entitlementsTotal==="number"?`${fmt(s.entitlementsTotal)} objets`:"—"} sub={typeof s.achievementsUnlockedTotal==="number"?<>Succès débloqués: <b>{fmt(s.achievementsUnlockedTotal)}</b></>:undefined} />
                      <StatTile emoji="🎁" label="Subs gifts" value={typeof s.subGiftsClaimedTotal==="number"?fmt(s.subGiftsClaimedTotal):"—"} sub="Nombre de gifts claim." />
                    </>
                  )}
                </div>

                <div style={{ marginTop:14, display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))", gap:14 }}>
                  <MiniBarList title="🏁 Top streamers — watchtime" items={topByWatch} valueKey="seconds" onItemLink={slug=>`/s/${slug}`} emptyLabel="Tu n'as pas encore de watchtime enregistré." />
                  <MiniBarList title="💬 Top streamers — messages" items={topByMsg} valueKey="messages" onItemLink={slug=>`/s/${slug}`} emptyLabel="Tu n'as pas encore envoyé de messages." />
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      <AchievementsModal open={achOpen} onClose={()=>setAchOpen(false)} />
      {token ? <AccountSettingsModal open={settingsOpen} onClose={()=>setSettingsOpen(false)} token={token} onAfterChange={refreshMe} /> : null}
    </main>
  );
}

export default function ProfilePage() {
  const isMobile = useIsMobile();
  return isMobile ? <ProfilePageMobile /> : <ProfilePageDesktop />;
}