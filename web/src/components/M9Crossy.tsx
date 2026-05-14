// ─────────────────────────────────────────────────────────────────────────────
// M9 — Crossy Road horizontal type Stake.
// Route en lignes verticales (voies). Poulet a gauche dans une zone verte.
// 6 plaques avec multiplicateurs : 10 / 20 / 50 / 100 / 200 / 500 %
// Palier 4 (100%) = checkpoint SAFE max. Au-dela = mort assuree.
// A chaque "Avancer" : le poulet saute en avancant (1 arc), une voiture
// descend la voie de destination. Si plaque safe → une barriere 🚧 sort
// du sol et stoppe la voiture. Si plaque danger → pas de barriere, la
// voiture ecrase le poulet.
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

// Plaques (index 1..6). Index 0 = depart (zone verte).
const PALIERS: Array<{ label: string; pct: number; safe: boolean; checkpoint: boolean }> = [
  { label: "Départ", pct: 0,   safe: true,  checkpoint: false },
  { label: "10%",    pct: 10,  safe: true,  checkpoint: false },
  { label: "20%",    pct: 20,  safe: true,  checkpoint: false },
  { label: "50%",    pct: 50,  safe: true,  checkpoint: false },
  { label: "100%",   pct: 100, safe: true,  checkpoint: true  },
  { label: "200%",   pct: 200, safe: false, checkpoint: false },
  { label: "500%",   pct: 500, safe: false, checkpoint: false },
];

const SAFE_PALIER = 4; // 100%

const MOVE_DURATION_MS = 620;  // duree du saut + avance
const CAR_ARRIVAL_MS = 420;    // delai apres saut avant que la voiture arrive

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
  // incomingCar : voiture qui approche la plaque destination apres un saut
  // mode "stop" = bloquee par la barriere (safe), "hit" = ecrase le poulet (danger)
  const [incomingCar, setIncomingCar] = React.useState<{ lane: number; mode: "stop" | "hit"; key: number } | null>(null);
  // Lanes "safe gagnées" — la voiture stoppée + barrière restent affichées
  // jusqu'au reset (au lieu de disparaître après 900ms).
  const [safedLanes, setSafedLanes] = React.useState<Set<number>>(() => new Set());

  const dep = depositAmount != null ? `${depositAmount}€` : "";
  const bon = bonusAmount != null ? `${bonusAmount}€` : "";
  const safeAffi = affiLink || "#";

  const crossySteps = React.useMemo(() => [
    "Vérification du palier",
    "Validation du bonus 100%",
    "Lien d'accès prêt",
  ], []);

  // Pct du palier courant + gain calcule depuis le depot
  const currentPct = PALIERS[Math.min(step, PALIERS.length - 1)]?.pct ?? 0;
  const computedGain = (depositAmount != null && depositAmount > 0)
    ? Math.round(depositAmount * (1 + currentPct / 100))
    : null;

  const advance = () => {
    if (phase === "moving" || phase === "dead" || phase === "collected") return;
    const nextStep = step + 1;
    const nextPalier = PALIERS[nextStep];
    if (!nextPalier) return;

    sfx.click();
    setPhase("moving");
    // Le poulet avance immediatement (transition CSS de left + animation hop)
    setStep(nextStep);

    // Apres le saut, la voiture arrive
    window.setTimeout(() => {
      const carMode: "stop" | "hit" = nextPalier.safe ? "stop" : "hit";
      setIncomingCar({ lane: nextStep, mode: carMode, key: Date.now() });
      if (carMode === "stop") {
        // Voiture stoppee par barriere → safe
        sfx.reelStop();
        window.setTimeout(() => {
          if (nextPalier.checkpoint) { sfx.coin(); sfx.win(); }
          else sfx.reveal();
          // On garde la voiture + barriere visibles définitivement sur cette lane
          setSafedLanes((prev) => {
            const next = new Set(prev);
            next.add(nextStep);
            return next;
          });
          setIncomingCar(null);
          setPhase("idle");
        }, 900);
      } else {
        // Voiture percute le poulet → mort
        sfx.boom();
        window.setTimeout(() => {
          setPhase("dead");
          sfx.tension(500);
          window.setTimeout(() => { sfx.win(); setPopupOpen(true); }, 1200);
        }, 460);
      }
    }, CAR_ARRIVAL_MS);
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
    setIncomingCar(null);
    setSafedLanes(new Set());
    setPopupOpen(false);
  };

  // Layout : depart 20%, route 80% repartie sur 6 plaques
  const DEPART_WIDTH_PCT = 20;
  const ROAD_WIDTH_PCT = 100 - DEPART_WIDTH_PCT;
  const SLOTS = PALIERS.length - 1; // 6 plaques
  const slotWidth = ROAD_WIDTH_PCT / SLOTS;

  const positionXPct = step === 0
    ? DEPART_WIDTH_PCT / 2
    : DEPART_WIDTH_PCT + slotWidth * (step - 0.5);

  // Camera pan : a partir du palier SAFE (100%), recentre la plaque atteinte
  // sur le milieu du stage pour reveler le 500% a droite.
  const cameraShiftPct = (step >= SAFE_PALIER)
    ? Math.min(0, 50 - (DEPART_WIDTH_PCT + slotWidth * (step - 0.5)))
    : 0;

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

        .m9-hud{display:flex;width:100%;max-width:580px;gap:6px;margin-bottom:14px;box-sizing:border-box}
        .m9-hud-card{flex:1 1 0;min-width:0;padding:8px 6px;background:rgba(8,15,22,.78);border:1px solid ${T.accent}44;border-radius:12px;text-align:center;backdrop-filter:blur(6px);box-sizing:border-box;overflow:hidden;box-shadow:0 0 14px ${T.accent}11}
        .m9-hud-lbl{font-size:.55rem;color:${T.accent}bb;letter-spacing:.1em;text-transform:uppercase;margin-bottom:2px;white-space:nowrap;text-shadow:0 0 6px ${T.accent}44}
        .m9-hud-val{font-size:.92rem;font-weight:900;color:#fff;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .m9-hud-val.win{color:${T.accentLight};text-shadow:0 0 14px ${T.accentGlow}}

        /* Stage horizontal — plus grand */
        .m9-stage{position:relative;width:min(96vw,680px);height:320px;background:linear-gradient(180deg,#46414f 0%,#3f3a48 40%,#2d2933 100%);border:1px solid ${T.borderColor};border-radius:20px;overflow:hidden;box-shadow:0 22px 60px rgba(0,0,0,.55),inset 0 2px 0 rgba(255,255,255,.08),inset 0 0 0 1px ${T.accent}22,0 0 28px ${T.accent}22;margin-bottom:14px;box-sizing:border-box}
        .m9-camera{position:absolute;inset:0;transition:transform 700ms cubic-bezier(.34,1.4,.64,1)}

        /* Zone DEPART */
        .m9-depart{position:absolute;top:0;bottom:0;left:0;width:${DEPART_WIDTH_PCT}%;background:
          linear-gradient(180deg,#b8e23a 0%,#86c016 50%,#5d8b0a 100%);
          border-right:3px solid #422006;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;z-index:2;box-shadow:inset -6px 0 14px rgba(0,0,0,.28)}
        .m9-depart::before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 50% 100%,rgba(0,0,0,.25),transparent 60%);pointer-events:none}
        .m9-depart-tree{font-size:1.85rem;line-height:1;filter:drop-shadow(0 3px 5px rgba(0,0,0,.45))}
        .m9-depart-barn{font-size:2.05rem;line-height:1;filter:drop-shadow(0 3px 5px rgba(0,0,0,.45))}
        .m9-depart-label{position:absolute;bottom:10px;left:50%;transform:translateX(-50%);padding:4px 10px;border-radius:6px;background:rgba(0,0,0,.66);color:#fff;font-size:.58rem;font-weight:900;letter-spacing:.16em;text-transform:uppercase;box-shadow:0 2px 6px rgba(0,0,0,.4)}

        /* Zone ARRIVEE (apparait apres camera pan) */
        .m9-arrival{position:absolute;top:0;bottom:0;left:100%;width:42%;background:
          linear-gradient(180deg,#b8e23a 0%,#86c016 50%,#5d8b0a 100%);
          border-left:3px solid #422006;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;z-index:2;box-shadow:inset 6px 0 14px rgba(0,0,0,.28)}
        .m9-arrival::before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 50% 100%,rgba(0,0,0,.25),transparent 60%);pointer-events:none}
        .m9-arrival-flag{font-size:2.1rem;line-height:1;filter:drop-shadow(0 3px 5px rgba(0,0,0,.5));animation:m9-flag-wave 2s ease-in-out infinite}
        .m9-arrival-prize{padding:8px 14px;border-radius:999px;background:linear-gradient(180deg,#fde047,#facc15);color:#1a1300;font-weight:900;font-size:1.1rem;letter-spacing:.04em;box-shadow:0 6px 16px rgba(250,204,21,.5),inset 0 1px 0 rgba(255,255,255,.5);border:2px solid #ca8a04;animation:m9-prize-pulse 1.6s ease-in-out infinite}
        .m9-arrival-tag{padding:3px 10px;border-radius:6px;background:rgba(0,0,0,.66);color:#fff;font-size:.58rem;font-weight:900;letter-spacing:.16em;text-transform:uppercase}
        .m9-arrival-grass{position:absolute;bottom:6%;left:8%;font-size:1.2rem;line-height:1;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))}
        .m9-arrival-grass.r{left:auto;right:8%}

        /* Route asphalt */
        .m9-road{position:absolute;top:0;bottom:0;left:${DEPART_WIDTH_PCT}%;right:0;background:linear-gradient(180deg,#5b5564,#3f3a48)}
        /* Lignes pointillees blanches verticales ENTRE les voies (entre les plaques) */
        .m9-lane-divider{position:absolute;top:0;bottom:0;width:2px;background:repeating-linear-gradient(180deg,rgba(255,255,255,.9) 0,rgba(255,255,255,.9) 10px,transparent 10px,transparent 22px);z-index:1}

        /* Plaques (cible : centre de chaque voie) */
        .m9-plaque{position:absolute;top:55%;transform:translate(-50%,-50%);width:68px;height:68px;border-radius:50%;background:
          radial-gradient(circle at 35% 28%,#7a7280,#1f1c26 55%,#0d0c12);
          border:2px solid #1a181f;display:flex;align-items:center;justify-content:center;font-size:.84rem;font-weight:900;color:#fff;font-variant-numeric:tabular-nums;letter-spacing:.02em;box-shadow:inset 0 -4px 6px rgba(0,0,0,.7),inset 0 2px 0 rgba(255,255,255,.14),0 8px 18px rgba(0,0,0,.6);z-index:3;text-shadow:0 1px 2px rgba(0,0,0,.85),0 0 8px rgba(255,255,255,.18)}
        .m9-plaque::before{content:"";position:absolute;inset:6px;border-radius:50%;border:1px dashed rgba(255,255,255,.22);pointer-events:none}
        .m9-plaque::after{content:"";position:absolute;top:8%;left:18%;width:36%;height:18%;border-radius:50%;background:linear-gradient(180deg,rgba(255,255,255,.32),transparent);filter:blur(2px);pointer-events:none}
        .m9-plaque.reached{background:radial-gradient(circle at 35% 28%,#ffeb70,${T.accent} 45%,${T.accentDark});border-color:#b8851f;color:#1a1300;text-shadow:0 1px 0 rgba(255,255,255,.4);box-shadow:inset 0 -4px 6px rgba(0,0,0,.4),inset 0 2px 0 rgba(255,255,255,.55),0 8px 22px ${T.accentGlow},0 0 30px ${T.accentGlow}}
        .m9-plaque.reached::after{background:linear-gradient(180deg,rgba(255,255,255,.6),transparent)}
        .m9-plaque.checkpoint > .m9-plaque-flag{content:"🏁";position:absolute;top:-18px;left:50%;transform:translateX(-50%);font-size:1.1rem;filter:drop-shadow(0 2px 3px rgba(0,0,0,.7));z-index:4;pointer-events:none}

        /* Voitures decoratives qui boucle sur lanes vides */
        .m9-deco-car{position:absolute;width:38px;transform:translate(-50%,-50%);font-size:1.9rem;line-height:1;text-align:center;z-index:2;filter:drop-shadow(0 4px 8px rgba(0,0,0,.5));animation:m9-deco-roll 4s linear infinite}

        /* Voiture entrante = approche la plaque destination */
        .m9-incoming-car{position:absolute;width:42px;transform:translate(-50%,-50%);font-size:2.1rem;line-height:1;text-align:center;z-index:4;filter:drop-shadow(0 6px 10px rgba(0,0,0,.65))}
        .m9-incoming-car.stop{animation:m9-incoming-stop 1.2s cubic-bezier(.4,1.4,.6,1) forwards}
        .m9-incoming-car.hit{animation:m9-incoming-hit .6s cubic-bezier(.6,0,.8,.4) forwards}

        /* Barriere de protection qui sort du sol quand safe */
        .m9-barrier{position:absolute;width:54px;height:18px;transform:translate(-50%,0);font-size:1.4rem;line-height:1;text-align:center;z-index:5;opacity:0}
        .m9-barrier.show{animation:m9-barrier-rise .35s cubic-bezier(.34,1.56,.64,1) forwards}

        /* Poulet */
        .m9-chicken{position:absolute;top:55%;left:${positionXPct}%;transform:translate(-50%,-50%);width:58px;height:58px;font-size:2.6rem;line-height:1;text-align:center;z-index:5;transition:left ${MOVE_DURATION_MS}ms cubic-bezier(.34,1.56,.64,1);filter:drop-shadow(0 6px 10px rgba(0,0,0,.6));animation:m9-chicken-idle 1.4s ease-in-out infinite}
        .m9-chicken.moving{animation:m9-chicken-hop ${MOVE_DURATION_MS}ms cubic-bezier(.34,1.4,.64,1)}
        .m9-chicken.dead{animation:m9-death .9s ease-out forwards}

        .m9-boom{position:absolute;top:55%;left:${positionXPct}%;transform:translate(-50%,-50%);font-size:3.4rem;z-index:6;opacity:0;pointer-events:none}
        .m9-boom.show{animation:m9-boom-pop .9s ease-out forwards}

        /* Buttons */
        .m9-actions{display:flex;flex-direction:column;width:min(96vw,680px);gap:10px;box-sizing:border-box}
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
        @keyframes m9-chicken-hop{0%{transform:translate(-50%,-50%) translateY(0) scale(1)}50%{transform:translate(-50%,-50%) translateY(-40px) scale(1.15)}100%{transform:translate(-50%,-50%) translateY(0) scale(1)}}
        @keyframes m9-deco-roll{0%{top:-15%}100%{top:115%}}
        @keyframes m9-incoming-stop{0%{top:-15%}70%{top:32%}100%{top:32%}}
        @keyframes m9-incoming-hit{0%{top:-15%}100%{top:55%}}
        @keyframes m9-barrier-rise{0%{opacity:0;transform:translate(-50%,12px) scale(.6)}100%{opacity:1;transform:translate(-50%,0) scale(1)}}
        @keyframes m9-death{0%{transform:translate(-50%,-50%) scale(1)}30%{transform:translate(-50%,-50%) scale(1.4) rotate(-12deg);filter:drop-shadow(0 6px 12px rgba(239,68,68,.8))}100%{transform:translate(-50%,-50%) scale(0) rotate(-90deg);opacity:0}}
        @keyframes m9-boom-pop{0%{opacity:0;transform:translate(-50%,-50%) scale(.3)}40%{opacity:1;transform:translate(-50%,-50%) scale(1.4)}100%{opacity:0;transform:translate(-50%,-50%) scale(1)}}
        @keyframes m9-flag-wave{0%,100%{transform:rotate(-8deg) translateY(0)}50%{transform:rotate(8deg) translateY(-4px)}}
        @keyframes m9-prize-pulse{0%,100%{transform:scale(1);box-shadow:0 6px 16px rgba(250,204,21,.5),inset 0 1px 0 rgba(255,255,255,.5)}50%{transform:scale(1.06);box-shadow:0 8px 24px rgba(250,204,21,.7),0 0 0 4px rgba(250,204,21,.18),inset 0 1px 0 rgba(255,255,255,.5)}}
        @keyframes m9-checkpoint-rotate{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
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
        Chicken Cross · Avance pour gagner
      </div>

      <div className="m9-hud">
        <div className="m9-hud-card">
          <div className="m9-hud-lbl">Bonus</div>
          <div className={`m9-hud-val ${step >= 1 ? "win" : ""}`}>{currentPct > 0 ? `+${currentPct}%` : "—"}</div>
        </div>
        <div className="m9-hud-card">
          <div className="m9-hud-lbl">Mise</div>
          <div className="m9-hud-val">{dep || "—"}</div>
        </div>
        <div className="m9-hud-card">
          <div className="m9-hud-lbl">Gain</div>
          <div className={`m9-hud-val ${step >= SAFE_PALIER ? "win" : ""}`}>
            {computedGain != null ? `${computedGain}€` : (bon || "—")}
          </div>
        </div>
      </div>

      <div className="m9-stage">
        <div className="m9-camera" style={{ transform: `translateX(${cameraShiftPct}%)` }}>
        {/* Zone depart */}
        <div className="m9-depart">
          <div className="m9-depart-tree">🌳</div>
          <div className="m9-depart-barn">🏠</div>
          <div className="m9-depart-label">Départ</div>
        </div>

        {/* Route */}
        <div className="m9-road" />

        {/* Lignes pointillees ENTRE les plaques (entre voies) */}
        {Array.from({ length: SLOTS - 1 }).map((_, i) => {
          const leftPct = DEPART_WIDTH_PCT + slotWidth * (i + 1);
          return <div key={`div-${i}`} className="m9-lane-divider" style={{ left: `${leftPct}%` }} />;
        })}

        {/* Voitures decoratives sur lanes apres le poulet ET pas la lane d'arrivee */}
        {Array.from({ length: SLOTS }).map((_, i) => {
          const laneIdx = i + 1;
          // Pas de voiture decorative sur la lane du poulet, ni sur la lane d'arrivee si on est en mouvement
          if (laneIdx <= step) return null;
          if (incomingCar && incomingCar.lane === laneIdx) return null;
          if (safedLanes.has(laneIdx)) return null;
          const leftPct = DEPART_WIDTH_PCT + slotWidth * (laneIdx - 0.5);
          const delay = (i * 1.1) % 4;
          return (
            <div
              key={`deco-${i}`}
              className="m9-deco-car"
              style={{ left: `${leftPct}%`, animationDelay: `${-delay}s` }}
            >
              🚗
            </div>
          );
        })}

        {/* Plaques avec multiplicateurs */}
        {PALIERS.slice(1).map((p, i) => {
          const plaqueIdx = i + 1;
          const leftPct = DEPART_WIDTH_PCT + slotWidth * (i + 0.5);
          const reached = plaqueIdx <= step;
          return (
            <div
              key={`p-${plaqueIdx}`}
              className={[
                "m9-plaque",
                reached ? "reached" : "",
                p.checkpoint ? "checkpoint" : "",
              ].filter(Boolean).join(" ")}
              style={{ left: `${leftPct}%` }}
            >
              {p.checkpoint ? <span className="m9-plaque-flag">🏁</span> : null}
              {p.label}
            </div>
          );
        })}

        {/* Voiture entrante (arrive sur la plaque de destination) */}
        {incomingCar ? (
          <div
            key={incomingCar.key}
            className={`m9-incoming-car ${incomingCar.mode}`}
            style={{ left: `${DEPART_WIDTH_PCT + slotWidth * (incomingCar.lane - 0.5)}%` }}
          >
            🚙
          </div>
        ) : null}

        {/* Barriere de protection (devant la plaque safe quand arrivee) */}
        {incomingCar && incomingCar.mode === "stop" ? (
          <div
            className="m9-barrier show"
            style={{
              left: `${DEPART_WIDTH_PCT + slotWidth * (incomingCar.lane - 0.5)}%`,
              top: `38%`,
            }}
          >
            🚧
          </div>
        ) : null}

        {/* Voitures + barrières persistantes des lanes déjà gagnées (safe) */}
        {Array.from(safedLanes).map((lane) => (
          <React.Fragment key={`safed-${lane}`}>
            <div
              className="m9-incoming-car"
              style={{
                left: `${DEPART_WIDTH_PCT + slotWidth * (lane - 0.5)}%`,
                top: "32%",
                animation: "none",
              }}
            >
              🚙
            </div>
            <div
              className="m9-barrier"
              style={{
                left: `${DEPART_WIDTH_PCT + slotWidth * (lane - 0.5)}%`,
                top: `38%`,
                animation: "none",
                opacity: 1,
                transform: "translate(-50%, 0)",
              }}
            >
              🚧
            </div>
          </React.Fragment>
        ))}

        {/* Poulet */}
        <div className={`m9-chicken ${phase === "moving" ? "moving" : ""} ${phase === "dead" ? "dead" : ""}`}>🐔</div>

        {/* Boom on death */}
        <div className={`m9-boom ${phase === "dead" ? "show" : ""}`}>💥</div>

        {/* Zone ARRIVEE — revelée par le pan de camera */}
        <div className="m9-arrival">
          <span className="m9-arrival-grass">🌿</span>
          <span className="m9-arrival-grass r">🌸</span>
          <span className="m9-arrival-flag">🏁</span>
          <div className="m9-arrival-prize">+1000%</div>
          <div className="m9-arrival-tag">Arrivée</div>
        </div>
        </div>
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
            <button className="m9-cta" onClick={advance} disabled={phase === "moving" || step >= PALIERS.length - 1}>
              {phase === "moving" ? "..." : step === 0 ? "🐔 Démarrer" : "🐔 Avancer"}
            </button>
            {step >= SAFE_PALIER ? (
              <button className="m9-cta collect" onClick={collect} disabled={phase === "moving"}>
                💰 Collecter mon 100%
              </button>
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
