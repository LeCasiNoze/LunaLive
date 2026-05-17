// ─────────────────────────────────────────────────────────────────────────────
// M14 — "Magazine Cover" : style editorial luxe (Vogue / GQ / Numero).
// Masthead serif geant, hero pleine page avec overlay typo, sommaire numerote,
// citations, section "L'OFFRE DU MOIS" cadrée. Aesthetic chic, premium,
// editorial. Conversion via CTA "OUVRIR L'EDITION".
//
// Respecte regles V3 : theme/pseudoStyle/X/Y/V3OfferPopup/V3SocialProof.
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { V3OfferPopup } from "./V3OfferPopup";
import { V3SocialProof } from "./V3SocialProof";
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

export function M14Magazine({
  pseudo, profileImageUrl, depositAmount, bonusAmount, affiLink, theme, pseudoStyle,
}: M14MagazineProps) {
  const T = {
    accent:      theme?.accent      || "#FFD700",
    accentLight: theme?.accentLight || "#FFEFA8",
    accentGlow:  theme?.accentGlow  || "rgba(255,214,0,.4)",
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

  const rootRef = React.useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: rootRef, offset: ["start start", "end start"] });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, -120]);
  const heroScale = useTransform(scrollYProgress, [0, 1], [1, 1.15]);

  const issueMeta = React.useMemo(() => {
    const m = new Date();
    const month = m.toLocaleDateString("fr-FR", { month: "long" }).toUpperCase();
    return { month, year: m.getFullYear(), issue: `N°${String((m.getMonth()+1)*7).padStart(2,"0")}` };
  }, []);

  const nameStyle = pseudoTextStyle(pseudoStyle, T.accent);

  return (
    <div className="m14-root" ref={rootRef}>
      <style>{`
        .m14-root{position:relative;min-height:100vh;background:${T.bgPage};color:#f3eee7;font-family:"Inter",sans-serif;padding-bottom:140px;overflow-x:hidden}
        .m14-serif{font-family:"Playfair Display","DM Serif Display","Georgia",serif}

        /* ─── Top bar ─── */
        .m14-topbar{display:flex;justify-content:space-between;align-items:center;padding:14px 22px;font-size:.66rem;letter-spacing:.32em;text-transform:uppercase;color:${T.accent};opacity:.85;border-bottom:1px solid ${T.accent}22}
        .m14-topbar .m14-issue{display:flex;gap:14px}
        .m14-topbar .m14-issue span+span::before{content:"·";margin-right:14px;opacity:.5}

        /* ─── Masthead ─── */
        .m14-masthead{text-align:center;padding:34px 22px 18px}
        .m14-tagline{font-size:.62rem;letter-spacing:.5em;text-transform:uppercase;opacity:.65;margin:0 0 8px}
        .m14-title{margin:0;line-height:.85;font-size:clamp(4rem,16vw,7rem);font-weight:900;letter-spacing:-.04em;
          background:linear-gradient(180deg,${T.accentLight} 0%,${T.accent} 60%,#8a6724 100%);
          -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;
          filter:drop-shadow(0 4px 24px ${T.accentGlow})}
        .m14-rule{display:flex;align-items:center;gap:14px;max-width:280px;margin:18px auto 0;font-size:.6rem;letter-spacing:.32em;text-transform:uppercase;opacity:.5}
        .m14-rule::before,.m14-rule::after{content:"";flex:1;height:1px;background:currentColor;opacity:.4}

        /* ─── Hero photo ─── */
        .m14-hero{position:relative;width:100%;max-width:520px;margin:0 auto;aspect-ratio:3/4;overflow:hidden;background:linear-gradient(135deg,${T.bgCard},${T.bgPage})}
        .m14-hero-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;will-change:transform}
        .m14-hero-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:5rem;opacity:.2;color:${T.accent}}
        .m14-hero-grad{position:absolute;inset:0;pointer-events:none;background:linear-gradient(to top,${T.bgPage} 0%,${T.bgPage}70 40%,transparent 70%)}
        .m14-hero-overlay{position:absolute;left:0;right:0;bottom:0;padding:40px 24px 28px;text-align:center;pointer-events:none}
        .m14-hero-issue{font-size:.6rem;letter-spacing:.4em;text-transform:uppercase;opacity:.7;margin:0 0 10px;color:${T.accentLight}}
        .m14-hero-name{margin:0;font-size:clamp(2rem,7vw,3rem);line-height:.95;font-weight:400;letter-spacing:-.02em;font-style:italic;color:#fff;text-shadow:0 4px 24px rgba(0,0,0,.5)}
        .m14-hero-sub{margin:8px 0 0;font-size:.7rem;letter-spacing:.3em;text-transform:uppercase;color:${T.accent};opacity:.85}

        /* ─── Pull quote ─── */
        .m14-quote{position:relative;max-width:480px;margin:60px auto 50px;padding:0 32px;text-align:center}
        .m14-quote-mark{position:absolute;top:-20px;left:50%;transform:translateX(-50%);font-size:6rem;line-height:.5;color:${T.accent};opacity:.35;font-family:"Playfair Display",serif}
        .m14-quote-body{font-size:clamp(1.3rem,4vw,1.8rem);line-height:1.3;font-style:italic;color:#fff;letter-spacing:-.01em;margin:0}
        .m14-quote-cite{margin:18px 0 0;font-size:.65rem;letter-spacing:.32em;text-transform:uppercase;opacity:.6}

        /* ─── Sections numerotees (sommaire) ─── */
        .m14-toc{max-width:520px;margin:0 auto;padding:0 22px}
        .m14-toc-title{text-align:center;font-size:.66rem;letter-spacing:.42em;text-transform:uppercase;opacity:.55;margin:0 0 24px}
        .m14-toc-item{display:grid;grid-template-columns:42px 1fr auto;align-items:baseline;gap:18px;padding:18px 0;border-top:1px solid ${T.accent}22}
        .m14-toc-item:last-child{border-bottom:1px solid ${T.accent}22}
        .m14-toc-num{font-size:.85rem;letter-spacing:.18em;color:${T.accent};opacity:.7;font-weight:700}
        .m14-toc-name{font-size:1.15rem;font-weight:400;letter-spacing:-.01em;color:#fff}
        .m14-toc-page{font-size:.7rem;letter-spacing:.22em;text-transform:uppercase;opacity:.5;color:${T.accent}}

        /* ─── Offer card ─── */
        .m14-offer-wrap{max-width:520px;margin:48px auto;padding:0 22px}
        .m14-offer{position:relative;padding:36px 28px;border:1px solid ${T.accent}55;background:linear-gradient(180deg,${T.bgCard},${T.bgPage});text-align:center;
          box-shadow:0 0 0 1px ${T.accent}18 inset, 0 30px 80px rgba(0,0,0,.6), 0 0 60px ${T.accentGlow}40}
        .m14-offer::before,.m14-offer::after{content:"";position:absolute;width:24px;height:24px;border:1px solid ${T.accent}}
        .m14-offer::before{top:-1px;left:-1px;border-right:none;border-bottom:none}
        .m14-offer::after{bottom:-1px;right:-1px;border-left:none;border-top:none}
        .m14-offer-tag{font-size:.62rem;letter-spacing:.42em;text-transform:uppercase;opacity:.75;color:${T.accent};margin:0 0 14px}
        .m14-offer-title{margin:0;font-size:clamp(2rem,7vw,2.8rem);line-height:1;font-weight:900;letter-spacing:-.03em;
          background:linear-gradient(180deg,${T.accentLight},${T.accent} 70%);
          -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent}
        .m14-offer-dep{margin:14px 0 0;font-size:.78rem;letter-spacing:.22em;text-transform:uppercase;opacity:.7}
        .m14-offer-prize{margin:16px 0 0;font-size:clamp(3rem,10vw,4.5rem);line-height:.9;font-weight:900;letter-spacing:-.04em;
          background:linear-gradient(180deg,#fff,${T.accent} 70%);
          -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;
          filter:drop-shadow(0 4px 30px ${T.accentGlow})}
        .m14-offer-sub{margin:8px 0 26px;font-size:.7rem;letter-spacing:.22em;text-transform:uppercase;opacity:.55}

        .m14-cta{display:inline-flex;align-items:center;justify-content:center;gap:12px;width:100%;padding:18px 28px;border-radius:0;
          background:transparent;border:1.5px solid ${T.accent};color:${T.accent};font-family:"Inter",sans-serif;font-size:.78rem;font-weight:700;letter-spacing:.32em;text-transform:uppercase;text-decoration:none;cursor:pointer;
          transition:background .3s,color .3s,box-shadow .3s}
        .m14-cta:hover{background:${T.accent};color:#000;box-shadow:0 0 40px ${T.accentGlow}}
        .m14-cta::after{content:"→";font-size:1rem}

        /* ─── Editor footer ─── */
        .m14-byline{text-align:center;padding:30px 22px 10px;max-width:520px;margin:0 auto}
        .m14-byline-label{font-size:.6rem;letter-spacing:.4em;text-transform:uppercase;opacity:.5;margin:0 0 8px}
        .m14-byline-name{margin:0;font-size:1.4rem;line-height:1.1;font-weight:400;font-style:italic;color:#fff}

        /* ─── Sticky mobile ─── */
        .m14-sticky{position:fixed;left:0;right:0;bottom:0;z-index:50;padding:14px 16px 18px;
          background:linear-gradient(to top,${T.bgPage} 50%,${T.bgPage}dd 85%,transparent)}
        .m14-sticky-cta{display:flex;align-items:center;justify-content:center;width:100%;max-width:420px;margin:0 auto;padding:17px;
          background:${T.accent};color:#000;font-family:"Inter",sans-serif;font-size:.82rem;font-weight:700;letter-spacing:.28em;text-transform:uppercase;text-decoration:none;
          box-shadow:0 0 36px ${T.accentGlow},0 12px 28px ${T.accent}55;border:1.5px solid ${T.accent};border-radius:0}

        .m14-footer{padding:20px 22px 14px;text-align:center;opacity:.45;font-size:.66rem;line-height:1.7;max-width:520px;margin:0 auto}
        .m14-footer strong{color:#fff;font-weight:600}

        @media (prefers-reduced-motion:reduce){
          .m14-hero-img{transform:none !important}
        }
      `}</style>

      {/* Top bar */}
      <div className="m14-topbar">
        <span>{issueMeta.issue}</span>
        <div className="m14-issue">
          <span>{issueMeta.month} {issueMeta.year}</span>
          <span>Édition Numérique</span>
        </div>
      </div>

      {/* Masthead */}
      <div className="m14-masthead">
        <p className="m14-tagline">Le Magazine du Streaming Casino</p>
        <h1 className="m14-title m14-serif">LUNA</h1>
        <div className="m14-rule">L'édition · Numéro spécial</div>
      </div>

      {/* Hero photo */}
      <div className="m14-hero">
        {profileImageUrl ? (
          <motion.img className="m14-hero-img" src={profileImageUrl} alt={pseudo || ""} style={{ y: heroY, scale: heroScale }} />
        ) : (
          <div className="m14-hero-empty">◆</div>
        )}
        <div className="m14-hero-grad" />
        <div className="m14-hero-overlay">
          <p className="m14-hero-issue">Couverture · {issueMeta.month}</p>
          <h2 className="m14-hero-name m14-serif" style={nameStyle}>{pseudo || "L'Invité"}</h2>
          <p className="m14-hero-sub">Interview exclusive</p>
        </div>
      </div>

      {/* Pull quote */}
      <blockquote className="m14-quote">
        <span className="m14-quote-mark m14-serif">«</span>
        <p className="m14-quote-body m14-serif">
          J'ai testé leur offre. {bon ? `Un bonus de ${bon}` : "Un bonus exceptionnel"} crédité en quelques secondes — sans aucune mauvaise surprise.
        </p>
        <p className="m14-quote-cite">— {pseudo || "Le streamer"}, pour Luna Magazine</p>
      </blockquote>

      {/* Sommaire numerote */}
      <nav className="m14-toc">
        <p className="m14-toc-title">Sommaire de l'édition</p>
        <div className="m14-toc-item">
          <div className="m14-toc-num">01</div>
          <div className="m14-toc-name m14-serif">L'offre du mois</div>
          <div className="m14-toc-page">p.04</div>
        </div>
        <div className="m14-toc-item">
          <div className="m14-toc-num">02</div>
          <div className="m14-toc-name m14-serif">Les chiffres de la semaine</div>
          <div className="m14-toc-page">p.12</div>
        </div>
        <div className="m14-toc-item">
          <div className="m14-toc-num">03</div>
          <div className="m14-toc-name m14-serif">L'interview</div>
          <div className="m14-toc-page">p.18</div>
        </div>
      </nav>

      {/* Offer card */}
      <section className="m14-offer-wrap">
        <div className="m14-offer">
          <p className="m14-offer-tag">L'offre du mois — Article 01</p>
          <h3 className="m14-offer-title m14-serif">Bonus Exclusif</h3>
          {dep ? <p className="m14-offer-dep">Dépose seulement {dep}</p> : null}
          <div className="m14-offer-prize m14-serif">{bon || "BONUS"}</div>
          <p className="m14-offer-sub">+ Free spins inclus · Crédité instantanément</p>
          <a className="m14-cta v3-cta" href={safeAffi} onClick={onCta}>
            Ouvrir l'édition
          </a>
        </div>
      </section>

      {/* Byline */}
      <div className="m14-byline">
        <p className="m14-byline-label">En couverture</p>
        <p className="m14-byline-name m14-serif">{pseudo || "Le streamer"}</p>
      </div>

      <footer className="m14-footer">
        <p>
          Jeu réservé aux 18+. Les jeux d'argent comportent des risques d'addiction.
          Aide : <strong>09 74 75 13 13</strong> · <strong>joueurs-info-service.fr</strong>
        </p>
        <p style={{ marginTop: 10, opacity: 0.7 }}>© {new Date().getFullYear()} Luna Magazine — Édition affiliée.</p>
      </footer>

      <div className="m14-sticky">
        <a className="m14-sticky-cta v3-cta" href={safeAffi} onClick={onCta}>
          Ouvrir l'édition · {bon || "Bonus"}
        </a>
      </div>

      <V3OfferPopup
        open={popupOpen}
        onClose={() => setPopupOpen(false)}
        theme={{ accent: T.accent, accentLight: T.accentLight, accentGlow: T.accentGlow, bgCard: T.bgCard }}
        score={rewardScore}
        depositAmount={dep}
        bonusAmount={bon}
        steps={["Ouverture de l'édition", "Validation du bonus", "Lien d'accès prêt"]}
        href={safeAffi}
      />

      <V3SocialProof accent={T.accent} accentGlow={T.accentGlow} />
    </div>
  );
}
