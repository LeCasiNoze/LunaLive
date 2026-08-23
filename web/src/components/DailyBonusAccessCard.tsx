// web/src/components/DailyBonusAccessCard.tsx
import * as React from "react";
import { useAuth } from "../auth/AuthProvider";
import { getDailyBonusState, publicListContentTabs, type ApiPublicContentTab } from "../lib/api";
import { DailyBonusAgendaModal, type DailyBonusState } from "./DailyBonusAgendaModal";
import { contentVersionFromItem, isUnread } from "../lib/unread_seen";

/* ─── styles scopés (harmonisés DailyWheel) ──────────────────────────── */
const css = `
@keyframes dba-shimmer {
  0%   { background-position:   0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position:   0% 50%; }
}
@keyframes dba-ready-pulse {
  0%, 100% { box-shadow: 0 0 0 1px rgba(124,92,252,0.30), 0 0 16px rgba(124,92,252,0.16); }
  50%       { box-shadow: 0 0 0 1px rgba(167,139,250,0.55), 0 0 28px rgba(124,92,252,0.32); }
}
@keyframes dba-dot {
  0%,100% { opacity: 1; transform: scale(1); }
  50%     { opacity: .45; transform: scale(.75); }
}
@keyframes dba-rubis-pop {
  0%   { transform: scale(1);    }
  40%  { transform: scale(1.08); }
  100% { transform: scale(1);    }
}

/* ── Card shell (identique DW) ── */
.dba-card {
  position: relative;
  border-radius: 18px;
  border: 1px solid rgba(124,92,252,0.14);
  background: rgba(13, 11, 24, 0.82);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  overflow: hidden;
  transition: border-color 220ms ease, box-shadow 220ms ease;
}
.dba-card:hover {
  border-color: rgba(124,92,252,0.28);
  box-shadow: 0 18px 60px rgba(0,0,0,0.40), 0 0 0 1px rgba(124,92,252,0.07);
}

/* Reflet haut — signature verre */
.dba-card::before {
  content: "";
  position: absolute;
  top: 0; left: 8%; right: 8%;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(167,139,250,0.40) 35%,
    rgba(91,142,248,0.28)  65%,
    transparent
  );
  pointer-events: none;
}

/* Lueur ambiante coin haut-gauche */
.dba-card::after {
  content: "";
  position: absolute;
  top: -40px; left: -40px;
  width: 200px; height: 140px;
  border-radius: 50%;
  background: radial-gradient(ellipse, rgba(124,92,252,0.10), transparent 70%);
  pointer-events: none;
}

/* Variante "nouveautés" — lueur plus forte */
.dba-card.is-ready {
  border-color: rgba(124,92,252,0.22);
  animation: dba-ready-pulse 2.6s ease-in-out infinite;
}

.dba-inner {
  position: relative;
  z-index: 1;
  padding: 14px 16px 16px;
}

/* ── Header ── */
.dba-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.dba-title-wrap { min-width: 0; flex: 1; }
.dba-label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 3px;
}

/* Icône */
.dba-icon {
  width: 22px; height: 22px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  font-size: 15px;
  filter: drop-shadow(0 0 6px rgba(124,92,252,0.30));
  opacity: 0.88;
}

/* Titre — identique DW */
.dba-title {
  font-family: 'Syne', system-ui, sans-serif;
  font-weight: 800;
  font-size: 15px;
  letter-spacing: -0.4px;
  line-height: 1;
  background: linear-gradient(
    105deg,
    #c4b5fd 0%,
    #7c5cfc 35%,
    #5b8ef8 70%,
    #93c5fd 100%
  );
  background-size: 220% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  filter:
    drop-shadow(0 0 8px rgba(124,92,252,0.40))
    drop-shadow(0 0 20px rgba(91,142,248,0.15));
  animation: dba-shimmer 5s ease-in-out infinite;
}

/* Sous-titre */
.dba-sub {
  font-family: 'Syne', system-ui, sans-serif;
  font-size: 11px;
  font-weight: 500;
  color: rgba(167,155,220,0.52);
  line-height: 1;
  margin-top: 1px;
  min-height: 14px;
  display: flex;
  align-items: center;
  gap: 5px;
}
.dba-sub.is-ready { color: rgba(167,139,250,0.75); }

/* Dot nouveautés */
.dba-ready-dot {
  width: 5px; height: 5px;
  border-radius: 50%;
  background: #a78bfa;
  flex-shrink: 0;
  animation: dba-dot 1.4s ease-in-out infinite;
}

/* ── Pill status (identique dwc-rubis-pill) ── */
.dba-status-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(124,92,252,0.10);
  border: 1px solid rgba(124,92,252,0.22);
  font-family: 'Syne', system-ui, sans-serif;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: -0.1px;
  color: #c4b5fd;
  box-shadow: 0 4px 14px rgba(0,0,0,0.22);
  flex-shrink: 0;
  cursor: pointer;
  transition:
    border-color 200ms ease,
    background   200ms ease,
    transform    120ms cubic-bezier(0.22,1,0.36,1),
    filter       150ms ease;
  -webkit-tap-highlight-color: transparent;
  outline: none;
}
.dba-status-pill:hover:not(:disabled) {
  background: rgba(124,92,252,0.16);
  border-color: rgba(124,92,252,0.35);
  filter: brightness(1.04);
  transform: translateY(-1px);
}
.dba-status-pill:active:not(:disabled) {
  transform: translateY(0px);
}
.dba-status-pill:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.dba-status-pill.pop {
  animation: dba-rubis-pop 300ms cubic-bezier(0.22,1,0.36,1);
}

/* ── Divider ── */
.dba-divider {
  height: 1px;
  margin: 12px 0;
  background: linear-gradient(
    90deg,
    rgba(124,92,252,0.0),
    rgba(124,92,252,0.18) 30%,
    rgba(91,142,248,0.12) 70%,
    rgba(91,142,248,0.0)
  );
}

/* ── Bouton principal (identique DW) ── */
.dba-btn {
  position: relative;
  width: 100%;
  padding: 11px 18px;
  border-radius: 13px;
  border: 1px solid rgba(124,92,252,0.32);
  cursor: pointer;
  font-family: 'Syne', system-ui, sans-serif;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.15px;
  color: rgba(235,232,255,0.96);
  background: linear-gradient(
    135deg,
    rgba(124,92,252,0.32),
    rgba(59,77,200,0.22),
    rgba(91,142,248,0.16)
  );
  box-shadow: 0 8px 24px rgba(0,0,0,0.30), 0 0 0 1px rgba(124,92,252,0.08) inset;
  transition:
    transform    100ms cubic-bezier(0.22,1,0.36,1),
    filter       150ms ease,
    border-color 150ms ease,
    box-shadow   150ms ease;
  outline: none;
  -webkit-tap-highlight-color: transparent;
}
/* Reflet haut du bouton */
.dba-btn::before {
  content: "";
  position: absolute;
  top: 0; left: 10%; right: 10%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(200,180,255,0.38), transparent);
  pointer-events: none;
}
.dba-btn:hover:not(:disabled) {
  filter: brightness(1.12);
  border-color: rgba(124,92,252,0.55);
  box-shadow:
    0 12px 36px rgba(0,0,0,0.38),
    0 0 22px rgba(124,92,252,0.22),
    0 0 0 1px rgba(124,92,252,0.14) inset;
  transform: translateY(-1px);
}
.dba-btn:active:not(:disabled) {
  transform: translateY(1px);
  filter: brightness(0.95);
}
.dba-btn:disabled {
  opacity: 0.38;
  cursor: not-allowed;
}
/* État "ghost" (non connecté) */
.dba-btn.is-ghost {
  background: rgba(255,255,255,0.04);
  border-color: rgba(255,255,255,0.08);
  color: rgba(200,195,240,0.50);
  box-shadow: none;
}
.dba-btn.is-ghost::before { display: none; }
.dba-card{font-family:'Manrope',sans-serif;border-radius:17px;border-color:rgba(196,181,253,.12);background:rgba(17,11,28,.86);box-shadow:none;transform:none!important}.dba-card::before{left:16px;right:16px;background:linear-gradient(90deg,rgba(159,131,255,.65),transparent)}.dba-card::after{opacity:.3}.dba-title,.dba-stat-value,.dba-btn{font-family:'Manrope',sans-serif}.dba-title{font-size:15px;letter-spacing:-.25px;background:none;-webkit-text-fill-color:initial;color:#ede7f5;filter:none}.dba-icon{border-radius:11px}.dba-btn{height:42px;border-radius:11px;background:rgba(124,92,252,.14);box-shadow:none}.dba-btn:hover:not(:disabled){transform:none;box-shadow:none;background:rgba(124,92,252,.22)}
`;

/* ─── helpers ──────────────────────────────────────────────────────── */
type Role = "viewer" | "moderator" | "streamer" | "admin";

function roleRank(r: any): number {
  const v = String(r || "viewer").toLowerCase();
  if (v === "admin")                    return 3;
  if (v === "streamer")                 return 2;
  if (v === "moderator" || v === "mod") return 1;
  return 0;
}

function canSee(minRole: Role, userRole: any) {
  return roleRank(userRole) >= roleRank(minRole);
}

function versionFromAnyItem(item: any) {
  return contentVersionFromItem({
    ...item,
    updatedAt: (item as any)?.updatedAt ?? (item as any)?.updated_at,
  } as any);
}

function useInjectStyles(id: string, styles: string) {
  React.useEffect(() => {
    if (document.getElementById(id)) return;
    const el = document.createElement("style");
    el.id = id;
    el.textContent = styles;
    document.head.appendChild(el);
  }, [id, styles]);
}

/* ─── composant ────────────────────────────────────────────────────── */
export function DailyBonusAccessCard() {
  useInjectStyles("dba-styles", css);

  const auth     = useAuth() as any;
  const token    = auth?.token ?? null;
  const userRole: Role = String(auth?.user?.role || "viewer").toLowerCase() as any;

  const [unreadAny, setUnreadAny] = React.useState(false);

  const reloadUnread = React.useCallback(async () => {
    if (!token) { setUnreadAny(false); return; }
    try {
      const r: any = await publicListContentTabs();
      const items  = Array.isArray(r?.items) ? (r.items as ApiPublicContentTab[]) : [];

      const visible = items.filter((it: any) => {
        const minRole = String(it?.min_role || "viewer").toLowerCase() as Role;
        return canSee(minRole, userRole);
      });

      const results = visible.map((it: any) => {
        const key = String(it?.key || "").trim();
        if (!key) return false;
        const v = versionFromAnyItem(it);
        return v ? isUnread(`content:${key}`, v) : false;
      });

      setUnreadAny(results.some(Boolean));
    } catch {
      setUnreadAny(false);
    }
  }, [token, userRole]);

  React.useEffect(() => { reloadUnread(); }, [reloadUnread]);

  React.useEffect(() => {
    const onSeen    = () => reloadUnread();
    const onStorage = () => reloadUnread();
    window.addEventListener("ll:content-seen", onSeen    as any);
    window.addEventListener("storage",         onStorage as any);
    return () => {
      window.removeEventListener("ll:content-seen", onSeen    as any);
      window.removeEventListener("storage",         onStorage as any);
    };
  }, [reloadUnread]);

  const [state,   setState]   = React.useState<DailyBonusState | null>(null);
  const [open,    setOpen]    = React.useState(false);
  const [opening, setOpening] = React.useState(false);
  const [pillPop, setPillPop] = React.useState(false);

  const openAgenda = React.useCallback(async () => {
    if (!token) return;
    if (state?.ok) { setOpen(true); return; }
    setOpening(true);
    try {
      const s = await getDailyBonusState(token);
      if (s?.ok) setState(s as any);
      setOpen(true);
    } catch (e) {
      console.error(e);
    } finally {
      setOpening(false);
    }
  }, [token, state]);

  /* pop pill quand unread change */
  React.useEffect(() => {
    if (!token || !unreadAny) return;
    setPillPop(true);
    const id = window.setTimeout(() => setPillPop(false), 350);
    return () => window.clearTimeout(id);
  }, [token, unreadAny]);

  /* ── dérivés ── */
  const isReady   = !!token && unreadAny;
  const locked    = !token;
  const disabled  = locked || opening;

  const subtitle = !token
    ? "Connecte-toi pour voir l'agenda"
    : opening
    ? "Chargement…"
    : unreadAny
    ? "Nouveautés disponibles"
    : "Agenda & récompenses";

  const mainLabel = !token
    ? "Se connecter"
    : opening
    ? "Chargement…"
    : "Ouvrir l'agenda";

  return (
    <>
      <div className={`dba-card${isReady ? " is-ready" : ""}`}>
        <div className="dba-inner">

          {/* ── Header ── */}
          <div className="dba-header">
            <div className="dba-title-wrap">
              <div className="dba-label">
                <span className="dba-icon" aria-hidden>🎁</span>
                <span className="dba-title">Daily Bonus</span>
              </div>
              <div className={`dba-sub${isReady && !opening ? " is-ready" : ""}`}>
                {isReady && !opening && <span className="dba-ready-dot" />}
                {subtitle}
              </div>
            </div>

            {/* Pill status — visible si connecté */}
            {token && (
              <button
                type="button"
                className={`dba-status-pill${pillPop ? " pop" : ""}`}
                onClick={openAgenda}
                disabled={opening}
                title={unreadAny ? "Nouveautés disponibles" : "Agenda & récompenses"}
              >
                {unreadAny ? "✨ Nouveau" : "📅 Agenda"}
              </button>
            )}
          </div>

          <div className="dba-divider" />

          {/* ── Bouton principal ── */}
          <button
            type="button"
            className={`dba-btn${locked ? " is-ghost" : ""}`}
            onClick={openAgenda}
            disabled={disabled}
            title={!token ? "Connecte-toi pour accéder à l'agenda" : undefined}
          >
            {mainLabel}
          </button>

        </div>
      </div>

      {open && state?.ok ? (
        <DailyBonusAgendaModal
          state={state}
          onState={(s) => setState(s)}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
