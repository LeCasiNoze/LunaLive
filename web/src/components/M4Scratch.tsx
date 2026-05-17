// ─────────────────────────────────────────────────────────────────────────────
// M4 — "Crack the Vault" (concept original V3, retire de l'ancien M4 Scratch).
// Un coffre dore central protege par 3 cadenas. Tap chaque cadenas → animation
// crack (rotation + opacity faded). Une fois les 3 casses → coffre s'ouvre,
// burst de particules or, montant bonus revele, CTA "RECLAMER".
//
// Engagement : 3 micro-actions (chacune satisfaisante via crack + sound)
// avant le reveal = effet "deserved" → conversion plus forte qu'un simple
// click. Reset possible apres reveal.
//
// Fichier reste M4Scratch.tsx pour retrocompat saves (export name preserve).
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

  const [cracked, setCracked] = React.useState<boolean[]>([false, false, false]);
  const allCracked = cracked.every(Boolean);
  const [opened, setOpened] = React.useState(false);
  const [popupOpen, setPopupOpen] = React.useState(false);

  // Auto-open du coffre 500ms apres le 3e cadenas casse
  React.useEffect(() => {
    if (!allCracked || opened) return;
    const id = window.setTimeout(() => {
      setOpened(true);
      sfx.win();
    }, 500);
    return () => window.clearTimeout(id);
  }, [allCracked, opened]);

  const crackLock = (idx: number) => {
    if (cracked[idx]) return;
    sfx.tick();
    setCracked((arr) => arr.map((c, i) => (i === idx ? true : c)));
  };

  const reset = () => {
    setCracked([false, false, false]);
    setOpened(false);
  };

  const onCta = (e: React.MouseEvent) => { e.preventDefault(); setPopupOpen(true); };

  return (
    <div className="m4-root">
      <style>{`
        .m4-root{position:relative;min-height:100vh;padding:24px 18px 160px;
          background:
            radial-gradient(70% 50% at 0% 0%, ${T.accent}1f, transparent 65%),
            radial-gradient(60% 40% at 100% 0%, ${T.accentAlt}1a, transparent 70%),
            radial-gradient(80% 50% at 50% 100%, ${T.accentHot}14, transparent 75%),
            linear-gradient(180deg, ${T.bgPage}, ${T.bgCard} 70%, ${T.bgPage});
          font-family:'Inter','Space Grotesk',sans-serif;color:#fff;overflow:hidden}
        .m4-layer{position:relative;z-index:10;max-width:440px;margin:0 auto}

        .m4-header{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;margin-bottom:18px}
        .m4-avatar{width:64px;height:64px;border-radius:50%;overflow:hidden;border:2px solid ${T.accent};
          box-shadow:0 0 0 3px ${T.bgPage},0 6px 16px rgba(0,0,0,.45);background:${T.bgCard}}
        .m4-avatar img{width:100%;height:100%;object-fit:cover;display:block}
        .m4-label{font-size:.66rem;letter-spacing:.32em;text-transform:uppercase;opacity:.62;margin:8px 0 0}
        .m4-headline{margin:4px 0 0;font-size:clamp(1.5rem,5vw,1.95rem);font-weight:900;letter-spacing:-.02em;line-height:1.1}
        .m4-headline em{font-style:normal;color:${T.accent};text-shadow:0 0 18px ${T.accentGlow}}

        /* ─── Coffre ─── */
        .m4-vault-wrap{position:relative;margin:24px auto 0;width:280px;height:280px;display:flex;align-items:center;justify-content:center;isolation:isolate}
        .m4-vault-halo{position:absolute;inset:-10%;border-radius:50%;
          background:radial-gradient(circle,${T.accentGlow} 0%,transparent 60%);
          filter:blur(20px);animation:m4-halo-pulse 2.8s ease-in-out infinite;z-index:0}
        .m4-vault{position:relative;z-index:2;width:200px;height:200px;border-radius:20px;
          background:linear-gradient(160deg,${T.accent},${T.accentLight} 50%,#8a6724);
          border:3px solid #1a0f08;
          box-shadow:
            inset 0 4px 0 rgba(255,255,255,.4),
            inset 0 -4px 8px rgba(0,0,0,.4),
            0 18px 50px rgba(0,0,0,.5),
            0 0 0 4px ${T.accentLight}80,
            0 0 40px ${T.accentGlow};
          display:flex;align-items:center;justify-content:center;
          transition:transform .3s cubic-bezier(.2,.7,.2,1)}
        .m4-vault.opened{animation:m4-vault-open .8s cubic-bezier(.2,.7,.2,1) both}
        .m4-vault-handle{position:absolute;width:50px;height:50px;border-radius:50%;
          background:linear-gradient(135deg,#1a0f08,#000);border:3px solid ${T.accentLight};
          box-shadow:inset 0 2px 0 rgba(255,255,255,.2),0 4px 12px rgba(0,0,0,.5);
          display:flex;align-items:center;justify-content:center;
          color:${T.accent};font-size:1.4rem}
        .m4-vault.opened .m4-vault-handle{animation:m4-handle-spin .5s linear both}
        .m4-vault-amount{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:0;pointer-events:none;text-align:center;padding:14px}
        .m4-vault.opened .m4-vault-amount{animation:m4-amount-reveal .6s .3s cubic-bezier(.2,.7,.2,1) both}
        .m4-vault-amount-label{font-size:.6rem;letter-spacing:.3em;opacity:.85;font-weight:700;color:#1a0f08}
        .m4-vault-amount-val{margin-top:4px;font-family:'Bagel Fat One',cursive;font-size:2.4rem;line-height:1;color:#1a0f08;
          text-shadow:0 2px 0 ${T.accentLight}}

        /* ─── Cadenas ─── */
        .m4-lock{position:absolute;z-index:3;width:64px;height:64px;border:none;background:none;cursor:pointer;padding:0;
          display:flex;align-items:center;justify-content:center;
          filter:drop-shadow(0 6px 14px rgba(0,0,0,.6));
          transition:transform .15s ease}
        .m4-lock:not(.cracked):hover{transform:scale(1.08)}
        .m4-lock:not(.cracked):active{transform:scale(.92)}
        .m4-lock-1{top:-12px;left:50%;transform:translateX(-50%)}
        .m4-lock-2{bottom:30px;left:-12px}
        .m4-lock-3{bottom:30px;right:-12px}
        .m4-lock svg{width:100%;height:100%}
        .m4-lock.cracked{animation:m4-lock-crack .5s cubic-bezier(.4,1.4,.6,1) both;pointer-events:none}

        /* ─── Particules (revealed) ─── */
        .m4-particle{position:absolute;width:8px;height:8px;border-radius:50%;background:${T.accent};
          box-shadow:0 0 12px ${T.accent};pointer-events:none;z-index:5;opacity:0}
        .m4-vault.opened ~ .m4-particles .m4-particle{animation:m4-burst 1.2s cubic-bezier(.2,.7,.2,1) both}
        .m4-particle:nth-child(1){--dx:80px;--dy:-90px;animation-delay:.1s}
        .m4-particle:nth-child(2){--dx:-90px;--dy:-80px;animation-delay:.15s;background:${T.accentLight};box-shadow:0 0 12px ${T.accentLight}}
        .m4-particle:nth-child(3){--dx:100px;--dy:60px;animation-delay:.2s;background:${T.accentHot};box-shadow:0 0 12px ${T.accentHot}}
        .m4-particle:nth-child(4){--dx:-80px;--dy:80px;animation-delay:.25s}
        .m4-particle:nth-child(5){--dx:120px;--dy:-30px;animation-delay:.3s;background:${T.accentLight};box-shadow:0 0 12px ${T.accentLight}}
        .m4-particle:nth-child(6){--dx:-120px;--dy:20px;animation-delay:.35s;background:${T.accentHot};box-shadow:0 0 12px ${T.accentHot}}
        .m4-particle:nth-child(7){--dx:50px;--dy:120px;animation-delay:.4s}
        .m4-particle:nth-child(8){--dx:-50px;--dy:-120px;animation-delay:.45s}

        /* ─── Status / CTA ─── */
        .m4-status{margin:18px 0 0;text-align:center;font-size:.85rem;font-weight:700;opacity:.85;min-height:24px}
        .m4-progress{display:flex;justify-content:center;gap:6px;margin:10px 0 0}
        .m4-progress-dot{width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,.15);border:1.5px solid rgba(255,255,255,.3);transition:background .3s,border-color .3s,box-shadow .3s}
        .m4-progress-dot.done{background:${T.accent};border-color:${T.accentLight};box-shadow:0 0 10px ${T.accentGlow}}

        .m4-cta{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:20px;margin-top:18px;border-radius:16px;
          font-family:inherit;font-size:1.05rem;font-weight:900;letter-spacing:.04em;color:#000;text-decoration:none;cursor:pointer;border:none;
          background:linear-gradient(135deg,${T.accent},${T.accentLight});
          box-shadow:0 0 36px ${T.accentGlow},0 14px 30px ${T.accent}66,inset 0 1px 0 rgba(255,255,255,.5);
          text-shadow:0 1px 0 rgba(255,255,255,.3);transition:transform .12s;animation:m4-breath 2.6s ease-in-out infinite}
        .m4-cta::after{content:"→";font-size:1.3rem;margin-left:4px}
        .m4-cta:active{transform:scale(.97)}
        .m4-replay{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:14px;margin-top:10px;border-radius:14px;
          font:inherit;font-size:.82rem;font-weight:700;color:#fff;text-decoration:none;cursor:pointer;
          background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);opacity:.7;transition:opacity .2s}
        .m4-replay:hover{opacity:1}

        .m4-cta-sub{margin:10px 0 0;font-size:.74rem;text-align:center;opacity:.7}

        @keyframes m4-halo-pulse{0%,100%{opacity:.7;transform:scale(1)}50%{opacity:1;transform:scale(1.1)}}
        @keyframes m4-lock-crack{
          0%{transform:rotate(0) scale(1);opacity:1}
          40%{transform:rotate(-20deg) scale(1.15);opacity:1}
          100%{transform:rotate(60deg) scale(.3);opacity:0}
        }
        @keyframes m4-vault-open{
          0%{transform:scale(1) rotate(0)}
          30%{transform:scale(1.08) rotate(-3deg)}
          60%{transform:scale(1.04) rotate(2deg)}
          100%{transform:scale(1.05) rotate(0)}
        }
        @keyframes m4-handle-spin{from{transform:rotate(0)}to{transform:rotate(180deg)}}
        @keyframes m4-amount-reveal{
          0%{opacity:0;transform:scale(.6)}
          60%{opacity:1;transform:scale(1.1)}
          100%{opacity:1;transform:scale(1)}
        }
        @keyframes m4-burst{
          0%{opacity:1;transform:translate(0,0) scale(1)}
          100%{opacity:0;transform:translate(var(--dx),var(--dy)) scale(.2)}
        }
        @keyframes m4-breath{0%,100%{box-shadow:0 0 36px ${T.accentGlow},0 14px 30px ${T.accent}66,inset 0 1px 0 rgba(255,255,255,.5)}50%{box-shadow:0 0 56px ${T.accentLight},0 14px 30px ${T.accent}99,inset 0 1px 0 rgba(255,255,255,.6)}}

        @media (prefers-reduced-motion:reduce){
          .m4-vault-halo,.m4-cta{animation:none !important}
        }
      `}</style>

      <div className="m4-layer">
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

        <p className="m4-label">Forge ta clé</p>
        <h2 className="m4-headline">
          {opened ? <>Coffre <em>déverrouillé !</em></> : <>Casse les <em>3 cadenas</em></>}
        </h2>

        <div className="m4-vault-wrap">
          <div className="m4-vault-halo" />
          <div className={`m4-vault ${opened ? "opened" : ""}`}>
            <div className="m4-vault-handle">{opened ? "✓" : "🔒"}</div>
            <div className="m4-vault-amount">
              <div className="m4-vault-amount-label">+BONUS</div>
              <div className="m4-vault-amount-val">{bon || "100%"}</div>
            </div>
          </div>

          {!opened ? [0, 1, 2].map((i) => (
            <motion.button
              key={i}
              type="button"
              className={`m4-lock m4-lock-${i + 1} ${cracked[i] ? "cracked" : ""}`}
              onClick={() => crackLock(i)}
              aria-label={`Cadenas ${i + 1}`}
              whileTap={{ scale: 0.9 }}
            >
              <svg viewBox="0 0 64 64" fill="none">
                <defs>
                  <linearGradient id={`lockGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={T.accentLight} />
                    <stop offset="50%" stopColor={T.accent} />
                    <stop offset="100%" stopColor="#5a4015" />
                  </linearGradient>
                </defs>
                {/* Anse */}
                <path d="M20 30 L20 22 a12 12 0 0 1 24 0 L44 30" stroke={`url(#lockGrad${i})`} strokeWidth="6" strokeLinecap="round" fill="none" />
                {/* Corps */}
                <rect x="14" y="30" width="36" height="26" rx="5" fill={`url(#lockGrad${i})`} stroke="#1a0f08" strokeWidth="2" />
                {/* Trou de serrure */}
                <circle cx="32" cy="40" r="3" fill="#1a0f08" />
                <rect x="30.5" y="42" width="3" height="7" rx="1" fill="#1a0f08" />
              </svg>
            </motion.button>
          )) : null}

          {/* Particules burst au open */}
          <div className="m4-particles" aria-hidden>
            {Array.from({ length: 8 }).map((_, i) => (
              <span key={i} className="m4-particle"
                style={{ left: "50%", top: "50%", marginLeft: "-4px", marginTop: "-4px" }}
              />
            ))}
          </div>
        </div>

        <div className="m4-progress">
          {cracked.map((c, i) => <div key={i} className={`m4-progress-dot ${c ? "done" : ""}`} />)}
        </div>

        <div className="m4-status">
          {!allCracked && !opened ? <span>{cracked.filter(Boolean).length} / 3 cadenas brisés</span> : null}
          {opened ? <span style={{ color: T.accent }}>✨ {bon ? `+${bon} bonus déverrouillé` : "Bonus 100% déverrouillé"}</span> : null}
        </div>

        {opened ? (
          <>
            <V3MagneticButton href={safeAffi} onClick={onCta} className="m4-cta v3-cta">
              🚀 RÉCLAMER {bon || "MON BONUS"}
            </V3MagneticButton>
            <button type="button" className="m4-replay" onClick={reset}>↻ Rejouer</button>
            <p className="m4-cta-sub">Dépose {dep || "10€"} · Crédit instantané · 30s</p>
          </>
        ) : (
          <p className="m4-cta-sub">Tape sur chaque cadenas pour le briser. Une fois les 3 cassés, le coffre s'ouvre.</p>
        )}
      </div>

      <V3OfferPopup
        open={popupOpen}
        onClose={() => setPopupOpen(false)}
        theme={{ accent: T.accent, accentLight: T.accentLight, accentGlow: T.accentGlow, bgCard: T.bgCard }}
        score={bon ? `+${bon}` : "Bonus"}
        depositAmount={dep}
        bonusAmount={bon}
        steps={["Validation du coffre", "Préparation du bonus", "Lien d'inscription prêt"]}
        href={safeAffi}
      />

      <V3SocialProof bonusAmount={bon} accent={T.accent} accentGlow={T.accentGlow} />
      <V3PseudoKeyframes />
    </div>
  );
}
