// ─────────────────────────────────────────────────────────────────────────────
// M3 — Spinning Wheel : design casino-réel.
// Frame métal brossé, segments alternés noir/bordeaux/accent, pegs métalliques
// autour, pointeur en acier. Pas de LEDs cheesy.
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import { sfx } from "../lib/v3_sound";

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
};

const SEGMENTS = [
  { label: "100%", win: true  },  // top, gagnant rigged
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

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const toRad = (d: number) => (d - 90) * Math.PI / 180;
  const x1 = cx + r * Math.cos(toRad(startDeg));
  const y1 = cy + r * Math.sin(toRad(startDeg));
  const x2 = cx + r * Math.cos(toRad(endDeg));
  const y2 = cy + r * Math.sin(toRad(endDeg));
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

export function M3Wheel({ pseudo, profileImageUrl, depositAmount, bonusAmount, affiLink, theme }: M3WheelProps) {
  const T = {
    accent:      theme?.accent      || "#d4a843",
    accentLight: theme?.accentLight || "#f0c84a",
    accentDark:  "#8a6724",
    accentGlow:  theme?.accentGlow  || "rgba(212,168,67,.3)",
    bgPage:      theme?.bgPage      || "#0a0712",
    bgCard:      theme?.bgCard      || "#15101a",
    bgFelt:      "#0d1b14",  // felt foncé pour la base
    chrome:      "#3a3a42",
  };
  const [phase, setPhase] = React.useState<"idle" | "spinning" | "won">("idle");
  const [angle, setAngle] = React.useState(0);
  const [popupOpen, setPopupOpen] = React.useState(false);

  const dep = depositAmount != null ? `${depositAmount}€` : "";
  const bon = bonusAmount != null ? `${bonusAmount}€` : "";
  const safeAffi = affiLink || "#";

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

  // Couleurs réalistes par segment (alternance noir/bordeaux pour roulette feel)
  const segColors = ["#1a1a1d", "#6e1818", "#1a1a1d", "#6e1818", "#1a1a1d", "#6e1818", "#1a1a1d", "#6e1818"];

  return (
    <div className="m3-root" style={{ background: T.bgPage, color: "#f5f1e6" }}>
      <style>{`
        .m3-root{display:flex;flex-direction:column;align-items:center;padding:32px 16px 48px;font-family:'Inter',-apple-system,sans-serif;position:relative}
        .m3-root::before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 50% 0%,rgba(212,168,67,.08),transparent 60%);pointer-events:none}

        .m3-header{display:flex;flex-direction:column;align-items:center;gap:10px;margin-bottom:24px;position:relative;z-index:2}
        .m3-avatar{width:72px;height:72px;border-radius:50%;border:2px solid ${T.accent};overflow:hidden;box-shadow:0 4px 14px rgba(0,0,0,.5)}
        .m3-avatar img{width:100%;height:100%;object-fit:cover;display:block}
        .m3-pseudo{font-size:1.05rem;font-weight:600;color:#f5f1e6;letter-spacing:.02em}

        .m3-promo{position:relative;z-index:2;display:inline-block;padding:8px 18px;margin-bottom:28px;background:rgba(0,0,0,.35);border:1px solid ${T.accent}33;border-radius:4px;font-size:.78rem;font-weight:500;letter-spacing:.12em;text-transform:uppercase;color:rgba(245,241,230,.85)}
        .m3-promo strong{color:${T.accent};font-weight:700}

        .m3-cabinet{position:relative;width:min(92vw,360px);aspect-ratio:1/1;margin-bottom:32px;z-index:2}

        /* Pointeur acier brossé */
        .m3-pointer{position:absolute;top:-4px;left:50%;transform:translateX(-50%);z-index:8;filter:drop-shadow(0 3px 6px rgba(0,0,0,.7))}

        /* Anneau extérieur en métal */
        .m3-outer-ring{position:absolute;inset:0;border-radius:50%;background:conic-gradient(${T.accent},${T.accentDark},${T.accent},${T.accentDark},${T.accent});box-shadow:0 8px 24px rgba(0,0,0,.5),inset 0 0 0 3px rgba(0,0,0,.3),inset 0 2px 4px rgba(255,255,255,.15)}

        /* Pegs métalliques équidistants */
        .m3-peg{position:absolute;width:8px;height:8px;border-radius:50%;background:radial-gradient(circle at 30% 30%,#f5e89b,${T.accentDark});box-shadow:0 1px 2px rgba(0,0,0,.6);z-index:6}

        /* Disque qui tourne */
        .m3-wheel{position:absolute;inset:8%;border-radius:50%;background:#000;box-shadow:inset 0 0 24px rgba(0,0,0,.8);transform:rotate(0deg);transition:transform 4.2s cubic-bezier(.17,.67,.16,.99);z-index:3}
        .m3-wheel.spinning{transform:rotate(${angle}deg)}

        /* Hub central — bouton métal */
        .m3-hub{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:56px;height:56px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#5a5a64,#2a2a32 60%,#1a1a1f);box-shadow:0 4px 12px rgba(0,0,0,.6),inset 0 2px 0 rgba(255,255,255,.2),inset 0 -2px 0 rgba(0,0,0,.6);z-index:7;border:2px solid ${T.accent};display:flex;align-items:center;justify-content:center;font-size:.62rem;font-weight:700;color:${T.accent};letter-spacing:.1em}

        .m3-cta{display:block;width:min(92vw,360px);padding:16px 24px;background:${T.accent};color:#0e0a05;font-weight:700;text-transform:uppercase;letter-spacing:.16em;font-size:.92rem;border:none;border-radius:4px;cursor:pointer;box-shadow:0 4px 0 ${T.accentDark},0 6px 20px rgba(0,0,0,.4);text-decoration:none;text-align:center;font-family:inherit;transition:transform .1s ease,box-shadow .1s ease;position:relative;z-index:2}
        .m3-cta:not(:disabled):hover{background:${T.accentLight};transform:translateY(1px);box-shadow:0 3px 0 ${T.accentDark},0 4px 12px rgba(0,0,0,.4)}
        .m3-cta:not(:disabled):active{transform:translateY(4px);box-shadow:0 0 0 ${T.accentDark}}
        .m3-cta:disabled{background:${T.chrome};color:rgba(255,255,255,.5);cursor:not-allowed;box-shadow:0 2px 0 rgba(0,0,0,.4)}

        .m3-info{margin-top:14px;font-size:.78rem;color:rgba(245,241,230,.55);letter-spacing:.05em;position:relative;z-index:2;text-align:center}
        .m3-info .dot{display:inline-block;width:5px;height:5px;border-radius:50%;background:#22c55e;margin-right:6px;animation:m3-blink 1.6s ease-in-out infinite}

        /* Popup */
        .m3-overlay{position:fixed;inset:0;background:rgba(0,0,0,.85);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px;z-index:9999;animation:m3-fade .2s ease-out}
        .m3-popup{position:relative;background:${T.bgCard};border-top:3px solid ${T.accent};border-radius:6px;padding:32px 26px 24px;text-align:center;max-width:380px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.6);animation:m3-pop .35s cubic-bezier(.17,.84,.34,1.27)}
        .m3-popup-close{position:absolute;top:10px;right:10px;width:30px;height:30px;border-radius:4px;background:transparent;border:none;color:rgba(245,241,230,.5);font-size:20px;cursor:pointer;line-height:1}
        .m3-popup-close:hover{color:#fff;background:rgba(255,255,255,.06)}
        .m3-popup-eyebrow{font-size:.72rem;font-weight:600;letter-spacing:.18em;color:${T.accent};text-transform:uppercase;margin-bottom:8px}
        .m3-popup h2{font-family:'Playfair Display',serif;font-size:1.9rem;font-weight:700;margin:0 0 14px;color:#f5f1e6;line-height:1.1}
        .m3-popup h2 span{color:${T.accent}}
        .m3-popup .reward-box{background:rgba(0,0,0,.4);border:1px solid ${T.accent}55;border-radius:4px;padding:14px 16px;margin:16px 0 22px;font-size:.95rem}
        .m3-popup .reward-box .lbl{font-size:.7rem;color:rgba(245,241,230,.6);letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px}
        .m3-popup .reward-box .val{font-weight:700;color:#f5f1e6}
        .m3-popup .reward-box .val strong{color:${T.accent};font-size:1.1rem}

        @keyframes m3-blink{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes m3-fade{from{opacity:0}to{opacity:1}}
        @keyframes m3-pop{0%{transform:translateY(20px);opacity:0}100%{transform:translateY(0);opacity:1}}
      `}</style>

      <div className="m3-header">
        {profileImageUrl ? <div className="m3-avatar"><img src={profileImageUrl} alt="" /></div> : null}
        {pseudo ? <div className="m3-pseudo">{pseudo}</div> : null}
      </div>

      <div className="m3-promo">
        Roue de la fortune · <strong>1 essai gratuit</strong>
      </div>

      <div className="m3-cabinet">
        {/* Anneau extérieur métal */}
        <div className="m3-outer-ring" />

        {/* 16 pegs métalliques répartis */}
        {Array.from({ length: 16 }).map((_, i) => {
          const ang = (i * 360 / 16) * Math.PI / 180;
          const r = 47;
          const x = 50 + r * Math.cos(ang - Math.PI / 2);
          const y = 50 + r * Math.sin(ang - Math.PI / 2);
          return (
            <div
              key={i}
              className="m3-peg"
              style={{ left: `calc(${x}% - 4px)`, top: `calc(${y}% - 4px)` }}
            />
          );
        })}

        {/* Pointeur acier */}
        <svg className="m3-pointer" width="36" height="44" viewBox="0 0 36 44">
          <defs>
            <linearGradient id="m3-steel" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#d4d4d8" />
              <stop offset=".4" stopColor="#71717a" />
              <stop offset="1" stopColor="#27272a" />
            </linearGradient>
          </defs>
          <path d="M18 42 L4 8 Q4 4 8 4 L28 4 Q32 4 32 8 Z" fill="url(#m3-steel)" stroke="#0a0a0a" strokeWidth="1.2" />
          <circle cx="18" cy="14" r="3" fill="#27272a" />
        </svg>

        {/* Disque qui tourne */}
        <svg
          className={`m3-wheel ${phase !== "idle" ? "spinning" : ""}`}
          viewBox="0 0 200 200"
          xmlns="http://www.w3.org/2000/svg"
        >
          {SEGMENTS.map((seg, i) => {
            const startDeg = i * SLICE_DEG - SLICE_DEG / 2;
            const endDeg = startDeg + SLICE_DEG;
            const isWin = seg.win;
            const fill = isWin ? T.accent : segColors[i];
            const labelDeg = i * SLICE_DEG;
            return (
              <g key={i}>
                <path
                  d={arcPath(100, 100, 92, startDeg, endDeg)}
                  fill={fill}
                  stroke="rgba(0,0,0,.4)"
                  strokeWidth="0.8"
                />
                <g transform={`rotate(${labelDeg} 100 100)`}>
                  <text
                    x="100"
                    y="32"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={isWin ? "#0e0a05" : "#f5f1e6"}
                    fontFamily="'Inter',sans-serif"
                    fontWeight={isWin ? 800 : 600}
                    fontSize={isWin ? "14" : "13"}
                    letterSpacing="0.5"
                  >
                    {seg.label}
                  </text>
                </g>
              </g>
            );
          })}
          {/* Cercle interne */}
          <circle cx="100" cy="100" r="34" fill="#0d0d10" stroke={T.accent} strokeWidth="1.5" />
        </svg>

        <div className="m3-hub">SPIN</div>
      </div>

      {phase === "idle" ? (
        <button className="m3-cta" onClick={spin}>Lancer la roue</button>
      ) : phase === "spinning" ? (
        <button className="m3-cta" disabled>La roue tourne…</button>
      ) : (
        <button className="m3-cta" onClick={() => setPopupOpen(true)}>Voir mon gain</button>
      )}

      <div className="m3-info"><span className="dot" />247 joueurs en ligne · Bonus crédité en 30s</div>

      {phase === "won" && popupOpen ? (
        <div className="m3-overlay" onClick={() => setPopupOpen(false)}>
          <div className="m3-popup" onClick={(e) => e.stopPropagation()}>
            <button className="m3-popup-close" onClick={() => setPopupOpen(false)} aria-label="Fermer">×</button>
            <div className="m3-popup-eyebrow">Gain validé</div>
            <h2>Tu remportes le <span>bonus 100%</span></h2>
            {(dep || bon) ? (
              <div className="reward-box">
                <div className="lbl">Ton offre</div>
                <div className="val">
                  {dep ? <>Dépose <strong>{dep}</strong></> : null}
                  {dep && bon ? " · " : null}
                  {bon ? <>Reçois <strong>{bon}</strong></> : null}
                </div>
              </div>
            ) : null}
            <a href={safeAffi} target="_blank" rel="noreferrer" className="m3-cta v3-cta" style={{ display: "block" }}>
              Récupérer mon bonus
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
