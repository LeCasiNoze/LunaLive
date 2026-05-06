// ─────────────────────────────────────────────────────────────────────────────
// M4V1Card — duplication visuelle pixel-exact de la card V1 (model4.html).
//
// Source de vérité : web/public/affi_templates/model4.html (sections .promo-card,
// .promo-image-container, .promo-body, .offer-header, .offer-subtitle, .info-box,
// .btn-jouer + media query mobile <=700px).
//
// Aucune liberté créative — chaque valeur (couleur, taille, padding, font-weight,
// shadow) est reportée 1:1 depuis le CSS V1. Les seules entrées variables sont les
// data props (image, montants, lien, délai d'animation).
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";

export type M4V1CardProps = {
  imgSrc: string;
  imgAlt?: string;
  depositAmount: string;     // ex "10€"
  bonusAmount: string;       // ex "20€"
  bonusPct?: string;         // ex "100%" — défaut V1 = "100%"
  href: string;
  animationDelay?: string;   // ex "0s" / "-3s" pour la 2e card V1
  isMobile?: boolean;
};

const V1 = {
  bgPage:      "#080212",
  bgCard:      "#150821",
  brandRuby:   "#E0115F",
  brandGold:   "#FFD700",
  goldGlow:    "rgba(255, 214, 0, 0.4)",
  casinoGreen: "#00E676",
  borderColor: "#331A47",
  radius:      "12px",
  textMain:    "#FFFFFF",
  textMuted:   "#AAA4B0",
  font:        '"Poppins", sans-serif',
};

export function M4V1Card({
  imgSrc,
  imgAlt = "",
  depositAmount,
  bonusAmount,
  bonusPct = "100%",
  href,
  animationDelay = "0s",
  isMobile = false,
}: M4V1CardProps) {
  // .promo-card
  const card: React.CSSProperties = {
    background: V1.bgCard,
    borderRadius: V1.radius,
    overflow: "hidden",
    boxShadow: "0 30px 60px rgba(0, 0, 0, 0.9)",
    border: `2px solid ${V1.borderColor}`,
    transition: "transform 0.3s ease, border-color 0.3s ease",
    animation: "m4v1-float 6s ease-in-out infinite",
    animationDelay,
    fontFamily: V1.font,
    color: V1.textMain,
    lineHeight: 1.6,
  };

  // .promo-image-container — V1 desktop = 16/9, V1 mobile = 21/9.
  const imgContainer: React.CSSProperties = {
    width: "100%",
    backgroundColor: "#000",
    overflow: "hidden",
    borderBottom: `2px solid ${V1.borderColor}`,
    aspectRatio: isMobile ? "21 / 9" : "16 / 9",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
  const imgEl: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    display: "block",
  };

  // .promo-body — V1 desktop padding 22px, V1 mobile padding 14px.
  const body: React.CSSProperties = {
    padding: isMobile ? "14px" : "22px",
  };

  // .offer-header — desktop margin-bottom 8px, mobile 6px ; gap desktop 12px / mobile 10px.
  const offerHeader: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: isMobile ? "10px" : "12px",
    marginBottom: isMobile ? "6px" : "8px",
  };

  // .icon-circle 36x36
  const iconCircle: React.CSSProperties = {
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    backgroundColor: "rgba(255, 214, 0, 0.1)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    border: "1px solid rgba(255,214,0,0.2)",
    flexShrink: 0,
  };

  // .offer-title
  const offerTitle: React.CSSProperties = {
    color: "#ffffff",
    fontSize: "1rem",
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "1px",
  };

  // .offer-subtitle — desktop 0.9rem mb 20px, mobile 0.85rem mb 12px ; gap 8px.
  const offerSubtitle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    color: "#fff",
    fontSize: isMobile ? "0.85rem" : "0.9rem",
    marginBottom: isMobile ? "12px" : "20px",
  };

  // .info-box — desktop padding 16px mb 20px, mobile padding 12px mb 12px.
  const infoBox: React.CSSProperties = {
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: "8px",
    padding: isMobile ? "12px" : "16px",
    marginBottom: isMobile ? "12px" : "20px",
    border: `1px solid ${V1.borderColor}`,
  };

  // .info-title
  const infoTitle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    color: V1.textMuted,
    fontSize: isMobile ? "0.72rem" : "0.8rem",
    fontWeight: 700,
    marginBottom: isMobile ? "6px" : "10px",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  };

  // .info-steps
  const infoSteps: React.CSSProperties = {
    fontSize: isMobile ? "0.92rem" : "1rem",
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
  };

  // .btn-jouer
  const btnJouer: React.CSSProperties = {
    display: "block",
    width: "100%",
    background: "linear-gradient(135deg, #FFD700, #FFC200)",
    color: "#000",
    textAlign: "center",
    fontSize: isMobile ? "1rem" : "1.1rem",
    fontWeight: 800,
    padding: isMobile ? "13px 0" : "16px 0",
    borderRadius: "8px",
    transition: "all 0.2s ease",
    cursor: "pointer",
    textTransform: "uppercase",
    boxShadow: "0 8px 15px rgba(255, 214, 0, 0.4)",
    border: "none",
    animation: "m4v1-pulseGold 3s infinite",
    textDecoration: "none",
    boxSizing: "border-box",
    fontFamily: V1.font,
    letterSpacing: 0,
  };

  return (
    <div style={card} className="m4v1-card">
      {/* Keyframes scopées (idempotent : si déjà injectées par une autre card,
          le navigateur déduplique sans erreur). */}
      <style>{`
        @keyframes m4v1-pulseGold {
          0%   { box-shadow: 0 0 10px 2px rgba(255, 214, 0, 0.4); }
          50%  { box-shadow: 0 0 28px 8px rgba(255, 214, 0, 0.7); }
          100% { box-shadow: 0 0 10px 2px rgba(255, 214, 0, 0.4); }
        }
        @keyframes m4v1-float {
          0%   { transform: translateY(0px); }
          50%  { transform: translateY(-8px); }
          100% { transform: translateY(0px); }
        }
        .m4v1-card * { box-sizing: border-box; }
      `}</style>

      <div style={imgContainer}>
        {imgSrc ? (
          <img src={imgSrc} alt={imgAlt} style={imgEl} />
        ) : (
          <div style={{ ...imgEl, background: "rgba(255,255,255,.04)", display: "grid", placeItems: "center", color: "#666", fontSize: 12 }}>
            Image vide
          </div>
        )}
      </div>

      <div style={body}>
        <div style={offerHeader}>
          <div style={iconCircle}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={V1.brandGold} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
              <rect x="3" y="8" width="18" height="4" rx="1"></rect>
              <path d="M12 8v13"></path>
              <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"></path>
              <path d="M7.5 8a2.5 2.5 0 0 1 0-5C9.5 3 12 5 12 8c0-3 2.5-5 4.5-5a2.5 2.5 0 0 1 0 5"></path>
            </svg>
          </div>
          <div style={offerTitle}>Offre de Bienvenue</div>
        </div>

        <div style={offerSubtitle}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={V1.casinoGreen} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0 }}>
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
            <polyline points="17 6 23 6 23 12"></polyline>
          </svg>
          <span>BONUS <strong>{bonusPct}</strong> AUTOMATIQUE</span>
        </div>

        <div style={infoBox}>
          <div style={infoTitle}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={V1.brandGold} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            C'est simple
          </div>
          <div style={infoSteps}>
            <span style={{ color: "#fff" }}>Déposez {depositAmount}</span>
            <span style={{ color: "#fff", fontSize: "1.1rem" }}>→</span>
            <span style={{ color: V1.brandGold, textShadow: `0 0 10px ${V1.brandGold}` }}>
              Recevez {bonusAmount}
            </span>
          </div>
        </div>

        <a href={href || "#"} target="_blank" rel="noreferrer" style={btnJouer}>
          JOUER
        </a>
      </div>
    </div>
  );
}
