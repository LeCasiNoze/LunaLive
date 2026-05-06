// ─────────────────────────────────────────────────────────────────────────────
// M4V1LowerSections — duplication 1:1 des sections du bas du V1 model4.html.
//
// Source de vérité : web/public/affi_templates/model4.html lignes 694-813.
// Reproduit exactement : reviews-section, faq-section (accordéon cliquable),
// footer (disclaimer + links + copyright), sticky-cta.
//
// Classes CSS scopées en `.m4v1-lower` pour ne pas polluer l'espace global.
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";

export type M4V1LowerSectionsProps = {
  affiLink: string;
  brandName?: string;
  /** En mode preview (éditeur) : le sticky CTA s'affiche en bloc inline en bas
   *  des sections au lieu de `position:fixed` qui s'étend hors du cadre preview. */
  previewMode?: boolean;
};

const REVIEWS = [
  {
    initial: "T",
    name: "Thomas M.",
    stars: "★★★★★",
    text: `"Offre VIP validée. Le bonus s'est activé en 1 minute après mon dépôt. J'ai fait un cashout de 400€ hier soir, j'ai reçu les fonds ce matin par virement SEPA. Rapide et discret."`,
  },
  {
    initial: "L",
    name: "Laura K.",
    stars: "★★★★★",
    text: `"Interface de haute qualité sur téléphone, on se croirait vraiment dans un casino VIP. Pas de bugs sur les mini-jeux. Le bonus est un vrai plus pour tester les machines."`,
  },
  {
    initial: "N",
    name: "Nicolas D.",
    stars: "★★★★☆",
    text: `"Inscription et vérification du compte ultra-rapide. Dépôt sécurisé (CB passée direct). J'ai posé 50€, j'ai eu 100€ de capital. Service client par chat réactif."`,
  },
];

const FAQ = [
  {
    q: "Quelles sont les garanties de sécurité des dépôts ?",
    a: "La plateforme utilise une technologie de cryptage de pointe (SSL 256 bits), certifiant l'anonymat complet et la sécurité totale de vos transactions financières. Vos fonds sont cachés et stockés sur des serveurs régulés.",
  },
  {
    q: "Le bonus de bienvenue s'applique-t-il à tous les dépôts ?",
    a: "L'offre VIP 100% est une offre d'acquisition automatisée via ce lien. Elle est valable uniquement sur votre tout premier dépôt, quelle que soit la méthode de paiement choisie (CB ou Virement).",
  },
  {
    q: "Sous quel délai puis-je retirer mes gains ?",
    a: "C'est une priorité absolue. Les demandes de retrait SEPA sont traitées et validées sous 24h ouvrées. Comptez ensuite le délai bancaire légal pour que les fonds apparaissent sur votre compte bancaire.",
  },
];

export function M4V1LowerSections({ affiLink, brandName, previewMode }: M4V1LowerSectionsProps) {
  const [activeFaq, setActiveFaq] = React.useState<number | null>(0);
  const safeAffi = affiLink || "#";
  const year = new Date().getFullYear();
  const brand = brandName ? brandName.trim() : "";

  // Charge Playfair Display + Poppins une seule fois (idempotent par id).
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById("m4v1-lower-fonts")) return;
    const link = document.createElement("link");
    link.id = "m4v1-lower-fonts";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Poppins:wght@400;500;600;700;800&display=swap";
    document.head.appendChild(link);
  }, []);

  return (
    <div className="m4v1-lower">
      <style>{`
        .m4v1-lower, .m4v1-lower * {
          box-sizing: border-box;
          font-family: 'Poppins', sans-serif;
        }
        .m4v1-lower h2 { font-family: 'Playfair Display', serif; margin: 0; }
        .m4v1-lower a { text-decoration: none; }
        .m4v1-lower .container { max-width: 1100px; margin: 0 auto; padding: 0 24px; }

        @keyframes m4v1l-pulseGold {
          0%   { box-shadow: 0 0 10px 2px rgba(255, 214, 0, 0.4); }
          50%  { box-shadow: 0 0 28px 8px rgba(255, 214, 0, 0.7); }
          100% { box-shadow: 0 0 10px 2px rgba(255, 214, 0, 0.4); }
        }

        /* REVIEWS */
        .m4v1-lower .reviews-section {
          padding: 100px 0;
          background-color: #150821;
          border-top: 1px solid #331A47;
          border-bottom: 1px solid #331A47;
          color: #fff;
        }
        .m4v1-lower .section-header { text-align: center; margin-bottom: 60px; }
        .m4v1-lower .section-header h2 {
          font-size: 2.5rem; font-weight: 900; color: #fff;
          letter-spacing: -1px; text-transform: uppercase; line-height: 1.1;
        }
        .m4v1-lower .section-header h2 span {
          color: #FFD700; text-shadow: 0 0 10px #FFD700;
        }
        .m4v1-lower .section-header p { color: #AAA4B0; margin-top: 10px; }
        .m4v1-lower .reviews-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 24px;
        }
        .m4v1-lower .review-card {
          background: #080212;
          padding: 32px;
          border-radius: 12px;
          border: 1px solid #331A47;
          transition: transform 0.3s ease, border-color 0.3s ease;
        }
        .m4v1-lower .review-card:hover {
          transform: translateY(-5px);
          border-color: #FFD700;
          box-shadow: 0 10px 30px rgba(255, 214, 0, 0.1);
        }
        .m4v1-lower .review-top {
          display: flex; justify-content: space-between;
          margin-bottom: 20px; align-items: flex-start;
        }
        .m4v1-lower .reviewer-info { display: flex; align-items: center; gap: 15px; }
        .m4v1-lower .avatar {
          width: 44px; height: 44px; border-radius: 50%;
          background: #150821; border: 1px solid #331A47;
          display: flex; align-items: center; justify-content: center;
          font-weight: 800; font-size: 1.2rem; color: #FFD700;
          flex-shrink: 0;
        }
        .m4v1-lower .reviewer-details { display: flex; flex-direction: column; }
        .m4v1-lower .reviewer { font-weight: 700; font-size: 1rem; color: #fff; }
        .m4v1-lower .verified {
          color: #00E676; font-size: 0.75rem; font-weight: 600;
          display: flex; align-items: center; gap: 4px; margin-top: 2px;
        }
        .m4v1-lower .verified svg { width: 12px; height: 12px; }
        .m4v1-lower .stars { color: #FFD700; font-size: 1.2rem; letter-spacing: 2px; flex-shrink: 0; }
        .m4v1-lower .review-text { color: #AAA4B0; font-size: 0.95rem; line-height: 1.7; margin: 0; }

        /* FAQ */
        .m4v1-lower .faq-section { padding: 100px 0; background-color: #080212; }
        .m4v1-lower .faq-container { max-width: 800px; margin: 0 auto; padding: 0 24px; }
        .m4v1-lower .faq-item {
          background: #150821; border: 1px solid #331A47;
          margin-bottom: 16px; border-radius: 8px; overflow: hidden;
          transition: all 0.3s;
        }
        .m4v1-lower .faq-question {
          padding: 24px; font-weight: 600; cursor: pointer;
          display: flex; justify-content: space-between; align-items: center;
          font-size: 1.05rem; color: #fff;
          transition: background 0.2s;
          user-select: none;
        }
        .m4v1-lower .faq-question:hover { background: rgba(255,255,255,0.02); color: #FFD700; }
        .m4v1-lower .faq-answer {
          max-height: 0; overflow: hidden;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          color: #AAA4B0; padding: 0 24px;
          font-size: 0.95rem; line-height: 1.6;
        }
        .m4v1-lower .faq-item.active { border-color: #FFD700; background: rgba(255, 214, 0, 0.03); }
        .m4v1-lower .faq-item.active .faq-answer {
          padding-bottom: 24px; max-height: 300px; margin-top: 8px;
        }
        .m4v1-lower .faq-icon {
          color: #FFD700; font-size: 1.5rem; font-weight: 400;
          transition: transform 0.3s; flex-shrink: 0; margin-left: 12px;
        }
        .m4v1-lower .faq-item.active .faq-icon { transform: rotate(45deg); }

        /* FOOTER */
        .m4v1-lower footer {
          border-top: 1px solid #331A47; padding: 50px 0;
          text-align: center; color: #555; font-size: 0.85rem; background: #000;
        }
        .m4v1-lower .disclaimer {
          border: 1px solid #331A47; padding: 24px;
          border-radius: 8px; margin-bottom: 30px;
          text-align: left; background: #050505;
        }
        .m4v1-lower .disclaimer strong {
          color: #888; font-weight: 700;
          text-transform: uppercase; letter-spacing: 1px;
        }
        .m4v1-lower .disclaimer p {
          margin-top: 10px; line-height: 1.5; font-weight: 400; color: #555;
        }
        .m4v1-lower .footer-links {
          display: flex; justify-content: center; gap: 30px;
          margin-bottom: 20px; flex-wrap: wrap;
        }
        .m4v1-lower .footer-links a { color: #666; font-weight: 500; transition: color 0.2s; }
        .m4v1-lower .footer-links a:hover { color: #fff; }

        /* STICKY CTA — fixed sur la page publique, inline en preview */
        .m4v1-lower .sticky-cta {
          padding: 14px 20px;
          background: linear-gradient(135deg, #FFD700, #FFC200);
          color: #000; text-align: center;
          font-size: 1.1rem; font-weight: 800;
          text-transform: uppercase; letter-spacing: 1px;
          cursor: pointer;
          box-shadow: 0 -4px 20px rgba(255, 214, 0, 0.5);
          animation: m4v1l-pulseGold 3s infinite;
          text-decoration: none; display: block;
        }
        .m4v1-lower .sticky-cta--fixed {
          position: fixed; bottom: 0; left: 0; right: 0; z-index: 9999;
        }
        .m4v1-lower .sticky-cta--inline {
          position: relative; margin: 0;
        }
        .m4v1-lower .sticky-cta:hover {
          background: linear-gradient(135deg, #FFE552, #FFC200);
        }

        /* RESPONSIVE */
        @media (max-width: 700px) {
          .m4v1-lower .section-header h2 { font-size: 2rem; }
          .m4v1-lower .reviews-section,
          .m4v1-lower .faq-section { padding: 60px 0; }
        }
      `}</style>

      {/* REVIEWS */}
      <section className="reviews-section">
        <div className="container">
          <div className="section-header">
            <h2>AVIS DES <span>JOUEURS</span></h2>
            <p>La confiance de notre communauté est notre plus grande réussite.</p>
          </div>
          <div className="reviews-grid">
            {REVIEWS.map((r, i) => (
              <div key={i} className="review-card">
                <div className="review-top">
                  <div className="reviewer-info">
                    <div className="avatar">{r.initial}</div>
                    <div className="reviewer-details">
                      <span className="reviewer">{r.name}</span>
                      <span className="verified">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        Gain Encaissé
                      </span>
                    </div>
                  </div>
                  <div className="stars">{r.stars}</div>
                </div>
                <p className="review-text">{r.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="faq-section">
        <div className="faq-container">
          <div className="section-header">
            <h2>QUESTIONS FRÉQUENTES</h2>
          </div>
          {FAQ.map((f, i) => (
            <div key={i} className={`faq-item${activeFaq === i ? " active" : ""}`}>
              <div
                className="faq-question"
                onClick={() => setActiveFaq((cur) => (cur === i ? null : i))}
              >
                {f.q} <span className="faq-icon">+</span>
              </div>
              <div className="faq-answer">{f.a}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer>
        <div className="container">
          <div className="disclaimer">
            <strong>Avertissement - Jeu Responsable :</strong>
            <p>Les jeux d'argent comportent des risques sérieux : endettement, isolement, dépendance. Pour être aidé, appelez le 09-74-75-13-13 (appel anonyme). Cette offre est strictement interdite aux mineurs de moins de 18 ans.</p>
          </div>
          <div className="footer-links">
            <a href="#">Termes d'utilisation</a>
            <a href="#">Conditions de Confidentialité</a>
            <a href="#">Jeu Responsable</a>
            <a href="#">Régulation & Licences</a>
          </div>
          <p>&copy; {year} {brand || "Club VIP"}. Club VIP Réservé.</p>
        </div>
      </footer>

      {/* STICKY CTA — fixed (publié) ou inline (preview) */}
      <a
        href={safeAffi}
        target="_blank"
        rel="noreferrer"
        className={`sticky-cta ${previewMode ? "sticky-cta--inline" : "sticky-cta--fixed"}`}
      >
        🎰 JOUER MAINTENANT
      </a>
    </div>
  );
}
