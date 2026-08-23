// web/src/components/DailyWheelCard.tsx
import * as React from "react";
import { useAuth } from "../auth/AuthProvider";
import { getWheelState, type ApiWheelMe } from "../lib/api";
import { LoginModal } from "./LoginModal";
import { DailyWheelModal } from "./DailyWheelModal";

/* ─── styles scopés ─────────────────────────────────────────────────── */
const css = `
@keyframes dwc-shimmer {
  0%   { background-position:   0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position:   0% 50%; }
}
@keyframes dwc-spin-idle {
  0%   { transform: rotate(0deg);   }
  100% { transform: rotate(360deg); }
}
@keyframes dwc-spin-ready {
  0%   { transform: rotate(0deg);   filter: drop-shadow(0 0 4px rgba(124,92,252,0.0));  }
  50%  { transform: rotate(180deg); filter: drop-shadow(0 0 8px rgba(167,139,250,0.70)); }
  100% { transform: rotate(360deg); filter: drop-shadow(0 0 4px rgba(124,92,252,0.0));  }
}
@keyframes dwc-ready-pulse {
  0%, 100% { box-shadow: 0 0 0 1px rgba(124,92,252,0.30), 0 0 16px rgba(124,92,252,0.16); }
  50%       { box-shadow: 0 0 0 1px rgba(167,139,250,0.55), 0 0 28px rgba(124,92,252,0.32); }
}
@keyframes dwc-rubis-pop {
  0%   { transform: scale(1);    }
  40%  { transform: scale(1.08); }
  100% { transform: scale(1);    }
}

/* ── Card shell ── */
.dwc-card {
  position: relative;
  border-radius: 18px;
  border: 1px solid rgba(124,92,252,0.14);
  background: rgba(13, 11, 24, 0.82);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  overflow: hidden;
  transition: border-color 220ms ease, box-shadow 220ms ease;
}
.dwc-card:hover {
  border-color: rgba(124,92,252,0.28);
  box-shadow: 0 18px 60px rgba(0,0,0,0.40), 0 0 0 1px rgba(124,92,252,0.07);
}
/* Reflet haut — signature verre */
.dwc-card::before {
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
.dwc-card::after {
  content: "";
  position: absolute;
  top: -40px; left: -40px;
  width: 200px; height: 140px;
  border-radius: 50%;
  background: radial-gradient(ellipse, rgba(124,92,252,0.10), transparent 70%);
  pointer-events: none;
}

/* Variante "roue prête" — lueur plus forte */
.dwc-card.is-ready {
  border-color: rgba(124,92,252,0.22);
  animation: dwc-ready-pulse 2.6s ease-in-out infinite;
}

.dwc-inner {
  position: relative;
  z-index: 1;
  padding: 14px 16px 16px;
}

/* ── Header ── */
.dwc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.dwc-title-wrap { min-width: 0; flex: 1; }

.dwc-label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 3px;
}

/* Icône roue animée */
.dwc-wheel-icon {
  width: 22px; height: 22px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  font-size: 15px;
  filter: drop-shadow(0 0 6px rgba(124,92,252,0.30));
}
.dwc-wheel-icon.is-idle  { animation: dwc-spin-idle  8s linear infinite; opacity: 0.55; }
.dwc-wheel-icon.is-ready { animation: dwc-spin-ready 3s ease-in-out infinite; }

/* Titre — même ADN que brandName */
.dwc-title {
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
  animation: dwc-shimmer 5s ease-in-out infinite;
}

/* Sous-titre */
.dwc-sub {
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
.dwc-sub.is-ready { color: rgba(167,139,250,0.75); }

/* Dot "prête" */
.dwc-ready-dot {
  width: 5px; height: 5px;
  border-radius: 50%;
  background: #a78bfa;
  flex-shrink: 0;
  animation: dwc-spin-idle 1.4s ease-in-out infinite;
}

/* ── Pill rubis ── */
.dwc-rubis-pill {
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
  transition: border-color 200ms ease, background 200ms ease;
}
.dwc-rubis-pill:hover {
  background: rgba(124,92,252,0.16);
  border-color: rgba(124,92,252,0.35);
}
.dwc-rubis-pill.pop { animation: dwc-rubis-pop 300ms cubic-bezier(0.22,1,0.36,1); }

/* ── Divider ── */
.dwc-divider {
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

/* ── Ticket badge ── */
.dwc-tickets {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: 20px;
  font-family: 'Syne', system-ui, sans-serif;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: #c4b5fd;
  background: rgba(124,92,252,0.14);
  border: 1px solid rgba(124,92,252,0.25);
  margin-top: 8px;
}

/* ── Bouton principal ── */
.dwc-btn {
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
.dwc-btn::before {
  content: "";
  position: absolute;
  top: 0; left: 10%; right: 10%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(200,180,255,0.38), transparent);
  pointer-events: none;
}
.dwc-btn:hover:not(:disabled) {
  filter: brightness(1.12);
  border-color: rgba(124,92,252,0.55);
  box-shadow:
    0 12px 36px rgba(0,0,0,0.38),
    0 0 22px rgba(124,92,252,0.22),
    0 0 0 1px rgba(124,92,252,0.14) inset;
  transform: translateY(-1px);
}
.dwc-btn:active:not(:disabled) {
  transform: translateY(1px);
  filter: brightness(0.95);
}
.dwc-btn:disabled {
  opacity: 0.38;
  cursor: not-allowed;
}

/* État "déjà utilisée" — ghost */
.dwc-btn.is-used {
  background: rgba(255,255,255,0.04);
  border-color: rgba(255,255,255,0.08);
  color: rgba(200,195,240,0.50);
  box-shadow: none;
}
.dwc-btn.is-used::before { display: none; }
.dwc-card{font-family:'Manrope',sans-serif;border-radius:17px;border-color:rgba(196,181,253,.12);background:rgba(17,11,28,.86);box-shadow:none;transform:none!important}.dwc-card::before{left:16px;right:16px;background:linear-gradient(90deg,rgba(159,131,255,.7),transparent)}.dwc-card::after{opacity:.35}.dwc-title,.dwc-balance-value,.dwc-btn{font-family:'Manrope',sans-serif}.dwc-title{font-size:15px;letter-spacing:-.25px;background:none;-webkit-text-fill-color:initial;color:#ede7f5;filter:none}.dwc-icon{border-radius:11px}.dwc-btn{height:42px;border-radius:11px;background:rgba(124,92,252,.14);box-shadow:none}.dwc-btn:hover:not(:disabled){transform:none;box-shadow:none;background:rgba(124,92,252,.22)}
`;

/* ─── helpers ────────────────────────────────────────────────────────── */
function isLeCasinoze(username?: string | null) {
  return String(username || "").trim().toLowerCase() === "lecasinoze";
}
function num(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
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

/* ─── composant ─────────────────────────────────────────────────────── */
export function DailyWheelCard() {
  useInjectStyles("dwc-styles", css);

  const auth      = useAuth() as any;
  const token     = auth?.token ?? null;
  const user      = auth?.user ?? null;
  const patchUser: ((p: any) => void) | undefined = auth?.patchUser;

  const god = isLeCasinoze(user?.username);

  const [loading,  setLoading]  = React.useState(false);
  const [canSpin,  setCanSpin]  = React.useState(false);
  const [segments, setSegments] = React.useState<ApiWheelMe["segments"] | undefined>(undefined);
  const [tickets,  setTickets]  = React.useState<number>(0);

  const [loginOpen, setLoginOpen] = React.useState(false);
  const [wheelOpen, setWheelOpen] = React.useState(false);

  /* ── solde rubis live ── */
  const [rubisLive, setRubisLive] = React.useState<number | null>(null);
  const [rubisPop,  setRubisPop]  = React.useState(false);

  React.useEffect(() => {
    if (!token) { setRubisLive(null); setTickets(0); return; }
    const v = Number(user?.rubis ?? 0);
    if (Number.isFinite(v)) setRubisLive(v);
  }, [token, user?.rubis]);

  React.useEffect(() => {
    const onRubisUpdate = (ev: any) => {
      const v = Number(ev?.detail?.rubis);
      if (!Number.isFinite(v)) return;
      setRubisLive(v);
      patchUser?.({ rubis: v });
      /* micro-animation pop */
      setRubisPop(true);
      setTimeout(() => setRubisPop(false), 350);
    };
    window.addEventListener("rubis:update", onRubisUpdate as any);
    return () => window.removeEventListener("rubis:update", onRubisUpdate as any);
  }, [patchUser]);

  /* ── refresh wheel state ── */
  const refresh = React.useCallback(async () => {
    if (!token) { setCanSpin(false); setSegments(undefined); setTickets(0); return; }
    setLoading(true);
    try {
      const r: any = await getWheelState(token);
      const t = Math.max(0, Math.floor(num(r?.tickets, 0)));
      setTickets(t);
      const can = god ? true : !!r?.canSpin || t > 0;
      setCanSpin(can);
      setSegments(Array.isArray(r?.segments) ? r.segments : undefined);
    } catch {
      setCanSpin(god ? true : false);
      setSegments(undefined);
      setTickets(0);
    } finally {
      setLoading(false);
    }
  }, [token, god]);

  React.useEffect(() => { refresh(); }, [refresh]);

  /* ── dérivés ── */
  const displayRubis = Number(rubisLive ?? user?.rubis ?? 0);
  const isReady      = token ? (god || canSpin) : false;
  const isUsed       = token && !loading && !god && !canSpin;

  const subtitle = !token
    ? "Connecte-toi pour tourner"
    : loading
    ? "Chargement…"
    : canSpin
    ? "Prête à tourner"
    : "Déjà utilisée aujourd'hui";

  const btnLabel = !token
    ? "Se connecter"
    : loading
    ? "Chargement…"
    : !god && !canSpin
    ? "Roue déjà utilisée"
    : "Faire tourner la roue";

  return (
    <>
      <div className={`dwc-card${isReady ? " is-ready" : ""}`}>
        <div className="dwc-inner">

          {/* ── Header ── */}
          <div className="dwc-header">
            <div className="dwc-title-wrap">
              <div className="dwc-label">
                <span className={`dwc-wheel-icon${isReady ? " is-ready" : " is-idle"}`} aria-hidden>
                  🎡
                </span>
                <span className="dwc-title">Daily Wheel</span>
              </div>
              <div className={`dwc-sub${isReady && !loading ? " is-ready" : ""}`}>
                {isReady && !loading && <span className="dwc-ready-dot" />}
                {subtitle}
              </div>
            </div>

            {/* Pill rubis */}
            {token && (
              <div className={`dwc-rubis-pill${rubisPop ? " pop" : ""}`} title="Solde rubis">
                💎&nbsp;{displayRubis.toLocaleString("fr-FR")}
              </div>
            )}
          </div>

          <div className="dwc-divider" />

          {/* Bouton principal */}
          <button
            className={`dwc-btn${isUsed ? " is-used" : ""}`}
            type="button"
            onClick={() => {
              if (!token) return setLoginOpen(true);
              if (!god && !canSpin) return;
              setWheelOpen(true);
            }}
            disabled={loading || (!god && !!token && !canSpin)}
          >
            {btnLabel}
            {/* Badge tickets bonus — sous le bouton */}
            {token && tickets > 0 && (
              <div className="dwc-tickets" style={{ marginTop: 8, marginBottom: 0 }}>
                🎡 {tickets} ticket{tickets > 1 ? "s" : ""} bonus disponible{tickets > 1 ? "s" : ""}
              </div>
            )}
          </button>
        </div>
      </div>

      <DailyWheelModal
        open={wheelOpen}
        onClose={() => setWheelOpen(false)}
        canSpin={canSpin}
        segments={segments}
        onAfterSpin={refresh}
      />

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </>
  );
}
