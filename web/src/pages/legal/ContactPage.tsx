// web/src/pages/legal/ContactPage.tsx
import * as React from "react";
import { Link } from "react-router-dom";
import { setSeo } from "../../lib/seo";

export default function ContactPage() {
  React.useEffect(() => {
    setSeo({
      title: "Contact — LunaLive",
      description: "Contactez l'équipe LunaLive pour toute question, signalement ou demande de partenariat.",
      path: "/contact",
      robots: "index,follow",
    });
  }, []);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px", fontFamily: "system-ui, sans-serif", color: "#e0daf7" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, color: "#c4b5fd" }}>Contact</h1>
      <p style={{ color: "rgba(200,195,240,.55)", marginBottom: 32, fontSize: 14 }}>Une question, un signalement, une demande de partenariat ?</p>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#a78bfa", marginBottom: 12 }}>Nous contacter</h2>
        <p>Pour toute question relative à LunaLive, écrivez-nous à <a href="mailto:lunalivepro@gmail.com" style={{ color: "#a78bfa" }}>lunalivepro@gmail.com</a> ou utilisez le bouton de signalement ⚑ présent en haut de chaque page.</p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#a78bfa", marginBottom: 12 }}>Signalement rapide</h2>
        <p>Pour signaler un problème technique, un contenu inapproprié ou un bug, cliquez sur le bouton <strong>⚑</strong> accessible depuis la barre de navigation en haut de page.</p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#a78bfa", marginBottom: 12 }}>Demandes légales et RGPD</h2>
        <p>Pour toute demande relative à vos données personnelles (accès, rectification, suppression), utilisez le formulaire de signalement en précisant "Demande RGPD".</p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#a78bfa", marginBottom: 12 }}>Jeu responsable</h2>
        <p>Si vous ou un proche souffrez d'addiction au jeu :</p>
        <ul style={{ marginTop: 8, paddingLeft: 20, lineHeight: 1.8 }}>
          <li><strong>Joueurs Info Service :</strong> 09 74 75 13 13 (gratuit, 7j/7)</li>
          <li><strong>Addictaide :</strong> addictaide.fr</li>
        </ul>
      </section>

      <div style={{ marginTop: 40, paddingTop: 20, borderTop: "1px solid rgba(124,92,252,.20)", fontSize: 13, color: "rgba(180,185,230,.45)" }}>
        <Link to="/" style={{ color: "#7c5cfc" }}>← Retour à l'accueil</Link>
        {" · "}
        <Link to="/mentions-legales" style={{ color: "#7c5cfc" }}>Mentions légales</Link>
        {" · "}
        <Link to="/politique-de-confidentialite" style={{ color: "#7c5cfc" }}>Confidentialité</Link>
        {" · "}
        <Link to="/cgu" style={{ color: "#7c5cfc" }}>CGU</Link>
      </div>
    </div>
  );
}
