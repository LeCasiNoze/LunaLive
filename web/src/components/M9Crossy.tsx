// ─────────────────────────────────────────────────────────────────────────────
// M9 — Crossy Road : route horizontale type Stake. Poulet a gauche dans une
// zone verte (depart), avance d'une plaque d'egout (multiplicateur) a l'autre.
// Voitures decoratives traversent verticalement entre les plaques.
// Palier 4 = checkpoint 100% SAFE. Avancer plus loin = risque de mort
// (le poulet a deja securise son 100%, le bonus reste garanti).
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import { sfx } from "../lib/v3_sound";
import { pseudoTextStyle, pseudoPillStyle, type V3LineStyleLike } from "../lib/v3_pseudo_style";
import { V3OfferPopup } from "./V3OfferPopup";
import { V3SocialProof } from "./V3SocialProof";

export type M9CrossyProps = {
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

// 0 = depart (zone verte). 1..7 = plaques.
// Palier 4 = checkpoint 100% safe.
const PALIERS = [
  { label: "Départ", mult: "1.00x", safe: true,  checkpoint: false },
  { label: "+25%",   mult: "1.25x", safe: true,  checkpoint: false },
  { label: "+50%",   mult: "1.50x", safe: true,  checkpoint: false },
  { label: "+75%",   mult: "1.75x", safe: true,  checkpoint: false },
  { label: "+100%",  mult: "2.00x", safe: true,  checkpoint: true  },
  { label: "+150%",  mult: "2.50x", safe: false, checkpoint: false },
  { label: "+200%",  mult: "3.00x", safe: false, checkpoint: false },
  { label: "+500%",  mult: "6.00x", safe: false, checkpoint: true  },
];

const SAFE_PALIER = 4;

export function M9Crossy({ pseudo, profileImageUrl, depositAmount, bonusAmount, affiLink, theme, pseudoStyle }: M9CrossyProps) {
  const T = {
    accent:      theme?.accent      || "#22c55e",
    accentLight: theme?.accentLight || "#86efac",
    accentGlow:  theme?.accentGlow  || "rgba(34,197,94,.45)",
    accentDark:  "#15803d",
    bgPage:      theme?.bgPage      || "#0a1014",
    bgCard:      theme?.bgCard      || "#0f1820",
    borderColor: theme?.borderColor || "rgba(134,239,172,.22)",
  };

  const [step, setStep] = React.useState(0);
  const [phase, setPhase] = React.useState<"idle" | "moving" | "dead" | "collected">("idle");
  const [popupOpen, setPopupOpen] = React.useState(false);

  const dep = depositAmount != null ? `${depositAmount}€` : "";
  const bon = bonusAmount != null ? `${bonusAmount}€` : "";
  const safeAffi = affiLink || "#";

  const crossySteps = React.useMemo(() => [
    "Vérification du palier",
    "Validation du bonus 100%",
    "Lien d'accès prêt",
  ], []);

  const currentMult = PALIERS[Math.min(step, PALIERS.length - 1)]?.mult || "1.00x";

  const advance = () => {
    if (phase === "moving" || phase === "dead" || phase === "collected") return;
    sfx.click();
    setPhase("moving");
    const nextStep = step + 1;
    const nextPalier = PALIERS[nextStep];

    window.setTimeout(() => {
      setStep(nextStep);
      if (!nextPalier) {
        setPhase("idle");
        return;
      }
      if (nextPalier.checkpoint && nextPalier.safe) {
        sfx.coin();
        sfx.win();
        setPhase("idle");
      } else if (nextPalier.safe) {
        sfx.reveal();
        setPhase("idle");
      } else {
        sfx.boom();
        setTimeout(() => {
          sfx.tension(500);
          setPhase("dead");
          setTimeout(() => { sfx.win(); setPopupOpen(true); }, 1100);
        }, 300);
      }
    }, 480);
  };

  const collect = () => {
    if (phase === "moving" || phase === "dead" || phase === "collected") return;
    if (step < SAFE_PALIER) return;
    sfx.click(); sfx.coin(); sfx.win();
    setPhase("collected");
    setTimeout(() => setPopupOpen(true), 500);
  };

  const reset = () => {
    setStep(0);
    setPhase("idle");
    setPopupOpen(false);
  };

  // Position du poulet : 0 = zone depart (gauche), 1..7 = plaques sur la route
  // Layout horizontal: depart prend 22% a gauche, route 78% repartie sur 7 cases
  const DEPART_WIDTH_PCT = 22;
  const ROAD_WIDTH_PCT = 100 - DEPART_WIDTH_PCT;
  const SLOTS = PALIERS.length - 1; // 7 plaques
  const slotWidth = ROAD_WIDTH_PCT / SLOTS;

  const positionXPct = step === 0
    ? DEPART_WIDTH_PCT / 2
    : DEPART_WIDTH_PCT + slotWidth * (step - 0.5);

  return (
    <div className="m9-root" style={{ background: T.bgPage, color: "#f1f5f9" }}>
      <style>{`
        .m9-root{display:flex;flex-direction:column;align-items:center;padding:32px 16px 48px;font-family:'Inter',-apple-system,sans-serif;position:relative;overflow:hidden;min-height:100vh}
        .m9-root::before{content:"";position:absolute;inset:0;background:
          radial-gradient(circle at 50% 0%,${T.accentGlow}40,transparent 35%),
          radial-gradient(circle at 80% 60%,rgba(252,211,77,.10),transparent 30%),
          linear-gradient(180deg,${T.bgPage},#040608 100%);
          pointer-events:none}
        .m9-root > *{position:relative;z-index:2}

        .m9-header{display:flex;flex-direction:column;align-items:center;gap:8px;margin-bottom:14px}
        .m9-avatar{width:72px;height:72px;border-radius:50%;border:2px solid ${T.accent};overflow:hidden;box-shadow:0 0 0 4px rgba(255,255,255,.04),0 0 22px ${T.accentGlow}}
        .m9-avatar img{width:100%;height:100%;object-fit:cover;display:block}
        .m9-pseudo-wrap{display:flex;justify-content:center;position:relative;isolation:isolate}
        .m9-pseudo-wrap::before{content:"";position:absolute;inset:-6px -14px;border-radius:999px;background:radial-gradient(ellipse at center,${T.accentGlow} 0%,transparent 70%);z-index:-1;animation:m9-pseudo-glow 2.6s ease-in-out infinite;pointer-events:none}

        .m9-promo{display:inline-flex;align-items:center;gap:8px;padding:9px 18px;margin-bottom:14px;background:rgba(8,15,22,.85);border:1px solid ${T.borderColor};border-radius:999px;font-size:.74rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:rgba(241,245,249,.92);box-shadow:0 0 18px ${T.accentGlow}}
        .m9-promo-dot{width:8px;height:8px;border-radius:50%;background:${T.accent};box-shadow:0 0 12px ${T.accentGlow};animation:m9-pulse 1.6s ease-in-out infinite}

        .m9-hud{display:flex;width:min(94vw,520px);gap:8px;margin-bottom:14px}
        .m9-hud-card{flex:1;padding:10px 14px;background:rgba(8,15,22,.7);border:1px solid rgba(134,239,172,.18);border-radius:12px;text-align:center;backdrop-filter:blur(6px)}
        .m9-hud-lbl{font-size:.6rem;color:rgba(241,245,249,.55);letter-spacing:.14em;text-transform:uppercase;margin-bottom:3px}
        .m9-hud-val{font-size:1.05rem;font-weight:900;color:#fff;font-variant-numeric:tabular-nums}
        .m9-hud-val.win{color:${T.accentLight};text-shadow:0 0 14px ${T.accentGlow}}

        /* Stage horizontal */
        .m9-stage{position:relative;width:min(94vw,520px);height:200px;background:#3f3a48;border:1px solid ${T.borderColor};border-radius:18px;overflow:hidden;box-shadow:0 22px 60px rgba(0,0,0,.55),inset 0 2px 0 rgba(255,255,255,.06);margin-bottom:14px}

        /* Zone DEPART (gauche, verte avec ferme) */
        .m9-depart{position:absolute;top:0;bottom:0;left:0;width:${DEPART_WIDTH_PCT}%;background:
          linear-gradient(180deg,#a3e635 0%,#65a30d 100%);
          border-right:3px solid #422006;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;z-index:2;box-shadow:inset -6px 0 12px rgba(0,0,0,.18)}
        .m9-depart-tree{font-size:1.4rem;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,.4))}
        .m9-depart-barn{font-size:1.6rem;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,.4))}
        .m9-depart-label{position:absolute;bottom:8px;left:50%;transform:translateX(-50%);padding:3px 8px;border-radius:6px;background:rgba(0,0,0,.55);color:#fff;font-size:.55rem;font-weight:900;letter-spacing:.14em;text-transform:uppercase}

        /* Route principale (zone droite) */
        .m9-road{position:absolute;top:0;bottom:0;left:${DEPART_WIDTH_PCT}%;right:0;background:
          repeating-linear-gradient(180deg,transparent 0,transparent 18px,rgba(255,255,255,.7) 18px,rgba(255,255,255,.7) 26px,transparent 26px,transparent 60px),
          linear-gradient(180deg,#5b5564,#3f3a48);
        }
        /* Lanes verticales (lignes blanches pointillees entre les plaques) */
        .m9-lane-divider{position:absolute;top:0;bottom:0;width:1px;background:repeating-linear-gradient(180deg,rgba(255,255,255,.85) 0,rgba(255,255,255,.85) 8px,transparent 8px,transparent 18px)}

        /* Plaques (manholes / multiplier circles) */
        .m9-plaque{position:absolute;top:50%;transform:translate(-50%,-50%);width:54px;height:54px;border-radius:50%;background:
          radial-gradient(circle at 35% 30%,#5b5564,#1a1820 60%,#0a0810);
          border:2px solid #2a262e;display:flex;align-items:center;justify-content:center;font-size:.78rem;font-weight:900;color:#fff;font-variant-numeric:tabular-nums;letter-spacing:.02em;box-shadow:inset 0 -3px 4px rgba(0,0,0,.6),inset 0 2px 0 rgba(255,255,255,.1),0 6px 14px rgba(0,0,0,.55);z-index:3;text-shadow:0 1px 2px rgba(0,0,0,.7)}
        .m9-plaque::before{content:"";position:absolute;inset:5px;border-radius:50%;border:1px dashed rgba(255,255,255,.18);pointer-events:none}
        .m9-plaque.reached{background:radial-gradient(circle at 35% 30%,${T.accentLight},${T.accent} 50%,${T.accentDark});border-color:${T.accentDark};color:#0a1014;text-shadow:none;box-shadow:inset 0 -3px 4px rgba(0,0,0,.4),inset 0 2px 0 rgba(255,255,255,.4),0 8px 18px ${T.accentGlow},0 0 22px ${T.accentGlow}}
        .m9-plaque.danger{background:radial-gradient(circle at 35% 30%,#7f1d1d,#450a0a 60%,#1a0606);border-color:#7f1d1d;color:#fecaca}
        .m9-plaque.checkpoint::after{content:"🏁";position:absolute;top:-14px;left:50%;transform:translateX(-50%);font-size:.95rem;filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))}

        /* Voiture decorative en pixel art */
        .m9-car{position:absolute;width:36px;height:54px;transform:translate(-50%,-50%);font-size:1.85rem;line-height:1;text-align:center;z-index:2;filter:drop-shadow(0 4px 8px rgba(0,0,0,.5))}
        .m9-car.car-moving{animation:m9-car-roll 3s linear infinite}

        /* Poulet */
        .m9-chicken{position:absolute;top:50%;left:${positionXPct}%;transform:translate(-50%,-50%);width:52px;height:52px;font-size:2.3rem;line-height:1;text-align:center;z-index:5;transition:left .48s cubic-bezier(.34,1.56,.64,1),top .3s ease-out;filter:drop-shadow(0 6px 10px rgba(0,0,0,.6));animation:m9-chicken-idle 1.4s ease-in-out infinite}
        .m9-chicken.moving{animation:m9-chicken-hop .48s cubic-bezier(.4,1.6,.6,1)}
        .m9-chicken.dead{animation:m9-death .9s ease-out forwards}

        .m9-boom{position:absolute;top:50%;left:${positionXPct}%;transform:translate(-50%,-50%);font-size:3rem;z-index:6;opacity:0;pointer-events:none}
        .m9-boom.show{animation:m9-boom-pop .9s ease-out forwards}

        /* Buttons */
        .m9-actions{display:flex;flex-direction:column;width:min(94vw,520px);gap:10px}
        .m9-cta{display:block;width:100%;padding:18px 24px;background:linear-gradient(180deg,${T.accentLight} 0%,${T.accent} 100%);color:#062012;font-weight:900;text-transform:uppercase;letter-spacing:.14em;font-size:.95rem;border:1px solid ${T.accentLight};border-radius:14px;cursor:pointer;box-shadow:0 0 0 1px rgba(0,0,0,.3),0 0 22px ${T.accentGlow},0 0 44px ${T.accentGlow},inset 0 1px 0 rgba(255,255,255,.5);text-decoration:none;text-align:center;font-family:inherit;transition:transform .12s ease;animation:m9-cta-pulse 2.2s ease-in-out infinite}
        .m9-cta:not(:disabled):hover{transform:translateY(-2px)}
        .m9-cta:not(:disabled):active{transform:translateY(1px)}
        .m9-cta:disabled{background:linear-gradient(180deg,#2a2a32,#1a1a20);color:rgba(255,255,255,.5);border-color:#2a2a32;cursor:not-allowed;box-shadow:inset 0 1px 0 rgba(255,255,255,.06);animation:none}
        .m9-cta.collect{background:linear-gradient(180deg,#fde68a 0%,#facc15 100%);border-color:#fde68a;color:#1f1300;box-shadow:0 0 0 1px rgba(0,0,0,.3),0 0 22px rgba(250,204,21,.5),0 0 44px rgba(250,204,21,.4),inset 0 1px 0 rgba(255,255,255,.5)}
        .m9-cta.ghost{background:rgba(8,15,22,.5);color:rgba(241,245,249,.7);border:1px solid rgba(255,255,255,.08);box-shadow:none;font-size:.8rem;padding:12px 18px;animation:none}

        .m9-warn{font-size:.74rem;color:rgba(252,165,165,.85);text-align:center;letter-spacing:.04em;margin-top:6px;font-weight:600}

        @keyframes m9-pseudo-glow{0%,100%{opacity:.55;transform:scale(.95)}50%{opacity:1;transform:scale(1.08)}}
        @keyframes m9-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.3);opacity:.7}}
        @keyframes m9-chicken-idle{0%,100%{transform:translate(-50%,-50%) translateY(0)}50%{transform:translate(-50%,-50%) translateY(-3px)}}
        @keyframes m9-chicken-hop{0%{transform:translate(-50%,-50%) translateY(0) scale(1)}50%{transform:translate(-50%,-50%) translateY(-22px) scale(1.08)}100%{transform:translate(-50%,-50%) translateY(0) scale(1)}}
        @keyframes m9-car-roll{0%{top:-20%}100%{top:120%}}
        @keyframes m9-death{0%{transform:translate(-50%,-50%) scale(1)}30%{transform:translate(-50%,-50%) scale(1.4) rotate(-12deg);filter:drop-shadow(0 6px 12px rgba(239,68,68,.8))}100%{transform:translate(-50%,-50%) scale(0) rotate(-90deg);opacity:0}}
        @keyframes m9-boom-pop{0%{opacity:0;transform:translate(-50%,-50%) scale(.3)}40%{opacity:1;transform:translate(-50%,-50%) scale(1.4)}100%{opacity:0;transform:translate(-50%,-50%) scale(1)}}
        @keyframes m9-cta-pulse{0%,100%{box-shadow:0 0 0 1px rgba(0,0,0,.3),0 0 22px ${T.accentGlow},0 0 44px ${T.accentGlow},inset 0 1px 0 rgba(255,255,255,.5)}50%{box-shadow:0 0 0 1px rgba(0,0,0,.3),0 0 30px ${T.accentLight},0 0 60px ${T.accent},inset 0 1px 0 rgba(255,255,255,.55)}}
      `}</style>

      <div className="m9-header">
        {profileImageUrl ? <div className="m9-avatar"><img src={profileImageUrl} alt="" /></div> : null}
        {pseudo ? (
          <div className="m9-pseudo-wrap">
            <div style={{ ...pseudoPillStyle(T.accent), ...pseudoTextStyle(pseudoStyle, T.accent) }}>
              {pseudo}
            </div>
          </div>
        ) : null}
      </div>

      <div className="m9-promo">
        <span className="m9-promo-dot" />
        Crossy · Avance pour gagner
      </div>

      <div className="m9-hud">
        <div className="m9-hud-card">
          <div className="m9-hud-lbl">Multi</div>
          <div className={`m9-hud-val ${step >= SAFE_PALIER ? "win" : ""}`}>{currentMult}</div>
        </div>
        <div className="m9-hud-card">
          <div className="m9-hud-lbl">Bonus</div>
          <div className={`m9-hud-val ${step >= SAFE_PALIER ? "win" : ""}`}>{bon || "—"}</div>
        </div>
        <div className="m9-hud-card">
          <div className="m9-hud-lbl">Mise</div>
          <div className="m9-hud-val">{dep || "—"}</div>
        </div>
      </div>

      <div className="m9-stage">
        {/* Zone depart */}
        <div className="m9-depart">
          <div className="m9-depart-tree">🌳</div>
          <div className="m9-depart-barn">🏠</div>
          <div className="m9-depart-label">Départ</div>
        </div>

        {/* Route */}
        <div className="m9-road" />

        {/* Lane dividers (entre chaque case) */}
        {Array.from({ length: SLOTS - 1 }).map((_, i) => {
          const leftPct = DEPART_WIDTH_PCT + slotWidth * (i + 1);
          return <div key={`div-${i}`} className="m9-lane-divider" style={{ left: `${leftPct}%` }} />;
        })}

        {/* Plaques avec multiplicateurs */}
        {PALIERS.slice(1).map((p, i) => {
          const plaqueIdx = i + 1; // step index reel
          const leftPct = DEPART_WIDTH_PCT + slotWidth * (i + 0.5);
          const reached = plaqueIdx <= step;
          const danger = !p.safe;
          return (
            <div
              key={`p-${plaqueIdx}`}
              className={[
                "m9-plaque",
                reached ? "reached" : "",
                danger ? "danger" : "",
                p.checkpoint ? "checkpoint" : "",
              ].filter(Boolean).join(" ")}
              style={{ left: `${leftPct}%` }}
            >
              {p.mult}
            </div>
          );
        })}

        {/* Voitures decoratives sur les lanes non encore atteintes */}
        {Array.from({ length: SLOTS - 1 }).map((_, i) => {
          const laneIdx = i + 1; // index entre plaques
          // affiche une voiture si la lane est apres le poulet et pas encore franchie
          if (laneIdx <= step) return null;
          const leftPct = DEPART_WIDTH_PCT + slotWidth * laneIdx;
          const delay = (i * 0.7) % 3;
          return (
            <div
              key={`car-${i}`}
              className="m9-car car-moving"
              style={{ left: `${leftPct}%`, animationDelay: `${-delay}s` }}
            >
              🚗
            </div>
          );
        })}

        {/* Poulet */}
        <div className={`m9-chicken ${phase === "moving" ? "moving" : ""} ${phase === "dead" ? "dead" : ""}`}>🐔</div>

        {/* Boom on death */}
        <div className={`m9-boom ${phase === "dead" ? "show" : ""}`}>💥</div>
      </div>

      <div className="m9-actions">
        {phase === "dead" || phase === "collected" ? (
          <>
            <a href={safeAffi} target="_blank" rel="noreferrer" className="m9-cta collect v3-cta">
              Récupérer mon bonus 100%
            </a>
            <button className="m9-cta ghost" onClick={reset}>↻ Rejouer</button>
          </>
        ) : (
          <>
            <button className="m9-cta" onClick={advance} disabled={phase === "moving"}>
              {phase === "moving" ? "..." : step === 0 ? "🐔 Démarrer" : "🐔 Avancer"}
            </button>
            {step >= SAFE_PALIER ? (
              <button className="m9-cta collect" onClick={collect} disabled={phase === "moving"}>
                💰 Collecter mon 100%
              </button>
            ) : null}
            {step >= SAFE_PALIER ? (
              <div className="m9-warn">⚠ Avancer encore = traverser sans bonus garanti</div>
            ) : null}
          </>
        )}
      </div>

      <V3OfferPopup
        open={popupOpen && (phase === "dead" || phase === "collected")}
        onClose={() => setPopupOpen(false)}
        theme={{ accent: T.accent, accentLight: T.accentLight, accentGlow: T.accentGlow, bgCard: T.bgCard, borderColor: T.borderColor }}
        score={(depositAmount != null && bonusAmount != null && bonusAmount - depositAmount > 0) ? `+${bonusAmount - depositAmount}€` : (bon ? `+${bon}` : "100%")}
        depositAmount={dep}
        bonusAmount={bon}
        steps={crossySteps}
        href={safeAffi}
      />

      <V3SocialProof bonusAmount={bon} accent={T.accent} accentGlow={T.accentGlow} />
    </div>
  );
}
