// ─────────────────────────────────────────────────────────────────────────────
// M10 — Landing statique style "Cyclope l'Héritier" (replique fidele du
// projet Lovable fourni). Layout en sections : header halo rotatif, hero
// card avec sticker + overlay bonus, feed "gains en direct" scrollant,
// FAQ accordeon, final CTA gradient, sticky CTA mobile.
//
// Contrairement aux modeles M3-M9 (interactifs), M10 est STATIQUE :
// pas de mini-jeu, juste une landing copywriting + 1 clic CTA → popup V3.
//
// Aucune image n'est embarquee par defaut : les images (avatar + hero
// jeu) doivent etre fournies par l'editeur via les props.
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import { V3OfferPopup } from "./V3OfferPopup";
import { V3SocialProof } from "./V3SocialProof";

export type M10CyclopeProps = {
  /** Pseudo principal (gros titre, gradient chrome). */
  pseudo?: string;
  /** Sous-titre (sous le pseudo, ex "L'HERITIER"). */
  pseudoSub?: string;
  /** Avatar rond + halo conique rotatif. Si vide, halo seul sans photo. */
  profileImageUrl?: string;
  /** Nb followers affiche dans le pill (ex "250K"). Vide = pill simplifie. */
  followersCount?: string;
  /** Handle social affiche dans le pill (ex "@cyclope"). */
  socialHandle?: string;
  /** Image hero du jeu (chicken / autre). Vide = placeholder. */
  gameImageUrl?: string;
  /** Sticker top hero (ex "🐔 JEU DU POULET"). */
  gameLabel?: string;
  /** % bonus inclus affiche en bas de l'overlay (ex "550%"). */
  gameBonusPct?: string;
  /** Montants standards (utilisees pour le popup + l'overlay). */
  depositAmount?: number | null;
  bonusAmount?: number | null;
  /** Lien d'affiliation cible. */
  affiLink: string;
  /** Theme accent (gardons l'API standard pour cohérence). */
  theme?: {
    accent?: string;
    accentLight?: string;
    accentGlow?: string;
    bgPage?: string;
    bgCard?: string;
    borderColor?: string;
  };
  /** Callback editeur : appelée au clic sur un élément éditable.
   *  Si undefined (rendu final), le clic est inert (sauf CTA). */
  onEditField?: (field: M10EditField) => void;
};

export type M10EditField =
  | "pseudo"
  | "pseudoSub"
  | "profileImageUrl"
  | "socialHandle"
  | "followersCount"
  | "depositAmount"
  | "bonusAmount"
  | "gameImageUrl"
  | "gameBonusPct"
  | "affiLink";

const DEFAULT_FAQS: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: "Comment je touche mon bonus ?",
    a: "Tu cliques sur le bouton, tu crées ton compte en 30 secondes et tu déposes. Ton bonus est crédité automatiquement, prêt à jouer.",
  },
  {
    q: "Je peux retirer mes gains ?",
    a: "Oui, tous tes gains sont retirables sur ton compte bancaire ou crypto dès que tu respectes les conditions de mise du bonus.",
  },
  {
    q: "C'est légal ?",
    a: "100% légal. Plateforme licenciée et régulée. Réservé aux 18 ans et plus, à jouer avec modération.",
  },
];

const FAKE_GAINS: ReadonlyArray<{ name: string; amount: string; time: string }> = [
  { name: "Léa",     amount: "+1 487€", time: "il y a 2 min"  },
  { name: "Mehdi",   amount: "+2 480€", time: "il y a 4 min"  },
  { name: "Naël",    amount: "+5 120€", time: "il y a 6 min"  },
  { name: "Sofiane", amount: "+780€",   time: "il y a 8 min"  },
  { name: "Inès",    amount: "+1 240€", time: "il y a 11 min" },
  { name: "Yanis",   amount: "+3 650€", time: "il y a 13 min" },
  { name: "Camille", amount: "+920€",   time: "il y a 16 min" },
  { name: "Rayan",   amount: "+4 310€", time: "il y a 19 min" },
  { name: "Manon",   amount: "+1 870€", time: "il y a 22 min" },
  { name: "Anaïs",   amount: "+2 095€", time: "il y a 25 min" },
];

const POPUP_STEPS = [
  "Verification du bonus",
  "Preparation de l'offre",
  "Lien d'inscription pret",
] as const;

export function M10Cyclope({
  pseudo,
  pseudoSub,
  profileImageUrl,
  followersCount,
  socialHandle,
  gameImageUrl,
  gameBonusPct,
  depositAmount,
  bonusAmount,
  affiLink,
  theme,
  onEditField,
}: M10CyclopeProps) {
  const editMode = typeof onEditField === "function";
  const triggerEdit = (field: M10EditField) => (e: React.MouseEvent) => {
    if (!editMode) return;
    e.preventDefault();
    e.stopPropagation();
    onEditField?.(field);
  };
  // Palette Cyclope EXACTE (Lovable source). Pas d'override theme : ce modele
  // est concu visuellement complet, le bg M1Theme ne doit pas s'y appliquer.
  const C = {
    accentHot:  "#FF4B6E",  // rose vif
    accentWarm: "#FFB930",  // or
    accentSoft: "#FF8A4B",  // orange
    cream:      "#FFE9D6",
    bgDeep:     "#0B1530",
    bgCard:     "#0F1B3D",
    glow:       "rgba(255,75,110,.55)",
  };
  void theme;

  const dep = depositAmount != null ? `${depositAmount}€` : "";
  const bon = bonusAmount != null ? `${bonusAmount}€` : "";
  const safeAffi = affiLink || "#";
  const netBonus = (depositAmount != null && bonusAmount != null) ? bonusAmount - depositAmount : null;
  const rewardScore = (netBonus != null && netBonus > 0) ? `+${netBonus}€` : (bon ? `+${bon}` : "Bonus 100%");
  const popupSteps = React.useMemo(() => Array.from(POPUP_STEPS), []);

  const [popupOpen, setPopupOpen] = React.useState(false);
  const [openFaq, setOpenFaq] = React.useState<number | null>(0);

  // Feed gains : double la liste pour anim scroll infini
  const gainsLoop = React.useMemo(() => [...FAKE_GAINS, ...FAKE_GAINS], []);

  const onCtaClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setPopupOpen(true);
  };

  return (
    <div className="m10-root">
      <style>{`
        .m10-root{position:relative;min-height:100vh;overflow-x:hidden;background:
          radial-gradient(110% 55% at 50% -10%,rgba(255,75,110,.35) 0%,rgba(255,185,48,.18) 35%,transparent 70%),
          radial-gradient(80% 45% at 50% 110%,rgba(255,75,110,.22) 0%,transparent 70%),
          ${C.bgDeep};
          font-family:'Space Grotesk','DM Sans',-apple-system,sans-serif;color:#fff;padding-bottom:160px}
        .m10-layer{position:relative;z-index:10}

        /* ─── Header ─── */
        .m10-header{position:relative;width:100%;padding:40px 20px 16px;display:flex;flex-direction:column;align-items:center;text-align:center}
        .m10-avatar-wrap{position:relative;width:100px;height:100px}
        .m10-avatar-halo{position:absolute;inset:-12px;border-radius:50%;background:conic-gradient(from 0deg,${C.accentHot},${C.accentWarm},${C.accentHot},${C.accentSoft},${C.accentHot});filter:blur(14px);opacity:.9;animation:m10-spin 8s linear infinite;pointer-events:none}
        .m10-avatar{position:relative;width:100%;height:100%;border-radius:50%;overflow:hidden;border:3px solid #fff;box-shadow:0 0 0 2px ${C.accentHot},0 10px 30px ${C.glow};background:linear-gradient(135deg,${C.bgCard},${C.bgDeep})}
        .m10-avatar img{width:100%;height:100%;object-fit:cover;display:block}
        .m10-avatar-empty{display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:2.4rem;color:rgba(255,255,255,.25)}

        .m10-name{margin:16px 0 0;line-height:1;font-family:'Bagel Fat One',cursive;font-size:2.6rem;letter-spacing:.02em;background:linear-gradient(180deg,#fff 0%,${C.cream} 25%,${C.accentWarm} 55%,${C.accentHot} 85%,#fff 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;filter:drop-shadow(0 2px 0 ${C.accentHot}88) drop-shadow(0 0 14px ${C.accentWarm}80)}
        /* Ligne 2 : SOLIDE cream + letterspaced + small (style exact source Cyclope) */
        .m10-name-line2{margin:-4px 0 0;font-family:'Space Grotesk',sans-serif;font-size:.8rem;font-weight:800;letter-spacing:.3em;text-transform:uppercase;color:${C.cream};text-shadow:0 0 12px ${C.accentWarm}80}
        .m10-pill{margin-top:12px;display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:999px;background:rgba(255,255,255,.08);backdrop-filter:blur(10px);border:1px solid ${C.accentWarm}66;box-shadow:0 2px 14px ${C.glow}26;font-size:.72rem;font-weight:600;color:#fff}
        .m10-pill-dot{width:4px;height:4px;border-radius:50%;background:${C.cream}66}
        .m10-pill-count{font-weight:800;font-size:.78rem;color:#fff}
        .m10-pill-count em{font-style:normal;font-size:.6rem;letter-spacing:.16em;font-weight:700;color:${C.cream}b3;margin-left:4px}

        /* ─── Hero section (copie EXACTE de la source Cyclope) ─── */
        .m10-hero{width:100%;padding:8px 20px 24px}
        .m10-hero-card{position:relative;display:block;max-width:380px;margin:0 auto;border-radius:28px;overflow:hidden;border:2px solid rgba(255,185,48,.45);box-shadow:0 20px 60px rgba(255,75,110,.55),0 0 0 3px rgba(255,255,255,.08),0 0 70px rgba(255,185,48,.45);cursor:pointer;transition:transform .12s ease}
        .m10-hero-card:active{transform:scale(.98)}
        .m10-hero-img{width:100%;aspect-ratio:1/1;object-fit:cover;display:block}
        .m10-hero-placeholder{width:100%;aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.28);font-size:3.5rem;background:radial-gradient(circle at 50% 40%,${C.accentHot}33,transparent 60%),${C.bgCard}}
        /* Overlay promesse — exact replica source */
        .m10-hero-overlay{position:absolute;left:0;right:0;bottom:0;padding:56px 20px 24px;background:linear-gradient(to top,rgba(11,21,48,.97) 0%,rgba(11,21,48,.82) 55%,transparent 100%);text-align:center;pointer-events:none}
        .m10-hero-pre{margin:0;color:#fff;font-family:'Space Grotesk',sans-serif;font-size:.72rem;font-weight:700;letter-spacing:.2em;opacity:.95}
        .m10-hero-prize{margin:4px 0 0;line-height:1;font-family:'Bagel Fat One',cursive;font-size:3rem;background:linear-gradient(180deg,#fff 0%,${C.accentWarm} 55%,${C.accentHot} 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;filter:drop-shadow(0 3px 0 rgba(0,0,0,.35))}
        .m10-hero-sub{margin:6px 0 0;text-align:center;font-family:'Space Grotesk',sans-serif;font-size:.65rem;font-weight:600;letter-spacing:.1em;color:rgba(255,233,214,.65)}

        /* ─── Gains feed ─── */
        .m10-gains{width:100%;padding:32px 20px}
        .m10-gains-inner{max-width:380px;margin:0 auto}
        .m10-gains-title-wrap{position:relative;display:flex;justify-content:center;margin-bottom:20px}
        .m10-gains-aura{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none}
        .m10-gains-aura::before{content:"";width:260px;height:80px;border-radius:999px;background:radial-gradient(closest-side,${C.accentWarm}73,${C.accentHot}40 55%,transparent 75%);filter:blur(18px);animation:m10-aura 2.8s ease-in-out infinite}
        .m10-gains-title{position:relative;font-weight:900;font-size:1.35rem;letter-spacing:.14em;color:${C.accentWarm};text-shadow:0 0 18px ${C.accentWarm}80;text-transform:uppercase;animation:m10-title-pulse 2.2s ease-in-out infinite;display:inline-block}
        .m10-gains-title::before{content:"🔴 ";display:inline-block;animation:m10-dot 1.2s ease-in-out infinite}
        .m10-gains-scroll{position:relative;height:260px;overflow:hidden;mask-image:linear-gradient(to bottom,transparent 0%,#000 12%,#000 88%,transparent 100%);-webkit-mask-image:linear-gradient(to bottom,transparent 0%,#000 12%,#000 88%,transparent 100%)}
        .m10-gains-list{display:flex;flex-direction:column;gap:8px;animation:m10-gains-scroll 28s linear infinite}
        .m10-gain-row{display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:16px;background:rgba(255,255,255,.04);border:1px solid ${C.accentWarm}2e;box-shadow:0 2px 12px rgba(0,0,0,.25);backdrop-filter:blur(10px)}
        .m10-gain-ava{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:.85rem;flex-shrink:0;background:linear-gradient(135deg,${C.accentHot},${C.accentSoft});border:1.5px solid rgba(255,255,255,.9)}
        .m10-gain-info{flex:1;min-width:0}
        .m10-gain-name{font-size:.85rem;font-weight:700;color:#fff;margin:0}
        .m10-gain-time{font-size:.66rem;font-weight:600;color:${C.cream}a6;margin:2px 0 0}
        .m10-gain-amount{font-family:'Bagel Fat One',cursive;font-size:1.05rem;color:${C.accentWarm};text-shadow:0 0 14px ${C.accentWarm}8c}

        /* ─── FAQ ─── */
        .m10-faq{width:100%;padding:24px 20px 8px}
        .m10-faq-inner{max-width:380px;margin:0 auto}
        .m10-faq-title{text-align:center;margin:0 0 20px;font-family:'Bagel Fat One',cursive;font-size:1.6rem;background:linear-gradient(180deg,${C.accentWarm} 0%,${C.accentHot} 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;filter:drop-shadow(0 2px 0 ${C.accentHot}4d)}
        .m10-faq-item{margin-bottom:8px;border-radius:16px;background:rgba(255,255,255,.04);border:1px solid ${C.accentWarm}2e;box-shadow:0 4px 18px rgba(0,0,0,.25);backdrop-filter:blur(10px);overflow:hidden}
        .m10-faq-q{width:100%;display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:transparent;border:none;color:#fff;font-weight:700;font-size:.88rem;text-align:left;cursor:pointer;font-family:inherit}
        .m10-faq-q-icon{font-size:.85rem;color:${C.accentWarm};transition:transform .25s ease;flex-shrink:0;margin-left:10px}
        .m10-faq-item.open .m10-faq-q-icon{transform:rotate(180deg)}
        .m10-faq-a{padding:0 16px 14px;font-size:.85rem;color:${C.cream}cc;line-height:1.5;display:none}
        .m10-faq-item.open .m10-faq-a{display:block}

        /* ─── Final CTA ─── */
        .m10-final{width:100%;padding:28px 20px 12px}
        .m10-final-inner{max-width:380px;margin:0 auto}
        .m10-cta{position:relative;display:flex;align-items:center;justify-content:center;width:100%;padding:20px;border-radius:18px;overflow:hidden;font-family:'Bagel Fat One',cursive;font-size:1.4rem;letter-spacing:.05em;color:#fff;background:linear-gradient(135deg,${C.accentHot} 0%,${C.accentSoft} 50%,${C.accentWarm} 100%);border:2px solid #fff;box-shadow:0 0 40px ${C.glow}cc,0 14px 32px ${C.accentHot}73,inset 0 1px 0 rgba(255,255,255,.9);text-shadow:0 2px 0 rgba(155,28,53,.55);text-decoration:none;cursor:pointer;transition:transform .12s ease;font-weight:400}
        .m10-cta:active{transform:scale(.97)}
        .m10-cta-sub{margin-top:10px;text-align:center;font-size:.72rem;font-weight:600;color:${C.cream}}

        /* ─── Sticky mobile CTA ─── */
        .m10-sticky{position:fixed;left:0;right:0;bottom:0;z-index:50;padding:12px 16px 18px;background:linear-gradient(to top,${C.bgDeep} 55%,${C.bgDeep}d9 85%,transparent)}
        .m10-sticky-cta{position:relative;display:flex;align-items:center;justify-content:center;width:100%;max-width:380px;margin:0 auto;padding:18px;border-radius:18px;font-family:'Bagel Fat One',cursive;font-size:1.3rem;letter-spacing:.05em;color:#fff;background:linear-gradient(135deg,${C.accentHot} 0%,${C.accentSoft} 50%,${C.accentWarm} 100%);border:2px solid #fff;box-shadow:0 0 36px ${C.glow}d9,0 12px 28px ${C.accentHot}80,inset 0 1px 0 rgba(255,255,255,.9);text-shadow:0 2px 0 rgba(155,28,53,.55);text-decoration:none;cursor:pointer;animation:m10-cta-pulse 2.4s ease-in-out infinite;transition:transform .12s ease;font-weight:400}
        .m10-sticky-cta:active{transform:scale(.95)}
        .m10-sticky-sub{margin-top:6px;text-align:center;font-size:.66rem;font-weight:600;color:${C.cream}}

        /* ─── Footer ─── */
        .m10-footer{padding:24px 20px 36px;text-align:center;color:${C.cream}b3;font-size:.7rem;line-height:1.5}
        .m10-footer-name{font-family:'Bagel Fat One',cursive;font-size:1.1rem;color:${C.cream};margin-bottom:10px;letter-spacing:.04em}
        .m10-footer-legal{color:${C.cream}b3;font-size:.7rem;margin:6px 0;line-height:1.5}
        .m10-footer-legal strong{font-weight:700;color:#fff}
        .m10-footer-mention{margin-top:8px;font-size:.65rem;color:${C.cream}80}

        /* ─── Animations ─── */
        @keyframes m10-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes m10-aura{0%,100%{opacity:.55;transform:scale(1)}50%{opacity:.95;transform:scale(1.08)}}
        @keyframes m10-title-pulse{0%,100%{transform:scale(1);text-shadow:0 0 18px ${C.accentWarm}80}50%{transform:scale(1.04);text-shadow:0 0 28px ${C.accentWarm}e6,0 0 8px ${C.accentHot}99}}
        @keyframes m10-dot{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes m10-gains-scroll{0%{transform:translateY(0)}100%{transform:translateY(-50%)}}
        @keyframes m10-cta-pulse{0%,100%{box-shadow:0 0 36px ${C.glow}d9,0 12px 28px ${C.accentHot}80,inset 0 1px 0 rgba(255,255,255,.9)}50%{box-shadow:0 0 60px ${C.accentWarm}f2,0 12px 28px ${C.accentHot}80,inset 0 1px 0 rgba(255,255,255,1)}}
        @media (prefers-reduced-motion:reduce){
          .m10-avatar-halo,.m10-gains-aura::before,.m10-gains-list,.m10-gains-title,.m10-sticky-cta{animation:none !important}
        }
      `}</style>

      <div className="m10-layer">
        {/* Header */}
        <header className="m10-header">
          <div className="m10-avatar-wrap">
            <div className="m10-avatar-halo" />
            <div className="m10-avatar">
              {profileImageUrl ? (
                <img src={profileImageUrl} alt={pseudo || "Avatar"} />
              ) : (
                <div className="m10-avatar-empty">👤</div>
              )}
            </div>
          </div>
          {pseudo ? <h1 className="m10-name">{pseudo}</h1> : null}
          {pseudoSub ? <div className="m10-name-line2">{pseudoSub}</div> : null}
          {(socialHandle || followersCount) ? (
            <div className="m10-pill">
              {socialHandle ? <span>{socialHandle}</span> : null}
              {socialHandle && followersCount ? <span className="m10-pill-dot" /> : null}
              {followersCount ? (
                <span className="m10-pill-count">
                  {followersCount}<em>FOLLOWERS</em>
                </span>
              ) : null}
            </div>
          ) : null}
        </header>

        {/* Hero — copie exacte de CyclopeHero.tsx (overlay bas) */}
        <section className="m10-hero">
          <a className="m10-hero-card v3-cta" href={safeAffi} onClick={onCtaClick}>
            {gameImageUrl ? (
              <img className="m10-hero-img" src={gameImageUrl} alt="Jeu bonus" />
            ) : (
              <div className="m10-hero-placeholder">🎰</div>
            )}
            <div className="m10-hero-overlay">
              <p className="m10-hero-pre">{dep ? `DÉPOSE ${dep} → REÇOIS` : "RÉCLAME TON BONUS"}</p>
              <p className="m10-hero-prize">{bon ? `${bon} GRATUITS` : "BONUS"}</p>
              {gameBonusPct ? <p className="m10-hero-sub">+ {gameBonusPct} bonus inclus</p> : null}
            </div>
          </a>
        </section>

        {/* Gains feed */}
        <section className="m10-gains">
          <div className="m10-gains-inner">
            <div className="m10-gains-title-wrap">
              <div className="m10-gains-aura" />
              <h2 className="m10-gains-title">· GAINS EN DIRECT ·</h2>
            </div>
            <div className="m10-gains-scroll">
              <div className="m10-gains-list">
                {gainsLoop.map((g, i) => (
                  <div key={i} className="m10-gain-row">
                    <div className="m10-gain-ava">{g.name[0]}</div>
                    <div className="m10-gain-info">
                      <p className="m10-gain-name">{g.name}</p>
                      <p className="m10-gain-time">{g.time}</p>
                    </div>
                    <div className="m10-gain-amount">{g.amount}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="m10-faq">
          <div className="m10-faq-inner">
            <h2 className="m10-faq-title">QUESTIONS</h2>
            {DEFAULT_FAQS.map((f, i) => (
              <div key={i} className={`m10-faq-item ${openFaq === i ? "open" : ""}`}>
                <button
                  type="button"
                  className="m10-faq-q"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span>{f.q}</span>
                  <span className="m10-faq-q-icon">▾</span>
                </button>
                <div className="m10-faq-a">{f.a}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="m10-final">
          <div className="m10-final-inner">
            <a className="m10-cta v3-cta" href={safeAffi} onClick={onCtaClick}>
              🚀 JE PRENDS {bon ? `MES ${bon}` : "MON BONUS"}
            </a>
            <p className="m10-cta-sub">Inscription en 30s · Bonus crédité automatiquement</p>
          </div>
        </section>

        {/* Footer */}
        <footer className="m10-footer">
          {pseudo ? <div className="m10-footer-name">{pseudo}{socialHandle ? ` · ${socialHandle}` : ""}</div> : null}
          <p className="m10-footer-legal">
            Les jeux d'argent et de hasard sont strictement interdits aux mineurs de 18 ans.
          </p>
          <p className="m10-footer-legal">
            Jouer comporte des risques : endettement, isolement, dépendance. Pour être aidé,
            appelez le <strong>09 74 75 13 13</strong> (appel non surtaxé) ou rendez-vous sur{" "}
            <strong>joueurs-info-service.fr</strong>.
          </p>
          <p className="m10-footer-legal">Jouez responsablement, dans la modération et pour le plaisir.</p>
          <p className="m10-footer-mention">
            © {new Date().getFullYear()} — Page affiliée. Contient des liens commerciaux.
          </p>
        </footer>
      </div>

      {/* Sticky CTA mobile */}
      <div className="m10-sticky">
        <a className="m10-sticky-cta v3-cta" href={safeAffi} onClick={onCtaClick}>
          🚀 JE PRENDS {bon ? `MES ${bon}` : "MON BONUS"}
        </a>
        <p className="m10-sticky-sub">Inscription gratuite · 30s</p>
      </div>

      <V3OfferPopup
        open={popupOpen}
        onClose={() => setPopupOpen(false)}
        theme={{ accent: C.accentHot, accentLight: C.accentWarm, accentGlow: C.glow, bgCard: C.bgCard }}
        score={rewardScore}
        depositAmount={dep}
        bonusAmount={bon}
        steps={popupSteps}
        href={safeAffi}
      />

      <V3SocialProof accent={C.accentWarm} accentGlow={C.glow} />
    </div>
  );
}
