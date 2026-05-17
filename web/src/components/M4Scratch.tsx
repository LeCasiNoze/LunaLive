// ─────────────────────────────────────────────────────────────────────────────
// M4 — "Crash Game" (remplacement de l'ancien Mystery Boxes).
// Format viral connu de Stake / casino crypto : un multiplier monte (1.00x →
// 2.0x → 5x → ...), le joueur clique CASH OUT avant que ça crash. Si timing
// reussi, bonus * multiplier. Sinon, "tu as failli !" et CTA replay menant
// au CTA principal.
//
// Conversion : urgence + skill perceived + replay loop = engagement maximal.
// Fichier reste M4Scratch.tsx pour retrocompat saves (export name preserve).
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import { motion, useMotionValue, animate as fmAnimate } from "framer-motion";
import { sfx } from "../lib/v3_sound";
import { pseudoTextStyle, pseudoPillStyle, pseudoAnimationClass, type V3LineStyleLike } from "../lib/v3_pseudo_style";
import { V3OfferPopup } from "./V3OfferPopup";
import { V3SocialProof } from "./V3SocialProof";
import { V3MeshBg, V3AuroraBg, V3GrainBg, V3Spotlight } from "./V3AmbientFx";
import { V3MagneticButton } from "./V3MagneticButton";
import { V3PseudoKeyframes } from "./V3PseudoKeyframes";
import { extendPalette } from "../lib/v3_palette";

export type M4ScratchProps = {
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

type Phase = "idle" | "running" | "cashed" | "crashed";

export function M4Scratch({
  pseudo, profileImageUrl, depositAmount, bonusAmount, affiLink, theme, pseudoStyle,
}: M4ScratchProps) {
  const P = extendPalette(theme, "#FFD700");
  const T = {
    accent: P.accent, accentLight: P.accentLight, accentAlt: P.accentAlt, accentHot: P.accentHot,
    accentGlow: P.glow, bgPage: P.bgPage, bgCard: P.bgCard,
  };

  const dep = depositAmount != null ? `${depositAmount}€` : "";
  const bon = bonusAmount != null ? `${bonusAmount}€` : "";
  const safeAffi = affiLink || "#";

  const [phase, setPhase] = React.useState<Phase>("idle");
  const [popupOpen, setPopupOpen] = React.useState(false);
  const mult = useMotionValue(1.0);
  const [displayMult, setDisplayMult] = React.useState(1.0);
  const [crashAt, setCrashAt] = React.useState(0);
  const cashedAtRef = React.useRef(0);

  // Subscribe motion value → setState for render
  React.useEffect(() => {
    return mult.on("change", (v) => setDisplayMult(v));
  }, [mult]);

  const start = () => {
    if (phase === "running") return;
    // Crash target : random entre 1.3x et 8.0x, biais vers 2-3x (effet "presque")
    const target = 1.3 + Math.pow(Math.random(), 1.6) * 7.0;
    setCrashAt(target);
    setPhase("running");
    mult.set(1.0);
    sfx.tick();
    // Animation duration scale avec le crash target
    const duration = 1.6 + (target - 1.3) * 0.9;
    fmAnimate(mult, target, {
      duration,
      ease: [0.15, 0.05, 0.25, 1],
      onComplete: () => {
        // CRASH si pas cashed
        if (cashedAtRef.current === 0) {
          setPhase("crashed");
          sfx.loss();
        }
      },
    });
  };

  const cashOut = () => {
    if (phase !== "running") return;
    const v = mult.get();
    cashedAtRef.current = v;
    mult.stop();
    setPhase("cashed");
    sfx.win();
  };

  // Reset après crash : laisse 1.5s pour digest puis revient idle
  React.useEffect(() => {
    if (phase !== "crashed") return;
    const id = window.setTimeout(() => {
      setPhase("idle");
      cashedAtRef.current = 0;
      mult.set(1.0);
    }, 2400);
    return () => window.clearTimeout(id);
  }, [phase, mult]);

  const onMainCta = (e: React.MouseEvent) => { e.preventDefault(); setPopupOpen(true); };

  const finalMult = phase === "cashed" ? cashedAtRef.current : displayMult;
  const wonBonus = bonusAmount != null ? Math.round(bonusAmount * finalMult) : null;

  // Couleur dynamique du multiplier selon phase + valeur
  const multColor =
    phase === "crashed" ? "#ef4444" :
    phase === "cashed" ? "#22c55e" :
    displayMult > 5 ? T.accentHot :
    displayMult > 2.5 ? T.accentLight :
    T.accent;

  const popupSteps = React.useMemo(() => [
    "Validation de ton score",
    "Preparation de l'offre",
    "Lien bonus pret",
  ], []);

  return (
    <div className="m4-root">
      <style>{`
        .m4-root{position:relative;min-height:100vh;padding:24px 18px 160px;background:${T.bgPage};
          font-family:'Inter','Space Grotesk',sans-serif;color:#fff;overflow:hidden;
          --c-accent:${T.accent};--c-light:${T.accentLight};--c-alt:${T.accentAlt};--c-hot:${T.accentHot};--c-glow:${T.accentGlow}}
        .m4-layer{position:relative;z-index:10;max-width:440px;margin:0 auto}

        .m4-header{display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;margin-bottom:18px}
        .m4-avatar{width:64px;height:64px;border-radius:50%;overflow:hidden;border:2px solid ${T.accent};
          box-shadow:0 0 0 3px rgba(0,0,0,.4),0 0 22px ${T.accentGlow}}
        .m4-avatar img{width:100%;height:100%;object-fit:cover;display:block}

        .m4-game-card{position:relative;padding:34px 24px 28px;border-radius:24px;text-align:center;overflow:hidden;
          background:linear-gradient(160deg,${T.bgCard}ee,${T.bgPage}ee);
          backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
          border:1.5px solid ${T.accent}55;
          box-shadow:0 0 0 1px ${T.accent}22 inset,0 22px 70px ${T.accentGlow}99}
        .m4-game-card::before{content:"";position:absolute;inset:-1px;border-radius:24px;padding:1.5px;pointer-events:none;
          background:conic-gradient(from var(--ang,0deg),${T.accent},${T.accentLight},${T.accentAlt},${T.accent});
          -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;
          animation:m4-spin 5s linear infinite}
        @property --ang{syntax:'<angle>';inherits:false;initial-value:0deg}
        @keyframes m4-spin{to{--ang:360deg}}

        .m4-label{font-size:.66rem;letter-spacing:.32em;text-transform:uppercase;opacity:.6;margin:0}

        .m4-mult-display{margin:18px 0 6px;font-size:clamp(4.5rem,18vw,7rem);font-weight:900;line-height:.9;letter-spacing:-.06em;
          color:var(--m-color,${T.accent});font-variant-numeric:tabular-nums;
          text-shadow:0 0 30px var(--m-color,${T.accent}),0 4px 16px rgba(0,0,0,.5);
          transition:color .25s ease}
        .m4-mult-x{font-size:.5em;opacity:.7;font-weight:700;margin-left:6px}

        .m4-bonus-preview{margin:8px 0 0;font-size:.95rem;font-weight:700;opacity:.85;font-variant-numeric:tabular-nums}
        .m4-bonus-preview strong{color:var(--m-color,${T.accent})}

        .m4-status{margin:14px 0 18px;min-height:32px;font-size:.85rem;font-weight:700;letter-spacing:.04em}
        .m4-status.running{color:${T.accentLight}}
        .m4-status.cashed{color:#22c55e;animation:m4-pop 0.5s cubic-bezier(.4,1.6,.5,1) both}
        .m4-status.crashed{color:#ef4444;animation:m4-shake 0.5s ease-in-out both}
        .m4-status .reveal{opacity:.6;font-weight:500;margin-left:6px}

        .m4-action{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:20px;border-radius:16px;
          font-family:inherit;font-size:1.05rem;font-weight:900;letter-spacing:.04em;color:#000;text-decoration:none;cursor:pointer;border:none;
          background:linear-gradient(135deg,${T.accent},${T.accentLight});
          box-shadow:0 0 36px ${T.accentGlow},0 14px 30px ${T.accent}66,inset 0 1px 0 rgba(255,255,255,.5);
          text-shadow:0 1px 0 rgba(255,255,255,.3);transition:transform .12s;animation:m4-breath 2.6s ease-in-out infinite}
        .m4-action:active{transform:scale(.97)}
        .m4-action.cashout{background:linear-gradient(135deg,#22c55e,#86efac);box-shadow:0 0 36px rgba(34,197,94,.55),0 14px 30px rgba(34,197,94,.4),inset 0 1px 0 rgba(255,255,255,.5)}
        .m4-action.disabled{opacity:.5;cursor:not-allowed;animation:none}

        .m4-hint{margin:10px 0 0;font-size:.7rem;opacity:.55;text-align:center;letter-spacing:.04em}

        .m4-history{display:flex;justify-content:center;gap:6px;margin-top:18px;flex-wrap:wrap}
        .m4-history-pill{padding:4px 9px;border-radius:999px;font-size:.7rem;font-weight:700;font-variant-numeric:tabular-nums;
          background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08)}

        .m4-cta-final{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:22px;margin-top:22px;border-radius:18px;
          font-size:1.1rem;font-weight:900;letter-spacing:.04em;color:#000;text-decoration:none;cursor:pointer;
          background:linear-gradient(135deg,${T.accent},${T.accentLight});
          box-shadow:0 0 40px ${T.accentGlow},0 16px 36px ${T.accent}66,inset 0 1px 0 rgba(255,255,255,.5);
          text-shadow:0 1px 0 rgba(255,255,255,.3)}
        .m4-cta-final::after{content:"→";font-size:1.3rem;margin-left:4px}
        .m4-cta-sub{margin-top:10px;text-align:center;font-size:.72rem;opacity:.65}

        @keyframes m4-pop{from{transform:scale(.8)}to{transform:scale(1)}}
        @keyframes m4-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
        @keyframes m4-breath{0%,100%{box-shadow:0 0 36px ${T.accentGlow},0 14px 30px ${T.accent}66,inset 0 1px 0 rgba(255,255,255,.5)}50%{box-shadow:0 0 56px ${T.accentLight},0 14px 30px ${T.accent}99,inset 0 1px 0 rgba(255,255,255,.6)}}
        @media (prefers-reduced-motion:reduce){.m4-game-card::before,.m4-action,.m4-status{animation:none !important}}
      `}</style>

      <V3MeshBg colors={{ accent: T.accent, accentLight: T.accentLight, accentAlt: T.accentAlt, accentHot: T.accentHot }} opacity={0.42} />
      <V3AuroraBg colors={{ accent: T.accent, accentLight: T.accentLight, accentAlt: T.accentAlt, accentHot: T.accentHot }} opacity={0.16} />
      <V3GrainBg opacity={0.05} />

      <div className="m4-layer">
        {/* Header optionnel */}
        {(profileImageUrl || pseudo) ? (
          <div className="m4-header">
            {profileImageUrl ? <div className="m4-avatar"><img src={profileImageUrl} alt="" /></div> : null}
            {pseudo ? (
              <div className={pseudoAnimationClass(pseudoStyle)} style={{ ...pseudoPillStyle(T.accent), ...pseudoTextStyle(pseudoStyle, T.accent) }}>
                {pseudo}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Game card */}
        <div style={{ position: "relative" }}>
          <V3Spotlight accent={T.accent} accentAlt={T.accentAlt} intensity={0.45} size={360} />
          <div className="m4-game-card">
            <p className="m4-label">Cash out avant le crash</p>
            <div className="m4-mult-display" style={{ ["--m-color" as any]: multColor } as any}>
              {finalMult.toFixed(2)}<span className="m4-mult-x">x</span>
            </div>
            {bonusAmount != null ? (
              <p className="m4-bonus-preview" style={{ ["--m-color" as any]: multColor } as any}>
                Bonus = <strong>+{wonBonus}€</strong>
              </p>
            ) : null}
            <div className={`m4-status ${phase}`}>
              {phase === "idle"    && <span>Prêt à jouer · {dep ? `dépose ${dep}` : "bonus disponible"}</span>}
              {phase === "running" && <span>EN VOL · cash out maintenant ?</span>}
              {phase === "cashed"  && <span>✓ ENCAISSÉ {finalMult.toFixed(2)}x<span className="reveal"> · crash prévu {crashAt.toFixed(2)}x</span></span>}
              {phase === "crashed" && <span>💥 CRASH à {crashAt.toFixed(2)}x — réessaie !</span>}
            </div>
            {phase === "idle" || phase === "crashed" ? (
              <motion.button
                type="button"
                className={`m4-action ${phase === "crashed" ? "disabled" : ""}`}
                onClick={start}
                disabled={phase === "crashed"}
                whileTap={{ scale: 0.97 }}
              >
                ▶ LANCER
              </motion.button>
            ) : phase === "running" ? (
              <motion.button
                type="button"
                className="m4-action cashout"
                onClick={cashOut}
                whileTap={{ scale: 0.95 }}
              >
                💰 CASH OUT
              </motion.button>
            ) : (
              <V3MagneticButton href={safeAffi} onClick={onMainCta} className="m4-action">
                🚀 RÉCLAMER {wonBonus ? `+${wonBonus}€` : "MON BONUS"}
              </V3MagneticButton>
            )}
            <p className="m4-hint">{phase === "running" ? "Plus tu attends, plus le bonus monte… mais ça peut crasher !" : "Multiplier 1.00x → ∞. Crash imprévisible."}</p>
          </div>
        </div>

        {/* Historique paliers (statique pour social proof) */}
        <div className="m4-history">
          <span className="m4-history-pill" style={{ color: "#ef4444" }}>1.21x</span>
          <span className="m4-history-pill" style={{ color: "#22c55e" }}>2.45x</span>
          <span className="m4-history-pill" style={{ color: "#22c55e" }}>3.80x</span>
          <span className="m4-history-pill" style={{ color: "#22c55e" }}>5.12x</span>
          <span className="m4-history-pill" style={{ color: "#ef4444" }}>1.05x</span>
          <span className="m4-history-pill" style={{ color: "#22c55e" }}>7.66x</span>
        </div>

        {/* Final CTA (toujours visible) */}
        <V3MagneticButton href={safeAffi} onClick={onMainCta} className="m4-cta-final v3-cta">
          {bon ? `RÉCLAMER ${bon} BONUS` : "RÉCLAMER MON BONUS"}
        </V3MagneticButton>
        <p className="m4-cta-sub">Inscription en 30s · Crédit instantané</p>
      </div>

      <V3OfferPopup
        open={popupOpen}
        onClose={() => setPopupOpen(false)}
        theme={{ accent: T.accent, accentLight: T.accentLight, accentGlow: T.accentGlow, bgCard: T.bgCard }}
        score={phase === "cashed" ? `${finalMult.toFixed(2)}x` : (bon ? `+${bon}` : "Bonus")}
        depositAmount={dep}
        bonusAmount={wonBonus != null ? `${wonBonus}€` : bon}
        steps={popupSteps}
        href={safeAffi}
      />

      <V3SocialProof bonusAmount={bon} accent={T.accent} accentGlow={T.accentGlow} />
      <V3PseudoKeyframes />
    </div>
  );
}
