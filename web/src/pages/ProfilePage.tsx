// web/src/pages/ProfilePage.tsx — Rework v3
import * as React from "react";
import { Link } from "react-router-dom";
import { getMyAchievements, myStreamerRequest, type ApiAchievement } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";
import { AchievementsModal } from "../components/AchievementsModal";
import { XpProgressionCard } from "../components/XpProgressionCard";
import { TitleSelector } from "../components/TitleSelector";
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

type Tab = "personalisation" | "social" | "stats" | "settings" | "streamer";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function initials(name: string) {
  const s = (name || "?").trim();
  if (!s) return "?";
  const parts = s.split(/[\s._-]+/g).filter(Boolean);
  const a = parts[0]?.[0] ?? s[0];
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : s[1];
  return (a + (b ?? "")).toUpperCase();
}
function fmt(n: number) { return n.toLocaleString("fr-FR"); }
function fmtN(n: number | null | undefined) { return n == null ? "—" : fmt(n); }
function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }
function humanDuration(seconds: number | null | undefined) {
  if (seconds == null) return "—";
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60);
  if (h <= 0) return `${m} min`; if (m <= 0) return `${h} h`; return `${h} h ${m} min`;
}
function dowLabel(dow: number | null | undefined) {
  if (dow == null) return "—";
  return (["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"])[dow] ?? String(dow);
}
function hourLabel(hour: number | null | undefined) {
  if (hour == null) return "—";
  return `${String(clamp(Math.floor(hour), 0, 23)).padStart(2, "0")}:00`;
}
function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
function getAvatarUrl(u: any): string | null {
  const candidates = [u?.avatarUrl, u?.avatar_url, u?.avatar, u?.photoUrl, u?.photo_url, u?.picture, u?.imageUrl, u?.image_url].filter(Boolean);
  const v = candidates[0]; if (!v) return null; return String(v) || null;
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const BG    = "#07090e";
const SURF  = "#0d1018";
const SURF2 = "#111624";
const BOR   = "rgba(255,255,255,0.06)";
const BOR_A = "rgba(124,92,252,0.30)";
const ACC   = "#7c5cfc";
const ACC_D = "rgba(124,92,252,0.12)";
const TXT   = "#eeeef5";
const TXT2  = "rgba(238,238,245,0.45)";
const GREEN = "#10b981";
const RED   = "#ef4444";
const FONT  = "'Inter', system-ui, -apple-system, sans-serif";

// ─── Primitives ───────────────────────────────────────────────────────────────

function Badge({ children, tone = "purple" }: { children: React.ReactNode; tone?: "purple" | "green" | "gold" | "blue" | "red" | "gray" }) {
  const map: Record<string, [string, string, string]> = {
    purple: [ACC_D, "rgba(124,92,252,0.22)", "#c4b5fd"],
    green:  ["rgba(16,185,129,0.12)", "rgba(16,185,129,0.22)", "#34d399"],
    gold:   ["rgba(245,158,11,0.12)", "rgba(245,158,11,0.22)", "#fbbf24"],
    blue:   ["rgba(59,130,246,0.12)", "rgba(59,130,246,0.22)", "#60a5fa"],
    red:    ["rgba(239,68,68,0.12)",  "rgba(239,68,68,0.22)",  "#f87171"],
    gray:   ["rgba(255,255,255,0.05)","rgba(255,255,255,0.10)", TXT2],
  };
  const [bg, bd, color] = map[tone] ?? map.purple;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px",
      borderRadius: 99, background: bg, border: `1px solid ${bd}`, color,
      fontFamily: FONT, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ borderRadius: 14, border: `1px solid ${BOR}`, background: SURF2, ...style }}>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: 1.1,
      textTransform: "uppercase", color: TXT2, marginBottom: 10 }}>
      {children}
    </div>
  );
}

function NavBtn({ icon, label, active, onClick }: { icon: string; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      className="pf3-nav"
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%",
        padding: "9px 12px", borderRadius: 9, border: "none", cursor: "pointer",
        background: active ? ACC_D : "transparent",
        color: active ? "#c4b5fd" : TXT2,
        fontFamily: FONT, fontWeight: 600, fontSize: 14,
        borderLeft: `3px solid ${active ? ACC : "transparent"}`,
        transition: "background 120ms, color 120ms",
        textAlign: "left",
      }}
    >
      <span style={{ width: 20, textAlign: "center", fontSize: 15 }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function StatCard({ emoji, label, value, sub }: { emoji: string; label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Card style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: ACC_D, border: `1px solid ${BOR}`,
          display: "grid", placeItems: "center", fontSize: 16, flexShrink: 0 }}>{emoji}</div>
        <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: TXT2 }}>{label}</span>
      </div>
      <div style={{ fontFamily: FONT, fontSize: 22, fontWeight: 700, color: TXT, letterSpacing: -0.3 }}>{value}</div>
      {sub ? <div style={{ marginTop: 5, fontFamily: FONT, fontSize: 12, color: TXT2 }}>{sub}</div> : null}
    </Card>
  );
}

// ─── Settings accordion row ────────────────────────────────────────────────────

function SettingsRow({ icon, title, desc, children }: { icon: string; title: string; desc: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div style={{ borderBottom: `1px solid ${BOR}` }}>
      <button onClick={() => setOpen(v => !v)} style={{
        display: "flex", alignItems: "center", gap: 14, width: "100%",
        padding: "16px 20px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
      }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: ACC_D, border: `1px solid ${BOR}`,
          display: "grid", placeItems: "center", fontSize: 16, flexShrink: 0 }}>{icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: FONT, fontWeight: 600, color: TXT, fontSize: 14 }}>{title}</div>
          <div style={{ fontFamily: FONT, fontSize: 12, color: TXT2, marginTop: 2 }}>{desc}</div>
        </div>
        <span style={{ color: TXT2, fontSize: 20, transform: open ? "rotate(90deg)" : "none",
          transition: "transform 180ms", lineHeight: 1, userSelect: "none" }}>›</span>
      </button>
      {open && (
        <div style={{ padding: "0 20px 18px 70px" }}>
          {children}
        </div>
      )}
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      padding: "13px 0", borderBottom: `1px solid ${BOR}` }}>
      <span style={{ fontFamily: FONT, fontSize: 14, color: TXT }}>{label}</span>
      <div onClick={() => onChange(!checked)} style={{
        width: 42, height: 23, borderRadius: 99, position: "relative", cursor: "pointer", flexShrink: 0,
        background: checked ? ACC : "rgba(255,255,255,0.12)", transition: "background 200ms",
      }}>
        <div style={{
          position: "absolute", top: 3, left: checked ? 21 : 3,
          width: 17, height: 17, borderRadius: 99,
          background: "#fff", transition: "left 200ms",
          boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
        }} />
      </div>
    </div>
  );
}

function Hint({ msg }: { msg: string | null }) {
  if (!msg) return null;
  const ok = msg.includes("✅");
  return (
    <div style={{ marginTop: 8, fontFamily: FONT, fontSize: 13,
      color: ok ? GREEN : "rgba(238,238,245,0.60)" }}>
      {msg}
    </div>
  );
}

// ─── Settings section (inline tab, replaces modal) ───────────────────────────

function SettingsSection({ token, onAfterChange }: { token: string; onAfterChange: () => void }) {
  const [newUsername, setNewUsername]     = React.useState("");
  const [renameCodeSent, setRenameCodeSent] = React.useState(false);
  const [renameCode, setRenameCode]       = React.useState("");
  const [renamePay, setRenamePay]         = React.useState(false);
  const [renameHint, setRenameHint]       = React.useState<string | null>(null);
  const [renameBusy, setRenameBusy]       = React.useState(false);

  const [passCodeSent, setPassCodeSent]   = React.useState(false);
  const [passCode, setPassCode]           = React.useState("");
  const [p1, setP1]                       = React.useState("");
  const [p2, setP2]                       = React.useState("");
  const [showP1, setShowP1]               = React.useState(false);
  const [showP2, setShowP2]               = React.useState(false);
  const [passHint, setPassHint]           = React.useState<string | null>(null);
  const [passBusy, setPassBusy]           = React.useState(false);

  const [dLoading, setDLoading]           = React.useState(false);
  const [dLinked, setDLinked]             = React.useState(false);
  const [dInfo, setDInfo]                 = React.useState<any>(null);
  const [dCode, setDCode]                 = React.useState("");
  const [dBusy, setDBusy]                 = React.useState(false);
  const [dHint, setDHint]                 = React.useState<string | null>(null);

  const [notifLive,    setNotifLive]    = React.useState(() => localStorage.getItem("notif_live")    !== "false");
  const [notifFollow,  setNotifFollow]  = React.useState(() => localStorage.getItem("notif_follow")  !== "false");
  const [notifMention, setNotifMention] = React.useState(() => localStorage.getItem("notif_mention") !== "false");
  const [notifEmail,   setNotifEmail]   = React.useState(() => localStorage.getItem("notif_email")   !== "false");

  function saveNotif(key: string, val: boolean, setter: (v: boolean) => void) {
    setter(val); localStorage.setItem(`notif_${key}`, String(val));
  }

  React.useEffect(() => { loadDiscordStatus(); }, []);

  async function post(path: string, body: any) {
    const r = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body ?? {}),
    });
    const data = await r.json().catch(() => ({}));
    return { r, data };
  }
  async function get(path: string) {
    const r = await fetch(`${BASE}${path}`, { method: "GET", headers: { authorization: `Bearer ${token}` } });
    const data = await r.json().catch(() => ({}));
    return { r, data };
  }

  async function loadDiscordStatus() {
    setDLoading(true); setDHint(null);
    try {
      const { r, data } = await get("/me/discord-link");
      if (!r.ok || data?.ok === false) throw new Error(data?.error || `HTTP ${r.status}`);
      setDLinked(!!data.linked); setDInfo(data.link || null);
    } catch (e: any) { setDHint(String(e?.message || "Erreur chargement statut Discord")); setDLinked(false); setDInfo(null); }
    finally { setDLoading(false); }
  }
  async function consumeDiscordCode() {
    setDBusy(true); setDHint(null);
    try {
      const { r, data } = await post("/me/discord-link/consume", { code: dCode.trim() });
      if (!r.ok || data?.ok === false) throw new Error(data?.error || `HTTP ${r.status}`);
      setDHint("Compte Discord lié ✅"); setDCode("");
      await loadDiscordStatus(); onAfterChange();
    } catch (e: any) {
      const msg = String(e?.message || "Erreur liaison Discord");
      if (msg === "code_not_found_or_expired") setDHint("Code invalide ou expiré.");
      else if (msg === "bad_code_format") setDHint("Format invalide. Exemple : LL-ABC123");
      else setDHint(msg);
    } finally { setDBusy(false); }
  }
  async function syncDiscordNow() {
    setDBusy(true); setDHint(null);
    try {
      const { r, data } = await post("/me/discord-link/sync", {});
      if (!r.ok || data?.ok === false) throw new Error(data?.error || `HTTP ${r.status}`);
      setDHint("Synchronisation lancée ✅"); await loadDiscordStatus();
    } catch (e: any) { setDHint(String(e?.message || "Erreur sync")); } finally { setDBusy(false); }
  }
  async function unlinkDiscord() {
    setDBusy(true); setDHint(null);
    try {
      const { r, data } = await post("/me/discord-link/unlink", {});
      if (!r.ok || data?.ok === false) throw new Error(data?.error || `HTTP ${r.status}`);
      setDHint("Compte Discord délié ✅"); await loadDiscordStatus();
    } catch (e: any) { setDHint(String(e?.message || "Erreur unlink")); } finally { setDBusy(false); }
  }
  async function sendRenameCode() {
    setRenameBusy(true); setRenameHint(null);
    try {
      const { r, data } = await post("/me/rename/request-code", { newUsername });
      if (!r.ok || (data && data.ok === false)) throw new Error(data?.error || `HTTP ${r.status}`);
      setRenameCodeSent(true); setRenameHint("Code envoyé par email ✅");
    } catch (e: any) { setRenameHint(String(e?.message || "Erreur envoi code")); } finally { setRenameBusy(false); }
  }
  async function confirmRename() {
    setRenameBusy(true); setRenameHint(null);
    try {
      const { r, data } = await post("/me/rename/confirm", { newUsername, code: renameCode, payIfNeeded: renamePay });
      if (r.status === 409 && data?.error === "cooldown") {
        setRenameHint(`Cooldown : encore ${data.remainingDays}j. Coche "payer ${data.price} rubis" pour rename maintenant.`);
        return;
      }
      if (!r.ok || (data && data.ok === false)) throw new Error(data?.error || `HTTP ${r.status}`);
      try { localStorage.setItem("token", String(data.token || "")); } catch {}
      setRenameHint(`Pseudo mis à jour ✅${data.paid ? ` (payé ${data.paid} rubis)` : ""}`);
      onAfterChange(); window.location.reload();
    } catch (e: any) { setRenameHint(String(e?.message || "Erreur rename")); } finally { setRenameBusy(false); }
  }
  async function sendPasswordCode() {
    setPassBusy(true); setPassHint(null);
    try {
      const { r, data } = await post("/me/password/request-code", {});
      if (!r.ok || (data && data.ok === false)) throw new Error(data?.error || `HTTP ${r.status}`);
      setPassCodeSent(true); setPassHint("Code envoyé par email ✅");
    } catch (e: any) { setPassHint(String(e?.message || "Erreur envoi code")); } finally { setPassBusy(false); }
  }
  async function confirmPassword() {
    setPassBusy(true); setPassHint(null);
    try {
      if (!p1 || p1.length < 6) throw new Error("password_too_short");
      if (p1 !== p2) throw new Error("password_mismatch");
      const { r, data } = await post("/me/password/confirm", { code: passCode, newPassword: p1 });
      if (!r.ok || (data && data.ok === false)) throw new Error(data?.error || `HTTP ${r.status}`);
      setPassHint("Mot de passe mis à jour ✅"); setPassCode(""); setP1(""); setP2("");
    } catch (e: any) {
      const msg = String(e?.message || "Erreur");
      if (msg === "password_mismatch") setPassHint("Les mots de passe ne correspondent pas.");
      else if (msg === "password_too_short") setPassHint("Minimum 6 caractères.");
      else setPassHint(msg);
    } finally { setPassBusy(false); }
  }

  const inp: React.CSSProperties = {
    padding: "10px 13px", borderRadius: 9, border: `1px solid ${BOR}`,
    background: "rgba(255,255,255,0.04)", color: TXT,
    fontFamily: FONT, fontSize: 14, fontWeight: 500, outline: "none",
    width: "100%", boxSizing: "border-box",
  };

  return (
    <div>
      <h2 style={{ fontFamily: FONT, fontSize: 20, fontWeight: 700, color: TXT, margin: "0 0 4px" }}>Paramètres</h2>
      <p style={{ fontFamily: FONT, fontSize: 13, color: TXT2, margin: "0 0 28px" }}>Compte, sécurité, connexions et préférences.</p>

      <SectionLabel>Mon compte</SectionLabel>
      <Card style={{ marginBottom: 22, overflow: "hidden", padding: 0 }}>
        <SettingsRow icon="✍️" title="Changer de pseudo" desc="Gratuit tous les 30 jours — ou 1 000 rubis pour passer le cooldown.">
          <div style={{ display: "grid", gap: 8 }}>
            <input value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="Nouveau pseudo" style={inp} />
            <button className="btnGhost" onClick={sendRenameCode} disabled={renameBusy || !newUsername.trim()} style={{ width: "fit-content" }}>
              📩 Envoyer le code
            </button>
            {renameCodeSent && (
              <div style={{ display: "grid", gap: 8 }}>
                <input value={renameCode} onChange={e => setRenameCode(e.target.value)} placeholder="Code à 6 chiffres" style={inp} />
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: FONT, fontSize: 13, color: TXT2, cursor: "pointer" }}>
                  <input type="checkbox" checked={renamePay} onChange={e => setRenamePay(e.target.checked)} />
                  Payer 1 000 rubis si cooldown actif
                </label>
                <button className="btnPrimary" onClick={confirmRename} disabled={renameBusy || !renameCode.trim() || !newUsername.trim()} style={{ width: "fit-content" }}>
                  ✅ Confirmer
                </button>
              </div>
            )}
            <Hint msg={renameHint} />
          </div>
        </SettingsRow>
      </Card>

      <SectionLabel>Sécurité</SectionLabel>
      <Card style={{ marginBottom: 22, overflow: "hidden", padding: 0 }}>
        <SettingsRow icon="🔒" title="Mot de passe" desc="Un code de vérification est envoyé à ton adresse email.">
          <div style={{ display: "grid", gap: 8 }}>
            <button className="btnGhost" onClick={sendPasswordCode} disabled={passBusy} style={{ width: "fit-content" }}>
              📩 Envoyer le code
            </button>
            {passCodeSent && (
              <div style={{ display: "grid", gap: 8 }}>
                <input value={passCode} onChange={e => setPassCode(e.target.value)} placeholder="Code à 6 chiffres" style={inp} />
                <div style={{ position: "relative" }}>
                  <input value={p1} onChange={e => setP1(e.target.value)} type={showP1 ? "text" : "password"} placeholder="Nouveau mot de passe" style={inp} />
                  <button type="button" onClick={() => setShowP1(v => !v)}
                    style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 15 }}>
                    {showP1 ? "🙈" : "👁️"}
                  </button>
                </div>
                <div style={{ position: "relative" }}>
                  <input value={p2} onChange={e => setP2(e.target.value)} type={showP2 ? "text" : "password"} placeholder="Confirmer" style={inp} />
                  <button type="button" onClick={() => setShowP2(v => !v)}
                    style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 15 }}>
                    {showP2 ? "🙈" : "👁️"}
                  </button>
                </div>
                <button className="btnPrimary" onClick={confirmPassword} disabled={passBusy} style={{ width: "fit-content" }}>
                  ✅ Mettre à jour
                </button>
              </div>
            )}
            <Hint msg={passHint} />
          </div>
        </SettingsRow>
      </Card>

      <SectionLabel>Connexions</SectionLabel>
      <Card style={{ marginBottom: 22, overflow: "hidden", padding: 0 }}>
        <SettingsRow icon="🔗" title="Discord" desc="Lie ton compte Discord pour accéder aux rôles et avantages.">
          {dLoading ? (
            <div style={{ fontFamily: FONT, fontSize: 13, color: TXT2 }}>Chargement…</div>
          ) : dLinked ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <Badge tone="green">✅ Compte lié</Badge>
                {dInfo?.discordUserId && <span style={{ fontFamily: FONT, fontSize: 13, color: TXT2 }}>ID : {dInfo.discordUserId}</span>}
              </div>
              {dInfo?.lastSyncAt && (
                <div style={{ fontFamily: FONT, fontSize: 12, color: TXT2 }}>
                  Dernier sync : {new Date(dInfo.lastSyncAt).toLocaleString("fr-FR")}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btnGhost" onClick={syncDiscordNow} disabled={dBusy}>🔄 Synchroniser</button>
                <button className="btnGhost" onClick={unlinkDiscord} disabled={dBusy}>❌ Délier</button>
              </div>
              <Hint msg={dHint} />
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontFamily: FONT, fontSize: 13, color: TXT2 }}>
                1) Tape <code style={{ background: ACC_D, padding: "2px 6px", borderRadius: 5, fontFamily: "monospace" }}>/link</code> sur le Discord pour recevoir un code par MP.<br />
                2) Colle le code ci-dessous pour lier ton compte.
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input value={dCode} onChange={e => setDCode(e.target.value)} placeholder="Ex : LL-ABC123"
                  style={{ ...inp, width: "auto", flex: "1 1 180px", letterSpacing: 1, textTransform: "uppercase" }} />
                <button className="btnPrimary" onClick={consumeDiscordCode} disabled={dBusy || !dCode.trim()}>✅ Lier</button>
              </div>
              <a className="btnGhost" href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer" style={{ width: "fit-content" }}>
                Rejoindre le Discord
              </a>
              <Hint msg={dHint} />
            </div>
          )}
        </SettingsRow>
      </Card>

      <SectionLabel>Notifications</SectionLabel>
      <Card style={{ padding: "0 20px", marginBottom: 22 }}>
        <Toggle checked={notifLive}    onChange={v => saveNotif("live",    v, setNotifLive)}    label="🔴 Alertes live — streamers suivis" />
        <Toggle checked={notifFollow}  onChange={v => saveNotif("follow",  v, setNotifFollow)}  label="👥 Nouveaux followers" />
        <Toggle checked={notifMention} onChange={v => saveNotif("mention", v, setNotifMention)} label="💬 Mentions dans le chat" />
        <Toggle checked={notifEmail}   onChange={v => saveNotif("email",   v, setNotifEmail)}   label="📧 Emails de la plateforme" />
        <div style={{ padding: "12px 0", fontFamily: FONT, fontSize: 12, color: TXT2 }}>
          Préférences sauvegardées localement. Gestion serveur à venir.
        </div>
      </Card>
    </div>
  );
}

// ─── Bar list (stats) ─────────────────────────────────────────────────────────

function BarList({ title, items, valueKey, emptyLabel }: {
  title: string; items: Array<any>; valueKey: "seconds" | "messages"; emptyLabel?: string;
}) {
  const max = Math.max(0, ...items.map(x => Number(x?.[valueKey] ?? 0) || 0));
  return (
    <Card style={{ padding: 18 }}>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: TXT, marginBottom: 16 }}>{title}</div>
      {items.length === 0
        ? <div style={{ fontFamily: FONT, fontSize: 13, color: TXT2 }}>{emptyLabel ?? "Pas encore de données."}</div>
        : items.map((x, i) => {
          const v = Number(x?.[valueKey] ?? 0) || 0;
          const pct = max > 0 ? (v / max) * 100 : 0;
          const label = valueKey === "seconds" ? humanDuration(v) : fmt(v);
          return (
            <div key={x.slug ?? i} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div>
                  <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 13, color: TXT }}>{x.displayName ?? x.slug}</div>
                  <div style={{ fontFamily: FONT, fontSize: 11, color: TXT2 }}>@{x.slug}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 13, color: TXT }}>{label}</span>
                  <Link to={`/s/${x.slug}`} className="btnGhost" style={{ fontSize: 12, padding: "4px 9px" }}>Voir</Link>
                </div>
              </div>
              <div style={{ height: 5, borderRadius: 99, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                <div style={{ width: `${clamp(pct, 0, 100)}%`, height: "100%", borderRadius: 99,
                  background: `linear-gradient(90deg, ${ACC}, #5b8ef8)` }} />
              </div>
            </div>
          );
        })}
    </Card>
  );
}

function achievementProgressRatio(item: ApiAchievement) {
  if (item.unlocked) return 1;
  const current = Number(item.progress?.current ?? 0);
  const target = Number(item.progress?.target ?? 0);
  if (!Number.isFinite(current) || !Number.isFinite(target) || target <= 0) return 0;
  return clamp(current / target, 0, 1);
}

function AchievementTierBadge({
  label,
  count,
  total,
  color,
  bg,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
  bg: string;
}) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 11,
        border: `1px solid ${BOR}`,
        background: bg,
        display: "grid",
        gap: 4,
      }}
    >
      <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: 0.8 }}>
        {label}
      </span>
      <span style={{ fontFamily: FONT, fontSize: 16, fontWeight: 700, color: TXT }}>
        {count}/{total}
      </span>
    </div>
  );
}

function AchievementSidebar({
  items,
  loading,
  error,
  onOpen,
}: {
  items: ApiAchievement[];
  loading: boolean;
  error: string | null;
  onOpen: () => void;
}) {
  const unlocked = items.filter((item) => item.unlocked);
  const unlockedCount = unlocked.length;
  const totalCount = items.length;
  const completionPct = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0;

  const tierCounts = React.useMemo(() => {
    const map: Record<ApiAchievement["tier"], { unlocked: number; total: number }> = {
      bronze: { unlocked: 0, total: 0 },
      silver: { unlocked: 0, total: 0 },
      gold: { unlocked: 0, total: 0 },
      master: { unlocked: 0, total: 0 },
    };
    for (const item of items) {
      map[item.tier].total += 1;
      if (item.unlocked) map[item.tier].unlocked += 1;
    }
    return map;
  }, [items]);

  const nextUp = React.useMemo(() => {
    return [...items]
      .filter((item) => !item.unlocked)
      .sort((a, b) => {
        const diff = achievementProgressRatio(b) - achievementProgressRatio(a);
        if (Math.abs(diff) > 0.001) return diff;
        return a.name.localeCompare(b.name, "fr");
      })
      .slice(0, 4);
  }, [items]);

  const rewardsReady = React.useMemo(() => unlocked.filter((item) => item.rewardPreview).slice(0, 3), [unlocked]);

  return (
    <aside style={{ position: "sticky", top: 36, alignSelf: "start", display: "grid", gap: 12 }}>
      <Card style={{ padding: 18, overflow: "hidden", position: "relative" }}>
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(circle at top right, rgba(124,92,252,0.18), transparent 58%)",
            pointerEvents: "none",
          }}
        />
        <div style={{ position: "relative" }}>
          <SectionLabel>Succès</SectionLabel>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontFamily: FONT, fontSize: 24, fontWeight: 800, color: TXT, letterSpacing: -0.4 }}>
                {loading ? "…" : `${unlockedCount}/${totalCount || "—"}`}
              </div>
              <div style={{ fontFamily: FONT, fontSize: 12, color: TXT2, marginTop: 4 }}>
                {loading ? "Chargement…" : totalCount ? `${completionPct}% de collection complétée` : "Aucun succès chargé"}
              </div>
            </div>
            <button className="btnPrimary" onClick={onOpen} style={{ flexShrink: 0, fontSize: 13, padding: "9px 12px" }}>
              Ouvrir
            </button>
          </div>
          <div style={{ marginTop: 14, height: 8, borderRadius: 99, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <div style={{ width: `${completionPct}%`, height: "100%", borderRadius: 99, background: "linear-gradient(90deg, #7c5cfc, #5b8ef8)" }} />
          </div>
          {error ? <div style={{ marginTop: 12, fontFamily: FONT, fontSize: 12, color: "#f87171" }}>{error}</div> : null}
        </div>
      </Card>

      <Card style={{ padding: 18 }}>
        <SectionLabel>Par palier</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          <AchievementTierBadge label="Bronze" count={tierCounts.bronze.unlocked} total={tierCounts.bronze.total} color="#d6a06d" bg="rgba(180,100,50,0.08)" />
          <AchievementTierBadge label="Silver" count={tierCounts.silver.unlocked} total={tierCounts.silver.total} color="#93c5fd" bg="rgba(147,197,253,0.08)" />
          <AchievementTierBadge label="Gold" count={tierCounts.gold.unlocked} total={tierCounts.gold.total} color="#fbbf24" bg="rgba(251,191,36,0.08)" />
          <AchievementTierBadge label="Master" count={tierCounts.master.unlocked} total={tierCounts.master.total} color="#c4b5fd" bg="rgba(124,92,252,0.10)" />
        </div>
      </Card>

      <Card style={{ padding: 18 }}>
        <SectionLabel>À finir bientôt</SectionLabel>
        {loading ? (
          <div style={{ fontFamily: FONT, fontSize: 13, color: TXT2 }}>Chargement…</div>
        ) : nextUp.length === 0 ? (
          <div style={{ fontFamily: FONT, fontSize: 13, color: TXT2 }}>Tu as déjà tout débloqué ici. Propre.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {nextUp.map((item) => {
              const pct = Math.round(achievementProgressRatio(item) * 100);
              return (
                <div key={item.id} style={{ padding: "11px 12px", borderRadius: 11, border: `1px solid ${BOR}`, background: "rgba(255,255,255,0.02)", display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 18, lineHeight: 1 }}>{item.icon}</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: TXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.name}
                      </div>
                      <div style={{ fontFamily: FONT, fontSize: 11, color: TXT2, marginTop: 3 }}>
                        {item.progress ? `${item.progress.current}/${item.progress.target}` : item.hint || "À découvrir"}
                      </div>
                    </div>
                    <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: "#c4b5fd", flexShrink: 0 }}>{pct}%</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 99, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", borderRadius: 99, background: "linear-gradient(90deg, #7c5cfc, #5b8ef8)" }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card style={{ padding: 18 }}>
        <SectionLabel>Récompenses visibles</SectionLabel>
        {rewardsReady.length === 0 ? (
          <div style={{ fontFamily: FONT, fontSize: 13, color: TXT2 }}>Les récompenses débloquées s'afficheront ici.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {rewardsReady.map((item) => (
              <div key={item.id} style={{ padding: "11px 12px", borderRadius: 11, border: `1px solid ${BOR}`, background: "rgba(124,92,252,0.06)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 18, lineHeight: 1 }}>{item.icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: TXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.name}
                    </div>
                    <div style={{ fontFamily: FONT, fontSize: 11, color: "#c4b5fd", marginTop: 3 }}>{item.rewardPreview}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </aside>
  );
}

// ─── Desktop component ────────────────────────────────────────────────────────

function ProfilePageDesktop() {
  const { user, token, refreshMe } = useAuth();
  const [tab, setTab]               = React.useState<Tab>("personalisation");
  const [achOpen, setAchOpen]       = React.useState(false);
  const [achievements, setAchievements] = React.useState<ApiAchievement[]>([]);
  const [achLoading, setAchLoading] = React.useState(false);
  const [achErr, setAchErr]         = React.useState<string | null>(null);
  const [reqStatus, setReqStatus]   = React.useState<string | null>(null);
  const [q, setQ]                   = React.useState("");
  const dq                          = useDebouncedValue(q, 250);
  const [following, setFollowing]   = React.useState<ApiFollowing[]>([]);
  const [followLoading, setFollowLoading] = React.useState(false);
  const [followErr, setFollowErr]   = React.useState<string | null>(null);
  const [stats, setStats]           = React.useState<ApiProfileStats | null>(null);
  const [statsLoading, setStatsLoading] = React.useState(false);
  const [statsErr, setStatsErr]     = React.useState<string | null>(null);
  const avatarUrl                   = user ? getAvatarUrl(user) : null;
  const [avatarOk, setAvatarOk]     = React.useState(true);
  React.useEffect(() => setAvatarOk(true), [avatarUrl]);

  React.useEffect(() => {
    (async () => {
      if (!token) return setReqStatus(null);
      const r = await myStreamerRequest(token);
      setReqStatus(r.request?.status ?? null);
    })();
  }, [token]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        setAchievements([]);
        setAchErr(null);
        return;
      }
      setAchLoading(true);
      setAchErr(null);
      try {
        const r = await getMyAchievements(token);
        if (cancelled) return;
        setAchievements(r.achievements ?? []);
      } catch (e: any) {
        if (cancelled) return;
        setAchievements([]);
        setAchErr(e?.message ?? "Erreur chargement succès");
      } finally {
        if (!cancelled) setAchLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, achOpen]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token || tab !== "social") return;
      setFollowLoading(true); setFollowErr(null);
      try {
        const r = await myFollowing(token, { q: dq, limit: 120 });
        if (cancelled) return; setFollowing(r.items);
      } catch (e: any) {
        if (cancelled) return; setFollowErr(e?.message ?? "Erreur chargement"); setFollowing([]);
      } finally { if (!cancelled) setFollowLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [token, tab, dq]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token || tab !== "stats") return;
      setStatsLoading(true); setStatsErr(null);
      try {
        const r = await myProfileStats(token);
        if (cancelled) return; setStats(r);
      } catch (e: any) {
        if (cancelled) return; setStats(null); setStatsErr(e?.message ?? "Erreur stats");
      } finally { if (!cancelled) setStatsLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [token, tab]);

  const s: any              = stats ?? {};
  const netRubis            = typeof s.rubisEarnedTotal === "number" && typeof s.rubisSpentTotal === "number" ? s.rubisEarnedTotal - s.rubisSpentTotal : null;
  const topByWatch: any[]   = Array.isArray(s.topStreamersByWatch) ? s.topStreamersByWatch : [];
  const topByMsg: any[]     = Array.isArray(s.topStreamersByMessages) ? s.topStreamersByMessages : [];
  const isStreamer           = user?.role === "streamer" || user?.role === "admin";

  if (!user) {
    return (
      <main style={{ background: BG, minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <p style={{ fontFamily: FONT, color: TXT2 }}>Connecte-toi pour accéder à ton profil.</p>
      </main>
    );
  }

  return (
    <main style={{ background: BG, minHeight: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        .pf3-nav:hover { background: rgba(124,92,252,0.07) !important; color: rgba(196,181,253,0.75) !important; }
        .pf3-fl-row { display:flex; justify-content:space-between; align-items:center; gap:12; padding:11px 14px; border-radius:10px; border:1px solid rgba(255,255,255,0.06); background:rgba(255,255,255,0.02); transition:background 110ms; }
        .pf3-fl-row:hover { background:rgba(255,255,255,0.04); }
        .pf3-fl-row.live { border-color:rgba(239,68,68,0.16); background:rgba(239,68,68,0.04); }
      `}</style>

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", maxWidth: 1560, margin: "0 auto", minHeight: "100vh" }}>

        {/* SIDEBAR */}
        <aside style={{
          borderRight: `1px solid ${BOR}`, background: SURF,
          padding: "28px 14px",
          display: "flex", flexDirection: "column", gap: 20,
          position: "sticky", top: 0, height: "100vh", overflowY: "auto",
        }}>

          {/* Identity card */}
          <div style={{ padding: 16, borderRadius: 12, background: SURF2, border: `1px solid ${BOR}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                border: `2px solid ${BOR_A}`, background: ACC_D,
                display: "grid", placeItems: "center", overflow: "hidden",
              }}>
                {avatarUrl && avatarOk
                  ? <img src={avatarUrl} alt={user.username} onError={() => setAvatarOk(false)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 15, color: "#c4b5fd" }}>{initials(user.username)}</span>}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: TXT,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {user.username}
                </div>
                <div style={{ marginTop: 5, display: "flex", gap: 5, flexWrap: "wrap" }}>
                  <Badge tone="purple">{user.role}</Badge>
                  <Badge tone="gold">💎 {fmt(user.rubis)}</Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <NavBtn icon="🎨" label="Personnalisation"  active={tab === "personalisation"} onClick={() => setTab("personalisation")} />
            <NavBtn icon="🤝" label="Social"            active={tab === "social"}          onClick={() => setTab("social")} />
            <NavBtn icon="📊" label="Statistiques"      active={tab === "stats"}           onClick={() => setTab("stats")} />
            <NavBtn icon="⚙️" label="Paramètres"        active={tab === "settings"}        onClick={() => setTab("settings")} />
            <NavBtn icon={isStreamer ? "🟢" : "🎥"} label={isStreamer ? "Dashboard" : "Devenir streamer"}
              active={tab === "streamer"} onClick={() => setTab("streamer")} />
          </nav>

          {/* Bottom actions */}
          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 1 }}>
            {isStreamer && (
              <Link to="/dashboard" style={{
                display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 9,
                textDecoration: "none", fontFamily: FONT, fontWeight: 600, fontSize: 14,
                background: ACC_D, color: "#c4b5fd", borderLeft: `3px solid ${ACC}`,
              }}>
                <span style={{ width: 20, textAlign: "center", fontSize: 15 }}>🚀</span>
                <span>Dashboard streamer</span>
              </Link>
            )}
          </div>
        </aside>

        {/* CONTENT */}
        <div style={{ padding: "36px 32px", background: BG, minWidth: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 24, alignItems: "start" }}>
            <div style={{ minWidth: 0 }}>

          {/* Personnalisation */}
          {tab === "personalisation" && (
            <div>
              <h2 style={{ fontFamily: FONT, fontSize: 20, fontWeight: 700, color: TXT, margin: "0 0 4px" }}>Personnalisation</h2>
              <p style={{ fontFamily: FONT, fontSize: 13, color: TXT2, margin: "0 0 24px" }}>
                Configure ton apparence : titres, avatar, badges, pseudo et cadrans.
              </p>

              {/* ─── Section Titres (collapsible) ─── */}
              <Card style={{ padding: 0, marginBottom: 16, overflow: "hidden" }}>
                <details>
                  <summary
                    style={{
                      cursor: "pointer",
                      padding: "16px 22px",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      listStyle: "none",
                      userSelect: "none",
                    }}
                  >
                    <span style={{ fontSize: 22, lineHeight: 1 }}>🎖️</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ fontFamily: FONT, fontSize: 16, fontWeight: 700, color: TXT, margin: 0 }}>
                        Titres affichés
                      </h3>
                      <p style={{ fontFamily: FONT, fontSize: 12, color: TXT2, margin: "2px 0 0" }}>
                        Niveau auto-évolutif + titres débloqués via succès. Clique pour gérer.
                      </p>
                    </div>
                    <span aria-hidden style={{ color: TXT2, fontSize: 13 }}>▾</span>
                  </summary>
                  <div style={{ padding: "0 22px 22px" }}>
                    <TitleSelector />
                  </div>
                </details>
              </Card>

              {/* ─── Section Avatar / Pseudo / Badges / Frame / Hat ─── */}
              <Card style={{ padding: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 22, lineHeight: 1 }}>✨</span>
                  <h3 style={{ fontFamily: FONT, fontSize: 16, fontWeight: 700, color: TXT, margin: 0 }}>
                    Apparence
                  </h3>
                </div>
                <p style={{ fontFamily: FONT, fontSize: 12.5, color: TXT2, margin: "0 0 16px" }}>
                  Pseudo, badges, chapeaux et cadrans de message.
                </p>
                <PersonalisationSection username={user.username} />
              </Card>
            </div>
          )}

          {/* Social */}
          {tab === "social" && (
            <div>
              <h2 style={{ fontFamily: FONT, fontSize: 20, fontWeight: 700, color: TXT, margin: "0 0 4px" }}>Social</h2>
              <p style={{ fontFamily: FONT, fontSize: 13, color: TXT2, margin: "0 0 20px" }}>Les streamers que tu suis et leur statut.</p>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un streamer…"
                  className="pf3-search" style={{
                    padding: "9px 13px", borderRadius: 9, border: `1px solid ${BOR}`,
                    background: "rgba(255,255,255,0.04)", color: TXT,
                    fontFamily: FONT, fontSize: 14, outline: "none", width: 300,
                  }} />
                {q && <button className="btnGhost" onClick={() => setQ("")} style={{ fontSize: 13 }}>✕</button>}
              </div>
              <Card>
                {followLoading ? (
                  <div style={{ padding: 20, fontFamily: FONT, color: TXT2 }}>Chargement…</div>
                ) : followErr ? (
                  <div style={{ padding: 20, fontFamily: FONT, color: TXT2 }}>{followErr}</div>
                ) : following.length === 0 ? (
                  <div style={{ padding: 20, fontFamily: FONT, color: TXT2 }}>Aucun résultat.</div>
                ) : (
                  <div style={{ display: "grid", gap: 1, padding: 8 }}>
                    {following.map((f: any) => {
                      const fAvatar = getAvatarUrl(f);
                      const live = typeof f.isLive === "boolean" ? f.isLive : null;
                      return (
                        <div key={f.id ?? f.slug} className={`pf3-fl-row${live === true ? " live" : ""}`}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                            <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                              border: `1px solid ${BOR}`, background: ACC_D,
                              overflow: "hidden", display: "grid", placeItems: "center" }}>
                              {fAvatar
                                ? <img src={fAvatar} alt={f.displayName ?? f.slug} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                : <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 13, color: "#c4b5fd" }}>{initials(f.displayName ?? f.slug)}</span>}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14, color: TXT,
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {f.displayName ?? f.slug}
                                {live === true && <span style={{ marginLeft: 8, color: RED, fontSize: 11 }}>● LIVE</span>}
                              </div>
                              <div style={{ fontFamily: FONT, fontSize: 12, color: TXT2 }}>@{f.slug}</div>
                            </div>
                          </div>
                          <Link to={`/s/${f.slug}`} className="btnGhost" style={{ flexShrink: 0, fontSize: 13 }}>Voir</Link>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* Stats */}
          {tab === "stats" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
                <h2 style={{ fontFamily: FONT, fontSize: 20, fontWeight: 700, color: TXT, margin: 0 }}>Statistiques</h2>
                <button className="btnGhost" style={{ fontSize: 13 }} disabled={statsLoading} onClick={() => {
                  setStatsLoading(true); setStatsErr(null);
                  (async () => {
                    if (!token) return;
                    try { const r = await myProfileStats(token); setStats(r); }
                    catch (e: any) { setStats(null); setStatsErr(e?.message ?? "Erreur"); }
                    finally { setStatsLoading(false); }
                  })();
                }}>🔄 Rafraîchir</button>
              </div>
              <p style={{ fontFamily: FONT, fontSize: 13, color: TXT2, margin: "0 0 20px" }}>Watchtime, messages, rubis, wheel et plus.</p>

              <div style={{ marginBottom: 22 }}>
                <XpProgressionCard />
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
                {s.accountAgeDays != null && <Badge tone="gray">📅 {fmt(s.accountAgeDays)} jours</Badge>}
                {s.followingCount  != null && <Badge tone="gray">👥 {fmt(s.followingCount)} suivis</Badge>}
                {s.mostActiveChatHour != null && <Badge tone="gray">⏰ {hourLabel(s.mostActiveChatHour)}</Badge>}
                {s.mostActiveChatDow  != null && <Badge tone="gray">🗓️ {dowLabel(s.mostActiveChatDow)}</Badge>}
                {s.topStreamerByWatch?.displayName && <Badge tone="gold">⭐ {s.topStreamerByWatch.displayName}</Badge>}
                {statsErr && <Badge tone="red">Erreur : {statsErr}</Badge>}
              </div>

              {statsLoading ? (
                <div style={{ fontFamily: FONT, color: TXT2 }}>Chargement…</div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 12, marginBottom: 16 }}>
                    <StatCard emoji="⏱️" label="Watchtime total"   value={humanDuration(s.watchSecondsTotal ?? null)} sub={s.topStreamerByWatch?.displayName ? `Top : ${s.topStreamerByWatch.displayName}` : undefined} />
                    <StatCard emoji="💬" label="Messages envoyés"  value={s.chatMessagesTotal != null ? fmt(s.chatMessagesTotal) : "—"} sub={s.mostActiveChatHour != null ? `Pic : ${dowLabel(s.mostActiveChatDow)} ${hourLabel(s.mostActiveChatHour)}` : undefined} />
                    <StatCard emoji="💎" label="Rubis gagnés"      value={fmtN(s.rubisEarnedTotal)} sub={s.dailyWheelRubisTotal != null ? `Wheel : ${fmtN(s.dailyWheelRubisTotal)}` : undefined} />
                    <StatCard emoji="🔥" label="Rubis dépensés"    value={fmtN(s.rubisSpentTotal)} sub={s.rubisSupportTotal != null ? `Support : ${fmtN(s.rubisSupportTotal)}` : undefined} />
                    <StatCard emoji="🧮" label="Net rubis"         value={netRubis == null ? "—" : fmt(netRubis)} sub="Fun stat." />
                    <StatCard emoji="🎡" label="Daily Wheel"       value={typeof s.dailyWheelSpinsTotal === "number" ? `${fmt(s.dailyWheelSpinsTotal)} spins` : "—"} />
                    <StatCard emoji="🗓️" label="Bonus quotidien"   value={typeof s.dailyBonusClaimsTotal === "number" ? `${fmt(s.dailyBonusClaimsTotal)} claims` : "—"} />
                    <StatCard emoji="🎁" label="Collectibles"      value={typeof s.entitlementsTotal === "number" ? `${fmt(s.entitlementsTotal)} objets` : "—"} sub={typeof s.achievementsUnlockedTotal === "number" ? `${fmt(s.achievementsUnlockedTotal)} succès` : undefined} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
                    <BarList title="🏁 Top streamers — watchtime" items={topByWatch} valueKey="seconds" emptyLabel="Pas encore de watchtime enregistré." />
                    <BarList title="💬 Top streamers — messages"  items={topByMsg}   valueKey="messages" emptyLabel="Pas encore de messages envoyés." />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Settings */}
          {tab === "settings" && token && (
            <SettingsSection token={token} onAfterChange={refreshMe} />
          )}

          {/* Streamer */}
          {tab === "streamer" && (
            <div>
              <h2 style={{ fontFamily: FONT, fontSize: 20, fontWeight: 700, color: TXT, margin: "0 0 4px" }}>
                {isStreamer ? "Dashboard streamer" : "Devenir streamer"}
              </h2>
              <p style={{ fontFamily: FONT, fontSize: 13, color: TXT2, margin: "0 0 24px" }}>
                {isStreamer ? "Accède à tous tes outils de live et de gestion." : "Fais ta demande et rejoins l'équipe LunaLive."}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 20 }}>
                <StatCard
                  emoji={isStreamer ? "🚀" : "📨"}
                  label={isStreamer ? "Accès dashboard" : "Statut demande"}
                  value={isStreamer ? "Disponible" : reqStatus ?? "À lancer"}
                  sub={isStreamer ? "Ouvre ton espace en un clic." : "Le passage se fait via Discord."}
                />
                <StatCard emoji="🔗" label="Discord" value="/link" sub="Lie ton compte pour accéder aux rôles." />
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {isStreamer
                  ? <Link to="/dashboard" className="btnPrimary">🚀 Ouvrir le Dashboard</Link>
                  : <a className="btnPrimary" href={DISCORD_STREAMER_REQUEST_URL} target="_blank" rel="noreferrer">🎥 Faire une demande</a>}
                <a className="btnGhost" href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer">Rejoindre le Discord</a>
                <button className="btnGhost" onClick={() => setTab("settings")}>⚙️ Paramètres du compte</button>
              </div>
            </div>
          )}
            </div>

            <AchievementSidebar items={achievements} loading={achLoading} error={achErr} onOpen={() => setAchOpen(true)} />
          </div>
        </div>
      </div>

      <AchievementsModal open={achOpen} onClose={() => setAchOpen(false)} />
    </main>
  );
}

export default function ProfilePage() {
  const isMobile = useIsMobile();
  return isMobile ? <ProfilePageMobile /> : <ProfilePageDesktop />;
}
