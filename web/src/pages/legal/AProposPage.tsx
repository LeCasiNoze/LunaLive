// web/src/pages/legal/AProposPage.tsx
import * as React from "react";
import { Link } from "react-router-dom";
import { setSeo } from "../../lib/seo";

export default function AProposPage() {
  React.useEffect(() => {
    setSeo({
      title: "À propos de LunaLive — Plateforme streaming casino FR",
      description: "Découvrez LunaLive : la plateforme française de streaming casino en direct. Qui sommes-nous, notre mission et nos valeurs.",
      path: "/a-propos",
      robots: "index,follow",
    });
  }, []);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px", fontFamily: "system-ui, sans-serif", color: "#e0daf7" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, color: "#c4b5fd" }}>À propos de LunaLive</h1>
      <p style={{ color: "rgba(200,195,240,.55)", marginBottom: 32, fontSize: 14 }}>La plateforme française de streaming casino en direct</p>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#a78bfa", marginBottom: 12 }}>Notre mission</h2>
        <p>LunaLive est une plateforme communautaire française dédiée au streaming casino en direct. Notre mission : créer un espace de divertissement transparent, communautaire et responsable autour du casino live.</p>
        <p style={{ marginTop: 12 }}>Nous rassemblons des streamers passionnés et une communauté active qui peut regarder des lives en direct, découvrir des casinos évalués par de vrais joueurs, et participer à des événements exclusifs.</p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#a78bfa", marginBottom: 12 }}>Ce que vous trouverez sur LunaLive</h2>
        <ul style={{ paddingLeft: 20, lineHeight: 1.9 }}>
          <li><strong>Lives en direct</strong> — Regardez vos streamers préférés jouer en temps réel sur roulette, blackjack, machines à sous et plus encore.</li>
          <li><strong>Pages casinos (CheckTaSlot)</strong> — Des avis honnêtes rédigés par la communauté LunaLive, avec notes LunaLive et notes communauté. Notre section "Transparence" identifie clairement les casinos à éviter.</li>
          <li><strong>Streamers casino</strong> — Découvrez les profils détaillés de nos créateurs de contenu, leurs clips VOD, et leurs prochains événements.</li>
          <li><strong>Challenges Hunt</strong> — Participez aux sessions de slot hunting, suivez les buyins et les résultats en temps réel.</li>
          <li><strong>Événements</strong> — Tournois, viewers week, animations communautaires et streams spéciaux.</li>
        </ul>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#a78bfa", marginBottom: 12 }}>Notre approche des casinos</h2>
        <p>Contrairement aux sites d'affiliation classiques, LunaLive publie des évaluations transparentes. Chaque casino partenaire est évalué par notre équipe ET par la communauté. Les casinos qui ne respectent pas les joueurs sont listés dans notre section "Transparence" avec les raisons précises.</p>
        <p style={{ marginTop: 12 }}>Les liens vers les casinos peuvent être des liens affiliés. Cette relation commerciale n'influence pas nos notes : si un casino mérite un avis négatif, il l'obtient.</p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#a78bfa", marginBottom: 12 }}>Jeu responsable</h2>
        <p>LunaLive est une plateforme de divertissement. Nous rappelons que le jeu d'argent peut être source de dépendance. <strong>18+ uniquement.</strong></p>
        <p style={{ marginTop: 8 }}>En cas de problème avec le jeu : <strong>Joueurs Info Service 09 74 75 13 13</strong> (gratuit, 7j/7) ou <strong>addictaide.fr</strong>.</p>
      </section>

      <div style={{ marginTop: 40, paddingTop: 20, borderTop: "1px solid rgba(124,92,252,.20)", fontSize: 13, color: "rgba(180,185,230,.45)" }}>
        <Link to="/" style={{ color: "#7c5cfc" }}>← Retour à l'accueil</Link>
        {" · "}
        <Link to="/casinos" style={{ color: "#7c5cfc" }}>Casinos</Link>
        {" · "}
        <Link to="/browse" style={{ color: "#7c5cfc" }}>Streamers</Link>
        {" · "}
        <Link to="/contact" style={{ color: "#7c5cfc" }}>Contact</Link>
        {" · "}
        <Link to="/mentions-legales" style={{ color: "#7c5cfc" }}>Mentions légales</Link>
      </div>
    </div>
  );
}
