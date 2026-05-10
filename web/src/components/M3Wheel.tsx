// ─────────────────────────────────────────────────────────────────────────────
// M3 — Spinning Wheel premium (SVG, 8 segments, atterrit toujours sur 100%).
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";

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

// 8 segments — index 0 (top) = JACKPOT 100% (toujours gagnant)
const SEGMENTS = [
  { label: "100%", win: true,  sub: "BONUS" },
  { label: "10%",  win: false, sub: "" },
  { label: "30%",  win: false, sub: "" },
  { label: "0%",   win: false, sub: "" },
  { label: "50%",  win: false, sub: "" },
  { label: "5%",   win: false, sub: "" },
  { label: "20%",  win: false, sub: "" },
  { label: "0%",   win: false, sub: "" },
];
const WIN_INDEX = 0;
const SLICE_DEG = 360 / SEGMENTS.length;

// Décrit un secteur SVG (cake slice) du centre vers l'extérieur.
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
    accent:      theme?.accent      || "#FFD700",
    accentLight: theme?.accentLight || "#FFE552",
    accentGlow:  theme?.accentGlow  || "rgba(255,214,0,.5)",
    bgPage:      theme?.bgPage      || "#080212",
    bgCard:      theme?.bgCard      || "#150821",
    border:      theme?.borderColor || "#331A47",
  };
  const [phase, setPhase] = React.useState<"idle" | "spinning" | "won">("idle");
  const [angle, setAngle] = React.useState(0);
  const [popupOpen, setPopupOpen] = React.useState(false);

  const dep = depositAmount != null ? `${depositAmount}€` : "";
  const bon = bonusAmount != null ? `${bonusAmount}€` : "";
  const safeAffi = affiLink || "#";

  const spin = () => {
    if (phase !== "idle") return;
    setPhase("spinning");
    // Atterrit pile au milieu du segment WIN_INDEX (qui est en haut, sous la flèche).
    // Flèche pointe vers le top (-90deg en SVG natif). Notre SVG démarre à 12h
    // donc le segment 0 est centré pile sous la flèche → angle final = -360*N (rotations entières).
    const target = 360 * 6 + (360 - (WIN_INDEX * SLICE_DEG + SLICE_DEG / 2));
    setAngle(target);
    setTimeout(() => { setPhase("won"); setPopupOpen(true); }, 4400);
  };

  return (
    <div className="m3-root" style={{ background: T.bgPage, color: "#fff" }}>
      <style>{`
        .m3-root{min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:24px 16px 100px;font-family:'Poppins',sans-serif;position:relative;overflow:hidden}
        .m3-root::before{content:"";position:absolute;inset:-20%;background:radial-gradient(circle at 50% 0%,${T.accentGlow},transparent 50%);pointer-events:none;opacity:.6}
        .m3-root::after{content:"";position:absolute;inset:0;background-image:radial-gradient(circle at 30% 40%,${T.accent}10 1px,transparent 1px),radial-gradient(circle at 70% 80%,${T.accent}10 1px,transparent 1px);background-size:60px 60px,80px 80px;pointer-events:none;opacity:.3}

        .m3-header{display:flex;flex-direction:column;align-items:center;gap:6px;margin-bottom:18px;position:relative;z-index:2}
        .m3-avatar{width:78px;height:78px;border-radius:50%;border:3px solid ${T.accent};box-shadow:0 8px 24px rgba(0,0,0,.5),0 0 0 4px ${T.accentGlow};overflow:hidden}
        .m3-avatar img{width:100%;height:100%;object-fit:cover;display:block}
        .m3-pseudo{font-family:'Playfair Display',serif;font-size:1.6rem;font-weight:700;letter-spacing:.02em;color:#fff;text-shadow:0 0 16px ${T.accentGlow};margin-top:6px}

        .m3-offer{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;gap:2px;padding:14px 24px;margin-bottom:22px;background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.01));border:1px solid ${T.accent}55;border-radius:14px;backdrop-filter:blur(8px);box-shadow:0 0 30px ${T.accentGlow}40,inset 0 1px 0 rgba(255,255,255,.1)}
        .m3-offer-mini{font-size:.72rem;font-weight:700;letter-spacing:.18em;color:${T.accent};text-transform:uppercase}
        .m3-offer-main{font-family:'Playfair Display',serif;font-size:1.6rem;font-weight:900;color:#fff;text-align:center;line-height:1.1}
        .m3-offer-main .accent{color:${T.accent};text-shadow:0 0 14px ${T.accentGlow}}

        .m3-stage{position:relative;width:min(88vw,360px);aspect-ratio:1/1;margin-bottom:24px;z-index:2}
        .m3-pointer{position:absolute;top:-10px;left:50%;transform:translateX(-50%);z-index:6;filter:drop-shadow(0 4px 8px rgba(0,0,0,.6))}
        .m3-wheel-svg{width:100%;height:100%;transform:rotate(0deg);transition:transform 4.2s cubic-bezier(.17,.67,.16,.99);filter:drop-shadow(0 0 32px ${T.accentGlow}80)}
        .m3-wheel-svg.spinning{transform:rotate(${angle}deg)}
        .m3-led{position:absolute;width:10px;height:10px;border-radius:50%;background:radial-gradient(circle at 30% 30%,#fff,${T.accent});box-shadow:0 0 10px ${T.accentLight};animation:m3-led 1.6s ease-in-out infinite}
        .m3-hub{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:62px;height:62px;border-radius:50%;background:radial-gradient(circle at 30% 30%,${T.accentLight},${T.accent} 50%,#a37a00 100%);box-shadow:0 8px 16px rgba(0,0,0,.6),0 0 24px ${T.accentGlow},inset 0 -3px 0 rgba(0,0,0,.2),inset 0 3px 0 rgba(255,255,255,.4);z-index:5;border:3px solid #fff;display:flex;align-items:center;justify-content:center;font-weight:900;color:#000;font-size:.7rem;letter-spacing:.05em}

        .m3-cta{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:min(88vw,360px);padding:18px 24px;background:linear-gradient(135deg,${T.accent},${T.accentLight});color:#000;font-weight:900;text-transform:uppercase;letter-spacing:.12em;font-size:1.08rem;border:none;border-radius:14px;cursor:pointer;box-shadow:0 12px 32px ${T.accentGlow},inset 0 1px 0 rgba(255,255,255,.5),inset 0 -3px 0 rgba(0,0,0,.15);text-decoration:none;position:relative;z-index:2;transition:transform .15s ease}
        .m3-cta:not(:disabled):hover{transform:translateY(-2px)}
        .m3-cta:disabled{opacity:.65;cursor:not-allowed}
        .m3-cta-pulse{animation:m3-pulse 2s ease-in-out infinite}

        .m3-trust{display:flex;align-items:center;gap:14px;margin-top:14px;font-size:.78rem;color:rgba(255,255,255,.55);letter-spacing:.06em;position:relative;z-index:2}
        .m3-trust span{display:inline-flex;align-items:center;gap:5px}
        .m3-trust .dot{width:6px;height:6px;border-radius:50%;background:#22c55e;box-shadow:0 0 8px #22c55e80;animation:m3-blink 1.4s ease-in-out infinite}

        .m3-overlay{position:fixed;inset:0;background:rgba(0,0,0,.88);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px;z-index:9999;animation:m3-fade .3s ease-out}
        .m3-popup{position:relative;background:linear-gradient(180deg,${T.bgCard},${T.bgPage});border:2px solid ${T.accent};border-radius:22px;padding:36px 28px 28px;text-align:center;max-width:420px;width:100%;box-shadow:0 0 80px ${T.accentGlow},inset 0 1px 0 rgba(255,255,255,.06);animation:m3-pop .4s cubic-bezier(.17,.84,.34,1.27)}
        .m3-popup-close{position:absolute;top:14px;right:14px;width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .2s ease}
        .m3-popup-close:hover{background:rgba(255,255,255,.18)}
        .m3-popup-crown{font-size:2.4rem;line-height:1;margin-bottom:6px}
        .m3-popup h2{font-family:'Playfair Display',serif;font-size:2.2rem;font-weight:900;margin:0 0 6px;color:${T.accent};text-shadow:0 0 20px ${T.accentGlow}}
        .m3-popup .sub{color:rgba(255,255,255,.85);margin:0 0 8px;font-size:.95rem;line-height:1.5}
        .m3-popup .amounts{display:inline-flex;align-items:center;gap:10px;font-size:.95rem;color:rgba(255,255,255,.7);background:rgba(0,0,0,.35);border:1px solid ${T.accent}33;padding:10px 16px;border-radius:10px;margin:14px 0 22px}
        .m3-popup .amounts strong{color:${T.accent};font-weight:900;font-size:1.1rem;text-shadow:0 0 10px ${T.accentGlow}}

        .m3-confetti{position:absolute;width:8px;height:14px;background:${T.accent};animation:m3-fall 2.5s linear infinite}

        @keyframes m3-pulse{0%,100%{box-shadow:0 12px 32px ${T.accentGlow},inset 0 1px 0 rgba(255,255,255,.5),inset 0 -3px 0 rgba(0,0,0,.15)}50%{box-shadow:0 14px 40px ${T.accentGlow},0 0 0 6px ${T.accent}25,inset 0 1px 0 rgba(255,255,255,.5),inset 0 -3px 0 rgba(0,0,0,.15)}}
        @keyframes m3-led{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.85)}}
        @keyframes m3-blink{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes m3-fade{from{opacity:0}to{opacity:1}}
        @keyframes m3-pop{0%{transform:scale(.7);opacity:0}100%{transform:scale(1);opacity:1}}
        @keyframes m3-fall{0%{transform:translateY(-30px) rotate(0);opacity:1}100%{transform:translateY(110vh) rotate(720deg);opacity:0}}
      `}</style>

      <div className="m3-header">
        {profileImageUrl ? <div className="m3-avatar"><img src={profileImageUrl} alt="" /></div> : null}
        {pseudo ? <div className="m3-pseudo">{pseudo}</div> : null}
      </div>

      <div className="m3-offer">
        <div className="m3-offer-mini">✦ Offre exclusive ✦</div>
        <div className="m3-offer-main">
          {dep ? <>Dépose <span className="accent">{dep}</span> · </> : null}
          {bon ? <>Reçois <span className="accent">{bon}</span></> : "Bonus 100% garanti"}
        </div>
      </div>

      <div className="m3-stage">
        {/* LEDs autour de la roue */}
        {Array.from({ length: 16 }).map((_, i) => {
          const ang = (i * 360 / 16) * Math.PI / 180;
          const r = 50; // % position
          const x = 50 + r * Math.cos(ang - Math.PI / 2);
          const y = 50 + r * Math.sin(ang - Math.PI / 2);
          return (
            <div
              key={i}
              className="m3-led"
              style={{ left: `calc(${x}% - 5px)`, top: `calc(${y}% - 5px)`, animationDelay: `${i * 0.1}s` }}
            />
          );
        })}

        {/* Flèche pointer en haut */}
        <svg className="m3-pointer" width="42" height="42" viewBox="0 0 42 42">
          <defs>
            <linearGradient id="m3p" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={T.accentLight} />
              <stop offset="1" stopColor={T.accent} />
            </linearGradient>
          </defs>
          <path d="M21 38 L4 6 L38 6 Z" fill="url(#m3p)" stroke="#000" strokeWidth="1.5" />
        </svg>

        {/* La roue elle-même */}
        <svg
          className={`m3-wheel-svg ${phase !== "idle" ? "spinning" : ""}`}
          viewBox="0 0 200 200"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Cercle externe doré */}
          <circle cx="100" cy="100" r="98" fill="none" stroke={T.accent} strokeWidth="3" />
          <circle cx="100" cy="100" r="94" fill="#000" />
          {SEGMENTS.map((seg, i) => {
            const startDeg = i * SLICE_DEG - SLICE_DEG / 2;
            const endDeg = startDeg + SLICE_DEG;
            const isWin = seg.win;
            const fill = isWin
              ? `url(#m3-grad-win)`
              : (i % 2 === 0 ? "#1a0d2a" : "#2a1340");
            const labelDeg = i * SLICE_DEG;
            const labelRad = 64;
            return (
              <g key={i}>
                <path
                  d={arcPath(100, 100, 92, startDeg, endDeg)}
                  fill={fill}
                  stroke={isWin ? T.accent : "rgba(255,255,255,.06)"}
                  strokeWidth={isWin ? 2 : 1}
                />
                <g transform={`rotate(${labelDeg} 100 100)`}>
                  <text
                    x="100"
                    y={100 - labelRad}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={isWin ? "#000" : "#fff"}
                    fontFamily="'Poppins',sans-serif"
                    fontWeight={900}
                    fontSize={isWin ? "16" : "14"}
                    style={{ textShadow: isWin ? "none" : "0 1px 2px rgba(0,0,0,.6)" }}
                  >
                    {seg.label}
                  </text>
                  {seg.sub ? (
                    <text
                      x="100"
                      y={100 - labelRad + 12}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#000"
                      fontFamily="'Poppins',sans-serif"
                      fontWeight={700}
                      fontSize="7"
                    >
                      {seg.sub}
                    </text>
                  ) : null}
                </g>
              </g>
            );
          })}
          {/* Lignes radiales pour effet "rouage" */}
          {SEGMENTS.map((_, i) => {
            const deg = i * SLICE_DEG - SLICE_DEG / 2;
            const rad = (deg - 90) * Math.PI / 180;
            const x = 100 + 92 * Math.cos(rad);
            const y = 100 + 92 * Math.sin(rad);
            return <line key={i} x1="100" y1="100" x2={x} y2={y} stroke="rgba(255,255,255,.12)" strokeWidth="1" />;
          })}
          {/* Cercle interne de séparation */}
          <circle cx="100" cy="100" r="36" fill="none" stroke={T.accent} strokeWidth="1.5" opacity="0.7" />
          <defs>
            <radialGradient id="m3-grad-win">
              <stop offset="0%" stopColor={T.accentLight} />
              <stop offset="100%" stopColor={T.accent} />
            </radialGradient>
          </defs>
        </svg>

        {/* Hub central */}
        <div className="m3-hub">SPIN</div>
      </div>

      {phase === "idle" ? (
        <button className="m3-cta m3-cta-pulse" onClick={spin}>🎯 Tourner la roue</button>
      ) : phase === "spinning" ? (
        <button className="m3-cta" disabled>⏳ La roue tourne…</button>
      ) : (
        <button className="m3-cta" onClick={() => setPopupOpen(true)}>✨ Voir mon gain</button>
      )}

      <div className="m3-trust">
        <span><span className="dot" /> 247 joueurs en ligne</span>
        <span>·</span>
        <span>Bonus crédité en 30s</span>
      </div>

      {phase === "won" && popupOpen ? (
        <div className="m3-overlay" onClick={() => setPopupOpen(false)}>
          {Array.from({ length: 24 }).map((_, i) => (
            <div
              key={i}
              className="m3-confetti"
              style={{
                left: `${Math.random() * 100}%`,
                top: `-30px`,
                animationDelay: `${Math.random() * 1.5}s`,
                background: i % 3 === 0 ? T.accentLight : i % 3 === 1 ? T.accent : "#fff",
                transform: `rotate(${Math.random() * 360}deg)`,
              }}
            />
          ))}
          <div className="m3-popup" onClick={(e) => e.stopPropagation()}>
            <button className="m3-popup-close" onClick={() => setPopupOpen(false)} aria-label="Fermer">×</button>
            <div className="m3-popup-crown">👑</div>
            <h2>JACKPOT</h2>
            <p className="sub">La roue s'est arrêtée sur le segment légendaire.</p>
            <p className="sub">Tu débloques le <strong style={{ color: T.accent }}>bonus 100%</strong> sur ton premier dépôt.</p>
            {(dep || bon) ? (
              <div className="amounts">
                {dep ? <span>Dépose <strong>{dep}</strong></span> : null}
                {dep && bon ? <span style={{ color: T.accent }}>→</span> : null}
                {bon ? <span>Reçois <strong>{bon}</strong></span> : null}
              </div>
            ) : null}
            <a href={safeAffi} target="_blank" rel="noreferrer" className="m3-cta v3-cta">
              🎁 Récupérer mon bonus
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
