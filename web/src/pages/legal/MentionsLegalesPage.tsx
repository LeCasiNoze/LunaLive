// web/src/pages/legal/MentionsLegalesPage.tsx
import * as React from "react";
import { Link } from "react-router-dom";
import { setSeo } from "../../lib/seo";

export default function MentionsLegalesPage() {
  React.useEffect(() => {
    setSeo({
      title: "Mentions légales — LunaLive",
      description: "Mentions légales de LunaLive, plateforme française de streaming casino en direct.",
      path: "/mentions-legales",
      robots: "index,follow",
    });
  }, []);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px", fontFamily: "system-ui, sans-serif", color: "#e0daf7" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, color: "#c4b5fd" }}>Mentions légales</h1>
      <p style={{ color: "rgba(200,195,240,.55)", marginBottom: 32, fontSize: 14 }}>Dernière mise à jour : mars 2026</p>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#a78bfa", marginBottom: 12 }}>Éditeur du site</h2>
        <p>Le site <strong>LunaLive</strong> (lunalive.onrender.com) est édité par LunaLive.</p>
        <p style={{ marginTop: 8 }}>Contact : <a href="mailto:lunalivepro@gmail.com" style={{ color: "#a78bfa" }}>lunalivepro@gmail.com</a></p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#a78bfa", marginBottom: 12 }}>Hébergement</h2>
        <p>Le site est hébergé par <strong>Render Services, Inc.</strong>, 525 Brannan Street, Suite 300, San Francisco, CA 94107, États-Unis.</p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#a78bfa", marginBottom: 12 }}>Propriété intellectuelle</h2>
        <p>L'ensemble des contenus présents sur LunaLive (textes, images, logos, vidéos) sont la propriété de LunaLive ou de leurs auteurs respectifs. Toute reproduction sans autorisation est interdite.</p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#a78bfa", marginBottom: 12 }}>Données personnelles</h2>
        <p>Pour en savoir plus sur la collecte et le traitement de vos données, consultez notre <Link to="/politique-de-confidentialite" style={{ color: "#a78bfa" }}>Politique de confidentialité</Link>.</p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#a78bfa", marginBottom: 12 }}>Jeu responsable</h2>
        <p>LunaLive est une plateforme de streaming et de divertissement. Le site ne propose pas de jeux d'argent en ligne. Les contenus relatifs aux casinos sont fournis à titre informatif et de divertissement uniquement.</p>
        <p style={{ marginTop: 8 }}><strong>18+ uniquement.</strong> Si vous ou un proche avez un problème avec le jeu, contactez le <strong>Joueurs Info Service : 09 74 75 13 13</strong> (appel non surtaxé, 7j/7).</p>
      </section>

      <div style={{ marginTop: 40, paddingTop: 20, borderTop: "1px solid rgba(124,92,252,.20)", fontSize: 13, color: "rgba(180,185,230,.45)" }}>
        <Link to="/" style={{ color: "#7c5cfc" }}>← Retour à l'accueil</Link>
        {" · "}
        <Link to="/politique-de-confidentialite" style={{ color: "#7c5cfc" }}>Confidentialité</Link>
        {" · "}
        <Link to="/cgu" style={{ color: "#7c5cfc" }}>CGU</Link>
        {" · "}
        <Link to="/contact" style={{ color: "#7c5cfc" }}>Contact</Link>
      </div>
    </div>
  );
}
