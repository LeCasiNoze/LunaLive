import * as React from "react";
import { sfx } from "../lib/v3_sound";
import { pseudoTextStyle, pseudoPillStyle, type V3LineStyleLike } from "../lib/v3_pseudo_style";
import { getPenaltyTeam } from "../lib/v3_penalty_teams";
import { V3OfferPopup } from "./V3OfferPopup";

export type M8PenaltyProps = {
  pseudo?: string;
  profileImageUrl?: string;
  depositAmount?: number | null;
  bonusAmount?: number | null;
  affiLink: string;
  penaltyTeam?: string;
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

function gkDive(aim: AimZone): AimZone {
  if (aim === "L") return "R";
  if (aim === "R") return "L";
  return "L";
}

const POPUP_STEPS = [
  "Analyse de la frappe",
  "Validation du bonus",
  "Lien d'acces pret",
] as const;

export function M8Penalty({
  pseudo,
  profileImageUrl,
  depositAmount,
  bonusAmount,
  affiLink,
  penaltyTeam,
  theme,
  pseudoStyle,
}: M8PenaltyProps) {
  const team = getPenaltyTeam(penaltyTeam);
  const T = {
    accent: theme?.accent || team.accent,
    accentLight: theme?.accentLight || team.accentLight,
    accentDark: "#082033",
    accentGlow: theme?.accentGlow || team.accentGlow,
    bgPage: theme?.bgPage || team.bgPage,
    bgCard: theme?.bgCard || team.bgCard,
    borderColor: theme?.borderColor || team.borderColor,
    pitchTop: team.pitchTop,
    pitchBottom: team.pitchBottom,
    skyTop: team.skyTop,
    skyBottom: team.skyBottom,
    crowd: team.crowd,
    jerseyPrimary: team.jerseyPrimary,
    jerseySecondary: team.jerseySecondary,
    keeperPrimary: team.keeperPrimary,
    keeperSecondary: team.keeperSecondary,
    buttonText: team.buttonText,
  };

  const [phase, setPhase] = React.useState<"idle" | "shooting" | "goal" | "won">("idle");
  const [aim, setAim] = React.useState<AimZone | null>(null);
  const [popupOpen, setPopupOpen] = React.useState(false);

  const dep = depositAmount != null ? `${depositAmount}€` : "";
  const bon = bonusAmount != null ? `${bonusAmount}€` : "";
  const safeAffi = affiLink || "#";
  const rewardHeadline = bon ? `+${bon}` : "Bonus 100%";
  const popupSteps = React.useMemo(() => Array.from(POPUP_STEPS), []);

  const shoot = (zone: AimZone) => {
    if (phase !== "idle") return;
    sfx.click();
    setAim(zone);
    setPhase("shooting");
    sfx.tension(700);
    window.setTimeout(() => {
      sfx.win();
      setPhase("goal");
    }, 900);
    window.setTimeout(() => {
      setPhase("won");
      setPopupOpen(true);
    }, 1800);
  };

  const ballPos = (() => {
    if (phase === "idle") return { left: 50, top: 88, scale: 1, rotate: 0 };
    const targetLeft = aim === "L" ? 22 : aim === "R" ? 78 : 50;
    const targetTop = aim === "C" ? 33 : 24;
    return { left: targetLeft, top: targetTop, scale: 0.58, rotate: aim === "L" ? -18 : aim === "R" ? 18 : 0 };
  })();

  const gkPos = (() => {
    if (phase === "idle") return { left: 50, rotate: 0, top: 37 };
    const dive = gkDive(aim || "C");
    if (dive === "L") return { left: 23, rotate: -34, top: 42 };
    if (dive === "R") return { left: 77, rotate: 34, top: 42 };
    return { left: 50, rotate: 0, top: 37 };
  })();

  return (
    <div className="m8-root" style={{ background: T.bgPage, color: "#f8fafc" }}>
      <style>{`
        .m8-root{display:flex;flex-direction:column;align-items:center;padding:32px 16px 48px;font-family:'Inter',-apple-system,sans-serif;position:relative;overflow:hidden}
        .m8-root::before{content:"";position:absolute;inset:0;background:
          radial-gradient(circle at 50% 0%,${T.accentGlow},transparent 36%),
          radial-gradient(circle at 10% 20%,rgba(255,255,255,.08),transparent 20%),
          linear-gradient(180deg,${T.bgPage},#04070f 100%);
          pointer-events:none}
        .m8-root::after{content:"";position:absolute;inset:auto 0 0 0;height:38%;background:linear-gradient(180deg,transparent,rgba(0,0,0,.28));pointer-events:none}

        .m8-header{display:flex;flex-direction:column;align-items:center;gap:10px;margin-bottom:18px;position:relative;z-index:2}
        .m8-avatar{width:74px;height:74px;border-radius:50%;border:2px solid ${T.accent};overflow:hidden;box-shadow:0 0 0 4px rgba(255,255,255,.05),0 12px 28px rgba(0,0,0,.35)}
        .m8-avatar img{width:100%;height:100%;object-fit:cover;display:block}
        .m8-pseudo-wrap{display:flex;justify-content:center;margin-top:2px}

        .m8-promo{position:relative;z-index:2;display:inline-flex;align-items:center;gap:10px;padding:10px 18px;margin-bottom:18px;background:rgba(6,12,26,.62);border:1px solid ${T.borderColor};border-radius:999px;font-size:.76rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:rgba(248,250,252,.88);backdrop-filter:blur(10px);box-shadow:0 16px 40px rgba(0,0,0,.24)}
        .m8-team-dot{width:10px;height:10px;border-radius:50%;background:${T.accent};box-shadow:0 0 14px ${T.accentGlow}}

        .m8-step{position:relative;z-index:2;text-align:center;margin-bottom:14px}
        .m8-step-title{font-family:'Playfair Display',serif;font-size:1.18rem;font-weight:700;color:#f8fafc}
        .m8-step-title .accent{color:${T.accent}}
        .m8-step-sub{margin-top:6px;font-size:.84rem;color:rgba(226,232,240,.72)}

        .m8-stage{position:relative;width:min(94vw,430px);aspect-ratio:1.14/1;background:
          linear-gradient(180deg,${T.skyTop} 0%,${T.skyBottom} 40%,${T.pitchTop} 40%,${T.pitchBottom} 100%);
          border:1px solid ${T.borderColor};border-radius:28px;overflow:hidden;box-shadow:
          0 18px 42px rgba(0,0,0,.45),
          inset 0 1px 0 rgba(255,255,255,.08),
          0 0 0 1px rgba(255,255,255,.04);
          margin-bottom:22px;z-index:2}
        .m8-stage::before{content:"";position:absolute;inset:0;background:
          radial-gradient(circle at 50% -6%,rgba(255,255,255,.34),transparent 34%),
          linear-gradient(180deg,rgba(255,255,255,.06),transparent 26%),
          repeating-linear-gradient(90deg,rgba(255,255,255,.08) 0,rgba(255,255,255,.08) 2px,transparent 2px,transparent 34px);
          opacity:.55}
        .m8-stage::after{content:"";position:absolute;left:12%;right:12%;bottom:19%;height:2px;background:rgba(255,255,255,.3);box-shadow:0 -62px 0 rgba(255,255,255,.18),0 -124px 0 rgba(255,255,255,.12)}

        .m8-scoreboard{position:absolute;top:14px;left:14px;right:14px;display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:rgba(5,8,18,.62);border:1px solid rgba(255,255,255,.08);border-radius:16px;backdrop-filter:blur(10px);z-index:6}
        .m8-score-side{display:flex;align-items:center;gap:10px}
        .m8-score-badge{display:inline-flex;align-items:center;justify-content:center;min-width:48px;padding:6px 10px;border-radius:999px;background:${T.accent};color:${T.buttonText};font-size:.72rem;font-weight:900;letter-spacing:.12em;box-shadow:0 0 18px ${T.accentGlow}}
        .m8-score-copy{font-size:.75rem;color:rgba(248,250,252,.86);line-height:1.1}
        .m8-score-copy strong{display:block;font-size:.9rem;color:#fff}
        .m8-score-shot{font-size:.78rem;font-weight:700;color:rgba(248,250,252,.76)}

        .m8-floodlight{position:absolute;top:52px;width:110px;height:110px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.42),transparent 70%);filter:blur(10px);opacity:.42;z-index:1}
        .m8-floodlight.left{left:-18px}
        .m8-floodlight.right{right:-18px}

        .m8-stands{position:absolute;left:0;right:0;top:94px;height:82px;background:
          linear-gradient(180deg,rgba(4,8,20,.06),rgba(4,8,20,.42)),
          repeating-linear-gradient(90deg,rgba(255,255,255,.12) 0,rgba(255,255,255,.12) 4px,transparent 4px,transparent 16px);
          opacity:.85}
        .m8-crowd-ribbon{position:absolute;top:178px;left:22px;right:22px;display:flex;justify-content:space-between;z-index:2}
        .m8-crowd-flag{padding:6px 12px;border-radius:999px;background:rgba(5,8,18,.55);border:1px solid rgba(255,255,255,.08);font-size:.72rem;font-weight:800;letter-spacing:.12em;color:${T.crowd};backdrop-filter:blur(8px)}

        .m8-goal-shell{position:absolute;left:12%;right:12%;top:27%;height:34%;border-radius:24px 24px 12px 12px;background:linear-gradient(180deg,rgba(255,255,255,.12),rgba(255,255,255,.03));box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);z-index:2}
        .m8-goal{position:absolute;inset:16px 16px 0 16px;border:7px solid rgba(255,255,255,.96);border-bottom:none;border-radius:18px 18px 0 0;box-shadow:0 -8px 28px rgba(255,255,255,.12)}
        .m8-net{position:absolute;inset:8px 8px 0 8px;background:
          repeating-linear-gradient(0deg,rgba(255,255,255,.22) 0,rgba(255,255,255,.22) 1px,transparent 1px,transparent 16px),
          repeating-linear-gradient(90deg,rgba(255,255,255,.22) 0,rgba(255,255,255,.22) 1px,transparent 1px,transparent 16px),
          linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.16));
          opacity:.9}

        .m8-zones{position:absolute;left:12%;right:12%;top:27%;height:34%;display:grid;grid-template-columns:1fr 1fr 1fr;z-index:8}
        .m8-zone{position:relative;cursor:pointer;transition:background .16s ease,transform .16s ease;border:1px solid transparent}
        .m8-zone.idle:hover{background:rgba(255,255,255,.08);border-color:${T.accent};transform:translateY(-1px)}
        .m8-zone.idle:active{background:${T.accentGlow}}
        .m8-zone-label{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);padding:5px 10px;border-radius:999px;background:rgba(5,8,18,.72);font-size:.68rem;font-weight:800;letter-spacing:.14em;color:#fff;text-transform:uppercase;opacity:0;transition:opacity .16s ease;pointer-events:none}
        .m8-zone.idle:hover .m8-zone-label{opacity:1}

        .m8-gk{position:absolute;width:17%;aspect-ratio:.62/1;left:50%;top:37%;transform:translate(-50%,0) rotate(0deg);transition:left .85s cubic-bezier(.3,1.6,.5,.95),transform .85s cubic-bezier(.3,1.6,.5,.95),top .85s cubic-bezier(.3,1.6,.5,.95);z-index:7;will-change:transform,left,top}
        .m8-gk svg{width:100%;height:100%;display:block;filter:drop-shadow(0 10px 14px rgba(0,0,0,.42))}

        .m8-ball{position:absolute;width:34px;height:34px;left:50%;top:88%;transform:translate(-50%,-50%) scale(1) rotate(0deg);transition:left .86s cubic-bezier(.3,1.1,.4,1),top .86s cubic-bezier(.4,1.1,.5,1),transform .86s ease;z-index:9;will-change:transform,left,top;filter:drop-shadow(0 6px 12px rgba(0,0,0,.55))}
        .m8-ball::before{content:"";position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 30% 30%,#fff,#e5e7eb 38%,#9ca3af 86%);box-shadow:inset 0 -4px 8px rgba(0,0,0,.28)}
        .m8-ball::after{content:"";position:absolute;inset:16%;border-radius:50%;background:
          radial-gradient(circle at 30% 50%,transparent 18%,#111827 19%,#111827 22%,transparent 23%),
          radial-gradient(circle at 70% 50%,transparent 18%,#111827 19%,#111827 22%,transparent 23%),
          radial-gradient(circle at 50% 30%,transparent 14%,#111827 15%,#111827 18%,transparent 19%);
          opacity:.62}
        .m8-ball-trail{position:absolute;left:50%;top:71%;width:14px;height:110px;border-radius:999px;background:linear-gradient(180deg,rgba(255,255,255,0),${T.accentGlow});transform:translateX(-50%);opacity:${phase === "shooting" || phase === "goal" || phase === "won" ? 1 : 0};filter:blur(10px);transition:opacity .2s ease;z-index:5}

        .m8-goal-flash{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:'Playfair Display',serif;font-size:4.1rem;font-weight:900;color:#fff;text-shadow:0 0 24px ${T.accent},0 0 50px ${T.accentGlow};letter-spacing:.04em;pointer-events:none;opacity:0;transform:scale(.5);z-index:10;background:radial-gradient(circle,${T.accentGlow},transparent 62%)}
        .m8-goal-flash.show{animation:m8-goal-pop .62s cubic-bezier(.17,1.4,.34,1.06) forwards}

        .m8-cta{display:block;width:min(94vw,430px);padding:18px 24px;background:linear-gradient(135deg,${T.accentLight},${T.accent});color:${T.buttonText};font-weight:900;text-transform:uppercase;letter-spacing:.14em;font-size:.92rem;border:none;border-radius:18px;cursor:pointer;box-shadow:0 10px 26px ${T.accentGlow},inset 0 1px 0 rgba(255,255,255,.42);text-decoration:none;text-align:center;font-family:inherit;transition:transform .12s ease,box-shadow .12s ease;position:relative;z-index:2}
        .m8-cta:not(:disabled):hover{transform:translateY(-1px);box-shadow:0 14px 30px ${T.accentGlow},inset 0 1px 0 rgba(255,255,255,.42)}
        .m8-cta:disabled{background:rgba(148,163,184,.22);color:rgba(226,232,240,.6);cursor:not-allowed;box-shadow:none}

        .m8-overlay{position:fixed;inset:0;background:rgba(2,6,23,.82);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:20px;z-index:9999;animation:m8-fade .22s ease-out}
        .m8-popup{position:relative;background:
          radial-gradient(circle at top,rgba(255,255,255,.08),transparent 30%),
          linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,.01)),
          ${T.bgCard};
          border:1px solid ${T.borderColor};border-radius:28px;padding:32px 24px 24px;text-align:center;max-width:396px;width:100%;box-shadow:0 28px 90px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.04);animation:m8-pop .36s cubic-bezier(.17,.84,.34,1.27);box-sizing:border-box;overflow:hidden}
        .m8-popup::before{content:"";position:absolute;inset:0;background:radial-gradient(circle at top,${T.accentGlow},transparent 34%);opacity:.6;pointer-events:none}
        .m8-popup-close{position:absolute;top:12px;right:12px;width:34px;height:34px;border-radius:999px;background:rgba(15,23,42,.58);border:1px solid rgba(255,255,255,.08);color:#e2e8f0;font-size:20px;cursor:pointer;z-index:2}
        .m8-popup-close:hover{background:rgba(30,41,59,.82)}
        .m8-popup-badge{position:relative;z-index:1;display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:999px;background:rgba(5,8,18,.58);border:1px solid rgba(255,255,255,.08);font-size:.72rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#f8fafc;margin-bottom:14px}
        .m8-popup-badge strong{color:${T.accentLight}}
        .m8-popup-score{position:relative;z-index:1;font-size:3.1rem;font-weight:900;line-height:1;color:${T.accentLight};text-shadow:0 0 24px ${T.accentGlow}}
        .m8-popup-copy{position:relative;z-index:1;margin:12px 0 0}
        .m8-popup-copy h2{font-family:'Playfair Display',serif;font-size:2rem;font-weight:700;margin:0;color:#fff;line-height:1.02}
        .m8-popup-copy p{margin:10px 0 0;font-size:.95rem;color:rgba(226,232,240,.8)}
        .m8-popup-offer{position:relative;z-index:1;margin:18px 0 18px;padding:14px 16px;background:rgba(2,6,23,.44);border:1px solid rgba(255,255,255,.08);border-radius:18px}
        .m8-popup-offer .lbl{font-size:.7rem;color:rgba(226,232,240,.6);letter-spacing:.16em;text-transform:uppercase;margin-bottom:6px}
        .m8-popup-offer .val{font-weight:800;color:#fff}
        .m8-popup-offer .val strong{color:${T.accentLight}}
        .m8-popup-steps{position:relative;z-index:1;display:grid;gap:8px;margin:0 0 18px;padding:0;list-style:none}
        .m8-popup-step{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;background:rgba(2,6,23,.34);border:1px solid rgba(255,255,255,.06);color:rgba(226,232,240,.6);text-align:left}
        .m8-popup-step.done{color:#fff;border-color:${T.borderColor};background:rgba(255,255,255,.04)}
        .m8-popup-step-dot{width:18px;height:18px;border-radius:50%;display:grid;place-items:center;font-size:.76rem;font-weight:900;background:rgba(148,163,184,.18);color:transparent}
        .m8-popup-step.done .m8-popup-step-dot{background:${T.accent};color:${T.buttonText};box-shadow:0 0 16px ${T.accentGlow}}
        .m8-popup .m8-cta{width:100%;font-size:.9rem;padding:16px 18px;letter-spacing:.12em}

        @keyframes m8-goal-pop{0%{opacity:0;transform:scale(.5)}40%{opacity:1;transform:scale(1.18)}70%{transform:scale(1)}100%{opacity:1;transform:scale(1)}}
        @keyframes m8-fade{from{opacity:0}to{opacity:1}}
        @keyframes m8-pop{0%{transform:translateY(20px) scale(.96);opacity:0}100%{transform:translateY(0) scale(1);opacity:1}}
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

      <div className="m8-promo">
        <span className="m8-team-dot" />
        Penalty mondial
        <strong>{team.label}</strong>
      </div>

      <div className="m8-step">
        <div className="m8-step-title">
          {phase === "idle"
            ? <>Choisis ton <span className="accent">angle</span> et enclenche le bonus</>
            : phase === "shooting"
              ? <>Frappe en <span className="accent">cours</span></>
              : <><span className="accent">But !</span> Le tir est valide</>}
        </div>
        <div className="m8-step-sub">
          Theme actif: {team.label} · palette adaptee au stade, au gardien et au popup final
        </div>
      </div>

      <div className="m8-stage">
        <div className="m8-scoreboard">
          <div className="m8-score-side">
            <span className="m8-score-badge">{team.shortLabel}</span>
            <div className="m8-score-copy">
              <strong>Challenge penalty</strong>
              1 tir bonus a convertir
            </div>
          </div>
          <div className="m8-score-shot">
            {phase === "idle" ? "0/1 tir" : phase === "shooting" ? "tir en vol" : "1/1 but"}
          </div>
        </div>

        <div className="m8-floodlight left" />
        <div className="m8-floodlight right" />
        <div className="m8-stands" />

        <div className="m8-crowd-ribbon">
          <span className="m8-crowd-flag">{team.shortLabel}</span>
          <span className="m8-crowd-flag">FINAL STAGE</span>
        </div>

        <div className="m8-goal-shell">
          <div className="m8-goal">
            <div className="m8-net" />
          </div>
        </div>

        <div
          className="m8-gk"
          style={{
            left: `${gkPos.left}%`,
            top: `${gkPos.top}%`,
            transform: `translate(-50%,0) rotate(${gkPos.rotate}deg)`,
          }}
        >
          <svg viewBox="0 0 30 50" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id={`m8-jersey-${team.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={T.jerseyPrimary} />
                <stop offset="1" stopColor={T.jerseySecondary} />
              </linearGradient>
              <linearGradient id={`m8-keeper-${team.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={T.keeperPrimary} />
                <stop offset="1" stopColor={T.keeperSecondary} />
              </linearGradient>
            </defs>
            <circle cx="15" cy="6" r="4.5" fill="#fde68a" stroke="#92400e" strokeWidth=".4" />
            <path d="M8 12 L22 12 L24 28 L19 32 L11 32 L6 28 Z" fill={`url(#m8-jersey-${team.key})`} stroke="rgba(15,23,42,.45)" strokeWidth=".45" />
            <ellipse cx="6" cy="18" rx="3" ry="6" fill={`url(#m8-keeper-${team.key})`} transform="rotate(-20 6 18)" />
            <ellipse cx="24" cy="18" rx="3" ry="6" fill={`url(#m8-keeper-${team.key})`} transform="rotate(20 24 18)" />
            <circle cx="4" cy="14" r="2.5" fill="#fde68a" stroke="#92400e" strokeWidth=".4" />
            <circle cx="26" cy="14" r="2.5" fill="#fde68a" stroke="#92400e" strokeWidth=".4" />
            <path d="M11 32 L19 32 L20 40 L15 40 L10 40 Z" fill="#0f172a" stroke="#020617" strokeWidth=".4" />
            <rect x="11" y="40" width="3.5" height="8" fill="#fde68a" stroke="#92400e" strokeWidth=".3" />
            <rect x="15.5" y="40" width="3.5" height="8" fill="#fde68a" stroke="#92400e" strokeWidth=".3" />
          </svg>
        </div>

        <div className="m8-ball-trail" />
        <div
          className="m8-ball"
          style={{
            left: `${ballPos.left}%`,
            top: `${ballPos.top}%`,
            transform: `translate(-50%,-50%) scale(${ballPos.scale}) rotate(${ballPos.rotate}deg)`,
          }}
        />

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

        <div className={`m8-goal-flash ${phase === "goal" || phase === "won" ? "show" : ""}`}>
          BUT !
        </div>
      </div>

      {phase === "idle" ? (
        <button className="m8-cta" disabled>Clique dans la cage pour tirer</button>
      ) : phase === "won" ? (
        <button className="m8-cta" onClick={() => setPopupOpen(true)}>Voir mon offre</button>
      ) : (
        <button className="m8-cta" disabled>{phase === "shooting" ? "Frappe en cours..." : "But valide"}</button>
      )}

      <V3OfferPopup
        open={phase === "won" && popupOpen}
        onClose={() => setPopupOpen(false)}
        theme={{
          accent: T.accent,
          accentLight: T.accentLight,
          accentGlow: T.accentGlow,
          bgCard: T.bgCard,
          borderColor: T.borderColor,
          buttonText: T.buttonText,
        }}
        badge="Penalty valide ·"
        badgeStrong={team.shortLabel}
        score={rewardHeadline}
        title="Frappe parfaite"
        body="Le bonus est pret. Tu peux poursuivre vers l'offre quand tu veux."
        depositAmount={dep}
        bonusAmount={bon}
        steps={popupSteps}
        href={safeAffi}
      />
    </div>
  );
}
