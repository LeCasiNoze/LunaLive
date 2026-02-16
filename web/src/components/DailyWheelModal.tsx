// web/src/components/DailyWheelModal.tsx
import * as React from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthProvider";
import { spinWheel, type ApiWheelMe, type ApiWheelSpinResult } from "../lib/api";

/* ─────────────────────────────────────────────────────────────────────
   SEGMENTS PAR DÉFAUT — mélangés (pas en ordre croissant)
   Les doublons sont intentionnels (pondération des probabilités).
──────────────────────────────────────────────────────────────────────*/
const FALLBACK_SEGMENTS: ApiWheelMe["segments"] = [
  { label: "+5",   amount: 5   },
  { label: "+100", amount: 100 },
  { label: "+10",  amount: 10  },
  { label: "+50",  amount: 50  },
  { label: "+5",   amount: 5   },
  { label: "+250", amount: 250 },
  { label: "+10",  amount: 10  },
  { label: "+25",  amount: 25  },
  { label: "+500", amount: 500 },
  { label: "+5",   amount: 5   },
  { label: "+50",  amount: 50  },
  { label: "+100", amount: 100 },
];

/* ─────────────────────────────────────────────────────────────────────
   COULEURS PAR RARETÉ
   Tier 1 — commun     (+1 → +10)  : bleu ardoise discret
   Tier 2 — peu commun (+25 → +50) : bleu-indigo moyen
   Tier 3 — rare       (+100 +250) : violet vif
   Tier 4 — légendaire (+500)      : or / ambre unique
──────────────────────────────────────────────────────────────────────*/
type SegColor = { fill: string; stroke: string; label: string };

function segColor(amount: number): SegColor {
  if (amount >= 500) return {
    fill:   "rgba(180, 90, 0, 0.72)",
    stroke: "rgba(251,191,36,0.88)",
    label:  "rgba(254,240,138,1)",
  };
  if (amount >= 100) return {
    fill:   "rgba(107,58,238,0.72)",
    stroke: "rgba(167,139,250,0.80)",
    label:  "rgba(224,210,255,0.97)",
  };
  if (amount >= 25) return {
    fill:   "rgba(55,60,200,0.64)",
    stroke: "rgba(100,120,240,0.72)",
    label:  "rgba(190,205,255,0.96)",
  };
  // Tier 1
  return {
    fill:   "rgba(32,46,140,0.58)",
    stroke: "rgba(70,100,210,0.62)",
    label:  "rgba(170,195,255,0.92)",
  };
}

/* ─── Audio Web Audio API ────────────────────────────────────────── */
function useAudioFx() {
  const ctxRef = React.useRef<AudioContext | null>(null);
  const getCtx = React.useCallback(() => {
    if (!ctxRef.current) {
      const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AC) ctxRef.current = new AC();
    }
    return ctxRef.current;
  }, []);

  const tick = React.useCallback(() => {
    const c = getCtx(); if (!c) return;
    try {
      const o = c.createOscillator(), g = c.createGain();
      o.type = "triangle"; o.frequency.value = 860 + Math.random() * 240;
      g.gain.value = 0.048; o.connect(g); g.connect(c.destination);
      const t = c.currentTime;
      o.start(t); o.stop(t + 0.020);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.020);
    } catch {}
  }, [getCtx]);

  const ding = React.useCallback(() => {
    const c = getCtx(); if (!c) return;
    [523, 659, 784, 1047].forEach((freq, i) => {
      window.setTimeout(() => {
        try {
          const o = c.createOscillator(), g = c.createGain();
          o.type = "sine"; o.frequency.value = freq;
          g.gain.value = 0.08; o.connect(g); g.connect(c.destination);
          const t = c.currentTime;
          o.start(t); o.stop(t + 0.18);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        } catch {}
      }, i * 80);
    });
  }, [getCtx]);

  const click = React.useCallback(() => {
    const c = getCtx(); if (!c) return;
    try {
      const o = c.createOscillator(), g = c.createGain();
      o.type = "sine"; o.frequency.value = 200;
      g.gain.value = 0.12; o.connect(g); g.connect(c.destination);
      const t = c.currentTime;
      o.start(t); o.stop(t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    } catch {}
  }, [getCtx]);

  return { tick, ding, click };
}

/* ─── inject styles ──────────────────────────────────────────────── */
function useInjectStyles(id: string, css: string) {
  React.useEffect(() => {
    if (document.getElementById(id)) return;
    const el = document.createElement("style");
    el.id = id; el.textContent = css;
    document.head.appendChild(el);
  }, [id, css]);
}

/* ─────────────────────────────────────────────────────────────────────
   CSS
──────────────────────────────────────────────────────────────────────*/
const CSS = `
@keyframes dwm-fade-in  { from{opacity:0}       to{opacity:1} }
@keyframes dwm-slide-up { from{opacity:0;transform:translateY(20px) scale(.97)} to{opacity:1;transform:translateY(0) scale(1)} }
@keyframes dwm-reward-pop {
  0%  {opacity:0;transform:scale(.68) translateY(10px)}
  60% {opacity:1;transform:scale(1.06) translateY(-2px)}
  100%{opacity:1;transform:scale(1) translateY(0)}
}
@keyframes dwm-pulse-ring {
  0%,100%{box-shadow:0 0 0 0 rgba(124,92,252,.0),0 0 0 3px rgba(124,92,252,.28)}
  50%    {box-shadow:0 0 0 8px rgba(124,92,252,.0),0 0 0 3px rgba(124,92,252,.52)}
}
@keyframes dwm-ptr-bounce {
  0%,100%{transform:translateX(-50%) translateY(0)}
  50%    {transform:translateX(-50%) translateY(-4px)}
}
@keyframes dwm-shimmer {
  0%  {background-position:0% 50%}
  50% {background-position:100% 50%}
  100%{background-position:0% 50%}
}
@keyframes dwm-gold-pulse {
  0%,100%{filter:drop-shadow(0 0 12px rgba(251,191,36,.52)) drop-shadow(0 0 28px rgba(251,191,36,.20))}
  50%    {filter:drop-shadow(0 0 22px rgba(251,191,36,.80)) drop-shadow(0 0 48px rgba(251,191,36,.36))}
}

/* Backdrop */
.dwm-backdrop{
  position:fixed;inset:0;z-index:2000;
  display:grid;place-items:center;padding:20px;
  background:rgba(4,3,10,.80);
  backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
  animation:dwm-fade-in 200ms ease;
}

/* Dialog */
.dwm-dialog{
  position:relative;width:min(520px,100%);
  border-radius:24px;
  border:1px solid rgba(124,92,252,.22);
  background:rgba(11,9,22,.96);
  box-shadow:0 40px 100px rgba(0,0,0,.72),0 0 0 1px rgba(167,139,250,.08) inset,0 0 60px rgba(124,92,252,.10);
  backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
  overflow:hidden;
  animation:dwm-slide-up 260ms cubic-bezier(.22,1,.36,1);
}
.dwm-dialog::before{
  content:"";position:absolute;top:0;left:6%;right:6%;height:1px;
  background:linear-gradient(90deg,transparent,rgba(167,139,250,.50) 35%,rgba(91,142,248,.36) 65%,transparent);
  pointer-events:none;z-index:2;
}
.dwm-dialog::after{
  content:"";position:absolute;top:-60px;left:-60px;
  width:320px;height:200px;border-radius:50%;
  background:radial-gradient(ellipse,rgba(124,92,252,.14),transparent 70%);
  pointer-events:none;
}

/* Header */
.dwm-header{
  position:relative;z-index:1;
  display:flex;align-items:center;justify-content:space-between;
  padding:16px 20px 14px;
  border-bottom:1px solid rgba(124,92,252,.12);
}
.dwm-title{
  font-family:'Syne',system-ui,sans-serif;
  font-weight:800;font-size:17px;letter-spacing:-.4px;line-height:1;
  background:linear-gradient(105deg,#c4b5fd 0%,#7c5cfc 35%,#5b8ef8 70%,#93c5fd 100%);
  background-size:220% 100%;
  -webkit-background-clip:text;background-clip:text;color:transparent;
  filter:drop-shadow(0 0 10px rgba(124,92,252,.45));
  animation:dwm-shimmer 5s ease-in-out infinite;
}
.dwm-close{
  width:34px;height:34px;border-radius:10px;
  border:1px solid rgba(124,92,252,.18);background:rgba(255,255,255,.04);
  color:rgba(235,232,255,.70);cursor:pointer;display:grid;place-items:center;font-size:14px;
  outline:none;-webkit-tap-highlight-color:transparent;
  transition:background 160ms ease,border-color 160ms ease,transform 140ms cubic-bezier(.22,1,.36,1);
}
.dwm-close:hover{background:rgba(124,92,252,.12);border-color:rgba(124,92,252,.36);transform:scale(1.06);}

/* Body */
.dwm-body{
  position:relative;z-index:1;
  padding:22px 20px 24px;
  display:flex;flex-direction:column;align-items:center;gap:20px;
}

/* Stage */
.dwm-stage{position:relative;width:min(310px,82vw);aspect-ratio:1/1;}

/* Lueur externe */
.dwm-wheel-glow{
  position:absolute;inset:-20px;border-radius:50%;
  background:radial-gradient(ellipse,rgba(124,92,252,.16),transparent 68%);
  pointer-events:none;opacity:.8;transition:opacity 400ms ease;
}
.dwm-wheel-glow.is-spinning{opacity:1.6;}

/* Anneau fixe */
.dwm-wheel-ring{
  position:absolute;inset:-5px;border-radius:50%;z-index:4;
  border:2px solid rgba(124,92,252,.28);
  box-shadow:0 0 0 1px rgba(167,139,250,.10),0 0 28px rgba(124,92,252,.16);
  pointer-events:none;
  transition:border-color 400ms ease,box-shadow 400ms ease;
}
.dwm-wheel-ring.is-spinning{
  border-color:rgba(167,139,250,.55);
  box-shadow:0 0 0 1px rgba(167,139,250,.22),0 0 50px rgba(124,92,252,.35);
  animation:dwm-pulse-ring .9s ease-in-out infinite;
}

/* SVG wrapper — FIXE, clip propre */
.dwm-wheel-svg{
  position:absolute;inset:0;
  width:100%;height:100%;
  display:block;border-radius:50%;overflow:hidden;
  box-shadow:0 18px 55px rgba(0,0,0,.55);
}

/* Hub central */
.dwm-hub{
  position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
  z-index:10;width:78px;height:78px;border-radius:50%;
  background:rgba(9,7,20,.96);
  border:2px solid rgba(124,92,252,.35);
  box-shadow:0 0 0 1px rgba(167,139,250,.12),0 10px 40px rgba(0,0,0,.65),inset 0 1px 0 rgba(255,255,255,.08);
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
  pointer-events:none;
  transition:border-color 300ms ease,box-shadow 300ms ease;
}
.dwm-hub.is-spinning{
  border-color:rgba(167,139,250,.60);
  box-shadow:0 0 0 1px rgba(167,139,250,.22),0 10px 40px rgba(0,0,0,.65),0 0 24px rgba(124,92,252,.30),inset 0 1px 0 rgba(255,255,255,.10);
}
.dwm-hub-top{font-family:'Syne',system-ui,sans-serif;font-weight:800;font-size:13px;letter-spacing:-.2px;color:rgba(235,232,255,.92);}
.dwm-hub-sub{font-family:'Syne',system-ui,sans-serif;font-size:10px;font-weight:600;color:rgba(167,139,250,.65);}

/* Pointeur */
.dwm-pointer{
  position:absolute;top:-6px;left:50%;transform:translateX(-50%);
  z-index:12;display:flex;flex-direction:column;align-items:center;
  pointer-events:none;
  filter:drop-shadow(0 4px 12px rgba(0,0,0,.55));
  animation:dwm-ptr-bounce 2s ease-in-out infinite;
}
.dwm-pointer-tri{width:0;height:0;border-left:10px solid transparent;border-right:10px solid transparent;border-top:16px solid rgba(235,232,255,.92);}
.dwm-pointer-dot{width:10px;height:10px;border-radius:50%;background:rgba(235,232,255,.92);margin-top:-1px;box-shadow:0 6px 18px rgba(0,0,0,.45);}

/* Canvas particules */
.dwm-particles{position:absolute;inset:-64px;pointer-events:none;z-index:20;}

/* Reward */
.dwm-reward{animation:dwm-reward-pop 420ms cubic-bezier(.22,1,.36,1);display:flex;flex-direction:column;align-items:center;gap:5px;}
.dwm-reward-amount{
  font-family:'Syne',system-ui,sans-serif;font-weight:800;font-size:28px;letter-spacing:-1px;
  background:linear-gradient(105deg,#fde68a 0%,#fbbf24 40%,#f59e0b 100%);
  background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;
  animation:dwm-shimmer 3s ease-in-out infinite,dwm-gold-pulse 2s ease-in-out infinite;
}
.dwm-reward-label{font-family:'Syne',system-ui,sans-serif;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:rgba(167,155,220,.55);}

/* Hint */
.dwm-hint{font-family:'Syne',system-ui,sans-serif;font-size:12px;font-weight:500;color:rgba(167,155,220,.55);text-align:center;}
.dwm-hint.is-error{color:rgba(252,165,165,.80);}

/* Footer */
.dwm-footer{width:100%;display:flex;gap:10px;}
.dwm-btn-ghost{
  flex:1;height:44px;border-radius:13px;
  border:1px solid rgba(124,92,252,.22);background:rgba(124,92,252,.07);
  color:rgba(200,195,240,.70);cursor:pointer;
  font-family:'Syne',system-ui,sans-serif;font-size:13px;font-weight:700;letter-spacing:-.15px;
  outline:none;-webkit-tap-highlight-color:transparent;
  transition:background 160ms ease,border-color 160ms ease,transform 120ms cubic-bezier(.22,1,.36,1);
}
.dwm-btn-ghost:hover:not(:disabled){background:rgba(124,92,252,.13);border-color:rgba(124,92,252,.35);transform:translateY(-1px);}
.dwm-btn-ghost:disabled{opacity:.35;cursor:not-allowed;}

.dwm-btn-spin{
  position:relative;flex:2;height:44px;border-radius:13px;
  border:1px solid rgba(124,92,252,.38);
  background:linear-gradient(135deg,rgba(124,92,252,.40),rgba(59,77,200,.28),rgba(91,142,248,.20));
  color:rgba(235,232,255,.96);cursor:pointer;
  font-family:'Syne',system-ui,sans-serif;font-size:14px;font-weight:800;letter-spacing:-.2px;
  box-shadow:0 8px 28px rgba(0,0,0,.36),0 0 0 1px rgba(124,92,252,.10) inset;
  outline:none;-webkit-tap-highlight-color:transparent;
  transition:transform 120ms cubic-bezier(.22,1,.36,1),filter 150ms ease,border-color 150ms ease,box-shadow 150ms ease;
}
.dwm-btn-spin::before{content:"";position:absolute;top:0;left:10%;right:10%;height:1px;background:linear-gradient(90deg,transparent,rgba(200,180,255,.44),transparent);}
.dwm-btn-spin:hover:not(:disabled){
  filter:brightness(1.14);border-color:rgba(167,139,250,.60);
  box-shadow:0 14px 38px rgba(0,0,0,.42),0 0 28px rgba(124,92,252,.28),0 0 0 1px rgba(124,92,252,.18) inset;
  transform:translateY(-2px);
}
.dwm-btn-spin:active:not(:disabled){transform:translateY(0);filter:brightness(.95);}
.dwm-btn-spin:disabled{opacity:.40;cursor:not-allowed;}
`;

/* ─────────────────────────────────────────────────────────────────────
   COMPOSANT PRINCIPAL
──────────────────────────────────────────────────────────────────────*/
export function DailyWheelModal({
  open,
  onClose,
  canSpin,
  segments,
  onAfterSpin,
}: {
  open:        boolean;
  onClose:     () => void;
  canSpin:     boolean;
  segments?:   ApiWheelMe["segments"];
  onAfterSpin?: () => void | Promise<void>;
}) {
  useInjectStyles("dwm-styles", CSS);

  const auth  = useAuth() as any;
  const token = auth?.token ?? null;

  const segs     = (segments?.length ? segments : FALLBACK_SEGMENTS) as ApiWheelMe["segments"];
  const n        = Math.max(1, segs.length);
  const sliceRad = (2 * Math.PI) / n;
  const sliceDeg = 360 / n;

  /* ── rotation accumulée du <g> SVG ── */
  const [rotDeg,   setRotDeg]   = React.useState(0);
  const rotRef                   = React.useRef(0);

  /* CSS vars pour @keyframes dwm-group-spin injectés inline */
  const [spinFrom, setSpinFrom] = React.useState("0deg");
  const [spinTo,   setSpinTo]   = React.useState("0deg");

  const [phase,  setPhase]  = React.useState<"idle" | "spinning" | "done" | "error">("idle");
  const [msg,    setMsg]    = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ApiWheelSpinResult | null>(null);
  const [burst,  setBurst]  = React.useState(false);

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const groupRef  = React.useRef<SVGGElement | null>(null);

  const { tick, ding, click } = useAudioFx();

  /* reset à l'ouverture */
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setPhase("idle"); setMsg(null); setResult(null); setBurst(false);
    setRotDeg(0); rotRef.current = 0;
    setSpinFrom("0deg"); setSpinTo("0deg");
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  /* ── Particules canvas ── */
  const burstRef    = React.useRef(false);
  const partFrameRef = React.useRef(0);

  React.useEffect(() => {
    if (!burst) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const c2 = canvas.getContext("2d"); if (!c2) return;
    c2.scale(dpr, dpr);
    const CX = W / 2, CY = H / 2;
    const COLS = ["#c4b5fd","#a78bfa","#7c5cfc","#5b8ef8","#fbbf24","#f472b6","#34d399","#fde68a"];
    type P = {x:number;y:number;vx:number;vy:number;color:string;size:number;life:number;rot:number;vrot:number};
    const pts: P[] = Array.from({length:64}, () => {
      const a = Math.random()*Math.PI*2, s = 3+Math.random()*5.5;
      return {x:CX,y:CY,vx:Math.cos(a)*s,vy:Math.sin(a)*s-2.2,
        color:COLS[Math.floor(Math.random()*COLS.length)]!,
        size:4+Math.random()*6,life:1,
        rot:Math.random()*Math.PI*2,vrot:(Math.random()-.5)*.28};
    });
    burstRef.current = true;
    const draw = () => {
      if (!burstRef.current) return;
      c2.clearRect(0,0,W,H);
      let alive = false;
      for (const p of pts) {
        if (p.life <= 0) continue; alive = true;
        c2.save(); c2.globalAlpha = p.life;
        c2.translate(p.x,p.y); c2.rotate(p.rot);
        c2.fillStyle = p.color; c2.beginPath();
        c2.rect(-p.size/2,-p.size/2,p.size,p.size*.52); c2.fill(); c2.restore();
        p.x+=p.vx; p.y+=p.vy; p.vy+=.18; p.vx*=.97; p.vy*=.97; p.rot+=p.vrot; p.life-=.020;
      }
      if (alive) partFrameRef.current = requestAnimationFrame(draw);
    };
    partFrameRef.current = requestAnimationFrame(draw);
    return () => { burstRef.current = false; cancelAnimationFrame(partFrameRef.current); };
  }, [burst]);

  /* ── Spin ── */
  async function onSpin() {
    if (!token)               { setMsg("Connecte-toi pour tourner."); setPhase("error"); return; }
    if (!canSpin)             { setMsg("Déjà utilisée aujourd'hui."); setPhase("error"); return; }
    if (phase === "spinning") return;

    click(); setMsg(null);
    await new Promise(r => requestAnimationFrame(() => r(null)));

    try {
      const r = (await spinWheel(token)) as ApiWheelSpinResult;
      setResult(r);

      const newRubis = Number((r as any)?.user?.rubis);
      if (Number.isFinite(newRubis)) {
        try { (auth as any)?.patchUser?.({ rubis: newRubis }); } catch {}
        try { window.dispatchEvent(new CustomEvent("rubis:update", {detail:{rubis:newRubis,source:"wheel"}})); } catch {}
      }

      const idx    = Number((r as any).segmentIndex ?? 0);
      const spins  = 7 + Math.floor(Math.random() * 3);
      const cAngle = (idx + 0.5) * sliceDeg;
      const addDeg = spins * 360 + (360 - cAngle);
      const from   = rotRef.current;
      const to     = from + addDeg;

      const DURATION   = 4400;
      const totalTicks = Math.max(14, spins * n);
      const intervalMs = Math.max(18, Math.floor(DURATION / totalTicks));

      /* ✅ injecter les CSS vars AVANT de passer spinning */
      setSpinFrom(`${from}deg`);
      setSpinTo(`${to}deg`);
      rotRef.current = to;

      await new Promise(res => requestAnimationFrame(() => res(null)));
      setPhase("spinning");

      let c = 0;
      const tid = window.setInterval(() => { c++; tick(); if (c >= totalTicks) window.clearInterval(tid); }, intervalMs);

      window.setTimeout(async () => {
        window.clearInterval(tid); ding();
        setRotDeg(to % 360); setPhase("done"); setBurst(true);
        try { await onAfterSpin?.(); } catch {}
      }, DURATION + 40);

    } catch (e: any) {
      const m = String(e?.message || e);
      setMsg(m === "already_used" ? "Déjà utilisée aujourd'hui." : "Erreur réseau, réessaie.");
      setPhase("error");
    }
  }

  if (!open) return null;

  const rw      = (result as any)?.reward;
  const rewardV = rw && typeof rw === "object" ? Number(rw.raw ?? 0) : Number(rw ?? 0);
  const btnLabel =
    phase === "spinning" ? "Ça tourne…"
    : phase === "done"   ? "C'est fait ! 🎉"
    : "Tourner la roue";

  /* ✅ keyframes inline avec les valeurs exactes du spin courant */
  const spinKF = `@keyframes dwm-group-spin {
    from { transform: rotate(${spinFrom}); }
    to   { transform: rotate(${spinTo}); }
  }`;

  return createPortal(
    <div className="dwm-backdrop" role="presentation" onClick={onClose}>
      <style>{spinKF}</style>

      <div className="dwm-dialog" role="dialog" aria-modal="true" aria-label="Daily Wheel"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="dwm-header">
          <span className="dwm-title">🎡 Daily Wheel</span>
          <button className="dwm-close" type="button" aria-label="Fermer" onClick={onClose} disabled={phase === "spinning"}>✕</button>
        </div>

        {/* Body */}
        <div className="dwm-body">

          {/* Stage */}
          <div className="dwm-stage">
            <div className={`dwm-wheel-glow${phase === "spinning" ? " is-spinning" : ""}`} />
            <div className={`dwm-wheel-ring${phase === "spinning" ? " is-spinning" : ""}`} />

            {/* Pointeur — fixe, par-dessus le SVG */}
            <div className="dwm-pointer">
              <div className="dwm-pointer-tri" />
              <div className="dwm-pointer-dot" />
            </div>

            {/* ✅ SVG FIXE — seul le <g> interne tourne */}
            <svg className="dwm-wheel-svg" viewBox="0 0 340 340" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <radialGradient id="dwm-gloss" cx="35%" cy="28%" r="65%">
                  <stop offset="0%"   stopColor="rgba(255,255,255,0.16)" />
                  <stop offset="100%" stopColor="rgba(0,0,0,0)" />
                </radialGradient>
              </defs>

              {/* Fond sombre fixe */}
              <circle cx={170} cy={170} r={162} fill="rgba(10,8,20,0.92)" />

              {/* ✅ Groupe rotatif — transform-origin exactement au centre 170,170 */}
              <g
                ref={groupRef}
                style={
                  phase === "spinning"
                    ? { transformOrigin: "170px 170px",
                        animation: `dwm-group-spin ${DURATION_MS}ms cubic-bezier(0.12,0.82,0.10,1) forwards` }
                    : { transformOrigin: "170px 170px",
                        transform: `rotate(${rotDeg}deg)` }
                }
              >
                {/* Segments */}
                {segs.map((seg, i) => {
                  const a0 = i * sliceRad - Math.PI / 2;
                  const a1 = a0 + sliceRad;
                  const x1 = 170 + 160 * Math.cos(a0), y1 = 170 + 160 * Math.sin(a0);
                  const x2 = 170 + 160 * Math.cos(a1), y2 = 170 + 160 * Math.sin(a1);
                  const large = sliceRad > Math.PI ? 1 : 0;
                  const col   = segColor(seg.amount);
                  const midA  = a0 + sliceRad / 2;
                  const lr    = 160 * 0.63;
                  const lx = 170 + lr * Math.cos(midA), ly = 170 + lr * Math.sin(midA);
                  const tRot = (midA * 180) / Math.PI + 90;

                  return (
                    <g key={i}>
                      <path
                        d={`M 170 170 L ${x1} ${y1} A 160 160 0 ${large} 1 ${x2} ${y2} Z`}
                        fill={col.fill} stroke={col.stroke} strokeWidth={0.8}
                      />
                      {/* Séparateur */}
                      <line x1={170} y1={170} x2={x1} y2={y1} stroke="rgba(255,255,255,0.10)" strokeWidth={0.8} />
                      {/* Label couleur par rareté */}
                      <text
                        x={lx} y={ly}
                        textAnchor="middle" dominantBaseline="middle"
                        transform={`rotate(${tRot},${lx},${ly})`}
                        fill={col.label}
                        fontSize={n > 9 ? "11" : "13"}
                        fontFamily="'Syne',system-ui,sans-serif"
                        fontWeight="800"
                      >
                        {seg.label}
                      </text>
                    </g>
                  );
                })}

                {/* Gloss (tourne avec les segments) */}
                <circle cx={170} cy={170} r={160} fill="url(#dwm-gloss)" />
              </g>

              {/* Bords fixes par-dessus le groupe */}
              <circle cx={170} cy={170} r={160}     fill="none" stroke="rgba(167,139,250,0.32)" strokeWidth={2.5} />
              <circle cx={170} cy={170} r={157.5}   fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={1}   />
            </svg>

            {/* Hub central — hors SVG, toujours fixe */}
            <div className={`dwm-hub${phase === "spinning" ? " is-spinning" : ""}`}>
              <div className="dwm-hub-top">{phase === "spinning" ? "…" : phase === "done" ? "GG" : "GO"}</div>
              <div className="dwm-hub-sub">{phase === "spinning" ? "spin" : phase === "done" ? "✓" : "Spin"}</div>
            </div>

            {/* Canvas particules */}
            <canvas ref={canvasRef} className="dwm-particles" />
          </div>

          {/* Reward */}
          {phase === "done" && result && (
            <div className="dwm-reward">
              <div className="dwm-reward-amount">+{rewardV.toLocaleString("fr-FR")} 💎</div>
              <div className="dwm-reward-label">rubis gagnés</div>
            </div>
          )}

          {/* Hint / erreur */}
          {msg && <div className={`dwm-hint${phase === "error" ? " is-error" : ""}`}>{phase === "error" ? "⚠️ " : ""}{msg}</div>}

          {/* Footer */}
          <div className="dwm-footer">
            <button className="dwm-btn-ghost" type="button" onClick={onClose} disabled={phase === "spinning"}>Fermer</button>
            <button className="dwm-btn-spin"  type="button" onClick={onSpin}  disabled={phase === "spinning" || phase === "done"}>{btnLabel}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

const DURATION_MS = 4400;