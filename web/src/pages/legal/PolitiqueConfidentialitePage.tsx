// web/src/pages/legal/PolitiqueConfidentialitePage.tsx
import * as React from "react";
import { Link } from "react-router-dom";
import { setSeo } from "../../lib/seo";

export default function PolitiqueConfidentialitePage() {
  React.useEffect(() => {
    setSeo({
      title: "Politique de confidentialité — LunaLive",
      description: "Politique de confidentialité et protection des données personnelles de LunaLive.",
      path: "/politique-de-confidentialite",
      robots: "index,follow",
    });
  }, []);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px", fontFamily: "system-ui, sans-serif", color: "#e0daf7" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, color: "#c4b5fd" }}>Politique de confidentialité</h1>
      <p style={{ color: "rgba(200,195,240,.55)", marginBottom: 32, fontSize: 14 }}>Dernière mise à jour : mars 2026</p>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#a78bfa", marginBottom: 12 }}>Données collectées</h2>
        <p>LunaLive collecte les données suivantes lors de la création d'un compte :</p>
        <ul style={{ marginTop: 8, paddingLeft: 20, lineHeight: 1.8 }}>
          <li>Adresse e-mail (utilisée pour l'authentification)</li>
          <li>Nom d'utilisateur choisi</li>
          <li>Données de navigation (pages visitées, interactions)</li>
        </ul>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#a78bfa", marginBottom: 12 }}>Utilisation des données</h2>
        <p>Vos données sont utilisées pour :</p>
        <ul style={{ marginTop: 8, paddingLeft: 20, lineHeight: 1.8 }}>
          <li>Gérer votre compte et votre expérience sur LunaLive</li>
          <li>Envoyer des notifications liées à votre activité (si activées)</li>
          <li>Améliorer la plateforme</li>
        </ul>
        <p style={{ marginTop: 12 }}>Nous ne vendons pas vos données à des tiers.</p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#a78bfa", marginBottom: 12 }}>Vos droits (RGPD)</h2>
        <p>Conformément au Règlement Général sur la Protection des Données (RGPD), vous disposez des droits suivants :</p>
        <ul style={{ marginTop: 8, paddingLeft: 20, lineHeight: 1.8 }}>
          <li>Droit d'accès à vos données</li>
          <li>Droit de rectification</li>
          <li>Droit à l'effacement (« droit à l'oubli »)</li>
          <li>Droit à la portabilité</li>
          <li>Droit d'opposition</li>
        </ul>
        <p style={{ marginTop: 12 }}>Pour exercer ces droits, contactez-nous via <Link to="/contact" style={{ color: "#a78bfa" }}>notre page contact</Link>.</p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#a78bfa", marginBottom: 12 }}>Cookies</h2>
        <p>LunaLive utilise des cookies techniques nécessaires au bon fonctionnement de la plateforme (authentification, préférences). Aucun cookie publicitaire tiers n'est utilisé.</p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#a78bfa", marginBottom: 12 }}>Conservation des données</h2>
        <p>Vos données sont conservées tant que votre compte est actif. En cas de suppression de compte, vos données personnelles sont supprimées dans un délai de 30 jours.</p>
      </section>

      <div style={{ marginTop: 40, paddingTop: 20, borderTop: "1px solid rgba(124,92,252,.20)", fontSize: 13, color: "rgba(180,185,230,.45)" }}>
        <Link to="/" style={{ color: "#7c5cfc" }}>← Retour à l'accueil</Link>
        {" · "}
        <Link to="/mentions-legales" style={{ color: "#7c5cfc" }}>Mentions légales</Link>
        {" · "}
        <Link to="/cgu" style={{ color: "#7c5cfc" }}>CGU</Link>
        {" · "}
        <Link to="/contact" style={{ color: "#7c5cfc" }}>Contact</Link>
      </div>
    </div>
  );
}
