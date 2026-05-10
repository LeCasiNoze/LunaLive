// ─────────────────────────────────────────────────────────────────────────────
// M6 — Treasure Chest : 3 cadenas qui sautent puis le coffre s'ouvre.
//
// Click "OUVRIR" → animations séquentielles (3 cadenas pop, .35s chacun) →
// coffre s'ouvre avec rayon de lumière → reveal Y€ + popup CTA.
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";

export type M6ChestProps = {
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

export function M6Chest({ pseudo, profileImageUrl, depositAmount, bonusAmount, affiLink, theme }: M6ChestProps) {
  const T = {
    accent:      theme?.accent      || "#FFD700",
    accentLight: theme?.accentLight || "#FFC200",
    accentGlow:  theme?.accentGlow  || "rgba(255,214,0,.45)",
    bgPage:      theme?.bgPage      || "#080212",
    bgCard:      theme?.bgCard      || "#150821",
    border:      theme?.borderColor || "#331A47",
  };
  const [step, setStep] = React.useState<0 | 1 | 2 | 3 | 4>(0);
  // 0=closed, 1-3=lock unlocking, 4=open

  const dep = depositAmount != null ? `${depositAmount}€` : "";
  const bon = bonusAmount != null ? `${bonusAmount}€` : "";
  const safeAffi = affiLink || "#";

  const open = () => {
    if (step !== 0) return;
    setStep(1);
    setTimeout(() => setStep(2), 400);
    setTimeout(() => setStep(3), 800);
    setTimeout(() => setStep(4), 1300);
  };

  return (
    <div className="m6c-root" style={{ background: T.bgPage, color: "#fff" }}>
      <style>{`
        .m6c-root{min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:32px 16px 80px;font-family:'Poppins',sans-serif;position:relative;overflow:hidden}
        .m6c-root::before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at center,${T.accentGlow},transparent 60%);pointer-events:none}
        .m6c-avatar{width:84px;height:84px;border-radius:50%;border:3px solid ${T.accent};box-shadow:0 8px 24px rgba(0,0,0,.5),0 0 0 4px ${T.accentGlow};overflow:hidden;margin-bottom:12px;position:relative;z-index:1}
        .m6c-avatar img{width:100%;height:100%;object-fit:cover;display:block}
        .m6c-pseudo{font-size:1.4rem;font-weight:900;letter-spacing:.05em;text-shadow:0 0 14px ${T.accentGlow};position:relative;z-index:1}
        .m6c-tag{font-size:.92rem;color:rgba(255,255,255,.7);margin:4px 0 32px;letter-spacing:.04em;position:relative;z-index:1}
        .m6c-stage{position:relative;width:min(82vw,320px);aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;z-index:1;margin-bottom:28px}
        .m6c-light{position:absolute;inset:-30%;background:conic-gradient(from 0deg,transparent 0deg,${T.accentGlow} 30deg,transparent 60deg,${T.accentGlow} 180deg,transparent 210deg,${T.accentGlow} 330deg,transparent 360deg);opacity:0;transition:opacity .8s ease;border-radius:50%;animation:m6c-rays 8s linear infinite}
        .m6c-light.on{opacity:.55}
        .m6c-chest{position:relative;width:240px;height:200px;z-index:2}
        .m6c-body{position:absolute;bottom:0;left:0;right:0;height:130px;background:linear-gradient(180deg,#5a3a1a,#3a2410);border-radius:14px 14px 18px 18px;border:3px solid #2a1a08;box-shadow:0 10px 40px rgba(0,0,0,.6),inset 0 -8px 16px rgba(0,0,0,.5)}
        .m6c-band{position:absolute;left:0;right:0;height:14px;background:linear-gradient(180deg,${T.accentLight},${T.accent},#9c7820);border-top:1px solid rgba(255,255,255,.3);border-bottom:1px solid rgba(0,0,0,.3)}
        .m6c-band-1{bottom:30px}
        .m6c-band-2{bottom:80px}
        .m6c-lid{position:absolute;top:0;left:0;right:0;height:90px;background:linear-gradient(180deg,#6a4520,#4a2e14);border-radius:14px 14px 0 0;border:3px solid #2a1a08;border-bottom:none;transform-origin:bottom;transition:transform .8s cubic-bezier(.34,1.56,.64,1)}
        .m6c-chest.open .m6c-lid{transform:rotateX(-110deg)}
        .m6c-lock{position:absolute;left:50%;top:74px;transform:translate(-50%,0);width:36px;height:42px;background:radial-gradient(circle at 30% 30%,#888,#444);border-radius:6px;z-index:3;box-shadow:0 2px 6px rgba(0,0,0,.6)}
        .m6c-lock::before{content:"";position:absolute;top:-12px;left:50%;transform:translateX(-50%);width:20px;height:18px;border:3px solid #888;border-bottom:none;border-radius:10px 10px 0 0}
        .m6c-locks{position:absolute;inset:0;z-index:3;pointer-events:none}
        .m6c-lock-anim{position:absolute;font-size:24px;transition:all .35s ease-out;opacity:1}
        .m6c-lock-anim.gone{transform:translateY(-80px) rotate(40deg);opacity:0}
        .m6c-glow-burst{position:absolute;left:50%;top:30%;transform:translate(-50%,-50%);width:200px;height:200px;border-radius:50%;background:radial-gradient(circle,${T.accent} 0%,${T.accentGlow} 30%,transparent 60%);opacity:0;transition:opacity .6s ease,transform .6s ease}
        .m6c-glow-burst.on{opacity:1;transform:translate(-50%,-50%) scale(1.3)}
        .m6c-prize{position:absolute;left:50%;top:30%;transform:translate(-50%,-50%);font-size:3.4rem;font-weight:900;color:${T.accent};text-shadow:0 0 24px ${T.accentGlow};opacity:0;transition:opacity .5s ease .4s,transform .5s ease .4s;z-index:5}
        .m6c-prize.on{opacity:1;transform:translate(-50%,-50%) scale(1)}
        .m6c-amounts{display:flex;align-items:center;gap:14px;font-size:.95rem;color:rgba(255,255,255,.8);position:relative;z-index:1;margin-bottom:18px}
        .m6c-amounts strong{color:${T.accent};font-weight:900;font-size:1.15rem;text-shadow:0 0 8px ${T.accentGlow}}
        .m6c-cta{display:inline-flex;align-items:center;justify-content:center;width:min(82vw,360px);padding:18px 24px;background:linear-gradient(135deg,${T.accent},${T.accentLight});color:#000;font-weight:900;text-transform:uppercase;letter-spacing:.1em;font-size:1.1rem;border:none;border-radius:12px;cursor:pointer;box-shadow:0 8px 24px ${T.accentGlow};text-decoration:none;position:relative;z-index:1;animation:m6c-pulse 2.4s ease-in-out infinite}
        .m6c-cta:disabled{opacity:.6;cursor:not-allowed;animation:none}
        @keyframes m6c-rays{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes m6c-pulse{0%,100%{box-shadow:0 8px 24px ${T.accentGlow}}50%{box-shadow:0 8px 36px ${T.accentGlow},0 0 0 8px rgba(255,214,0,.06)}}
      `}</style>

      {profileImageUrl ? <div className="m6c-avatar"><img src={profileImageUrl} alt="" /></div> : null}
      {pseudo ? <div className="m6c-pseudo">{pseudo}</div> : null}
      <div className="m6c-tag">Déverrouille ton coffre légendaire</div>

      <div className="m6c-stage">
        <div className={`m6c-light ${step >= 4 ? "on" : ""}`} />
        <div className={`m6c-chest ${step >= 4 ? "open" : ""}`}>
          <div className="m6c-body" />
          <div className="m6c-band m6c-band-1" />
          <div className="m6c-band m6c-band-2" />
          <div className="m6c-lid" />
          {step < 4 ? <div className="m6c-lock" /> : null}
          <div className="m6c-locks">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`m6c-lock-anim ${step > i ? "gone" : ""}`}
                style={{
                  left: `${20 + i * 30}%`,
                  bottom: `${30 + (i % 2) * 14}%`,
                }}
              >🔒</div>
            ))}
          </div>
        </div>
        <div className={`m6c-glow-burst ${step >= 4 ? "on" : ""}`} />
        <div className={`m6c-prize ${step >= 4 ? "on" : ""}`}>
          {bon || "Y€"}
        </div>
      </div>

      {(dep || bon) ? (
        <div className="m6c-amounts">
          {dep ? <span>Dépose <strong>{dep}</strong></span> : null}
          {dep && bon ? <span>·</span> : null}
          {bon ? <span>Reçois <strong>{bon}</strong></span> : null}
        </div>
      ) : null}

      {step === 0 ? (
        <button className="m6c-cta" onClick={open}>🗝 Ouvrir le coffre</button>
      ) : step < 4 ? (
        <button className="m6c-cta" disabled>⏳ Déverrouillage…</button>
      ) : (
        <a href={safeAffi} target="_blank" rel="noreferrer" className="m6c-cta v3-cta">
          🎁 Récupérer mon bonus
        </a>
      )}
    </div>
  );
}
