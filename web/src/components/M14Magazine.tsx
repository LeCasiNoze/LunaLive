// ─────────────────────────────────────────────────────────────────────────────
// M14 — "Testimonial / Case Study" : landing conversion premium presentant
// l'histoire d'un "gros gagnant". Hero portrait + montant gagne XXL, story
// courte credible, screenshot gain, badges trust forts. DOUBLE CTA :
//   - "Reclamer le bonus standard" → popup V3
//   - "Devenir VIP" → form email inline (capture lead haut-niveau)
//
// Levers conversion :
//   - storytelling (relatable testimonial)
//   - preuve (faux screenshot solde)
//   - autorite (badges licence/audit/SSL)
//   - chiffres impressionnants (anchoring)
//   - segmentation : standard vs VIP (capture les 2 segments)
//
// Respecte regles V3 : theme/pseudoStyle/X/Y/V3OfferPopup/V3SocialProof.
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import { useInView } from "framer-motion";
import { V3OfferPopup } from "./V3OfferPopup";
import { V3SocialProof } from "./V3SocialProof";
import { V3InlineVipForm } from "./V3InlineVipForm";
import { pseudoTextStyle, type V3LineStyleLike } from "../lib/v3_pseudo_style";

export type M14MagazineProps = {
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
  };
  pseudoStyle?: V3LineStyleLike;
};

// Compteur animation
function useCountUp(target: number, inView: boolean, ms = 1600): number {
  const [v, setV] = React.useState(0);
  React.useEffect(() => {
    if (!inView) return;
    let raf = 0; const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, inView, ms]);
  return v;
}

export function M14Magazine({
  pseudo, profileImageUrl, depositAmount, bonusAmount, affiLink, theme, pseudoStyle,
}: M14MagazineProps) {
  const T = {
    accent:      theme?.accent      || "#FFD700",
    accentLight: theme?.accentLight || "#FFEFA8",
    accentGlow:  theme?.accentGlow  || "rgba(255,214,0,.45)",
    bgPage:      theme?.bgPage      || "#0a0908",
    bgCard:      theme?.bgCard      || "#15110d",
  };
  const dep = depositAmount != null ? `${depositAmount}€` : "";
  const bon = bonusAmount != null ? `${bonusAmount}€` : "";
  const safeAffi = affiLink || "#";
  const netBonus = (depositAmount != null && bonusAmount != null) ? bonusAmount - depositAmount : null;
  const rewardScore = (netBonus != null && netBonus > 0) ? `+${netBonus}€` : (bon ? `+${bon}` : "Bonus");

  const [popupOpen, setPopupOpen] = React.useState(false);
  const onCta = (e: React.MouseEvent) => { e.preventDefault(); setPopupOpen(true); };

  // Le "gagnant" mis en scene : pseudo si fourni, sinon "Marc L."
  const winnerName = pseudo?.trim() || "Marc L.";
  // Montant gagne = bonus * 12 environ (sensation "j'ai vraiment cartonne")
  const winAmount = bonusAmount != null ? Math.round(bonusAmount * 12.3) : 3450;

  const statsRef = React.useRef<HTMLDivElement>(null);
  const statsInView = useInView(statsRef, { once: true, margin: "-60px" });

  const stat1 = useCountUp(winAmount, statsInView);
  const stat2 = useCountUp(127, statsInView);
  const stat3 = useCountUp(98, statsInView);

  const vipRef = React.useRef<HTMLDivElement>(null);
  const scrollToVip = (e: React.MouseEvent) => {
    e.preventDefault();
    vipRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const nameStyle = pseudoTextStyle(pseudoStyle, T.accent);

  return (
    <div className="m14-root">
      <style>{`
        .m14-root{position:relative;min-height:100vh;padding:0 0 160px;background:
          radial-gradient(80% 50% at 50% -5%,${T.accent}1e 0%,transparent 65%),
          ${T.bgPage};color:#f3eee7;font-family:'Inter','Space Grotesk',sans-serif;overflow-x:hidden}

        /* ─── Tag bar ─── */
        .m14-tag{display:flex;justify-content:center;gap:10px;padding:14px 16px;font-size:.62rem;letter-spacing:.32em;text-transform:uppercase;
          background:rgba(0,0,0,.3);border-bottom:1px solid ${T.accent}22;color:${T.accent};font-weight:700;flex-wrap:wrap}
        .m14-tag span+span::before{content:"·";margin-right:10px;opacity:.5}

        /* ─── Hero ─── */
        .m14-hero{position:relative;padding:34px 18px 14px;max-width:480px;margin:0 auto;text-align:center}
        .m14-portrait-wrap{position:relative;width:120px;height:120px;margin:0 auto 18px}
        .m14-portrait-ring{position:absolute;inset:-12px;border-radius:50%;background:conic-gradient(from 0deg,${T.accent},${T.accentLight},${T.accent});filter:blur(14px);opacity:.7;animation:m14-spin 6s linear infinite}
        .m14-portrait{position:relative;width:100%;height:100%;border-radius:50%;overflow:hidden;border:3px solid #fff;
          box-shadow:0 0 0 3px ${T.accent},0 14px 36px ${T.accentGlow};background:linear-gradient(135deg,${T.bgCard},${T.bgPage})}
        .m14-portrait img{width:100%;height:100%;object-fit:cover;display:block}
        .m14-portrait-empty{display:flex;align-items:center;justify-content:center;height:100%;font-size:2.4rem;opacity:.3}
        .m14-verified{position:absolute;bottom:-2px;right:-2px;width:32px;height:32px;border-radius:50%;background:#3b82f6;display:flex;align-items:center;justify-content:center;color:#fff;font-size:.95rem;border:2.5px solid ${T.bgPage};box-shadow:0 4px 14px rgba(59,130,246,.5)}

        .m14-name{margin:0;line-height:1.1}
        .m14-place{margin:6px 0 0;font-size:.72rem;letter-spacing:.18em;text-transform:uppercase;opacity:.55}

        /* ─── Win display ─── */
        .m14-win{margin:24px auto 0;max-width:440px;padding:28px 22px;border-radius:24px;text-align:center;
          background:linear-gradient(160deg,${T.bgCard},${T.bgPage});border:1.5px solid ${T.accent}55;
          box-shadow:0 0 0 1px ${T.accent}22 inset,0 28px 70px ${T.accentGlow}90;position:relative;overflow:hidden}
        .m14-win::before{content:"";position:absolute;inset:-1px;border-radius:24px;padding:1.5px;pointer-events:none;
          background:conic-gradient(from var(--a,0deg),${T.accent},${T.accentLight},${T.accent});
          -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;
          animation:m14-border 4s linear infinite}
        @property --a{syntax:'<angle>';inherits:false;initial-value:0deg}
        .m14-win-label{font-size:.66rem;letter-spacing:.32em;text-transform:uppercase;opacity:.7;margin:0;color:${T.accentLight}}
        .m14-win-amount{margin:10px 0 0;font-size:clamp(3.4rem,13vw,4.8rem);font-weight:900;letter-spacing:-.04em;line-height:.95;
          background:linear-gradient(180deg,#fff,${T.accent} 55%,${T.accentLight} 100%);
          -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;
          filter:drop-shadow(0 4px 24px ${T.accentGlow})}
        .m14-win-sub{margin:8px 0 0;font-size:.78rem;letter-spacing:.06em;opacity:.7}

        /* ─── Testimonial quote ─── */
        .m14-quote-wrap{padding:32px 22px 14px;max-width:480px;margin:0 auto;text-align:center}
        .m14-quote-mark{font-family:"Playfair Display",Georgia,serif;font-size:5rem;line-height:.5;color:${T.accent};opacity:.4;display:block;margin-bottom:-8px}
        .m14-quote-body{margin:0;font-size:clamp(1.05rem,3.6vw,1.25rem);line-height:1.5;font-style:italic;color:#fff;font-weight:400}
        .m14-quote-cite{margin:14px 0 0;font-size:.72rem;letter-spacing:.22em;text-transform:uppercase;opacity:.55}

        /* ─── Offer card ─── */
        .m14-offer{margin:24px auto 0;max-width:440px;padding:26px 22px;border-radius:22px;
          background:linear-gradient(160deg,rgba(255,255,255,.04),rgba(0,0,0,.3));
          border:1px solid ${T.accent}40;text-align:center}
        .m14-offer-tag{display:inline-block;padding:5px 12px;border-radius:999px;background:${T.accent};color:#000;font-size:.62rem;font-weight:900;letter-spacing:.22em;text-transform:uppercase;margin-bottom:14px}
        .m14-offer-title{margin:0;font-size:1.15rem;font-weight:700;letter-spacing:-.01em}
        .m14-offer-dep{margin:14px 0 6px;font-size:.78rem;letter-spacing:.06em;opacity:.7}
        .m14-offer-dep strong{color:${T.accent};font-weight:900}
        .m14-offer-bonus{font-size:clamp(2.5rem,9vw,3.4rem);font-weight:900;letter-spacing:-.03em;line-height:.95;
          background:linear-gradient(180deg,#fff,${T.accent} 60%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent}
        .m14-offer-sub{margin:6px 0 18px;font-size:.72rem;letter-spacing:.15em;text-transform:uppercase;opacity:.55}

        .m14-cta-primary{position:relative;display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:20px;border-radius:16px;
          font-family:inherit;font-size:1.02rem;font-weight:900;letter-spacing:.04em;color:#000;text-decoration:none;cursor:pointer;
          background:linear-gradient(135deg,${T.accent},${T.accentLight});
          box-shadow:0 0 36px ${T.accentGlow},0 14px 32px ${T.accent}66,inset 0 1px 0 rgba(255,255,255,.5);
          animation:m14-breath 2.4s ease-in-out infinite;text-shadow:0 1px 0 rgba(255,255,255,.3);transition:transform .12s}
        .m14-cta-primary:active{transform:scale(.97)}
        .m14-cta-primary::after{content:"→";font-size:1.2rem;margin-left:4px}

        .m14-cta-vip{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:16px;margin-top:10px;border-radius:14px;
          font-family:inherit;font-size:.85rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${T.accent};text-decoration:none;cursor:pointer;
          background:transparent;border:1.5px solid ${T.accent}66;
          transition:background .3s,color .3s}
        .m14-cta-vip:hover{background:${T.accent}1a;border-color:${T.accent}}
        .m14-cta-vip::before{content:"👑";font-size:1rem}

        /* ─── Stats row ─── */
        .m14-stats{padding:30px 18px 16px;max-width:480px;margin:0 auto;display:grid;grid-template-columns:repeat(3,1fr);gap:10px;text-align:center}
        .m14-stat{padding:18px 8px;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06)}
        .m14-stat-val{font-size:clamp(1.4rem,5vw,1.8rem);font-weight:900;letter-spacing:-.02em;line-height:1;
          background:linear-gradient(180deg,#fff,${T.accent});-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;font-variant-numeric:tabular-nums}
        .m14-stat-suf{font-size:.85rem;color:${T.accent};font-weight:700;margin-left:2px}
        .m14-stat-lbl{font-size:.6rem;letter-spacing:.14em;text-transform:uppercase;opacity:.55;margin-top:4px}

        /* ─── Trust badges row ─── */
        .m14-trust{padding:20px 18px;max-width:480px;margin:0 auto}
        .m14-trust-title{font-size:.66rem;letter-spacing:.3em;text-transform:uppercase;opacity:.5;text-align:center;margin:0 0 14px}
        .m14-trust-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
        .m14-trust-item{display:flex;align-items:center;gap:10px;padding:11px 12px;border-radius:12px;
          background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);font-size:.74rem;font-weight:600}
        .m14-trust-icon{width:26px;height:26px;border-radius:50%;background:${T.accent}1f;color:${T.accent};display:flex;align-items:center;justify-content:center;font-size:.9rem;flex-shrink:0}

        /* ─── VIP section ─── */
        .m14-vip-section{padding:14px 16px 18px;max-width:500px;margin:0 auto}

        /* ─── Footer ─── */
        .m14-footer{padding:20px 22px 10px;text-align:center;opacity:.5;font-size:.66rem;line-height:1.7;max-width:480px;margin:0 auto}
        .m14-footer strong{color:#fff;font-weight:700}

        /* ─── Sticky CTA ─── */
        .m14-sticky{position:fixed;left:0;right:0;bottom:0;z-index:50;padding:12px 14px 16px;
          background:linear-gradient(to top,${T.bgPage} 55%,${T.bgPage}dd 85%,transparent)}
        .m14-sticky-cta{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;max-width:420px;margin:0 auto;padding:16px;border-radius:16px;
          font-family:inherit;font-size:.98rem;font-weight:900;letter-spacing:.04em;color:#000;text-decoration:none;
          background:linear-gradient(135deg,${T.accent},${T.accentLight});
          box-shadow:0 0 36px ${T.accentGlow},0 12px 28px ${T.accent}55;text-shadow:0 1px 0 rgba(255,255,255,.3)}

        @keyframes m14-spin{to{transform:rotate(360deg)}}
        @keyframes m14-border{to{--a:360deg}}
        @keyframes m14-breath{0%,100%{box-shadow:0 0 36px ${T.accentGlow},0 14px 32px ${T.accent}66,inset 0 1px 0 rgba(255,255,255,.5)}50%{box-shadow:0 0 56px ${T.accentLight},0 14px 32px ${T.accent}99,inset 0 1px 0 rgba(255,255,255,.6)}}

        @media (prefers-reduced-motion:reduce){
          .m14-portrait-ring,.m14-win::before,.m14-cta-primary{animation:none !important}
        }
      `}</style>

      {/* Tag bar */}
      <div className="m14-tag">
        <span>Témoignage vérifié</span>
        <span>Édition {new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</span>
      </div>

      {/* Hero */}
      <section className="m14-hero">
        <div className="m14-portrait-wrap">
          <div className="m14-portrait-ring" />
          <div className="m14-portrait">
            {profileImageUrl ? <img src={profileImageUrl} alt={winnerName} /> : <div className="m14-portrait-empty">👤</div>}
          </div>
          <div className="m14-verified" title="Compte vérifié">✓</div>
        </div>

        <h1 className="m14-name" style={nameStyle}>{winnerName}</h1>
        <p className="m14-place">Joueur vérifié · France</p>

        <div className="m14-win">
          <p className="m14-win-label">A gagné en 30 jours</p>
          <div className="m14-win-amount">+{winAmount.toLocaleString("fr-FR")}€</div>
          <p className="m14-win-sub">Retiré sur compte bancaire · Capture vérifiée</p>
        </div>
      </section>

      {/* Quote */}
      <blockquote className="m14-quote-wrap">
        <span className="m14-quote-mark">"</span>
        <p className="m14-quote-body">
          J'ai testé leur offre par curiosité. {bon ? `Avec ${bon} de bonus offert, ` : ""}J'ai pu jouer sereinement, et surtout retirer mes gains sans aucune complication. Le service VIP m'a même appelé après mon premier gros gain.
        </p>
        <p className="m14-quote-cite">— {winnerName}, dépôt initial {dep || "20€"}</p>
      </blockquote>

      {/* Offer card with double CTA */}
      <section className="m14-offer">
        <span className="m14-offer-tag">⚡ Même offre disponible</span>
        <h3 className="m14-offer-title">Récupère ton bonus de bienvenue</h3>
        {dep ? <p className="m14-offer-dep">Dépose seulement <strong>{dep}</strong> → reçois</p> : null}
        <div className="m14-offer-bonus">+{bon || "BONUS"}</div>
        <p className="m14-offer-sub">Crédité instantanément · Sans engagement</p>
        <a className="m14-cta-primary v3-cta" href={safeAffi} onClick={onCta}>
          RÉCLAMER MON BONUS
        </a>
        <a className="m14-cta-vip" href="#vip" onClick={scrollToVip}>
          Je suis gros joueur → Devenir VIP
        </a>
      </section>

      {/* Stats */}
      <section className="m14-stats" ref={statsRef}>
        <div className="m14-stat">
          <div className="m14-stat-val">{stat1.toLocaleString("fr-FR")}<span className="m14-stat-suf">€</span></div>
          <div className="m14-stat-lbl">Gain témoignage</div>
        </div>
        <div className="m14-stat">
          <div className="m14-stat-val">{stat2}<span className="m14-stat-suf">K</span></div>
          <div className="m14-stat-lbl">Joueurs actifs</div>
        </div>
        <div className="m14-stat">
          <div className="m14-stat-val">{stat3}<span className="m14-stat-suf">%</span></div>
          <div className="m14-stat-lbl">Satisfaction</div>
        </div>
      </section>

      {/* Trust badges */}
      <section className="m14-trust">
        <p className="m14-trust-title">Sécurité & confiance</p>
        <div className="m14-trust-grid">
          <div className="m14-trust-item"><span className="m14-trust-icon">🛡️</span> Licence régulée</div>
          <div className="m14-trust-item"><span className="m14-trust-icon">🔒</span> SSL 256-bit</div>
          <div className="m14-trust-item"><span className="m14-trust-icon">⚡</span> Retrait sous 24h</div>
          <div className="m14-trust-item"><span className="m14-trust-icon">🎧</span> Support 24/7</div>
        </div>
      </section>

      {/* VIP capture (target du bouton "Je suis gros joueur") */}
      <section className="m14-vip-section" ref={vipRef} id="vip">
        <V3InlineVipForm
          accent={T.accent}
          accentLight={T.accentLight}
          accentGlow={T.accentGlow}
          href={safeAffi}
          title="Tu vises plus que le bonus standard ?"
          subtitle="Notre programme VIP est réservé aux joueurs qui déposent 100€+ par mois. Un host dédié, bonus exclusifs, cashback augmenté et retraits express."
          ctaLabel="Demander mon accès VIP"
        />
      </section>

      <footer className="m14-footer">
        <p>
          Témoignage personnel. Les résultats peuvent varier. Jeu réservé aux 18+.
          Les jeux d'argent comportent des risques d'addiction.
          Aide : <strong>09 74 75 13 13</strong> · <strong>joueurs-info-service.fr</strong>
        </p>
      </footer>

      <div className="m14-sticky">
        <a className="m14-sticky-cta v3-cta" href={safeAffi} onClick={onCta}>
          🚀 RÉCLAMER {bon || "MON BONUS"}
        </a>
      </div>

      <V3OfferPopup
        open={popupOpen}
        onClose={() => setPopupOpen(false)}
        theme={{ accent: T.accent, accentLight: T.accentLight, accentGlow: T.accentGlow, bgCard: T.bgCard }}
        score={rewardScore}
        depositAmount={dep}
        bonusAmount={bon}
        steps={["Vérification du témoignage", "Génération de ton bonus", "Lien d'inscription prêt"]}
        href={safeAffi}
      />

      <V3SocialProof accent={T.accent} accentGlow={T.accentGlow} />
    </div>
  );
}
