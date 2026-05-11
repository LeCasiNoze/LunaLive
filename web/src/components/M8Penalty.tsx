// ─────────────────────────────────────────────────────────────────────────────
// M8 — Penalty Shootout : tir au but. 3 zones cliquables dans le filet.
// User vise → ballon part vers la zone → gardien plonge du MAUVAIS côté
// (rigged) → GOAL. Popup avec CTA.
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import { sfx } from "../lib/v3_sound";
import { pseudoTextStyle, pseudoPillStyle, type V3LineStyleLike } from "../lib/v3_pseudo_style";

export type M8PenaltyProps = {
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

type AimZone = "L" | "C" | "R";

// Le gardien plonge TOUJOURS du côté opposé à l'aim (ou vers le centre si user vise un coin).
function gkDive(aim: AimZone): AimZone {
  if (aim === "L") return "R";  // user gauche → GK plonge droite
  if (aim === "R") return "L";  // user droite → GK plonge gauche
  return "L";                    // user centre → GK plonge gauche (lob facile)
}

export function M8Penalty({ pseudo, profileImageUrl, depositAmount, bonusAmount, affiLink, theme, pseudoStyle }: M8PenaltyProps) {
  const T = {
    accent:      theme?.accent      || "#d4a843",
    accentLight: theme?.accentLight || "#f0c84a",
    accentDark:  "#8a6724",
    accentGlow:  theme?.accentGlow  || "rgba(212,168,67,.5)",
    bgPage:      theme?.bgPage      || "#0a0712",
    bgCard:      theme?.bgCard      || "#15101a",
    chrome:      "#3a3a42",
  };

  const [phase, setPhase] = React.useState<"idle" | "shooting" | "goal" | "won">("idle");
  const [aim, setAim] = React.useState<AimZone | null>(null);
  const [popupOpen, setPopupOpen] = React.useState(false);

  const dep = depositAmount != null ? `${depositAmount}€` : "";
  const bon = bonusAmount != null ? `${bonusAmount}€` : "";
  const safeAffi = affiLink || "#";

  const shoot = (zone: AimZone) => {
    if (phase !== "idle") return;
    sfx.click();
    setAim(zone);
    setPhase("shooting");
    // Tension brève pendant le tir
    sfx.tension(700);
    setTimeout(() => {
      sfx.win();  // GOAL = succès auditif
      setPhase("goal");
    }, 900);
    setTimeout(() => {
      setPhase("won");
      setPopupOpen(true);
    }, 1800);
  };

  // Position de la balle en %
  const ballPos = (() => {
    if (phase === "idle") return { left: 50, top: 88, scale: 1 };
    if (phase === "shooting" || phase === "goal" || phase === "won") {
      const targetLeft = aim === "L" ? 22 : aim === "R" ? 78 : 50;
      const targetTop = aim === "C" ? 32 : 24;
      return { left: targetLeft, top: targetTop, scale: 0.6 };
    }
    return { left: 50, top: 88, scale: 1 };
  })();

  // Position du gardien (% horizontal). Centre = 50%, dives latérales.
  const gkPos = (() => {
    if (phase === "idle") return { left: 50, rotate: 0 };
    const dive = gkDive(aim || "C");
    if (dive === "L") return { left: 22, rotate: -35 };
    if (dive === "R") return { left: 78, rotate: 35 };
    return { left: 50, rotate: 0 };
  })();

  return (
    <div className="m8-root" style={{ background: T.bgPage, color: "#f5f1e6" }}>
      <style>{`
        .m8-root{display:flex;flex-direction:column;align-items:center;padding:32px 16px 48px;font-family:'Inter',-apple-system,sans-serif;position:relative}
        .m8-root::before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 50% 0%,${T.accentGlow}40,transparent 60%);pointer-events:none}

        .m8-header{display:flex;flex-direction:column;align-items:center;gap:10px;margin-bottom:20px;position:relative;z-index:2}
        .m8-avatar{width:72px;height:72px;border-radius:50%;border:2px solid ${T.accent};overflow:hidden;box-shadow:0 4px 14px rgba(0,0,0,.5)}
        .m8-avatar img{width:100%;height:100%;object-fit:cover;display:block}
        .m8-pseudo-wrap{display:flex;justify-content:center;margin-top:2px}

        .m8-promo{position:relative;z-index:2;display:inline-block;padding:8px 18px;margin-bottom:20px;background:rgba(0,0,0,.35);border:1px solid ${T.accent}33;border-radius:4px;font-size:.78rem;font-weight:500;letter-spacing:.12em;text-transform:uppercase;color:rgba(245,241,230,.85)}
        .m8-promo strong{color:${T.accent}}

        .m8-step{position:relative;z-index:2;font-family:'Playfair Display',serif;font-size:1.15rem;font-weight:700;color:#f5f1e6;margin-bottom:14px;text-align:center}
        .m8-step .accent{color:${T.accent}}

        /* Stadium scene */
        .m8-stage{position:relative;width:min(94vw,420px);aspect-ratio:1.2/1;background:linear-gradient(180deg,#1a3d5c 0%,#1f4f30 40%,#2a6b3d 100%);border:2px solid #1f1d24;border-radius:10px;overflow:hidden;box-shadow:0 12px 32px rgba(0,0,0,.6);margin-bottom:22px;z-index:2}
        /* Gradins flous en arrière-plan */
        .m8-stage::before{content:"";position:absolute;left:0;right:0;top:0;height:32%;background:repeating-linear-gradient(90deg,rgba(0,0,0,.15) 0,rgba(0,0,0,.15) 4px,rgba(255,255,255,.04) 4px,rgba(255,255,255,.04) 8px);opacity:.5}
        /* Ligne 6 mètres */
        .m8-stage::after{content:"";position:absolute;left:18%;right:18%;top:62%;height:1px;background:rgba(255,255,255,.4);box-shadow:0 1px 0 rgba(255,255,255,.15)}

        /* But (goal frame) */
        .m8-goal{position:absolute;left:14%;right:14%;top:14%;height:48%;border:6px solid #fff;border-bottom:none;border-radius:4px 4px 0 0;box-shadow:0 -4px 16px rgba(0,0,0,.3)}
        /* Filet (net pattern via repeating gradient) */
        .m8-net{position:absolute;inset:6px 6px 0 6px;background:
          repeating-linear-gradient(0deg,rgba(255,255,255,.18) 0,rgba(255,255,255,.18) 1px,transparent 1px,transparent 14px),
          repeating-linear-gradient(90deg,rgba(255,255,255,.18) 0,rgba(255,255,255,.18) 1px,transparent 1px,transparent 14px),
          rgba(0,0,0,.25)}

        /* Zones cliquables */
        .m8-zones{position:absolute;inset:0;display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;z-index:4}
        .m8-zone{cursor:pointer;transition:background .15s ease;border:2px solid transparent}
        .m8-zone.idle:hover{background:${T.accent}22;border-color:${T.accent}66}
        .m8-zone.idle:active{background:${T.accent}44}
        .m8-zone-label{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:.65rem;font-weight:800;letter-spacing:.1em;color:rgba(255,255,255,.85);pointer-events:none;opacity:0;transition:opacity .15s ease;text-transform:uppercase;text-shadow:0 1px 2px rgba(0,0,0,.6)}
        .m8-zone.idle:hover .m8-zone-label{opacity:1}

        /* Gardien (silhouette SVG) */
        .m8-gk{position:absolute;width:14%;aspect-ratio:.6/1;left:50%;top:36%;transform:translate(-50%,0) rotate(0deg);transition:left .85s cubic-bezier(.3,1.6,.5,.95),transform .85s cubic-bezier(.3,1.6,.5,.95),top .85s cubic-bezier(.3,1.6,.5,.95);z-index:5;will-change:transform,left,top}
        .m8-gk svg{width:100%;height:100%;display:block;filter:drop-shadow(0 4px 8px rgba(0,0,0,.6))}

        /* Ballon */
        .m8-ball{position:absolute;width:32px;height:32px;left:50%;top:88%;transform:translate(-50%,-50%) scale(1);transition:left .85s cubic-bezier(.3,1.1,.4,1),top .85s cubic-bezier(.4,1.1,.5,1),transform .85s ease;z-index:6;will-change:transform,left,top;filter:drop-shadow(0 4px 12px rgba(0,0,0,.8))}
        .m8-ball::before{content:"";position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 30% 30%,#fff,#d4d4d8 40%,#71717a 80%);box-shadow:inset 0 -3px 6px rgba(0,0,0,.4)}
        .m8-ball::after{content:"";position:absolute;inset:18%;border-radius:50%;background:
          radial-gradient(circle at 30% 50%,transparent 18%,#000 19%,#000 22%,transparent 23%),
          radial-gradient(circle at 70% 50%,transparent 18%,#000 19%,#000 22%,transparent 23%),
          radial-gradient(circle at 50% 30%,transparent 14%,#000 15%,#000 18%,transparent 19%);
          opacity:.55}

        /* GOAL ! flash */
        .m8-goal-flash{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:'Playfair Display',serif;font-size:4rem;font-weight:900;color:#fff;text-shadow:0 4px 24px ${T.accent},0 0 12px ${T.accentLight};letter-spacing:.05em;pointer-events:none;opacity:0;transform:scale(.4);z-index:10;background:radial-gradient(circle,${T.accent}33,transparent 60%)}
        .m8-goal-flash.show{animation:m8-goal-pop .6s cubic-bezier(.17,1.4,.34,1.06) forwards}

        .m8-cta{display:block;width:min(94vw,420px);padding:16px 24px;background:${T.accent};color:#0e0a05;font-weight:700;text-transform:uppercase;letter-spacing:.16em;font-size:.92rem;border:none;border-radius:4px;cursor:pointer;box-shadow:0 4px 0 ${T.accentDark},0 6px 20px rgba(0,0,0,.4);text-decoration:none;text-align:center;font-family:inherit;transition:transform .1s ease;position:relative;z-index:2}
        .m8-cta:not(:disabled):hover{background:${T.accentLight};transform:translateY(1px);box-shadow:0 3px 0 ${T.accentDark}}
        .m8-cta:disabled{background:${T.chrome};color:rgba(255,255,255,.5);cursor:not-allowed;box-shadow:0 2px 0 rgba(0,0,0,.4)}

        .m8-overlay{position:fixed;inset:0;background:rgba(0,0,0,.85);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px;z-index:9999;animation:m8-fade .2s ease-out}
        .m8-popup{position:relative;background:${T.bgCard};border-top:3px solid ${T.accent};border-radius:6px;padding:32px 22px 22px;text-align:center;max-width:380px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.6);animation:m8-pop .35s cubic-bezier(.17,.84,.34,1.27);box-sizing:border-box}
        .m8-popup-close{position:absolute;top:10px;right:10px;width:30px;height:30px;border-radius:4px;background:transparent;border:none;color:rgba(245,241,230,.5);font-size:20px;cursor:pointer}
        .m8-popup-close:hover{color:#fff;background:rgba(255,255,255,.06)}
        .m8-popup-eyebrow{font-size:.72rem;font-weight:600;letter-spacing:.18em;color:${T.accent};text-transform:uppercase;margin-bottom:8px}
        .m8-popup h2{font-family:'Playfair Display',serif;font-size:1.9rem;font-weight:700;margin:0 0 14px;color:#f5f1e6;line-height:1.1}
        .m8-popup h2 span{color:${T.accent}}
        .m8-popup .reward-box{background:rgba(0,0,0,.4);border:1px solid ${T.accent}55;border-radius:4px;padding:14px 16px;margin:16px 0 22px}
        .m8-popup .reward-box .lbl{font-size:.7rem;color:rgba(245,241,230,.6);letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px}
        .m8-popup .reward-box .val{font-weight:700;color:#f5f1e6}
        .m8-popup .reward-box .val strong{color:${T.accent};font-size:1.1rem}
        .m8-popup .m8-cta{width:100%;font-size:.88rem;padding:14px 16px;letter-spacing:.12em}

        @keyframes m8-goal-pop{0%{opacity:0;transform:scale(.4)}40%{opacity:1;transform:scale(1.15)}70%{transform:scale(1)}100%{opacity:1;transform:scale(1)}}
        @keyframes m8-fade{from{opacity:0}to{opacity:1}}
        @keyframes m8-pop{0%{transform:translateY(20px);opacity:0}100%{transform:translateY(0);opacity:1}}
      `}</style>

      <div className="m8-header">
        {profileImageUrl ? <div className="m8-avatar"><img src={profileImageUrl} alt="" /></div> : null}
        {pseudo ? (
          <div className="m8-pseudo-wrap">
            <div style={{ ...pseudoPillStyle(T.accent), ...pseudoTextStyle(pseudoStyle, T.accent) }}>
              {pseudo}
            </div>
          </div>
        ) : null}
      </div>

      <div className="m8-promo">Penalty · <strong>1 tir au but</strong></div>

      <div className="m8-step">
        {phase === "idle"
          ? <>Vise une <span className="accent">zone</span> · gagne ton bonus</>
          : phase === "shooting"
            ? <>Tir en cours…</>
            : <><span className="accent">BUT !</span> Tu as marqué</>}
      </div>

      <div className="m8-stage">
        {/* But + filet */}
        <div className="m8-goal">
          <div className="m8-net" />
        </div>

        {/* Gardien silhouette */}
        <div
          className="m8-gk"
          style={{
            left: `${gkPos.left}%`,
            transform: `translate(-50%,0) rotate(${gkPos.rotate}deg)`,
            top: phase === "idle" ? "36%" : (gkPos.rotate !== 0 ? "42%" : "36%"),
          }}
        >
          <svg viewBox="0 0 30 50" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id={`gk-jersey-${T.accent.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#ef4444" />
                <stop offset="1" stopColor="#991b1b" />
              </linearGradient>
            </defs>
            {/* Tête */}
            <circle cx="15" cy="6" r="4.5" fill="#fde68a" stroke="#92400e" strokeWidth=".4" />
            {/* Corps (maillot) */}
            <path d="M8 12 L22 12 L24 28 L19 32 L11 32 L6 28 Z" fill={`url(#gk-jersey-${T.accent.replace("#","")})`} stroke="#7f1d1d" strokeWidth=".4" />
            {/* Bras tendus pour parer */}
            <ellipse cx="6" cy="18" rx="3" ry="6" fill={`url(#gk-jersey-${T.accent.replace("#","")})`} transform="rotate(-20 6 18)" />
            <ellipse cx="24" cy="18" rx="3" ry="6" fill={`url(#gk-jersey-${T.accent.replace("#","")})`} transform="rotate(20 24 18)" />
            {/* Gants */}
            <circle cx="4" cy="14" r="2.5" fill="#fde68a" stroke="#92400e" strokeWidth=".4" />
            <circle cx="26" cy="14" r="2.5" fill="#fde68a" stroke="#92400e" strokeWidth=".4" />
            {/* Short */}
            <path d="M11 32 L19 32 L20 40 L15 40 L10 40 Z" fill="#1e293b" stroke="#0f172a" strokeWidth=".4" />
            {/* Jambes */}
            <rect x="11" y="40" width="3.5" height="8" fill="#fde68a" stroke="#92400e" strokeWidth=".3" />
            <rect x="15.5" y="40" width="3.5" height="8" fill="#fde68a" stroke="#92400e" strokeWidth=".3" />
          </svg>
        </div>

        {/* Ballon */}
        <div
          className="m8-ball"
          style={{
            left: `${ballPos.left}%`,
            top: `${ballPos.top}%`,
            transform: `translate(-50%,-50%) scale(${ballPos.scale})`,
          }}
        />

        {/* Zones cliquables (overlay grid) */}
        <div className="m8-zones">
          <div className={`m8-zone ${phase === "idle" ? "idle" : ""}`} onClick={() => shoot("L")}>
            <div className="m8-zone-label">Gauche</div>
          </div>
          <div className={`m8-zone ${phase === "idle" ? "idle" : ""}`} onClick={() => shoot("C")}>
            <div className="m8-zone-label">Centre</div>
          </div>
          <div className={`m8-zone ${phase === "idle" ? "idle" : ""}`} onClick={() => shoot("R")}>
            <div className="m8-zone-label">Droite</div>
          </div>
        </div>

        {/* GOAL ! flash */}
        <div className={`m8-goal-flash ${phase === "goal" || phase === "won" ? "show" : ""}`}>
          BUT !
        </div>
      </div>

      {phase === "idle" ? (
        <button className="m8-cta" disabled>Clique dans la cage pour tirer</button>
      ) : phase === "won" ? (
        <button className="m8-cta" onClick={() => setPopupOpen(true)}>Voir mon gain</button>
      ) : (
        <button className="m8-cta" disabled>{phase === "shooting" ? "Tir en cours…" : "BUT !"}</button>
      )}

      {phase === "won" && popupOpen ? (
        <div className="m8-overlay" onClick={() => setPopupOpen(false)}>
          <div className="m8-popup" onClick={(e) => e.stopPropagation()}>
            <button className="m8-popup-close" onClick={() => setPopupOpen(false)} aria-label="Fermer">×</button>
            <div className="m8-popup-eyebrow">But marqué · Bonus 100%</div>
            <h2>Tir <span>parfait</span></h2>
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
            <a href={safeAffi} target="_blank" rel="noreferrer" className="m8-cta v3-cta">
              Récupérer mon bonus
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
