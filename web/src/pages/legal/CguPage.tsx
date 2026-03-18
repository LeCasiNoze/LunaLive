// web/src/pages/legal/CguPage.tsx
import * as React from "react";
import { Link } from "react-router-dom";
import { setSeo } from "../../lib/seo";

export default function CguPage() {
  React.useEffect(() => {
    setSeo({
      title: "Conditions Générales d'Utilisation — LunaLive",
      description: "Conditions générales d'utilisation de la plateforme LunaLive de streaming casino.",
      path: "/cgu",
      robots: "index,follow",
    });
  }, []);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px", fontFamily: "system-ui, sans-serif", color: "#e0daf7" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, color: "#c4b5fd" }}>Conditions Générales d'Utilisation</h1>
      <p style={{ color: "rgba(200,195,240,.55)", marginBottom: 32, fontSize: 14 }}>Dernière mise à jour : mars 2026</p>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#a78bfa", marginBottom: 12 }}>Objet</h2>
        <p>Les présentes Conditions Générales d'Utilisation (CGU) régissent l'accès et l'utilisation de la plateforme LunaLive (lunalive.onrender.com), plateforme française de streaming et de divertissement autour du casino.</p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#a78bfa", marginBottom: 12 }}>Accès à la plateforme</h2>
        <p>L'accès à LunaLive est réservé aux personnes âgées de <strong>18 ans et plus</strong>. En vous inscrivant, vous certifiez avoir atteint l'âge légal requis.</p>
        <p style={{ marginTop: 8 }}>L'inscription est gratuite. Certaines fonctionnalités premium nécessitent un abonnement payant.</p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#a78bfa", marginBottom: 12 }}>Comportement des utilisateurs</h2>
        <p>Tout utilisateur s'engage à :</p>
        <ul style={{ marginTop: 8, paddingLeft: 20, lineHeight: 1.8 }}>
          <li>Ne pas diffuser de contenus illicites, haineux ou offensants</li>
          <li>Ne pas usurper l'identité d'une autre personne</li>
          <li>Ne pas perturber le bon fonctionnement de la plateforme</li>
          <li>Respecter les droits d'auteur des contenus partagés</li>
        </ul>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#a78bfa", marginBottom: 12 }}>Contenu des streamers</h2>
        <p>Les streamers sont responsables de leurs contenus diffusés. LunaLive se réserve le droit de suspendre tout compte diffusant des contenus contraires aux présentes CGU ou à la législation en vigueur.</p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#a78bfa", marginBottom: 12 }}>Jeu responsable</h2>
        <p>LunaLive est une plateforme de divertissement. Les informations sur les casinos sont fournies à titre indicatif uniquement. Si vous pensez avoir un problème avec le jeu, contactez le <strong>Joueurs Info Service : 09 74 75 13 13</strong>.</p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#a78bfa", marginBottom: 12 }}>Modification des CGU</h2>
        <p>LunaLive se réserve le droit de modifier les présentes CGU à tout moment. Les utilisateurs seront informés de toute modification substantielle.</p>
      </section>

      <div style={{ marginTop: 40, paddingTop: 20, borderTop: "1px solid rgba(124,92,252,.20)", fontSize: 13, color: "rgba(180,185,230,.45)" }}>
        <Link to="/" style={{ color: "#7c5cfc" }}>← Retour à l'accueil</Link>
        {" · "}
        <Link to="/mentions-legales" style={{ color: "#7c5cfc" }}>Mentions légales</Link>
        {" · "}
        <Link to="/politique-de-confidentialite" style={{ color: "#7c5cfc" }}>Confidentialité</Link>
        {" · "}
        <Link to="/contact" style={{ color: "#7c5cfc" }}>Contact</Link>
      </div>
    </div>
  );
}
