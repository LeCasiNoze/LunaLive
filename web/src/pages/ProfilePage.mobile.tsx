// web/src/pages/ProfilePage.mobile.tsx — Rework v3
import * as React from "react";
import { Link } from "react-router-dom";
import { applyStreamer, myStreamerRequest } from "../lib/api";
import { myFollowing, myProfileStats, type ApiFollowing, type ApiProfileStats } from "../lib/api_profile";
import { useAuth } from "../auth/AuthProvider";
import { AchievementsModal } from "../components/AchievementsModal";
import { PersonalisationSection } from "../components/profile/PersonalisationSection";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");
const DISCORD_INVITE_URL = "https://discord.gg/93BFrsBWWB";
const DISCORD_STREAMER_REQUEST_URL = "https://discord.com/channels/1467139956249067717/1467142148431413370";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }
function fmt(n: any) { const x = Number(n || 0); return Number.isFinite(x) ? x.toLocaleString("fr-FR") : "0"; }
function fmtN(n: number | null | undefined) { return n == null ? "—" : fmt(n); }
function initials(name: string) {
  const s = (name || "?").trim(); if (!s) return "?";
  const parts = s.split(/[\s._-]+/g).filter(Boolean);
  const a = parts[0]?.[0] ?? s[0]; const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : s[1];
  return (a + (b ?? "")).toUpperCase();
}
function humanDuration(seconds: number | null | undefined) {
  if (seconds == null) return "—"; const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60);
  if (h <= 0) return `${m} min`; if (m <= 0) return `${h} h`; return `${h} h ${m} min`;
}
function dowLabel(dow: number | null | undefined) {
  if (dow == null) return "—"; return (["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"])[dow] ?? String(dow);
}
function hourLabel(hour: number | null | undefined) {
  if (hour == null) return "—"; return `${String(clamp(Math.floor(hour), 0, 23)).padStart(2, "0")}:00`;
}
function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => { const t = setTimeout(() => setDebounced(value), delayMs); return () => clearTimeout(t); }, [value, delayMs]);
  return debounced;
}
function absolutize(url: string | null) {
  if (!url) return null; const u = String(url);
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/") && API_BASE) return `${API_BASE}${u}`; return u;
}
function getAvatarUrl(u: any): string | null {
  const candidates = [u?.avatarUrl, u?.avatar_url, u?.avatar, u?.photoUrl, u?.photo_url, u?.picture, u?.imageUrl, u?.image_url].filter(Boolean);
  const v = candidates[0]; if (!v) return null; return absolutize(String(v));
}
function pickUserAvatarUrl(user: any) {
  const uid = user?.id != null ? Number(user.id) : null;
  const direct = getAvatarUrl(user);
  const byUid = uid ? absolutize(`/avatars/u/${uid}?v=${Math.floor(Date.now() / 60000)}`) : null;
  return direct || byUid;
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const BG    = "#07090e";
const SURF  = "#0d1018";
const SURF2 = "#111624";
const BOR   = "rgba(255,255,255,0.06)";
const BOR_A = "rgba(124,92,252,0.28)";
const ACC   = "#7c5cfc";
const ACC_D = "rgba(124,92,252,0.12)";
const TXT   = "#eeeef5";
const TXT2  = "rgba(238,238,245,0.45)";
const GREEN = "#10b981";
const RED   = "#ef4444";
const FONT  = "'Inter', system-ui, -apple-system, sans-serif";

// ─── Primitives ───────────────────────────────────────────────────────────────

function Badge({ children, tone = "purple" }: { children: React.ReactNode; tone?: "purple" | "green" | "gold" | "red" | "gray" }) {
  const map: Record<string, [string, string, string]> = {
    purple: [ACC_D, "rgba(124,92,252,0.22)", "#c4b5fd"],
    green:  ["rgba(16,185,129,0.12)", "rgba(16,185,129,0.22)", "#34d399"],
    gold:   ["rgba(245,158,11,0.12)", "rgba(245,158,11,0.22)", "#fbbf24"],
    red:    ["rgba(239,68,68,0.12)",  "rgba(239,68,68,0.22)",  "#f87171"],
    gray:   ["rgba(255,255,255,0.05)","rgba(255,255,255,0.10)", TXT2],
  };
  const [bg, bd, color] = map[tone] ?? map.purple;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 9px",
      borderRadius: 99, background: bg, border: `1px solid ${bd}`, color,
      fontFamily: FONT, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function SCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ borderRadius: 12, border: `1px solid ${BOR}`, background: SURF2, ...style }}>
      {children}
    </div>
  );
}

function SLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: 1.1,
      textTransform: "uppercase", color: TXT2, marginBottom: 8 }}>
      {children}
    </div>
  );
}

function Hint({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div style={{ marginTop: 7, fontFamily: FONT, fontSize: 12, color: msg.includes("✅") ? GREEN : "rgba(238,238,245,0.60)" }}>
      {msg}
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      padding: "12px 0", borderBottom: `1px solid ${BOR}` }}>
      <span style={{ fontFamily: FONT, fontSize: 13, color: TXT }}>{label}</span>
      <div onClick={() => onChange(!checked)} style={{
        width: 40, height: 22, borderRadius: 99, position: "relative", cursor: "pointer", flexShrink: 0,
        background: checked ? ACC : "rgba(255,255,255,0.12)", transition: "background 200ms",
      }}>
        <div style={{ position: "absolute", top: 3, left: checked ? 19 : 3, width: 16, height: 16, borderRadius: 99,
          background: "#fff", transition: "left 200ms", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
      </div>
    </div>
  );
}

// ─── Settings section (inline, no modal) ─────────────────────────────────────

function SettingsMobile({ token, onAfterChange }: { token: string; onAfterChange: () => void }) {
  const [section, setSection]             = React.useState<"menu" | "rename" | "password" | "discord" | "notifs">("menu");
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

  React.useEffect(() => { if (section === "discord") loadDiscordStatus(); }, [section]);

  async function post(path: string, body: any) {
    const r = await fetch(`${API_BASE}${path}`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body ?? {}),
    });
    return { r, data: await r.json().catch(() => ({})) };
  }
  async function get(path: string) {
    const r = await fetch(`${API_BASE}${path}`, { method: "GET", headers: { authorization: `Bearer ${token}` } });
    return { r, data: await r.json().catch(() => ({})) };
  }

  async function loadDiscordStatus() {
    setDLoading(true); setDHint(null);
    try {
      const { r, data } = await get("/me/discord-link");
      if (!r.ok || data?.ok === false) throw new Error(data?.error || `HTTP ${r.status}`);
      setDLinked(!!data.linked); setDInfo(data.link || null);
    } catch (e: any) { setDHint(String(e?.message || "Erreur statut Discord")); setDLinked(false); setDInfo(null); }
    finally { setDLoading(false); }
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
      if (r.status === 409 && data?.error === "cooldown") { setRenameHint(`Cooldown : encore ${data.remainingDays}j. Coche "payer ${data.price} rubis".`); return; }
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
      setPassCodeSent(true); setPassHint("Code envoyé ✅");
    } catch (e: any) { setPassHint(String(e?.message || "Erreur")); } finally { setPassBusy(false); }
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
  async function consumeDiscordCode() {
    setDBusy(true); setDHint(null);
    try {
      const { r, data } = await post("/me/discord-link/consume", { code: dCode.trim() });
      if (!r.ok || data?.ok === false) throw new Error(data?.error || `HTTP ${r.status}`);
      setDHint("Discord lié ✅"); setDCode(""); await loadDiscordStatus(); onAfterChange();
    } catch (e: any) {
      const msg = String(e?.message || "Erreur");
      if (msg === "code_not_found_or_expired") setDHint("Code invalide ou expiré.");
      else if (msg === "bad_code_format") setDHint("Format invalide. Ex : LL-ABC123");
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
      setDHint("Discord délié ✅"); await loadDiscordStatus();
    } catch (e: any) { setDHint(String(e?.message || "Erreur")); } finally { setDBusy(false); }
  }

  const inp: React.CSSProperties = {
    padding: "10px 12px", borderRadius: 8, border: `1px solid ${BOR}`,
    background: "rgba(255,255,255,0.04)", color: TXT,
    fontFamily: FONT, fontSize: 14, fontWeight: 500, outline: "none",
    width: "100%", boxSizing: "border-box",
  };

  const menuItems = [
    { key: "rename",   icon: "✍️", title: "Changer de pseudo",     desc: "Gratuit /30j ou 1 000 rubis" },
    { key: "password", icon: "🔒", title: "Mot de passe",           desc: "Via code email" },
    { key: "discord",  icon: "🔗", title: "Lier Discord",           desc: "Rôles et avantages serveur" },
    { key: "notifs",   icon: "🔔", title: "Notifications",          desc: "Alertes et préférences" },
  ] as const;

  if (section !== "menu") {
    return (
      <div>
        <button onClick={() => setSection("menu")} style={{
          display: "flex", alignItems: "center", gap: 8, marginBottom: 16,
          background: "none", border: "none", cursor: "pointer", padding: 0,
          fontFamily: FONT, fontSize: 13, fontWeight: 600, color: TXT2,
        }}>
          ‹ Retour
        </button>

        {section === "rename" && (
          <div>
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 16, color: TXT, marginBottom: 4 }}>✍️ Changer de pseudo</div>
            <div style={{ fontFamily: FONT, fontSize: 12, color: TXT2, marginBottom: 14 }}>Gratuit tous les 30 jours. Sinon 1 000 rubis.</div>
            <div style={{ display: "grid", gap: 9 }}>
              <input value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="Nouveau pseudo" style={inp} />
              <button className="btnGhost" onClick={sendRenameCode} disabled={renameBusy || !newUsername.trim()}>📩 Envoyer le code</button>
              {renameCodeSent && (
                <>
                  <input value={renameCode} onChange={e => setRenameCode(e.target.value)} placeholder="Code à 6 chiffres" style={inp} />
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: FONT, fontSize: 12, color: TXT2, cursor: "pointer" }}>
                    <input type="checkbox" checked={renamePay} onChange={e => setRenamePay(e.target.checked)} />
                    Payer 1 000 rubis si cooldown
                  </label>
                  <button className="btnPrimary" onClick={confirmRename} disabled={renameBusy || !renameCode.trim() || !newUsername.trim()}>✅ Confirmer</button>
                </>
              )}
              <Hint msg={renameHint} />
            </div>
          </div>
        )}

        {section === "password" && (
          <div>
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 16, color: TXT, marginBottom: 4 }}>🔒 Mot de passe</div>
            <div style={{ fontFamily: FONT, fontSize: 12, color: TXT2, marginBottom: 14 }}>Un code de vérification sera envoyé à ton email.</div>
            <div style={{ display: "grid", gap: 9 }}>
              <button className="btnGhost" onClick={sendPasswordCode} disabled={passBusy}>📩 Envoyer le code</button>
              {passCodeSent && (
                <>
                  <input value={passCode} onChange={e => setPassCode(e.target.value)} placeholder="Code à 6 chiffres" style={inp} />
                  <div style={{ position: "relative" }}>
                    <input value={p1} onChange={e => setP1(e.target.value)} type={showP1 ? "text" : "password"} placeholder="Nouveau mot de passe" style={inp} />
                    <button type="button" onClick={() => setShowP1(v => !v)}
                      style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 14 }}>
                      {showP1 ? "🙈" : "👁️"}
                    </button>
                  </div>
                  <div style={{ position: "relative" }}>
                    <input value={p2} onChange={e => setP2(e.target.value)} type={showP2 ? "text" : "password"} placeholder="Confirmer" style={inp} />
                    <button type="button" onClick={() => setShowP2(v => !v)}
                      style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 14 }}>
                      {showP2 ? "🙈" : "👁️"}
                    </button>
                  </div>
                  <button className="btnPrimary" onClick={confirmPassword} disabled={passBusy}>✅ Mettre à jour</button>
                </>
              )}
              <Hint msg={passHint} />
            </div>
          </div>
        )}

        {section === "discord" && (
          <div>
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 16, color: TXT, marginBottom: 4 }}>🔗 Discord</div>
            <div style={{ fontFamily: FONT, fontSize: 12, color: TXT2, marginBottom: 14 }}>Lie ton compte pour accéder aux rôles du serveur.</div>
            {dLoading ? (
              <div style={{ fontFamily: FONT, fontSize: 13, color: TXT2 }}>Chargement…</div>
            ) : dLinked ? (
              <div style={{ display: "grid", gap: 10 }}>
                <Badge tone="green">✅ Compte lié</Badge>
                {dInfo?.discordUserId && <div style={{ fontFamily: FONT, fontSize: 12, color: TXT2 }}>ID : {dInfo.discordUserId}</div>}
                {dInfo?.lastSyncAt && <div style={{ fontFamily: FONT, fontSize: 12, color: TXT2 }}>Dernier sync : {new Date(dInfo.lastSyncAt).toLocaleString("fr-FR")}</div>}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btnGhost" onClick={syncDiscordNow} disabled={dBusy}>🔄 Sync</button>
                  <button className="btnGhost" onClick={unlinkDiscord} disabled={dBusy}>❌ Délier</button>
                </div>
                <Hint msg={dHint} />
              </div>
            ) : (
              <div style={{ display: "grid", gap: 9 }}>
                <div style={{ fontFamily: FONT, fontSize: 12, color: TXT2 }}>
                  Tape <code style={{ background: ACC_D, padding: "2px 5px", borderRadius: 4 }}>/link</code> sur Discord pour obtenir ton code.
                </div>
                <input value={dCode} onChange={e => setDCode(e.target.value)} placeholder="Ex : LL-ABC123"
                  style={{ ...inp, letterSpacing: 1, textTransform: "uppercase" }} />
                <button className="btnPrimary" onClick={consumeDiscordCode} disabled={dBusy || !dCode.trim()}>✅ Lier mon Discord</button>
                <a className="btnGhost" href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer">Rejoindre le Discord</a>
                <Hint msg={dHint} />
              </div>
            )}
          </div>
        )}

        {section === "notifs" && (
          <div>
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 16, color: TXT, marginBottom: 4 }}>🔔 Notifications</div>
            <div style={{ fontFamily: FONT, fontSize: 12, color: TXT2, marginBottom: 14 }}>Gère tes alertes et préférences.</div>
            <SCard style={{ padding: "0 16px" }}>
              <Toggle checked={notifLive}    onChange={v => saveNotif("live",    v, setNotifLive)}    label="🔴 Alertes live" />
              <Toggle checked={notifFollow}  onChange={v => saveNotif("follow",  v, setNotifFollow)}  label="👥 Nouveaux followers" />
              <Toggle checked={notifMention} onChange={v => saveNotif("mention", v, setNotifMention)} label="💬 Mentions dans le chat" />
              <Toggle checked={notifEmail}   onChange={v => saveNotif("email",   v, setNotifEmail)}   label="📧 Emails de la plateforme" />
              <div style={{ padding: "10px 0", fontFamily: FONT, fontSize: 11, color: TXT2 }}>
                Sauvegardé localement. Gestion serveur à venir.
              </div>
            </SCard>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 17, color: TXT, marginBottom: 4 }}>Paramètres</div>
      <div style={{ fontFamily: FONT, fontSize: 12, color: TXT2, marginBottom: 18 }}>Compte, sécurité et préférences.</div>

      <SLabel>Mon compte</SLabel>
      <SCard style={{ marginBottom: 16, overflow: "hidden" }}>
        {menuItems.map((item, i) => (
          <button key={item.key} onClick={() => setSection(item.key)} style={{
            display: "flex", alignItems: "center", gap: 12, width: "100%",
            padding: "14px 16px",
            borderBottom: i < menuItems.length - 1 ? `1px solid ${BOR}` : "none",
            background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
          }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: ACC_D, border: `1px solid ${BOR}`,
              display: "grid", placeItems: "center", fontSize: 15, flexShrink: 0 }}>{item.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14, color: TXT }}>{item.title}</div>
              <div style={{ fontFamily: FONT, fontSize: 11, color: TXT2, marginTop: 1 }}>{item.desc}</div>
            </div>
            <span style={{ color: TXT2, fontSize: 18 }}>›</span>
          </button>
        ))}
      </SCard>
    </div>
  );
}

// ─── Tab system ───────────────────────────────────────────────────────────────

type MobileTabKey = "style" | "social" | "stats" | "settings" | "streamer";
const TAB_ORDER: MobileTabKey[] = ["style", "social", "stats", "settings", "streamer"];
function clampTabIndex(i: number) { return Math.max(0, Math.min(TAB_ORDER.length - 1, i)); }
function tabIndexOf(t: MobileTabKey) { const i = TAB_ORDER.indexOf(t); return i >= 0 ? i : 0; }
function nextTab(t: MobileTabKey) { return TAB_ORDER[clampTabIndex(tabIndexOf(t) + 1)]; }
function prevTab(t: MobileTabKey) { return TAB_ORDER[clampTabIndex(tabIndexOf(t) - 1)]; }

const TAB_LABELS: Record<MobileTabKey, { icon: string; label: string }> = {
  style:    { icon: "🎨", label: "Style" },
  social:   { icon: "🤝", label: "Social" },
  stats:    { icon: "📊", label: "Stats" },
  settings: { icon: "⚙️", label: "Paramètres" },
  streamer: { icon: "🚀", label: "Streamer" },
};

export default function ProfilePageMobile() {
  const { user, token, refreshMe } = useAuth() as any;
  const [tab, setTab]     = React.useState<MobileTabKey>("style");
  const [tabView, setTabView] = React.useState<MobileTabKey>("style");
  const [tabAnim, setTabAnim] = React.useState<{ stage: "idle" | "leaving" | "entering"; dir: -1 | 1 }>({ stage: "idle", dir: 1 });
  const tabAnimRef = React.useRef(tabAnim);
  React.useEffect(() => { tabAnimRef.current = tabAnim; }, [tabAnim]);
  const timersRef = React.useRef<number[]>([]);
  React.useEffect(() => () => { for (const id of timersRef.current) window.clearTimeout(id); timersRef.current = []; }, []);

  const [achOpen, setAchOpen]   = React.useState(false);
  const [reqStatus, setReqStatus] = React.useState<string | null>(null);
  const [busyApply, setBusyApply] = React.useState(false);
  const [q, setQ]               = React.useState("");
  const dq                      = useDebouncedValue(q, 250);
  const [following, setFollowing] = React.useState<ApiFollowing[]>([]);
  const [followLoading, setFollowLoading] = React.useState(false);
  const [followErr, setFollowErr] = React.useState<string | null>(null);
  const [stats, setStats]       = React.useState<ApiProfileStats | null>(null);
  const [statsLoading, setStatsLoading] = React.useState(false);
  const [statsErr, setStatsErr] = React.useState<string | null>(null);
  const avatarUrl               = user ? pickUserAvatarUrl(user) : null;
  const [avatarOk, setAvatarOk] = React.useState(true);
  React.useEffect(() => setAvatarOk(true), [avatarUrl]);

  React.useEffect(() => {
    (async () => {
      if (!token) return setReqStatus(null);
      try { const r = await myStreamerRequest(token); setReqStatus(r.request?.status ?? null); } catch { setReqStatus(null); }
    })();
  }, [token]);

  async function onApply() {
    if (!token) return; setBusyApply(true);
    try { const r = await applyStreamer(token); setReqStatus(r.request?.status ?? null); await refreshMe(); }
    finally { setBusyApply(false); }
  }

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token || tab !== "social") return;
      setFollowLoading(true); setFollowErr(null);
      try { const r = await myFollowing(token, { q: dq, limit: 120 }); if (cancelled) return; setFollowing(r.items); }
      catch (e: any) { if (cancelled) return; setFollowErr(e?.message ?? "Erreur"); setFollowing([]); }
      finally { if (!cancelled) setFollowLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [token, tab, dq]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token || tab !== "stats") return;
      setStatsLoading(true); setStatsErr(null);
      try { const r = await myProfileStats(token); if (cancelled) return; setStats(r); }
      catch (e: any) { if (cancelled) return; setStats(null); setStatsErr(e?.message ?? "Erreur stats"); }
      finally { if (!cancelled) setStatsLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [token, tab]);

  const s: any    = stats ?? {};
  const netRubis  = typeof s.rubisEarnedTotal === "number" && typeof s.rubisSpentTotal === "number" ? s.rubisEarnedTotal - s.rubisSpentTotal : null;
  const isStreamerOrAdmin = user?.role === "streamer" || user?.role === "admin";

  const LEAVE_MS = 130; const ENTER_MS = 160;
  const goTab = React.useCallback((next: MobileTabKey) => {
    if (next === tab) return;
    const dir: -1 | 1 = tabIndexOf(next) > tabIndexOf(tab) ? 1 : -1;
    setTab(next);
    if (tabAnimRef.current.stage !== "idle") {
      setTabView(next); setTabAnim({ stage: "entering", dir });
      const id = window.setTimeout(() => setTabAnim({ stage: "idle", dir }), 0); timersRef.current.push(id); return;
    }
    setTabAnim({ stage: "leaving", dir });
    const id = window.setTimeout(() => {
      setTabView(next); setTabAnim({ stage: "entering", dir });
      const id2 = window.setTimeout(() => setTabAnim({ stage: "idle", dir }), 0); timersRef.current.push(id2);
    }, LEAVE_MS);
    timersRef.current.push(id);
  }, [tab]);

  const swipeRef = React.useRef({ x0: 0, y0: 0, t0: 0, active: false, tracking: false, locked: false as false | "x" | "y" });
  const SWIPE_MIN_X = 60, SWIPE_MAX_Y = 70, SWIPE_MAX_MS = 650, EDGE_GUARD = 8;
  function isInteractiveTarget(target: any) {
    const tag = String(target?.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || tag === "button" || tag === "a") return true;
    return !!target?.closest?.("[data-no-swipe='1']");
  }
  function onSwipeStart(e: React.TouchEvent) {
    if (achOpen) return;
    if (isInteractiveTarget(e.target)) return;
    const t = e.touches?.[0]; if (!t) return;
    if (t.clientX < EDGE_GUARD || t.clientX > window.innerWidth - EDGE_GUARD) return;
    swipeRef.current = { x0: t.clientX, y0: t.clientY, t0: Date.now(), active: true, tracking: true, locked: false };
  }
  function onSwipeMove(e: React.TouchEvent) {
    if (!swipeRef.current.active) return;
    const t = e.touches?.[0]; if (!t) return;
    const dx = t.clientX - swipeRef.current.x0; const dy = t.clientY - swipeRef.current.y0;
    if (!swipeRef.current.locked) {
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) swipeRef.current.locked = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (swipeRef.current.locked === "y") { swipeRef.current.active = false; swipeRef.current.tracking = false; }
  }
  function onSwipeEnd(e: React.TouchEvent) {
    if (!swipeRef.current.tracking) return;
    const t = e.changedTouches?.[0]; if (!t) return;
    const dx = t.clientX - swipeRef.current.x0; const dy = t.clientY - swipeRef.current.y0;
    const dt = Date.now() - swipeRef.current.t0;
    swipeRef.current.active = false; swipeRef.current.tracking = false;
    if (dt > SWIPE_MAX_MS || Math.abs(dx) < SWIPE_MIN_X || Math.abs(dy) > SWIPE_MAX_Y || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) goTab(nextTab(tab)); else goTab(prevTab(tab));
  }

  const contentStyle: React.CSSProperties = React.useMemo(() => {
    const base: React.CSSProperties = { willChange: "transform,opacity" };
    if (tabAnim.stage === "leaving")  return { ...base, transition: `transform ${LEAVE_MS}ms ease,opacity ${LEAVE_MS}ms ease`, transform: `translateX(${tabAnim.dir === 1 ? -20 : 20}px)`, opacity: 0 };
    if (tabAnim.stage === "entering") return { ...base, transition: "none", transform: `translateX(${tabAnim.dir === 1 ? 20 : -20}px)`, opacity: 0 };
    return { ...base, transition: `transform ${ENTER_MS}ms ease,opacity ${ENTER_MS}ms ease`, transform: "translateX(0px)", opacity: 1 };
  }, [tabAnim.stage, tabAnim.dir]);

  if (!user) return (
    <main style={{ background: BG, minHeight: "100vh", paddingBottom: "calc(72px + env(safe-area-inset-bottom))" }}>
      <div style={{ padding: 20, fontFamily: FONT, color: TXT2 }}>Connecte-toi pour accéder à ton profil.</div>
    </main>
  );

  const TAB_HEIGHT = "calc(64px + env(safe-area-inset-bottom))";

  return (
    <main style={{ background: BG, minHeight: "100vh", paddingBottom: `calc(68px + env(safe-area-inset-bottom))` }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        .pfm3-fl { display:flex; justify-content:space-between; align-items:center; gap:10; padding:10px 12px; border-radius:10px; border:1px solid rgba(255,255,255,0.06); background:rgba(255,255,255,0.02); }
        .pfm3-fl.live { border-color:rgba(239,68,68,0.16); background:rgba(239,68,68,0.04); }
        .pfm3-stat { display:flex; justify-content:space-between; gap:10; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.06); font-family:'Inter',system-ui,sans-serif; font-size:13px; }
        .pfm3-stat:last-child { border-bottom:none; }
      `}</style>

      {/* Profile header */}
      <div style={{ padding: "16px 16px 0" }}>
        <div style={{ padding: 14, borderRadius: 12, background: SURF, border: `1px solid ${BOR}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, flexShrink: 0,
              border: `2px solid ${BOR_A}`, background: ACC_D,
              display: "grid", placeItems: "center", overflow: "hidden" }}>
              {avatarUrl && avatarOk
                ? <img src={String(avatarUrl)} alt={user.username} onError={() => setAvatarOk(false)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 15, color: "#c4b5fd" }}>{initials(user.username)}</span>}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 15, color: TXT,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.username}
              </div>
              <div style={{ marginTop: 5, display: "flex", gap: 5, flexWrap: "wrap" }}>
                <Badge tone="purple">{user.role}</Badge>
                <Badge tone="gold">💎 {fmt(user.rubis)}</Badge>
              </div>
            </div>
            <button className="btnGhost" onClick={() => setAchOpen(true)} title="Succès" style={{ flexShrink: 0, fontSize: 15, padding: "6px 10px" }}>🏆</button>
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div style={{ padding: "12px 16px 0", touchAction: "pan-y" }}
        onTouchStart={onSwipeStart} onTouchMove={onSwipeMove} onTouchEnd={onSwipeEnd}>
        <div style={contentStyle}>

          {/* STYLE */}
          {tabView === "style" && (
            <div>
              <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 16, color: TXT, marginBottom: 4 }}>Personnalisation</div>
              <div style={{ fontFamily: FONT, fontSize: 12, color: TXT2, marginBottom: 14 }}>Avatar, badges et style de profil.</div>
              <SCard style={{ padding: 16 }}>
                <PersonalisationSection username={user.username} />
              </SCard>
            </div>
          )}

          {/* SOCIAL */}
          {tabView === "social" && (
            <div>
              <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 16, color: TXT, marginBottom: 4 }}>Social</div>
              <div style={{ fontFamily: FONT, fontSize: 12, color: TXT2, marginBottom: 12 }}>Streamers suivis et statut live.</div>
              <div style={{ marginBottom: 10 }}>
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher…"
                  style={{ padding: "9px 12px", borderRadius: 8, border: `1px solid ${BOR}`,
                    background: "rgba(255,255,255,0.04)", color: TXT, fontFamily: FONT, fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" }} />
              </div>
              <SCard>
                {followLoading ? (
                  <div style={{ padding: 16, fontFamily: FONT, color: TXT2, fontSize: 13 }}>Chargement…</div>
                ) : followErr ? (
                  <div style={{ padding: 16, fontFamily: FONT, color: TXT2, fontSize: 13 }}>{followErr}</div>
                ) : following.length === 0 ? (
                  <div style={{ padding: 16, fontFamily: FONT, color: TXT2, fontSize: 13 }}>Aucun résultat.</div>
                ) : (
                  <div style={{ display: "grid", gap: 1, padding: 8 }}>
                    {following.map((f: any) => {
                      const fAvatar = getAvatarUrl(f); const live = typeof f.isLive === "boolean" ? f.isLive : null;
                      return (
                        <div key={f.id ?? f.slug} className={`pfm3-fl${live === true ? " live" : ""}`}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                              border: `1px solid ${BOR}`, background: ACC_D, overflow: "hidden", display: "grid", placeItems: "center" }}>
                              {fAvatar
                                ? <img src={fAvatar} alt={f.displayName ?? f.slug} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                : <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 12, color: "#c4b5fd" }}>{initials(f.displayName ?? f.slug)}</span>}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 13, color: TXT,
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {f.displayName ?? f.slug}
                                {live === true && <span style={{ marginLeft: 6, color: RED, fontSize: 10 }}>● LIVE</span>}
                              </div>
                              <div style={{ fontFamily: FONT, fontSize: 11, color: TXT2 }}>@{f.slug}</div>
                            </div>
                          </div>
                          <Link to={`/s/${f.slug}`} className="btnGhostSmall" data-no-swipe="1" style={{ flexShrink: 0 }}>Voir</Link>
                        </div>
                      );
                    })}
                  </div>
                )}
              </SCard>
            </div>
          )}

          {/* STATS */}
          {tabView === "stats" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 16, color: TXT }}>Statistiques</div>
                <button className="btnGhostSmall" disabled={statsLoading} onClick={() => {
                  setStatsLoading(true); setStatsErr(null);
                  (async () => { if (!token) return;
                    try { const r = await myProfileStats(token); setStats(r); }
                    catch (e: any) { setStats(null); setStatsErr(e?.message ?? "Erreur"); }
                    finally { setStatsLoading(false); }
                  })();
                }}>🔄</button>
              </div>
              <div style={{ fontFamily: FONT, fontSize: 12, color: TXT2, marginBottom: 12 }}>
                {statsErr ? <span style={{ color: "#f87171" }}>{statsErr}</span> : "Tes chiffres résumés."}
              </div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
                {s.accountAgeDays != null && <Badge tone="gray">📅 {fmt(s.accountAgeDays)} j</Badge>}
                {s.followingCount  != null && <Badge tone="gray">👥 {fmt(s.followingCount)} suivis</Badge>}
                {s.mostActiveChatHour != null && <Badge tone="gray">⏰ {hourLabel(s.mostActiveChatHour)}</Badge>}
                {s.mostActiveChatDow  != null && <Badge tone="gray">🗓️ {dowLabel(s.mostActiveChatDow)}</Badge>}
              </div>
              <SCard style={{ padding: 14, marginBottom: 10 }}>
                {[
                  ["⏱️ Watchtime",    statsLoading ? "…" : humanDuration(s.watchSecondsTotal)],
                  ["💬 Messages",     statsLoading ? "…" : s.chatMessagesTotal != null ? fmt(s.chatMessagesTotal) : "—"],
                  ["💎 Rubis gagnés", statsLoading ? "…" : fmtN(s.rubisEarnedTotal)],
                  ["🔥 Rubis dépensés", statsLoading ? "…" : fmtN(s.rubisSpentTotal)],
                  ["🧮 Net rubis",    statsLoading ? "…" : netRubis == null ? "—" : fmt(netRubis)],
                  ["🎡 Wheel spins",  statsLoading ? "…" : s.dailyWheelSpinsTotal != null ? fmt(s.dailyWheelSpinsTotal) : "—"],
                  ["🗓️ Bonus claims", statsLoading ? "…" : s.dailyBonusClaimsTotal != null ? fmt(s.dailyBonusClaimsTotal) : "—"],
                  ["🎁 Collectibles", statsLoading ? "…" : s.entitlementsTotal != null ? fmt(s.entitlementsTotal) : "—"],
                ].map(([label, val]) => (
                  <div key={String(label)} className="pfm3-stat">
                    <div style={{ fontWeight: 600, color: TXT }}>{label}</div>
                    <div style={{ fontWeight: 700, color: TXT }}>{val}</div>
                  </div>
                ))}
              </SCard>
            </div>
          )}

          {/* SETTINGS */}
          {tabView === "settings" && token && (
            <SettingsMobile token={token} onAfterChange={refreshMe} />
          )}

          {/* STREAMER */}
          {tabView === "streamer" && (
            <div>
              <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 16, color: TXT, marginBottom: 4 }}>
                {isStreamerOrAdmin ? "Dashboard streamer" : "Devenir streamer"}
              </div>
              <div style={{ fontFamily: FONT, fontSize: 12, color: TXT2, marginBottom: 14 }}>
                {isStreamerOrAdmin ? "Accède à tes outils de live." : "Fais ta demande et rejoins l'équipe."}
              </div>
              {isStreamerOrAdmin ? (
                <div style={{ display: "grid", gap: 10 }}>
                  <Badge tone="green">🟢 Accès actif</Badge>
                  <Link to="/dashboard" className="btnPrimary" style={{ display: "block", textAlign: "center" }}>🚀 Ouvrir le Dashboard</Link>
                  <a className="btnGhost" href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer" style={{ display: "block", textAlign: "center" }}>Rejoindre le Discord</a>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontFamily: FONT, fontSize: 13, color: TXT2 }}>
                    Statut : <b style={{ color: TXT }}>{
                      reqStatus === "pending" ? "En attente" :
                      reqStatus === "approved" ? "Acceptée ✅" :
                      reqStatus === "rejected" ? "Refusée" : "Aucune demande"
                    }</b>
                  </div>
                  <button className="btnPrimary" onClick={onApply}
                    disabled={busyApply || reqStatus === "pending" || reqStatus === "approved" || !token}>
                    {busyApply ? "…" : reqStatus === "pending" ? "⏳ Demande en attente" : reqStatus === "approved" ? "✅ Déjà streamer" : "🎥 Faire une demande"}
                  </button>
                  <a className="btnGhost" href={DISCORD_STREAMER_REQUEST_URL} target="_blank" rel="noreferrer" style={{ display: "block", textAlign: "center" }}>Demande sur Discord</a>
                  <a className="btnGhost" href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer" style={{ display: "block", textAlign: "center" }}>Rejoindre le Discord</a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Fixed bottom tab bar */}
      <nav style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: SURF, borderTop: `1px solid ${BOR}`,
        display: "flex", alignItems: "stretch",
        height: TAB_HEIGHT, zIndex: 100,
        paddingBottom: "env(safe-area-inset-bottom)",
      }}>
        {TAB_ORDER.map(key => {
          const { icon, label } = TAB_LABELS[key];
          const active = tab === key;
          return (
            <button key={key} onClick={() => goTab(key)} style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: 3, background: "transparent", border: "none", cursor: "pointer",
              borderTop: `2px solid ${active ? ACC : "transparent"}`,
              color: active ? "#c4b5fd" : TXT2,
              transition: "color 120ms",
            }}>
              <span style={{ fontSize: 18 }}>{icon}</span>
              <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 600 }}>{label}</span>
            </button>
          );
        })}
      </nav>

      <AchievementsModal open={achOpen} onClose={() => setAchOpen(false)} />
    </main>
  );
}
