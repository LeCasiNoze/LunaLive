// ─────────────────────────────────────────────────────────────────────────────
// M3 — Spinning Wheel : ambiance néon vivante (gradient mesh animé, halos
// pulsants, particules flottantes, segments couleurs vives). Plus de feel
// "roulette cirque" — direction casino moderne / arcade premium.
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import { sfx } from "../lib/v3_sound";
import { V3SocialProof } from "./V3SocialProof";
import { pseudoTextStyle, pseudoPillStyle, type V3LineStyleLike } from "../lib/v3_pseudo_style";
import { V3OfferPopup } from "./V3OfferPopup";

export type M3WheelProps = {
  pseudo?: string;
  profileImageUrl?: string;
  depositAmount?: number | null;
  bonusAmount?: number | null;
  affiLink: string;
  theme?: {
    accent?: string;
    accentLight?: string;
    accentGlow?: string;
    bgPage?: string;
    bgCard?: string;
    borderColor?: string;
  };
  pseudoStyle?: V3LineStyleLike;
};

const SEGMENTS = [
  { label: "100%", win: true  },
  { label: "10%",  win: false },
  { label: "30%",  win: false },
  { label: "0",    win: false },
  { label: "50%",  win: false },
  { label: "5%",   win: false },
  { label: "20%",  win: false },
  { label: "0",    win: false },
];
const WIN_INDEX = 0;
const SLICE_DEG = 360 / SEGMENTS.length;

// Palette néon vive — alternance violet/cyan/magenta/rose
const NEON_COLORS = ["#a855f7", "#06b6d4", "#ec4899", "#22d3ee", "#8b5cf6", "#f43f5e", "#0ea5e9", "#d946ef"];

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const toRad = (d: number) => (d - 90) * Math.PI / 180;
  const x1 = cx + r * Math.cos(toRad(startDeg));
  const y1 = cy + r * Math.sin(toRad(startDeg));
  const x2 = cx + r * Math.cos(toRad(endDeg));
  const y2 = cy + r * Math.sin(toRad(endDeg));
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

export function M3Wheel({ pseudo, profileImageUrl, depositAmount, bonusAmount, affiLink, theme, pseudoStyle }: M3WheelProps) {
  const T = {
    accent:      theme?.accent      || "#d4a843",
    accentLight: theme?.accentLight || "#f0c84a",
    accentDark:  "#8a6724",
    accentGlow:  theme?.accentGlow  || "rgba(212,168,67,.4)",
    bgPage:      theme?.bgPage      || "#0a0712",
    bgCard:      theme?.bgCard      || "#15101a",
  };
  const [phase, setPhase] = React.useState<"idle" | "spinning" | "won">("idle");
  const [angle, setAngle] = React.useState(0);
  const [popupOpen, setPopupOpen] = React.useState(false);

  const dep = depositAmount != null ? `${depositAmount}€` : "";
  const bon = bonusAmount != null ? `${bonusAmount}€` : "";
  const safeAffi = affiLink || "#";
  const rewardScore = bon ? `+${bon}` : "100%";
  const popupSteps = React.useMemo(() => [
    "Validation de la roue",
    "Preparation de l'offre",
    "Lien bonus pret",
  ], []);

  const spin = () => {
    if (phase !== "idle") return;
    sfx.click();
    sfx.wheelTicks(4200);
    setPhase("spinning");
    const target = 360 * 6 + (360 - (WIN_INDEX * SLICE_DEG + SLICE_DEG / 2));
    setAngle(target);
    setTimeout(() => sfx.tension(800), 3400);
    setTimeout(() => {
      sfx.win();
      setPhase("won");
      setPopupOpen(true);
    }, 4400);
  };

  return (
    <div className="m3-root" style={{ color: "#f5f1e6" }}>
      <style>{`
        .m3-root{position:relative;display:flex;flex-direction:column;align-items:center;padding:32px 16px 56px;font-family:'Inter',-apple-system,sans-serif;overflow:hidden;min-height:100%;background:radial-gradient(circle at 20% 10%,#1a0a2e 0%,transparent 45%),radial-gradient(circle at 80% 20%,#0a1a3e 0%,transparent 45%),radial-gradient(circle at 50% 90%,#2a0a3e 0%,transparent 50%),${T.bgPage}}

        /* Mesh gradient animé en arrière-plan */
        .m3-bg-mesh{position:absolute;inset:-20%;background:
          radial-gradient(circle at 30% 40%,${T.accentGlow} 0%,transparent 40%),
          radial-gradient(circle at 70% 60%,rgba(168,85,247,.35) 0%,transparent 40%),
          radial-gradient(circle at 50% 20%,rgba(6,182,212,.25) 0%,transparent 40%);
          filter:blur(40px);animation:m3-mesh 18s ease-in-out infinite alternate;pointer-events:none;z-index:0}
        .m3-bg-grain{position:absolute;inset:0;background-image:radial-gradient(circle at 50% 50%,rgba(255,255,255,.04) 1px,transparent 1px);background-size:24px 24px;opacity:.5;pointer-events:none;z-index:0}

        /* Particules flottantes */
        .m3-particle{position:absolute;width:4px;height:4px;border-radius:50%;background:${T.accentLight};box-shadow:0 0 8px ${T.accent},0 0 14px ${T.accent};pointer-events:none;z-index:1;opacity:.55}
        .m3-particle.p1{top:18%;left:12%;animation:m3-float 9s ease-in-out infinite}
        .m3-particle.p2{top:35%;right:14%;animation:m3-float 11s ease-in-out infinite 1s;background:#a855f7;box-shadow:0 0 8px #a855f7,0 0 14px #a855f7}
        .m3-particle.p3{top:65%;left:8%;animation:m3-float 13s ease-in-out infinite .5s;background:#06b6d4;box-shadow:0 0 8px #06b6d4,0 0 14px #06b6d4}
        .m3-particle.p4{top:78%;right:18%;animation:m3-float 10s ease-in-out infinite 2s;background:#ec4899;box-shadow:0 0 8px #ec4899,0 0 14px #ec4899}
        .m3-particle.p5{top:48%;left:88%;animation:m3-float 14s ease-in-out infinite 1.5s}
        .m3-particle.p6{top:22%;left:50%;animation:m3-float 12s ease-in-out infinite .8s;background:#22d3ee;box-shadow:0 0 8px #22d3ee,0 0 14px #22d3ee}

        .m3-header{display:flex;flex-direction:column;align-items:center;gap:10px;margin-bottom:18px;position:relative;z-index:3}
        .m3-avatar{width:74px;height:74px;border-radius:50%;border:2px solid ${T.accent};overflow:hidden;box-shadow:0 0 0 4px rgba(0,0,0,.4),0 0 22px ${T.accentGlow}}
        .m3-avatar img{width:100%;height:100%;object-fit:cover;display:block}
        .m3-pseudo-wrap{display:flex;justify-content:center;margin-top:2px}

        .m3-promo{position:relative;z-index:3;display:inline-block;padding:9px 20px;margin-bottom:22px;background:rgba(10,5,25,.65);border:1px solid ${T.accent}66;border-radius:999px;font-size:.78rem;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:rgba(245,241,230,.92);backdrop-filter:blur(6px);box-shadow:0 0 18px ${T.accentGlow}}
        .m3-promo strong{color:${T.accentLight};font-weight:800;text-shadow:0 0 8px ${T.accentGlow}}

        .m3-cabinet{position:relative;width:min(92vw,360px);aspect-ratio:1/1;margin-bottom:32px;z-index:3}

        /* Halo extérieur pulsant néon */
        .m3-halo{position:absolute;inset:-12%;border-radius:50%;background:conic-gradient(from 0deg,${T.accent},#a855f7,#06b6d4,#ec4899,${T.accent});filter:blur(28px);opacity:.55;animation:m3-halo-spin 8s linear infinite;pointer-events:none}
        .m3-halo.spinning{animation:m3-halo-spin 1.6s linear infinite,m3-halo-pulse 1.2s ease-in-out infinite alternate}

        /* Anneau extérieur métal+néon */
        .m3-outer-ring{position:absolute;inset:0;border-radius:50%;background:conic-gradient(${T.accent},${T.accentDark},${T.accent},${T.accentDark},${T.accent});box-shadow:0 8px 30px rgba(0,0,0,.6),0 0 40px ${T.accentGlow},inset 0 0 0 3px rgba(0,0,0,.4),inset 0 2px 4px rgba(255,255,255,.18)}

        /* Pointeur */
        .m3-pointer{position:absolute;top:-6px;left:50%;transform:translateX(-50%);z-index:8;filter:drop-shadow(0 0 8px ${T.accent}) drop-shadow(0 3px 6px rgba(0,0,0,.7))}

        /* Pegs lumineux */
        .m3-peg{position:absolute;width:9px;height:9px;border-radius:50%;background:radial-gradient(circle at 30% 30%,#fff,${T.accent} 60%,${T.accentDark});box-shadow:0 0 6px ${T.accent},0 0 12px ${T.accentGlow},0 1px 2px rgba(0,0,0,.6);z-index:6;animation:m3-peg-pulse 2.8s ease-in-out infinite}

        /* Disque qui tourne */
        .m3-wheel{position:absolute;inset:8%;border-radius:50%;background:#05030a;box-shadow:inset 0 0 32px rgba(0,0,0,.9),inset 0 0 60px rgba(168,85,247,.15);transform:rotate(0deg);transition:transform 4.2s cubic-bezier(.17,.67,.16,.99);z-index:3}
        .m3-wheel.spinning{transform:rotate(${angle}deg)}

        /* Hub central — bouton neon */
        .m3-hub{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:62px;height:62px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,${T.accentLight} 35%,${T.accent} 65%,${T.accentDark});box-shadow:0 0 24px ${T.accent},0 0 44px ${T.accentGlow},0 4px 12px rgba(0,0,0,.6),inset 0 2px 0 rgba(255,255,255,.4),inset 0 -3px 0 rgba(0,0,0,.5);z-index:7;border:2px solid rgba(255,255,255,.35);display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:800;color:#0e0a05;letter-spacing:.12em;text-shadow:0 1px 0 rgba(255,255,255,.4);animation:m3-hub-pulse 2.4s ease-in-out infinite}
        .m3-hub.spinning{animation:m3-hub-spinning .6s ease-in-out infinite}

        /* CTA néon */
        .m3-cta{position:relative;display:block;width:min(92vw,360px);padding:18px 24px;background:linear-gradient(180deg,${T.accentLight},${T.accent} 60%,${T.accentDark});color:#0a0508;font-weight:800;text-transform:uppercase;letter-spacing:.16em;font-size:.95rem;border:none;border-radius:8px;cursor:pointer;box-shadow:0 6px 0 ${T.accentDark},0 10px 30px ${T.accentGlow},inset 0 1px 0 rgba(255,255,255,.4);text-decoration:none;text-align:center;font-family:inherit;transition:transform .1s ease,box-shadow .1s ease;z-index:3;overflow:hidden}
        .m3-cta::before{content:"";position:absolute;top:0;left:-100%;width:80%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent);animation:m3-cta-shimmer 2.8s linear infinite}
        .m3-cta:not(:disabled):hover{transform:translateY(2px);box-shadow:0 4px 0 ${T.accentDark},0 8px 22px ${T.accentGlow},inset 0 1px 0 rgba(255,255,255,.4)}
        .m3-cta:not(:disabled):active{transform:translateY(5px);box-shadow:0 1px 0 ${T.accentDark}}
        .m3-cta:disabled{background:linear-gradient(180deg,#3a3a42,#1f1f24);color:rgba(255,255,255,.55);cursor:not-allowed;box-shadow:0 3px 0 rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.06)}
        .m3-cta:disabled::before{display:none}

        .m3-info{margin-top:16px;font-size:.78rem;color:rgba(245,241,230,.7);letter-spacing:.05em;position:relative;z-index:3;text-align:center}
        .m3-info .dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#22c55e;margin-right:6px;box-shadow:0 0 8px #22c55e;animation:m3-blink 1.4s ease-in-out infinite}

        @keyframes m3-mesh{0%{transform:translate(0,0) rotate(0deg)}50%{transform:translate(-30px,20px) rotate(8deg)}100%{transform:translate(20px,-15px) rotate(-6deg)}}
        @keyframes m3-float{0%,100%{transform:translate(0,0)}50%{transform:translate(14px,-22px)}}
        @keyframes m3-halo-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes m3-halo-pulse{from{opacity:.55;filter:blur(28px)}to{opacity:.85;filter:blur(36px)}}
        @keyframes m3-peg-pulse{0%,100%{filter:brightness(1)}50%{filter:brightness(1.5)}}
        @keyframes m3-hub-pulse{0%,100%{box-shadow:0 0 24px ${T.accent},0 0 44px ${T.accentGlow},0 4px 12px rgba(0,0,0,.6),inset 0 2px 0 rgba(255,255,255,.4),inset 0 -3px 0 rgba(0,0,0,.5)}50%{box-shadow:0 0 36px ${T.accentLight},0 0 64px ${T.accent},0 4px 12px rgba(0,0,0,.6),inset 0 2px 0 rgba(255,255,255,.5),inset 0 -3px 0 rgba(0,0,0,.5)}}
        @keyframes m3-hub-spinning{0%,100%{transform:translate(-50%,-50%) scale(1)}50%{transform:translate(-50%,-50%) scale(1.08)}}
        @keyframes m3-cta-shimmer{0%{left:-100%}100%{left:120%}}
        @keyframes m3-blink{0%,100%{opacity:1}50%{opacity:.3}}
      `}</style>

      <div className="m3-bg-mesh" />
      <div className="m3-bg-grain" />
      <span className="m3-particle p1" />
      <span className="m3-particle p2" />
      <span className="m3-particle p3" />
      <span className="m3-particle p4" />
      <span className="m3-particle p5" />
      <span className="m3-particle p6" />

      <div className="m3-header">
        {profileImageUrl ? <div className="m3-avatar"><img src={profileImageUrl} alt="" /></div> : null}
        {pseudo ? (
          <div className="m3-pseudo-wrap">
            <div style={{ ...pseudoPillStyle(T.accent), ...pseudoTextStyle(pseudoStyle, T.accent) }}>
              {pseudo}
            </div>
          </div>
        ) : null}
      </div>

      <div className="m3-promo">
        Roue de la fortune · <strong>1 essai gratuit</strong>
      </div>

      <div className="m3-cabinet">
        <div className={`m3-halo ${phase === "spinning" ? "spinning" : ""}`} />
        <div className="m3-outer-ring" />

        {Array.from({ length: 16 }).map((_, i) => {
          const ang = (i * 360 / 16) * Math.PI / 180;
          const r = 47;
          const x = 50 + r * Math.cos(ang - Math.PI / 2);
          const y = 50 + r * Math.sin(ang - Math.PI / 2);
          return (
            <div
              key={i}
              className="m3-peg"
              style={{ left: `calc(${x}% - 4.5px)`, top: `calc(${y}% - 4.5px)`, animationDelay: `${i * 0.12}s` }}
            />
          );
        })}

        <svg className="m3-pointer" width="38" height="46" viewBox="0 0 38 46">
          <defs>
            <linearGradient id="m3-steel" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fff" />
              <stop offset=".4" stopColor={T.accentLight} />
              <stop offset="1" stopColor={T.accentDark} />
            </linearGradient>
          </defs>
          <path d="M19 44 L4 8 Q4 4 8 4 L30 4 Q34 4 34 8 Z" fill="url(#m3-steel)" stroke="#0a0a0a" strokeWidth="1.2" />
          <circle cx="19" cy="14" r="3" fill="#0a0a0a" />
        </svg>

        <svg
          className={`m3-wheel ${phase !== "idle" ? "spinning" : ""}`}
          viewBox="0 0 200 200"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {NEON_COLORS.map((c, i) => (
              <radialGradient id={`m3-seg-${i}`} key={i} cx="50%" cy="50%" r="60%">
                <stop offset="0" stopColor={c} stopOpacity="1" />
                <stop offset="1" stopColor={c} stopOpacity=".55" />
              </radialGradient>
            ))}
            <radialGradient id="m3-seg-win" cx="50%" cy="50%" r="60%">
              <stop offset="0" stopColor={T.accentLight} />
              <stop offset="1" stopColor={T.accent} />
            </radialGradient>
          </defs>
          {SEGMENTS.map((seg, i) => {
            const startDeg = i * SLICE_DEG - SLICE_DEG / 2;
            const endDeg = startDeg + SLICE_DEG;
            const isWin = seg.win;
            const fill = isWin ? "url(#m3-seg-win)" : `url(#m3-seg-${i % NEON_COLORS.length})`;
            const labelDeg = i * SLICE_DEG;
            return (
              <g key={i}>
                <path
                  d={arcPath(100, 100, 92, startDeg, endDeg)}
                  fill={fill}
                  stroke="rgba(255,255,255,.18)"
                  strokeWidth="0.8"
                />
                <g transform={`rotate(${labelDeg} 100 100)`}>
                  <text
                    x="100"
                    y="34"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={isWin ? "#0e0a05" : "#fff"}
                    fontFamily="'Inter',sans-serif"
                    fontWeight={isWin ? 900 : 700}
                    fontSize={isWin ? "15" : "13"}
                    letterSpacing="0.5"
                    style={{ filter: isWin ? "none" : "drop-shadow(0 0 4px rgba(0,0,0,.7))" }}
                  >
                    {seg.label}
                  </text>
                </g>
              </g>
            );
          })}
          <circle cx="100" cy="100" r="36" fill="#05030a" stroke={T.accent} strokeWidth="1.8" />
          <circle cx="100" cy="100" r="36" fill="none" stroke={T.accentLight} strokeWidth=".5" opacity=".6" />
        </svg>

        <div className={`m3-hub ${phase === "spinning" ? "spinning" : ""}`}>SPIN</div>
      </div>

      {phase === "idle" ? (
        <button className="m3-cta" onClick={spin}>Lancer la roue</button>
      ) : phase === "spinning" ? (
        <button className="m3-cta" disabled>La roue tourne…</button>
      ) : (
        <button className="m3-cta" onClick={() => setPopupOpen(true)}>Voir mon gain</button>
      )}

      <div className="m3-info"><span className="dot" />247 joueurs en ligne · Bonus crédité en 30s</div>

      <V3OfferPopup
        open={phase === "won" && popupOpen}
        onClose={() => setPopupOpen(false)}
        theme={{ accent: T.accent, accentLight: T.accentLight, accentGlow: T.accentGlow, bgCard: T.bgCard }}
        badge="Gain valide ·"
        badgeStrong="roue bonus"
        score={rewardScore}
        title="La roue s'arrete au bon palier"
        body="L'offre est prete. Tu peux ouvrir le lien bonus quand tu veux."
        depositAmount={dep}
        bonusAmount={bon}
        steps={popupSteps}
        href={safeAffi}
      />

      <V3SocialProof bonusAmount={bon} accent={T.accent} accentGlow={T.accentGlow} />
    </div>
  );
}
