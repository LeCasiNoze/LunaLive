// ─────────────────────────────────────────────────────────────────────────────
// M3 — Spinning Wheel : roue qui tombe TOUJOURS sur 100% bonus.
//
// Layout : pseudo + (profil) → roue → CTA après spin.
// Concept : le user clique TOURNER, la roue tourne ~4s avec ralentissement,
// atterrit sur le segment "JACKPOT" (toujours), un popup s'ouvre avec la CTA.
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

const SEGMENTS = [
  { label: "10%",  win: false },
  { label: "FREE", win: false },
  { label: "JACKPOT", win: true },   // index 2 → toujours gagnant
  { label: "20%",  win: false },
  { label: "5%",   win: false },
  { label: "FREE", win: false },
  { label: "JACKPOT", win: true },
  { label: "0%",   win: false },
];
const WIN_INDEX = 2;

export function M3Wheel({ pseudo, profileImageUrl, depositAmount, bonusAmount, affiLink, theme }: M3WheelProps) {
  const T = {
    accent:      theme?.accent      || "#FFD700",
    accentLight: theme?.accentLight || "#FFC200",
    accentGlow:  theme?.accentGlow  || "rgba(255,214,0,.45)",
    bgPage:      theme?.bgPage      || "#080212",
    bgCard:      theme?.bgCard      || "#150821",
    border:      theme?.borderColor || "#331A47",
  };
  const [phase, setPhase] = React.useState<"idle" | "spinning" | "won">("idle");
  const [angle, setAngle] = React.useState(0);

  const spin = () => {
    if (phase !== "idle") return;
    setPhase("spinning");
    const sliceDeg = 360 / SEGMENTS.length;
    // Rotation finale qui aligne le pointeur (top) avec WIN_INDEX
    const target = 360 * 6 + (360 - (WIN_INDEX * sliceDeg + sliceDeg / 2));
    setAngle(target);
    setTimeout(() => setPhase("won"), 4200);
  };

  const dep = depositAmount != null ? `${depositAmount}€` : "";
  const bon = bonusAmount != null ? `${bonusAmount}€` : "";
  const safeAffi = affiLink || "#";

  return (
    <div className="m3-root" style={{ background: T.bgPage, color: "#fff" }}>
      <style>{`
        .m3-root{min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:32px 16px 80px;font-family:'Poppins',sans-serif;position:relative;overflow:hidden}
        .m3-root::before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at top,${T.accentGlow},transparent 70%);pointer-events:none}
        .m3-avatar{width:88px;height:88px;border-radius:50%;border:3px solid ${T.accent};box-shadow:0 8px 24px rgba(0,0,0,.5),0 0 0 4px ${T.accentGlow};overflow:hidden;margin-bottom:14px;position:relative;z-index:1}
        .m3-avatar img{width:100%;height:100%;object-fit:cover;display:block}
        .m3-pseudo{font-size:1.4rem;font-weight:900;letter-spacing:.05em;margin-bottom:4px;color:#fff;text-shadow:0 0 14px ${T.accentGlow};position:relative;z-index:1}
        .m3-tagline{font-size:.92rem;color:rgba(255,255,255,.7);margin-bottom:24px;letter-spacing:.04em;position:relative;z-index:1}
        .m3-wheel-wrap{position:relative;width:min(86vw,360px);aspect-ratio:1/1;margin:8px auto 28px;z-index:1}
        .m3-pointer{position:absolute;top:-8px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:14px solid transparent;border-right:14px solid transparent;border-top:24px solid ${T.accent};z-index:5;filter:drop-shadow(0 0 8px ${T.accentGlow})}
        .m3-wheel{width:100%;height:100%;border-radius:50%;border:6px solid ${T.accent};box-shadow:0 0 40px ${T.accentGlow},inset 0 0 30px rgba(0,0,0,.6);transform:rotate(0deg);transition:transform 4s cubic-bezier(.17,.67,.16,.99);overflow:hidden;position:relative;background:#000}
        .m3-wheel.spinning{transform:rotate(${angle}deg)}
        .m3-seg{position:absolute;left:50%;top:0;width:50%;height:50%;transform-origin:0 100%;display:flex;align-items:flex-start;justify-content:center;padding-top:18px;font-weight:900;font-size:.85rem;letter-spacing:.05em;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.6)}
        .m3-hub{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,${T.accent},${T.accentLight});box-shadow:0 0 20px ${T.accentGlow};z-index:4;border:3px solid #fff}
        .m3-cta{display:inline-flex;align-items:center;justify-content:center;width:min(86vw,360px);padding:18px 24px;background:linear-gradient(135deg,${T.accent},${T.accentLight});color:#000;font-weight:900;text-transform:uppercase;letter-spacing:.1em;font-size:1.1rem;border:none;border-radius:12px;cursor:pointer;box-shadow:0 8px 24px ${T.accentGlow};transition:transform .15s ease,box-shadow .15s ease;position:relative;z-index:1}
        .m3-cta:hover{transform:translateY(-2px);box-shadow:0 12px 32px ${T.accentGlow}}
        .m3-cta:disabled{opacity:.6;cursor:not-allowed}
        .m3-amounts{display:flex;align-items:center;gap:14px;font-size:.95rem;color:rgba(255,255,255,.75);margin-top:18px;position:relative;z-index:1}
        .m3-amounts strong{color:${T.accent};text-shadow:0 0 8px ${T.accentGlow};font-weight:900;font-size:1.15rem}
        .m3-overlay{position:fixed;inset:0;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;padding:24px;z-index:9999;animation:m3-fade-in .25s ease-out}
        .m3-popup{background:${T.bgCard};border:2px solid ${T.accent};border-radius:18px;padding:32px 24px;text-align:center;max-width:380px;width:100%;box-shadow:0 0 60px ${T.accentGlow};animation:m3-pop-in .35s cubic-bezier(.17,.84,.34,1.27)}
        .m3-popup h2{font-size:2rem;font-weight:900;margin:0 0 8px;color:${T.accent};text-shadow:0 0 16px ${T.accentGlow}}
        .m3-popup p{color:rgba(255,255,255,.85);margin:0 0 20px;font-size:1rem;line-height:1.5}
        .m3-popup .m3-cta{width:100%}
        .m3-confetti{position:absolute;width:8px;height:8px;background:${T.accent};border-radius:50%;animation:m3-fall 2s ease-in infinite}
        @keyframes m3-fade-in{from{opacity:0}to{opacity:1}}
        @keyframes m3-pop-in{0%{transform:scale(.6);opacity:0}100%{transform:scale(1);opacity:1}}
        @keyframes m3-fall{0%{transform:translateY(-20px) rotate(0);opacity:1}100%{transform:translateY(120vh) rotate(360deg);opacity:0}}
      `}</style>

      {profileImageUrl ? (
        <div className="m3-avatar"><img src={profileImageUrl} alt="" /></div>
      ) : null}
      {pseudo ? <div className="m3-pseudo">{pseudo}</div> : null}
      <div className="m3-tagline">Tente ta chance · 1 essai gratuit</div>

      <div className="m3-wheel-wrap">
        <div className="m3-pointer" />
        <div className={`m3-wheel ${phase === "spinning" || phase === "won" ? "spinning" : ""}`}>
          {SEGMENTS.map((s, i) => {
            const sliceDeg = 360 / SEGMENTS.length;
            const rot = i * sliceDeg + sliceDeg / 2;
            const bg = s.win
              ? `linear-gradient(135deg,${T.accent},${T.accentLight})`
              : (i % 2 ? "#1a0d2a" : "#2a1340");
            return (
              <div
                key={i}
                className="m3-seg"
                style={{
                  transform: `rotate(${rot}deg) translateX(-50%) skewY(${90 - sliceDeg}deg)`,
                  background: bg,
                  color: s.win ? "#000" : "#fff",
                }}
              >
                <span style={{ transform: `skewY(${sliceDeg - 90}deg) rotate(${sliceDeg / 2}deg)`, display: "block" }}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
        <div className="m3-hub" />
      </div>

      {phase === "idle" ? (
        <button className="m3-cta" onClick={spin}>🎰 Tourner la roue</button>
      ) : phase === "spinning" ? (
        <button className="m3-cta" disabled>⏳ Ça tourne…</button>
      ) : (
        <button className="m3-cta" disabled>✨ Bonus débloqué !</button>
      )}

      {dep || bon ? (
        <div className="m3-amounts">
          {dep ? <span>Dépose <strong>{dep}</strong></span> : null}
          {dep && bon ? <span>·</span> : null}
          {bon ? <span>Reçois <strong>{bon}</strong></span> : null}
        </div>
      ) : null}

      {phase === "won" ? (
        <div className="m3-overlay">
          {/* confettis simples */}
          {Array.from({ length: 16 }).map((_, i) => (
            <div
              key={i}
              className="m3-confetti"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 20}%`,
                animationDelay: `${Math.random() * 1}s`,
                background: i % 2 ? T.accent : T.accentLight,
              }}
            />
          ))}
          <div className="m3-popup">
            <h2>🎉 JACKPOT !</h2>
            <p>Tu as débloqué un bonus 100% sur ton premier dépôt.</p>
            {dep || bon ? (
              <p style={{ marginBottom: 24, fontSize: 14, color: "rgba(255,255,255,.7)" }}>
                Dépose {dep || "X€"} → Reçois <strong style={{ color: T.accent }}>{bon || "Y€"}</strong>
              </p>
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
