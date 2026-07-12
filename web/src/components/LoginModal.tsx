// web/src/components/LoginModal.tsx
import * as React from "react";
import { createPortal } from "react-dom";
import { useOnClickOutside, asHTMLElementRef } from "../hooks/useOnClickOutside";
import {
  login, register, registerVerify, registerResend,
  forgotPasswordRequestCode, forgotPasswordConfirm,
} from "../lib/api";
import { getStoredUtm } from "../lib/utm";
import { useAuth } from "../auth/AuthProvider";

/* ─── Types ──────────────────────────────────────────────────────── */
type Step =
  | "login" | "register_form" | "register_code"
  | "forgot_email" | "forgot_code" | "forgot_newpass";

type RegisterResp = {
  ok: boolean; needsVerify?: boolean; devCode?: string; error?: string; token?: string; user?: any;
};

/* ─── Ref parrainage ─────────────────────────────────────────────── */
const REF_KEY = "ref_slug";
function readRefFromUrlAndPersist(): string | null {
  try {
    const ref = String(new URLSearchParams(window.location.search).get("ref") || "").trim();
    if (ref) { sessionStorage.setItem(REF_KEY, ref); return ref; }
  } catch {}
  return null;
}
function getPersistedRef(): string | null {
  try { return String(sessionStorage.getItem(REF_KEY) || "").trim() || null; } catch { return null; }
}
function clearPersistedRef() { try { sessionStorage.removeItem(REF_KEY); } catch {} }

/* ─── OAuth (Google / Discord) ──────────────────────────────────────── */
function apiBase() {
  return (import.meta as any).env?.VITE_API_BASE || "https://lunalive-api.onrender.com";
}
const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_failed: "La connexion via ce fournisseur a échoué. Réessaie ou utilise ton pseudo/mot de passe.",
  oauth_not_configured: "Cette méthode de connexion n'est pas disponible pour le moment.",
  email_conflict: "Un compte existe déjà avec cet email. Connecte-toi avec ton mot de passe.",
};

/* ─── CSS injecté UNE FOIS au niveau module (hors composant/hook) ── */
const STYLE_ID = "lm-styles-v1";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
@keyframes lm-fade-in  { from{opacity:0} to{opacity:1} }
@keyframes lm-slide-up { from{opacity:0;transform:translateY(18px) scale(.97)} to{opacity:1;transform:translateY(0) scale(1)} }
@keyframes lm-shimmer  { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
@keyframes lm-shake    { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-5px)} 40%{transform:translateX(5px)} 60%{transform:translateX(-3px)} 80%{transform:translateX(3px)} }
.lm-backdrop{
  position:fixed;inset:0;z-index:3000;
  display:grid;place-items:center;padding:20px;
  background:rgba(4,3,10,.80);
  backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
  animation:lm-fade-in 200ms ease;
}
.lm-dialog{
  position:relative;width:min(420px,100%);
  border-radius:22px;
  border:1px solid rgba(124,92,252,.22);
  background:rgba(11,9,22,.96);
  box-shadow:0 40px 100px rgba(0,0,0,.70),0 0 0 1px rgba(167,139,250,.08) inset,0 0 60px rgba(124,92,252,.10);
  backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
  overflow:hidden;
  animation:lm-slide-up 260ms cubic-bezier(.22,1,.36,1);
}
.lm-dialog::before{
  content:"";position:absolute;top:0;left:6%;right:6%;height:1px;
  background:linear-gradient(90deg,transparent,rgba(167,139,250,.50) 35%,rgba(91,142,248,.36) 65%,transparent);
  pointer-events:none;z-index:2;
}
.lm-dialog::after{
  content:"";position:absolute;top:-60px;left:-60px;
  width:300px;height:190px;border-radius:50%;
  background:radial-gradient(ellipse,rgba(124,92,252,.12),transparent 70%);
  pointer-events:none;
}
.lm-header{
  position:relative;z-index:1;
  display:flex;align-items:flex-start;justify-content:space-between;gap:12px;
  padding:16px 20px 14px;
  border-bottom:1px solid rgba(124,92,252,.12);
}
.lm-header-left{display:flex;flex-direction:column;gap:8px;}
.lm-title{
  font-weight:800;font-size:16px;letter-spacing:-.4px;line-height:1;
  background:linear-gradient(105deg,#c4b5fd 0%,#7c5cfc 35%,#5b8ef8 70%,#93c5fd 100%);
  background-size:220% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;
  filter:drop-shadow(0 0 8px rgba(124,92,252,.40));
  animation:lm-shimmer 5s ease-in-out infinite;
}
.lm-dots{display:flex;align-items:center;gap:5px;}
.lm-dot{width:6px;height:6px;border-radius:50%;background:rgba(124,92,252,.20);transition:background 200ms ease,transform 200ms ease;}
.lm-dot.is-active{background:rgba(124,92,252,.75);transform:scale(1.3);}
.lm-dot.is-done{background:rgba(52,211,153,.55);}
.lm-close{
  flex-shrink:0;width:32px;height:32px;border-radius:9px;
  border:1px solid rgba(124,92,252,.18);background:rgba(255,255,255,.04);
  color:rgba(235,232,255,.65);cursor:pointer;display:grid;place-items:center;font-size:13px;
  outline:none;-webkit-tap-highlight-color:transparent;
  transition:background 150ms ease,border-color 150ms ease,transform 130ms cubic-bezier(.22,1,.36,1);
}
.lm-close:hover{background:rgba(124,92,252,.12);border-color:rgba(124,92,252,.36);transform:scale(1.06);}
.lm-body{position:relative;z-index:1;padding:20px 20px 22px;display:flex;flex-direction:column;gap:12px;}
.lm-field{display:flex;flex-direction:column;gap:5px;}
.lm-label{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:rgba(167,155,220,.55);}
.lm-row{display:flex;gap:7px;}
.lm-input{
  flex:1;height:42px;padding:0 13px;
  border-radius:12px;
  border:1px solid rgba(124,92,252,.16);background:rgba(0,0,0,.28);
  color:rgba(235,232,255,.92);
  font-size:13px;font-weight:500;
  outline:none;-webkit-tap-highlight-color:transparent;
  transition:border-color 160ms ease,box-shadow 160ms ease;
}
.lm-input::placeholder{color:rgba(167,155,220,.28);}
.lm-input:focus{border-color:rgba(124,92,252,.45);box-shadow:0 0 0 3px rgba(124,92,252,.12);}
.lm-input:disabled{opacity:.50;cursor:not-allowed;}
.lm-eye{
  width:42px;height:42px;flex-shrink:0;border-radius:12px;
  border:1px solid rgba(124,92,252,.16);background:rgba(0,0,0,.28);
  color:rgba(200,195,240,.65);cursor:pointer;display:grid;place-items:center;font-size:15px;
  outline:none;transition:background 150ms ease,border-color 150ms ease;
}
.lm-eye:hover{background:rgba(124,92,252,.10);border-color:rgba(124,92,252,.30);}
.lm-hint{
  padding:10px 13px;border-radius:11px;
  border:1px solid rgba(124,92,252,.16);background:rgba(124,92,252,.08);
  font-size:12px;font-weight:500;
  color:rgba(200,195,240,.75);line-height:1.55;
}
.lm-hint.is-ref{border-color:rgba(251,191,36,.22);background:rgba(251,191,36,.08);color:rgba(253,230,138,.85);}
.lm-error{
  padding:9px 12px;border-radius:11px;
  border:1px solid rgba(239,68,68,.28);background:rgba(239,68,68,.10);
  font-size:12px;font-weight:600;color:rgba(252,165,165,.90);
  animation:lm-shake 300ms ease;
}
.lm-link{
  background:none;border:none;padding:0;cursor:pointer;text-align:left;
  font-size:12px;font-weight:600;
  color:rgba(167,139,250,.72);text-decoration:underline;
  transition:color 150ms ease;
}
.lm-link:hover{color:rgba(196,181,253,.95);}
.lm-link:disabled{opacity:.40;cursor:not-allowed;}
.lm-footer{display:flex;gap:8px;flex-wrap:wrap;padding-top:2px;}
.lm-btn-ghost{
  flex:1;min-width:100px;height:42px;border-radius:12px;
  border:1px solid rgba(124,92,252,.22);background:rgba(124,92,252,.07);
  color:rgba(200,195,240,.72);cursor:pointer;
  font-size:13px;font-weight:700;letter-spacing:-.15px;
  outline:none;-webkit-tap-highlight-color:transparent;
  transition:background 150ms ease,border-color 150ms ease,transform 120ms cubic-bezier(.22,1,.36,1);
}
.lm-btn-ghost:hover:not(:disabled){background:rgba(124,92,252,.13);border-color:rgba(124,92,252,.35);transform:translateY(-1px);}
.lm-btn-ghost:disabled{opacity:.35;cursor:not-allowed;}
.lm-btn-primary{
  position:relative;flex:2;min-width:120px;height:42px;border-radius:12px;
  border:1px solid rgba(124,92,252,.38);
  background:linear-gradient(135deg,rgba(124,92,252,.40),rgba(59,77,200,.28),rgba(91,142,248,.20));
  color:rgba(235,232,255,.96);cursor:pointer;
  font-size:13px;font-weight:800;letter-spacing:-.2px;
  box-shadow:0 8px 24px rgba(0,0,0,.32),0 0 0 1px rgba(124,92,252,.10) inset;
  outline:none;-webkit-tap-highlight-color:transparent;
  transition:transform 120ms cubic-bezier(.22,1,.36,1),filter 150ms ease,border-color 150ms ease,box-shadow 150ms ease;
}
.lm-btn-primary::before{
  content:"";position:absolute;top:0;left:10%;right:10%;height:1px;
  background:linear-gradient(90deg,transparent,rgba(200,180,255,.40),transparent);
}
.lm-btn-primary:hover:not(:disabled){
  filter:brightness(1.12);border-color:rgba(167,139,250,.58);
  box-shadow:0 12px 32px rgba(0,0,0,.40),0 0 24px rgba(124,92,252,.24),0 0 0 1px rgba(124,92,252,.14) inset;
  transform:translateY(-1px);
}
.lm-btn-primary:active:not(:disabled){transform:translateY(0);filter:brightness(.95);}
.lm-btn-primary:disabled{opacity:.38;cursor:not-allowed;}
.lm-oauth-row{display:flex;gap:8px;}
.lm-oauth-btn{
  flex:1;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;gap:7px;
  border:1px solid rgba(124,92,252,.18);background:rgba(255,255,255,.04);
  color:rgba(235,232,255,.88);cursor:pointer;font-size:12.5px;font-weight:700;letter-spacing:-.1px;
  outline:none;-webkit-tap-highlight-color:transparent;
  transition:background 150ms ease,border-color 150ms ease,transform 120ms cubic-bezier(.22,1,.36,1);
}
.lm-oauth-btn:hover:not(:disabled){background:rgba(124,92,252,.10);border-color:rgba(124,92,252,.32);transform:translateY(-1px);}
.lm-oauth-btn:disabled{opacity:.40;cursor:not-allowed;}
.lm-oauth-ic{flex-shrink:0;display:block;}
.lm-oauth-sep{display:flex;align-items:center;gap:10px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:rgba(167,155,220,.40);}
.lm-oauth-sep::before,.lm-oauth-sep::after{content:"";flex:1;height:1px;background:rgba(124,92,252,.16);}
`;
  document.head.appendChild(el);
}

/* ─── Field : composant stable défini AU MODULE LEVEL ────────────── */
// ✅ JAMAIS à l'intérieur d'un autre composant → pas de re-mount sur chaque render
const LmField = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="lm-field">
    <div className="lm-label">{label}</div>
    <div className="lm-row">{children}</div>
  </div>
);

/* Logos officiels (SVG inline — pas de requête réseau) */
const GoogleLogo = () => (
  <svg className="lm-oauth-ic" viewBox="0 0 18 18" width="17" height="17" aria-hidden focusable="false">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.02-3.7H.96v2.34A9 9 0 0 0 9 18z"/>
    <path fill="#FBBC05" d="M3.98 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.02-2.34z"/>
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.02 2.34C4.68 5.16 6.66 3.58 9 3.58z"/>
  </svg>
);
const DiscordLogo = () => (
  <svg className="lm-oauth-ic" viewBox="0 0 24 24" width="18" height="18" aria-hidden focusable="false">
    <path fill="#5865F2" d="M20.32 4.37A19.8 19.8 0 0 0 15.45 2.9a.07.07 0 0 0-.08.04c-.21.37-.44.86-.6 1.24a18.3 18.3 0 0 0-5.5 0 12.6 12.6 0 0 0-.61-1.24.08.08 0 0 0-.08-.04A19.7 19.7 0 0 0 3.7 4.37a.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.05 19.9 19.9 0 0 0 6 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.23-2a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.9.08.08 0 0 1-.01-.13l.37-.29a.07.07 0 0 1 .08-.01 14.2 14.2 0 0 0 12.06 0 .07.07 0 0 1 .08 0l.37.3a.08.08 0 0 1-.01.13c-.6.35-1.22.65-1.87.9a.08.08 0 0 0-.04.1c.36.7.78 1.37 1.23 2a.08.08 0 0 0 .08.04 19.8 19.8 0 0 0 6.01-3.04.08.08 0 0 0 .03-.05c.5-5.18-.84-9.67-3.54-13.66a.06.06 0 0 0-.03-.03zM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42zm7.97 0c-1.18 0-2.15-1.08-2.15-2.42 0-1.33.95-2.42 2.15-2.42 1.22 0 2.18 1.1 2.16 2.42 0 1.34-.94 2.42-2.16 2.42z"/>
  </svg>
);

const OAuthButtons = ({ disabled, onSelect }: { disabled: boolean; onSelect: (provider: "google" | "discord") => void }) => (
  <>
    <div className="lm-oauth-row">
      <button className="lm-oauth-btn" type="button" disabled={disabled} onClick={() => onSelect("google")}>
        <GoogleLogo /> Google
      </button>
      <button className="lm-oauth-btn" type="button" disabled={disabled} onClick={() => onSelect("discord")}>
        <DiscordLogo /> Discord
      </button>
    </div>
    <div className="lm-oauth-sep">ou</div>
  </>
);

/* ─────────────────────────────────────────────────────────────────────
   COMPOSANT PRINCIPAL
──────────────────────────────────────────────────────────────────────*/
export function LoginModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const boxRef = React.useRef<HTMLDivElement>(null);
  useOnClickOutside([asHTMLElementRef(boxRef)], onClose, open);
  const { setAuth } = useAuth();

  const [step,     setStep]     = React.useState<Step>("login");
  const [username, setUsername] = React.useState("");
  const [email,    setEmail]    = React.useState("");
  const [password, setPassword] = React.useState("");
  const [code,     setCode]     = React.useState("");
  const [newPass1, setNewPass1] = React.useState("");
  const [newPass2, setNewPass2] = React.useState("");
  const [showPass, setShowPass] = React.useState(false);
  const [showNew1, setShowNew1] = React.useState(false);
  const [showNew2, setShowNew2] = React.useState(false);
  const [err,      setErr]      = React.useState<string | null>(null);
  const [busy,     setBusy]     = React.useState(false);
  const [refSlug,  setRefSlug]  = React.useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = React.useState<string | null>(null);
  const turnstileRef = React.useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setErr(null); setBusy(false); setPassword(""); setCode(""); setEmail("");
    setNewPass1(""); setNewPass2(""); setShowPass(false); setShowNew1(false); setShowNew2(false);
    setStep("login");
    setRefSlug(readRefFromUrlAndPersist() || getPersistedRef());
  }, [open]);

  React.useEffect(() => {
    const fn = () => setStep("register_form");
    window.addEventListener("ui:open_register", fn as any);
    return () => window.removeEventListener("ui:open_register", fn as any);
  }, []);

  // Erreur remontée par le retour du flow OAuth (voir /oauth/done dans App.tsx)
  React.useEffect(() => {
    const fn = (ev: any) => {
      const code = String(ev?.detail?.error || "");
      setStep("login");
      setErr(OAUTH_ERROR_MESSAGES[code] || "Erreur de connexion. Réessaie.");
    };
    window.addEventListener("ui:oauth_error", fn as any);
    return () => window.removeEventListener("ui:oauth_error", fn as any);
  }, []);

  React.useEffect(() => {
    if (!open || step !== "register_form") return;
    setRefSlug(readRefFromUrlAndPersist() || getPersistedRef());
  }, [step, open]);

  // Cloudflare Turnstile loader + widget render (only on register_form step)
  React.useEffect(() => {
    const siteKey = (import.meta as any).env?.VITE_TURNSTILE_SITE_KEY as string | undefined;
    if (!open || step !== "register_form") return;
    if (!siteKey) {
      console.warn("[LoginModal] VITE_TURNSTILE_SITE_KEY missing — Turnstile widget disabled. Check Render env vars + redeploy web service.");
      return;
    }
    console.info("[LoginModal] Turnstile site key detected, loading widget…", siteKey.slice(0, 12) + "...");
    let cancelled = false;

    const ensureScript = () =>
      new Promise<void>((resolve) => {
        if ((window as any).turnstile) return resolve();
        const existing = document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]');
        if (existing) {
          (existing as HTMLScriptElement).addEventListener("load", () => resolve());
          return;
        }
        const s = document.createElement("script");
        s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        s.async = true;
        s.defer = true;
        s.onload = () => resolve();
        document.head.appendChild(s);
      });

    (async () => {
      await ensureScript();
      if (cancelled) return;
      const tw = (window as any).turnstile;
      if (!tw) {
        console.warn("[LoginModal] window.turnstile not available after script load");
        return;
      }
      if (!turnstileRef.current) {
        console.warn("[LoginModal] turnstileRef.current is null");
        return;
      }
      // If a previous widget exists, reset it instead of re-rendering
      if (turnstileWidgetIdRef.current) {
        try {
          tw.reset(turnstileWidgetIdRef.current);
          return;
        } catch (e) {
          console.warn("[LoginModal] turnstile.reset failed", e);
        }
      }
      try {
        turnstileWidgetIdRef.current = tw.render(turnstileRef.current, {
          sitekey: siteKey,
          callback: (token: string) => {
            console.info("[LoginModal] Turnstile token received");
            setTurnstileToken(token);
          },
          "error-callback": (err: any) => {
            console.warn("[LoginModal] Turnstile error", err);
            setTurnstileToken(null);
          },
          "expired-callback": () => setTurnstileToken(null),
          theme: "dark",
          size: "normal",
        });
        console.info("[LoginModal] Turnstile widget rendered, id=", turnstileWidgetIdRef.current);
      } catch (e) {
        console.error("[LoginModal] turnstile.render threw", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [step, open]);

  // ✅ return null AVANT les hooks interdit — on le met après
  if (!open) return null;

  const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

  function startOAuth(provider: "google" | "discord") {
    const ref = readRefFromUrlAndPersist() || refSlug || getPersistedRef();
    const utm = getStoredUtm();
    const params = new URLSearchParams();
    if (ref) params.set("ref", ref);
    if (utm) params.set("utm", JSON.stringify(utm));
    const qs = params.toString();
    window.location.href = `${apiBase()}/auth/oauth/${provider}/start${qs ? `?${qs}` : ""}`;
  }

  async function submitLogin() {
    setBusy(true); setErr(null);
    try {
      const u = username.trim();
      if (!u) throw new Error("Pseudo requis");
      if (password.length < 6) throw new Error("Mot de passe min 6 caractères");
      const r = await login(u, password);
      setAuth(r.token, r.user);
      clearPersistedRef(); setRefSlug(null); onClose();
      window.dispatchEvent(new CustomEvent("ui:login_success"));
    } catch (e: any) { setErr(String(e?.message || "Erreur")); }
    finally { setBusy(false); }
  }

  async function submitRegisterForm() {
    setBusy(true); setErr(null);
    try {
      const u = username.trim(), em = email.trim();
      if (!u) throw new Error("Pseudo requis");
      if (u.length < 3) throw new Error("Pseudo min 3 caractères");
      if (!isValidEmail(em)) throw new Error("Email invalide");
      if (password.length < 6) throw new Error("Mot de passe min 6 caractères");
      const ref = readRefFromUrlAndPersist() || refSlug || getPersistedRef();
      // If Turnstile is configured but no token yet, ask user to wait/retry
      const siteKey = (import.meta as any).env?.VITE_TURNSTILE_SITE_KEY as string | undefined;
      if (siteKey && !turnstileToken) {
        throw new Error("Vérification anti-bot en cours, réessaie dans 1 seconde");
      }
      const utm = getStoredUtm();
      const r = (await register(u, em, password, ref, turnstileToken, utm as any)) as unknown as RegisterResp;
      if (r?.needsVerify) { setStep("register_code"); if (r.devCode) setCode(String(r.devCode)); return; }
      if (r?.ok === false && r.error) throw new Error(r.error);
      throw new Error("Réponse register invalide");
    } catch (e: any) { setErr(String(e?.message || "Erreur")); }
    finally { setBusy(false); }
  }

  async function resendRegisterCode() {
    setBusy(true); setErr(null);
    try {
      const r = (await registerResend(username.trim())) as unknown as RegisterResp;
      if (r?.ok === false && r.error) throw new Error(r.error);
      if (r?.devCode) setCode(String(r.devCode));
    } catch (e: any) { setErr(String(e?.message || "Erreur")); }
    finally { setBusy(false); }
  }

  async function submitRegisterCode() {
    setBusy(true); setErr(null);
    try {
      const u = username.trim(), c = code.trim();
      if (!u) throw new Error("Pseudo requis");
      if (c.length < 4) throw new Error("Code requis");
      const r = await registerVerify(u, c);
      setAuth(r.token, r.user);
      clearPersistedRef(); setRefSlug(null); onClose();
      window.dispatchEvent(new CustomEvent("ui:login_success"));
    } catch (e: any) { setErr(String(e?.message || "Erreur")); }
    finally { setBusy(false); }
  }

  async function submitForgotEmail() {
    setBusy(true); setErr(null);
    try {
      if (!isValidEmail(email.trim())) throw new Error("Email invalide");
      const r = await forgotPasswordRequestCode(email.trim());
      setStep("forgot_code");
      if ((r as any)?.devCode) setCode(String((r as any).devCode));
    } catch (e: any) { setErr(String(e?.message || "Erreur")); }
    finally { setBusy(false); }
  }

  async function submitForgotCode() {
    setBusy(true); setErr(null);
    try {
      if (code.trim().length < 4) throw new Error("Code requis");
      setStep("forgot_newpass");
    } catch (e: any) { setErr(String(e?.message || "Erreur")); }
    finally { setBusy(false); }
  }

  async function submitForgotNewPass() {
    setBusy(true); setErr(null);
    try {
      if (newPass1.length < 6) throw new Error("Mot de passe min 6 caractères");
      if (newPass1 !== newPass2) throw new Error("Les mots de passe ne correspondent pas");
      const r = await forgotPasswordConfirm({ email: email.trim(), code: code.trim(), newPassword: newPass1 });
      setAuth(r.token, r.user); onClose();
    } catch (e: any) { setErr(String(e?.message || "Erreur")); }
    finally { setBusy(false); }
  }

  const stepMeta: Record<Step, { title: string; dots: number; active: number }> = {
    login:          { title: "Connexion",                dots: 1, active: 0 },
    register_form:  { title: "Créer un compte",          dots: 2, active: 0 },
    register_code:  { title: "Vérification email",       dots: 2, active: 1 },
    forgot_email:   { title: "Mot de passe oublié",      dots: 3, active: 0 },
    forgot_code:    { title: "Code de réinitialisation", dots: 3, active: 1 },
    forgot_newpass: { title: "Nouveau mot de passe",     dots: 3, active: 2 },
  };
  const { title, dots, active } = stepMeta[step];

  return createPortal(
    <div className="lm-backdrop" role="presentation"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="lm-dialog" role="dialog" aria-modal="true" aria-label={title} ref={boxRef}
        onMouseDown={e => e.stopPropagation()}>

        {/* Header */}
        <div className="lm-header">
          <div className="lm-header-left">
            <span className="lm-title">{title}</span>
            {dots > 1 && (
              <div className="lm-dots">
                {Array.from({ length: dots }, (_, i) => (
                  <div key={i} className={`lm-dot${i === active ? " is-active" : i < active ? " is-done" : ""}`} />
                ))}
              </div>
            )}
          </div>
          <button className="lm-close" type="button" aria-label="Fermer" onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div className="lm-body">

          {/* ══ LOGIN ══ */}
          {step === "login" && <>
            <OAuthButtons disabled={busy} onSelect={startOAuth} />
            <LmField label="Pseudo">
              <input className="lm-input" value={username} onChange={e => setUsername(e.target.value)}
                autoComplete="username" placeholder="ton_pseudo"
                onKeyDown={e => e.key === "Enter" && submitLogin()} />
            </LmField>
            <LmField label="Mot de passe">
              <input className="lm-input" type={showPass ? "text" : "password"} value={password}
                onChange={e => setPassword(e.target.value)} autoComplete="current-password" placeholder="••••••••"
                onKeyDown={e => e.key === "Enter" && submitLogin()} />
              <button className="lm-eye" type="button" onClick={() => setShowPass(v => !v)}
                aria-label={showPass ? "Masquer" : "Afficher"}>{showPass ? "🙈" : "👁️"}</button>
            </LmField>
            <button className="lm-link" type="button" disabled={busy}
              onClick={() => { setErr(null); setCode(""); setNewPass1(""); setNewPass2(""); setStep("forgot_email"); }}>
              Mot de passe oublié ?
            </button>
            {err && <div className="lm-error">⚠️ {err}</div>}
            <div className="lm-footer">
              <button className="lm-btn-ghost" disabled={busy}
                onClick={() => { setErr(null); setPassword(""); setStep("register_form"); }}>
                Créer un compte
              </button>
              <button className="lm-btn-primary" disabled={busy} onClick={submitLogin}>
                {busy ? "…" : "Se connecter"}
              </button>
            </div>
          </>}

          {/* ══ REGISTER FORM ══ */}
          {step === "register_form" && <>
            <OAuthButtons disabled={busy} onSelect={startOAuth} />
            {refSlug && <div className="lm-hint is-ref">🎁 Parrainage détecté : <strong>{refSlug}</strong></div>}
            <LmField label="Pseudo">
              <input className="lm-input" value={username} onChange={e => setUsername(e.target.value)}
                autoComplete="username" placeholder="ton_pseudo" />
            </LmField>
            <LmField label="Email">
              <input className="lm-input" value={email} onChange={e => setEmail(e.target.value)}
                inputMode="email" autoComplete="email" placeholder="toi@email.com" />
            </LmField>
            <LmField label="Mot de passe">
              <input className="lm-input" type="password" value={password}
                onChange={e => setPassword(e.target.value)} autoComplete="new-password" placeholder="min 6 caractères" />
            </LmField>
            <div ref={turnstileRef} style={{ marginTop: 8, display: "flex", justifyContent: "center" }} />
            {err && <div className="lm-error">⚠️ {err}</div>}
            <div className="lm-footer">
              <button className="lm-btn-ghost" disabled={busy}
                onClick={() => { setErr(null); setPassword(""); setEmail(""); setStep("login"); }}>
                J'ai déjà un compte
              </button>
              <button className="lm-btn-primary" disabled={busy} onClick={submitRegisterForm}>
                {busy ? "…" : "Envoyer le code"}
              </button>
            </div>
          </>}

          {/* ══ REGISTER CODE ══ */}
          {step === "register_code" && <>
            <div className="lm-hint">On t'a envoyé un code par email. Saisis-le pour finaliser ton compte.</div>
            {refSlug && <div className="lm-hint is-ref">🎁 Parrainage : <strong>{refSlug}</strong></div>}
            <LmField label="Pseudo"><input className="lm-input" value={username} disabled /></LmField>
            <LmField label="Code de vérification">
              <input className="lm-input" value={code} onChange={e => setCode(e.target.value)}
                inputMode="numeric" autoComplete="one-time-code" placeholder="123456"
                onKeyDown={e => e.key === "Enter" && submitRegisterCode()} />
            </LmField>
            {err && <div className="lm-error">⚠️ {err}</div>}
            <div className="lm-footer">
              <button className="lm-btn-ghost" disabled={busy}
                onClick={() => { setErr(null); setCode(""); setStep("register_form"); }}>Retour</button>
              <button className="lm-btn-ghost" disabled={busy} onClick={resendRegisterCode}>Renvoyer</button>
              <button className="lm-btn-primary" disabled={busy} onClick={submitRegisterCode}>
                {busy ? "…" : "Valider"}
              </button>
            </div>
          </>}

          {/* ══ FORGOT EMAIL ══ */}
          {step === "forgot_email" && <>
            <div className="lm-hint">Saisis ton email : on t'envoie un code de réinitialisation.</div>
            <LmField label="Email">
              <input className="lm-input" value={email} onChange={e => setEmail(e.target.value)}
                inputMode="email" autoComplete="email" placeholder="toi@email.com"
                onKeyDown={e => e.key === "Enter" && submitForgotEmail()} />
            </LmField>
            {err && <div className="lm-error">⚠️ {err}</div>}
            <div className="lm-footer">
              <button className="lm-btn-ghost" disabled={busy}
                onClick={() => { setErr(null); setStep("login"); }}>Retour</button>
              <button className="lm-btn-primary" disabled={busy} onClick={submitForgotEmail}>
                {busy ? "…" : "Envoyer le code"}
              </button>
            </div>
          </>}

          {/* ══ FORGOT CODE ══ */}
          {step === "forgot_code" && <>
            <div className="lm-hint">
              Un code a été envoyé à <strong style={{ color:"rgba(200,195,240,.85)" }}>{email}</strong>.
            </div>
            <LmField label="Email"><input className="lm-input" value={email} disabled /></LmField>
            <LmField label="Code">
              <input className="lm-input" value={code} onChange={e => setCode(e.target.value)}
                inputMode="numeric" autoComplete="one-time-code" placeholder="123456"
                onKeyDown={e => e.key === "Enter" && submitForgotCode()} />
            </LmField>
            {err && <div className="lm-error">⚠️ {err}</div>}
            <div className="lm-footer">
              <button className="lm-btn-ghost" disabled={busy}
                onClick={() => { setErr(null); setCode(""); setStep("forgot_email"); }}>Retour</button>
              <button className="lm-btn-primary" disabled={busy} onClick={submitForgotCode}>
                {busy ? "…" : "Continuer"}
              </button>
            </div>
          </>}

          {/* ══ FORGOT NEW PASS ══ */}
          {step === "forgot_newpass" && <>
            <div className="lm-hint">Choisis un nouveau mot de passe.</div>
            <LmField label="Nouveau mot de passe">
              <input className="lm-input" type={showNew1 ? "text" : "password"} value={newPass1}
                onChange={e => setNewPass1(e.target.value)} autoComplete="new-password" placeholder="min 6 caractères" />
              <button className="lm-eye" type="button" onClick={() => setShowNew1(v => !v)}
                aria-label={showNew1 ? "Masquer" : "Afficher"}>{showNew1 ? "🙈" : "👁️"}</button>
            </LmField>
            <LmField label="Confirmer">
              <input className="lm-input" type={showNew2 ? "text" : "password"} value={newPass2}
                onChange={e => setNewPass2(e.target.value)} autoComplete="new-password" placeholder="••••••••" />
              <button className="lm-eye" type="button" onClick={() => setShowNew2(v => !v)}
                aria-label={showNew2 ? "Masquer" : "Afficher"}>{showNew2 ? "🙈" : "👁️"}</button>
            </LmField>
            {err && <div className="lm-error">⚠️ {err}</div>}
            <div className="lm-footer">
              <button className="lm-btn-ghost" disabled={busy}
                onClick={() => { setErr(null); setNewPass1(""); setNewPass2(""); setStep("forgot_code"); }}>Retour</button>
              <button className="lm-btn-primary" disabled={busy} onClick={submitForgotNewPass}>
                {busy ? "…" : "Valider"}
              </button>
            </div>
          </>}

        </div>
      </div>
    </div>,
    document.body
  );
}