// ─────────────────────────────────────────────────────────────────────────────
// M7 — "Lucky Cards" (concept original V3, remplace l'ancien Plinko).
// 5 cartes face cachee. Le joueur retourne une carte a la fois, chacune
// revele un multiplier (×0.5 / ×1 / ×1.5 / ×2 / ×3 / BUST). Le multiplier
// s'accumule (additionne ou multiplie selon design — ici on cumule mult).
// A tout moment, le joueur peut STOP pour cash out le multiplier total
// accumule. Continuer = risque de tomber sur BUST (perd le multiplier).
//
// Decision = engagement = conversion. Skill perceived + tension.
//
// Fichier reste M7Plinko.tsx pour retrocompat saves (export name preserve).
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import { motion } from "framer-motion";
import { sfx } from "../lib/v3_sound";
import { pseudoTextStyle, pseudoPillStyle, pseudoAnimationClass, type V3LineStyleLike } from "../lib/v3_pseudo_style";
import { V3OfferPopup } from "./V3OfferPopup";
import { V3SocialProof } from "./V3SocialProof";
import { V3MagneticButton } from "./V3MagneticButton";
import { V3PseudoKeyframes } from "./V3PseudoKeyframes";
import { extendPalette } from "../lib/v3_palette";

export type M7PlinkoProps = {
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

// Pool de valeurs possibles. Plus de bons que de BUST → percu comme accessible.
type CardValue = { mult: number; label: string; kind: "win" | "bust" };
const POOL: CardValue[] = [
  { mult: 0.5, label: "+0.5x", kind: "win" },
  { mult: 1.0, label: "+1x",   kind: "win" },
  { mult: 1.0, label: "+1x",   kind: "win" },
  { mult: 1.5, label: "+1.5x", kind: "win" },
  { mult: 2.0, label: "+2x",   kind: "win" },
  { mult: 3.0, label: "+3x",   kind: "win" },
  { mult: 0,   label: "BUST",  kind: "bust" },
];

function pickValue(): CardValue {
  return POOL[Math.floor(Math.random() * POOL.length)];
}

type Phase = "idle" | "playing" | "busted" | "cashed";

export function M7Plinko({
  pseudo, profileImageUrl, depositAmount, bonusAmount, affiLink, theme, pseudoStyle,
}: M7PlinkoProps) {
  const P = extendPalette(theme, "#FFD700");
  const T = {
    accent: P.accent, accentLight: P.accentLight, accentAlt: P.accentAlt, accentHot: P.accentHot,
    accentGlow: P.glow, bgPage: P.bgPage, bgCard: P.bgCard,
  };

  const dep = depositAmount != null ? `${depositAmount}€` : "";
  const bon = bonusAmount != null ? `${bonusAmount}€` : "";
  const safeAffi = affiLink || "#";

  // 5 cards : valeurs fixees au mount (mais cachees) pour stabilite.
  const [cards, setCards] = React.useState<CardValue[]>(() => Array.from({ length: 5 }, pickValue));
  const [revealed, setRevealed] = React.useState<boolean[]>([false, false, false, false, false]);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [popupOpen, setPopupOpen] = React.useState(false);

  const revealCard = (idx: number) => {
    if (revealed[idx] || phase === "busted" || phase === "cashed") return;
    if (phase === "idle") setPhase("playing");
    const value = cards[idx];
    setRevealed((arr) => arr.map((r, i) => (i === idx ? true : r)));
    if (value.kind === "bust") {
      sfx.loss();
      setPhase("busted");
    } else {
      sfx.tick();
      // Si toutes les cards revelees sans bust → auto cash
      if (revealed.filter(Boolean).length + 1 === 5) {
        setPhase("cashed");
        sfx.win();
      }
    }
  };

  const cashOut = () => {
    if (phase !== "playing") return;
    setPhase("cashed");
    sfx.win();
  };

  const reset = () => {
    setCards(Array.from({ length: 5 }, pickValue));
    setRevealed([false, false, false, false, false]);
    setPhase("idle");
  };

  // Multiplier total accumule (sur les cards revealed qui ne sont pas BUST)
  const totalMult = revealed.reduce((acc, r, i) => {
    if (!r) return acc;
    const v = cards[i];
    return v.kind === "bust" ? 0 : acc + v.mult;
  }, 0);
  // Si bust : total = 0. Si cashed : on garde le total avant cash.
  const finalMult = phase === "busted" ? 0 : totalMult;
  const wonBonus = bonusAmount != null ? Math.round(bonusAmount * finalMult) : null;

  const onCta = (e: React.MouseEvent) => { e.preventDefault(); setPopupOpen(true); };

  const popupSteps = React.useMemo(() => ["Validation du score", "Préparation de l'offre", "Lien bonus prêt"], []);

  return (
    <div className="m7-root">
      <style>{`
        .m7-root{position:relative;min-height:100vh;padding:24px 18px 160px;
          background:
            radial-gradient(70% 50% at 0% 0%, ${T.accent}1f, transparent 65%),
            radial-gradient(60% 40% at 100% 0%, ${T.accentAlt}1a, transparent 70%),
            radial-gradient(80% 50% at 50% 100%, ${T.accentHot}14, transparent 75%),
            linear-gradient(180deg, ${T.bgPage}, ${T.bgCard} 70%, ${T.bgPage});
          font-family:'Inter','Space Grotesk',sans-serif;color:#fff;overflow:hidden}
        .m7-layer{position:relative;z-index:10;max-width:440px;margin:0 auto}

        .m7-header{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;margin-bottom:14px}
        .m7-avatar{width:64px;height:64px;border-radius:50%;overflow:hidden;border:2px solid ${T.accent};
          box-shadow:0 0 0 3px ${T.bgPage},0 6px 16px rgba(0,0,0,.45);background:${T.bgCard}}
        .m7-avatar img{width:100%;height:100%;object-fit:cover;display:block}
        .m7-label{font-size:.66rem;letter-spacing:.32em;text-transform:uppercase;opacity:.62;margin:6px 0 0}
        .m7-headline{margin:4px 0 0;font-size:clamp(1.5rem,5vw,1.95rem);font-weight:900;letter-spacing:-.02em;line-height:1.1}
        .m7-headline em{font-style:normal;color:${T.accent};text-shadow:0 0 18px ${T.accentGlow}}

        /* ─── Multiplier display (toujours visible) ─── */
        .m7-mult-box{margin:16px auto 0;padding:14px 18px;border-radius:16px;text-align:center;
          background:linear-gradient(160deg,${T.bgCard},${T.bgPage});
          border:1.5px solid ${T.accent}55;
          box-shadow:0 0 0 1px ${T.accent}22 inset,0 12px 30px ${T.accentGlow}66}
        .m7-mult-label{font-size:.66rem;letter-spacing:.28em;text-transform:uppercase;opacity:.7;margin:0;font-weight:700;color:${T.accent}}
        .m7-mult-val{margin:4px 0 0;font-size:clamp(2rem,7vw,2.6rem);font-weight:900;line-height:1;letter-spacing:-.04em;font-variant-numeric:tabular-nums;
          background:linear-gradient(180deg,#fff,${T.accent} 60%);
          -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;
          filter:drop-shadow(0 2px 14px ${T.accentGlow})}
        .m7-mult-val.busted{background:#ef4444;-webkit-background-clip:initial;background-clip:initial;-webkit-text-fill-color:#ef4444;color:#ef4444;filter:none}
        .m7-mult-bonus{margin:4px 0 0;font-size:.85rem;font-weight:700;opacity:.85}
        .m7-mult-bonus strong{color:${T.accent}}

        /* ─── Cards grid (5 cards en ligne) ─── */
        .m7-cards{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:18px auto 0;max-width:420px;perspective:1000px}
        .m7-card{position:relative;aspect-ratio:2/3;cursor:pointer;border:none;background:none;padding:0;
          transform-style:preserve-3d;transition:transform .5s cubic-bezier(.4,.7,.3,1.2)}
        .m7-card.revealed{transform:rotateY(180deg)}
        .m7-card-face{position:absolute;inset:0;border-radius:10px;backface-visibility:hidden;-webkit-backface-visibility:hidden;
          display:flex;align-items:center;justify-content:center;font-weight:900;text-align:center;
          box-shadow:0 4px 14px rgba(0,0,0,.5)}
        .m7-card-back{background:
            repeating-linear-gradient(45deg,${T.accent}66 0 6px,${T.accentLight}66 6px 12px),
            linear-gradient(135deg,${T.accent},${T.accentLight});
          border:1.5px solid ${T.accentLight};color:#1a0f08;font-size:1.5rem}
        .m7-card-back::after{content:"?";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
          font-family:'Bagel Fat One',cursive;font-size:2rem;color:#1a0f08;
          background:radial-gradient(circle,${T.accentLight} 0%,transparent 70%);
          border-radius:10px}
        .m7-card:not(.revealed):hover .m7-card-back{transform:translateY(-3px);transition:transform .15s}
        .m7-card-front{background:linear-gradient(160deg,${T.bgCard},${T.bgPage});
          border:2px solid ${T.accent};color:#fff;font-size:.95rem;
          transform:rotateY(180deg);
          text-shadow:0 0 14px ${T.accent}}
        .m7-card-front.bust{border-color:#ef4444;color:#ef4444;text-shadow:0 0 14px #ef4444;
          background:linear-gradient(160deg,#3a0a0a,${T.bgPage})}
        .m7-card-front.win{background:linear-gradient(160deg,${T.bgCard},${T.bgPage});
          box-shadow:inset 0 0 22px ${T.accentGlow}}

        /* ─── Actions ─── */
        .m7-actions{display:flex;gap:8px;margin:18px 0 0}
        .m7-action{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:18px;border-radius:14px;
          font-family:inherit;font-size:.95rem;font-weight:900;letter-spacing:.04em;text-decoration:none;cursor:pointer;border:none;
          text-shadow:0 1px 0 rgba(255,255,255,.3);transition:transform .12s}
        .m7-action.cash{background:linear-gradient(135deg,#22c55e,#86efac);color:#0a3320;
          box-shadow:0 0 36px rgba(34,197,94,.55),0 14px 30px rgba(34,197,94,.4),inset 0 1px 0 rgba(255,255,255,.5)}
        .m7-action.cta{background:linear-gradient(135deg,${T.accent},${T.accentLight});color:#000;
          box-shadow:0 0 36px ${T.accentGlow},0 14px 30px ${T.accent}66,inset 0 1px 0 rgba(255,255,255,.5);
          animation:m7-breath 2.6s ease-in-out infinite}
        .m7-action.replay{background:rgba(255,255,255,.08);color:#fff;text-shadow:none;border:1px solid rgba(255,255,255,.15)}
        .m7-action:active{transform:scale(.97)}

        .m7-cta-sub{margin:12px 0 0;text-align:center;font-size:.74rem;opacity:.7}

        @keyframes m7-breath{0%,100%{box-shadow:0 0 36px ${T.accentGlow},0 14px 30px ${T.accent}66,inset 0 1px 0 rgba(255,255,255,.5)}50%{box-shadow:0 0 56px ${T.accentLight},0 14px 30px ${T.accent}99,inset 0 1px 0 rgba(255,255,255,.6)}}
        @media (prefers-reduced-motion:reduce){.m7-card,.m7-action.cta{animation:none !important;transition:none !important}}
      `}</style>

      <div className="m7-layer">
        {(profileImageUrl || pseudo) ? (
          <div className="m7-header">
            {profileImageUrl ? <div className="m7-avatar"><img src={profileImageUrl} alt="" /></div> : null}
            {pseudo ? (
              <div className={pseudoAnimationClass(pseudoStyle)} style={{ ...pseudoPillStyle(T.accent), ...pseudoTextStyle(pseudoStyle, T.accent) }}>
                {pseudo}
              </div>
            ) : null}
          </div>
        ) : null}

        <p className="m7-label">Tente ta chance</p>
        <h2 className="m7-headline">
          {phase === "busted" ? <>💥 <em>BUST !</em></> :
           phase === "cashed" ? <>✨ <em>Cash out réussi</em></> :
           <>Retourne les cartes, <em>évite le BUST</em></>}
        </h2>

        {/* Multiplier accumule */}
        <div className="m7-mult-box">
          <p className="m7-mult-label">Multiplier accumulé</p>
          <div className={`m7-mult-val ${phase === "busted" ? "busted" : ""}`}>
            ×{finalMult.toFixed(1)}
          </div>
          {wonBonus != null && finalMult > 0 ? (
            <p className="m7-mult-bonus">Bonus = <strong>+{wonBonus}€</strong></p>
          ) : phase === "busted" ? (
            <p className="m7-mult-bonus" style={{ opacity: 0.6 }}>Tout perdu — réessaie</p>
          ) : (
            <p className="m7-mult-bonus" style={{ opacity: 0.6 }}>Retourne une carte pour commencer</p>
          )}
        </div>

        {/* Grid 5 cartes */}
        <div className="m7-cards">
          {cards.map((c, i) => {
            const isRevealed = revealed[i];
            return (
              <motion.button
                key={i}
                type="button"
                className={`m7-card ${isRevealed ? "revealed" : ""}`}
                onClick={() => revealCard(i)}
                whileTap={{ scale: 0.94 }}
                disabled={isRevealed || phase === "busted" || phase === "cashed"}
              >
                <div className="m7-card-face m7-card-back" />
                <div className={`m7-card-face m7-card-front ${c.kind === "bust" ? "bust" : "win"}`}>
                  {c.kind === "bust" ? "💥" : c.label}
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* Actions */}
        <div className="m7-actions">
          {phase === "idle" || phase === "playing" ? (
            <>
              {phase === "playing" && finalMult > 0 ? (
                <motion.button type="button" className="m7-action cash" onClick={cashOut} whileTap={{ scale: 0.96 }}>
                  💰 CASH OUT ×{finalMult.toFixed(1)}
                </motion.button>
              ) : (
                <div className="m7-action replay" style={{ opacity: 0.5, cursor: "default" }}>
                  Choisis une carte
                </div>
              )}
            </>
          ) : (
            <>
              <V3MagneticButton href={safeAffi} onClick={onCta} className="m7-action cta">
                🚀 RÉCLAMER {wonBonus != null && finalMult > 0 ? `+${wonBonus}€` : (bon ? `+${bon}` : "MON BONUS")}
              </V3MagneticButton>
              <button type="button" className="m7-action replay" onClick={reset}>↻</button>
            </>
          )}
        </div>

        <p className="m7-cta-sub">
          {phase === "playing" ? "Continue (×X) ou cash out tes gains. Une carte BUST = tout perdu." :
           phase === "cashed" ? `Bravo — Dépose ${dep || "10€"} pour réclamer ton bonus` :
           phase === "busted" ? "Pas de chance, rejoue ou réclame ton bonus standard" :
           "Sur 5 cartes : multiplier ou BUST. Multiplier × bonus de base."}
        </p>
      </div>

      <V3OfferPopup
        open={popupOpen}
        onClose={() => setPopupOpen(false)}
        theme={{ accent: T.accent, accentLight: T.accentLight, accentGlow: T.accentGlow, bgCard: T.bgCard }}
        score={finalMult > 0 ? `×${finalMult.toFixed(1)}` : (bon ? `+${bon}` : "Bonus")}
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
